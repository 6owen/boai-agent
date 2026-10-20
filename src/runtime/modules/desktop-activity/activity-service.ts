/*
 * [INPUT]: Opted-in host OCR samples, original ProductStore and explicitly generated report text.
 * [OUTPUT]: Local records, bounded date/search evidence, retention and source-bound report cache.
 * [POS]: Desktop activity domain; never substitutes chat history or generates fictional activity.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from '../application/application-service'
import type { ActivityCaptureResult, ActivitySettings, ActivitySample, ActivityReport, ActivityEvidence, ActivityStatus } from '../../../shared/domain/desktop-activity'

const settingsCollection = 'desktopActivitySettings', samplesCollection = 'desktopActivitySamples', reportsCollection = 'desktopActivityReports'
const defaults: ActivitySettings = { revision: 0, enabled: false, intervalSeconds: 60, retentionDays: 14, excludedApps: ['com.1password.1password', 'com.agilebits.onepassword7', 'com.bitwarden.desktop', 'com.apple.keychainaccess', 'com.apple.Passwords'] }
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(`${s}T00:00:00`); return Number.isFinite(+d) && localDay(d) === s }, '日期无效')
const range = z.object({ from: day, to: day, search: z.string().max(200).optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(200).optional() }).strict()
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function localDay(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function bounds(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`), end = new Date(`${to}T00:00:00`); end.setDate(end.getDate() + 1)
  if (+end <= +start || +end - +start > 32 * 86400000) throw new ApplicationValidationError('INVALID_INPUT', '日期范围需要为 1 至 31 天')
  return { start: +start, end: +end }
}
export class DesktopActivityService {
  private settings: ActivitySettings = structuredClone(defaults)
  private epoch = 0
  private timer?: ReturnType<typeof setTimeout>
  private pending?: Promise<void>
  private closing = false
  private lastError?: string
  private lastHash?: string
  private lastCapturedAt?: string
  private lastPurge = 0
  constructor(private store: ProductStore, private host: {
    capture(action: 'status' | 'request' | 'sample', excludedApps?: string[]): Promise<ActivityCaptureResult>
    available(): boolean
    changed(): void
  }) {}
  async init() {
    this.settings = await this.store.get<ActivitySettings>(settingsCollection, 'default') ?? structuredClone(defaults)
    await this.purgeExpired()
    this.schedule()
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    if (this.closing || !this.settings.enabled || !this.host.available()) return
    this.timer = setTimeout(() => {
      this.pending = this.sample().catch(error => { this.lastError = error instanceof Error ? error.message : String(error) }).finally(() => { this.pending = undefined; this.schedule() })
    }, this.settings.intervalSeconds * 1000)
    this.timer.unref?.()
  }
  async status(): Promise<ActivityStatus> {
    const permission = this.host.available() ? await this.host.capture('status').catch(() => ({ supported: false, permission: false })) : { supported: false, permission: false }
    return { settings: structuredClone(this.settings), supported: !!permission.supported, permission: !!permission.permission, count: (await this.store.load<ActivitySample>(samplesCollection)).length, lastCapturedAt: this.lastCapturedAt, lastError: this.lastError }
  }
  async configure(input: { expectedRevision: number; enabled?: boolean; intervalSeconds?: number; retentionDays?: number; excludedApps?: string[] }) {
    if (this.closing) throw new Error('桌面活动服务正在退出')
    if (this.settings.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '桌面活动设置已改变，请刷新后重试')
    if (input.enabled === true && !this.settings.enabled) {
      const permission = await this.host.capture('request')
      if (!permission.supported || !permission.permission) throw new ApplicationValidationError('INVALID_INPUT', '请在系统设置中允许屏幕录制，再开启桌面活动记录')
    }
    const saved = await this.store.transaction(async tx => {
      const previous = await tx.get<ActivitySettings>(settingsCollection, 'default') ?? defaults
      if (previous.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '桌面活动设置已改变，请刷新后重试')
      const { expectedRevision: _, ...patch } = input
      const next = { ...previous, ...patch, revision: previous.revision + 1 }
      await tx.put({ collection: settingsCollection, id: 'default', value: next })
      return next
    })
    this.settings = saved; this.epoch++
    this.lastHash = undefined; this.lastError = undefined
    await this.pending
    await this.purgeExpired()
    this.schedule(); this.host.changed()
    return structuredClone(this.settings)
  }
  async sample() {
    if (!this.settings.enabled || this.closing) return
    const epoch = this.epoch, value = await this.host.capture('sample', this.settings.excludedApps)
    if (epoch !== this.epoch || !this.settings.enabled || this.closing || !this.host.available()) return
    if (value.error) throw new Error(value.error)
    if (value.skipped || !value.capturedAt || !value.app || !value.bundleId) return
    const text = (value.text ?? '').slice(0, 6000), title = value.title ?? '', contentHash = hash([value.bundleId, title, text])
    // Keep repeated unchanged screens at most once every five minutes.
    if (contentHash === this.lastHash && this.lastCapturedAt && Date.now() - +new Date(this.lastCapturedAt) < 300000) return
    const sample: ActivitySample = { id: randomUUID(), app: value.app, bundleId: value.bundleId, title, text, capturedAt: value.capturedAt, hash: contentHash }
    await this.store.transaction(async tx => {
      if (epoch !== this.epoch || !this.settings.enabled || this.closing) return
      await tx.put({ collection: samplesCollection, id: sample.id, value: sample })
      this.lastHash = contentHash; this.lastCapturedAt = sample.capturedAt
    })
    this.lastError = undefined
    if (Date.now() - this.lastPurge > 3600000) await this.purgeExpired()
  }
  private async purgeExpired() {
    const cutoff = Date.now() - this.settings.retentionDays * 86400000
    await this.store.transaction(async tx => {
      const samples = (await tx.list<ActivitySample>(samplesCollection)).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      const expired = new Set(samples.filter((s, i) => +new Date(s.capturedAt) < cutoff || i < samples.length - 30000).map(s => s.id))
      for (const id of expired) await tx.remove(samplesCollection, id)
      for (const report of await tx.list<ActivityReport>(reportsCollection)) if (report.sampleIds.some(id => expired.has(id))) await tx.remove(reportsCollection, report.id)
    })
    this.lastPurge = Date.now()
  }
  async query(input: z.infer<typeof range>) {
    const { start, end } = bounds(input.from, input.to), search = input.search?.toLowerCase()
    const samples = (await this.store.load<ActivitySample>(samplesCollection)).filter(s => +new Date(s.capturedAt) >= start && +new Date(s.capturedAt) < end && (!search || `${s.app}\n${s.title}\n${s.text}`.toLowerCase().includes(search))).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    const offset = input.offset ?? 0, limit = input.limit ?? 50
    return { total: samples.length, samples: samples.slice(offset, offset + limit), nextOffset: offset + limit < samples.length ? offset + limit : null }
  }
  async evidence(from: string, to: string, force = false): Promise<ActivityEvidence> {
    const { start, end } = bounds(from, to)
    const all = (await this.store.load<ActivitySample>(samplesCollection)).filter(s => +new Date(s.capturedAt) >= start && +new Date(s.capturedAt) < end).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    const cached = await this.store.get<ActivityReport>(reportsCollection, `${from}_${to}`)
    // Evenly distribute bounded evidence across the period, not just its first hour.
    const stride = Math.max(1, Math.ceil(all.length / 160)), samples = all.filter((_, index) => index % stride === 0).map(s => ({ ...s, text: s.text.slice(0, 900) }))
    const sourceHash = hash(samples.map(s => [s.id, s.hash]))
    return { from, to, sourceHash, total: all.length, samples, truncated: samples.length < all.length || all.some(s => s.text.length > 900), report: !force && cached && Date.now() - +new Date(cached.generatedAt) < 600000 && cached.sampleIds.every(id => all.some(s => s.id === id)) ? cached : null }
  }
  async saveReport(input: { from: string; to: string; sourceHash: string; sampleIds: string[]; content: string }) {
    const { start, end } = bounds(input.from, input.to)
    const report: ActivityReport = { ...input, id: `${input.from}_${input.to}`, generatedAt: new Date().toISOString() }
    await this.store.transaction(async tx => {
      const samples = (await tx.list<ActivitySample>(samplesCollection)).filter(s => +new Date(s.capturedAt) >= start && +new Date(s.capturedAt) < end).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      const selected = input.sampleIds.map(id => samples.find(s => s.id === id))
      if (!input.sampleIds.length || new Set(input.sampleIds).size !== input.sampleIds.length || selected.some(s => !s) || hash(selected.map(s => [s!.id, s!.hash])) !== input.sourceHash) throw new ApplicationValidationError('REVISION_CONFLICT', '活动来源已改变或已清除，请重新读取证据后生成日报')
      await tx.put({ collection: reportsCollection, id: report.id, value: report })
    })
    this.host.changed()
    // Receipts retain only identity, not private OCR/report bodies.
    return { id: report.id, generatedAt: report.generatedAt, sourceHash: report.sourceHash }
  }
  async clear(from?: string, to?: string) {
    this.epoch++; this.lastHash = undefined
    await this.pending
    const period = from && to ? bounds(from, to) : undefined
    await this.store.transaction(async tx => {
      for (const sample of await tx.list<ActivitySample>(samplesCollection)) if (!period || +new Date(sample.capturedAt) >= period.start && +new Date(sample.capturedAt) < period.end) await tx.remove(samplesCollection, sample.id)
      for (const report of await tx.list<ActivityReport>(reportsCollection)) if (!period || bounds(report.from, report.to).start < period.end && bounds(report.from, report.to).end > period.start) await tx.remove(reportsCollection, report.id)
    })
    this.lastCapturedAt = undefined; this.host.changed()
    return { cleared: true }
  }
  operations(): ApplicationOperation[] {
    const op = (name: string, description: string, input: z.ZodType, effect: 'read' | 'write', execute: (input: any) => Promise<unknown>, ownerOnly = false): ApplicationOperation => ({ name, description, input, effect, resultType: name, ownerOnly, execute })
    return [
      op('activity.status', '本机桌面活动记录状态；与聊天记录、人格行为记录无关。', z.object({}).strict(), 'read', () => this.status()),
      op('activity.configure', '本人开启/关闭桌面活动记录、频率、保留天数和排除应用；默认关闭。', z.object({ expectedRevision: z.number().int().nonnegative(), enabled: z.boolean().optional(), intervalSeconds: z.number().int().min(30).max(300).optional(), retentionDays: z.number().int().min(1).max(30).optional(), excludedApps: z.array(z.string().min(1).max(200)).max(100).optional() }).strict(), 'write', input => this.configure(input), true),
      op('activity.query', '按本机日期/关键词分页检索真实前台窗口与本地 OCR；无记录不推测。', range, 'read', input => this.query(input)),
      op('activity.report', '获取日报缓存或有来源的桌面活动证据；无缓存时由当前员工根据证据生成主题式日报，再调用 activity.report.save。截断可用 activity.query 深挖。', z.object({ from: day, to: day, force: z.boolean().optional() }).strict(), 'read', input => this.evidence(input.from, input.to, input.force)),
      op('activity.report.save', '保存基于实际观察生成的主题日报；核对 sourceHash 和使用的 sampleIds，不保存空数据虚构报告。', z.object({ from: day, to: day, sourceHash: z.string().length(64), sampleIds: z.array(z.string().uuid()).min(1).max(3000), content: z.string().min(1).max(40000) }).strict(), 'write', input => this.saveReport(input)),
      op('activity.reports', '读取已保存的主题日报，正文保持原样。', z.object({}).strict(), 'read', async () => (await this.store.load<ActivityReport>(reportsCollection)).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))),
      op('activity.clear', '本人删除所选日期范围或全部桌面活动及关联日报；不删除聊天或员工行为记录。', z.object({ from: day.optional(), to: day.optional() }).strict().refine(v => !!v.from === !!v.to), 'write', input => this.clear(input.from, input.to), true),
    ]
  }
  async close() { this.closing = true; this.epoch++; if (this.timer) clearTimeout(this.timer); await this.pending }
}

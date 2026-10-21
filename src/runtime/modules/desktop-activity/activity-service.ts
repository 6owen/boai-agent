/*
 * [INPUT]: Opted-in host OCR samples, original ProductStore and explicitly generated report text.
 * [OUTPUT]: Local records, Alma-rule observed fragments/structured themes, bounded date/search evidence, retention and source-bound report cache.
 * [POS]: Desktop activity domain; never substitutes chat history or generates fictional activity.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from '../application/application-service'
import type { ActivityCaptureResult, ActivitySettings, ActivitySample, ActivityReport, ActivityEvidence, ActivityStatus, ActivityMemoryHit, ActivityMemoryPage, ActivityAnalysis } from '../../../shared/domain/desktop-activity'
import { observedFragments } from './activity-fragments'
import { clusterActivityAnalyses } from './activity-analysis'

const settingsCollection = 'desktopActivitySettings', samplesCollection = 'desktopActivitySamples', reportsCollection = 'desktopActivityReports', analysesCollection = 'desktopActivityAnalyses'
const defaults: ActivitySettings = { revision: 0, enabled: false, intervalSeconds: 60, retentionDays: 14, excludedApps: ['com.1password.1password', 'com.agilebits.onepassword7', 'com.bitwarden.desktop', 'com.apple.keychainaccess', 'com.apple.Passwords'] }
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(`${s}T00:00:00`); return Number.isFinite(+d) && localDay(d) === s }, '日期无效')
const range = z.object({ from: day, to: day, search: z.string().max(200).optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(200).optional() }).strict()
const memoryRange = z.object({ from: day.optional(), to: day.optional(), search: z.string().max(200).optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(50).optional() }).strict().refine(value => !!value.from === !!value.to, '日期范围需要同时提供起止日期')
const sampleIds = z.array(z.string().uuid()).min(1).max(160)
const analysisPrepare = z.object({ from: day, to: day, groups: z.array(z.object({ sampleIds }).strict()).min(1).max(40) }).strict()
const short = (max: number) => z.string().trim().max(max)
const webUrl = z.url().max(500).refine(value => /^https?:\/\//i.test(value), '仅支持网页地址')
const entityLink = z.object({ label: short(160).min(1), ref: short(80).optional(), repo: short(160).optional(), url: webUrl.optional() }).strict()
const entityPerson = z.object({ handle: short(120).min(1), name: short(120).optional() }).strict()
const entities = z.object({
  prs: z.array(entityLink).max(30).default([]), issues: z.array(entityLink).max(30).default([]), commits: z.array(entityLink).max(30).default([]),
  people: z.array(entityPerson).max(30).default([]), identifiers: z.array(short(160).min(1)).max(40).default([]), repos: z.array(short(160).min(1)).max(30).default([]),
  versions: z.array(short(80).min(1)).max(30).default([]), events: z.array(short(160).min(1)).max(30).default([]), decisions: z.array(short(200).min(1)).max(30).default([]), urls: z.array(webUrl).max(30).default([]),
}).strict()
const analysisItem = z.object({ sampleIds, sourceHash: z.string().regex(/^[a-f0-9]{64}$/), worth: z.boolean(), title: short(160), description: short(800),
  project: short(120).nullable().default(null), topics: z.array(short(40).min(1)).max(5).default([]), highlights: z.array(short(200).min(1)).max(3).default([]),
  entities, memoryCandidates: z.array(z.object({ type: z.enum(['project', 'feedback', 'reference', 'user']), content: short(200).min(1), why: short(160).min(1) }).strict()).max(3).default([]),
}).strict()
const analysisSave = z.object({ from: day, to: day, items: z.array(analysisItem).min(1).max(40) }).strict()
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const hasCurrentSources = (record: Pick<ActivityReport | ActivityAnalysis, 'sampleIds' | 'sourceHash'>, samples: Map<string, ActivitySample>) => record.sampleIds.length > 0
  && record.sampleIds.every(id => samples.has(id))
  && record.sourceHash === hash(record.sampleIds.map(id => [id, samples.get(id)!.hash]))
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
      for (const analysis of await tx.list<ActivityAnalysis>(analysesCollection)) if (analysis.sampleIds.some(id => expired.has(id))) await tx.remove(analysesCollection, analysis.id)
    })
    this.lastPurge = Date.now()
  }
  async query(input: z.infer<typeof range>) {
    const { start, end } = bounds(input.from, input.to), search = input.search?.toLowerCase()
    const samples = (await this.store.load<ActivitySample>(samplesCollection)).filter(s => +new Date(s.capturedAt) >= start && +new Date(s.capturedAt) < end && (!search || `${s.app}\n${s.title}\n${s.text}`.toLowerCase().includes(search))).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    const offset = input.offset ?? 0, limit = input.limit ?? 50
    return { total: samples.length, samples: samples.slice(offset, offset + limit), nextOffset: offset + limit < samples.length ? offset + limit : null }
  }
  /** The model receives these hashes with real sample IDs; it never manufactures a source version. */
  async prepareAnalyses(input: z.infer<typeof analysisPrepare>) {
    const { start, end } = bounds(input.from, input.to)
    const samples = new Map((await this.store.load<ActivitySample>(samplesCollection)).filter(sample => +new Date(sample.capturedAt) >= start && +new Date(sample.capturedAt) < end).map(sample => [sample.id, sample]))
    const groups = input.groups.map(group => {
      if (new Set(group.sampleIds).size !== group.sampleIds.length || group.sampleIds.some(id => !samples.has(id))) throw new ApplicationValidationError('REVISION_CONFLICT', '活动分析来源已改变或已清除，请重新读取样本')
      return { sampleIds: [...group.sampleIds], sourceHash: hash(group.sampleIds.map(id => [id, samples.get(id)!.hash])) }
    })
    return { from: input.from, to: input.to, groups }
  }
  /** Candidate text remains an unpromoted analysis suggestion; only current source-bound analyses are read. */
  async saveAnalyses(input: z.infer<typeof analysisSave>) {
    const { start, end } = bounds(input.from, input.to)
    const allIds = input.items.flatMap(item => item.sampleIds)
    if (allIds.length > 3000 || new Set(allIds).size !== allIds.length) throw new ApplicationValidationError('INVALID_INPUT', '每个活动样本只能属于本批一次分析')
    const saved = await this.store.transaction(async tx => {
      const available = new Map((await tx.list<ActivitySample>(samplesCollection)).filter(sample => +new Date(sample.capturedAt) >= start && +new Date(sample.capturedAt) < end).map(sample => [sample.id, sample]))
      const records: ActivityAnalysis[] = []
      for (const item of input.items) {
        const selected = item.sampleIds.map(id => available.get(id))
        if (selected.some(sample => !sample) || hash(selected.map(sample => [sample!.id, sample!.hash])) !== item.sourceHash) throw new ApplicationValidationError('REVISION_CONFLICT', '活动分析来源已改变或已清除，请重新读取样本')
        if (item.worth && (!item.title || !item.description) || !item.worth && item.memoryCandidates.length) throw new ApplicationValidationError('INVALID_INPUT', '有价值分析需要标题和描述；无价值片段不能生成长期候选')
        const evidence = selected.map(sample => `${sample!.app}\n${sample!.title}\n${sample!.text}`).join('\n').toLocaleLowerCase()
        const cited = [
          ...item.entities.identifiers, ...item.entities.repos, ...item.entities.versions, ...item.entities.urls,
          ...item.entities.people.map(person => person.handle),
          ...(['prs', 'issues', 'commits'] as const).flatMap(kind => item.entities[kind].map(link => link.ref || link.label)),
        ]
        if (cited.some(value => !evidence.includes(value.toLocaleLowerCase()))) throw new ApplicationValidationError('INVALID_INPUT', '结构化实体必须出现在实际窗口或OCR来源中')
        records.push({ ...item, id: hash(item.sampleIds), from: input.from, to: input.to,
          observedAt: selected.map(sample => sample!.capturedAt).sort()[0]!, analyzedAt: new Date().toISOString() })
      }
      for (const prior of await tx.list<ActivityAnalysis>(analysesCollection)) if (prior.sampleIds.some(id => allIds.includes(id))) await tx.remove(analysesCollection, prior.id)
      for (const record of records) await tx.put({ collection: analysesCollection, id: record.id, value: record })
      return records
    })
    this.host.changed()
    return { saved: saved.map(record => ({ id: record.id, sampleIds: record.sampleIds, sourceHash: record.sourceHash })), count: saved.length }
  }
  async analyses(from: string, to: string, current?: Map<string, ActivitySample>) {
    const { start, end } = bounds(from, to)
    const samples = current ?? new Map((await this.store.load<ActivitySample>(samplesCollection)).map(sample => [sample.id, sample]))
    return (await this.store.load<ActivityAnalysis>(analysesCollection)).filter(record => {
      const period = bounds(record.from, record.to)
      return period.start >= start && period.end <= end && hasCurrentSources(record, samples)
    }).sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
  }
  /** Re-read original OCR only for a currently valid analysis; never serve a stale derived claim. */
  async analysisSources(id: string, offset = 0, limit = 20) {
    const analysis = await this.store.get<ActivityAnalysis>(analysesCollection, id)
    const current = new Map((await this.store.load<ActivitySample>(samplesCollection)).map(sample => [sample.id, sample]))
    if (!analysis || !hasCurrentSources(analysis, current)) throw new ApplicationValidationError('REVISION_CONFLICT', '活动分析来源已改变或已清除，请刷新后重试')
    return {
      analysisId: id, sourceHash: analysis.sourceHash, total: analysis.sampleIds.length,
      samples: analysis.sampleIds.slice(offset, offset + limit).map(sampleId => current.get(sampleId)!),
      nextOffset: offset + limit < analysis.sampleIds.length ? offset + limit : null,
    }
  }
  /** One source-checked view across retained observations, analyses and reports; derived rows do not become independent proof. */
  async searchMemory(input: z.infer<typeof memoryRange>): Promise<ActivityMemoryPage> {
    const period = input.from && input.to ? bounds(input.from, input.to) : undefined
    const matchesDate = (date: string) => !period || +new Date(date) >= period.start && +new Date(date) < period.end
    const search = input.search?.trim().toLocaleLowerCase().normalize('NFKC')
    const matchesText = (value: string) => !search || value.toLocaleLowerCase().normalize('NFKC').includes(search)
    const allSamples = await this.store.load<ActivitySample>(samplesCollection)
    const current = new Map(allSamples.map(sample => [sample.id, sample]))
    const excerpt = (value: string, length: number) => {
      if (!search) return value.slice(0, length)
      const position = value.toLocaleLowerCase().normalize('NFKC').indexOf(search)
      return value.slice(Math.max(0, position - 120), Math.max(0, position - 120) + length)
    }
    const observations: ActivityMemoryHit[] = allSamples.filter(sample => matchesDate(sample.capturedAt) && matchesText(`${sample.app}\n${sample.title}\n${sample.text}`)).map(sample => ({
      kind: 'observation', id: sample.id, observedAt: sample.capturedAt, app: sample.app, title: sample.title,
      excerpt: excerpt(sample.text, 900), sourceHash: sample.hash,
    }))
    const analyses: ActivityMemoryHit[] = (await this.store.load<ActivityAnalysis>(analysesCollection)).filter(record => {
      const analyzedPeriod = bounds(record.from, record.to)
      return record.worth && (!period || analyzedPeriod.start < period.end && analyzedPeriod.end > period.start)
        && hasCurrentSources(record, current) && matchesText(`${record.title}\n${record.description}\n${record.project ?? ''}\n${record.topics.join(' ')}\n${record.highlights.join(' ')}`)
    }).map(record => ({ kind: 'analysis', id: record.id, from: record.from, to: record.to, observedAt: record.observedAt, title: record.title,
      project: record.project, topics: [...record.topics], excerpt: excerpt(record.description, 900), sourceHash: record.sourceHash, sampleIds: [...record.sampleIds] }))
    const reports: ActivityMemoryHit[] = (await this.store.load<ActivityReport>(reportsCollection)).filter(report => {
      const reportStart = bounds(report.from, report.to).start, reportEnd = bounds(report.from, report.to).end
      return (!period || reportStart < period.end && reportEnd > period.start) && hasCurrentSources(report, current)
        && matchesText(`${report.from}\n${report.to}\n${report.content}`)
    }).map(report => ({ kind: 'report', id: report.id, from: report.from, to: report.to, generatedAt: report.generatedAt,
      excerpt: excerpt(report.content, 1200), sourceHash: report.sourceHash, sampleIds: [...report.sampleIds] }))
    const order = (hit: ActivityMemoryHit) => hit.kind === 'report' ? hit.generatedAt : hit.observedAt
    const hits = [...observations, ...analyses, ...reports].sort((a, b) => order(b).localeCompare(order(a)) || a.id.localeCompare(b.id))
    const offset = input.offset ?? 0, limit = input.limit ?? 20
    return { total: hits.length, hits: hits.slice(offset, offset + limit), nextOffset: offset + limit < hits.length ? offset + limit : null, retentionDays: this.settings.retentionDays }
  }
  async evidence(from: string, to: string, force = false): Promise<ActivityEvidence> {
    const { start, end } = bounds(from, to)
    const all = (await this.store.load<ActivitySample>(samplesCollection)).filter(s => +new Date(s.capturedAt) >= start && +new Date(s.capturedAt) < end).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    const current = new Map(all.map(sample => [sample.id, sample]))
    const allAnalyses = await this.analyses(from, to, current), analyses = allAnalyses.slice(0, 40)
    const cached = await this.store.get<ActivityReport>(reportsCollection, `${from}_${to}`)
    // Evenly distribute bounded evidence across the period, not just its first hour.
    const stride = Math.max(1, Math.ceil(all.length / 160)), samples = all.filter((_, index) => index % stride === 0).map(s => ({ ...s, text: s.text.slice(0, 900) }))
    const sourceHash = hash(samples.map(s => [s.id, s.hash]))
    return { from, to, sourceHash, total: all.length, samples, fragments: observedFragments(samples, this.settings.intervalSeconds * 2 * 1000), analyses, analysisTotal: allAnalyses.length, analysisTruncated: allAnalyses.length > analyses.length, clusters: clusterActivityAnalyses(analyses), truncated: samples.length < all.length || all.some(s => s.text.length > 900), report: !force && cached && Date.now() - +new Date(cached.generatedAt) < 600000 && hasCurrentSources(cached, current) ? cached : null }
  }
  async reports(): Promise<ActivityReport[]> {
    const samples = new Map((await this.store.load<ActivitySample>(samplesCollection)).map(sample => [sample.id, sample]))
    return (await this.store.load<ActivityReport>(reportsCollection)).filter(report => hasCurrentSources(report, samples)).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  }
  async prepareReport(input: { from: string; to: string; sampleIds: string[] }) {
    const { start, end } = bounds(input.from, input.to)
    if (!input.sampleIds.length || input.sampleIds.length > 3000 || new Set(input.sampleIds).size !== input.sampleIds.length) throw new ApplicationValidationError('INVALID_INPUT', '请选择不重复的真实活动来源')
    const available = new Map((await this.store.load<ActivitySample>(samplesCollection)).filter(sample => +new Date(sample.capturedAt) >= start && +new Date(sample.capturedAt) < end).map(sample => [sample.id, sample]))
    const selected = input.sampleIds.map(id => available.get(id))
    if (selected.some(sample => !sample)) throw new ApplicationValidationError('REVISION_CONFLICT', '活动来源已改变或已清除，请重新读取证据')
    return { from: input.from, to: input.to, sampleIds: [...input.sampleIds], sourceHash: hash(selected.map(sample => [sample!.id, sample!.hash])) }
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
      const removed = new Set<string>()
      for (const sample of await tx.list<ActivitySample>(samplesCollection)) if (!period || +new Date(sample.capturedAt) >= period.start && +new Date(sample.capturedAt) < period.end) { await tx.remove(samplesCollection, sample.id); removed.add(sample.id) }
      for (const report of await tx.list<ActivityReport>(reportsCollection)) if (!period || bounds(report.from, report.to).start < period.end && bounds(report.from, report.to).end > period.start) await tx.remove(reportsCollection, report.id)
      for (const analysis of await tx.list<ActivityAnalysis>(analysesCollection)) if (!period || analysis.sampleIds.some(id => removed.has(id))) await tx.remove(analysesCollection, analysis.id)
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
      op('activity.memory.search', '跨日期检索仍有效的桌面观察、结构化分析与日报；派生内容不是第二份独立证明。', memoryRange, 'read', input => this.searchMemory(input)),
      op('activity.analysis.prepare', '将实际阅读的桌面样本分组，宿主核验并返回每组来源hash；用于随后保存结构化主题分析。', analysisPrepare, 'read', input => this.prepareAnalyses(input)),
      op('activity.analysis.save', '保存Alma式结构化活动分析，逐组核验真实样本hash；长期候选只保留待核建议，不自动晋升。', analysisSave, 'write', input => this.saveAnalyses(input)),
      op('activity.analyses', '分页读取来源仍有效的桌面活动结构化分析与本页主题归组，按需读完全部页。', z.object({ from: day, to: day, offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(40).optional() }).strict(), 'read', async input => { const all = await this.analyses(input.from, input.to), offset = input.offset ?? 0, limit = input.limit ?? 40, analyses = all.slice(offset, offset + limit); return { total: all.length, analyses, clusters: clusterActivityAnalyses(analyses), nextOffset: offset + limit < all.length ? offset + limit : null } }),
      op('activity.analysis.sources', '按分析ID分页复核仍有效的原始桌面窗口/OCR记录；来源变化则拒绝返回旧分析。', z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(20).optional() }).strict(), 'read', input => this.analysisSources(input.id, input.offset, input.limit)),
      op('activity.report', '获取日报缓存或有来源的桌面活动证据；无缓存时由当前员工根据证据生成主题式日报，再调用 activity.report.save。截断可用 activity.query 深挖。', z.object({ from: day, to: day, force: z.boolean().optional() }).strict(), 'read', input => this.evidence(input.from, input.to, input.force)),
      op('activity.report.prepare', '深挖查询后，将本次实际阅读的样本ID并入日报来源；宿主核验并生成最终sourceHash，再调用activity.report.save。', z.object({ from: day, to: day, sampleIds: z.array(z.string().uuid()).min(1).max(3000) }).strict(), 'read', input => this.prepareReport(input)),
      op('activity.report.save', '保存基于实际观察生成的主题日报；核对 sourceHash 和使用的 sampleIds，不保存空数据虚构报告。', z.object({ from: day, to: day, sourceHash: z.string().length(64), sampleIds: z.array(z.string().uuid()).min(1).max(3000), content: z.string().min(1).max(40000) }).strict(), 'write', input => this.saveReport(input)),
      op('activity.reports', '读取来源仍有效的已保存主题日报，正文保持原样。', z.object({}).strict(), 'read', () => this.reports()),
      op('activity.clear', '本人删除所选日期范围或全部桌面活动及关联日报；不删除聊天或员工行为记录。', z.object({ from: day.optional(), to: day.optional() }).strict().refine(v => !!v.from === !!v.to), 'write', input => this.clear(input.from, input.to), true),
    ]
  }
  async close() { this.closing = true; this.epoch++; if (this.timer) clearTimeout(this.timer); await this.pending }
}

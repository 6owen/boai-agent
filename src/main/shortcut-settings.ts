/*
 * [INPUT]: 独立 JSON 路径、平台菜单占用、版本化 patch 和请求身份。
 * [OUTPUT]: 串行 CAS/原子持久化、原文件只读保护、可核对回执与提交后事件。
 * [POS]: Main 快捷键偏好真源，不进入员工或业务备份。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { shortcutDefaults, shortcutEntrySchema, shortcutUpdateSchema, validateShortcuts, type ReservedShortcut, type ShortcutPlatform, type ShortcutSnapshot, type ShortcutUpdate, type ShortcutReceipt } from '../shared/shortcuts'

const receiptSchema = z.object({ requestId: z.string().uuid(), fingerprint: z.string().max(4096), revision: z.number().int().positive().safe() }).strict()
const fileSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative().safe(), preferences: z.object({ search: shortcutEntrySchema.optional(), sidebar: shortcutEntrySchema.optional(), back: shortcutEntrySchema.optional(), forward: shortcutEntrySchema.optional() }).strict(), receipts: z.array(receiptSchema).max(128).default([]) }).strict()
type FileValue = Omit<z.infer<typeof fileSchema>, 'preferences'> & { preferences: ShortcutSnapshot['preferences'] }

export class ShortcutSettingsStore {
  private value: FileValue = { schemaVersion: 1, revision: 0, preferences: shortcutDefaults(), receipts: [] }
  private queue: Promise<unknown> = Promise.resolve()
  private error?: string
  constructor(private readonly path: string, private readonly platform: ShortcutPlatform, private reserved: ReservedShortcut[], private readonly changed: (snapshot: ShortcutSnapshot) => void) {}
  setMenuReservations(reserved: ReservedShortcut[]) { this.reserved = [...this.reserved, ...reserved] }
  async init() {
    try {
      const bytes = await readFile(this.path)
      if (bytes.length > 1_048_576) throw new Error('文件过大')
      const parsed = fileSchema.parse(JSON.parse(bytes.toString('utf8')))
      const next = { ...parsed, preferences: { ...shortcutDefaults(), ...parsed.preferences } }
      validateShortcuts(next.preferences, this.reserved)
      if (next.receipts.some(receipt => receipt.revision > next.revision) || new Set(next.receipts.map(item => item.requestId)).size !== next.receipts.length) throw new Error('无效回执')
      this.value = next
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = '快捷键设置无法读取，已使用默认值；原文件保留，请修复后重启。'
    }
  }
  snapshot(): ShortcutSnapshot { return structuredClone({ schemaVersion: 1 as const, revision: this.value.revision, preferences: this.value.preferences, platform: this.platform, reserved: this.reserved, ...(this.error ? { error: this.error } : {}) }) }
  async receipt(input: Pick<ShortcutUpdate, 'requestId' | 'expectedRevision'>): Promise<ShortcutReceipt> {
    const query = shortcutUpdateSchema.pick({ requestId: true, expectedRevision: true }).parse(input)
    await this.flush()
    const receipt = this.value.receipts.find(item => item.requestId === query.requestId)
    const retained = this.value.receipts[0]?.revision ?? this.value.revision + 1
    const state = receipt ? 'committed' : this.error || query.expectedRevision + 1 < retained ? 'unknown' : 'absent'
    return { state, snapshot: this.snapshot() }
  }
  update(input: ShortcutUpdate): Promise<ShortcutSnapshot> {
    const parsed = shortcutUpdateSchema.parse(input)
    const fingerprint = JSON.stringify(parsed)
    const work = this.queue.then(async () => {
      if (this.error) throw new Error(this.error)
      const previous = this.value.receipts.find(item => item.requestId === parsed.requestId)
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error('快捷键请求身份冲突，请重新核对。')
        return this.snapshot()
      }
      if (parsed.expectedRevision !== this.value.revision) throw new Error('SHORTCUT_CONFLICT：快捷键已变化，请核对后重试。')
      const preferences = { ...this.value.preferences, ...parsed.patch }
      validateShortcuts(preferences, this.reserved)
      const revision = this.value.revision + 1
      const next: FileValue = { schemaVersion: 1, revision, preferences, receipts: [...this.value.receipts, { requestId: parsed.requestId, fingerprint, revision }].slice(-128) }
      const temp = `${this.path}.${randomUUID()}.tmp`
      await mkdir(dirname(this.path), { recursive: true })
      try { await writeFile(temp, JSON.stringify(next), { mode: 0o600 }); await rename(temp, this.path) }
      finally { await rm(temp, { force: true }).catch(() => {}) }
      this.value = next
      const snapshot = this.snapshot()
      this.changed(snapshot)
      return snapshot
    })
    this.queue = work.catch(() => {})
    return work
  }
  async flush() { await this.queue }
}

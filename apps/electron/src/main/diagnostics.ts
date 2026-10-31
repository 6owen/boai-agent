/*
 * [OUTPUT]: 2026-10-29 更新器故障/原生加载采用既有脱敏error指纹，不记录更新正文或路径。
 * [OUTPUT]: 2026-10-27 有界宿主日志新增语音请求实际token或unknown；不记录音频/文字/密钥。
 * [INPUT]: Desktop lifecycle categories, process/request identities and compiled build provenance.
 * [OUTPUT]: Bounded journal with per-entry build identity, startup failures and canonical export protection; no payloads or raw errors.
 * [POS]: Electron host diagnostics; business state and conversation traces remain runtime-owned.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { lstat, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'

const MAX_BYTES = 256 * 1024
const MAX_MEMORY_RECORDS = 256
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/)
const events = ['app-update-error', 'app-update-native', 'app-start', 'app-start-failed', 'app-quit', 'app-quit-failed', 'runtime-start', 'runtime-ready', 'runtime-exit', 'runtime-start-failed', 'runtime-error', 'request-failed', 'request-timeout', 'renderer-gone', 'renderer-unresponsive', 'child-gone', 'suspend', 'resume', 'lock-screen', 'unlock-screen', 'browser-warning', 'browser-error', 'uncaught-exception', 'unhandled-rejection', 'voice-usage'] as const
const applicationSchema = z.discriminatedUnion('source', [
  z.object({ version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,99}$/), inputHash: z.string().regex(/^[a-f0-9]{64}$/), source: z.literal('compiled-inputs') }).strict(),
  z.object({ version: z.null(), inputHash: z.null(), source: z.literal('unknown') }).strict(),
])
type Application = z.infer<typeof applicationSchema>
const unknownApplication: Application = { version: null, inputHash: null, source: 'unknown' }
const metadata = z.object({
  usageState: z.enum(['started', 'reported', 'unknown']).optional(),
  inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(), totalTokens: z.number().int().nonnegative().optional(),
  pid: z.number().int().nonnegative().optional(), exitCode: z.number().int().optional(),
  reason: z.enum(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'disconnected', 'unknown']).optional(),
  method: identifier.optional(), requestId: identifier.optional(), operationId: identifier.optional(), serverId: identifier.optional(), employeeId: identifier.optional(), conversationId: identifier.optional(), workId: identifier.optional(), runId: identifier.optional(),
  errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
  errorKind: z.enum(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ZodError', 'Other']).optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict()
type Metadata = z.infer<typeof metadata>
// Legacy entries have no provenance; never attribute them to the exporting build.
const entrySchema = z.object({ sessionId: z.string().uuid(), sequence: z.number().int().positive(), at: z.string().datetime(), event: z.enum(events), metadata, application: applicationSchema.default(unknownApplication) }).strict()
type Entry = z.infer<typeof entrySchema>

export function diagnosticError(error: unknown): Metadata {
  const value = error instanceof Error ? error : undefined
  const code = value && 'code' in value ? value.code : undefined
  return {
    errorKind: value && ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ZodError'].includes(value.name) ? value.name as Metadata['errorKind'] : 'Other',
    ...(typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? { errorCode: code } : {}),
    fingerprint: createHash('sha256').update(value?.message ?? String(error)).digest('hex'),
  }
}

export function diagnosticRequest(method: string, requestId: string, input: unknown): Metadata {
  const result: Metadata = { requestId }
  if (identifier.safeParse(method).success) result.method = method
  if (input && typeof input === 'object') {
    for (const key of ['employeeId', 'conversationId', 'workId', 'runId'] as const) {
      const value = (input as Record<string, unknown>)[key]
      if (identifier.safeParse(value).success) result[key] = value as string
    }
    const operation = (input as Record<string, unknown>).requestId
    if (identifier.safeParse(operation).success) result.operationId = operation as string
  }
  return result
}

export async function writeDiagnosticsReport(dataDirectory: string, destination: string, report: unknown): Promise<string> {
  // Resolve the existing parent: the selected file need not exist yet. Write through
  // this canonical path so an alias of the profile cannot bypass the boundary.
  const root = await realpath(dataDirectory)
  const target = join(await realpath(dirname(resolve(destination))), basename(destination))
  const path = relative(root, target)
  if (path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))) throw new Error('请在应用数据目录之外保存诊断记录。')
  const info = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return undefined })
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error('请选择普通文件保存诊断记录。')
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
    await rename(temporary, target)
  } finally { await rm(temporary, { force: true }) }
  return target
}

export class DesktopDiagnostics {
  readonly sessionId = randomUUID()
  private sequence = 0
  private recent: Entry[] = []
  private persistenceError?: string
  private readonly current: string
  private readonly previous: string
  private readonly build: Application
  constructor(private readonly directory: string, application: { version: string | null; inputHash: string | null; source: 'compiled-inputs' | 'unknown' }) {
    this.current = join(directory, 'desktop.jsonl'); this.previous = join(directory, 'desktop.previous.jsonl')
    const parsed = applicationSchema.safeParse(application)
    this.build = Object.freeze(parsed.success ? parsed.data : { ...unknownApplication })
  }
  record(event: typeof events[number], input: Metadata = {}) {
    // Pick only the fixed schema. Callers never pass error text or complete RPC inputs.
    const parsed = metadata.safeParse(input)
    if (!parsed.success) return false
    const entry: Entry = { sessionId: this.sessionId, sequence: ++this.sequence, at: new Date().toISOString(), event, metadata: parsed.data, application: this.build }
    this.recent.push(entry)
    if (this.recent.length > MAX_MEMORY_RECORDS) this.recent.shift()
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 })
      if (!lstatSync(this.directory).isDirectory() || lstatSync(this.directory).isSymbolicLink()) throw new Error('INVALID_DIAGNOSTIC_DIRECTORY')
      let info
      try { info = lstatSync(this.current) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (info) {
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('INVALID_DIAGNOSTIC_FILE')
        if (info.size + Buffer.byteLength(JSON.stringify(entry)) + 1 > MAX_BYTES) {
          rmSync(this.previous, { force: true }); renameSync(this.current, this.previous)
        }
      }
      // Rare lifecycle/failure writes are synchronous so a crash cannot discard a queued record.
      appendFileSync(this.current, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
      this.persistenceError = undefined
      return true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      this.persistenceError = typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'DIAGNOSTIC_WRITE_FAILED'
      return false
    }
  }
  report() {
    const entries = new Map<string, Entry>()
    let unreadableFiles = 0, rejectedRecords = 0
    for (const path of [this.previous, this.current]) {
      try {
        if (!existsSync(path)) continue
        const info = lstatSync(path)
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) { unreadableFiles++; continue }
        const bytes = readFileSync(path)
        if (bytes.length > MAX_BYTES) { unreadableFiles++; continue }
        for (const line of bytes.toString('utf8').split('\n').filter(Boolean)) {
          let parsed: ReturnType<typeof entrySchema.safeParse>
          try { parsed = entrySchema.safeParse(JSON.parse(line)) } catch { rejectedRecords++; continue }
          if (!parsed.success) { rejectedRecords++; continue }
          const entry = parsed.data; entries.set(`${entry.sessionId}:${entry.sequence}`, entry)
        }
      } catch { unreadableFiles++ }
    }
    for (const entry of this.recent) entries.set(`${entry.sessionId}:${entry.sequence}`, entry)
    return {
      schemaVersion: 2, exportedAt: new Date().toISOString(), sessionId: this.sessionId,
      application: this.build, platform: process.platform, arch: process.arch,
      versions: { electron: process.versions.electron ?? null, node: process.versions.node },
      journal: { maxFileBytes: MAX_BYTES, retainedFiles: 2, unreadableFiles, rejectedRecords, persistenceError: this.persistenceError ?? null },
      entries: [...entries.values()].sort((a, b) => a.at.localeCompare(b.at) || (a.sessionId === b.sessionId ? a.sequence - b.sequence : 0)),
    }
  }
}

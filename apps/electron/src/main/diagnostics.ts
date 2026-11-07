/*
 * [OUTPUT]: 2026-11-07 只读任务/宿主投影保留代次和旧来源，诊断摘要不启动runtime且不输出错误指纹。
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
import { desktopApplicationSchema, desktopDiagnosticErrorCodes, desktopDiagnosticEvents, desktopDiagnosticsQuerySchema, desktopDiagnosticsSnapshotSchema, desktopRuntimeIdentitySchema, type DesktopDiagnosticEvent, type DesktopDiagnosticsQuery, type DesktopDiagnosticsSnapshot, type DesktopRuntimeIdentity } from '@boai/shared/ipc/desktop-diagnostics'

const MAX_BYTES = 256 * 1024
const MAX_MEMORY_RECORDS = 256
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/)
const events = desktopDiagnosticEvents
const applicationSchema = desktopApplicationSchema
type Application = z.infer<typeof applicationSchema>
const unknownApplication: Application = { version: null, inputHash: null, source: 'unknown' }
const metadata = z.object({
  usageState: z.enum(['started', 'reported', 'unknown']).optional(),
  inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(), totalTokens: z.number().int().nonnegative().optional(),
  pid: z.number().int().nonnegative().optional(), exitCode: z.number().int().optional(),
  reason: z.enum(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'disconnected', 'unknown']).optional(),
  method: identifier.optional(), requestId: identifier.optional(), operationId: identifier.optional(), serverId: identifier.optional(), runtimeGeneration: identifier.optional(), employeeId: identifier.optional(), conversationId: identifier.optional(), workId: identifier.optional(), runId: identifier.optional(),
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
  private rejectedWrites = 0
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
    if (!parsed.success) { this.rejectedWrites++; return false }
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
      journal: { maxFileBytes: MAX_BYTES, retainedFiles: 2, unreadableFiles, rejectedRecords, rejectedWrites: this.rejectedWrites, persistenceError: this.persistenceError ?? null },
      entries: [...entries.values()].sort((a, b) => a.at.localeCompare(b.at) || (a.sessionId === b.sessionId ? a.sequence - b.sequence : 0)),
    }
  }
  snapshot(runtimeInput: DesktopRuntimeIdentity, input?: DesktopDiagnosticsQuery): DesktopDiagnosticsSnapshot {
    const query = desktopDiagnosticsQuerySchema.parse(input)
    const runtime = desktopRuntimeIdentitySchema.parse(runtimeInput)
    const report = this.report()
    const targetKeys = ['employeeId', 'conversationId', 'workId', 'runId'] as const
    const environmentEvents = new Set<Entry['event']>(['app-start', 'app-start-failed', 'app-quit', 'app-quit-failed', 'runtime-start', 'runtime-ready', 'runtime-exit', 'runtime-start-failed', 'runtime-error', 'renderer-gone', 'renderer-unresponsive', 'child-gone', 'suspend', 'resume', 'lock-screen', 'unlock-screen', 'uncaught-exception', 'unhandled-rejection'])
    const candidates: DesktopDiagnosticEvent[] = []
    let uncorrelatedRecords = 0
    for (const entry of report.entries) {
      const linked = targetKeys.some(key => entry.metadata[key] !== undefined)
      const consistent = !!query.target && targetKeys.every(key => query.target![key] === undefined || entry.metadata[key] === undefined || entry.metadata[key] === query.target![key])
      // Actual execution RPCs carry conversationId + runId without employeeId.
      // The caller has already verified the run's owner; require this exact pair
      // and reject any conflicting owner/work identity that an event does contain.
      const anchored = !!query.target && (query.target.runId
        ? entry.metadata.runId === query.target.runId && entry.metadata.conversationId === query.target.conversationId
        : entry.metadata.employeeId === query.target.employeeId && entry.metadata.conversationId === query.target.conversationId && (!query.target.workId || entry.metadata.workId === query.target.workId))
      const matches = consistent && anchored
      // Conversation-only requests cannot become evidence for a specific run.
      if (linked && !matches) {
        if (query.target && targetKeys.every(key => query.target![key] === undefined || entry.metadata[key] === undefined || entry.metadata[key] === query.target![key])) uncorrelatedRecords++
        continue
      }
      if (!matches && !environmentEvents.has(entry.event)) { if (!linked) uncorrelatedRecords++; continue }
      const value = entry.metadata
      let runtimeMatch: DesktopDiagnosticEvent['runtimeMatch'] = 'unknown'
      if (entry.sessionId !== this.sessionId) runtimeMatch = 'previous'
      else if (value.runtimeGeneration) {
        const sameGeneration = runtime.mode !== 'absent' && value.runtimeGeneration === runtime.generation
        const processKnown = runtime.mode === 'owned' ? value.pid !== undefined && runtime.pid !== null : runtime.mode === 'attached' ? value.serverId !== undefined && runtime.serverId !== null : false
        const sameProcess = runtime.mode === 'owned' ? value.pid === runtime.pid : runtime.mode === 'attached' ? value.serverId === runtime.serverId : false
        runtimeMatch = !sameGeneration || (processKnown && !sameProcess) ? 'previous' : processKnown ? 'current' : 'unknown'
      }
      const event: DesktopDiagnosticEvent = {
        id: `${entry.sessionId}:${entry.sequence}`, event: entry.event, at: entry.at,
        sessionId: entry.sessionId, sequence: entry.sequence, application: entry.application,
        relation: matches ? 'target' : 'environment', runtimeMatch,
      }
      for (const key of ['pid', 'serverId', 'runtimeGeneration', 'exitCode', 'reason'] as const) {
        if (value[key] !== undefined) Object.assign(event, { [key]: value[key] })
      }
      if (matches) {
        if (value.requestId) event.requestId = value.requestId
        if (value.operationId) event.operationId = value.operationId
      }
      if (value.errorCode) event.errorCode = (desktopDiagnosticErrorCodes as readonly string[]).includes(value.errorCode) ? value.errorCode as DesktopDiagnosticEvent['errorCode'] : 'OTHER'
      candidates.push(event)
    }
    const limit = query.limit ?? 64
    const events = candidates.slice(-limit)
    const bySession = new Map<string, Entry[]>()
    for (const entry of report.entries) {
      const entries = bySession.get(entry.sessionId) ?? []
      entries.push(entry); bySession.set(entry.sessionId, entries)
    }
    const clockOrderUncertain = [...bySession.values()].some(entries => entries.sort((a, b) => a.sequence - b.sequence).some((entry, index, ordered) => index > 0 && entry.at < ordered[index - 1].at))
    const coverage: DesktopDiagnosticsSnapshot['coverage'] = {
      retention: 'bounded', maxFileBytes: MAX_BYTES, retainedFiles: 2, previousFilePresent: existsSync(this.previous),
      unreadableFiles: report.journal.unreadableFiles, rejectedRecords: report.journal.rejectedRecords,
      rejectedWrites: report.journal.rejectedWrites, persistenceError: report.journal.persistenceError ? 'unavailable' : null,
      matchedRecords: candidates.length, returnedRecords: events.length, truncated: candidates.length > events.length,
      oldestAt: candidates[0]?.at ?? null, newestAt: candidates.at(-1)?.at ?? null,
      unknownBuildEntries: candidates.filter(entry => entry.application.source === 'unknown').length,
      missingRuntimeIdentity: candidates.filter(entry => entry.runtimeMatch === 'unknown').length,
      uncorrelatedRecords, clockOrderUncertain,
    }
    const currentLifecycle = candidates.filter(entry => entry.sessionId === this.sessionId).sort((a, b) => a.sequence - b.sequence)
    const latestReady = [...currentLifecycle].reverse().find(entry => entry.event === 'runtime-ready')
    const latestExit = [...currentLifecycle].reverse().find(entry => entry.event === 'runtime-exit')
    const summary = [
      `观察时间：${report.exportedAt}。`,
      this.build.source === 'compiled-inputs' ? `当前宿主构建：${this.build.version}；输入标识 ${this.build.inputHash}。` : '当前宿主构建身份未知。',
      runtime.mode === 'absent' ? '当前宿主未持有运行服务连接。' : runtime.mode === 'owned' ? `当前运行服务由桌面持有，进程 ${runtime.pid ?? '未知'}。` : `当前桌面连接独立运行服务，服务标识 ${runtime.serverId ?? '未知'}。`,
      ...(latestReady ? [`本次宿主会话最近就绪记录：${latestReady.at}；运行关联${latestReady.runtimeMatch === 'current' ? '匹配当前代次' : latestReady.runtimeMatch === 'previous' ? '属于历史代次' : '未知'}。`] : ['本次宿主会话没有保留的运行服务就绪记录。']),
      ...(latestExit ? [`本次宿主会话最近退出/断连记录：${latestExit.at}；这不证明业务请求是否已提交或根因。`] : []),
      `仅有当前保留的诊断记录，最多两份各 ${MAX_BYTES / 1024} KiB 日志；匹配 ${coverage.matchedRecords} 条，返回 ${coverage.returnedRecords} 条。未发现错误不能证明没有发生错误。`,
      ...(coverage.unreadableFiles || coverage.rejectedRecords || coverage.rejectedWrites || coverage.persistenceError ? ['部分诊断记录不可用、被拒绝或未能写入；覆盖并不完整。'] : []),
      ...(clockOrderUncertain ? ['日志时间存在回拨，不能据此推算完整执行耗时。'] : []),
    ]
    return desktopDiagnosticsSnapshotSchema.parse({ schemaVersion: 1, observedAt: report.exportedAt, sessionId: this.sessionId, application: this.build, runtime, ...(query.target ? { target: query.target } : {}), events, coverage, summary })
  }
}

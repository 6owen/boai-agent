/*
 * [OUTPUT]: 2026-10-12成功写入回应后独立通知提交事实，等待该观察结束；不重发、不当作原生接收确认。
 * [OUTPUT]: 2026-10-11 持续原生Codex生产驱动保留原生工具/会话及真实权限；旧分阶段协议仅用于兼容回归。
 * [OUTPUT]: 原生路径核对当前程序及必需协议，以Rovai进程归属确认真实退出；旧阶段版本白名单只适用于兼容入口。
 * [OUTPUT]: 原生warning固定计数与other分开，仅计量接收/处理，不记录警告正文或推断业务终态。
 * [OUTPUT]: 停止后等待所有宿主请求实际退出并保留原失败原因；原生模型目录限定执行能力，不自动重放。
 * [OUTPUT]: 协议诊断只计量固定方法的接收/处理、待回执和字节数，不记录原消息、stderr或凭据。
 * [INPUT]: 受管Codex启动项、工作目录、取消信号与宿主事件/请求处理器。
 * [OUTPUT]: 有界stdio JSON-RPC、版本身份、独立进程组与实际退出；不复制凭据、不自动重试请求。
 * [POS]: 原生Codex app-server传输；会话/Work状态由上层宿主管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import type { LaunchProfile } from '../../../shared/domain/backends'
import { inspectProgram } from '../../modules/backends/program'
import { CODEX_SUPPORTED_VERSIONS, codexStartupArgs } from './policy'
import { waitForProcessGroupExit } from '../mastra/host-command'
import { assertNativeProcessGuard, nativeProcessGuard } from '../native-process-guard'
import { join } from 'node:path'
import { NATIVE_PROCESS_SUPERVISOR } from '../native-process-supervisor'

type JsonRecord = Record<string, unknown>
type RpcId = string | number
const OUTPUT_LIMIT = 8 * 1024 * 1024
const MESSAGE_LIMIT = 2 * 1024 * 1024
const diagnosticMethods = new Set(['initialize', 'config/read', 'model/list', 'account/read', 'thread/start', 'thread/resume', 'turn/start',
  'thread/started', 'thread/status/changed', 'turn/started', 'turn/completed', 'error', 'warning', 'item/started', 'item/completed',
  'item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/textDelta', 'thread/tokenUsage/updated', 'item/tool/call'])
const diagnosticMethod = (method: string) => diagnosticMethods.has(method) ? method : 'other'
export function object(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Codex返回了无效协议对象')
  return value as JsonRecord
}
export function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Codex缺少${name}`)
  return value
}
export interface CodexClientInput {
  /** Native employees inherit the CLI's tools/config; isolated legacy probes keep their policy. */
  native?: boolean
  profile: LaunchProfile
  cwd: string
  privateHome?: string
  catalogPath?: string
  signal: AbortSignal
  onNotification?(method: string, params: JsonRecord): Promise<void>
  onRequest?(method: string, params: JsonRecord): Promise<unknown>
  onResponseSent?(method: string, params: JsonRecord): Promise<void>
}

export class CodexClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly stopped: Promise<void>
  private readonly failure: Promise<never>
  private rejectFailure!: (reason: Error) => void
  private pending = new Map<RpcId, { method: string; resolve(value: JsonRecord): void; reject(reason: Error): void }>()
  private notifications: Promise<void> = Promise.resolve()
  private requests = new Set<Promise<unknown>>()
  private buffer = ''
  private decoder = new StringDecoder('utf8')
  private bytes = 0
  private nextId = 0
  private closed = false
  private fault?: Error
  private notificationCounts: Record<string, { received: number; handled: number }> = {}
  private lastNotification?: { method: string; receivedAt: string; handledAt?: string }
  private readonly abort: () => void

  private constructor(private readonly input: CodexClientInput, command: string, args: string[], env: NodeJS.ProcessEnv) {
    this.failure = new Promise((_, reject) => { this.rejectFailure = reject })
    // A server may fail while the caller is between requests; retain the failure without an unhandled rejection.
    void this.failure.catch(() => {})
    this.child = input.native
      ? spawn(process.execPath, ['--input-type=commonjs', '-e', NATIVE_PROCESS_SUPERVISOR], { cwd: input.cwd, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }) as ChildProcessWithoutNullStreams
      : spawn(command, args, { cwd: input.cwd, env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.stopped = new Promise(resolve => {
      this.child.once('error', () => { this.fail(new Error('无法启动本机Codex程序')); resolve() })
      this.child.once('close', () => { if (!this.closed) this.fail(new Error('Codex进程已退出，未确认请求不可自动重试')); resolve() })
    })
    this.child.stdout.on('data', (chunk: Buffer) => this.read(chunk))
    this.child.stderr.on('data', (chunk: Buffer) => this.account(chunk.length))
    this.child.stdin.on('error', () => { if (!this.closed) this.fail(new Error('Codex连接已断开，请核对原请求')) })
    if (input.native) {
      this.child.on('message', () => { if (!this.closed) this.fail(new Error('Codex 原生进程已退出，请核对原请求')) })
      this.child.stdin.end()
      this.child.send({ command, args, stdin: '', node: input.profile.runtime === 'node', interactive: true, guard: nativeProcessGuard(), ledger: join(input.privateHome ?? input.cwd,'owned-processes') }, error => { if (error) this.fail(new Error('Codex 监督连接无法启动')) })
    }
    this.child.stdout.on('error', () => this.fail(new Error('Codex事件流读取失败')))
    this.abort = () => this.fail(input.signal.reason instanceof Error ? input.signal.reason : new Error('Codex执行已取消'))
    input.signal.addEventListener('abort', this.abort, { once: true })
    if (input.signal.aborted) this.abort()
  }

  static async start(input: CodexClientInput): Promise<{ client: CodexClient; verified: NonNullable<LaunchProfile['verified']> }> {
    input.signal.throwIfAborted()
    if (process.platform === 'win32') throw new Error('Codex进程树取消尚未在Windows验证')
    if (input.native) await assertNativeProcessGuard()
    if (input.profile.protocol !== 'codex-app-server' || input.profile.args.length) throw new Error('请选择受管Codex app-server配置')
    const file = inspectProgram(input.profile.executable)
    if (file.path !== input.profile.executable || file.hash !== input.profile.executableHash) throw new Error('Codex程序已变化，请重新保存并测试')
    await mkdir(input.cwd, { recursive: true })
    const home = input.profile.useExistingLogin ? process.env.HOME : input.privateHome
    if (!home) throw new Error('Codex缺少明确的本机配置目录')
    if (!input.profile.useExistingLogin) await mkdir(home, { recursive: true })
    const env: NodeJS.ProcessEnv = { ...(input.native ? process.env : {}), PATH: process.env.PATH, LANG: process.env.LANG ?? 'en_US.UTF-8', HOME: home, USERPROFILE: home,
      CODEX_HOME: input.profile.useExistingLogin ? input.profile.codexHome ?? `${home}/.codex` : home,
      TMPDIR: input.cwd, TMP: input.cwd, TEMP: input.cwd,
      ...(input.profile.runtime === 'node' ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    }
    input.signal.throwIfAborted()
    const client = new CodexClient(input, input.profile.runtime === 'node' ? process.execPath : file.path,
      [...(input.profile.runtime === 'node' ? [file.path] : []), ...(input.native ? ['app-server', '--listen', 'stdio://', '-c', 'features.respect_system_proxy=true'] : codexStartupArgs), ...(input.catalogPath ? ['-c', `model_catalog_json=${JSON.stringify(input.catalogPath)}`] : [])], env)
    try {
      const result = await client.request('initialize', { clientInfo: { name: 'boai_agent', title: 'BoAI Agent', version: '0.2.2' }, capabilities: { experimentalApi: true } })
      const version = string(result.userAgent, '程序版本').match(/^(?:boai_agent|Codex Desktop|codex_cli_rs|codex-cli|codex)[ /]([\d]+\.[\d]+\.[\d]+(?:[-+][\w.-]+)?)/i)?.[1]
      if (!version) throw new Error('Codex未返回可验证的程序版本')
      if (!input.native && !CODEX_SUPPORTED_VERSIONS.includes(version)) throw new Error(`Codex ${version}尚未通过当前协议兼容检查；支持版本为${CODEX_SUPPORTED_VERSIONS.join('、')}`)
      const verified = { name: 'Codex', version, protocolVersion: 2, checkedAt: new Date().toISOString() }
      if (input.profile.verified && (input.profile.verified.version !== version || input.profile.verified.name !== verified.name)) throw new Error('Codex版本已变化，请重新测试连接')
      client.notify('initialized', {})
      return { client, verified }
    } catch (error) { await client.close(); throw error }
  }

  request(method: string, params: JsonRecord, timeoutMs = 15_000): Promise<JsonRecord> {
    this.assertOpen()
    const id = ++this.nextId
    return new Promise<JsonRecord>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Codex ${method}响应超时，原请求需要核对`)), timeoutMs)
      timer.unref()
      this.pending.set(id, { method, resolve: value => { clearTimeout(timer); resolve(value) }, reject: reason => { clearTimeout(timer); reject(reason) } })
      this.write({ id, method, params })
    })
  }

  notify(method: string, params: JsonRecord) { this.assertOpen(); this.write({ method, params }) }
  async wait<T>(operation: Promise<T>): Promise<T> { return Promise.race([operation, this.failure]) }
  async drain() { await this.wait(this.notifications) }
  diagnostics() {
    return { bytesReceived: this.bytes, pendingRequests: [...this.pending.values()].map(value => diagnosticMethod(value.method)),
      notificationCounts: structuredClone(this.notificationCounts), lastNotification: this.lastNotification && { ...this.lastNotification } }
  }
  async close() {
    if (!this.closed) {
      this.closed = true
      this.input.signal.removeEventListener('abort', this.abort)
      const error = this.fault ?? new Error('Codex连接已关闭')
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
      this.kill()
    }
    await this.stopped
    if (this.input.native && this.child.pid) await waitForProcessGroupExit(this.child.pid)
    // Notification callbacks belong to this run and must leave before its permit is released.
    await this.notifications.catch(() => {})
    await Promise.allSettled([...this.requests])
  }

  private assertOpen() { this.input.signal.throwIfAborted(); if (this.fault) throw this.fault; if (this.closed) throw new Error('Codex连接已关闭') }
  private write(message: JsonRecord) {
    if (this.closed || this.fault) return
    const value = JSON.stringify(message) + '\n'
    if (this.input.native) this.child.send({ type: 'write', value }, error => { if (error) this.fail(new Error('Codex 监督连接已断开')) })
    else this.child.stdin.write(value)
  }
  private kill() { if (this.input.native) { if (this.child.connected) this.child.send({ type: 'stop' }, () => {}); return } try { if (this.child.pid) process.kill(-this.child.pid, 'SIGKILL') } catch { this.child.kill('SIGKILL') } }
  private fail(error: Error) {
    if (this.fault || this.closed) return
    this.fault = error
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.rejectFailure(error)
    this.kill()
  }
  private account(size: number) { this.bytes += size; if (!this.input.native && this.bytes > OUTPUT_LIMIT) this.fail(new Error('Codex输出超过8MiB，已停止并保留待核对状态')) }
  private read(chunk: Buffer) {
    this.account(chunk.length)
    if (this.fault || this.closed) return
    this.buffer += this.decoder.write(chunk)
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1)
      if (Buffer.byteLength(line) > (this.input.native ? 64 * 1024 * 1024 : MESSAGE_LIMIT)) { this.fail(new Error('Codex 单条协议消息超过传输限制')); return }
      if (!line.trim()) continue
      try { this.dispatch(object(JSON.parse(line))) } catch { this.fail(new Error('Codex返回了无效JSON-RPC事件')); return }
    }
    if (Buffer.byteLength(this.buffer) > (this.input.native ? 64 * 1024 * 1024 : MESSAGE_LIMIT)) this.fail(new Error('Codex单条未完成协议消息超过传输限制'))
  }
  private dispatch(message: JsonRecord) {
    const id = typeof message.id === 'number' || typeof message.id === 'string' ? message.id : undefined
    if (typeof message.method !== 'string') {
      if (id === undefined) throw new Error('缺少回执身份')
      const pending = this.pending.get(id)
      if (!pending) return
      if (message.error) {
        // Surface protocol/configuration errors, never raw stderr or credential values.
        const error = object(message.error)
        const detail = typeof error.message === 'string' ? error.message.replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 500) : '请求被拒绝'
        pending.reject(new Error(`Codex ${pending.method}（${String(error.code ?? 'unknown')}）：${detail}`))
      } else {
        try { pending.resolve(object(message.result)) }
        catch { pending.reject(new Error('Codex返回了无效请求回执')); this.fail(new Error('Codex协议回执不完整')) }
      }
      this.pending.delete(id)
      return
    }
    const method = message.method, params = message.params === undefined ? {} : object(message.params)
    if (id !== undefined) {
      const operation = Promise.resolve().then(() => this.input.onRequest ? this.input.onRequest(method, params) : Promise.reject(new Error('此阶段未授权工具请求')))
      const submitted = operation.then(async result => { this.input.signal.throwIfAborted(); this.write({ id, result }); await this.input.onResponseSent?.(method, params) }, error => {
        const detail = error instanceof Error ? error.message : 'Unsupported runtime request'
        this.write({ id, error: { code: -32601, message: detail } })
        if (this.input.native) this.fail(new Error(`Codex ${method}: ${detail}`))
      })
      this.requests.add(submitted)
      void submitted.finally(() => this.requests.delete(submitted)).catch(() => {})
    } else {
      const key = diagnosticMethod(method), counts = this.notificationCounts[key] ??= { received: 0, handled: 0 }
      counts.received++
      const notification = { method: key, receivedAt: new Date().toISOString(), handledAt: undefined as string | undefined }
      this.lastNotification = notification
      this.notifications = this.notifications.then(async () => {
        this.assertOpen(); await this.input.onNotification?.(method, params)
        counts.handled++; notification.handledAt = new Date().toISOString()
      })
      void this.notifications.catch(error => this.fail(new Error(`Codex事件提交失败：${error instanceof Error ? error.message : String(error)}`)))
    }
  }
}

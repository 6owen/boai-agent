/*
 * [OUTPUT]: 2026-10-10 明确支持0.159.3/0.161.0协议，当前程序/hash/验证版本仍逐次匹配；未知版本拒绝且不弱化工具或退出控制。
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
  profile: LaunchProfile
  cwd: string
  privateHome?: string
  catalogPath?: string
  signal: AbortSignal
  onNotification?(method: string, params: JsonRecord): Promise<void>
  onRequest?(method: string, params: JsonRecord): Promise<unknown>
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
    this.child = spawn(command, args, { cwd: input.cwd, env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.stopped = new Promise(resolve => {
      this.child.once('error', () => { this.fail(new Error('无法启动本机Codex程序')); resolve() })
      this.child.once('close', () => { if (!this.closed) this.fail(new Error('Codex进程已退出，未确认请求不可自动重试')); resolve() })
    })
    this.child.stdout.on('data', (chunk: Buffer) => this.read(chunk))
    this.child.stderr.on('data', (chunk: Buffer) => this.account(chunk.length))
    this.child.stdin.on('error', () => { if (!this.closed) this.fail(new Error('Codex连接已断开，请核对原请求')) })
    this.child.stdout.on('error', () => this.fail(new Error('Codex事件流读取失败')))
    this.abort = () => this.fail(input.signal.reason instanceof Error ? input.signal.reason : new Error('Codex执行已取消'))
    input.signal.addEventListener('abort', this.abort, { once: true })
    if (input.signal.aborted) this.abort()
  }

  static async start(input: CodexClientInput): Promise<{ client: CodexClient; verified: NonNullable<LaunchProfile['verified']> }> {
    input.signal.throwIfAborted()
    if (process.platform === 'win32') throw new Error('Codex进程树取消尚未在Windows验证')
    if (input.profile.protocol !== 'codex-app-server' || input.profile.args.length) throw new Error('请选择受管Codex app-server配置')
    const file = inspectProgram(input.profile.executable)
    if (file.path !== input.profile.executable || file.hash !== input.profile.executableHash) throw new Error('Codex程序已变化，请重新保存并测试')
    await mkdir(input.cwd, { recursive: true })
    const home = input.profile.useExistingLogin ? process.env.HOME : input.privateHome
    if (!home) throw new Error('Codex缺少明确的本机配置目录')
    if (!input.profile.useExistingLogin) await mkdir(home, { recursive: true })
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: process.env.LANG ?? 'en_US.UTF-8', HOME: home, USERPROFILE: home,
      CODEX_HOME: input.profile.useExistingLogin ? input.profile.codexHome ?? `${home}/.codex` : home,
      TMPDIR: input.cwd, TMP: input.cwd, TEMP: input.cwd,
      ...(input.profile.runtime === 'node' ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    }
    input.signal.throwIfAborted()
    const client = new CodexClient(input, input.profile.runtime === 'node' ? process.execPath : file.path,
      [...(input.profile.runtime === 'node' ? [file.path] : []), ...codexStartupArgs, ...(input.catalogPath ? ['-c', `model_catalog_json=${JSON.stringify(input.catalogPath)}`] : [])], env)
    try {
      const result = await client.request('initialize', { clientInfo: { name: 'boai_agent', title: 'BoAI Agent', version: '0.2.2' }, capabilities: { experimentalApi: true } })
      const version = string(result.userAgent, '程序版本').match(/^(?:boai_agent|Codex Desktop|codex_cli_rs|codex-cli|codex)[ /]([\d]+\.[\d]+\.[\d]+(?:[-+][\w.-]+)?)/i)?.[1]
      if (!version) throw new Error('Codex未返回可验证的程序版本')
      if (!CODEX_SUPPORTED_VERSIONS.includes(version)) throw new Error(`Codex ${version}尚未通过当前协议兼容检查；支持版本为${CODEX_SUPPORTED_VERSIONS.join('、')}`)
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
    // Notification callbacks belong to this run and must leave before its permit is released.
    await this.notifications.catch(() => {})
    await Promise.allSettled([...this.requests])
  }

  private assertOpen() { this.input.signal.throwIfAborted(); if (this.fault) throw this.fault; if (this.closed) throw new Error('Codex连接已关闭') }
  private write(message: JsonRecord) { if (!this.closed && !this.fault) this.child.stdin.write(JSON.stringify(message) + '\n') }
  private kill() { try { if (this.child.pid) process.kill(-this.child.pid, 'SIGKILL') } catch { this.child.kill('SIGKILL') } }
  private fail(error: Error) {
    if (this.fault || this.closed) return
    this.fault = error
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.rejectFailure(error)
    this.kill()
  }
  private account(size: number) { this.bytes += size; if (this.bytes > OUTPUT_LIMIT) this.fail(new Error('Codex输出超过8MiB，已停止并保留待核对状态')) }
  private read(chunk: Buffer) {
    this.account(chunk.length)
    if (this.fault || this.closed) return
    this.buffer += this.decoder.write(chunk)
    if (Buffer.byteLength(this.buffer) > MESSAGE_LIMIT) { this.fail(new Error('Codex协议消息超过限制')); return }
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1)
      if (!line.trim()) continue
      try { this.dispatch(object(JSON.parse(line))) } catch { this.fail(new Error('Codex返回了无效JSON-RPC事件')); return }
    }
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
      this.requests.add(operation)
      void operation.finally(() => this.requests.delete(operation)).catch(() => {})
      void operation.then(result => { this.input.signal.throwIfAborted(); this.write({ id, result }) }, () => {
        this.write({ id, error: { code: -32601, message: 'This operation is not authorized by the host.' } })
      }).catch(() => {})
    } else {
      const key = diagnosticMethod(method), counts = this.notificationCounts[key] ??= { received: 0, handled: 0 }
      counts.received++
      const notification = { method: key, receivedAt: new Date().toISOString(), handledAt: undefined as string | undefined }
      this.lastNotification = notification
      this.notifications = this.notifications.then(async () => {
        this.assertOpen(); await this.input.onNotification?.(method, params)
        counts.handled++; notification.handledAt = new Date().toISOString()
      })
      void this.notifications.catch(() => this.fail(new Error('Codex事件提交失败，原请求需要核对')))
    }
  }
}

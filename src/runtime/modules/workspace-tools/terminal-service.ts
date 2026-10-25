/*
 * [INPUT]: Host-authorized scope/directory, native guard and explicit PTY operations.
 * [OUTPUT]: Isolated PTYs with bounded output; close requires the outer guard's explicit descendant-cleanup receipt.
 * [POS]: Workspace terminal owner; hidden UI never terminates a running session.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { promisify } from 'node:util'
import { assertNativeProcessGuard } from '../../adapters/native-process-guard'
import type { TerminalScope, TerminalInfo, TerminalOutput, TerminalExecution } from '../../../shared/domain/workspace-tools'

const maxOutput = 1_000_000
interface Session {
  info: TerminalInfo; process: ChildProcessWithoutNullStreams; output: string; offset: number; closed: Promise<void>; initializing: boolean
  execution?: { result: TerminalExecution; start: string; end: string; pending: string; started: boolean }
  cleanupError?: Error
}
export interface TerminalServiceOptions {
  purpose?: 'preview' | 'interactive'
  onCreated?: (info: TerminalInfo) => void
  onData?: (id: string, data: string) => void
  onExit?: (info: TerminalInfo) => void
}
export class TerminalService {
  private sessions = new Map<string, Session>()
  private closing = false
  private creating = 0
  constructor(private dataPath: string, private options: TerminalServiceOptions = {}) {}
  async recover() {
    const guard = await assertNativeProcessGuard()
    await mkdir(this.ledger(), { recursive: true })
    await promisify(execFile)(guard, ['--recover', this.ledger()], { timeout: 15000, maxBuffer: 65536 })
  }
  private ledger() { return join(this.dataPath, this.options.purpose === 'interactive' ? '.interactive-workspace-processes' : '.workspace-terminal-processes') }
  list(scope?: TerminalScope) { return [...this.sessions.values()].filter(s => !scope || s.info.employeeId === scope.employeeId && s.info.conversationId === scope.conversationId).map(s => ({ ...s.info })) }
  info(id: string) { return { ...this.get(id).info } }
  private get(id: string) { const s = this.sessions.get(id); if (!s) throw new Error('终端不存在或服务已重启'); return s }
  async create(scope: TerminalScope, directory: string, title = '终端') {
    if (this.closing) throw new Error('终端服务正在退出')
    if ([...this.sessions.values()].filter(s => s.info.status !== 'exited').length + this.creating >= 16) throw new Error('最多同时运行 16 个终端，请先关闭不用的终端')
    this.creating += 1
    try {
    const cwd = await realpath(directory), guard = await assertNativeProcessGuard()
    await mkdir(this.ledger(), { recursive: true })
    if (this.closing) throw new Error('终端服务正在退出')
    const id = randomUUID()
    // Deliberately no BOAI owner token, model credentials or per-run CLI lease.
    const env: NodeJS.ProcessEnv = { TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: process.env.LANG || 'en_US.UTF-8' }
    for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'XDG_CONFIG_HOME']) if (process.env[name]) env[name] = process.env[name]
    const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
    const child = spawn(guard, ['--ledger', this.ledger(), '--terminal', guard, '--pty', cwd, shell, ...(this.options.purpose === 'interactive' ? ['--login'] : [])], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let finish!: () => void, ready!: () => void, fail!: (error: Error) => void
    const started = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject })
    const session: Session = { info: { ...scope, id, title, cwd, createdAt: new Date().toISOString(), status: 'starting' }, process: child, output: '', offset: 0, initializing: true, closed: new Promise(resolve => { finish = resolve }) }
    this.sessions.set(id, session)
    this.options.onCreated?.({ ...session.info })
    const decoder = new StringDecoder('utf8')
    let protocol = '', errors = '', cleanupConfirmed = false
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (text: string) => {
      protocol += text
      if (protocol.length > 2_000_000) { fail(new Error('终端传输超出限制')); child.kill('SIGTERM'); return }
      let lineEnd: number
      while ((lineEnd = protocol.indexOf('\n')) >= 0) {
        const line = protocol.slice(0, lineEnd); protocol = protocol.slice(lineEnd + 1)
        try {
          const message = JSON.parse(line)
          if (message.type === 'ready') { session.info.status = 'running'; ready() }
          if (message.type === 'data' && Array.isArray(message.bytes)) this.append(session, decoder.write(Buffer.from(message.bytes)))
          if (message.type === 'exit' && Number.isInteger(message.code)) session.info.exitCode = message.code
          if (message.type === 'closed') cleanupConfirmed = true
        } catch { fail(new Error('终端传输无法解析')); child.kill('SIGTERM') }
      }
    })
    child.stderr.on('data', (data: Buffer) => { errors = (errors + data.toString()).slice(-4000) })
    child.stdin.on('error', error => fail(error))
    child.once('error', error => fail(error))
    child.once('close', code => {
      this.append(session, decoder.end())
      if (!cleanupConfirmed) session.cleanupError = new Error(errors || '终端宿主已退出，但子进程清理尚未确认')
      session.info.status = 'exited'; session.info.exitCode ??= code ?? 130
      if (session.execution?.result.status === 'running') { session.execution.result.status = 'exited'; session.execution.result.exitCode = session.info.exitCode }
      this.options.onExit?.({ ...session.info })
      fail(new Error(errors || '终端已退出')); finish()
    })
    const timeout = setTimeout(() => { fail(new Error('终端启动超时')); child.kill('SIGTERM') }, 10000)
    try {
      await started
      if (this.options.purpose === 'interactive') { session.initializing = false; return { ...session.info } }
      const hook = `__boai_prompt(){ local __boai_prompt_status=$?; printf '\\033]633;BOAI;prompt;%s\\007' "$__boai_prompt_status"; }; `
      await this.write(id, hook + (shell.endsWith('zsh') ? 'precmd_functions=(__boai_prompt ${precmd_functions:#__boai_prompt})' : 'PROMPT_COMMAND=(__boai_prompt "${PROMPT_COMMAND[@]}")') + '\n')
      return { ...session.info }
    } catch (error) { child.kill('SIGTERM'); await session.closed; throw error } finally { clearTimeout(timeout) }
    } finally { this.creating -= 1 }
  }
  private append(session: Session, text: string) {
    if (this.options.purpose === 'interactive') { if (text) this.options.onData?.(session.info.id, text); return }
    session.output += text
    if (session.output.length > maxOutput) { const drop = session.output.length - maxOutput; session.output = session.output.slice(drop); session.offset += drop }
    if (session.initializing) {
      const prompt = /\x1b\]633;BOAI;prompt;\d+\x07/.exec(session.output)
      if (!prompt) return
      session.output = session.output.slice(prompt.index + prompt[0].length); session.offset = 0; session.initializing = false; text = session.output
    }
    const execution = session.execution
    if (!execution || execution.result.status !== 'running') return
    execution.pending = (execution.pending + text).slice(-maxOutput)
    if (!execution.started) {
      const start = execution.pending.indexOf(execution.start)
      if (start < 0) return
      execution.started = true; execution.pending = execution.pending.slice(start + execution.start.length)
    }
    const end = execution.pending.indexOf(execution.end)
    if (end < 0) {
      const prompt = /\x1b\]633;BOAI;prompt;(\d+)\x07/.exec(execution.pending)
      if (prompt) { execution.result.output = execution.pending.slice(0, prompt.index); execution.result.status = 'exited'; execution.result.exitCode = Number(prompt[1]) }
      else execution.result.output = execution.pending
      return
    }
    const suffix = execution.pending.slice(end + execution.end.length), match = /^(\d+)\x07/.exec(suffix)
    if (match) { execution.result.output = execution.pending.slice(0, end); execution.result.status = 'exited'; execution.result.exitCode = Number(match[1]) }
  }
  read(id: string, cursor = 0): TerminalOutput {
    const s = this.get(id), start = Math.max(s.offset, cursor)
    if (s.initializing) return { session: { ...s.info }, text: '', cursor: 0, truncated: false }
    return { session: { ...s.info }, text: s.output.slice(Math.max(0, start - s.offset)), cursor: s.offset + s.output.length, truncated: cursor < s.offset }
  }
  write(id: string, data: string) {
    const s = this.get(id)
    if (s.info.status !== 'running') throw new Error('终端已退出')
    if (Buffer.byteLength(data) > 65536) throw new Error('单次终端输入超过限制')
    return new Promise<void>((resolve, reject) => s.process.stdin.write(`${JSON.stringify({ data })}\n`, error => error ? reject(error) : resolve()))
  }
  pauseOutput(id: string) { this.get(id).process.stdout.pause() }
  resumeOutput(id: string) { this.get(id).process.stdout.resume() }
  async resizeConfirmed(id: string, cols: number, rows: number) {
    const s = this.get(id)
    if (s.info.status !== 'running') return
    await new Promise<void>((resolve, reject) => s.process.stdin.write(`${JSON.stringify({ cols, rows })}\n`, error => error ? reject(error) : resolve()))
  }
  resize(id: string, cols: number, rows: number) {
    const s = this.get(id)
    if (s.info.status !== 'running') return
    s.process.stdin.write(`${JSON.stringify({ cols, rows })}\n`)
  }
  async exec(id: string, command: string, waitMs = 10000): Promise<TerminalExecution> {
    const s = this.get(id)
    if (s.execution?.result.status === 'running') throw new Error('该终端的上一条命令仍在运行，请读取输出或先中断')
    const executionId = randomUUID(), prefix = `\x1b]633;BOAI;${executionId};`
    const execution = { result: { id: executionId, status: 'running', output: '' } as TerminalExecution, start: `${prefix}start\x07`, end: `${prefix}exit;`, pending: '', started: false }
    s.execution = execution
    // Braces execute in the current shell: cd and exports survive subsequent commands.
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
    await this.write(id, `printf ${quote('\\033]633;BOAI;' + executionId + ';start\\007')}; {\n${command}\n}; __boai_exit=$?; printf ${quote('\\033]633;BOAI;' + executionId + ';exit;%s\\007')} "$__boai_exit"\n`)
    const deadline = Date.now() + waitMs
    while (execution.result.status === 'running' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30))
    return { ...execution.result }
  }
  execution(id: string) { return this.get(id).execution ? { ...this.get(id).execution!.result } : null }
  async kill(id: string) {
    const s = this.get(id)
    s.process.stdout.resume()
    if (s.info.status !== 'exited') s.process.kill('SIGTERM')
    // Signal the identity-bound supervisor, not just stdin: shell jobs cannot defer shutdown.
    await s.closed
    if (s.cleanupError) throw s.cleanupError
    return { ...s.info }
  }
  forget(id: string) { const s = this.get(id); if (s.info.status !== 'exited') throw new Error('终端仍在运行'); this.sessions.delete(id) }
  async stopEmployee(employeeId: string) { await Promise.all([...this.sessions.values()].filter(s => s.info.employeeId === employeeId).map(s => this.kill(s.info.id))) }
  async clearConversation(conversationId: string) {
    for (const s of [...this.sessions.values()]) if (s.info.conversationId === conversationId) { await this.kill(s.info.id); this.sessions.delete(s.info.id) }
  }
  async close() { this.closing = true; await Promise.all([...this.sessions.keys()].map(id => this.kill(id))) }
}

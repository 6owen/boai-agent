/*
 * [INPUT]: Trusted workspace resolver, isolated native PTY transport and desktop client identity.
 * [OUTPUT]: Coalesced screens/acks, cancellable output waits, scope-safe ordered input and confirmed shutdown.
 * [POS]: User-operated terminal owner; no employee tools, preview PTYs or model credentials.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { randomUUID } from 'node:crypto'
import { Terminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import { TerminalPalette } from './palette'
import { TerminalService, type TerminalServiceOptions } from '../../runtime/modules/workspace-tools/terminal-service'
import type { TerminalInfo, TerminalScope } from '../../shared/domain/workspace-tools'
import type { WorkspaceTerminalFrame, WorkspaceTerminalRequest, WorkspaceTerminalResponse } from '../../shared/ipc/workspace-terminal'

const SCROLLBACK = 1000
const FRAME_LIMIT = 64 * 1024
const HISTORY_LIMIT = 256 * 1024
const PAUSE_AT = 256 * 1024
const RESUME_AT = 64 * 1024
const QUEUE_LIMIT = 2 * 1024 * 1024
const dimensions = (cols: number, rows: number) => Number.isInteger(cols) && cols >= 10 && cols <= 500 && Number.isInteger(rows) && rows >= 2 && rows <= 300
const scopeKey = (scope: TerminalScope) => JSON.stringify([scope.employeeId, scope.conversationId])
const identifier = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200

export interface WorkspaceTerminalProcess {
  recover(): Promise<void>
  create(scope: TerminalScope, directory: string, title?: string): Promise<TerminalInfo>
  info(id: string): TerminalInfo
  write(id: string, data: string): Promise<void>
  resizeConfirmed(id: string, cols: number, rows: number): Promise<void>
  pauseOutput(id: string): void
  resumeOutput(id: string): void
  kill(id: string): Promise<TerminalInfo>
  forget(id: string): void
  close(): Promise<void>
}
interface Screen {
  info: TerminalInfo
  terminal: Terminal
  serialize: SerializeAddon
  palette: TerminalPalette
  queue: Promise<void>
  batch?: { chunks: string[]; bytes: number }
  pendingBytes: number
  paused: boolean
  replies: string
  sequence: number
  exitSequence?: number
  historyBytes: number
  history: { sequence: number; data: string }[]
  attachment?: string
  fault?: string
  closing?: Promise<TerminalInfo>
}
interface Attachment {
  id: string
  clientId: number
  terminalId: string
  acknowledged: number
  pending?: WorkspaceTerminalFrame
  nextInput: number
  writes: Map<number, { data: string; result: Promise<void> }>
  inputQueue: Promise<void>
  queuedInputs: number
  queuedInputBytes: number
  read?: { result: Promise<WorkspaceTerminalResponse>; cancelled: boolean; wake?: () => void }
}
interface Creation {
  scope: TerminalScope
  result: Promise<TerminalInfo>
}
export interface WorkspaceTerminalOptions {
  /** Must recheck current employee/conversation identity; never trust a renderer path. */
  resolveScope(scope: TerminalScope): Promise<string>
  /** Current identity/membership/closing check without resolving the already-open PTY's cwd. */
  validateScope?(scope: TerminalScope): Promise<void>
  createProcess?: (options: TerminalServiceOptions) => WorkspaceTerminalProcess
}

export class WorkspaceTerminalService {
  private processes: WorkspaceTerminalProcess
  private readonly screens = new Map<string, Screen>()
  private readonly attachments = new Map<string, Attachment>()
  private readonly creations = new Map<string, Creation>()
  private readonly closed = new Map<string, TerminalInfo>()
  private readonly epochs = new Map<string, number>()
  private readonly clientEpochs = new Map<number, number>()
  private readonly clearingScopes = new Set<(scope: TerminalScope) => boolean>()
  private activeCreates = 0
  private closing = false
  private closeOperation?: Promise<void>
  private closedSuccessfully = false

  constructor(private readonly dataPath: string, private readonly options: WorkspaceTerminalOptions) {
    this.processes = this.makeProcess()
  }
  private makeProcess() {
    const processOptions: TerminalServiceOptions = {
      purpose: 'interactive',
      onCreated: info => this.register(info),
      onData: (id, data) => this.receive(id, data),
      onExit: info => this.exited(info),
    }
    return this.options.createProcess?.(processOptions) ?? new TerminalService(this.dataPath, processOptions)
  }
  recover() { return this.processes.recover() }

  private register(info: TerminalInfo) {
    const terminal = new Terminal({ cols: 100, rows: 30, scrollback: SCROLLBACK, allowProposedApi: true })
    const serialize = new SerializeAddon()
    terminal.loadAddon(serialize)
    const screen: Screen = { info: { ...info }, terminal, serialize, palette: new TerminalPalette(terminal), queue: Promise.resolve(), pendingBytes: 0, paused: false, replies: '', sequence: 0, historyBytes: 0, history: [] }
    // Answer terminal device/cursor queries even while the view is detached. The renderer
    // suppresses these same query handlers, so protocol replies are emitted only once.
    terminal.onData(data => {
      screen.replies += data
      if (Buffer.byteLength(screen.replies) > 65536) {
        screen.replies = ''; this.fault(screen, '终端协议响应超出限制，请关闭后重新创建')
        void this.processes.kill(info.id).catch(() => undefined)
      }
    })
    this.screens.set(info.id, screen)
  }
  private receive(id: string, data: string) {
    const screen = this.screens.get(id)
    if (!screen || screen.fault || !data) return
    const bytes = Buffer.byteLength(data)
    screen.pendingBytes += bytes
    if (!screen.paused && screen.pendingBytes >= PAUSE_AT) { screen.paused = true; this.processes.pauseOutput(id) }
    if (screen.pendingBytes > QUEUE_LIMIT) {
      this.fault(screen, '终端输出处理超出限制，进程已请求停止')
      void this.processes.kill(id).catch(() => this.fault(screen, '终端输出处理超出限制，停止失败，请重试关闭'))
      return
    }
    // A pending batch is mutable only until parsing/capture starts. Small chunks received
    // in the same turn share one xterm write callback rather than one timer each.
    if (screen.batch && screen.batch.bytes + bytes <= FRAME_LIMIT) {
      screen.batch.chunks.push(data); screen.batch.bytes += bytes
      return
    }
    const batch = { chunks: [data], bytes }
    screen.batch = batch
    screen.queue = screen.queue.then(async () => {
      if (screen.batch === batch) screen.batch = undefined
      if (screen.fault) { screen.pendingBytes -= batch.bytes; return }
      const data = batch.chunks.join('')
      await new Promise<void>(resolve => screen.terminal.write(data, resolve))
      const replies = screen.replies; screen.replies = ''
      if (replies && !screen.fault && this.processes.info(id).status === 'running') await this.processes.write(id, replies)
      screen.sequence += 1
      screen.history.push({ sequence: screen.sequence, data })
      screen.historyBytes += batch.bytes
      while (screen.historyBytes > HISTORY_LIMIT && screen.history.length > 1) screen.historyBytes -= Buffer.byteLength(screen.history.shift()!.data)
      screen.pendingBytes -= batch.bytes
      if (!screen.fault && screen.paused && screen.pendingBytes < RESUME_AT) { screen.paused = false; this.processes.resumeOutput(id) }
      this.wake(screen)
    }).catch(() => {
      this.fault(screen, '终端屏幕处理失败，请关闭后重新创建')
      void this.processes.kill(id).catch(() => undefined)
    })
  }
  private exited(info: TerminalInfo) {
    const screen = this.screens.get(info.id)
    if (!screen) return
    screen.batch = undefined
    screen.queue = screen.queue.then(() => {
      screen.info = { ...info }
      screen.sequence += 1
      screen.exitSequence = screen.sequence
      screen.history.push({ sequence: screen.sequence, data: '' })
      this.wake(screen)
    })
  }
  private getScreen(id: string) {
    const screen = this.screens.get(id)
    if (!screen) throw new Error('终端不存在或宿主已重启，请新建终端')
    return screen
  }
  private getAttachment(id: string, clientId: number) {
    const attachment = this.attachments.get(id)
    if (!attachment || attachment.clientId !== clientId) throw new Error('终端连接已失效，请重新连接')
    return attachment
  }
  scopeFor(request: WorkspaceTerminalRequest): TerminalScope {
    if (request.action === 'create' || request.action === 'list') return request.scope
    if ('terminalId' in request) {
      const info = this.screens.get(request.terminalId)?.info ?? this.closed.get(request.terminalId)
      if (!info) throw new Error('终端不存在或宿主已重启')
      return { employeeId: info.employeeId, conversationId: info.conversationId }
    }
    const attachment = this.attachments.get(request.attachmentId)
    if (!attachment) throw new Error('终端连接已失效，请重新连接')
    const info = this.getScreen(attachment.terminalId).info
    return { employeeId: info.employeeId, conversationId: info.conversationId }
  }
  private info(screen: Screen) {
    // Exit status shares the output queue cut, so a reader cannot observe exited
    // before the process's final buffered output has reached its screen.
    const current = this.processes.info(screen.info.id)
    if (current.status !== 'exited') screen.info = current
    return { ...screen.info }
  }
  private frameInfo(screen: Screen, sequence: number): TerminalInfo {
    const info = this.info(screen)
    // A bounded delta may cover only part of the final output. Signal the stream's
    // exit only in the frame containing that event, after every earlier byte.
    return info.status === 'exited' && screen.exitSequence !== undefined && sequence < screen.exitSequence
      ? { ...info, status: 'running', exitCode: undefined } : info
  }
  private snapshot(screen: Screen): WorkspaceTerminalFrame {
    return { terminal: this.info(screen), sequence: screen.sequence, kind: 'snapshot', data: screen.palette.serialize() + screen.serialize.serialize({ scrollback: SCROLLBACK }), cols: screen.terminal.cols, rows: screen.terminal.rows }
  }
  /** Queue the capture behind prior writes, ahead of future data: screen and sequence are one cut. */
  private capture<T>(screen: Screen, operation: () => T): Promise<T> {
    screen.batch = undefined
    const captured = screen.queue.then(operation)
    screen.queue = captured.then(() => undefined, () => undefined)
    return captured
  }

  private wake(screen: Screen) {
    if (screen.attachment) this.attachments.get(screen.attachment)?.read?.wake?.()
  }
  private fault(screen: Screen, message: string) {
    screen.fault = message
    this.wake(screen)
  }
  private async read(attachment: Attachment, clientEpoch: number, wait: boolean): Promise<WorkspaceTerminalResponse> {
    if (wait && attachment.read) return attachment.read.result
    const screen = this.getScreen(attachment.terminalId)
    const state = { result: undefined as unknown as Promise<WorkspaceTerminalResponse>, cancelled: false, wake: undefined as (() => void) | undefined }
    const result = (async (): Promise<WorkspaceTerminalResponse> => {
      while (true) {
        // Register before the capture: output/cancel during parsing cannot lose a wakeup.
        const changed = new Promise<void>(resolve => { state.wake = resolve })
        const frame = await this.capture(screen, () => {
          if (state.cancelled) return null
          this.assertClient(attachment.clientId, clientEpoch)
          this.getAttachment(attachment.id, attachment.clientId)
          if (screen.fault) throw new Error(screen.fault)
          if (screen.closing) throw new Error('终端正在关闭')
          if ([...this.clearingScopes].some(matches => matches(screen.info))) throw new Error('终端所属工作区正在清理')
          if (attachment.pending) return attachment.pending
          if (attachment.acknowledged === screen.sequence) return null
          const first = screen.history[0]?.sequence ?? screen.sequence + 1
          if (attachment.acknowledged < first - 1) return (attachment.pending = this.snapshot(screen))
          let data = '', sequence = attachment.acknowledged, bytes = 0
          for (const chunk of screen.history) {
            if (chunk.sequence <= sequence) continue
            const nextBytes = Buffer.byteLength(chunk.data)
            if (bytes + nextBytes > FRAME_LIMIT && data) break
            data += chunk.data; bytes += nextBytes; sequence = chunk.sequence
          }
          return (attachment.pending = { terminal: this.frameInfo(screen, sequence), sequence, kind: 'delta' as const, data, cols: screen.terminal.cols, rows: screen.terminal.rows })
        })
        if (frame || !wait || state.cancelled || screen.info.status === 'exited' && attachment.acknowledged === screen.sequence) return { kind: 'frame', frame }
        await changed
      }
    })()
    state.result = result
    if (wait) {
      attachment.read = state
      const settled = () => { if (attachment.read === state) attachment.read = undefined }
      void result.then(settled, settled)
    }
    return result
  }

  async handle(clientId: number, request: WorkspaceTerminalRequest): Promise<WorkspaceTerminalResponse> {
    if (!Number.isInteger(clientId) || clientId < 0) throw new Error('终端客户端无效')
    this.validate(request)
    const clientEpoch = this.clientEpochs.get(clientId) ?? 0
    if (this.closing) throw new Error('终端服务正在退出')
    // Attachment ownership is checked before any asynchronous authorization or data read.
    const attachment = 'attachmentId' in request ? this.getAttachment(request.attachmentId, clientId) : undefined
    const scope = this.scopeFor(request)
    // These operations establish/re-establish a workspace capability. Attached stream
    // traffic uses the owner-bound attachment, revoked before scope mutations commit.
    const directory = ['create', 'list', 'attach'].includes(request.action) ? await this.options.resolveScope(scope) : undefined
    this.assertClient(clientId, clientEpoch)
    if ([...this.clearingScopes].some(matches => matches(scope))) throw new Error('终端所属工作区正在清理')
    if (attachment) this.getAttachment(attachment.id, clientId)
    switch (request.action) {
      case 'create': return { kind: 'created', terminal: await this.create(clientId, clientEpoch, request.requestId, scope, directory!) }
      case 'list': return { kind: 'listed', terminals: [...this.screens.values()].filter(screen => scopeKey(screen.info) === scopeKey(scope)).map(screen => this.info(screen)) }
      case 'attach': {
        const screen = this.getScreen(request.terminalId)
        if (screen.closing) throw new Error('终端正在关闭')
        if (screen.attachment) this.detach(screen.attachment)
        const next: Attachment = { id: randomUUID(), clientId, terminalId: screen.info.id, acknowledged: -1, nextInput: 1, writes: new Map(), inputQueue: Promise.resolve(), queuedInputs: 0, queuedInputBytes: 0 }
        this.attachments.set(next.id, next); screen.attachment = next.id
        const frame = await this.capture(screen, () => { this.assertClient(clientId, clientEpoch); this.getAttachment(next.id, clientId); return this.snapshot(screen) })
        this.getAttachment(next.id, clientId)
        next.pending = frame
        return { kind: 'attached', attachmentId: next.id, frame, nextInputSequence: 1 }
      }
      case 'read': return this.read(attachment!, clientEpoch, request.wait === true)
      case 'cancelRead':
        if (attachment!.read) { attachment!.read.cancelled = true; attachment!.read.wake?.() }
        return { kind: 'readCancelled' }
      case 'ack': {
        if (request.sequence === attachment!.acknowledged) return { kind: 'acknowledged', sequence: request.sequence }
        if (!attachment!.pending || request.sequence !== attachment!.pending.sequence) throw new Error('终端输出确认序号无效，请重新连接')
        attachment!.acknowledged = request.sequence; attachment!.pending = undefined
        return { kind: 'acknowledged', sequence: request.sequence }
      }
      case 'write': {
        const known = attachment!.writes.get(request.inputSequence)
        if (known) {
          if (known.data !== request.data) throw new Error('终端输入序号已被不同内容使用')
          await known.result
          return { kind: 'written', inputSequence: request.inputSequence }
        }
        if (request.inputSequence !== attachment!.nextInput) throw new Error('终端输入序号不连续，未重复发送命令')
        const inputBytes = Buffer.byteLength(request.data)
        if (attachment!.queuedInputs >= 16 || attachment!.queuedInputBytes + inputBytes > 262144) throw new Error('终端输入队列已满，请等待当前输入确认')
        if (attachment!.writes.size >= 64) attachment!.writes.delete(attachment!.writes.keys().next().value!)
        attachment!.nextInput += 1
        attachment!.queuedInputs += 1; attachment!.queuedInputBytes += inputBytes
        const result = attachment!.inputQueue.then(async () => {
          this.assertClient(clientId, clientEpoch)
          this.getAttachment(attachment!.id, clientId)
          if (this.options.validateScope) await this.options.validateScope(scope)
          else await this.options.resolveScope(scope)
          this.assertClient(clientId, clientEpoch)
          this.getAttachment(attachment!.id, clientId)
          if (this.getScreen(attachment!.terminalId).closing || [...this.clearingScopes].some(matches => matches(scope))) throw new Error('终端正在关闭')
          await this.processes.write(attachment!.terminalId, request.data)
        })
        const settled = () => { attachment!.queuedInputs -= 1; attachment!.queuedInputBytes -= inputBytes }
        void result.then(settled, settled)
        attachment!.writes.set(request.inputSequence, { data: request.data, result })
        // A failed write poisons this attachment's input queue: unknown input is never replayed.
        attachment!.inputQueue = result
        await result
        return { kind: 'written', inputSequence: request.inputSequence }
      }
      case 'resize': {
        const screen = this.getScreen(attachment!.terminalId)
        await this.capture(screen, async () => {
          this.assertClient(clientId, clientEpoch)
          this.getAttachment(attachment!.id, clientId)
          if (screen.terminal.cols === request.cols && screen.terminal.rows === request.rows) return
          await this.processes.resizeConfirmed(screen.info.id, request.cols, request.rows)
          screen.terminal.resize(request.cols, request.rows)
          screen.sequence += 1
          // Resize changes reflow. Any read after an older frame requires a complete screen.
          screen.history = []; screen.historyBytes = 0
          this.wake(screen)
        })
        return { kind: 'resized' }
      }
      case 'detach': this.detach(request.attachmentId); return { kind: 'detached' }
      case 'close': return { kind: 'closed', terminal: await this.closeTerminal(request.terminalId) }
    }
  }

  private assertClient(clientId: number, epoch: number) {
    if ((this.clientEpochs.get(clientId) ?? 0) !== epoch) throw new Error('终端客户端已重载，请重新连接')
    if (this.closing) throw new Error('终端服务正在退出')
  }
  private validate(request: WorkspaceTerminalRequest) {
    if (!request || typeof request !== 'object') throw new Error('终端请求无效')
    if (!['create', 'list', 'attach', 'read', 'cancelRead', 'ack', 'write', 'resize', 'detach', 'close'].includes(request.action)) throw new Error('终端操作无效')
    if ((request.action === 'create' || request.action === 'list') && (!request.scope || !identifier(request.scope.employeeId) || !identifier(request.scope.conversationId))) throw new Error('终端所属工作区无效')
    if ('terminalId' in request && !identifier(request.terminalId) || 'attachmentId' in request && !identifier(request.attachmentId)) throw new Error('终端身份无效')
    if (request.action === 'create' && !identifier(request.requestId)) throw new Error('终端创建请求身份无效')
    if (request.action === 'ack' && (!Number.isSafeInteger(request.sequence) || request.sequence < 0)) throw new Error('终端输出序号无效')
    if (request.action === 'read' && request.wait !== undefined && typeof request.wait !== 'boolean') throw new Error('终端读取等待参数无效')
    if (request.action === 'write' && (!Number.isSafeInteger(request.inputSequence) || request.inputSequence < 1 || typeof request.data !== 'string' || Buffer.byteLength(request.data) > 65536)) throw new Error('终端输入无效或超出限制')
    if (request.action === 'resize' && !dimensions(request.cols, request.rows)) throw new Error('终端尺寸超出范围')
  }
  private async create(clientId: number, clientEpoch: number, requestId: string, scope: TerminalScope, directory: string) {
    const key = JSON.stringify([clientId, requestId]), prior = this.creations.get(key)
    if (prior) {
      if (scopeKey(prior.scope) !== scopeKey(scope)) throw new Error('终端创建请求已用于其他工作区')
      const info = await prior.result
      this.assertClient(clientId, clientEpoch)
      return this.screens.has(info.id) ? this.info(this.getScreen(info.id)) : { ...this.closed.get(info.id) ?? info }
    }
    if (this.creations.size >= 256) throw new Error('终端创建请求数量已达上限，请重启应用后继续')
    if (this.activeCreates >= 16) throw new Error('正在创建的终端过多，请稍后再试')
    if (this.screens.size + this.activeCreates >= 24) throw new Error('打开的终端过多，请先关闭不用的终端')
    const epoch = this.epochs.get(scopeKey(scope)) ?? 0
    this.activeCreates += 1
    const result = Promise.resolve().then(async () => {
      this.assertClient(clientId, clientEpoch)
      if (this.closing || epoch !== (this.epochs.get(scopeKey(scope)) ?? 0) || [...this.clearingScopes].some(matches => matches(scope))) throw new Error('终端所属工作区正在清理')
      const info = await this.processes.create(scope, directory, '终端')
      try {
        this.assertClient(clientId, clientEpoch)
        await this.options.resolveScope(scope)
        this.assertClient(clientId, clientEpoch)
        if (this.closing || epoch !== (this.epochs.get(scopeKey(scope)) ?? 0)) throw new Error('终端所属工作区已清理')
        return info
      } catch (error) { await this.closeTerminal(info.id); throw error }
    }).finally(() => { this.activeCreates -= 1 })
    this.creations.set(key, { scope: { ...scope }, result })
    return result
  }
  private detach(id: string) {
    const attachment = this.attachments.get(id)
    if (!attachment) return
    const screen = this.screens.get(attachment.terminalId)
    if (screen?.attachment === id) screen.attachment = undefined
    this.attachments.delete(id)
    attachment.read?.wake?.()
  }
  releaseClient(clientId: number) {
    this.clientEpochs.set(clientId, (this.clientEpochs.get(clientId) ?? 0) + 1)
    for (const attachment of this.attachments.values()) if (attachment.clientId === clientId) this.detach(attachment.id)
  }
  async closeTerminal(id: string): Promise<TerminalInfo> {
    const done = this.closed.get(id)
    if (done) return { ...done }
    const screen = this.getScreen(id)
    if (screen.closing) return screen.closing
    screen.closing = (async () => {
      try {
        const info = await this.processes.kill(id)
        await screen.queue
        if (info.status !== 'exited') throw new Error('终端进程尚未确认退出')
        if (screen.attachment) this.detach(screen.attachment)
        screen.palette.dispose(); screen.terminal.dispose(); this.processes.forget(id); this.screens.delete(id)
        this.closed.set(id, { ...info })
        if (this.closed.size > 256) this.closed.delete(this.closed.keys().next().value!)
        return info
      } catch (error) { screen.closing = undefined; throw error }
    })()
    this.wake(screen)
    return screen.closing
  }
  private async clearMatching(matches: (scope: TerminalScope) => boolean) {
    this.clearingScopes.add(matches)
    for (const screen of this.screens.values()) if (matches(screen.info)) this.wake(screen)
    try {
    const scopes = new Set([...this.screens.values()].filter(screen => matches(screen.info)).map(screen => scopeKey(screen.info)))
    for (const creation of this.creations.values()) if (matches(creation.scope)) scopes.add(scopeKey(creation.scope))
    for (const key of scopes) this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1)
    await Promise.allSettled([...this.creations.values()].filter(creation => matches(creation.scope)).map(creation => creation.result))
    await Promise.all([...this.screens.values()].filter(screen => matches(screen.info)).map(screen => this.closeTerminal(screen.info.id)))
    } finally { this.clearingScopes.delete(matches) }
  }
  stopEmployee(employeeId: string) { return this.clearMatching(scope => scope.employeeId === employeeId) }
  stopScope(scope: TerminalScope) { return this.clearMatching(candidate => scopeKey(candidate) === scopeKey(scope)) }
  clearConversation(conversationId: string) { return this.clearMatching(scope => scope.conversationId === conversationId) }
  async close() {
    if (this.closeOperation) return this.closeOperation
    this.closing = true
    for (const screen of this.screens.values()) this.wake(screen)
    this.closeOperation = (async () => {
      await this.clearMatching(() => true)
      await this.processes.close()
      this.closedSuccessfully = true
    })()
    try { await this.closeOperation } finally { if (!this.closedSuccessfully) this.closeOperation = undefined }
  }
  /** App quit can be aborted by another service. Reopen only after this owner actually drained. */
  resumeAfterShutdown() {
    if (!this.closing) return
    if (!this.closedSuccessfully || this.screens.size || this.activeCreates) throw new Error('旧终端进程尚未全部退出，无法恢复终端服务')
    this.processes = this.makeProcess()
    this.closing = false; this.closedSuccessfully = false; this.closeOperation = undefined
  }
}

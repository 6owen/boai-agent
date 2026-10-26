/*
 * [INPUT]: 单个终端附着、可见性、宿主帧与有序输入回执。
 * [OUTPUT]: 数据到达即消费、隐藏取消等待、显示增量续接及有界输入流水；未知输入失败不重放。
 * [POS]: 工作区终端传输控制器；不持有React状态或创建终端进程。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { WorkspaceTerminalFrame, WorkspaceTerminalRequest, WorkspaceTerminalResponse } from '@boai/shared/ipc/workspace-terminal'
import type { TerminalInfo } from '@boai/shared/domain/workspace-tools'

type Request = (request: WorkspaceTerminalRequest) => Promise<WorkspaceTerminalResponse>
export class WorkspaceTerminalController {
  private attachmentId?: string
  private disposed = false
  private failed = false
  private exited = false
  private pumping = false
  private reading = false
  private initialFrame?: WorkspaceTerminalFrame
  private inputSequence = 1
  private confirmedInput = 0
  private readonly confirmations = new Set<number>()
  private queuedInput = ''
  private inFlightInput = 0
  private inputSize = 0
  private connected = false

  constructor(private readonly request: Request, private readonly callbacks: {
    render(frame: WorkspaceTerminalFrame): Promise<void>
    terminal(info: TerminalInfo): void
    connected(value: boolean): void
    error(error: unknown): void
  }, private active: boolean) {}

  async attach(terminalId: string): Promise<void> {
    try {
      const result = await this.request({ action: 'attach', terminalId })
      if (result.kind !== 'attached') throw new Error('终端连接回执无效')
      this.attachmentId = result.attachmentId
      if (this.disposed) { await this.detach(); return }
      this.inputSequence = result.nextInputSequence
      this.confirmedInput = result.nextInputSequence - 1
      this.initialFrame = result.frame
      this.pump()
    } catch (error) { this.fail(error) }
  }

  setActive(active: boolean): void {
    this.active = active
    if (!active) this.cancelRead()
    else this.pump()
  }

  get canInput(): boolean { return this.connected && this.active && !this.failed && !this.disposed && !this.exited }

  input(data: string): void {
    if (!this.canInput || !data) return
    if (this.inputSize + data.length > 32_768) {
      this.fail(new Error('终端输入过长，尚未发送的内容已停止。请检查终端后重新连接。'))
      return
    }
    this.inputSize += data.length
    this.queuedInput += data
    this.flushInput()
  }

  async resize(cols: number, rows: number): Promise<void> {
    if (!this.attachmentId || this.disposed || this.failed || this.exited || !this.active) return
    try {
      const result = await this.request({ action: 'resize', attachmentId: this.attachmentId, cols, rows })
      if (result.kind !== 'resized') throw new Error('终端尺寸回执无效')
    } catch (error) { this.fail(error) }
  }

  dispose(): Promise<void> {
    this.disposed = true
    this.queuedInput = ''
    this.cancelRead()
    return this.detach()
  }

  private async detach(): Promise<void> {
    const attachmentId = this.attachmentId
    this.attachmentId = undefined
    if (attachmentId) {
      try { await this.request({ action: 'detach', attachmentId }) } catch { /* A lost host has no live subscription. */ }
    }
  }

  private cancelRead(): void {
    if (this.attachmentId && this.reading) {
      void this.request({ action: 'cancelRead', attachmentId: this.attachmentId }).catch(error => this.fail(error))
    }
  }

  private fail(error: unknown): void {
    if (this.disposed || this.failed) return
    this.failed = true
    this.queuedInput = ''
    this.connected = false
    this.callbacks.connected(false)
    this.cancelRead()
    this.callbacks.error(error)
  }

  private pump(): void {
    if (this.pumping || !this.active || !this.attachmentId || this.disposed || this.failed || this.exited) return
    this.pumping = true
    void (async () => {
      try {
        while (this.active && this.attachmentId && !this.disposed && !this.failed && !this.exited) {
          let frame = this.initialFrame
          this.initialFrame = undefined
          if (!frame) {
            this.reading = true
            let result: WorkspaceTerminalResponse
            try { result = await this.request({ action: 'read', attachmentId: this.attachmentId, wait: true }) }
            finally { this.reading = false }
            if (this.disposed || this.failed) break
            if (result.kind !== 'frame') throw new Error('终端输出回执无效')
            frame = result.frame ?? undefined
          }
          if (!frame) continue
          // A hidden screen keeps its emulator and cursor, but does not render or
          // acknowledge unseen output. The next activation resumes this frame.
          if (!this.active) { this.initialFrame = frame; break }
          await this.callbacks.render(frame)
          if (this.disposed || this.failed || !this.attachmentId) break
          const ack = await this.request({ action: 'ack', attachmentId: this.attachmentId, sequence: frame.sequence })
          if (ack.kind !== 'acknowledged' || ack.sequence !== frame.sequence) throw new Error('终端输出确认回执无效')
          if (this.disposed || this.failed) break
          this.callbacks.terminal(frame.terminal)
          this.exited = frame.terminal.status === 'exited'
          if (this.connected !== !this.exited) {
            this.connected = !this.exited
            this.callbacks.connected(this.connected)
          }
        }
      } catch (error) { this.fail(error) }
      finally {
        this.pumping = false
        // Visibility can change again while cancelRead or render/ack is in flight.
        if (this.active && !this.disposed && !this.failed && !this.exited) this.pump()
      }
    })()
  }

  private flushInput(): void {
    // Four ordered requests hide IPC latency without allowing unbounded paste
    // memory. Unknown outcomes stop the stream; they are never replayed.
    while (this.queuedInput && this.inFlightInput < 4 && this.inputSequence - this.confirmedInput <= 4 && !this.failed && !this.disposed && !this.exited && this.attachmentId) {
      let end = Math.min(4096, this.queuedInput.length)
      if (end < this.queuedInput.length && /[\uD800-\uDBFF]/u.test(this.queuedInput[end - 1]!)) end--
      const data = this.queuedInput.slice(0, end)
      this.queuedInput = this.queuedInput.slice(end)
      const inputSequence = this.inputSequence++
      this.inFlightInput++
      void this.request({ action: 'write', attachmentId: this.attachmentId, inputSequence, data }).then(result => {
        if (this.failed || this.disposed) return
        if (result.kind !== 'written' || result.inputSequence !== inputSequence) throw new Error('终端输入结果尚未确认，请重新连接后检查执行结果')
        this.confirmations.add(inputSequence)
        while (this.confirmations.delete(this.confirmedInput + 1)) this.confirmedInput++
      }).catch(error => this.fail(error)).finally(() => {
        this.inFlightInput--
        this.inputSize -= data.length
        this.flushInput()
      })
    }
  }
}

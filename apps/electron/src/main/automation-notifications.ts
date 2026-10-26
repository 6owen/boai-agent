/*
 * [INPUT]: 持久通知领取/回执端口与系统通知提交函数。
 * [OUTPUT]: 串行消费、系统失败回执与提交结果的分别记录；回执失败不再次弹出通知。
 * [POS]: Electron 通知消费器；不决定业务结果、通知策略或模型执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AutomationNotice, AutomationNoticeReceipt } from '@boai/shared/domain/automations'
interface Ports {
  take(): Promise<AutomationNotice | null>
  settle(receipt: AutomationNoticeReceipt): Promise<void>
  submit(notice: AutomationNotice, failed: (error: string) => void): void
  error(error: unknown): void
}
export class AutomationNotificationConsumer {
  private running?: Promise<void>
  private requested = false
  constructor(private ports: Ports) {}
  flush(): Promise<void> {
    if (this.running) { this.requested = true; return this.running }
    this.requested = false
    this.running = this.consume().finally(() => {
      this.running = undefined
      if (this.requested) return this.flush()
    })
    return this.running
  }
  private async consume() {
    for (;;) {
      const notice = await this.ports.take()
      if (!notice) return
      const receipt = { id: notice.id, attemptId: notice.attemptId! }
      let failure: string | undefined
      try {
        this.ports.submit(notice, error => { void this.ports.settle({ ...receipt, status: 'failed', error: error.slice(0, 2000) }).catch(this.ports.error) })
      } catch (error) { failure = error instanceof Error ? error.message : String(error) }
      // A lost database acknowledgement says nothing about OS submission. Do not call submit again.
      try { await this.ports.settle({ ...receipt, status: failure === undefined ? 'submitted' : 'failed', ...(failure === undefined ? {} : { error: failure.slice(0, 2000) }) }) }
      catch (error) {
        try { await this.ports.settle({ ...receipt, status: 'unknown', error: '系统提交已尝试，确认回执失败；不会自动重发' }) }
        catch (receiptError) { this.ports.error(receiptError) }
        throw error
      }
    }
  }
}

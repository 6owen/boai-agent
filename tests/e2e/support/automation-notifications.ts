/*
 * [INPUT]: 场景独立 Electron 主进程。
 * [OUTPUT]: 仅替换系统通知外发端的可控提交函数、失败和点击事件；主进程/worker/账本/页面仍为实际实现。
 * [POS]: 自动化通知桌面验收支撑，不向真实操作系统发送测试提醒。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ElectronApplication } from '@playwright/test'
export async function captureAutomationNotifications(app: ElectronApplication) {
  await app.evaluate(({ Notification }) => {
    const notices: InstanceType<typeof Notification>[] = []
    Notification.isSupported = () => true
    Notification.prototype.show = function () { notices.push(this) }
    Object.assign(globalThis, { boaiNotificationFixture: notices })
  })
}
export function notificationCount(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as unknown as { boaiNotificationFixture: unknown[] }).boaiNotificationFixture.length)
}
export async function notificationEvent(app: ElectronApplication, index: number, event: 'click' | 'failed') {
  await app.evaluate((_electron, { index, event }) => {
    const notice = (globalThis as unknown as { boaiNotificationFixture: { emit(event: string, ...args: unknown[]): void }[] }).boaiNotificationFixture[index]
    if (!notice) throw new Error('Notification not submitted')
    notice.emit(event, {}, '系统提交被测试端拒绝')
  }, { index, event })
}

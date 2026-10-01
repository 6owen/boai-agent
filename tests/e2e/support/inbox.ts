/*
 * [INPUT]: 场景独立 Desktop、实际问答/工具协议、原主进程处理器与真实 SQLite。
 * [OUTPUT]: D5 原问题、原 Work/预算及提交后丢回复的留证；不替代模型工具、业务事务或权威来源。
 * [POS]: 全局待处理 Electron 支撑；每个场景沿原目录重启且不使用商业模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { join } from 'node:path'
import type { Desktop } from './desktop'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { Message, WorkItem, WorkBudget } from '../../../src/shared/domain'
import type { InboxItem, InboxQuestionReply } from '../../../src/shared/domain/inbox'
import type { ArtifactAcceptance } from '../../../src/shared/domain/artifacts'

export async function openInbox(runtime: Desktop, kind?: '待补充' | '待批准' | '待验收' | '需处理') {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '待处理', exact: true }).click()
  const view = runtime.page.getByRole('main', { name: '待处理事项', exact: true })
  if (kind) await view.getByRole('button', { name: kind, exact: true }).click()
  return view
}
export async function openInboxItem(runtime: Desktop, item: InboxItem) {
  const view = await openInbox(runtime)
  await view.locator(`button[data-inbox-id="${item.id}"]`).click()
  return runtime.page.locator(`div.detail-section[data-inbox-id="${item.id}"]:visible`)
}
export async function inboxRecords(dataPath: string) {
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  try { return { messages: await store.load<Message>('messages'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), acceptances: await store.load<ArtifactAcceptance>('artifactAcceptances'), events: await store.load('artifactAdoptionEvents') } }
  finally { await store.close() }
}
interface ReplyFault { submissions: InboxQuestionReply[]; lookups: string[]; unavailable: boolean }
type Globals = typeof globalThis & { __boaiInboxReplyFault: ReplyFault }
/** The actual production message/question/work transaction commits before transport fails. */
export async function loseInboxReply(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state: ReplyFault = { submissions: [], lookups: [], unavailable: true }; Object.assign(globalThis, { __boaiInboxReplyFault: state })
    let dropped = false
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'replyInboxQuestion') state.submissions.push(structuredClone(payload.input))
      if (payload.method === 'getMessageReceipt') state.lookups.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === 'replyInboxQuestion' && !dropped) { dropped = true; throw new Error('验收：补充已提交但回复丢失') }
      if (payload.method === 'getMessageReceipt' && state.unavailable) throw new Error('验收：原补充回执暂不可读')
      return result
    })
  })
  return { inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as Globals).__boaiInboxReplyFault)) }
}

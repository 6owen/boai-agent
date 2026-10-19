/*
 * [INPUT]: 隔离Electron原IPC与知识资料真实提交结果。
 * [OUTPUT]: 仅丢失首次保存的应答并阻断原回执查询，记录真实操作身份；重启恢复原宿主，不替代知识业务。
 * [POS]: 知识资料未知回执桌面故障支撑。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import type { Desktop } from './desktop'

interface State { saves: string[]; lookups: string[]; resourceId?: string; lostReplies: number }
type Globals = typeof globalThis & { __boaiKnowledgeReplyFault: State }
export async function knowledgeReplyFault(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    const state: State = { saves: [], lookups: [], lostReplies: 0 }
    Object.assign(globalThis, { __boaiKnowledgeReplyFault: state })
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'getEmployeeKnowledgeReceipt') { state.lookups.push(payload.input.requestId); throw new Error('验收故障：回执暂时无法查询') }
      if (payload.method === 'saveEmployeeKnowledge') state.saves.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === 'saveEmployeeKnowledge' && !state.lostReplies) {
        state.resourceId = (result as { resourceId: string }).resourceId; state.lostReplies++
        throw new Error('验收故障：知识资料已提交但应答丢失')
      }
      return result
    })
  })
}
export function knowledgeReplyState(runtime: Desktop) { return runtime.app.evaluate(() => structuredClone((globalThis as Globals).__boaiKnowledgeReplyFault)) }

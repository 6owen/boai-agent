/*
 * [INPUT]: 真实Electron IPC与显式待延迟的查询方法。
 * [OUTPUT]: 统计真实请求开始/完成或延迟实际回复，验证隐藏停读、稳定阅读与迟到来源；不替代业务读取/提交。
 * [POS]: 工作视图BDD传输支撑，所有原件/工作仍由生产链创建。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import type { Desktop } from './desktop'
interface Observation { calls: string[]; completed: string[]; delayed: boolean; release?: () => void }
type Globals = typeof globalThis & { __boaiWorkViewObservation: Observation }
export async function observeWorkViews(runtime: Desktop, delayedMethod?: string) {
  await runtime.app.evaluate(({ ipcMain }, delayedMethod) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    const state: Observation = { calls: [], completed: [], delayed: false }; Object.assign(globalThis, { __boaiWorkViewObservation: state })
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      state.calls.push(payload.method)
      const result = await original(event, payload)
      if (payload.method === delayedMethod && !state.delayed) {
        state.delayed = true
        await new Promise<void>(resolve => { state.release = resolve })
      }
      state.completed.push(payload.method)
      return result
    })
  }, delayedMethod)
  return {
    inspect: () => runtime.app.evaluate(() => { const state = (globalThis as Globals).__boaiWorkViewObservation; return { calls: [...state.calls], completed: [...state.completed], delayed: state.delayed } }),
    release: () => runtime.app.evaluate(() => { (globalThis as Globals).__boaiWorkViewObservation.release?.() }),
  }
}

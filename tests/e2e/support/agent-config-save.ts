/*
 * [INPUT]: 本场Electron原IPC员工保存接口及明确故障位置。
 * [OUTPUT]: 仅在受理前或实际提交后丢失保存答复，记录原请求版本和业务入口；原宿主保存与业务不替换。
 * [POS]: 本机配置与旧ACP迁移共用的保存答复故障支撑。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import type { Desktop } from './desktop'

export type SaveProbe = typeof globalThis & { __bottomSave: { mode: 'normal' | 'before' | 'after'; calls: { method: string; admitted: boolean; expectedConfigVersion?: number }[]; dispose(): void } }

export async function installSaveProbe(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<any>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state = { mode: 'normal' as 'normal' | 'before' | 'after', calls: [] as { method: string; admitted: boolean; expectedConfigVersion?: number }[], dispose: () => { ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original) } }
    Object.assign(globalThis, { __bottomSave: state })
    ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => {
      if (['sendMessage', 'sendExternalTask', 'replyInboxQuestion', 'reviseArtifact', 'createConversation', 'startCoreConversation', 'testLaunchProfile', 'saveLaunchProfile'].includes(payload.method)) state.calls.push({ method: payload.method, admitted: true })
      if (payload.method !== 'saveAgent') return original(event, payload)
      const mode = state.mode; state.mode = 'normal'
      state.calls.push({ method: payload.method, admitted: mode !== 'before', expectedConfigVersion: payload.input.expectedConfigVersion })
      if (mode === 'before') throw new Error('验收：员工保存答复未返回')
      const result = await original(event, payload)
      if (mode === 'after') throw new Error('验收：员工保存答复未返回')
      return result
    })
  })
}

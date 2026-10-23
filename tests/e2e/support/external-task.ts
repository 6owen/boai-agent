/*
 * [INPUT]: 隔离桌面、仓库离线ACP进程和真实主进程IPC。
 * [OUTPUT]: 外部员工配置及仅在宿主受理后丢回复、阻断只读回执的故障注入，首次快照失败注入；不替换任务或事务。
 * [POS]: 外部发送跨重启/取消的BDD支撑。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { resolve } from 'node:path'
import type { Desktop } from './desktop'
import type { Methods } from '../../../src/shared/ipc'
type Fault = { sends: Methods['sendExternalTask']['input'][]; lookups: number; lost: number }
export async function prepareExternalTask(runtime: Desktop) {
  await runtime.start()
  const conversation = await runtime.page.evaluate(async ({ executable, fixture }) => {
    const profile = await window.boai.request('saveLaunchProfile', { name: '回执测试ACP', executable, args: [fixture], useExistingLogin: false, hostAccessAcknowledged: true })
    await window.boai.request('testLaunchProfile', { id: profile.id })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'writer')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, executionBackend: { kind: 'acp-local', profileId: profile.id }, connectionId: '', expectedConfigVersion: configVersion })
    return window.boai.request('createConversation', { kind: 'direct', title: '原外部任务', agentIds: [agent.id] })
  }, { executable: process.execPath, fixture: resolve('tests/fixtures/acp-agent.mjs') })
  return conversation
}
export async function loseExternalTaskReceipt(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!, state: Fault = { sends: [], lookups: 0, lost: 0 }
    Object.assign(globalThis, { externalTaskFault: state })
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'sendExternalTask') state.sends.push(structuredClone(payload.input))
      if (payload.method === 'getExternalTaskReceipt') { state.lookups++; throw new Error('验收：原外部回执暂不可读') }
      const result = await original(event, payload)
      if (payload.method === 'sendExternalTask' && state.lost === 0) { state.lost++; throw new Error('验收：外部任务已经受理但回复丢失') }
      return result
    })
  })
  return () => runtime.app.evaluate(() => structuredClone((globalThis as typeof globalThis & { externalTaskFault: Fault }).externalTaskFault))
}

export async function failExternalTaskStartupSnapshot(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'snapshot') throw new Error('验收：启动快照暂不可读')
      return original(event, payload)
    })
  })
  await runtime.page.reload()
}

/*
 * [INPUT]: 场景独立 Desktop、真实持久目录和浏览器窗口。
 * [OUTPUT]: 核心首发真实受理后的回复丢失/查询不可读与请求身份观测；缺失默认模型的旧记录、独立存储竞争、生成进程中断、已发布员工/群移除及文件冲突准备和真实创建耗时记录。
 * [POS]: 团队创建 BDD 故障支撑；生产 UI 不提供故障入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Desktop } from './desktop'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { TeamRepository } from '../../../src/runtime/modules/teams/team-repository'
import type { TeamDraft } from '../../../src/shared/domain/team-creation'
import type { TestInfo } from '@playwright/test'
import type { Connection } from '../../../src/shared/domain'
import type { Methods } from '../../../src/shared/ipc'

type CoreStartInput = Methods['startCoreConversation']['input']
interface CoreReplyState { starts: CoreStartInput[]; lookups: string[]; committedIds: string[]; lostStarts: number; unavailableLookups: number; lookupUnavailable: boolean }
type CoreReplyGlobal = typeof globalThis & { __boaiCoreReplyFault: CoreReplyState }

/** Preserve production IPC and transactions; fault only replies after the real handler returns. */
export async function coreReplyFault(runtime: Desktop, options: { loseStartReply?: boolean; lookupUnavailable?: boolean } = {}) {
  await runtime.app.evaluate(({ ipcMain }, options) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    const state: CoreReplyState = { starts: [], lookups: [], committedIds: [], lostStarts: 0, unavailableLookups: 0, lookupUnavailable: options.lookupUnavailable ?? false }
    Object.assign(globalThis, { __boaiCoreReplyFault: state })
    let loseStart = options.loseStartReply !== false
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'startCoreConversation') state.starts.push(structuredClone(payload.input))
      if (payload.method === 'getCoreConversationStart') state.lookups.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === 'startCoreConversation') {
        state.committedIds.push((result as { id: string }).id)
        if (loseStart) { loseStart = false; state.lostStarts++; throw new Error('验收：首发已受理，但回复丢失') }
      }
      if (payload.method === 'getCoreConversationStart' && state.lookupUnavailable) {
        state.unavailableLookups++; throw new Error('验收：首发回执暂不可读')
      }
      return result
    })
  }, options)
  return {
    inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as CoreReplyGlobal).__boaiCoreReplyFault)),
    allowLookup: () => runtime.app.evaluate(() => { (globalThis as CoreReplyGlobal).__boaiCoreReplyFault.lookupUnavailable = false }),
  }
}

export async function coreStartReceipts(runtime: Desktop) {
  const store = new ProductStore(join(runtime.root, 'v2', 'boai.sqlite')); await store.init()
  try { return await store.load<{ id: string; conversationId: string; fingerprint: string; cleared?: boolean }>('coreConversationStarts') } finally { await store.close() }
}

export async function saveCompetingTeamDraft(runtime: Desktop, draft: TeamDraft) {
  // The product has a single-instance/main-window guard. Exercise an independent
  // storage writer without weakening that production boundary to open a test window.
  const store = new ProductStore(join(runtime.root, 'v2', 'boai.sqlite')); await store.init()
  try { await new TeamRepository(store).save({ draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '另一编辑者的已保存需求', selectedConnectionId: draft.selectedConnectionId, selectedModelId: '', createGroup: true, groupTitle: '' } }) } finally { await store.close() }
}
export async function interruptTeamRuntime(runtime: Desktop) {
  await runtime.app.evaluate(({ app }) => {
    const worker = app.getAppMetrics().find(value => value.name === 'BoAI Agent Runtime')
    if (!worker || worker.type !== 'Utility') throw new Error('本场景 runtime 不存在')
    process.kill(worker.pid, 'SIGKILL')
  })
}
export async function modifyPreparedFile(runtime: Desktop, agentId: string) {
  const path = join(runtime.root, 'v2', 'agents', agentId, 'workspace', 'AGENTS.md'), original = await readFile(path, 'utf8')
  await writeFile(path, '用户外部修改，不得覆盖')
  return async () => { await writeFile(path, original) }
}
export async function removePublishedMember(runtime: Desktop, id: string) {
  await removePublishedObject(runtime, 'agents', id)
}
export async function removePublishedGroup(runtime: Desktop, id: string) {
  await removePublishedObject(runtime, 'conversations', id)
}
async function removePublishedObject(runtime: Desktop, collection: 'agents' | 'conversations', id: string) {
  await runtime.close()
  const store = new ProductStore(join(runtime.root, 'v2', 'boai.sqlite')); await store.init()
  try { await store.write([], [{ collection, id }]) } finally { await store.close() }
  await runtime.start()
}
export async function clearTeamDefaultModel(runtime: Desktop, connectionId: string) {
  await runtime.close()
  const store = new ProductStore(join(runtime.root, 'v2', 'boai.sqlite')); await store.init()
  try {
    const connection = (await store.load<Connection>('connections')).find(value => value.id === connectionId)
    if (!connection) throw new Error('本场景连接不存在')
    await store.write([{ collection: 'connections', id: connection.id, value: { ...connection, defaultModel: '' } }])
  } finally { await store.close() }
  await runtime.start()
}
export async function recordTeamDemo(runtime: Desktop, info: TestInfo) {
  const value = await runtime.page.evaluate(async () => {
    const recovery = await window.boai.request('listTeamCreationRecovery', undefined)
    const operation = recovery.operations.find(value => value.status === 'committed')!
    const view = await window.boai.request('getTeamDraft', { draftId: operation.draftId })
    return { kind: 'offline-protocol-demo', operationId: operation.id, memberIds: operation.memberIds, conversationId: operation.conversationId, createdAt: operation.createdAt, committedAt: operation.committedAt, creationDurationMs: Date.parse(operation.committedAt!) - Date.parse(operation.createdAt), generation: view.generation, userEdits: { firstRole: view.draft.plan?.members[0].role, groupTitle: view.draft.groupTitle } }
  })
  await writeFile(info.outputPath('team-demo.json'), JSON.stringify(value, null, 2))
}

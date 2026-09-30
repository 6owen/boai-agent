/*
 * [INPUT]: 场景独立 Desktop、真实持久目录和浏览器窗口。
 * [OUTPUT]: 缺失默认模型的旧记录、独立存储竞争、生成进程中断、已发布员工/群移除及文件冲突准备和真实创建耗时记录。
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

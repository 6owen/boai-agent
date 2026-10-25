/*
 * [INPUT]: 可终止子进程、真实 AppService/SQLite/文件断点与同数据目录重启。
 * [OUTPUT]: 部分写入/rename/提交前后 SIGKILL 不发布半套员工或分类，不自动续行，原 ID 明确恢复且分类不重复。
 * [POS]: T1.3 原生进程中断验收，覆盖异常模拟之外的持久事实。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { interruptTeamCreation } from './fixtures/team-crash'
import { AppService } from '../packages/runtime/src/service'
import type { Snapshot } from '../packages/shared/src/domain'
import type { TeamCreationOperation } from '../packages/shared/src/domain/team-creation'
import type { ContactListPreferences } from '../packages/shared/src/domain/contact-list'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })

test.each(['before-write', 'after-move', 'before-commit', 'after-commit'])('real SIGKILL at %s preserves publication boundary and permits explicit recovery', async phase => {
  const root = await mkdtemp(join(tmpdir(), 'boai-team-crash-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const stopped = await interruptTeamCreation(root, phase)
  let calls = 0
  const service = new AppService({ dataPath: root, teamPlanner: async () => { calls++; throw new Error('no replay') }, engine: { run: async () => { calls++ }, test: async () => '' }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init(); cleanup.push(() => service.close())
  const operation = await service.handle('getTeamCreation', { operationId: stopped.operationId }) as TeamCreationOperation
  expect(operation.memberIds).toEqual(stopped.memberIds)
  const snapshot = await service.handle('snapshot', undefined) as Snapshot
  const committed = phase === 'after-commit'
  expect(operation.status).toBe(committed ? 'committed' : 'interrupted')
  expect(snapshot.agents.filter(agent => agent.creationSource?.operationId === operation.id)).toHaveLength(committed ? 4 : 0)
  expect(snapshot.conversations).toHaveLength(committed ? 1 : 0)
  const contacts = await service.handle('getContactList', undefined) as ContactListPreferences
  expect(contacts.categories).toHaveLength(committed ? 1 : 0)
  expect(Object.keys(contacts.categoryByAgentId)).toHaveLength(committed ? 4 : 0)
  const before = await readdir(join(root, 'agents'))
  await service.handle('getTeamCreation', { operationId: operation.id }); await service.handle('listTeamCreationRecovery', undefined)
  expect(await readdir(join(root, 'agents'))).toEqual(before); expect(calls).toBe(0)
  if (!committed) {
    await service.handle('resumeTeamCreation', { operationId: operation.id, expectedVersion: operation.version })
    await vi.waitFor(async () => expect((await service.handle('getTeamCreation', { operationId: operation.id }) as TeamCreationOperation).status).toBe('committed'), { timeout: 5000 })
  }
  const result = await service.handle('snapshot', undefined) as Snapshot
  expect(result.agents.filter(agent => agent.creationSource?.operationId === operation.id).map(agent => agent.id)).toEqual(stopped.memberIds.map(member => member.agentId))
  expect(result.conversations).toHaveLength(1); expect(calls).toBe(0)
  const finalContacts = await service.handle('getContactList', undefined) as ContactListPreferences
  expect(finalContacts.categories).toHaveLength(1)
  expect(finalContacts.categories[0].id).toBe(operation.id)
  expect(finalContacts.categoryByAgentId).toEqual(Object.fromEntries(stopped.memberIds.map(member => [member.agentId, operation.id])))
  expect(finalContacts.revision).toBe(1)
})

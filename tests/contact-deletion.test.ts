/*
 * [INPUT]: 真实 SQLite 员工删除用例及隔离受管/外部文件目录。
 * [OUTPUT]: 整分类员工/记忆/专属资源原子删除、共享群历史保留、版本/成员变化拒绝、符号链接边界和本地清理日志重启恢复验证。
 * [POS]: tests/contact-deletion.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DigitalAgent } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ContactDeletionService } from '../src/runtime/modules/employees/contact-deletion'
import { ConversationHistory } from '../src/runtime/modules/conversations/history'

const fixtures: { root: string; store: ProductStore }[] = []
const row = (collection: string, id: string, value: object) => ({ collection, id, value: { id, ...value } })
const agent = (id: string): DigitalAgent => ({ id, name: id, role: '成员', instructions: '工作', color: '#638ac5', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-contact-delete-')), store = new ProductStore(join(root, 'boai.sqlite'))
  fixtures.push({ root, store }); await store.init()
  await store.write([
    row('agents', 'a', agent('a')), row('agents', 'b', agent('b')), row('agents', 'c', agent('c')),
    row('contactList', 'contacts', { revision: 4, categories: [{ id: 'team', name: '团队' }, { id: 'other', name: '保留' }], categoryByAgentId: { a: 'team', b: 'team', c: 'other' }, agentOrder: ['a', 'c', 'b'], groupOrder: ['group'] }),
  ])
  return { root, store, deletion: new ContactDeletionService(store, root) }
}
afterEach(async () => { vi.restoreAllMocks(); for (const { root, store } of fixtures.splice(0)) { await store.close(); await rm(root, { recursive: true, force: true }) } })

it('deletes the entire category and private employee data while keeping group history and shared files', async () => {
  const { root, store, deletion } = await setup()
  const ownedPath = join(root, 'agents/a/workspace/skills/private-skill')
  for (const path of [ownedPath, join(root, 'agents/b/workspace'), join(root, 'external-workspaces/a/session'), join(root, 'agents/c/workspace'), join(root, 'skills/shared')]) {
    await mkdir(path, { recursive: true }); await writeFile(join(path, 'file.txt'), 'data')
  }
  const group = { id: 'group', title: '保留群', kind: 'group', agentIds: ['a', 'c'], sharedKnowledgeIds: [], mode: 'natural', configVersion: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  const message = { id: 'message', conversationId: 'group', senderId: 'a', senderName: '原员工', content: '保留群聊记录' }
  await store.write([
    row('conversations', 'group', group), row('messages', 'message', message),
    row('agents', 'c', { ...agent('c'), skillIds: ['private-skill', 'shared'] }),
    row('resources', 'private-skill', { ownerAgentId: 'a', kind: 'skill', name: 'private-skill', path: ownedPath }), row('resources', 'shared', { kind: 'skill', name: 'shared', path: join(root, 'skills/shared') }),
    row('skillCollections', 'library', { revision: 2, favoriteResourceIds: ['private-skill', 'shared'], groups: [], groupByResourceId: {} }),
    row('skillInstallations', 'private-skill', { resourceId: 'private-skill' }), row('skillUpdateChecks', 'private-skill', { resourceId: 'private-skill' }),
    row('skillOperations', 'operation', { ownerAgentId: 'a' }),
    ...['memory', 'memoryObservations', 'memoryForgets'].flatMap(collection => [row(collection, 'remove', { ownerAgentId: 'a' }), row(collection, 'keep', { ownerAgentId: 'c' })]),
    row('memoryEpochs', 'employee:a', { epoch: 2 }), row('memoryEpochs', 'employee:a:profile', { epoch: 1 }), row('memoryEpochs', 'employee:c', { epoch: 5 }),
    row('memoryReceipts', 'a:request', { fingerprint: 'private' }), row('memoryReceipts', 'c:request', { fingerprint: 'keep' }), row('memoryCleanup', 'a', {}),
    row('profileModelCalls', 'old-call', { agentId: 'a', conversationId: 'group' }),
  ])
  const result = await deletion.delete({ agentIds: ['a', 'b'], category: { id: 'team', expectedRevision: 4 } })
  expect(result.preferences).toEqual({ id: 'contacts', revision: 5, categories: [{ id: 'other', name: '保留' }], categoryByAgentId: { c: 'other' }, agentOrder: ['c'], groupOrder: ['group'] })
  expect(await store.load('agents')).toEqual([{ ...agent('c'), configVersion: 2, skillIds: ['shared'] }])
  expect(await store.load('resources')).toEqual([expect.objectContaining({ id: 'shared' })])
  expect(await store.load('skillCollections')).toEqual([expect.objectContaining({ favoriteResourceIds: ['shared'] })])
  for (const collection of ['memory', 'memoryObservations', 'memoryForgets']) expect(await store.load(collection)).toEqual([{ id: 'keep', ownerAgentId: 'c' }])
  expect(await store.load('memoryEpochs')).toEqual([{ id: 'employee:c', epoch: 5 }])
  expect(await store.load('memoryReceipts')).toEqual([{ id: 'c:request', fingerprint: 'keep' }])
  for (const collection of ['memoryCleanup', 'skillInstallations', 'skillUpdateChecks', 'skillOperations', 'contactDeletions', 'profileModelCalls']) expect(await store.load(collection)).toEqual([])
  expect(await store.load('conversations')).toEqual([{ ...group, agentIds: ['c'], configVersion: 3, updatedAt: expect.any(String) }]); expect(await store.load('messages')).toEqual([message])
  for (const path of [join(root, 'agents/a/workspace/skills/private-skill/file.txt'), join(root, 'agents/b/workspace/file.txt'), join(root, 'external-workspaces/a/session/file.txt')]) await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(root, 'agents/c/workspace/file.txt'), 'utf8')).toBe('data')
  expect(await readFile(join(root, 'skills/shared/file.txt'), 'utf8')).toBe('data')
})

it('rejects stale category versions and incomplete category membership without deleting any employee', async () => {
  const { store, deletion } = await setup()
  await expect(deletion.delete({ agentIds: ['a', 'b'], category: { id: 'team', expectedRevision: 3 } })).rejects.toThrow('其他窗口')
  await expect(deletion.delete({ agentIds: ['a'], category: { id: 'team', expectedRevision: 4 } })).rejects.toThrow('分类成员')
  expect(await store.load('agents')).toHaveLength(3)
  expect(await store.load('contactDeletions')).toEqual([])
})

it('rolls back employee and group changes if an uncleared direct conversation remains', async () => {
  const { store, deletion } = await setup()
  const shared = { id: 'group', title: '群', kind: 'group', agentIds: ['a', 'c'], sharedKnowledgeIds: [], mode: 'natural', configVersion: 2 }
  await store.write([row('conversations', 'group', shared), row('conversations', 'direct', { kind: 'direct', agentIds: ['a'], sharedKnowledgeIds: [] }), row('memory', 'private', { ownerAgentId: 'a' })])
  await expect(deletion.delete({ agentIds: ['a'] })).rejects.toThrow('先清理员工单聊和空群')
  expect(await store.load('agents')).toHaveLength(3)
  expect(await store.load('memory')).toEqual([{ id: 'private', ownerAgentId: 'a' }])
  expect((await store.load<{ id: string }>('conversations')).find(item => item.id === 'group')).toEqual(shared)
  expect(await store.load('contactDeletions')).toEqual([])
})

it('rejects a linked employee directory before deleting records or following external files', async () => {
  const { root, store, deletion } = await setup()
  const outside = join(root, 'outside')
  await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'keep')
  await mkdir(join(root, 'agents')); await symlink(outside, join(root, 'agents/a'))
  await expect(deletion.delete({ agentIds: ['a'] })).rejects.toThrow('符号链接')
  expect(await store.load('agents')).toHaveLength(3)
  expect(await store.load('contactDeletions')).toEqual([])
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('keep')
})

it('recovers only local cleanup after a committed deletion loses its final cleanup receipt', async () => {
  const { root, store, deletion } = await setup()
  await mkdir(join(root, 'agents/a/workspace'), { recursive: true }); await writeFile(join(root, 'agents/a/workspace/private.txt'), 'remove')
  const write = store.write.bind(store)
  vi.spyOn(store, 'write').mockImplementationOnce(async (records, removals) => {
    if (removals?.some(item => item.collection === 'contactDeletions')) throw new Error('模拟清理回执失联')
    return write(records, removals)
  })
  await expect(deletion.delete({ agentIds: ['a'] })).rejects.toThrow('工作区清理未完成')
  expect((await store.load<DigitalAgent>('agents')).map(agent => agent.id)).toEqual(['b', 'c'])
  expect(await store.load('contactDeletions')).toEqual([expect.objectContaining({ agentIds: ['a'], status: 'failed' })])
  await new ContactDeletionService(store, root).recover()
  expect(await store.load('contactDeletions')).toEqual([])
  await expect(readFile(join(root, 'agents/a/workspace/private.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await store.load<DigitalAgent>('agents')).map(agent => agent.id)).toEqual(['b', 'c'])
})

it('dissolves a group without recreating its workspace and resumes a pending dissolution after restart', async () => {
  const { root, store } = await setup()
  const conversation = { id: 'group', title: '解散群', kind: 'group' as const, agentIds: ['a'], mode: 'natural' as const, sharedKnowledgeIds: [], workspacePath: join(root, 'workspaces/group'), createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  await mkdir(conversation.workspacePath, { recursive: true }); await writeFile(join(conversation.workspacePath, 'private.txt'), 'remove')
  await store.write([row('conversations', 'group', conversation), row('messages', 'old', { conversationId: 'group', content: 'remove' }), row('conversationCleanup', 'group', { hide: false, remove: true })])
  await new ConversationHistory(store, root).recover()
  expect(await store.load('conversations')).toEqual([]); expect(await store.load('messages')).toEqual([])
  expect(await store.load('contactList')).toEqual([expect.objectContaining({ revision: 5, groupOrder: [] })])
  expect(await store.load('conversationCleanup')).toEqual([])
  await expect(readFile(join(conversation.workspacePath, 'private.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(conversation.workspacePath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await store.load('agents')).toHaveLength(3)
})

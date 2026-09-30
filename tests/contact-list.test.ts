/*
 * [INPUT]: 真实 AppService/SQLite 与隔离通讯录数据。
 * [OUTPUT]: 分类前后落点排序/重启恢复且不改成员归属；非法分类落点和过期排序不覆盖偏好；跨类型/分类拒绝、搜索落点保留完整顺序和配置隔离验证。
 * [POS]: 通讯录持久偏好模块回归；不启动 Electron 或执行模型请求。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { Method, Methods } from '../src/shared/ipc'
import { sortedContacts, type ContactListAction } from '../src/shared/domain/contact-list'

const roots: string[] = [], services = new Set<AppService>()
afterEach(async () => {
  for (const service of services) await service.close()
  services.clear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function setup() {
  const dataPath = await mkdtemp(join(tmpdir(), 'boai-contacts-')); roots.push(dataPath)
  const start = async () => {
    const service = new AppService({ dataPath, engine: { run: async () => {}, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    services.add(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    const change = async (action: ContactListAction) => api('updateContactList', { expectedRevision: (await api('getContactList', undefined)).revision, action })
    const close = async () => { await service.close(); services.delete(service) }
    return { api, change, close }
  }
  return { start, ...await start() }
}

test('employee classification survives restart without changing employee configuration; deleting a category only ungroups', async () => {
  const { api, change, close, start } = await setup()
  const original = (await api('snapshot', undefined)).agents
  const created = await change({ kind: 'create-category', name: '  内容团队  ' }), categoryId = created.categories[0].id
  expect(created.categories[0].name).toBe('内容团队')
  await change({ kind: 'assign-category', agentId: original[0].id, categoryId })
  await change({ kind: 'rename-category', categoryId, name: '创作伙伴' })
  await close()
  const restarted = await start(), saved = await restarted.api('getContactList', undefined)
  expect(saved.categories).toEqual([{ id: categoryId, name: '创作伙伴' }])
  expect(saved.categoryByAgentId[original[0].id]).toBe(categoryId)
  const deleted = await restarted.change({ kind: 'delete-category', categoryId })
  expect(deleted.categories).toEqual([])
  expect(deleted.categoryByAgentId).toEqual({})
  expect((await restarted.api('snapshot', undefined)).agents).toEqual(original)
})

test('group ordering uses the complete list and persists independently of conversation order', async () => {
  const { api, change, close, start } = await setup()
  const agents = (await api('snapshot', undefined)).agents.slice(0, 2).map(agent => agent.id)
  const groups = []
  for (const title of ['A', 'B', 'C', 'D']) groups.push(await api('createConversation', { kind: 'group', title, agentIds: agents }))
  const before = (await api('snapshot', undefined)).conversations
  // The renderer may show only B and D after a search; A and C must not be lost or reordered.
  const moved = await change({ kind: 'move', itemKind: 'group', id: groups[3].id, targetId: groups[1].id, placement: 'after' })
  expect(sortedContacts(groups, moved.groupOrder, group => group.title).map(group => group.title)).toEqual(['A', 'B', 'D', 'C'])
  expect((await api('snapshot', undefined)).conversations).toEqual(before)
  await close()
  expect((await (await start()).api('getContactList', undefined)).groupOrder).toEqual(moved.groupOrder)
})

test('category sorting preserves hidden categories, employee membership and configuration across restart', async () => {
  const { api, change, close, start } = await setup()
  const original = await api('snapshot', undefined)
  for (const name of ['A', 'B', 'C', 'D']) await change({ kind: 'create-category', name })
  const categories = (await api('getContactList', undefined)).categories
  await change({ kind: 'assign-category', agentId: original.agents[0].id, categoryId: categories[3].id })
  const before = await api('getContactList', undefined)
  // A and C may be hidden by search; moving D after B must preserve the complete list.
  const moved = await change({ kind: 'move-category', categoryId: categories[3].id, targetId: categories[1].id, placement: 'after' })
  expect(moved.categories.map(category => category.name)).toEqual(['A', 'B', 'D', 'C'])
  expect(moved.categoryByAgentId).toEqual(before.categoryByAgentId)
  expect(moved.agentOrder).toEqual(before.agentOrder)
  expect(moved.groupOrder).toEqual(before.groupOrder)
  const movedBefore = await change({ kind: 'move-category', categoryId: categories[2].id, targetId: categories[0].id, placement: 'before' })
  expect(movedBefore.categories.map(category => category.name)).toEqual(['C', 'A', 'B', 'D'])
  expect((await api('snapshot', undefined)).agents).toEqual(original.agents)
  expect((await api('snapshot', undefined)).conversations).toEqual(original.conversations)
  await close()
  expect(await (await start()).api('getContactList', undefined)).toEqual(movedBefore)
})

test('invalid category drop targets and stale category moves leave the saved arrangement intact', async () => {
  const { api, change } = await setup()
  await change({ kind: 'create-category', name: '设计' })
  const before = await change({ kind: 'create-category', name: '研究' })
  const [first, second] = before.categories
  await expect(change({ kind: 'move-category', categoryId: 'missing', targetId: first.id, placement: 'before' })).rejects.toThrow('分类不存在')
  await expect(change({ kind: 'move-category', categoryId: first.id, targetId: 'missing', placement: 'after' })).rejects.toThrow('分类不存在')
  expect(await api('getContactList', undefined)).toEqual(before)
  const moved = await change({ kind: 'move-category', categoryId: second.id, targetId: first.id, placement: 'before' })
  await expect(api('updateContactList', { expectedRevision: before.revision, action: { kind: 'move-category', categoryId: second.id, targetId: first.id, placement: 'after' } })).rejects.toThrow('其他窗口')
  expect(await api('getContactList', undefined)).toEqual(moved)
})

test('dragging cannot cross employee categories or employee/group boundaries; explicit assignment can', async () => {
  const { api, change } = await setup()
  const agents = (await api('snapshot', undefined)).agents
  const categoryId = (await change({ kind: 'create-category', name: '写作' })).categories[0].id
  await change({ kind: 'assign-category', agentId: agents[0].id, categoryId })
  const before = await api('getContactList', undefined)
  await expect(change({ kind: 'move', itemKind: 'agent', id: agents[0].id, targetId: agents[1].id, placement: 'before' })).rejects.toThrow('同一员工分类')
  const group = await api('createConversation', { kind: 'group', title: '讨论', agentIds: agents.slice(0, 2).map(agent => agent.id) })
  await expect(change({ kind: 'move', itemKind: 'group', id: group.id, targetId: agents[0].id, placement: 'before' })).rejects.toThrow('同一类型')
  await expect(change({ kind: 'assign-category', agentId: group.id, categoryId })).rejects.toThrow('员工不存在')
  expect(await api('getContactList', undefined)).toEqual(before)
  await change({ kind: 'assign-category', agentId: agents[1].id, categoryId })
  const moved = await change({ kind: 'move', itemKind: 'agent', id: agents[1].id, targetId: agents[0].id, placement: 'before' })
  expect(sortedContacts(agents.filter(agent => moved.categoryByAgentId[agent.id] === categoryId), moved.agentOrder, agent => agent.name).map(agent => agent.id)).toEqual([agents[1].id, agents[0].id])
  const ungrouped = await change({ kind: 'assign-category', agentId: agents[1].id })
  expect(ungrouped.categoryByAgentId[agents[1].id]).toBeUndefined()
})

test('invalid categories and concurrent stale writes cannot overwrite a saved arrangement', async () => {
  const { api, change } = await setup()
  const writes = await Promise.allSettled(['设计', '研究'].map(name => api('updateContactList', { expectedRevision: 0, action: { kind: 'create-category', name } })))
  expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const value = await api('getContactList', undefined)
  expect(value.revision).toBe(1)
  await expect(change({ kind: 'create-category', name: value.categories[0].name })).rejects.toThrow('名称已存在')
  await expect(change({ kind: 'create-category', name: '未分类' })).rejects.toThrow('名称已存在')
  await expect(change({ kind: 'rename-category', categoryId: 'missing', name: '新名称' })).rejects.toThrow('分类不存在')
  await expect(change({ kind: 'create-category', name: '   ' })).rejects.toThrow()
  expect(await api('getContactList', undefined)).toEqual(value)
})

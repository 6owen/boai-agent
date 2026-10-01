/*
 * [INPUT]: 真实 AppService/SQLite 与隔离通讯录数据。
 * [OUTPUT]: 标签提交仅通知通讯录且员工删除仍使关联页面失效，版本冲突不广播；旧分类无损转多标签、原子批量标签/选中员工删除、统一排序和核心/未知身份整批拒绝；标签错误文案及未分类/无标签保留名；员工删除清空全部单聊/记忆/专属文件且保留其他群历史；关联员工新任务聊天/群计划暂停；保留群中的自动化等待随员工删除终结并保留原预算/触发身份；群目录链接失败可修复重试且外部文件保留；空群/明确群解散持久删除；完整多标签成员删除及过期版本拒绝；核心身份和运行/取消待退出保护；标签排序/归属/搜索顺序及重启隔离验证。
 * [POS]: 通讯录真实 AppService/SQLite 集成回归；不启动 Electron 或请求外部模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test } from 'vitest'
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { AgentEngine } from '../src/runtime/contracts'
import type { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { DigitalAgent } from '../src/shared/domain'
import type { AppEvent, Method, Methods } from '../src/shared/ipc'
import { contactTagIds, sortedContacts, type ContactListAction, type ContactListPreferences } from '../src/shared/domain/contact-list'
import { createTeamContactCategory } from '../src/runtime/modules/employees/contact-list'

const roots: string[] = [], services = new Set<AppService>()
afterEach(async () => {
  for (const service of services) await service.close()
  services.clear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function setup(engine: AgentEngine = { run: async () => {}, test: async () => 'ok' }, emit: (event: AppEvent) => void = () => {}) {
  const dataPath = await mkdtemp(join(tmpdir(), 'boai-contacts-')); roots.push(dataPath)
  const start = async () => {
    const service = new AppService({ dataPath, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit })
    services.add(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    const change = async (action: ContactListAction) => api('updateContactList', { expectedRevision: (await api('getContactList', undefined)).revision, action })
    const close = async () => { await service.close(); services.delete(service) }
    const store = (service as unknown as { store: ProductStore }).store
    return { api, change, close, service, store, dataPath }
  }
  return { start, ...await start() }
}

type ContactApi = Awaited<ReturnType<typeof setup>>['api']

test('tag commits update only contacts; employee deletion still invalidates related pages', async () => {
  const events: AppEvent[] = []
  const { api, change } = await setup(undefined, event => events.push(event))
  events.length = 0
  const created = await change({ kind: 'create-category', name: '局部标签' }), categoryId = created.categories[0].id
  await change({ kind: 'rename-category', categoryId, name: '仅更新通讯录' })
  await change({ kind: 'set-agent-tags', agentIds: ['researcher'], tagIds: [categoryId], mode: 'add' })
  await change({ kind: 'set-agent-tags', agentIds: ['researcher'], tagIds: [categoryId], mode: 'remove' })
  await change({ kind: 'delete-category', categoryId })
  expect(events).toEqual(Array.from({ length: 5 }, () => ({ type: 'contact-list:changed' })))
  const current = await api('getContactList', undefined)
  await expect(api('updateContactList', { expectedRevision: current.revision - 1, action: { kind: 'create-category', name: '过期写入' } })).rejects.toThrow('其他窗口')
  expect(events).toHaveLength(5)
  events.length = 0
  await change({ kind: 'delete-agents', agentIds: ['researcher'] })
  expect(events.some(event => event.type === 'changed' && !event.conversationId)).toBe(true)
  expect((await api('snapshot', undefined)).agents.some(agent => agent.id === 'researcher')).toBe(false)
})

const replyEngine = (): AgentEngine => ({
  test: async () => 'ok',
  decide: async context => ({ action: context.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...context.messages.map(message => message.sequence)) }),
  run: async context => { await context.onDelta(`${context.agent.name}保留的聊天回复`) },
})
async function configure(api: ContactApi, agentIds = ['researcher', 'writer', 'reviewer']) {
  const connection = await api('saveConnection', { name: '删除场景模型', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' })
  for (const agent of (await api('snapshot', undefined)).agents.filter(agent => agentIds.includes(agent.id))) {
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, systemRole, creationSource, ...input } = agent
    await api('saveAgent', { ...input, expectedConfigVersion: configVersion, connectionId: connection.id, modelId: 'fixture' })
  }
}
async function until(check: () => Promise<boolean> | boolean) {
  const started = Date.now()
  while (!await check()) {
    if (Date.now() - started > 5000) throw new Error('通讯录删除场景未在限时内结束')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
async function sendAndFinish(api: ContactApi, conversationId: string, requestId: string, mentionIds: string[] = []) {
  const message = await api('sendMessage', { conversationId, content: `应遵循删除范围的历史：${requestId}`, requestId, mentionIds })
  await until(async () => {
    const detail = await api('getConversation', { id: conversationId })
    return Boolean(detail.turns?.length) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'waiting_user', 'interrupted', 'budget_exhausted'].includes(turn.status)) && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  return message
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
  await expect(change({ kind: 'move-category', categoryId: 'missing', targetId: first.id, placement: 'before' })).rejects.toThrow('标签不存在')
  await expect(change({ kind: 'move-category', categoryId: first.id, targetId: 'missing', placement: 'after' })).rejects.toThrow('标签不存在')
  expect(await api('getContactList', undefined)).toEqual(before)
  const moved = await change({ kind: 'move-category', categoryId: second.id, targetId: first.id, placement: 'before' })
  await expect(api('updateContactList', { expectedRevision: before.revision, action: { kind: 'move-category', categoryId: second.id, targetId: first.id, placement: 'after' } })).rejects.toThrow('其他窗口')
  expect(await api('getContactList', undefined)).toEqual(moved)
})

test('all ordinary employees share one order across tags while employee/group identities remain separate', async () => {
  const { api, change } = await setup()
  const agents = (await api('snapshot', undefined)).agents
  const categoryId = (await change({ kind: 'create-category', name: '写作' })).categories[0].id
  await change({ kind: 'assign-category', agentId: agents[0].id, categoryId })
  const before = await api('getContactList', undefined)
  const across = await change({ kind: 'move', itemKind: 'agent', id: agents[0].id, targetId: agents[1].id, placement: 'before' })
  expect(across.categoryByAgentId).toEqual(before.categoryByAgentId)
  expect(contactTagIds(across, agents[0].id)).toEqual([categoryId])
  const group = await api('createConversation', { kind: 'group', title: '讨论', agentIds: agents.slice(0, 2).map(agent => agent.id) })
  await expect(change({ kind: 'move', itemKind: 'group', id: group.id, targetId: agents[0].id, placement: 'before' })).rejects.toThrow('同一类型')
  await expect(change({ kind: 'assign-category', agentId: group.id, categoryId })).rejects.toThrow('员工不存在')
  expect(await api('getContactList', undefined)).toEqual(across)
  await change({ kind: 'assign-category', agentId: agents[1].id, categoryId })
  const moved = await change({ kind: 'move', itemKind: 'agent', id: agents[1].id, targetId: agents[0].id, placement: 'before' })
  expect(sortedContacts(agents.filter(agent => moved.categoryByAgentId[agent.id] === categoryId), moved.agentOrder, agent => agent.name).map(agent => agent.id)).toEqual([agents[1].id, agents[0].id])
  const ungrouped = await change({ kind: 'assign-category', agentId: agents[1].id })
  expect(ungrouped.categoryByAgentId[agents[1].id]).toBeUndefined()
})

test('legacy category identities become multiple tags without changing unselected employees or their configuration', async () => {
  const f = await setup(), { api, change, store } = f
  const original = (await api('snapshot', undefined)).agents
  const legacy: ContactListPreferences = { revision: 7, categories: [{ id: 'old-a', name: '旧研究' }, { id: 'old-b', name: '旧写作' }], categoryByAgentId: { researcher: 'old-a', writer: 'old-b', reviewer: 'old-a' }, agentOrder: ['reviewer', 'writer', 'researcher'], groupOrder: [] }
  await store.write([{ collection: 'contactList', id: 'contacts', value: legacy }])
  expect(contactTagIds(await api('getContactList', undefined), 'researcher')).toEqual(['old-a'])
  const added = await change({ kind: 'set-agent-tags', agentIds: ['researcher', 'researcher', 'writer'], tagIds: ['old-a', 'old-b', 'old-b'], mode: 'add' })
  expect(added.categories).toEqual(legacy.categories)
  expect(contactTagIds(added, 'researcher')).toEqual(['old-a', 'old-b'])
  expect(contactTagIds(added, 'writer')).toEqual(['old-b', 'old-a'])
  expect(contactTagIds(added, 'reviewer')).toEqual(['old-a'])
  expect(added.agentOrder).toEqual(legacy.agentOrder)
  const removed = await change({ kind: 'set-agent-tags', agentIds: ['researcher'], tagIds: ['old-a'], mode: 'remove' })
  expect(contactTagIds(removed, 'researcher')).toEqual(['old-b'])
  expect(contactTagIds(removed, 'writer')).toEqual(['old-b', 'old-a'])
  const replaced = await change({ kind: 'set-agent-tags', agentIds: ['writer'], tagIds: [], mode: 'replace' })
  expect(contactTagIds(replaced, 'writer')).toEqual([])
  expect(replaced.categoryByAgentId.writer).toBeUndefined()
  expect(contactTagIds({ categoryByAgentId: { writer: 'old-a' }, tagIdsByAgentId: { writer: [] } }, 'writer')).toEqual([])
  await f.close()
  const restarted = await f.start(), saved = await restarted.api('getContactList', undefined)
  expect(saved).toEqual(replaced)
  expect((await restarted.api('snapshot', undefined)).agents).toEqual(original)
  const deletedTag = await restarted.change({ kind: 'delete-category', categoryId: 'old-a' })
  expect(contactTagIds(deletedTag, 'reviewer')).toEqual([])
  expect(contactTagIds(deletedTag, 'researcher')).toEqual(['old-b'])
})

test('batch tag changes validate every employee and tag before committing and reject stale confirmations', async () => {
  const { api, change } = await setup()
  const tagId = (await change({ kind: 'create-category', name: '批量标签' })).categories[0].id
  const before = await api('getContactList', undefined), agents = (await api('snapshot', undefined)).agents
  for (const agentIds of [['researcher', 'missing'], ['researcher', 'bobo']]) {
    await expect(change({ kind: 'set-agent-tags', agentIds, tagIds: [tagId], mode: 'add' })).rejects.toThrow()
    expect(await api('getContactList', undefined)).toEqual(before)
  }
  await expect(change({ kind: 'set-agent-tags', agentIds: ['researcher', 'writer'], tagIds: [tagId, 'missing'], mode: 'replace' })).rejects.toThrow('标签不存在')
  await expect(change({ kind: 'set-agent-tags', agentIds: [], tagIds: [tagId], mode: 'add' })).rejects.toThrow()
  await expect(change({ kind: 'move', itemKind: 'agent', id: 'bobo', targetId: 'researcher', placement: 'before' })).rejects.toThrow()
  expect(await api('getContactList', undefined)).toEqual(before)
  const writes = await Promise.allSettled(['researcher', 'writer'].map(agentId => api('updateContactList', { expectedRevision: before.revision, action: { kind: 'set-agent-tags', agentIds: [agentId], tagIds: [tagId], mode: 'add' } })))
  expect(writes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  const saved = await api('getContactList', undefined)
  expect(['researcher', 'writer'].filter(agentId => contactTagIds(saved, agentId).includes(tagId))).toHaveLength(1)
  expect((await api('snapshot', undefined)).agents).toEqual(agents)
})

test('team publication binds a unique tag without replacing members existing tags or the global employee order', async () => {
  const { api, change, store } = await setup()
  const previous = (await change({ kind: 'create-category', name: '研究团队' })).categories[0].id
  await change({ kind: 'set-agent-tags', agentIds: ['researcher', 'reviewer'], tagIds: [previous], mode: 'add' })
  const before = await api('getContactList', undefined)
  await store.transaction(tx => createTeamContactCategory(tx, 'published-team', '研究团队', ['researcher', 'writer']))
  const saved = await api('getContactList', undefined)
  expect(saved.categories).toEqual([...before.categories, { id: 'published-team', name: '研究团队（2）' }])
  expect(contactTagIds(saved, 'researcher')).toEqual([previous, 'published-team'])
  expect(contactTagIds(saved, 'writer')).toEqual(['published-team'])
  expect(contactTagIds(saved, 'reviewer')).toEqual([previous])
  expect(saved.agentOrder).toEqual(before.agentOrder)
  await store.transaction(tx => createTeamContactCategory(tx, 'reserved-team', '无标签', ['writer']))
  expect((await api('getContactList', undefined)).categories.at(-1)).toEqual({ id: 'reserved-team', name: '无标签（2）' })
})

test('selected employee deletion is one validated batch and preserves unselected tags, employees and group history across restart', async () => {
  const f = await setup(), { api, change } = f
  const tagId = (await change({ kind: 'create-category', name: '共同标签' })).categories[0].id
  await change({ kind: 'set-agent-tags', agentIds: ['researcher', 'writer', 'reviewer'], tagIds: [tagId], mode: 'add' })
  const group = await api('createConversation', { kind: 'group', title: '选中员工混合群', agentIds: ['researcher', 'writer', 'reviewer'] })
  const before = await api('snapshot', undefined), preferences = await api('getContactList', undefined)
  for (const agentIds of [['researcher', 'missing'], ['researcher', 'bobo']]) {
    await expect(api('updateContactList', { expectedRevision: preferences.revision, action: { kind: 'delete-agents', agentIds } })).rejects.toThrow()
    expect(await api('snapshot', undefined)).toEqual(before)
    expect(await api('getContactList', undefined)).toEqual(preferences)
  }
  await expect(api('updateContactList', { expectedRevision: preferences.revision - 1, action: { kind: 'delete-agents', agentIds: ['researcher', 'writer'] } })).rejects.toThrow('其他窗口')
  const saved = await api('updateContactList', { expectedRevision: preferences.revision, action: { kind: 'delete-agents', agentIds: ['researcher', 'researcher', 'writer'] } })
  expect(saved.revision).toBe(preferences.revision + 1)
  expect(saved.categories).toEqual(preferences.categories)
  expect(contactTagIds(saved, 'reviewer')).toEqual([tagId])
  expect(contactTagIds(saved, 'researcher')).toEqual([])
  expect(saved.tagIdsByAgentId).not.toHaveProperty('writer')
  expect((await api('snapshot', undefined)).agents.map(agent => agent.id).sort()).toEqual(['bobo', 'reviewer'])
  expect((await api('getConversation', { id: group.id })).conversation.agentIds).toEqual(['reviewer'])
  for (const id of ['researcher', 'writer']) await expect(access(join(f.dataPath, 'agents', id))).rejects.toMatchObject({ code: 'ENOENT' })
  await f.close()
  const restarted = await f.start()
  expect(await restarted.api('getContactList', undefined)).toEqual(saved)
  expect((await restarted.api('snapshot', undefined)).agents.map(agent => agent.id).sort()).toEqual(['bobo', 'reviewer'])
})

test('invalid categories and concurrent stale writes cannot overwrite a saved arrangement', async () => {
  const { api, change } = await setup()
  const writes = await Promise.allSettled(['设计', '研究'].map(name => api('updateContactList', { expectedRevision: 0, action: { kind: 'create-category', name } })))
  expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const value = await api('getContactList', undefined)
  expect(value.revision).toBe(1)
  await expect(change({ kind: 'create-category', name: value.categories[0].name })).rejects.toThrow('标签名称已存在')
  await expect(change({ kind: 'create-category', name: '未分类' })).rejects.toThrow('标签名称已存在')
  await expect(change({ kind: 'create-category', name: ' 无标签 ' })).rejects.toThrow('标签名称已存在')
  await expect(change({ kind: 'rename-category', categoryId: value.categories[0].id, name: '无标签' })).rejects.toThrow('标签名称已存在')
  await expect(change({ kind: 'rename-category', categoryId: 'missing', name: '新名称' })).rejects.toThrow('标签不存在')
  await expect(change({ kind: 'create-category', name: '   ' })).rejects.toThrow()
  expect(await api('getContactList', undefined)).toEqual(value)
})

test('deleting an employee erases hidden and automatic direct chats, owned memories and files while preserving other group history', async () => {
  const f = await setup(replyEngine()), { api, dataPath, store } = f
  await configure(api)
  const source = join(dataPath, 'owned-skill-source')
  await mkdir(source)
  await writeFile(join(source, 'SKILL.md'), '---\nname: deletion-fixture\ndescription: 员工专属删除范围\n---\n只属于该员工的技能正文。')
  const owned = await api('importResource', { kind: 'skill', path: source, ownerAgentId: 'researcher' })
  const sharedSource = join(dataPath, 'shared-source.txt')
  await writeFile(sharedSource, '必须保留的共享知识')
  const shared = await api('importResource', { kind: 'knowledge', path: sharedSource })
  const direct = await api('createConversation', { kind: 'direct', title: '将被删除的隐藏私聊', agentIds: ['researcher'] })
  const directMessage = await sendAndFinish(api, direct.id, 'hidden-history')
  await api('updateConversationList', { id: direct.id, action: 'hide' })
  expect((await api('getConversation', { id: direct.id })).conversation.list?.hidden).toBe(true)
  const group = await api('createConversation', { kind: 'group', title: '保留群历史', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [shared.id] })
  await sendAndFinish(api, group.id, 'group-history', ['researcher', 'writer'])
  const emptyGroup = await api('createConversation', { kind: 'group', title: '删员工后自动解散', agentIds: ['researcher'] })
  await sendAndFinish(api, emptyGroup.id, 'empty-group-history', ['researcher'])
  const beforeGroup = await api('getConversation', { id: group.id })
  expect(beforeGroup.messages.some(message => message.senderId === 'researcher')).toBe(true)
  const plan = await api('saveAutomation', { name: '自动任务私聊', prompt: '留下应删除的自动任务历史', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false })
  const occurrence = await api('runAutomation', { id: plan.id, requestId: 'automatic-history' })
  await until(async () => (await api('listAutomations', undefined)).occurrences.find(item => item.id === occurrence.id)?.status === 'completed')
  expect((await api('getConversation', { id: occurrence.conversationId })).conversation).toMatchObject({ kind: 'direct', purpose: 'automation', agentIds: ['researcher'] })
  for (const query of [
    { agentId: 'researcher', scope: 'profile' as const },
    { agentId: 'researcher', scope: 'conversation' as const, conversationId: direct.id },
  ]) {
    const memory = await api('getMemory', query)
    await api('saveMemory', { ...query, expectedEpoch: memory.epoch, content: '删除员工时必须清空的记忆', ...(query.scope === 'conversation' ? { sourceMessageIds: [directMessage.id] } : {}) })
  }
  await api('saveMemory', { agentId: 'writer', scope: 'profile', expectedEpoch: (await api('getMemory', { agentId: 'writer', scope: 'profile' })).epoch, content: '保留其他员工的记忆' })
  const employeeRoot = join(dataPath, 'agents', 'researcher'), otherRoot = join(dataPath, 'agents', 'writer')
  await writeFile(join(employeeRoot, 'workspace', 'private', 'owned.txt'), '员工的任意工作文件')
  await writeFile(join(otherRoot, 'workspace', 'private', 'keep.txt'), '其他员工的工作文件')
  const external = join(dataPath, 'external-workspaces', 'researcher')
  await mkdir(external, { recursive: true }); await writeFile(join(external, 'external.txt'), '外部任务专属工作区')
  for (const conversation of [direct, emptyGroup, (await api('getConversation', { id: occurrence.conversationId })).conversation]) await writeFile(join(conversation.workspacePath, 'private.txt'), '删除的会话文件')
  await writeFile(join(group.workspacePath, 'keep.txt'), '保留的群工作文件')
  expect((await store.load<{ ownerAgentId?: string }>('memory')).some(memory => memory.ownerAgentId === 'researcher')).toBe(true)

  await api('deleteAgent', { id: 'researcher' })
  const after = await api('snapshot', undefined)
  expect(after.agents.some(agent => agent.id === 'researcher')).toBe(false)
  expect(after.conversations.some(conversation => [direct.id, emptyGroup.id, occurrence.conversationId].includes(conversation.id))).toBe(false)
  const survivingGroup = await api('getConversation', { id: group.id })
  expect(survivingGroup.conversation.agentIds).toEqual(['writer'])
  expect(survivingGroup.messages).toEqual(beforeGroup.messages)
  expect(survivingGroup.runs).toEqual(beforeGroup.runs)
  expect(survivingGroup.conversation.sharedKnowledgeIds).toEqual([shared.id])
  expect(after.resources.some(resource => resource.id === owned.id)).toBe(false)
  expect(after.resources.some(resource => resource.id === shared.id)).toBe(true)
  for (const collection of ['memory', 'memoryObservations', 'memoryForgets', 'profileModelCalls', 'profileSkillActivations', 'profileExecutions']) {
    expect((await store.load<{ ownerAgentId?: string; agentId?: string }>(collection)).some(item => (item.ownerAgentId ?? item.agentId) === 'researcher')).toBe(false)
  }
  for (const collection of ['messages', 'runs', 'requests', 'snapshots', 'artifacts', 'traceSpans']) {
    expect((await store.load<{ conversationId?: string }>(collection)).some(item => [direct.id, emptyGroup.id, occurrence.conversationId].includes(item.conversationId ?? ''))).toBe(false)
  }
  for (const path of [employeeRoot, external, direct.workspacePath, emptyGroup.workspacePath, join(dataPath, 'workspaces', occurrence.conversationId)]) await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toContain('只属于该员工')
  expect(await readFile(shared.path, 'utf8')).toBe('必须保留的共享知识')
  expect(await readFile(join(group.workspacePath, 'keep.txt'), 'utf8')).toBe('保留的群工作文件')
  expect(await readFile(join(otherRoot, 'workspace', 'private', 'keep.txt'), 'utf8')).toBe('其他员工的工作文件')
  expect((await api('getMemory', { agentId: 'writer', scope: 'profile' })).entries.map(memory => memory.content)).toEqual(['保留其他员工的记忆'])
  await expect(api('getMemory', { agentId: 'researcher', scope: 'profile' })).rejects.toThrow('员工不存在')
  await expect(api('getConversation', { id: direct.id })).rejects.toThrow('会话不存在')

  await f.close()
  const restarted = await f.start(), restored = await restarted.api('snapshot', undefined)
  expect(restored.agents.some(agent => agent.id === 'researcher')).toBe(false)
  expect(restored.conversations.map(conversation => conversation.id)).toEqual([group.id])
  expect((await restarted.api('getConversation', { id: group.id })).messages).toEqual(beforeGroup.messages)
  expect(restored.resources.map(resource => resource.id)).toEqual([shared.id])
})

test('dissolving a group permanently removes its configuration and records across restart while preserving its employees', async () => {
  const f = await setup(replyEngine()), { api } = f
  await configure(api)
  const group = await api('createConversation', { kind: 'group', title: '明确解散的群', agentIds: ['researcher', 'writer'] })
  const direct = await api('createConversation', { kind: 'direct', title: '保留的私聊', agentIds: ['writer'] })
  await sendAndFinish(api, group.id, 'dissolve-history', ['researcher', 'writer'])
  await sendAndFinish(api, direct.id, 'preserved-direct-history')
  const agents = (await api('snapshot', undefined)).agents, directBefore = await api('getConversation', { id: direct.id })
  await writeFile(join(group.workspacePath, 'delete.txt'), '群专属文件')
  await api('deleteConversation', { id: group.id })
  expect((await api('snapshot', undefined)).agents).toEqual(agents)
  expect(await api('getConversation', { id: direct.id })).toEqual(directBefore)
  await expect(api('getConversation', { id: group.id })).rejects.toThrow('会话不存在')
  await expect(access(group.workspacePath)).rejects.toMatchObject({ code: 'ENOENT' })
  for (const collection of ['messages', 'runs', 'turns', 'events', 'deliveries', 'decisions', 'contributions', 'artifacts']) expect(await f.store.load(collection, { conversationId: group.id })).toEqual([])
  await f.close()
  const restarted = await f.start()
  expect((await restarted.api('snapshot', undefined)).agents).toEqual(agents)
  expect((await restarted.api('snapshot', undefined)).conversations.map(conversation => conversation.id)).toEqual([direct.id])
  await expect(restarted.api('getConversation', { id: group.id })).rejects.toThrow('会话不存在')
})

test('batch category deletion uses its complete saved membership and refuses stale confirmation before any employee is deleted', async () => {
  const f = await setup(), { api, change } = f
  const categoryId = (await change({ kind: 'create-category', name: '整类员工' })).categories[0].id
  const stale = await change({ kind: 'assign-category', agentId: 'researcher', categoryId })
  await change({ kind: 'assign-category', agentId: 'writer', categoryId })
  const group = await api('createConversation', { kind: 'group', title: '分类员工混合群', agentIds: ['researcher', 'writer', 'reviewer'] })
  const emptyGroup = await api('createConversation', { kind: 'group', title: '分类员工独占群', agentIds: ['researcher', 'writer'] })
  const before = await api('snapshot', undefined), beforePreferences = await api('getContactList', undefined)
  await expect(api('updateContactList', { expectedRevision: stale.revision, action: { kind: 'delete-category-agents', categoryId } })).rejects.toThrow('其他窗口')
  expect(await api('snapshot', undefined)).toEqual(before)
  expect(await api('getContactList', undefined)).toEqual(beforePreferences)
  const saved = await api('updateContactList', { expectedRevision: beforePreferences.revision, action: { kind: 'delete-category-agents', categoryId } })
  expect(saved.categories).toEqual([])
  expect(saved.categoryByAgentId).toEqual({})
  expect(saved.agentOrder).not.toContain('researcher'); expect(saved.agentOrder).not.toContain('writer')
  expect(saved.groupOrder).not.toContain(emptyGroup.id)
  expect((await api('snapshot', undefined)).agents.map(agent => agent.id).sort()).toEqual(before.agents.filter(agent => !['researcher', 'writer'].includes(agent.id)).map(agent => agent.id).sort())
  expect((await api('getConversation', { id: group.id })).conversation.agentIds).toEqual(['reviewer'])
  await expect(api('getConversation', { id: emptyGroup.id })).rejects.toThrow('会话不存在')
  for (const id of ['researcher', 'writer']) await expect(access(join(f.dataPath, 'agents', id))).rejects.toMatchObject({ code: 'ENOENT' })
  await f.close()
  const restarted = await f.start()
  expect((await restarted.api('getContactList', undefined)).categories).toEqual([])
  expect((await restarted.api('snapshot', undefined)).agents.some(agent => ['researcher', 'writer'].includes(agent.id))).toBe(false)
  expect((await restarted.api('getConversation', { id: group.id })).conversation.agentIds).toEqual(['reviewer'])
})

test('legacy tag deletion includes secondary memberships and preserves employees with unrelated tags', async () => {
  const { api, change, store } = await setup()
  const otherId = (await change({ kind: 'create-category', name: '保留标签' })).categories[0].id
  const target = await change({ kind: 'create-category', name: '删除标签' }), targetId = target.categories[1].id
  await change({ kind: 'set-agent-tags', agentIds: ['researcher', 'reviewer'], tagIds: [otherId], mode: 'add' })
  const before = await change({ kind: 'set-agent-tags', agentIds: ['researcher', 'writer'], tagIds: [targetId], mode: 'add' })
  expect(before.categoryByAgentId.researcher).toBe(otherId)
  expect(contactTagIds(before, 'researcher')).toEqual([otherId, targetId])
  const saved = await api('updateContactList', { expectedRevision: before.revision, action: { kind: 'delete-category-agents', categoryId: targetId } })
  expect((await api('snapshot', undefined)).agents.map(agent => agent.id).sort()).toEqual(['bobo', 'reviewer'])
  expect(saved.categories).toEqual([{ id: otherId, name: '保留标签' }])
  expect(saved.categoryByAgentId).toEqual({ reviewer: otherId })
  expect(saved.tagIdsByAgentId).toEqual({ reviewer: [otherId] })
  expect((await store.load<DigitalAgent>('agents')).map(agent => agent.id).sort()).toEqual(['bobo', 'reviewer'])
})

test('core identity cannot be deleted and a direct conversation cannot be dissolved as a group', async () => {
  const { api, store } = await setup()
  const before = await api('snapshot', undefined)
  await expect(api('deleteAgent', { id: 'bobo' })).rejects.toThrow('核心助手不能删除')
  expect(await api('snapshot', undefined)).toEqual(before)
  expect((await store.load<DigitalAgent>('agents')).find(agent => agent.id === 'bobo')).toMatchObject({ id: 'bobo', systemRole: 'core' })
  const direct = await api('createConversation', { kind: 'direct', title: '员工私聊', agentIds: ['researcher'] })
  await expect(api('deleteConversation', { id: direct.id })).rejects.toThrow('只能')
  expect((await api('getConversation', { id: direct.id })).conversation.id).toBe(direct.id)
})

test('employee and group deletion pause affected scheduled plans while unrelated future schedules keep their authority', async () => {
  let calls = 0
  const engine = replyEngine()
  engine.run = async context => { calls++; await context.onDelta('不应被本次删除触发的自动回复') }
  const f = await setup(engine), { api } = f
  await configure(api)
  const affectedGroup = await api('createConversation', { kind: 'group', title: '员工退出后保留的计划群', agentIds: ['researcher', 'writer'] })
  const dissolvedGroup = await api('createConversation', { kind: 'group', title: '明确解散的计划群', agentIds: ['writer', 'reviewer'] })
  // Select a UTC day three days ahead: native schedules are real but cannot fire during this test.
  const weekday = (new Date().getUTCDay() + 3) % 7
  const schedule = { prompt: '等待未来日程才执行', frequency: 'weekly' as const, time: '00:00', weekday, daysOfWeek: [weekday], timezone: 'UTC', enabled: true, notify: false }
  const employeePlan = await api('saveAutomation', { ...schedule, name: '删除员工的新任务聊天计划', conversationPolicy: 'new-conversation', employeeIds: ['researcher'] })
  const affectedGroupPlan = await api('saveAutomation', { ...schedule, name: '删除成员的群计划', conversationPolicy: 'existing-conversation', conversationId: affectedGroup.id })
  const dissolvedGroupPlan = await api('saveAutomation', { ...schedule, name: '解散群的计划', conversationPolicy: 'existing-conversation', conversationId: dissolvedGroup.id })
  const unrelatedPlan = await api('saveAutomation', { ...schedule, name: '保留员工的计划', conversationPolicy: 'new-conversation', employeeIds: ['reviewer'] })
  expect((await api('listAutomations', undefined)).definitions.every(plan => plan.enabled && plan.sync === 'synced')).toBe(true)

  await api('deleteAgent', { id: 'researcher' })
  const afterEmployee = await api('listAutomations', undefined)
  expect(afterEmployee.definitions.find(plan => plan.id === employeePlan.id)).toMatchObject({ enabled: false, nextTimes: [] })
  expect(afterEmployee.definitions.find(plan => plan.id === affectedGroupPlan.id)).toMatchObject({ enabled: false, nextTimes: [] })
  expect(afterEmployee.definitions.find(plan => plan.id === dissolvedGroupPlan.id)?.enabled).toBe(true)
  expect(afterEmployee.definitions.find(plan => plan.id === unrelatedPlan.id)?.enabled).toBe(true)
  expect((await api('getConversation', { id: affectedGroup.id })).conversation.agentIds).toEqual(['writer'])

  await api('deleteConversation', { id: dissolvedGroup.id })
  await until(async () => (await api('listAutomations', undefined)).definitions.filter(plan => [employeePlan.id, affectedGroupPlan.id, dissolvedGroupPlan.id].includes(plan.id)).every(plan => !plan.enabled && plan.sync === 'synced'))
  const afterGroup = await api('listAutomations', undefined)
  expect(afterGroup.definitions.find(plan => plan.id === dissolvedGroupPlan.id)).toMatchObject({ enabled: false, nextTimes: [] })
  expect(afterGroup.definitions.find(plan => plan.id === unrelatedPlan.id)).toMatchObject({ enabled: true, sync: 'synced' })
  expect(afterGroup.occurrences).toEqual([])
  expect(calls).toBe(0)
  await f.close()
  const restarted = await f.start(), restored = await restarted.api('listAutomations', undefined)
  for (const id of [employeePlan.id, affectedGroupPlan.id, dissolvedGroupPlan.id]) expect(restored.definitions.find(plan => plan.id === id)?.enabled).toBe(false)
  expect(restored.definitions.find(plan => plan.id === unrelatedPlan.id)?.enabled).toBe(true)
  expect(restored.occurrences).toEqual([])
  expect(calls).toBe(0)
})

test('a group directory symlink failure retains history and can be repaired and retried without touching outside files', async () => {
  const f = await setup(replyEngine()), { api } = f
  await configure(api)
  const group = await api('createConversation', { kind: 'group', title: '目录修复后重试解散', agentIds: ['researcher', 'writer'] })
  await sendAndFinish(api, group.id, 'symlink-group-history', ['researcher', 'writer'])
  const before = await api('getConversation', { id: group.id })
  const retainedPath = join(f.dataPath, 'held-group-workspace'), outside = await mkdtemp(join(tmpdir(), 'boai-contact-outside-'))
  roots.push(outside)
  await writeFile(join(group.workspacePath, 'owned.txt'), '待删除的原群文件')
  await writeFile(join(outside, 'keep.txt'), '外部文件必须保留')
  await rename(group.workspacePath, retainedPath)
  await symlink(outside, group.workspacePath, 'dir')

  await expect(api('deleteConversation', { id: group.id })).rejects.toThrow('符号链接')
  expect((await f.store.load<{ id: string }>('conversations')).some(conversation => conversation.id === group.id)).toBe(true)
  expect(await f.store.load('messages', { conversationId: group.id })).toEqual(before.messages)
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('外部文件必须保留')
  expect(await readFile(join(retainedPath, 'owned.txt'), 'utf8')).toBe('待删除的原群文件')

  await rm(group.workspacePath)
  await rename(retainedPath, group.workspacePath)
  await api('deleteConversation', { id: group.id })
  await expect(api('getConversation', { id: group.id })).rejects.toThrow('会话不存在')
  expect((await api('snapshot', undefined)).conversations.some(conversation => conversation.id === group.id)).toBe(false)
  expect(await f.store.load('messages', { conversationId: group.id })).toEqual([])
  await expect(access(group.workspacePath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('外部文件必须保留')
  await f.close()
  const restarted = await f.start()
  expect((await restarted.api('snapshot', undefined)).conversations.some(conversation => conversation.id === group.id)).toBe(false)
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('外部文件必须保留')
})

test('deleting a member ends a preserved group automation wait immediately while retaining its budget and trigger identity', async () => {
  let calls = 0
  const engine = replyEngine()
  engine.decide = async context => ({ action: context.agent.id === 'researcher' && !context.participation?.hasRespondedInTurn ? 'ask' : 'pass', responseKind: 'chat', observedThroughSequence: Math.max(...context.messages.map(message => message.sequence)) })
  engine.run = async context => { calls++; await context.onDelta('请补充本次自动化需要的数字。') }
  const f = await setup(engine), { api } = f
  await configure(api)
  const group = await api('createConversation', { kind: 'group', title: '删除提问员工后保留的群', agentIds: ['researcher', 'writer'] })
  const plan = await api('saveAutomation', { name: '保留群的澄清任务', prompt: '等待用户补充数字', conversationPolicy: 'existing-conversation', conversationId: group.id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false })
  const request = { id: plan.id, requestId: 'preserved-group-wait' }
  const occurrence = await api('runAutomation', request)
  await until(async () => (await api('listAutomations', undefined)).occurrences.find(item => item.id === occurrence.id)?.status === 'waiting_user')
  await new Promise(resolve => setTimeout(resolve, 20))
  const waiting = (await api('listAutomations', undefined)).occurrences.find(item => item.id === occurrence.id)!
  const beforeGroup = await api('getConversation', { id: group.id }), originalBudget = beforeGroup.workBudgets!.find(budget => budget.id === waiting.budgetId)!
  expect(waiting.waitingTurnIds).toContain(waiting.turnId)
  expect(Date.parse(originalBudget.deadlineAt)).toBeGreaterThan(Date.now())
  expect(beforeGroup.messages.some(message => message.senderId === 'researcher' && message.content.includes('请补充'))).toBe(true)
  const aliases = await f.store.load<{ id: string; occurrenceId: string }>('automationTriggerAliases')
  expect(aliases.some(alias => alias.occurrenceId === waiting.id)).toBe(true)
  const receipts = await f.store.load('budgetModelCalls')
  expect(calls).toBe(1)

  await api('deleteAgent', { id: 'researcher' })
  const ended = (await api('listAutomations', undefined)).occurrences.find(item => item.id === waiting.id)!
  expect(['cancelled', 'interrupted']).toContain(ended.status)
  expect(ended.finishedAt).toBeTruthy()
  expect(ended.waitingTurnIds ?? []).toEqual([])
  expect(ended).toMatchObject({ id: waiting.id, automationId: waiting.automationId, conversationId: group.id, budgetId: originalBudget.id, manualRequestId: request.requestId })
  const survivingGroup = await api('getConversation', { id: group.id })
  expect(survivingGroup.conversation.agentIds).toEqual(['writer'])
  expect(survivingGroup.messages).toEqual(beforeGroup.messages)
  expect(['cancelled', 'interrupted']).toContain(survivingGroup.turns!.find(turn => turn.id === waiting.turnId)?.status)
  expect(survivingGroup.workBudgets!.find(budget => budget.id === originalBudget.id)).toMatchObject({ id: originalBudget.id, deadlineAt: originalBudget.deadlineAt, maxModelCalls: originalBudget.maxModelCalls, modelCalls: originalBudget.modelCalls })
  expect(await f.store.load('automationTriggerAliases')).toEqual(aliases)
  expect(await f.store.load('budgetModelCalls')).toEqual(receipts)
  expect(await api('runAutomation', request)).toMatchObject({ id: waiting.id, status: ended.status, budgetId: originalBudget.id })
  await expect(api('replyAutomation', { occurrenceId: waiting.id, content: '42', requestId: 'cannot-resume-deleted-member' })).rejects.toThrow()
  expect(calls).toBe(1)

  await f.close()
  const restarted = await f.start(), restored = (await restarted.api('listAutomations', undefined)).occurrences.find(item => item.id === waiting.id)!
  expect(restored).toMatchObject({ id: waiting.id, status: ended.status, budgetId: originalBudget.id, manualRequestId: request.requestId })
  expect((await restarted.api('getConversation', { id: group.id })).messages).toEqual(beforeGroup.messages)
  expect(await restarted.api('runAutomation', request)).toMatchObject({ id: waiting.id, status: ended.status })
  expect(calls).toBe(1)
})

test.each(['employee', 'group', 'category'] as const)('%s deletion waits for actual adapter exit even after cancellation', async kind => {
  let release!: () => void, started = false
  const engine = replyEngine()
  engine.run = async () => { started = true; await new Promise<void>(resolve => { release = resolve }) }
  const f = await setup(engine), { api, change } = f
  await configure(api)
  const group = await api('createConversation', { kind: 'group', title: '删除前等待执行器退出', agentIds: ['researcher', 'writer'] })
  const categoryId = (await change({ kind: 'create-category', name: '仍在执行的分类' })).categories[0].id
  await change({ kind: 'assign-category', agentId: 'researcher', categoryId })
  await change({ kind: 'assign-category', agentId: 'writer', categoryId })
  const deleteTarget = async () => kind === 'employee' ? api('deleteAgent', { id: 'researcher' }) : kind === 'group' ? api('deleteConversation', { id: group.id }) : api('updateContactList', { expectedRevision: (await api('getContactList', undefined)).revision, action: { kind: 'delete-category-agents', categoryId } })
  await api('sendMessage', { conversationId: group.id, content: '执行器尚未退出时不要删除数据', requestId: `exit-${kind}`, mentionIds: ['researcher'] })
  await until(() => started)
  try {
    await expect(deleteTarget()).rejects.toThrow('先停止')
    await api('cancelRun', { conversationId: group.id })
    await expect(deleteTarget()).rejects.toThrow('先停止')
    expect((await api('snapshot', undefined)).agents.some(agent => agent.id === 'researcher')).toBe(true)
    expect((await api('getConversation', { id: group.id })).messages.length).toBeGreaterThan(0)
    expect((await api('getContactList', undefined)).categories.some(category => category.id === categoryId)).toBe(true)
    release()
    await until(async () => {
      try { await deleteTarget(); return true }
      catch (error) { if (error instanceof Error && error.message.includes('先停止')) return false; throw error }
    })
    if (kind === 'group') expect((await api('snapshot', undefined)).agents.some(agent => agent.id === 'researcher')).toBe(true)
    else expect((await api('snapshot', undefined)).agents.some(agent => agent.id === 'researcher')).toBe(false)
  } finally { release?.() }
})

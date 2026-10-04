/*
 * [INPUT]: 真实 SQLite 多连接、MemoryRepository 与范围/生命周期策略。
 * [OUTPUT]: 自动纠正多级派生失效、原来源修复及无关记忆隔离。
 * [OUTPUT]: 无关清空不取消精确召回、条目/获知指纹/原文与派生回复的相关失效；旧快照和提取仍保守，纠正/忘记/期限不可绕过。
 * [POS]: tests/memory-repository.test.ts；T2 存储与不变量验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import { MemoryRepository, type ExtractionPolicy } from '../src/runtime/modules/memory/memory-repository'
import { memoryAllowed, memoryStatus } from '../src/runtime/modules/memory/memory-policy'
import { recallMemory } from '../src/runtime/modules/memory/memory-recall'
import type { DigitalAgent, MemoryEntry, MemoryQuery, MemoryView, Message } from '../src/shared/domain'
const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-memory-')); roots.push(root)
  const store = new ProductStore(join(root, 'memory.sqlite')); stores.push(store); await store.init()
  const repository = new MemoryRepository(store); await repository.init()
  return { root, store, repository }
}
const employee: MemoryQuery = { agentId: 'a', scope: 'employee' }
const direct: MemoryQuery = { agentId: 'a', scope: 'conversation', conversationId: 'dm' }
const policy = (requestId: string, expectedInvalidationEpoch = 0): ExtractionPolicy => ({ conversationId: 'dm', useScope: 'employee', disclosure: 'private', requestId, expectedInvalidationEpoch, userMessageIds: ['new'] })
it('records an idempotent policy activation without widening or rewriting legacy records', async () => {
  const { store, repository } = await fixture()
  const old: MemoryEntry = { id: 'legacy', ownerAgentId: 'a', scope: 'conversation', conversationId: 'dm', content: '旧私聊暗号', origin: 'model', version: 1, createdAt: '', updatedAt: '', sourceMessageIds: ['old'], sourceResourceIds: [] }
  await store.write([{ collection: 'memory', id: old.id, value: old }])
  const activation = await store.load('memoryRuntime'); await repository.init()
  expect(await store.load('memoryRuntime')).toEqual(activation)
  expect(await store.load('memory')).toEqual([old])
  const entry = (await repository.get(employee)).entries[0]
  expect(memoryAllowed(entry, { agentId: 'a', conversationId: 'group', sourceAllowed: () => true, conversationRestricted: () => false })).toBe(false)
  expect(memoryAllowed(entry, { agentId: 'a', conversationId: 'dm', sourceAllowed: () => true, conversationRestricted: () => false })).toBe(true)
})
it('checks revisions inside SQLite so two repositories never silently overwrite each other', async () => {
  const { store, repository } = await fixture()
  const other = new ProductStore(store.filename); stores.push(other); await other.init()
  const second = new MemoryRepository(other); await second.init()
  const results = await Promise.allSettled([repository.save({ ...employee, content: '甲群决定', expectedEpoch: 0 }), second.save({ ...employee, content: '乙群决定', expectedEpoch: 0 })])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  const view = await second.get(employee)
  await second.save({ ...employee, content: '重新读取后新增', expectedEpoch: view.epoch })
  expect((await repository.get(employee)).entries).toHaveLength(2)
})
it('rolls back entries, revisions and request receipts together when a write fails', async () => {
  const { store, repository } = await fixture()
  const original = store.transaction.bind(store)
  const spy = vi.spyOn(store, 'transaction').mockImplementation(operation => original(tx => operation({ ...tx, put: async row => { if (row.collection === 'memoryEpochs') throw new Error('fault'); await tx.put(row) } })))
  await expect(repository.save({ ...employee, requestId: 'once', content: '不应留下半份记忆', expectedEpoch: 0 })).rejects.toThrow('fault')
  spy.mockRestore()
  expect((await repository.get(employee)).entries).toHaveLength(0)
  expect(await store.load('memoryReceipts')).toHaveLength(0)
  expect((await repository.get(employee)).epoch).toBe(0)
})
it('reuses a committed receipt after response loss and rejects changed payloads', async () => {
  const { repository } = await fixture()
  const input = { ...employee, content: '原请求', expectedEpoch: 0, requestId: 'once' }
  await repository.save(input); await repository.save(input)
  expect((await repository.get(employee)).entries).toHaveLength(1)
  await expect(repository.save({ ...input, content: '另一份内容' })).rejects.toThrow('CONFLICT')
})
it('forgetting removes the text and prevents late extraction or raw-evidence resurrection', async () => {
  const { store, repository } = await fixture()
  const saved = await repository.extract(employee, [{ content: '青藤47', sourceMessageIds: ['m1'] }], 0, ['m1'], [], policy('first'))
  const entry = saved.entries[0]
  await repository.delete(employee, entry.id, saved.epoch)
  await expect(repository.extract(employee, [{ content: '青藤47', sourceMessageIds: ['m1'] }], saved.epoch, ['m1'], [], policy('late'))).rejects.toThrow('记忆已变更')
  const current = await repository.get(employee)
  await repository.extract(employee, [{ content: '换了措辞的青藤47', sourceMessageIds: ['m1'] }], current.epoch, ['m1'], [], policy('new-maintenance', current.invalidationEpoch))
  expect((await repository.get(employee)).entries).toHaveLength(0)
  expect(JSON.stringify(await store.load('memory'))).not.toContain('青藤47')
  expect(JSON.stringify(await store.load('memoryForgets'))).not.toContain('青藤47')
  await repository.extract(employee, [{ content: '用户明确重新告知：青藤47', sourceMessageIds: ['new'] }], current.epoch, ['new'], [], policy('explicit-new', current.invalidationEpoch))
  expect((await repository.get(employee)).entries).toHaveLength(1)
})
it('corrects only a current unpinned record with new user evidence and preserves attribution', async () => {
  const { repository } = await fixture()
  const first = await repository.extract(employee, [{ content: '开头写长一点', sourceMessageIds: ['old'], kind: 'long_term', evidence: 'preference' }], 0, ['old'], [], policy('old'))
  const target = first.entries[0]
  const next = await repository.extract(employee, [{ content: '以后开头简短', sourceMessageIds: ['new'], kind: 'long_term', evidence: 'preference', supersedes: [{ id: target.id, version: target.version }] }], first.epoch, ['new'], [], policy('correction', first.invalidationEpoch))
  expect(next.entries.find(entry => entry.id === target.id)?.status).toBe('superseded')
  expect(next.entries.find(entry => entry.content === '以后开头简短')?.supersedes).toEqual([target.id])
  const active = await repository.get({ ...employee, status: 'active' })
  expect(active.entries.map(entry => entry.content)).toEqual(['以后开头简短'])
})
it('propagates revocation through memories and observations rather than checking only the source chat', async () => {
  const { store, repository } = await fixture()
  const first = await repository.extract(employee, [{ content: '资料中的结论', sourceMessageIds: ['m'], sourceResourceIds: ['k'] }], 0, ['m'], ['k'], policy('source'))
  const source = first.entries[0]
  await repository.extract(employee, [{ content: '另一个群的派生结论', sourceMessageIds: ['derived'] }], first.epoch, ['derived'], [], { ...policy('derived'), conversationId: 'group', sourceMemoryIds: [source.id] })
  await store.write([repository.observation({ id: 'o', ownerAgentId: 'a', conversationId: 'group', sourceMessageIds: ['derived'], sourceResourceIds: [], sourceMemoryIds: [source.id], useScope: 'employee', createdAt: new Date().toISOString() })])
  await repository.invalidateResources(['k'])
  expect((await repository.get(employee)).entries).toHaveLength(0)
  expect(await repository.observations('a')).toHaveLength(0)
})
it('expires on read, archives low-frequency experiences and retains pinned or long-term memories', async () => {
  const { repository } = await fixture()
  const expired = await repository.save({ ...employee, content: '本次临时身份', kind: 'temporary', expiresAt: '2000-01-01T00:00:00Z', expectedEpoch: 0 })
  expect(memoryStatus(expired.entries[0])).toBe('expired')
  const next = await repository.save({ ...employee, content: '经历', kind: 'experience', expectedEpoch: expired.epoch })
  const pinned = await repository.save({ ...employee, content: '固定经历', kind: 'experience', pinned: true, expectedEpoch: next.epoch })
  await repository.save({ ...employee, content: '长期偏好', kind: 'long_term', expectedEpoch: pinned.epoch })
  await repository.maintain(Date.now() + 91 * 86400000)
  const all = await repository.get(employee)
  expect(all.entries.find(entry => entry.content === '经历')?.status).toBe('archived')
  expect(all.entries.find(entry => entry.content === '固定经历')?.status).toBe('active')
  expect(all.entries.find(entry => entry.content === '长期偏好')?.status).toBe('active')
})
it('clearing an empty legacy scope still fences its in-flight extraction', async () => {
  const { repository } = await fixture()
  await repository.clear(direct, 0)
  await expect(repository.extract(direct, [{ content: '迟到', sourceMessageIds: ['m'] }], 0, ['m'], [])).rejects.toThrow('记忆已变更')
})

it('UM12 summary inherits every source, the earliest expiry and hard scopes; restriction remains idempotent', async () => {
  const { repository } = await fixture()
  const first = await repository.extract(employee, [{ content: '局内临时约定', kind: 'temporary', sourceMessageIds: ['m'], contextRef: { kind: 'conversation', id: 'game' }, expiresAt: '2030-01-01T00:00:00Z' }], 0, ['m'], [], { ...policy('source'), authorizedContexts: [{ kind: 'conversation', id: 'game' }] })
  const parent = first.entries[0]
  const next = await repository.extract(employee, [{ content: '同一事项摘要', sourceMessageIds: ['derived'], expiresAt: '2031-01-01T00:00:00Z' }], first.epoch, ['derived'], [], { ...policy('summary'), conversationId: 'group', sourceMemoryIds: [parent.id] })
  const child = next.entries.find(entry => entry.content === '同一事项摘要')!
  expect(child).toMatchObject({ useScope: 'context', contextRef: parent.contextRef, expiresAt: parent.expiresAt, sourceMemoryIds: [parent.id] })
  expect(child.sourceConversationIds).toEqual(['group', 'dm']); expect(child.sourceMessageIds).toEqual(['derived', 'm'])
  await repository.restrictConversation('a', 'dm'); const restricted = await repository.get(employee)
  expect(restricted.entries.find(entry => entry.id === parent.id)?.useScope).toBe('conversation'); expect(restricted.entries.find(entry => entry.id === child.id)?.status).toBe('expired')
  await repository.restrictConversation('a', 'dm'); expect(await repository.get(employee)).toEqual(restricted)
})
it('UM08 unrelated parallel deltas merge under the same invalidation fence and retain separate receipts', async () => {
  const { repository, store } = await fixture()
  await Promise.all(['one', 'two'].map(id => repository.extract(employee, [{ content: id, sourceMessageIds: [id] }], 0, [id], [], policy(id))))
  expect((await repository.get(employee)).entries.map(entry => entry.content).sort()).toEqual(['one', 'two'])
  expect(await store.load('memoryReceipts')).toHaveLength(2)
})
it('UM11 work completion blocks an already assembled temporary recall without a maintenance timer', async () => {
  const { repository, store } = await fixture()
  await store.write([{ collection: 'workItems', id: 'work', value: { id: 'work', status: 'running' } }])
  const view = await repository.save({ ...employee, content: '只用于当前工作', kind: 'temporary', useScope: 'context', contextRef: { kind: 'work', id: 'work' }, expectedEpoch: 0 })
  const projected = { ...view, recall: { conversationId: 'dm', versions: view.entries.map(entry => ({ id: entry.id, version: entry.version })), observationIds: [], tokenEstimate: 40 } }
  expect(await repository.recallValid(projected)).toBe(true)
  await store.write([{ collection: 'workItems', id: 'work', value: { id: 'work', status: 'delivered' } }])
  expect(await repository.recallValid(projected)).toBe(false)
  expect((await repository.get({ ...employee, status: 'active' })).entries).toHaveLength(0)
  expect((await repository.get({ ...employee, status: 'history' })).entries[0].status).toBe('expired')
})

function selectedRecall(view: MemoryView) {
  return recallMemory({ view, request: '蓝鲸核对', observations: [], messages: new Map(), access: { agentId: 'a', conversationId: 'live', contextRefs: [{ kind: 'conversation', id: 'live' }], sourceAllowed: () => true, conversationRestricted: () => false } })
}
it('a tracked active task retains its used memory when an unrelated source is cleared', async () => {
  const { repository } = await fixture()
  const first = await repository.save({ ...employee, content: '蓝鲸核对来源', kind: 'experience', sourceConversationIds: ['kept'], expectedEpoch: 0 })
  const latest = await repository.save({ ...employee, content: '遥远岩石尺寸', kind: 'experience', sourceConversationIds: ['unrelated'], expectedEpoch: first.epoch })
  const projected = selectedRecall(latest)
  expect(projected.entries.map(entry => entry.content)).toEqual(['蓝鲸核对来源'])
  await repository.invalidateConversation('a', 'unrelated')
  expect(await repository.recallValid(projected)).toBe(true)
  await repository.invalidateConversation('a', 'kept')
  expect(await repository.recallValid(projected)).toBe(false)
})
it('clearing a scope with no source does not revoke every employee namespace', async () => {
  const { repository } = await fixture()
  const before = await repository.get(employee)
  await repository.invalidateConversation('a', 'unrelated')
  expect(await repository.get(employee)).toEqual(before)
})
it('tracked raw evidence detects scope changes even when its observation identity stays the same', async () => {
  const { repository, store } = await fixture()
  const message: Message = { id: 'raw', conversationId: 'kept', sequence: 1, senderType: 'user', senderId: 'user', senderName: '本人', content: '蓝鲸核对来源', status: 'completed', createdAt: new Date().toISOString() }
  const observation = { id: 'observed', ownerAgentId: 'a', conversationId: 'kept', sourceMessageIds: ['raw'], sourceResourceIds: [], sourceMemoryIds: [], useScope: 'employee' as const, createdAt: message.createdAt }
  await store.write([repository.observation(observation)])
  const projected = recallMemory({ view: await repository.get(employee), request: '蓝鲸核对', observations: [observation], messages: new Map([[message.id, message]]), access: { agentId: 'a', conversationId: 'live', sourceAllowed: () => true, conversationRestricted: () => false } })
  expect(await repository.recallValid(projected)).toBe(true)
  await store.write([repository.observation({ ...observation, useScope: 'conversation' })])
  expect(await repository.recallValid(projected)).toBe(false)
})
it('explicit tracked input messages stop on forgetting or actual source removal without relying on a global epoch', async () => {
  const { repository, store } = await fixture()
  const message = { id: 'input', conversationId: 'live', status: 'completed' }
  await store.write([{ collection: 'messages', id: message.id, value: message }])
  const projected = selectedRecall(await repository.get(employee))
  Object.assign(projected.recall!, { inputMessageIds: ['input'] })
  expect(await repository.recallValid(projected)).toBe(true)
  await store.write([{ collection: 'memoryForgets', id: 'forgotten', value: { id: 'forgotten', ownerAgentId: 'a', sourceMessageIds: ['input'], sourceMemoryIds: [], createdAt: new Date().toISOString() } }])
  expect(await repository.recallValid(projected)).toBe(false)
  await store.write([], [{ collection: 'memoryForgets', id: 'forgotten' }, { collection: 'messages', id: 'input' }])
  expect(await repository.recallValid(projected)).toBe(false)
})
it('legacy recalls remain conservative when an employee authority epoch changed', async () => {
  const { repository } = await fixture()
  const first = await repository.save({ ...employee, content: '蓝鲸核对来源', kind: 'experience', sourceConversationIds: ['kept'], expectedEpoch: 0 })
  const latest = await repository.save({ ...employee, content: '岩石尺寸', kind: 'experience', sourceConversationIds: ['unrelated'], expectedEpoch: first.epoch })
  const projected = selectedRecall(latest)
  delete projected.recall!.authorityVersion
  delete projected.recall!.observationVersions
  await repository.invalidateConversation('a', 'unrelated')
  expect(await repository.recallValid(projected)).toBe(false)
})
it('new source restrictions fence a previously selected raw observation without changing its metadata', async () => {
  const { repository, store } = await fixture()
  const message: Message = { id: 'raw', conversationId: 'kept', sequence: 1, senderType: 'user', senderId: 'user', senderName: '本人', content: '蓝鲸核对来源', status: 'completed', createdAt: new Date().toISOString() }
  const observation = { id: 'observed', ownerAgentId: 'a', conversationId: 'kept', sourceMessageIds: ['raw'], sourceResourceIds: [], sourceMemoryIds: [], useScope: 'employee' as const, createdAt: message.createdAt }
  await store.write([repository.observation(observation)])
  const projected = recallMemory({ view: await repository.get(employee), request: '蓝鲸核对', observations: [observation], messages: new Map([[message.id, message]]), access: { agentId: 'a', conversationId: 'live', sourceAllowed: () => true, conversationRestricted: () => false } })
  await repository.save({ ...employee, content: '仅用于原聊天', conversationId: 'kept', useScope: 'conversation', sourceMessageIds: ['raw'], expectedEpoch: 0 })
  expect(await repository.recallValid(projected)).toBe(false)
})
it('tracked entry versions reject corrections, expiry and owner replacement but permit the explicitly corrected new version', async () => {
  const { repository, store } = await fixture()
  const first = await repository.save({ ...employee, content: '蓝鲸核对旧值', sourceMessageIds: ['source'], expectedEpoch: 0 })
  const old = selectedRecall(first)
  const corrected = await repository.save({ ...employee, id: first.entries[0].id, content: '蓝鲸核对新值', expectedEpoch: first.epoch })
  expect(await repository.recallValid(old)).toBe(false)
  const current = selectedRecall(corrected)
  expect(await repository.recallValid(current)).toBe(true)
  await store.write([{ collection: 'memory', id: corrected.entries[0].id, value: { ...corrected.entries[0], ownerAgentId: 'b' } }])
  expect(await repository.recallValid(current)).toBe(false)
  await store.write([{ collection: 'memory', id: corrected.entries[0].id, value: { ...corrected.entries[0], expiresAt: '2000-01-01T00:00:00Z' } }])
  expect(await repository.recallValid(current)).toBe(false)
})
it('tracked raw observations also retain the parent lifecycle after selection', async () => {
  const { repository, store } = await fixture()
  const first = await repository.save({ ...employee, content: '原始判断', kind: 'experience', expectedEpoch: 0 })
  const parent = first.entries[0]
  const message: Message = { id: 'raw', conversationId: 'kept', sequence: 1, senderType: 'user', senderId: 'user', senderName: '本人', content: '蓝鲸核对来源', status: 'completed', createdAt: new Date().toISOString() }
  const observation = { id: 'observed', ownerAgentId: 'a', conversationId: 'kept', sourceMessageIds: ['raw'], sourceResourceIds: [], sourceMemoryIds: [parent.id], useScope: 'employee' as const, createdAt: message.createdAt }
  await store.write([repository.observation(observation)])
  const projected = recallMemory({ view: first, request: '蓝鲸核对', observations: [observation], messages: new Map([[message.id, message]]), access: { agentId: 'a', conversationId: 'live', sourceAllowed: () => true, conversationRestricted: () => false } })
  expect(await repository.recallValid(projected)).toBe(true)
  await store.write([{ collection: 'memory', id: parent.id, value: { ...parent, expiresAt: '2000-01-01T00:00:00Z' } }])
  expect(await repository.recallValid(projected)).toBe(false)
})
it('tracked inputs reject an invalidated source reply even when the published message is retained', async () => {
  const { repository, store } = await fixture()
  await store.write([{ collection: 'messages', id: 'reply', value: { id: 'reply', status: 'completed', runId: 'source-run' } }, { collection: 'snapshots', id: 'source-run', value: { id: 'source-run', invalidated: false } }])
  const projected = selectedRecall(await repository.get(employee))
  Object.assign(projected.recall!, { inputMessageIds: ['reply'] })
  expect(await repository.recallValid(projected)).toBe(true)
  await store.write([{ collection: 'snapshots', id: 'source-run', value: { id: 'source-run', invalidated: true } }])
  expect(await repository.recallValid(projected)).toBe(false)
  expect(await store.load('messages')).toHaveLength(1)
  await store.write([], [{ collection: 'snapshots', id: 'source-run' }])
  expect(await repository.recallValid(projected)).toBe(false)
})

it('expires every descendant of an automatically corrected fact while preserving unrelated active entries and the new evidence', async () => {
  const { root:directory,repository,store }=await fixture()
  const first=await repository.extract(employee,[{content:'原始偏好',sourceMessageIds:['old'],kind:'long_term'}],0,['old'],[],policy('root'))
  const root=first.entries[0]!
  const child={...root,id:'child',content:'旧偏好摘要',sourceMemoryIds:[root.id]}
  const descendant={...root,id:'descendant',content:'旧偏好二级摘要',sourceMemoryIds:[child.id]}
  const unrelated={...root,id:'unrelated',content:'无关事实',sourceMessageIds:['independent']}
  await store.write([child,descendant,unrelated].map(value=>({collection:'memory',id:value.id,value})))
  const current=await repository.get(employee)
  const next=await repository.extract(employee,[{content:'纠正后的偏好',sourceMessageIds:['new'],supersedes:[{id:root.id,version:root.version}]}],current.epoch,['new'],[],{...policy('correct',current.invalidationEpoch),sourceMemoryIds:[root.id,child.id,descendant.id]})
  expect(next.entries.find(entry=>entry.id===root.id)?.status).toBe('superseded')
  for(const id of [child.id,descendant.id]) expect(next.entries.find(entry=>entry.id===id)?.status).toBe('expired')
  expect(next.entries.find(entry=>entry.content==='纠正后的偏好')).toMatchObject({status:'active',sourceMemoryIds:[],sourceMessageIds:['new']})
  expect((await repository.get({...employee,status:'active'})).entries.map(entry=>entry.content).sort()).toEqual(['无关事实','纠正后的偏好'].sort())
  const agent:DigitalAgent={id:'a',name:'A',role:'test',instructions:'test',color:'#000000',connectionId:'',modelId:'',skillIds:[],knowledgeIds:[],allowCommands:false,active:true,configVersion:1}
  const homes=new WorkspaceService(directory);await homes.initialize(agent);await homes.regenerate(agent,next)
  const projected=await readFile(join(directory,'agents','a','workspace','MEMORY.md'),'utf8')
  expect(projected).toContain('纠正后的偏好');expect(projected).toContain('无关事实');expect(projected).not.toContain('旧偏好')
  const repaired={...child,status:'active' as const}
  await store.write([{collection:'memory',id:child.id,value:repaired}]); await repository.init()
  expect((await repository.get(employee)).entries.find(entry=>entry.id===child.id)?.status).toBe('expired')
  expect((await repository.get(employee)).entries.find(entry=>entry.id===unrelated.id)?.status).toBe('active')
})

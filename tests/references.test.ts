/*
 * [INPUT]: Actual ProductStore/ApplicationService, source projection and controlled AppService.
 * [OUTPUT]: Reference scope, live backlinks, stable paging, cleanup/restart and real context integration checks.
 * [POS]: Engineering verification; does not certify actual model personality quality.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ApplicationService, clearApplicationReceipts } from '../src/runtime/modules/application/application-service'
import { referenceOperations, referenceScope, type LoadReferences } from '../src/runtime/modules/application/reference-operations'
import { collectReferenceSources } from '../src/runtime/modules/application/reference-sources'
import { parseReferenceUri, referenceUri, referenceUris } from '../src/shared/domain/references'
import { savePromptTemplate, removePromptTemplate } from '../src/runtime/modules/resources/prompt-templates'
import type { Conversation, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { ApplicationActor } from '../src/shared/domain/application-protocol'
import { startOwnedRuntime } from '../src/runtime/bootstrap'

const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of clean.splice(0).reverse()) await action() })
const owner: ApplicationActor = { kind: 'owner' }, employee: ApplicationActor = { kind: 'employee', employeeId: 'a', conversationId: 'room', messageId: 'message' }
const scope = { agentId: 'a', conversationId: 'room' }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-ref-')), filename = join(root, 'boai.sqlite')
  clean.push(() => rm(root, { recursive: true, force: true }))
  let store = new ProductStore(filename); await store.init(); clean.push(() => store.close())
  const agent = { id: 'a', active: true, name: '员工', role: 'PRIVATE-ROLE', configVersion: 1 } as DigitalAgent
  const conversation = { id: 'room', title: '测试', agentIds: ['a'], kind: 'direct', updatedAt: '2026-10-20' } as Conversation
  await store.write([{ collection: 'agents', id: 'a', value: agent }, { collection: 'conversations', id: 'room', value: conversation }, { collection: 'messages', id: 'message', value: { id: 'message' } }])
  const load: LoadReferences = async (input, actor, kinds) => {
    await store.transaction(tx => referenceScope(tx, input, actor))
    return collectReferenceSources(store, { agent, conversation, messages: async () => [], memories: async () => [], skills: async () => ({ items: [], unavailable: 0 }) }, kinds)
  }
  let service = new ApplicationService(store, referenceOperations(store, load), async () => {})
  let serial = 0
  const call = (operation: string, input = {}, actor = owner, requestId = `request-${++serial}`) => service.call({ operation: `refs.${operation}`, input: { ...scope, ...input }, requestId }, actor)
  const ok = async (operation: string, input = {}, actor?: ApplicationActor, requestId?: string) => { const result = await call(operation, input, actor, requestId); expect(result.status, JSON.stringify(result)).toBe('succeeded'); return result.data as any }
  const prompt = async (content: string, name = '规则') => savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name, content })
  return { get store() { return store }, get service() { return service }, load, call, ok, prompt, restart: async () => { await store.close(); store = new ProductStore(filename); await store.init(); service = new ApplicationService(store, referenceOperations(store, load), async () => {}) } }
}

it('accepts only canonical object URIs, never paths, arbitrary schemes or malformed identities', () => {
  const uri = referenceUri('message', '原句/一')
  expect(parseReferenceUri(uri)).toEqual({ kind: 'message', id: '原句/一' })
  expect(referenceUris(`@[句子](${uri}) [重复](${uri})`)).toEqual([uri])
  for (const value of ['file:///etc/passwd', 'boai://provider/import', 'boai://ref/file/etc', 'boai://ref/message/', 'boai://ref/message/%0A', 'boai://ref/message/%61', 'boai://ref/message/a?x=1', 'boai://ref/message/%xx']) expect(parseReferenceUri(value), value).toBeUndefined()
})

it('resolves original text with versioned paging and rejects mixed pages after source edits', async () => {
  const f = await fixture(), prompt = await f.prompt('原文第一段\n第二段完整内容'), uri = referenceUri('prompt', prompt.id)
  const first = await f.ok('resolve', { uri, full: true, limit: 5 })
  expect(first.body).toBe(prompt.content.slice(0, 5)); expect(first.nextOffset).toBe(5)
  expect((await f.ok('resolve', { uri })).body).toBeUndefined()
  expect((await f.call('resolve', { uri, full: true, offset: 5 })).error?.code).toBe('REVISION_CONFLICT')
  const rest = await f.ok('resolve', { uri, full: true, offset: 5, expectedRevision: first.card.revision })
  expect(first.body + rest.body).toBe(prompt.content)
  await savePromptTemplate(f.store, { id: prompt.id, expectedRevision: prompt.revision, name: prompt.name, content: '修改后的内容' })
  expect((await f.call('resolve', { uri, full: true, offset: 5, expectedRevision: first.card.revision })).error?.code).toBe('REVISION_CONFLICT')
  expect(await f.store.load('applicationOperations')).toEqual([])
})

it('reflects body edits/deletion immediately and never exposes missing endpoints in backlinks or graph', async () => {
  const f = await fixture(), target = await f.prompt('目标规则', '目标'), uri = referenceUri('prompt', target.id)
  const source = await f.prompt(`[目标](${uri}) [隐藏](boai://ref/memory/private)`), sourceUri = referenceUri('prompt', source.id)
  expect(await f.ok('backlinks', { uri })).toMatchObject({ total: 1, items: [{ origin: 'body', from: sourceUri, to: uri }] })
  expect(await f.ok('outlinks', { uri: sourceUri })).toMatchObject({ total: 1 })
  const graph = await f.ok('graph', { uri, depth: 2 })
  expect(graph.objects).toHaveLength(2); expect(graph.edges).toHaveLength(1)
  expect(graph.objects.some((value: any) => value.kind === 'memory')).toBe(false)
  const changed = await savePromptTemplate(f.store, { id: source.id, expectedRevision: source.revision, name: source.name, content: '已去掉引用' })
  expect(await f.ok('backlinks', { uri })).toMatchObject({ total: 0 })
  await removePromptTemplate(f.store, { id: changed.id, expectedRevision: changed.revision })
  expect((await f.call('resolve', { uri: sourceUri })).error?.code).toBe('NOT_FOUND')
})

it('persists directed manual links, deduplicates writes and removes only manual relationships', async () => {
  const f = await fixture(), target = await f.prompt('目标'), to = referenceUri('prompt', target.id), source = await f.prompt(`[目标](${to})`), from = referenceUri('prompt', source.id)
  const first = await f.ok('link', { from, to }, employee, 'original')
  await f.restart()
  expect(await f.ok('link', { from, to }, employee, 'original')).toEqual(first)
  expect(await f.ok('link', { from, to })).toMatchObject({ changed: false, linked: true })
  expect(await f.ok('related', { uri: to })).toMatchObject({ total: 2 })
  expect(await f.ok('unlink', { from, to })).toMatchObject({ changed: true, linked: false })
  expect(await f.ok('backlinks', { uri: to })).toMatchObject({ total: 1, items: [{ origin: 'body' }] })
  expect(JSON.stringify(await f.store.load('applicationOperations'))).not.toContain(from)
  expect(JSON.stringify(await f.store.load('applicationOperations'))).not.toContain('目标')
})

it('requires the current scope, filters other employees tasks and marks partial collection coverage', async () => {
  const f = await fixture()
  expect((await f.call('search', { agentId: 'b' }, employee)).error?.code).toBe('NOT_FOUND')
  expect((await f.call('resolve', { uri: 'boai://ref/task/foreign' })).error?.code).toBe('NOT_FOUND')
  await f.store.write([{ collection: 'agentTasks', id: 'foreign', value: { id: 'foreign', agentId: 'other', conversationId: 'room', title: 'PRIVATE-TASK' } }])
  expect(await f.ok('search', { kind: 'task' })).toMatchObject({ total: 0 })
  const prompt = await f.prompt('目标'), uri = referenceUri('prompt', prompt.id)
  await f.ok('link', { from: uri, to: 'boai://ref/employee/a' }, employee, 'retained')
  await f.store.transaction(tx => clearApplicationReceipts(tx, { conversationId: 'room' }))
  expect(await f.store.load('agentReferenceLinks')).toEqual([])
  expect(await f.service.receipt('retained', employee)).toMatchObject({ status: 'cleared' })
  const base = await f.load(scope, owner)
  expect(base.coverage.complete).toBe(true)
  const partial = await collectReferenceSources(f.store, { agent: { id: 'a' } as DigitalAgent, conversation: { id: 'room' } as Conversation, messages: async () => [], memories: async () => [], skills: async () => ({ items: [], unavailable: 2 }) }, ['skill'])
  expect(partial.coverage).toMatchObject({ complete: false, unavailableSkills: 2 })
})

it('invalidates search cursors instead of silently skipping changed source pages', async () => {
  const f = await fixture(), firstPrompt = await f.prompt('甲'), second = await f.prompt('乙')
  const first = await f.ok('search', { kind: 'prompt', limit: 1 })
  expect(first.nextCursor).toBeTruthy()
  const next = await f.ok('search', { kind: 'prompt', limit: 1, cursor: first.nextCursor })
  expect(new Set([first.items[0].id, next.items[0].id])).toEqual(new Set([firstPrompt.id, second.id]))
  await f.prompt('丙')
  expect((await f.call('search', { kind: 'prompt', limit: 1, cursor: first.nextCursor })).error?.code).toBe('REVISION_CONFLICT')
})

it('keeps a late link receipt cleared when its source conversation is cleared before completion', async () => {
  const f = await fixture(), prompt = await f.prompt('原文'), uri = referenceUri('prompt', prompt.id)
  const operations = referenceOperations(f.store, f.load).map(operation => operation.name !== 'refs.link' ? operation : { ...operation, execute: async (...args: Parameters<typeof operation.execute>) => {
    const data = await operation.execute(...args)
    await f.store.transaction(tx => clearApplicationReceipts(tx, { conversationId: 'room' })); return data
  } })
  const delayed = new ApplicationService(f.store, operations, async () => {})
  expect(await delayed.call({ operation: 'refs.link', input: { ...scope, from: uri, to: 'boai://ref/employee/a' }, requestId: 'late' })).toMatchObject({ status: 'cleared' })
  expect(await f.store.load('agentReferenceLinks')).toEqual([])
})

it('uses actual AppService message scope, source cards and history cleanup without extra Work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-ref-runtime-')); clean.push(() => rm(root, { recursive: true, force: true }))
  let failure: unknown, turn = 0, savedUri = '', receivedCard = false, roomId = ''
  const owned = await startOwnedRuntime({ dataPath: root, skillDiscovery: { homeDir: root }, engine: { test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }), run: async ctx => {
    try {
      if (++turn === 1) {
        expect((await ctx.application!.catalog({ domain: 'refs', includeSchemas: true })).operations).toHaveLength(9)
        const found: any = await ctx.application!.call({ operation: 'refs.search', input: { kind: 'message', query: '原始句子' } })
        expect(found.status).toBe('succeeded'); expect(found.data.total).toBe(1)
        savedUri = found.data.items[0].uri
        expect(await ctx.application!.call({ operation: 'refs.resolve', input: { uri: savedUri, conversationId: 'other' } })).toMatchObject({ status: 'rejected' })
      } else if (turn === 2) {
        receivedCard = JSON.stringify(ctx.bootstrap).includes('Referenced objects') && JSON.stringify(ctx.bootstrap).includes('原始句子')
        const read: any = await ctx.application!.call({ operation: 'refs.resolve', input: { uri: savedUri, full: true } })
        expect(read.data.body).toBe('原始句子：只读即可。')
        expect(await ctx.application!.call({ operation: 'refs.backlinks', input: { uri: savedUri } })).toMatchObject({ status: 'succeeded', data: { total: 1 } })
      }
      await ctx.onDelta('已读取。')
    } catch (error) { failure = error; throw error }
  } }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }); clean.push(owned.close)
  await owned.service.handle('executeApplicationOperation', { operation: 'connections.create', input: { name: 'unused', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, requestId: 'connection' })
  const room = await owned.service.handle('startCoreConversation', { content: '原始句子：只读即可。', requestId: 'first' }) as Conversation; roomId = room.id
  const idle = async () => { await expect.poll(async () => (await owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === roomId)?.activity).toBe('idle'); expect(failure).toBeUndefined() }
  await idle()
  await owned.service.handle('sendMessage', { conversationId: room.id, content: `请读取[原句](${savedUri})`, mentionIds: [], requestId: 'second' })
  await idle(); expect(receivedCard).toBe(true)
  const other = await owned.service.handle('startCoreConversation', { content: '建立另一个范围', requestId: 'other' }) as Conversation
  await expect.poll(async () => (await owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === other.id)?.activity).toBe('idle')
  expect(failure).toBeUndefined()
  await owned.service.handle('createConversation', { id: other.id, kind: other.kind, title: other.title, agentIds: other.agentIds, memoryScope: 'conversation' })
  const privateQuery = { agentId: 'bobo', scope: 'conversation', conversationId: other.id }
  const privateView: any = await owned.service.handle('getMemory', privateQuery)
  const saved: any = await owned.service.handle('saveMemory', { ...privateQuery, content: 'PRIVATE-MEMORY-CANARY', useScope: 'conversation', expectedEpoch: privateView.epoch })
  const privateId = saved.entries.find((entry: any) => entry.content === 'PRIVATE-MEMORY-CANARY').id
  const ref = (operation: string, extra: object = {}) => owned.service.handle('executeApplicationOperation', { operation: 'refs.' + operation, input: { agentId: 'bobo', conversationId: room.id, ...extra } })
  expect(await ref('search', { kind: 'memory', query: 'PRIVATE-MEMORY-CANARY' })).toMatchObject({ status: 'succeeded', data: { total: 0 } })
  expect(await ref('resolve', { uri: referenceUri('memory', privateId), full: true })).toMatchObject({ status: 'rejected', error: { code: 'NOT_FOUND' } })
  const permitted: any = await owned.service.handle('executeApplicationOperation', { operation: 'refs.resolve', input: { agentId: 'bobo', conversationId: other.id, uri: referenceUri('memory', privateId), full: true } })
  expect(permitted.data.body).toBe('PRIVATE-MEMORY-CANARY')
  await owned.service.handle('deleteMemory', { ...privateQuery, id: privateId, expectedEpoch: saved.epoch })
  expect(await owned.service.handle('executeApplicationOperation', { operation: 'refs.resolve', input: { agentId: 'bobo', conversationId: other.id, uri: referenceUri('memory', privateId) } })).toMatchObject({ status: 'rejected' })
  await owned.service.handle('clearConversationHistory', { id: room.id, hide: false })
  expect(await owned.service.handle('executeApplicationOperation', { operation: 'refs.resolve', input: { agentId: 'bobo', conversationId: room.id, uri: savedUri, full: true } })).toMatchObject({ status: 'rejected', error: { code: 'NOT_FOUND' } })
})

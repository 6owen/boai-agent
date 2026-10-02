/*
 * [INPUT]: 真实 ProductStore/SQLite 中万条中文历史、材料/成果受管原件与来源校验、发布事务完成身份和类型化分页过滤。
 * [OUTPUT]: 普通聊天附件按当前成员在SQL分页/正文候选/覆盖/失败前过滤，旧分享材料不扩权；成员与deliveryScope变更同事务使旧检索游标失效。
 * [OUTPUT]: R1 相关性/多词游标保持历史与来源不变量；隐藏会话及四类来源在 SQL 分页前和点击拒绝、隐藏后游标继续可见来源/显式恢复才可搜、校验竞态不泄漏旧名称正文；固定窗口跨会话目标、已删除目标及校验前后删除均只返回原身份无游标空页、不报提示或回退旧正文；隐藏不撤销内部明确历史核读授权，材料撤权仍拒绝正文；四类统一检索与原会话只读定位；会话名称按真实成员及 lastMessageAt/createdAt 在 LIMIT 前筛选、同名会话不合并；同文/同名不合并、稳定搜索/消息游标、候选读取后删除的有界补页与目标不猜测、清理/来源撤权/原件外改门禁、当前完成 epoch/事务内按完成顺序返回首条未读、浏览限额与跨筛选游标拒绝的意图验证。
 * [POS]: tests/conversation-search.test.ts；D6 固定 SQL 离线持久化验收，不调用模型或 Electron。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Conversation, DigitalAgent, Message, WorkItem } from '../src/shared/domain'
import type { ConversationMaterial, MaterialReadRef } from '../src/shared/domain/materials'
import type { ArtifactPublication, ArtifactRegistration, ArtifactVersion } from '../src/shared/domain/artifacts'
import type { ConversationCompletion, ConversationSearchCursor, ConversationSearchQuery } from '../src/shared/domain/reading'
import { ProductStore, type StoredRecord } from '../src/runtime/adapters/storage/product-store'
import { conversationSearchSql, firstUnreadCompletionSql, type ConversationSearchSqlRow } from '../src/runtime/modules/conversations/reading-sql'
import { ConversationSearchRepository, type ConversationSourceHooks } from '../src/runtime/modules/conversations/search-repository'
import { ConversationReadingRepository } from '../src/runtime/modules/conversations/reading-repository'
import { MaterialRepository } from '../src/runtime/modules/materials/material-repository'
import { materialDirectory } from '../src/runtime/modules/materials/material-files'
import { ArtifactRepository } from '../src/runtime/modules/workspaces/artifact-repository'
import { SEARCH_INDEX_LIMITS } from '../src/shared/domain/reading'
import { SEARCH_INDEX_COLLECTION, type SearchBodyRecord } from '../src/runtime/modules/conversations/search-index-sql'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const time = (sequence = 0) => new Date(Date.UTC(2026, 9, 1, 0, 0, sequence)).toISOString()
const conversation = (id = 'chat'): Conversation => ({ id, title: `真实会话 ${id}`, kind: 'group', agentIds: ['alice', 'bob'], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: time(), updatedAt: time() })
const message = (id: string, sequence = 1, patch: Partial<Message> = {}): Message => ({ id, conversationId: 'chat', senderType: 'agent', senderId: 'alice', senderName: '作者', content: '季度核对：这是相同的中文正文。', sequence, createdAt: time(sequence), status: 'completed', ...patch })
const material = (id: string, patch: Partial<ConversationMaterial> = {}): ConversationMaterial => ({ id, conversationId: 'chat', name: '季度核对.md', format: 'markdown', size: 10, status: 'ready', authorizedAgentIds: ['alice'], revision: 1, contentHash: 'a'.repeat(64), parseVersion: 'text-v1', createdAt: time(1), messageId: 'sent-material-message', ...patch })
const artifact = (id: string, patch: Partial<ArtifactVersion> = {}): ArtifactVersion => ({ id, conversationId: 'chat', name: '季度核对.md', path: `/managed/${id}`, size: 10, ownerAgentId: 'alice', publishedAt: time(1), logicalArtifactId: id, contentVersion: 1, contentHash: 'b'.repeat(64), contentStatus: 'ready', managedRelativePath: `artifacts/${id}/季度核对.md`, registrationSource: 'publication', ...patch })
const record = <T extends { id: string }>(collection: string, value: T): StoredRecord => ({ collection, id: value.id, value })
const query = (patch: Partial<ConversationSearchQuery> = {}): ConversationSearchQuery & { limit: number } => ({ keyword: '季度核对', scope: 'all', limit: 40, ...patch })
const cursor = (row: ConversationSearchSqlRow): ConversationSearchCursor => ({ time: row.time, id: row.id, kind: row.kind as ConversationSearchCursor['kind'], queryKey: 'repository-owned-key', score: row.score })
const identity = (rows: ConversationSearchSqlRow[]) => rows.map(row => `${row.kind}:${row.id}`)
const messages = async (store: ProductStore, input: Parameters<ProductStore['conversationMessageRows']>[0]) => (await store.conversationMessageRows(input)).map(row => ({ message: JSON.parse(row.source) as Message, completion: row.completion ? JSON.parse(row.completion) as ConversationCompletion : null }))
const noSources: ConversationSourceHooks = { validateMessage: async () => {}, validateMaterial: async () => {}, validateArtifact: async () => {} }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
async function database() {
  const root = await mkdtemp(join(tmpdir(), 'boai-conversation-search-')); roots.push(root)
  const store = new ProductStore(join(root, 'boai.sqlite')); stores.push(store); await store.init()
  await store.write([record('conversations', conversation()), record('conversations', conversation('other'))])
  return store
}

async function sourceDatabase(extraHooks: Partial<ConversationSourceHooks> = {}) {
  const store = await database(), root = await realpath(dirname(store.filename)), materials = new MaterialRepository(store, root)
  const artifacts = new ArtifactRepository(store, root, { validateSources: (refs, agentId, conversationId, tx) => materials.validateRefsInTransaction(tx, refs, agentId, conversationId) })
  const hooks: ConversationSourceHooks = {
    validateMessage: (value, chat) => store.transaction(tx => materials.validateRefsInTransaction(tx, value.materialSources ?? [], value.senderType === 'agent' ? value.senderId : undefined, chat.id)),
    validateMaterial: async value => { await materials.preview(value.id, value.revision) },
    validateArtifact: async value => { if (!value.contentHash) throw new Error('成果缺少可信内容身份'); await store.transaction(tx => artifacts.validateCurrentArtifact(tx, value.id, value.contentHash!)) },
    readMaterialText: async value => (await materials.preview(value.id, value.revision)).text,
    readArtifactText: async value => (await store.transaction(tx => artifacts.readSearchText(tx, value.id, value.contentHash!))).text,
    ...extraHooks,
  }
  const search = new ConversationSearchRepository(store, hooks)
  const alice: DigitalAgent = { id: 'alice', name: '作者', role: 'writer', instructions: '', color: '', connectionId: 'local', modelId: 'fixture', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 }
  await store.write([record('agents', alice), record('connections', { id: 'local', name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1/v1', defaultModel: 'fixture', hasApiKey: false })])
  const attach = async (id = 'source', text = '季度核对：本人私有材料原文。') => {
    const directory = join(root, 'inputs', id); await mkdir(directory, { recursive: true }); const path = join(directory, '季度核对.md'); await writeFile(path, text)
    const prepared = await materials.prepare({ conversationId: 'chat', path, requestId: `prepare-${id}`, authorizedAgentIds: ['alice'] })
    const sent = message(`sent-${id}`, 1, { senderType: 'user', senderId: 'user', content: '请核对这份材料。', materialIds: [prepared.id] })
    await store.transaction(async tx => { await tx.put(record('messages', sent)); await materials.attach(tx, 'chat', sent.id, [{ id: prepared.id, revision: prepared.revision }]) })
    const current = (await materials.preview(prepared.id)).material
    const ref: MaterialReadRef = { id: current.id, conversationId: 'chat', revision: current.revision, contentHash: current.contentHash!, parseVersion: current.parseVersion }
    return { material: current, ref, sent, path: join(materialDirectory(root, 'chat', current.id), 'original') }
  }
  const publication = async (id: string, text = '# 季度核对\n真实成果原文。', refs?: MaterialReadRef[]): Promise<ArtifactPublication> => {
    const directory = join(root, 'workspaces', 'chat', 'artifacts', id); await mkdir(directory, { recursive: true }); const path = join(directory, '季度核对.md'); await writeFile(path, text)
    return { id, conversationId: 'chat', name: '季度核对.md', path, size: Buffer.byteLength(text), contentHash: hash(text), ownerAgentId: 'alice', publishedAt: time(2), ...(refs ? { materialSources: refs } : {}) }
  }
  const register = async (id: string, text?: string, refs?: MaterialReadRef[], binding: ArtifactRegistration = { conversationId: 'chat', revisionRequestId: null, sourceWorkId: null, sourceMessageId: null }) => {
    const input = await publication(id, text, refs); return store.transaction(tx => artifacts.register(tx, input, binding))
  }
  return { store, root, search, materials, artifacts, hooks, attach, register }
}

describe('D6 complete-history fixed SQL search', () => {
  it('excludes hidden conversations and every owned source before LIMIT for all optional filters and exact targets', async () => {
    const store = await database()
    await store.write([
      record('conversations', { ...conversation(), title: '季度核对 PRIVATE_HIDDEN_TITLE', list: { hidden: true }, lastMessageAt: time(100) }),
      record('conversations', { ...conversation('other'), title: '季度核对', agentIds: ['alice'] }),
      ...Array.from({ length: 100 }, (_, index) => record('messages', message(`hidden-${index}`, index + 10, { content: '季度核对 PRIVATE_HIDDEN_BODY' }))),
      record('materials', material('hidden-material', { createdAt: time(110) })), record('artifacts', artifact('hidden-artifact', { publishedAt: time(110) })),
      record('messages', message('safe-message', 1, { conversationId: 'other' })), record('materials', material('safe-material', { conversationId: 'other', createdAt: time(2) })), record('artifacts', artifact('safe-artifact', { conversationId: 'other', publishedAt: time(3) })),
    ])
    const first = await store.conversationSearchRows(query({ limit: 2 })), second = await store.conversationSearchRows(query({ limit: 2, before: cursor(first[1]) }))
    expect([...identity(first), ...identity(second)]).toEqual(['artifact:safe-artifact', 'material:safe-material', 'conversation:other', 'message:safe-message'])
    expect(JSON.stringify([...first, ...second])).not.toContain('PRIVATE_HIDDEN')
    expect(identity(await store.conversationSearchRows(query({ agentId: 'alice', from: time(1), to: time(110), kinds: ['message'], limit: 1 })))).toEqual(['message:safe-message'])
    expect(await store.conversationSearchRows(query({ scope: 'current', conversationId: 'chat', agentId: 'alice', kinds: ['conversation', 'message', 'material', 'artifact'] }))).toEqual([])
    for (const target of [{ kind: 'conversation' as const, id: 'chat' }, { kind: 'message' as const, id: 'hidden-99' }, { kind: 'material' as const, id: 'hidden-material' }, { kind: 'artifact' as const, id: 'hidden-artifact' }]) expect(await store.conversationSearchTarget({ ...target, conversationId: 'chat' })).toBeNull()
    expect(await store.load('messages')).toHaveLength(101); expect(await store.load('materials')).toHaveLength(2); expect(await store.load('artifacts')).toHaveLength(2)
  })

  it('searches conversation names with messages and both file sources by default while retaining each original identity', async () => {
    const store = await database()
    await store.write([
      record('conversations', { ...conversation(), title: '季度核对', lastMessageAt: time(2) }), record('conversations', { ...conversation('other'), title: '季度核对' }),
      record('messages', message('same')), record('materials', material('same')), record('artifacts', artifact('same')),
    ])
    const rows = await store.conversationSearchRows(query())
    expect(identity(rows)).toEqual(['conversation:chat', 'material:same', 'artifact:same', 'conversation:other', 'message:same'])
    const first = await store.conversationSearchRows(query({ limit: 2 })), second = await store.conversationSearchRows(query({ limit: 2, before: cursor(first[1]) })), third = await store.conversationSearchRows(query({ limit: 2, before: cursor(second[1]) }))
    expect([...identity(first), ...identity(second), ...identity(third)]).toEqual(identity(rows))
    expect(rows.filter(row => row.kind === 'conversation').every(row => row.completion === null)).toBe(true)
    expect(identity(await store.conversationSearchRows(query({ kinds: ['message', 'material', 'artifact'] })))).toEqual(['material:same', 'artifact:same', 'message:same'])
    expect(identity(await store.conversationSearchRows(query({ scope: 'current', conversationId: 'chat' })))).toEqual(['conversation:chat', 'material:same', 'artifact:same', 'message:same'])
  })

  it('filters conversation titles by current member IDs and last-message time or creation fallback before LIMIT', async () => {
    const store = await database()
    await store.write([
      record('conversations', { ...conversation(), title: '季度核对', agentIds: ['alice'], lastMessageAt: time(2), updatedAt: time(99) }),
      record('conversations', { ...conversation('other'), title: '季度核对 alice', agentIds: ['bob'], lastMessageAt: time(3) }),
      record('conversations', { ...conversation('empty'), title: '季度核对', agentIds: ['alice'], createdAt: time(1), updatedAt: time(99) }),
      { collection: 'conversations', id: 'mismatched', value: { ...conversation('different-id'), title: '季度核对', agentIds: ['alice'], lastMessageAt: time(2) } },
    ])
    const filters = { agentId: 'alice', from: time(1), to: time(2), kinds: ['conversation'] as ConversationSearchQuery['kinds'], limit: 1 }
    const first = await store.conversationSearchRows(query(filters)), second = await store.conversationSearchRows(query({ ...filters, before: cursor(first[0]) }))
    expect(identity(first)).toEqual(['conversation:chat']); expect(first[0].time).toBe(time(2))
    expect(identity(second)).toEqual(['conversation:empty']); expect(second[0].time).toBe(time(1))
    expect(identity(await store.conversationSearchRows(query({ kinds: ['conversation'], agentId: 'bob' })))).toEqual(['conversation:other'])
    expect(await store.conversationSearchRows(query({ kinds: ['conversation'], agentId: 'missing' }))).toEqual([])
    expect(await store.conversationSearchTarget({ kind: 'conversation', id: 'chat', conversationId: 'other' })).toBeNull()
    expect(await store.conversationSearchTarget({ kind: 'conversation', id: 'mismatched', conversationId: 'mismatched' })).toBeNull()
  })

  it('filters ten thousand Chinese rows before LIMIT and finds old exact identities beyond the recent page', async () => {
    const store = await database()
    await store.write(Array.from({ length: 10_000 }, (_, i) => record('messages', message(`m-${String(i).padStart(5, '0')}`, i, {
      conversationId: i % 2 ? 'other' : 'chat', senderId: i % 2 ? 'bob' : 'alice', content: i < 5 || i === 9998 ? `季度核对：第 ${i} 条中文历史` : `普通中文历史第 ${i} 条`,
    }))))
    const filters = { scope: 'current' as const, conversationId: 'chat', agentId: 'alice', from: time(0), to: time(4), limit: 2 }
    const first = await store.conversationSearchRows(query(filters))
    expect(identity(first)).toEqual(['message:m-00004', 'message:m-00002'])
    const second = await store.conversationSearchRows(query({ ...filters, before: cursor(first[1]) }))
    expect(identity(second)).toEqual(['message:m-00000'])
    expect((await messages(store, { conversationId: 'chat', before: { sequence: 5000, id: 'm-05000' }, limit: 3 })).map(row => row.message.id)).toEqual(['m-04998', 'm-04996', 'm-04994'])
    expect(await store.conversationSearchTarget({ kind: 'message', conversationId: 'chat', id: 'm-00000' })).toMatchObject({ id: 'm-00000', source: JSON.stringify(message('m-00000', 0, { content: '季度核对：第 0 条中文历史' })) })
    expect((await store.load('messages'))).toHaveLength(10_000)
  }, 30_000)

  it('keeps identical text as distinct messages and resumes an old page when a newer result arrives', async () => {
    const store = await database()
    await store.write(['a', 'b', 'c'].map(id => record('messages', message(id, 1))))
    const first = await store.conversationSearchRows(query({ limit: 2 }))
    expect(identity(first)).toEqual(['message:c', 'message:b'])
    await store.write([record('messages', message('new', 2))])
    expect(identity(await store.conversationSearchRows(query({ limit: 2, before: cursor(first[1]) })))).toEqual(['message:a'])
    expect(JSON.parse((await store.conversationSearchTarget({ kind: 'message', id: 'b', conversationId: 'chat' }))!.source).id).toBe('b')
  })

  it('retains same-name files and each historical artifact version instead of guessing the latest file', async () => {
    const store = await database()
    const old = artifact('v1', { logicalArtifactId: 'family', contentVersion: 1 }), latest = artifact('v2', { logicalArtifactId: 'family', contentVersion: 2, previousArtifactId: 'v1', publishedAt: time(2) })
    await store.write([record('materials', material('input-a')), record('materials', material('input-b', { contentHash: 'c'.repeat(64) })), record('artifacts', old), record('artifacts', latest)])
    expect(identity(await store.conversationSearchRows(query()))).toEqual(['artifact:v2', 'artifact:v1', 'material:input-b', 'material:input-a'])
    const target = await store.conversationSearchTarget({ kind: 'artifact', id: 'v1', conversationId: 'chat' })
    expect(JSON.parse(target!.source)).toEqual(old)
    expect(await store.conversationSearchTarget({ kind: 'material', id: 'v1', conversationId: 'chat' })).toBeNull()
  })

  it('uses kind as the final stable cursor key when time and ID are identical across source collections', async () => {
    const store = await database()
    await store.write([record('messages', message('same', 1)), record('materials', material('same')), record('artifacts', artifact('same'))])
    const first = await store.conversationSearchRows(query({ limit: 1 })), second = await store.conversationSearchRows(query({ limit: 1, before: cursor(first[0]) })), third = await store.conversationSearchRows(query({ limit: 1, before: cursor(second[0]) }))
    expect([...identity(first), ...identity(second), ...identity(third)]).toEqual(['material:same', 'artifact:same', 'message:same'])
    expect(await store.conversationSearchRows(query({ limit: 1, before: cursor(third[0]) }))).toEqual([])
  })

  it('filters employee identities for each source without treating a matching display name or system sender as that employee', async () => {
    const store = await database()
    await store.write([
      record('messages', message('alice-message', 1)), record('messages', message('bob-message', 2, { senderId: 'bob', senderName: 'alice' })), record('messages', message('system-message', 3, { senderType: 'system', senderId: 'alice' })),
      record('materials', material('alice-material')), record('materials', material('bob-material', { authorizedAgentIds: ['bob'], createdAt: time(2) })),
      record('artifacts', artifact('alice-artifact')), record('artifacts', artifact('bob-artifact', { ownerAgentId: 'bob', publishedAt: time(2) })),
      record('messages', message('other-alice', 4, { conversationId: 'other' })),
    ])
    expect(identity(await store.conversationSearchRows(query({ agentId: 'alice', scope: 'current', conversationId: 'chat' })))).toEqual(['material:alice-material', 'artifact:alice-artifact', 'message:alice-message'])
    expect(identity(await store.conversationSearchRows(query({ agentId: 'alice', kinds: ['message'] })))[0]).toBe('message:other-alice')
    expect(await store.conversationSearchRows(query({ agentId: 'missing' }))).toEqual([])
    expect(await store.conversationSearchRows(query({ scope: 'current' }))).toEqual([])
  })

  it('uses current conversation members for attachment pages, index candidates and failure coverage without expanding legacy grants', async () => {
    const store = await database()
    const shared = material('conversation-attachment', { deliveryScope: 'conversation', authorizedAgentIds: ['alice'] })
    const legacy = material('legacy-grant', { authorizedAgentIds: ['alice'], createdAt: time(10) })
    const wrongConversation = material('other-attachment', { conversationId: 'other', deliveryScope: 'conversation', authorizedAgentIds: ['bob'], createdAt: time(20) })
    const unknown = { ...material('unknown-delivery', { authorizedAgentIds: ['bob'], createdAt: time(30) }), deliveryScope: 'unsupported' }
    await store.write([
      record('conversations', { ...conversation(), agentIds: ['alice'] }), record('conversations', { ...conversation('other'), agentIds: ['alice'] }),
      record('materials', shared), record('materials', legacy), record('materials', wrongConversation), record('materials', unknown),
    ])
    const filters = query({ agentId: 'bob', kinds: ['material'], limit: 1 })
    expect(await store.conversationSearchRows(filters)).toEqual([])
    expect(await store.searchBodyCoverage(filters)).toMatchObject({ total: 0, pending: 0 })
    await store.write([record('conversations', { ...conversation(), agentIds: ['alice', 'bob'] })])
    // Denied legacy/other/malformed rows rank ahead, but must not consume this one-row page or backfill slot.
    expect(identity(await store.conversationSearchRows(filters))).toEqual(['material:conversation-attachment'])
    expect((await store.searchBodyCandidates(filters, 1)).map(value => value.id)).toEqual([shared.id])
    expect(await store.searchBodyCoverage(filters)).toMatchObject({ total: 1, pending: 1 })
    await store.write([shared, legacy, wrongConversation, unknown].map(value => record(SEARCH_INDEX_COLLECTION, {
      id: `material:${value.id}`, sourceId: value.id, kind: 'material', conversationId: value.conversationId, sourceValue: JSON.stringify(value), formatVersion: SEARCH_INDEX_LIMITS.formatVersion, status: 'failed', reason: '本地核读失败', checkedAt: time(),
    })))
    const coverage = await store.searchBodyCoverage(filters)
    expect(coverage).toMatchObject({ total: 1, failed: 1, pending: 0 })
    expect(coverage.failures?.map(value => value.id)).toEqual([shared.id])
    await store.write([record('conversations', { ...conversation(), agentIds: ['alice'] })])
    expect(await store.conversationSearchRows(filters)).toEqual([])
    expect(await store.searchBodyCandidates(filters, 1)).toEqual([])
    expect(await store.searchBodyCoverage(filters)).toMatchObject({ total: 0, failed: 0, pending: 0 })
  })

  it('advances attachment scope generations even without cached bodies and rejects continuation after a member change', async () => {
    const store = await database()
    const firstMaterial = material('scope-a', { deliveryScope: 'conversation' }), secondMaterial = material('scope-b', { deliveryScope: 'conversation', createdAt: time(2) })
    await store.write([record('materials', firstMaterial), record('materials', secondMaterial)])
    const filters = query({ agentId: 'alice', kinds: ['material'], limit: 1 })
    const before = (await store.searchBodyCoverage(filters)).indexRevision!
    expect(await store.load(SEARCH_INDEX_COLLECTION)).toEqual([])
    await store.transaction(async tx => { await tx.put(record('materials', { ...firstMaterial, deliveryScope: undefined })) })
    expect((await store.searchBodyCoverage(filters)).indexRevision).toBeGreaterThan(before)
    expect(await store.load(SEARCH_INDEX_COLLECTION)).toEqual([])
    const search = new ConversationSearchRepository(store, noSources), page = await search.search(filters)
    expect(page.nextCursor).toBeDefined()
    await store.transaction(async tx => {
      const current = await tx.get<Conversation>('conversations', 'chat')
      await tx.put(record('conversations', { ...current!, agentIds: ['alice'] }))
    })
    await expect(search.search({ ...filters, before: page.nextCursor })).rejects.toThrow('索引已更新')
    expect((await search.search(filters)).results).toHaveLength(1)
  })

  it('intersects kind, current conversation and inclusive time filters before taking even one result', async () => {
    const store = await database()
    await store.write([
      record('messages', message('before', 1)), record('messages', message('first-boundary', 2)), record('messages', message('last-boundary', 3)), record('messages', message('after', 4)),
      record('artifacts', artifact('new-artifact', { publishedAt: time(10) })), record('messages', message('other-new', 11, { conversationId: 'other' })),
    ])
    const filters = { scope: 'current' as const, conversationId: 'chat', kinds: ['message'] as const, from: time(2), to: time(3), limit: 1 }
    const first = await store.conversationSearchRows(query({ ...filters, kinds: [...filters.kinds] }))
    expect(identity(first)).toEqual(['message:last-boundary'])
    expect(identity(await store.conversationSearchRows(query({ ...filters, kinds: [...filters.kinds], before: cursor(first[0]) })))).toEqual(['message:first-boundary'])
    expect(await store.conversationSearchRows(query({ kinds: [] }))).toEqual([])
  })

  it('searches only sent materials and registered artifacts while retaining unavailable candidates for explicit host revalidation', async () => {
    const store = await database()
    await store.write([
      record('materials', material('sent')), record('materials', material('draft', { messageId: undefined })), record('materials', material('empty-link', { messageId: '' })), record('materials', material('revoked', { status: 'unavailable', error: '来源撤权', authorizedAgentIds: [] })),
      record('artifacts', artifact('registered')), record('artifacts', artifact('missing-original', { contentStatus: 'unavailable', contentError: '原件缺失' })),
      record('artifacts', { ...artifact('legacy'), registrationSource: undefined }), { collection: 'artifacts', id: 'missing-id', value: { ...artifact('missing-id'), id: undefined } },
    ])
    expect(identity(await store.conversationSearchRows(query()))).toEqual(['material:sent', 'material:revoked', 'artifact:registered', 'artifact:missing-original'])
    expect(await store.conversationSearchTarget({ kind: 'material', id: 'draft', conversationId: 'chat' })).toBeNull()
    expect(await store.conversationSearchTarget({ kind: 'artifact', id: 'legacy', conversationId: 'chat' })).toBeNull()
    expect(JSON.parse((await store.conversationSearchTarget({ kind: 'artifact', id: 'missing-original', conversationId: 'chat' }))!.source).contentStatus).toBe('unavailable')
  })

  it('does not search unfinished or failed private output but supports their exact history targets', async () => {
    const store = await database()
    const statuses: Message['status'][] = ['completed', 'streaming', 'failed', 'cancelled', 'interrupted']
    await store.write(statuses.map((status, i) => record('messages', message(status, i, { status }))))
    expect(identity(await store.conversationSearchRows(query()))).toEqual(['message:completed'])
    expect((await messages(store, { conversationId: 'chat', limit: 10 })).map(row => row.message.status)).toEqual([...statuses].reverse())
    expect(JSON.parse((await store.conversationSearchTarget({ kind: 'message', id: 'streaming', conversationId: 'chat' }))!.source).status).toBe('streaming')
  })

  it('joins a completion only by its real message, conversation and current clock epoch', async () => {
    const store = await database()
    const completion = (id: string, patch: Partial<ConversationCompletion> = {}): ConversationCompletion => ({ id, messageId: id, conversationId: 'chat', epoch: 2, ordinal: 1, contentHash: 'c'.repeat(64), completedAt: time(1), ...patch })
    await store.write([
      ...['current', 'old', 'foreign', 'wrong-message', 'missing'].map(id => record('messages', message(id, 1))),
      record('conversationCompletionClocks', { id: 'chat', conversationId: 'chat', epoch: 2, ordinal: 4, legacyCompletedUnknown: false }),
      record('conversationCompletions', completion('current')), record('conversationCompletions', completion('old', { epoch: 1 })), record('conversationCompletions', completion('foreign', { conversationId: 'other' })), record('conversationCompletions', completion('wrong-message', { messageId: 'current' })),
    ])
    const rows = await store.conversationSearchRows(query()), current = rows.find(row => row.id === 'current')!
    expect(JSON.parse(current.completion!)).toMatchObject({ messageId: 'current', epoch: 2, ordinal: 1 })
    expect(rows.filter(row => row.id !== 'current').every(row => row.completion === null)).toBe(true)
    expect((await messages(store, { conversationId: 'chat', limit: 10 })).filter(row => row.completion).map(row => row.message.id)).toEqual(['current'])
    await store.write([], [{ collection: 'conversationCompletionClocks', id: 'chat' }])
    expect((await store.conversationSearchRows(query())).every(row => row.completion === null)).toBe(true)
  })

  it('excludes a pending cleanup in every read even while original rows still exist', async () => {
    const store = await database()
    await store.write([record('messages', message('hidden')), record('materials', material('hidden-material')), record('artifacts', artifact('hidden-artifact')), record('messages', message('safe', 1, { conversationId: 'other' })), record('conversationCleanup', { id: 'chat' })])
    expect(identity(await store.conversationSearchRows(query()))).toEqual(['message:safe'])
    expect(await store.conversationMessageRows({ conversationId: 'chat', limit: 10 })).toEqual([])
    for (const target of [{ kind: 'message' as const, id: 'hidden' }, { kind: 'material' as const, id: 'hidden-material' }, { kind: 'artifact' as const, id: 'hidden-artifact' }]) expect(await store.conversationSearchTarget({ ...target, conversationId: 'chat' })).toBeNull()
    expect((await store.load('messages'))).toHaveLength(2)
  })

  it('requires the actual conversation and refuses wrong conversation, kind or missing identity instead of a similar result', async () => {
    const store = await database()
    await store.write([record('messages', message('same-text')), record('messages', message('other-same-text', 1, { conversationId: 'other' })), record('artifacts', artifact('same-name'))])
    expect(await store.conversationSearchTarget({ kind: 'message', id: 'same-text', conversationId: 'other' })).toBeNull()
    expect(await store.conversationSearchTarget({ kind: 'message', id: 'missing', conversationId: 'chat' })).toBeNull()
    expect(await store.conversationSearchTarget({ kind: 'artifact', id: 'same-text', conversationId: 'chat' })).toBeNull()
    await store.write([], [{ collection: 'conversations', id: 'chat' }])
    expect(identity(await store.conversationSearchRows(query()))).toEqual(['message:other-same-text'])
    expect(await store.conversationMessageRows({ conversationId: 'chat', limit: 10 })).toEqual([])
    expect(await store.conversationSearchTarget({ kind: 'message', id: 'same-text', conversationId: 'chat' })).toBeNull()
  })

  it('keeps keywords, identities, employee filters and cursor payloads as data without SQL injection', async () => {
    const store = await database(), payload = "' OR 1=1; DELETE FROM records; --"
    await store.write([record('messages', message('ordinary', 1)), record('messages', message('literal', 2, { content: `原文引用 ${payload}` }))])
    expect(identity(await store.conversationSearchRows(query({ keyword: payload })))).toEqual(['message:literal'])
    expect(await store.conversationSearchRows(query({ scope: 'current', conversationId: payload }))).toEqual([])
    expect(await store.conversationSearchRows(query({ agentId: payload }))).toEqual([])
    expect(await store.conversationSearchTarget({ kind: 'message', id: payload, conversationId: 'chat' })).toBeNull()
    expect(await store.conversationSearchRows(query({ from: payload, to: payload }))).toEqual([])
    const statement = conversationSearchSql(query({ keyword: payload, before: { time: time(1), id: payload, kind: 'message', queryKey: payload } }))
    expect(statement.sql).not.toContain(payload); expect(statement.args).toContain(payload)
    expect(await store.conversationSearchRows(query({ before: { time: time(0), id: payload, kind: 'message', queryKey: payload } }))).toEqual([])
    expect((await store.load('messages'))).toHaveLength(2); expect((await store.load('conversations'))).toHaveLength(2)
  })
})

describe('D6 real message history keyset pages', () => {
  it('orders sequence and ID consistently in both directions without skipping same-sequence neighbors', async () => {
    const store = await database()
    await store.write([record('messages', message('old', 1)), ...['a', 'b', 'c'].map(id => record('messages', message(id, 2))), record('messages', message('new', 3)), record('messages', message('foreign', 4, { conversationId: 'other' }))])
    expect((await messages(store, { conversationId: 'chat', limit: 2 })).map(row => row.message.id)).toEqual(['new', 'c'])
    expect((await messages(store, { conversationId: 'chat', before: { sequence: 2, id: 'c' }, limit: 2 })).map(row => row.message.id)).toEqual(['b', 'a'])
    expect((await messages(store, { conversationId: 'chat', after: { sequence: 2, id: 'a' }, limit: 2 })).map(row => row.message.id)).toEqual(['b', 'c'])
    expect((await messages(store, { conversationId: 'chat', after: { sequence: 2, id: 'c' }, limit: 2 })).map(row => row.message.id)).toEqual(['new'])
    await store.write([], [{ collection: 'messages', id: 'c' }])
    expect((await messages(store, { conversationId: 'chat', before: { sequence: 2, id: 'c' }, limit: 2 })).map(row => row.message.id)).toEqual(['b', 'a'])
  })

  it('does not interpret a cursor ID or conversation as a query fragment and never edits history on reads', async () => {
    const store = await database(), payload = "z'); DROP TABLE records; --"
    await store.write([record('messages', message('a', 1)), record('messages', message('b', 1)), record('messages', message('next', 2))])
    expect((await messages(store, { conversationId: 'chat', before: { sequence: 1, id: payload }, limit: 10 })).map(row => row.message.id)).toEqual(['b', 'a'])
    expect((await messages(store, { conversationId: 'chat', after: { sequence: 1, id: payload }, limit: 10 })).map(row => row.message.id)).toEqual(['next'])
    expect(await store.conversationMessageRows({ conversationId: payload, limit: 10 })).toEqual([])
    expect(await store.load('conversationCompletions')).toEqual([]); expect(await store.load('conversationReadingStates')).toEqual([])
    expect((await store.load('messages'))).toHaveLength(3)
  })
})

describe('D6 current-source personal browsing repository', () => {
  it('rechecks hidden scope for old targets and continuation pages without deleting retained history or restoring a conversation', async () => {
    const store = await database(), search = new ConversationSearchRepository(store, noSources)
    await store.write([
      record('conversations', { ...conversation(), title: '季度核对 PRIVATE_HIDDEN_TITLE' }),
      record('messages', message('to-hide', 10, { content: '季度核对 PRIVATE_HIDDEN_BODY' })), record('materials', material('to-hide-material')), record('artifacts', artifact('to-hide-artifact')),
      record('messages', message('safe', 9, { conversationId: 'other' })),
    ])
    const original = await search.search(query()), hiddenTargets = original.results.filter(item => item.conversationId === 'chat').map(item => item.target)
    expect(hiddenTargets).toHaveLength(4)
    const first = await search.search(query({ limit: 1 })); expect(first.results[0].id).toBe('to-hide-material')
    await store.write([record('conversations', { ...conversation(), title: '季度核对 PRIVATE_HIDDEN_TITLE', list: { hidden: true } })])
    const continued = await search.search(query({ limit: 1, before: first.nextCursor }))
    expect(continued.results.map(item => item.id)).toEqual(['safe']); expect(JSON.stringify(continued)).not.toContain('PRIVATE_HIDDEN')
    expect((await search.search(query({ scope: 'current', conversationId: 'chat' }))).results).toEqual([])
    for (const target of hiddenTargets) await expect(search.resolve(target)).rejects.toThrow('已被清理或不可用')
    expect((await store.load<Conversation>('conversations')).find(item => item.id === 'chat')?.list?.hidden).toBe(true)
    expect(await store.load('messages')).toHaveLength(2); expect(await store.load('materials')).toHaveLength(1); expect(await store.load('artifacts')).toHaveLength(1)
    for (const collection of ['workItems', 'workBudgets', 'runs', 'turns', 'conversationReadingStates']) expect(await store.load(collection)).toEqual([])
    await store.write([record('conversations', { ...conversation(), title: '季度核对 PRIVATE_HIDDEN_TITLE', list: { hidden: false } })])
    expect((await search.search(query())).results).toHaveLength(original.results.length)
    expect(await search.resolve(hiddenTargets.find(target => target.kind === 'message')!)).toMatchObject({ status: 'available', excerpt: '季度核对 PRIVATE_HIDDEN_BODY' })
  })

  it('rejects a target hidden during source validation instead of returning its old conversation title or body', async () => {
    const store = await database()
    await store.write([record('conversations', { ...conversation(), title: 'PRIVATE_HIDDEN_TITLE' }), record('messages', message('changing', 1, { content: '季度核对 PRIVATE_HIDDEN_BODY' }))])
    const hidden = new ConversationSearchRepository(store, { ...noSources, validateMessage: async () => {
      await store.write([record('conversations', { ...conversation(), title: 'PRIVATE_HIDDEN_TITLE', list: { hidden: true } })])
    } })
    let failure: unknown
    try { await hidden.resolve({ kind: 'message', conversationId: 'chat', messageId: 'changing' }) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(Error); expect((failure as Error).message).toContain('隐藏')
    expect(String(failure)).not.toContain('PRIVATE_HIDDEN')
    expect((await hidden.search(query())).results).toEqual([])
    await store.write([record('conversations', { ...conversation(), title: 'PRIVATE_HIDDEN_TITLE' })])
    const raced = await hidden.search(query())
    expect(raced.results).toEqual([]); expect(JSON.stringify(raced)).not.toContain('PRIVATE_HIDDEN')
    expect(await store.load('messages')).toHaveLength(1); expect(await store.load('workItems')).toEqual([])
  })

  it('keeps authorized exact hidden history available without allowing hidden search or bypassing material source revocation', async () => {
    const { store, search, materials, attach } = await sourceDatabase(), source = await attach()
    const original = message('hidden-authorized', 2, { content: '季度核对：真实获准派生正文。', materialSources: [source.ref] })
    await store.write([record('messages', original), record('conversations', { ...conversation(), list: { hidden: true } })])
    expect((await search.search(query())).results).toEqual([])
    await expect(search.resolve({ kind: 'message', conversationId: 'chat', messageId: original.id })).rejects.toThrow('已被清理或不可用')
    const current = await search.messagePage({ conversationId: 'chat', aroundMessageId: original.id, limit: 1 })
    expect(current.items).toHaveLength(1); expect(current.items[0]).toMatchObject({ status: 'available', message: original })
    await materials.authorize(source.material.id, source.material.revision, [])
    const revoked = await search.messagePage({ conversationId: 'chat', aroundMessageId: original.id, limit: 1 })
    expect(revoked.items[0]).toMatchObject({ messageId: original.id, status: 'unavailable' }); expect(revoked.items[0].message).toBeUndefined()
    expect(JSON.stringify(revoked)).not.toContain(original.content)
    expect((await store.load<Conversation>('conversations')).find(item => item.id === 'chat')?.list?.hidden).toBe(true)
    expect(await store.load('workItems')).toEqual([]); expect(await store.load('conversationReadingStates')).toEqual([])
  })

  it('resolves a conversation by its original ID, rechecks its current title and never creates reading or business state', async () => {
    const store = await database(), search = new ConversationSearchRepository(store, {
      validateMessage: async () => { throw new Error('title search must not read message sources') },
      validateMaterial: async () => { throw new Error('title search must not read material originals') },
      validateArtifact: async () => { throw new Error('title search must not read artifact originals') },
    })
    await store.write([record('conversations', { ...conversation(), title: '季度核对' }), record('conversations', { ...conversation('other'), title: '季度核对' })])
    const first = await search.search(query({ limit: 1 })), target = first.results[0].target
    expect(first.results[0]).toMatchObject({ kind: 'conversation', id: 'other', name: '季度核对', target: { kind: 'conversation', conversationId: 'other' }, status: 'available' })
    expect(first.results[0].excerpt).toBeUndefined(); expect(first.results[0].completion).toBeUndefined()
    expect((await search.search(query({ limit: 1, before: first.nextCursor }))).results.map(result => result.id)).toEqual(['chat'])
    await expect(search.search(query({ kinds: ['message'], before: first.nextCursor }))).rejects.toThrow('游标与当前条件')
    await store.write([record('conversations', { ...conversation('other'), title: '已更名的原会话' })])
    expect(await search.resolve(target)).toMatchObject({ id: 'other', conversationTitle: '已更名的原会话', name: '已更名的原会话', target, status: 'available' })
    expect((await search.search(query())).results.map(result => result.id)).toEqual(['chat'])
    for (const collection of ['messages', 'workItems', 'workBudgets', 'runs', 'turns', 'conversationCompletions', 'conversationReadingStates']) expect(await store.load(collection)).toEqual([])
    await store.write([record('conversationCleanup', { id: 'other' })])
    await expect(search.resolve(target)).rejects.toThrow('已被清理或不可用')
    await store.write([], [{ collection: 'conversations', id: 'chat' }])
    expect((await search.search(query())).results).toEqual([])
    await expect(search.resolve({ kind: 'conversation', conversationId: 'chat' })).rejects.toThrow('已被清理或不可用')
  })

  it('enforces keyword and page bounds and treats Unicode keyword characters consistently', async () => {
    const store = await database(), search = new ConversationSearchRepository(store, noSources), keyword = '核'.repeat(200)
    await store.write([record('messages', message('long-keyword', 1, { content: keyword })), ...Array.from({ length: 100 }, (_, i) => record('messages', message(`bounded-${i}`, i)))])
    expect((await search.search(query({ keyword }))).results.map(result => result.id)).toEqual(['long-keyword'])
    const page = await search.search(query({ limit: 80 })); expect(page.results).toHaveLength(80); expect(page.nextCursor?.queryKey).toBe(page.queryKey)
    for (const keyword of ['', '  ', '核'.repeat(201)]) await expect(search.search(query({ keyword }))).rejects.toThrow('200')
    for (const limit of [0, -1, 81, 1.5, Infinity]) await expect(search.search(query({ limit }))).rejects.toThrow('80')
    await expect(search.messagePage({ conversationId: 'chat', limit: 81 })).rejects.toThrow('80')
    await expect(search.search(query({ from: "'; DROP TABLE records --" }))).rejects.toThrow('时间')
    await expect(search.search(query({ from: time(2), to: time(1) }))).rejects.toThrow('开始时间')
  })

  it('rejects a reused cursor after any search filter changes while allowing a page-size change', async () => {
    const store = await database(), search = new ConversationSearchRepository(store, noSources)
    await store.write([record('messages', message('a', 1)), record('messages', message('b', 2)), record('messages', message('c', 3))])
    const first = await search.search(query({ limit: 1 })), before = first.nextCursor!
    expect((await search.search(query({ limit: 2, before }))).results.map(result => result.id)).toEqual(['b', 'a'])
    for (const patch of [{ keyword: '不同正文' }, { scope: 'current' as const, conversationId: 'chat' }, { agentId: 'alice' }, { from: time() }, { to: time(10) }, { kinds: ['message' as const] }]) await expect(search.search(query({ ...patch, before }))).rejects.toThrow('游标与当前条件')
    await expect(search.search(query({ before: { ...before, id: "'; DROP TABLE records --" } }))).rejects.toThrow('标识')
    expect(await store.load('messages')).toHaveLength(3)
  })

  it('browses multiple pages among ten thousand repeated messages and opens the exact old message window', async () => {
    const store = await database(), search = new ConversationSearchRepository(store, noSources)
    await store.write(Array.from({ length: 10_000 }, (_, i) => record('messages', message(`m-${String(i).padStart(5, '0')}`, i))))
    const first = await search.search(query({ limit: 40 })), second = await search.search(query({ limit: 40, before: first.nextCursor })), third = await search.search(query({ limit: 40, before: second.nextCursor }))
    const allIds = [...first.results, ...second.results, ...third.results].map(result => result.id)
    expect(allIds).toHaveLength(120); expect(new Set(allIds).size).toBe(120)
    expect(first.results.at(-1)?.id).toBe('m-09960'); expect(second.results[0].id).toBe('m-09959'); expect(third.results.at(-1)?.id).toBe('m-09880')
    const target = { kind: 'message' as const, conversationId: 'chat', messageId: 'm-00001' }
    expect(await search.resolve(target)).toMatchObject({ id: 'm-00001', target, status: 'available', excerpt: message('m-00001').content })
    const around = await search.messagePage({ conversationId: 'chat', aroundMessageId: 'm-00001', limit: 3 })
    expect(around.items.map(item => item.messageId)).toEqual(['m-00000', 'm-00001', 'm-00002']); expect(around.targetMessageId).toBe('m-00001')
    expect(await search.messagePage({ conversationId: 'other', aroundMessageId: 'm-00001', limit: 3 })).toEqual({ conversationId: 'other', items: [], targetMessageId: 'm-00001' })
    await store.write([], [{ collection: 'messages', id: 'm-00001' }])
    expect(await search.messagePage({ conversationId: 'chat', aroundMessageId: 'm-00001', limit: 3 })).toEqual({ conversationId: 'chat', items: [], targetMessageId: 'm-00001' })
    await expect(search.resolve(target)).rejects.toThrow('已被清理或不可用')
    expect(await store.load('conversationReadingStates')).toEqual([]); expect(await store.load('workItems')).toEqual([])
  }, 30_000)

  it('returns only the actual transaction-produced completion identities and does not mark search or navigation as read', async () => {
    const store = await database(), reading = new ConversationReadingRepository(store), search = new ConversationSearchRepository(store, noSources)
    const laterStarted = message('later-started', 5), earlierStarted = message('earlier-started', 1)
    const commit = (value: Message) => store.transaction(async tx => { await tx.put(record('messages', value)); return reading.recordCompletion(tx, value) })
    const first = await commit(laterStarted), second = await commit(earlierStarted)
    expect(first?.ordinal).toBe(1); expect(second?.ordinal).toBe(2)
    const before = await reading.readState('chat'), results = (await search.search(query())).results
    expect(results.find(result => result.id === earlierStarted.id)?.completion).toEqual({ messageId: earlierStarted.id, ordinal: second!.ordinal, epoch: second!.epoch, contentHash: second!.contentHash })
    expect((await search.resolve({ kind: 'message', conversationId: 'chat', messageId: laterStarted.id })).completion).toEqual({ messageId: laterStarted.id, ordinal: first!.ordinal, epoch: first!.epoch, contentHash: first!.contentHash })
    expect((await search.messagePage({ conversationId: 'chat', aroundMessageId: earlierStarted.id, limit: 2 })).items.find(item => item.messageId === earlierStarted.id)?.completion?.ordinal).toBe(2)
    expect(await reading.readState('chat')).toEqual(before); expect(before.unreadCount).toBe(2)
    await store.write([record('messages', { ...earlierStarted, content: '正文在完成后被更改' })])
    expect((await search.resolve({ kind: 'message', conversationId: 'chat', messageId: earlierStarted.id })).completion).toBeUndefined()
  })

  it('keeps a real revised artifact family on the chosen old version/hash and rechecks its original bytes on click', async () => {
    const { store, search, artifacts, register } = await sourceDatabase(), first = await register('v1', '# 季度核对\n第一版真实原文。')
    const input = { conversationId: 'chat', artifactId: first.id, contentHash: first.contentHash, targetAgentId: 'alice', content: '明确生成下一版。', requestId: 'revision' }, user = message('revision-message', 3, { senderType: 'user', senderId: 'user', content: input.content })
    const revision = await store.transaction(async tx => { await tx.put(record('messages', user)); return artifacts.commitRevision(tx, input, user) })
    const work: WorkItem = { schemaVersion: 2, id: 'revision-work', conversationId: 'chat', sourceMessageId: user.id, key: 'explicit-revision', scope: '修改所见版本', deliverable: '新版文件', ownerAgentId: 'alice', version: 1, status: 'running', budgetId: 'revision-budget', rootWorkId: 'revision-work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: time(3), updatedAt: time(3), revisionRequestId: revision.id }
    await store.write([record('artifactRevisionRequests', { ...revision, rootWorkId: work.id }), record('workItems', work)])
    const second = await register('v2', '# 季度核对\n第二版真实原文。', undefined, { conversationId: 'chat', revisionRequestId: revision.id, sourceWorkId: work.id, sourceMessageId: null })
    expect(second).toMatchObject({ logicalArtifactId: first.logicalArtifactId, contentVersion: 2, previousArtifactId: first.id })
    const results = (await search.search(query({ kinds: ['artifact'] }))).results, target = results.find(result => result.id === first.id)!.target
    expect(await search.resolve(target)).toMatchObject({ id: first.id, target, status: 'available', name: first.name })
    expect(target).toMatchObject({ artifactId: first.id, contentVersion: 1, contentHash: first.contentHash })
    const wrongHash = { ...target, contentHash: 'd'.repeat(64) }
    expect(await search.resolve(wrongHash)).toMatchObject({ id: first.id, target: wrongHash, status: 'unavailable', reason: '所见文件版本或内容身份已更新' })
    await writeFile(first.path, '外部修改后的第一版')
    const clicked = await search.resolve(target)
    expect(clicked.status).toBe('unavailable'); expect(clicked.reason).toContain('外部修改'); expect(clicked).not.toHaveProperty('excerpt'); expect(clicked).not.toHaveProperty('name')
    const refreshed = (await search.search(query({ kinds: ['artifact'] }))).results
    expect(refreshed.find(result => result.id === first.id)?.status).toBe('unavailable'); expect(refreshed.find(result => result.id === second.id)?.status).toBe('available')
    expect(await readFile(first.path, 'utf8')).toBe('外部修改后的第一版')
    expect(await store.load('artifactAdoptionEvents')).toEqual([])
  })

  it('makes old derived messages and material targets unavailable after real authorization changes while preserving the user original', async () => {
    const { store, search, materials, attach } = await sourceDatabase(), source = await attach()
    const derived = message('derived', 2, { content: '季度核对：从私有材料派生的回复。', materialSources: [source.ref] }); await store.write([record('messages', derived)])
    const before = (await search.search(query())).results, messageTarget = before.find(result => result.id === derived.id)!.target, materialTarget = before.find(result => result.kind === 'material')!.target
    expect(await search.resolve(messageTarget)).toMatchObject({ status: 'available', excerpt: derived.content })
    await materials.authorize(source.material.id, source.material.revision, [])
    const after = (await search.search(query())).results, unavailable = after.find(result => result.id === derived.id)!
    expect(unavailable.status).toBe('unavailable'); expect(unavailable.reason).toBeTruthy(); expect(unavailable).not.toHaveProperty('excerpt')
    const clickedMessage = await search.resolve(messageTarget); expect(clickedMessage.status).toBe('unavailable'); expect(clickedMessage).not.toHaveProperty('excerpt')
    expect(await search.resolve(materialTarget)).toMatchObject({ status: 'unavailable', target: materialTarget })
    expect(after.find(result => result.kind === 'material')?.status).toBe('available')
    expect((await materials.preview(source.material.id)).text).toBe('季度核对：本人私有材料原文。')
    const page = await search.messagePage({ conversationId: 'chat', aroundMessageId: derived.id, limit: 1 })
    expect(page.items[0]).toMatchObject({ messageId: derived.id, status: 'unavailable' }); expect(page.items[0]).not.toHaveProperty('message')
  })

  it('rechecks actual material originals and propagates external modification to derived messages and source-bound artifacts', async () => {
    const { store, search, attach, register } = await sourceDatabase(), source = await attach('source', '季度核对：必须隐藏的原材料正文。')
    const derived = message('derived', 2, { content: '季度核对：必须隐藏的派生回复。', materialSources: [source.ref] }); await store.write([record('messages', derived)])
    const report = await register('source-report', '# 季度核对\n必须隐藏的报告正文。', [source.ref]), before = (await search.search(query())).results
    const targets = before.filter(result => ['material', 'artifact'].includes(result.kind) || result.id === derived.id).map(result => result.target)
    expect(targets).toHaveLength(3); expect(before.every(result => result.status === 'available')).toBe(true)
    await writeFile(source.path, '外部修改的私有内容')
    const clicked = await search.resolve(targets.find(target => target.kind === 'message')!)
    expect(clicked.status).toBe('unavailable'); expect(clicked.reason).toBeTruthy(); expect(clicked).not.toHaveProperty('excerpt')
    const after = (await search.search(query())).results
    expect(after).toHaveLength(3); expect(after.every(result => result.status === 'unavailable' && result.reason && !('excerpt' in result) && !('name' in result))).toBe(true)
    expect(JSON.stringify(after)).not.toContain('必须隐藏'); expect(JSON.stringify(after)).not.toContain('外部修改的私有内容')
    for (const target of targets) { const result = await search.resolve(target); expect(result.status).toBe('unavailable'); expect(result.reason).toBeTruthy(); expect(result).not.toHaveProperty('excerpt') }
    expect(await readFile(source.path, 'utf8')).toBe('外部修改的私有内容'); expect(await readFile(report.path, 'utf8')).toBe('# 季度核对\n必须隐藏的报告正文。')
  })

  it('does not publish a stale excerpt when a source changes or cleanup begins during validation', async () => {
    const store = await database(), original = message('original', 1, { content: '季度核对：即将失效的旧正文。' }); await store.write([record('messages', original)])
    const changed = new ConversationSearchRepository(store, { ...noSources, validateMessage: async value => { await store.write([record('messages', { ...value, content: '已更新的不同正文。' })]) } })
    const result = (await changed.search(query())).results[0]
    expect(result.status).toBe('unavailable'); expect(result.reason).toContain('身份已更新'); expect(result).not.toHaveProperty('excerpt')
    await store.write([record('messages', original)])
    const cleaning = new ConversationSearchRepository(store, { ...noSources, validateMessage: async () => { await store.write([record('conversationCleanup', { id: 'chat' })]) } })
    expect((await cleaning.search(query())).results).toEqual([])
    await expect(cleaning.resolve({ kind: 'message', conversationId: 'chat', messageId: original.id })).rejects.toThrow('已被清理或不可用')
    expect(await store.load('workItems')).toEqual([])
  })

  it('fills an older matching search page after candidate heads are really deleted and keeps its continuation disjoint', async () => {
    const store = await database(), deleted = ['m-08', 'm-09', 'm-10'], seen: string[] = []
    await store.write(Array.from({ length: 10 }, (_, i) => record('messages', message(`m-${String(i + 1).padStart(2, '0')}`, i + 1, { content: `季度核对：第 ${i + 1} 条独立正文。` }))))
    let removed = false, selects = 0
    const select = store.conversationSearchRows.bind(store)
    store.conversationSearchRows = async value => { selects++; return select(value) }
    const search = new ConversationSearchRepository(store, { ...noSources, validateMessage: async value => {
      seen.push(value.id)
      if (!removed) {
        removed = true
        await store.transaction(async tx => { for (const id of deleted) { expect(await tx.get('messages', id)).toBeDefined(); await tx.remove('messages', id) } })
      }
    } })
    const first = await search.search(query({ kinds: ['message'], limit: 3 }))
    expect(seen[0]).toBe('m-10'); expect(first.results.map(result => result.id)).toEqual(['m-07', 'm-06', 'm-05'])
    expect(selects).toBeGreaterThan(1); expect(selects).toBeLessThanOrEqual(4)
    expect(first.nextCursor).toMatchObject({ id: 'm-05', kind: 'message', queryKey: first.queryKey })
    const second = await search.search(query({ kinds: ['message'], limit: 3, before: first.nextCursor }))
    expect(second.results.map(result => result.id)).toEqual(['m-04', 'm-03', 'm-02'])
    expect(new Set([...first.results, ...second.results].map(result => result.id)).size).toBe(6)
    expect(second.nextCursor).toMatchObject({ id: 'm-02', kind: 'message', queryKey: second.queryKey })
    const last = await search.search(query({ kinds: ['message'], limit: 3, before: second.nextCursor }))
    expect(last.results.map(result => result.id)).toEqual(['m-01']); expect(last.nextCursor).toBeUndefined()
    for (const result of [...first.results, ...second.results, ...last.results]) { expect(result.status).toBe('available'); expect(deleted).not.toContain(result.id); expect(result.excerpt).not.toMatch(/第 (8|9|10) 条/) }
    expect(await store.load('messages')).toHaveLength(7)
  })

  it('fills a default history page after deleted heads but returns only the original target identity when its window loses that target', async () => {
    const store = await database(), deleted = ['m-04', 'm-05', 'm-06']
    await store.write(Array.from({ length: 6 }, (_, i) => record('messages', message(`m-${String(i + 1).padStart(2, '0')}`, i + 1))))
    let removed = false, selects = 0
    const select = store.conversationMessageRows.bind(store)
    store.conversationMessageRows = async value => { selects++; return select(value) }
    const search = new ConversationSearchRepository(store, { ...noSources, validateMessage: async () => {
      if (!removed) {
        removed = true
        await store.transaction(async tx => { for (const id of deleted) { expect(await tx.get('messages', id)).toBeDefined(); await tx.remove('messages', id) } })
      }
    } })
    const page = await search.messagePage({ conversationId: 'chat', limit: 3 })
    expect(page.items.map(item => item.messageId)).toEqual(['m-01', 'm-02', 'm-03']); expect(page.items.every(item => item.status === 'available')).toBe(true)
    expect(selects).toBeGreaterThan(1); expect(selects).toBeLessThanOrEqual(4)
    expect(page.beforeCursor).toEqual({ id: 'm-01', sequence: 1 }); expect(page.afterCursor).toEqual({ id: 'm-03', sequence: 3 })
    expect(JSON.stringify(page)).not.toContain('m-04'); expect(JSON.stringify(page)).not.toContain('m-05'); expect(JSON.stringify(page)).not.toContain('m-06')
    let targetRemoved = false
    const around = new ConversationSearchRepository(store, { ...noSources, validateMessage: async () => {
      if (!targetRemoved) {
        targetRemoved = true
        await store.transaction(async tx => { expect(await tx.get('messages', 'm-02')).toBeDefined(); await tx.remove('messages', 'm-02') })
      }
    } })
    expect(await around.messagePage({ conversationId: 'chat', aroundMessageId: 'm-02', limit: 3 })).toEqual({ conversationId: 'chat', items: [], targetMessageId: 'm-02' })
    expect(targetRemoved).toBe(true); expect((await store.load<Message>('messages')).map(value => value.id).sort()).toEqual(['m-01', 'm-03'])
    expect(await store.load('conversationReadingStates')).toEqual([])
  })

  it('discards an already-validated target and its neighbors when a later window source deletes that target', async () => {
    const store = await database(), seen: string[] = []
    await store.write([record('messages', message('older', 1)), record('messages', message('target', 2)), record('messages', message('newer', 3))])
    const search = new ConversationSearchRepository(store, { ...noSources, validateMessage: async value => {
      seen.push(value.id)
      if (value.id === 'newer') await store.transaction(async tx => { expect(await tx.get('messages', 'target')).toBeDefined(); await tx.remove('messages', 'target') })
    } })
    expect(await search.messagePage({ conversationId: 'chat', aroundMessageId: 'target', limit: 3 })).toEqual({ conversationId: 'chat', items: [], targetMessageId: 'target' })
    expect(seen).toEqual(['older', 'target', 'newer'])
    expect((await store.load<Message>('messages')).map(value => value.id).sort()).toEqual(['newer', 'older'])
    expect(await store.load('conversationReadingStates')).toEqual([]); expect(await store.load('workItems')).toEqual([])
  })
})

describe('D6 transaction-owned first unread completion', () => {
  it('uses real completion order and sparse observations inside the same publication transaction', async () => {
    const store = await database(), reading = new ConversationReadingRepository(store)
    const values = [message('finished-first', 9), message('finished-second', 1), message('finished-third', 5)]
    await store.transaction(async tx => {
      for (const value of values) { await tx.put(record('messages', value)); await reading.recordCompletion(tx, value) }
      expect(await tx.firstUnreadCompletion({ conversationId: 'chat', epoch: 1, boundary: 0, sparseSeen: [] })).toMatchObject({ messageId: 'finished-first', ordinal: 1 })
      expect(await tx.firstUnreadCompletion({ conversationId: 'chat', epoch: 1, boundary: 0, sparseSeen: [1] })).toMatchObject({ messageId: 'finished-second', ordinal: 2 })
      expect(await tx.firstUnreadCompletion({ conversationId: 'chat', epoch: 1, boundary: 1, sparseSeen: [2] })).toMatchObject({ messageId: 'finished-third', ordinal: 3 })
      expect(await tx.firstUnreadCompletion({ conversationId: 'chat', epoch: 1, boundary: 0, sparseSeen: [1, 2, 3] })).toBeUndefined()
    })
    expect((await reading.readState('chat')).firstUnreadMessageId).toBe('finished-first')
  })

  it('requires an actual completed agent message, matching conversation/epoch and a live conversation without cleanup', async () => {
    const store = await database(), reading = new ConversationReadingRepository(store)
    for (const [i, id] of ['failed', 'user', 'foreign', 'missing', 'valid'].entries()) await store.transaction(async tx => { const value = message(id, i); await tx.put(record('messages', value)); await reading.recordCompletion(tx, value) })
    await store.write([record('messages', message('failed', 0, { status: 'failed' })), record('messages', message('user', 1, { senderType: 'user' })), record('messages', message('foreign', 2, { conversationId: 'other' }))], [{ collection: 'messages', id: 'missing' }])
    const first = () => store.transaction(tx => tx.firstUnreadCompletion({ conversationId: 'chat', epoch: 1, boundary: 0, sparseSeen: [] }))
    expect(await first()).toMatchObject({ messageId: 'valid', ordinal: 5 })
    await store.write([record('conversationCompletionClocks', { id: 'chat', conversationId: 'chat', epoch: 2, ordinal: 0, legacyCompletedUnknown: false })])
    expect(await first()).toBeUndefined()
    await store.write([record('conversationCompletionClocks', { id: 'chat', conversationId: 'chat', epoch: 1, ordinal: 5, legacyCompletedUnknown: false }), record('conversationCleanup', { id: 'chat' })])
    expect(await first()).toBeUndefined()
    await store.write([], [{ collection: 'conversationCleanup', id: 'chat' }, { collection: 'conversations', id: 'chat' }])
    expect(await first()).toBeUndefined()
  })

  it('bounds sparse parameters and never interprets identifiers or completion ordinals as SQL', async () => {
    const store = await database(), reading = new ConversationReadingRepository(store), value = message('actual', 1), payload = "chat' OR 1=1; DELETE FROM records; --"
    await store.transaction(async tx => { await tx.put(record('messages', value)); await reading.recordCompletion(tx, value) })
    expect(await store.transaction(tx => tx.firstUnreadCompletion({ conversationId: payload, epoch: 1, boundary: 0, sparseSeen: [] }))).toBeUndefined()
    const statement = firstUnreadCompletionSql({ conversationId: payload, epoch: 1, boundary: 0, sparseSeen: [] })
    expect(statement.sql).not.toContain(payload); expect(statement.args).toContain(payload)
    for (const sparseSeen of [Array.from({ length: 257 }, (_, i) => i + 1), [NaN], [1.5], [0], ["1) OR 1=1" as unknown as number]]) await expect(store.transaction(tx => tx.firstUnreadCompletion({ conversationId: 'chat', epoch: 1, boundary: 0, sparseSeen }))).rejects.toThrow('有界完成序号')
    expect(await store.load('messages')).toHaveLength(1); expect(await store.load('conversationCompletions')).toHaveLength(1)
  })
})

describe('R1 committed text bodies and bounded coverage', () => {
  it('indexes real sent TXT and registered TXT bytes and rejects a falsely named binary text file', async () => {
    const { store, root, materials, artifacts, search } = await sourceDatabase(), text = 'TXT正文专有词'
    const input = join(root, '输入.txt'); await writeFile(input, text)
    const prepared = await materials.prepare({ conversationId: 'chat', path: input, requestId: 'prepare-real-txt', authorizedAgentIds: ['alice'] })
    const sent = message('sent-real-txt', 1, { senderType: 'user', senderId: 'user', content: '交给你这份材料', materialIds: [prepared.id] })
    await store.transaction(async tx => { await tx.put(record('messages', sent)); await materials.attach(tx, 'chat', sent.id, [{ id: prepared.id, revision: prepared.revision }]) })
    for (const [id, bytes] of [['txt-output', Buffer.from(text)], ['bad-utf8', Buffer.from([0xff, 0xfe, 0x00])]] as const) {
      const directory = join(root, 'workspaces', 'chat', 'artifacts', id), path = join(directory, '结果.txt'); await mkdir(directory, { recursive: true }); await writeFile(path, bytes)
      await store.transaction(tx => artifacts.register(tx, { id, conversationId: 'chat', name: '结果.txt', path, size: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex'), ownerAgentId: 'alice' }, { conversationId: 'chat', revisionRequestId: null, sourceWorkId: null, sourceMessageId: null }))
    }
    const page = await search.search(query({ keyword: text, kinds: ['material', 'artifact'] }))
    expect(page.results.map(value => value.id).sort()).toEqual([prepared.id, 'txt-output'].sort())
    expect(page.results.every(value => value.matchedIn === 'body' && value.excerpt === text)).toBe(true)
    expect(page.coverage).toMatchObject({ total: 3, indexed: 2, failed: 1, pending: 0, skipped: 0 })
    expect(page.coverage!.failures![0].reason).toContain('UTF-8')
  })

  it('finds body-only words in sent materials and each registered same-name artifact without guessing another version', async () => {
    const { store, search, attach, register } = await sourceDatabase()
    const sent = await attach('body-material', '苹开彩虹浏览器：这一关键词只在已发送材料正文。')
    const first = await register('body-v1', '# 早期成果\n苹开彩虹浏览器的旧版证据。'), second = await register('body-v2', '# 后续成果\n另一份正文。')
    const page = await search.search(query({ keyword: '苹开彩虹浏览器', kinds: ['material', 'artifact'] }))
    expect(page.results.map(value => value.id).sort()).toEqual([sent.material.id, first.id].sort())
    expect(page.results.every(value => value.matchedIn === 'body' && value.excerpt?.includes('苹开彩虹浏览器') && value.name === '季度核对.md')).toBe(true)
    expect(page.coverage).toMatchObject({ total: 3, indexed: 3, pending: 0, failed: 0, skipped: 0, hasMore: false })
    expect(page.results.find(value => value.id === first.id)?.target).toMatchObject({ kind: 'artifact', artifactId: first.id, contentVersion: 1, contentHash: first.contentHash })
    expect(await search.resolve(page.results.find(value => value.id === first.id)!.target)).toMatchObject({ id: first.id, status: 'available' })
    expect(page.results.some(value => value.id === second.id)).toBe(false)
    for (const collection of ['workItems', 'runs', 'turns', 'workBudgets', 'conversationReadingStates']) expect(await store.load(collection)).toEqual([])
  })

  it('does not index drafts, loose directory files or a source rolled back before its publication', async () => {
    const { store, root, search, register } = await sourceDatabase()
    await store.write([record('materials', material('draft-body', { messageId: undefined })), record('artifacts', { ...artifact('loose-body'), registrationSource: undefined })])
    await mkdir(join(root, 'workspaces', 'chat', 'work'), { recursive: true }); await writeFile(join(root, 'workspaces', 'chat', 'work', 'loose.md'), '未发布独有关键词')
    await expect(store.transaction(async tx => { await tx.put(record('artifacts', artifact('rolled-back'))); throw new Error('故意回滚发布') })).rejects.toThrow('回滚')
    const before = await search.search(query({ keyword: '未发布独有关键词' }))
    expect(before.results).toEqual([]); expect(before.coverage).toMatchObject({ total: 0, indexed: 0, pending: 0 })
    expect(await store.load(SEARCH_INDEX_COLLECTION)).toEqual([])
    const source = await register('rollback-invalidation', '# 季度核对\n保留正文唯一关键词')
    expect((await search.search(query({ keyword: '保留正文唯一关键词' }))).results.map(value => value.id)).toEqual([source.id])
    const bodies = await store.load(SEARCH_INDEX_COLLECTION)
    await expect(store.transaction(async tx => { await tx.remove('artifacts', source.id); throw new Error('删除事务回滚') })).rejects.toThrow('回滚')
    expect(await store.load(SEARCH_INDEX_COLLECTION)).toEqual(bodies)
    expect((await search.search(query({ keyword: '保留正文唯一关键词' }))).results.map(value => value.id)).toEqual([source.id])
  })

  it('persists bounded backfill progress, keeps pending coverage explicit and does not rebuild a continuation page', async () => {
    const store = await database(); let reads = 0
    const count = SEARCH_INDEX_LIMITS.filesPerBatch * 2 + 1
    const sources = Array.from({ length: count }, (_, i) => artifact(`body-${String(i).padStart(2, '0')}`, { size: 10, publishedAt: time(i) }))
    await store.write(sources.map(value => record('artifacts', value)))
    const search = new ConversationSearchRepository(store, { ...noSources, readArtifactText: async () => { reads++; return '多词回填 苹果 浏览器' } })
    const first = await search.search(query({ keyword: '苹果 浏览器', kinds: ['artifact'], limit: 1 }))
    expect(first.coverage!.batchProcessed).toBeGreaterThan(0); expect(first.coverage!.batchProcessed).toBeLessThanOrEqual(SEARCH_INDEX_LIMITS.filesPerBatch)
    expect(first.coverage!.pending).toBeGreaterThan(0); expect(first.coverage!.hasMore).toBe(true); expect(first.results).toHaveLength(1)
    const previousReads = reads
    const next = await search.search(query({ keyword: '苹果 浏览器', kinds: ['artifact'], limit: 1, before: first.nextCursor }))
    expect(reads).toBe(previousReads); expect(next.coverage).toMatchObject({ batchProcessed: 0, indexRevision: first.coverage!.indexRevision })
    expect(next.results[0].id).not.toBe(first.results[0].id)
    for (let i = 0; i < count && (await store.searchBodyCoverage(query())).pending; i++) await search.search(query({ keyword: '苹果 浏览器', kinds: ['artifact'] }))
    expect(await store.searchBodyCoverage(query())).toMatchObject({ total: count, indexed: count, pending: 0, hasMore: false })
    await expect(search.search(query({ keyword: '苹果 浏览器', kinds: ['artifact'], limit: 1, before: first.nextCursor }))).rejects.toThrow('索引已更新')
    expect(reads).toBe(count)
  })

  it('records unsupported and oversized bodies rather than reporting them as fully searchable', async () => {
    const store = await database(); let reads = 0
    await store.write([record('artifacts', artifact('binary', { name: '图像.png' })), record('artifacts', artifact('too-big', { size: SEARCH_INDEX_LIMITS.bytesPerFile + 1 })), record('artifacts', artifact('too-many-characters'))])
    const search = new ConversationSearchRepository(store, { ...noSources, readArtifactText: async () => { reads++; return '核'.repeat(SEARCH_INDEX_LIMITS.charactersPerFile + 1) } })
    const page = await search.search(query({ keyword: '核' }))
    expect(page.coverage).toMatchObject({ total: 3, indexed: 0, pending: 0, skipped: 3, failed: 0, hasMore: false }); expect(reads).toBe(1)
    expect(page.coverage!.failures).toHaveLength(3)
    expect(JSON.stringify(page.coverage)).not.toContain('/managed/'); expect(page.results.every(value => value.excerpt === undefined)).toBe(true)
  })

  it('withdraws an indexed body on file mutation and reports its failure without returning the old excerpt', async () => {
    const { store, search, register, attach } = await sourceDatabase()
    const registered = await register('changed-body', '# 苹开浏览器旧正文'), sent = await attach('changed-material', '苹开浏览器材料旧正文')
    const original = await search.search(query({ keyword: '苹开浏览器', kinds: ['artifact', 'material'] })); expect(original.results).toHaveLength(2)
    await writeFile(registered.path, '外部修改的新正文'); await writeFile(sent.path, '外部修改的新材料')
    const changed = await search.search(query({ keyword: '苹开浏览器', kinds: ['artifact', 'material'] }))
    expect(changed.results.every(value => value.status === 'unavailable' && value.excerpt === undefined && value.name === undefined)).toBe(true)
    expect(changed.coverage).toMatchObject({ indexed: 0, failed: 2, pending: 0 }); expect(changed.coverage!.failures!.every(value => /外部修改/.test(value.reason))).toBe(true)
    expect(JSON.stringify(changed)).not.toContain('苹开浏览器旧正文'); expect(JSON.stringify(changed)).not.toContain('苹开浏览器材料旧正文')
    expect((await store.load<SearchBodyRecord>(SEARCH_INDEX_COLLECTION)).every(value => value.text === undefined)).toBe(true)
    for (const result of original.results) { const current = await search.resolve(result.target); expect(current.status).toBe('unavailable'); expect(current.excerpt).toBeUndefined() }
  })

  it('rejects stale bytes changed after indexing read and before commit through the final source check', async () => {
    let file = ''
    const fixture = await sourceDatabase({ beforeBodyCommit: async () => { await writeFile(file, '提交前外改') } })
    const source = await fixture.register('late-file-mutation', '# 迟到正文独有词'); file = source.path
    const page = await fixture.search.search(query({ keyword: '迟到正文独有词', kinds: ['artifact'] }))
    expect(page.results).toHaveLength(1); expect(page.results[0].status).toBe('unavailable'); expect(page.results[0].excerpt).toBeUndefined()
    expect(page.coverage).toMatchObject({ indexed: 0, failed: 1 }); expect(JSON.stringify(page)).not.toContain('迟到正文独有词')
    expect((await fixture.store.load<SearchBodyRecord>(SEARCH_INDEX_COLLECTION))[0].text).toBeUndefined()
  })

  it('cannot resurrect body bytes when cleanup wins between source read and index commit', async () => {
    let store: ProductStore
    const fixture = await sourceDatabase({ beforeBodyCommit: async id => { await store.transaction(async tx => { await tx.put(record('conversationCleanup', { id: 'chat' })); await tx.remove('artifacts', id) }) } }); store = fixture.store
    await fixture.register('late-cleanup', '# 清理不能复活关键词')
    const page = await fixture.search.search(query({ keyword: '清理不能复活关键词', kinds: ['artifact'] }))
    expect(page.results).toEqual([]); expect(page.coverage).toMatchObject({ total: 0, indexed: 0, pending: 0 })
    expect(await store.load(SEARCH_INDEX_COLLECTION)).toEqual([])
    await store.write([], [{ collection: 'conversationCleanup', id: 'chat' }]); expect((await fixture.search.search(query({ keyword: '清理不能复活关键词' }))).results).toEqual([])
  })

  it('invalidates material-derived bodies in the same permission transaction and does not search an old source version', async () => {
    const { store, search, attach, register, materials } = await sourceDatabase(), sent = await attach('derived-permission', '原材料正文')
    const source = await register('derived-body', '# 撤权派生独有关键词', [sent.ref])
    const original = await search.search(query({ keyword: '撤权派生独有关键词', kinds: ['artifact'] })); expect(original.results).toHaveLength(1)
    await materials.authorize(sent.material.id, sent.material.revision, [])
    expect((await store.load<SearchBodyRecord>(SEARCH_INDEX_COLLECTION)).some(value => value.sourceId === source.id && value.text)).toBe(false)
    const revoked = await search.search(query({ keyword: '撤权派生独有关键词', kinds: ['artifact'] }))
    expect(revoked.results).toEqual([]); expect(revoked.coverage).toMatchObject({ indexed: 0, failed: 1 })
    const current = await search.resolve(original.results[0].target); expect(current.status).toBe('unavailable'); expect(current.excerpt).toBeUndefined()
  })

  it('clears unverified body text on restored-database startup and rebuilds only local committed sources', async () => {
    const { store, root, search, register } = await sourceDatabase(), source = await register('restored-body', '# 恢复前独有关键词')
    expect((await search.search(query({ keyword: '恢复前独有关键词', kinds: ['artifact'] }))).results).toHaveLength(1)
    const backup = join(root, 'snapshot.sqlite'); await store.backup(backup); await writeFile(source.path, '恢复时已经外改')
    const restored = new ProductStore(backup); stores.push(restored); await restored.init()
    expect(await restored.searchBodyCoverage(query())).toMatchObject({ indexed: 0, pending: 1 })
    expect((await restored.load<SearchBodyRecord>(SEARCH_INDEX_COLLECTION)).every(value => value.text === undefined)).toBe(true)
    const artifacts = new ArtifactRepository(restored, root), browsing = new ConversationSearchRepository(restored, { ...noSources, readArtifactText: async value => (await restored.transaction(tx => artifacts.readSearchText(tx, value.id, value.contentHash!))).text, validateArtifact: async value => { await restored.transaction(tx => artifacts.validateCurrentArtifact(tx, value.id, value.contentHash!)) } })
    const page = await browsing.search(query({ keyword: '恢复前独有关键词', kinds: ['artifact'] }))
    expect(page.results).toEqual([]); expect(page.coverage).toMatchObject({ indexed: 0, failed: 1, pending: 0 })
    for (const collection of ['workItems', 'runs', 'turns', 'workBudgets']) expect(await restored.load(collection)).toEqual([])
  })

  it('rejects a ranking cursor after title or message text changes while a reaction alone leaves that cursor valid', async () => {
    const store = await database(), search = new ConversationSearchRepository(store, noSources)
    await store.write([record('conversations', { ...conversation(), title: '苹果 浏览器' }), record('messages', message('rank-a', 1, { content: '苹果 浏览器' })), record('messages', message('rank-b', 2, { content: '苹果 浏览器' }))])
    const first = await search.search(query({ keyword: '苹果 浏览器', limit: 1 }))
    const original = (await store.load<Message>('messages')).find(value => value.id === 'rank-b')!
    await store.write([record('messages', { ...original, reactions: [{ senderId: 'user', senderName: '本人', emoji: '👍' }] })])
    expect((await search.search(query({ keyword: '苹果 浏览器', limit: 1, before: first.nextCursor }))).results).toHaveLength(1)
    await store.write([record('messages', message('private-stream', 3, { content: '苹果 浏览器 未提交草稿', status: 'streaming' }))])
    expect((await search.search(query({ keyword: '苹果 浏览器', limit: 1, before: first.nextCursor }))).results).toHaveLength(1)
    await store.transaction(async tx => { const current = await tx.get<Conversation>('conversations', 'chat'); await tx.put(record('conversations', { ...current!, title: '别的会话名' })) })
    await expect(search.search(query({ keyword: '苹果 浏览器', limit: 1, before: first.nextCursor }))).rejects.toThrow('索引已更新')
    const refreshed = await search.search(query({ keyword: '苹果 浏览器', limit: 1, kinds: ['message'] }))
    await store.write([record('messages', { ...original, content: '浏览器 苹果 苹果 浏览器' })])
    await expect(search.search(query({ keyword: '苹果 浏览器', limit: 1, kinds: ['message'], before: refreshed.nextCursor }))).rejects.toThrow('索引已更新')
  })
})

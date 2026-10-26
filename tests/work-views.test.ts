/*
 * [OUTPUT]: 员工跨会话文件分页、当前成员/材料授权与隐藏清理隔离、原会话身份及范围游标校验。
 * [OUTPUT]: 渠道内部工作/文件按固定父渠道材料来源读取，其他渠道与清理代际变化在分页前排除。
 * [INPUT]: 真实SQLite工作、材料、成果及当前会话权限；有界查询与点击解析。
 * [OUTPUT]: 原工作视图授权/计数/游标回归；万项保留总3秒/100页1秒，记录实测并核对旧比较与缺索引兼容。
 * [POS]: WV0模块意图验收；读取不得写业务状态或制造任务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRun, Approval, WorkItem, Conversation, Message } from '../packages/shared/src/domain'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { WorkViewRepository } from '../packages/runtime/src/modules/collaboration/work-view-repository'
import { ArtifactRepository } from '../packages/runtime/src/modules/workspaces/artifact-repository'
import { conversationFileQuerySchema, workViewQuerySchema, workViewTargetSchema, workViewsSql } from '../packages/runtime/src/modules/collaboration/work-view-sql'

const stores: ProductStore[] = [], roots: string[] = []
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const time = '2026-10-05T00:00:00.000Z'
function conversation(id: string, hidden = false): Conversation { return { id, kind: 'direct', title: id, agentIds: ['alice', 'bob'], mode: 'natural', workspacePath: '/unused', sharedKnowledgeIds: [], createdAt: time, updatedAt: time, list: { hidden } } }
function message(id: string, conversationId = 'direct'): Message { return { id, conversationId, senderType: 'user', senderId: 'user', senderName: '我', content: '原始请求', status: 'completed', createdAt: time, sequence: 1 } }
function work(id: string, changes: Partial<WorkItem> = {}): WorkItem { return { id, schemaVersion: 2, conversationId: 'direct', sourceMessageId: 'source', key: id, scope: '分析原始数据', deliverable: '生成结论报告', ownerAgentId: 'alice', version: 1, status: 'ready', budgetId: 'budget', rootWorkId: id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: time, updatedAt: time, ...changes } }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-work-views-')); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  await store.write([row('conversations', conversation('direct')), row('messages', message('source')), row('agents', { id: 'alice', name: 'Alice' } as { id: string })])
  return store
}
const query = (store: ProductStore, input: unknown = {}) => store.queryWorkViews(workViewQuerySchema.parse(input))
const files = (store: ProductStore, input: unknown) => store.queryConversationFiles(conversationFileQuerySchema.parse(input))
describe('工作视图唯一事实与有界读取', () => {
  it('内部工作和新版文件保留父渠道材料来源，错绑和过期代际在分页前排除', async () => {
    const store = await fixture()
    const parent = { ...conversation('channel'), agentIds: ['alice'], channel: { bindingId: 'binding', platform: 'feishu' } }
    const internal = { ...conversation('internal'), agentIds: ['alice'], purpose: 'channel-internal', channelDiscussion: { conversationId: 'channel', epoch: 1 } }
    const ref = { id: 'channel-material', conversationId: 'channel', revision: 1, contentHash: 'a'.repeat(64), parseVersion: 'text-v1' as const }
    const material = { id: ref.id, conversationId: 'channel', revision: 1, contentHash: ref.contentHash, parseVersion: ref.parseVersion, messageId: 'channel-message', status: 'ready' }
    const output = { id: 'internal-file', conversationId: 'internal', name: '内部新版.md', logicalArtifactId: 'original-file', registrationSource: 'publication', contentStatus: 'ready', contentHash: 'b'.repeat(64), contentVersion: 2, ownerAgentId: 'alice', publishedAt: time, materialSources: [ref] }
    await store.write([row('conversations', parent), row('conversations', internal), row('materials', material), row('messages', message('internal-message', 'internal')), row('workItems', work('internal-work', { conversationId: 'internal', sourceMessageId: 'internal-message', materialSources: [ref] })), row('artifacts', output)])
    expect((await query(store, { conversationId: 'internal' })).items.map(item => item.work.id)).toEqual(['internal-work'])
    expect((await files(store, { conversationId: 'internal' })).items.map(item => item.id)).toEqual(['internal-file'])
    await store.write([row('conversations', { ...internal, channelDiscussion: { conversationId: 'unrelated', epoch: 1 } })])
    expect((await query(store, { conversationId: 'internal' })).total).toBe(0)
    expect((await files(store, { conversationId: 'internal' })).total).toBe(0)
    await store.write([row('conversations', internal), row('conversationCompletionClocks', { id: 'channel', epoch: 2 })])
    expect((await query(store, { conversationId: 'internal' })).total).toBe(0)
    expect((await files(store, { conversationId: 'internal' })).total).toBe(0)
  })

  it('一万项历史每组超过两页，默认30/最大100并在3秒内读取全量计数和有界页', async () => {
    const store = await fixture(), statuses: WorkItem['status'][] = ['ready', 'running', 'waiting', 'delivered', 'failed']
    await store.write(Array.from({ length: 10_000 }, (_, index) => row('workItems', work(`scale-${String(index).padStart(5, '0')}`, { status: statuses[index % statuses.length] }))))
    const start = performance.now(), first = await query(store, { group: 'running' }), firstEnd = performance.now()
    expect(first.items).toHaveLength(30); expect(first.total).toBe(2000)
    expect(first.counts).toEqual({ ready: 2000, running: 2000, waiting: 2000, delivered: 2000, ended: 2000 })
    const next = await query(store, { group: 'running', cursor: first.nextCursor }), nextEnd = performance.now()
    expect(new Set([...first.items, ...next.items].map(value => value.work.id)).size).toBe(60)
    expect((await query(store, { limit: 100 })).items).toHaveLength(100)
    const end = performance.now()
    process.stdout.write(`WORK_VIEW_PERFORMANCE ${JSON.stringify({ items: 10_000, firstMs: firstEnd - start, nextMs: nextEnd - firstEnd, maxPageMs: end - nextEnd, totalMs: end - start, budgetMs: 3000, maxPageBudgetMs: 1000 })}\n`)
    expect(end - start).toBeLessThan(3000)
    expect(end - nextEnd).toBeLessThan(1000)
  }, 15_000)
  it('父子计数索引升级保持旧文本比较、会话和材料来源语义', async () => {
    const store = await fixture()
    await store.write([row('workItems', work('root')), row('workItems', work('child', { parentWorkId: 'root', rootWorkId: 'root' })), row('conversations', conversation('other')), row('workItems', work('foreign', { conversationId: 'other', parentWorkId: 'root', rootWorkId: 'root' })), row('workItems', work('stale', { parentWorkId: 'root', rootWorkId: 'root', materialSources: [{ id: 'missing', conversationId: 'direct', revision: 1, contentHash: 'hash', parseVersion: 'text-v1' }] }))])
    const client = createClient({ url: pathToFileURL(join(roots.at(-1)!, 'product.sqlite')).href })
    try {
      for (const input of [{}, { conversationId: 'direct' }, { parentWorkId: 'root' }, { ownerAgentId: 'alice' }]) {
        const sql = workViewsSql(workViewQuerySchema.parse(input))
        const previous = { ...sql, sql: sql.sql.replace("CAST(json_extract(child.value,'$.parentWorkId') AS TEXT)=page.id", "json_extract(child.value,'$.parentWorkId')=page.id") }
        expect((await client.execute(sql)).rows).toEqual((await client.execute(previous)).rows)
      }
      expect((await query(store)).items.find(item => item.work.id === 'root')!.childCount).toBe(1)
      // An old/read-only database lacking the new index still returns the same facts.
      const indexed = await query(store)
      await client.execute('DROP INDEX work_view_parent_text')
      expect(await query(store)).toEqual(indexed)
    } finally { client.close() }
  })
  it('从全量匹配根工作计五组，不把第一页分列或Run作为工作', async () => {
    const store = await fixture(), statuses: WorkItem['status'][] = ['ready', 'running', 'waiting', 'blocked', 'delivered', 'failed', 'cancelled', 'interrupted']
    await store.write(Array.from({ length: 240 }, (_, index) => row('workItems', work(`work-${String(index).padStart(4, '0')}`, { status: statuses[index % statuses.length] }))))
    await store.write([row('runs', { id: 'run-without-work' })])
    const all = await query(store, { limit: 3 })
    expect(all.items).toHaveLength(3); expect(all.total).toBe(240)
    expect(all.counts).toEqual({ ready: 30, running: 30, waiting: 60, delivered: 30, ended: 90 })
    const delivered = await query(store, { limit: 2, group: 'delivered' })
    expect(delivered.total).toBe(30); expect(delivered.items.every(value => value.work.status === 'delivered')).toBe(true)
    expect(delivered.counts).toEqual(all.counts)
    let cursor = all.nextCursor, ids = all.items.map(value => value.work.id)
    while (cursor) { const next = await query(store, { limit: 3, cursor }); ids.push(...next.items.map(value => value.work.id)); cursor = next.nextCursor }
    expect(new Set(ids).size).toBe(240)
  })
  it('员工条件和状态必须命中同一实际拥有Work，根只作上下文', async () => {
    const store = await fixture()
    await store.write([row('workItems', work('root', { ownerAgentId: 'bob', status: 'delivered' })), row('workItems', work('child', { parentWorkId: 'root', rootWorkId: 'root', status: 'running' })), row('workItems', work('dependency', { ownerAgentId: 'bob', status: 'waiting', dependsOnWorkIds: ['child'] }))])
    expect((await query(store)).items.map(value => value.work.id).sort()).toEqual(['dependency', 'root'])
    const owned = await query(store, { ownerAgentId: 'alice', states: ['running'] })
    expect(owned.items.map(value => value.work.id)).toEqual(['child']); expect(owned.total).toBe(1); expect(owned.rootTotal).toBe(0); expect(owned.childTotal).toBe(1)
    expect((await query(store, { ownerAgentId: 'alice', states: ['delivered'] })).total).toBe(0)
    expect((await query(store, { parentWorkId: 'root' })).items.map(value => value.work.id)).toEqual(['child'])
  })
  it('隐藏和清理会话在分页前排除，范围变化使旧游标失效', async () => {
    const store = await fixture()
    await store.write([row('workItems', work('one')), row('workItems', work('two')), row('conversations', conversation('hidden', true)), row('workItems', work('hidden-work', { conversationId: 'hidden' })), row('conversations', conversation('clearing')), row('conversationCleanup', { id: 'clearing' }), row('workItems', work('clearing-work', { conversationId: 'clearing' }))])
    const first = await query(store, { limit: 1 }); expect(first.total).toBe(2)
    await expect(query(store, { limit: 1, ownerAgentId: 'bob', cursor: first.nextCursor })).rejects.toThrow('STALE_CURSOR')
    await store.write([row('conversations', conversation('direct', true))])
    await expect(query(store, { limit: 1, cursor: first.nextCursor })).rejects.toThrow('STALE_CURSOR')
    expect((await query(store)).total).toBe(0); expect(await store.workViewTarget('one')).toBeUndefined()
  })
  it('回滚不改变代际，普通读取不制造或修改任何业务记录', async () => {
    const store = await fixture(); await store.write([row('workItems', work('one')), row('workItems', work('two'))])
    const first = await query(store, { limit: 1 }), before = await store.load('workItems')
    await expect(store.transaction(async tx => { await tx.put(row('workItems', work('three'))); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect((await query(store, { limit: 1, cursor: first.nextCursor })).items).toHaveLength(1)
    expect(await store.load('workItems')).toEqual(before)
  })
  it('重启/恢复权威代际使原游标失效，不靠巧合相等的计数续页', async () => {
    const store = await fixture(); await store.write([row('workItems', work('one')), row('workItems', work('two'))])
    const first = await query(store, { limit: 1 }), priorEpoch = first.scopeEpoch
    await store.close(); stores.splice(stores.indexOf(store), 1)
    const reopened = new ProductStore(store.filename); stores.push(reopened); await reopened.init()
    expect((await query(reopened)).scopeEpoch).not.toBe(priorEpoch)
    await expect(query(reopened, { limit: 1, cursor: first.nextCursor })).rejects.toThrow('STALE_CURSOR')
    expect((await reopened.load<WorkItem>('workItems')).map(value => value.status)).toEqual(['ready', 'ready'])
  })
  it('时间/来源/目标多词都在同工作分页前筛选，未知来源不冒充普通', async () => {
    const store = await fixture()
    await store.write([row('workItems', work('unknown', { sourceMessageId: 'missing' })), row('workItems', work('automation', { origin: { kind: 'automation', automationId: 'plan', occurrenceId: 'occurrence', name: '计划', authorizedFingerprint: 'fingerprint' } })), row('workItems', work('ordinary')), row('workItems', work('other', { deliverable: '不同成果', scope: '其他' }))])
    expect((await query(store, { source: 'unknown' })).items.map(value => value.work.id)).toEqual(['unknown'])
    expect((await query(store, { source: 'ordinary', search: '分析 报告', limit: 1 })).total).toBe(1)
    expect((await query(store, { from: '2026-10-06T00:00:00Z' })).total).toBe(0)
    expect(() => workViewQuerySchema.parse({ limit: 101 })).toThrow()
    expect(() => workViewQuerySchema.parse({ from: '2026-10-06T00:00:00Z', to: time })).toThrow()
  })
  it('材料来源撤权在SQL分页前移除派生工作', async () => {
    const store = await fixture(), hash = 'a'.repeat(64)
    const ref = { id: 'material', conversationId: 'direct', revision: 1, contentHash: hash, parseVersion: 'text-v1' as const }
    await store.write([row('materials', { id: 'material', conversationId: 'direct', messageId: 'source', revision: 1, contentHash: hash, parseVersion: 'text-v1', status: 'ready' } as { id: string }), row('workItems', work('derived', { materialSources: [ref] })), row('workItems', work('independent'))])
    expect((await query(store)).total).toBe(2)
    await store.write([row('materials', { id: 'material', conversationId: 'direct', messageId: 'source', revision: 2, contentHash: hash, parseVersion: 'text-v1', status: 'ready' } as { id: string })])
    expect((await query(store, { limit: 1 })).items[0].work.id).toBe('independent')
  })
  it('旧工作缺材料快照时仍核对原消息附件和原Run快照，不被第一页绕过', async () => {
    const store = await fixture(), hash = 'a'.repeat(64), ref = { id: 'material', conversationId: 'direct', revision: 1, contentHash: hash, parseVersion: 'text-v1' }
    await store.write([row('materials', { id: 'material', conversationId: 'direct', messageId: 'attached', revision: 1, contentHash: hash, parseVersion: 'text-v1', status: 'ready' }), row('messages', { ...message('attached'), materialIds: ['material'] }), row('messages', { ...message('derived'), runId: 'old-run' }), row('snapshots', { id: 'old-run', materialRefs: [ref] }), row('workItems', work('legacy-attached', { sourceMessageId: 'attached' })), row('workItems', work('legacy-derived', { sourceMessageId: 'derived' })), row('workItems', work('independent'))])
    expect((await query(store)).total).toBe(3)
    await store.write([], [{ collection: 'materials', id: 'material' }])
    const page = await query(store, { limit: 1 })
    expect(page.total).toBe(1); expect(page.items[0].work.id).toBe('independent')
  })
  it('根卡子计数与子分页同核旧原消息来源，撤权父目标不能成为展开旁路', async () => {
    const store = await fixture(), hash = 'a'.repeat(64), ref = { id: 'material', conversationId: 'direct', revision: 1, contentHash: hash, parseVersion: 'text-v1' }
    await store.write([row('materials', { id: 'material', conversationId: 'direct', messageId: 'attached', revision: 1, contentHash: hash, parseVersion: 'text-v1', status: 'ready' }), row('messages', { ...message('attached'), materialIds: ['material'] }), row('messages', { ...message('legacy-child'), runId: 'old-run' }), row('snapshots', { id: 'old-run', materialRefs: [ref] }), row('workItems', work('root')), row('workItems', work('child', { parentWorkId: 'root', rootWorkId: 'root', sourceMessageId: 'legacy-child' })), row('workItems', work('revoked-parent', { sourceMessageId: 'attached' })), row('workItems', work('independent-child', { parentWorkId: 'revoked-parent', rootWorkId: 'revoked-parent' }))])
    expect((await query(store)).items.find(item => item.work.id === 'root')!.childCount).toBe(1)
    await store.write([], [{ collection: 'materials', id: 'material' }])
    expect((await query(store)).items.find(item => item.work.id === 'root')!.childCount).toBe(0)
    expect((await query(store, { parentWorkId: 'root' })).total).toBe(0)
    expect((await query(store, { parentWorkId: 'revoked-parent' })).total).toBe(0)
    expect((await query(store, { ownerAgentId: 'alice' })).items.map(item => item.work.id).sort()).toEqual(['independent-child', 'root'])
  })
  it('私聊群聊核心与同一自动化多个Work共用真源，不从失败触发或ACP运行制造卡片', async () => {
    const store = await fixture(), origin = { kind: 'automation' as const, automationId: 'plan', occurrenceId: 'occurrence', name: '真实计划来源', authorizedFingerprint: 'fingerprint' }
    const group = { ...conversation('group'), kind: 'group' as const }, core = { ...conversation('core'), purpose: 'core' as const, agentIds: ['bobo'] }, automated = conversation('automated')
    await store.write([row('conversations', group), row('conversations', core), row('conversations', automated), row('messages', message('group-source', 'group')), row('messages', message('core-source', 'core')), row('messages', { ...message('automated-source', 'automated'), origin }), row('workItems', work('direct-work')), row('workItems', work('group-work', { conversationId: 'group', sourceMessageId: 'group-source' })), row('workItems', work('core-work', { conversationId: 'core', sourceMessageId: 'core-source', ownerAgentId: 'bobo' })), row('workItems', work('automation-a', { conversationId: 'automated', sourceMessageId: 'automated-source', origin })), row('workItems', work('automation-b', { conversationId: 'automated', sourceMessageId: 'automated-source', ownerAgentId: 'bob', origin })), row('workItems', work('legacy-unknown', { sourceMessageId: 'missing' })), row('automationOccurrences', { id: 'failed-without-work', status: 'failed', conversationId: 'automated', workIds: [] }), row('runs', { id: 'acp-without-work', conversationId: 'direct', status: 'failed', backend: { kind: 'acp-local' } })])
    const page = await query(store)
    expect(page.total).toBe(6); expect(page.items.filter(item => item.source === 'automation').map(item => item.work.id).sort()).toEqual(['automation-a', 'automation-b'])
    expect((await query(store, { source: 'ordinary' })).items.map(item => item.work.id).sort()).toEqual(['core-work', 'direct-work', 'group-work'])
    expect((await query(store, { source: 'unknown' })).items.map(item => item.work.id)).toEqual(['legacy-unknown'])
    expect(page.items.flatMap(item => item.work.id)).not.toContain('failed-without-work')
    expect(page.items.flatMap(item => item.work.id)).not.toContain('acp-without-work')
  })
})
describe('会话文件真实来源与版本', () => {
  const artifact = (id: string, logicalArtifactId = id, contentVersion = 1) => ({ id, conversationId: 'direct', name: 'report.md', size: 20, publishedAt: time, registrationSource: 'publication', logicalArtifactId, contentVersion, contentHash: 'a'.repeat(64), contentStatus: 'ready', sourceMessageId: 'source', ownerAgentId: 'alice' })
  it('员工文件跨会话汇总本人文件及可接收附件，分页前排除他人/隐藏/清理/撤权来源', async () => {
    const store = await fixture()
    const material = (id: string, conversationId: string, authorizedAgentIds = ['alice']) => ({ id, conversationId, name: `${id}.txt`, size: 10, createdAt: time, messageId: `${conversationId}-source`, format: 'txt', status: 'ready', revision: 1, authorizedAgentIds })
    await store.write([
      row('conversations', { ...conversation('group'), kind: 'group' }), row('messages', message('group-source', 'group')),
      row('conversations', { ...conversation('private'), agentIds: ['bob'] }), row('messages', message('private-source', 'private')),
      row('conversations', conversation('hidden', true)), row('messages', message('hidden-source', 'hidden')),
      row('conversations', conversation('cleared')), row('messages', message('cleared-source', 'cleared')), row('conversationCleanup', { id: 'cleared' }),
      row('artifacts', artifact('own-direct')), row('artifacts', { ...artifact('own-group'), conversationId: 'group', sourceMessageId: 'group-source' }),
      row('artifacts', { ...artifact('other-group'), conversationId: 'group', ownerAgentId: 'bob' }),
      row('artifacts', { ...artifact('own-hidden'), conversationId: 'hidden' }), row('artifacts', { ...artifact('own-cleared'), conversationId: 'cleared' }),
      row('materials', material('received-legacy', 'group')), row('materials', { ...material('received-current', 'group', []), deliveryScope: 'conversation' }),
      row('materials', material('not-received', 'group', ['bob'])), row('materials', material('private-input', 'private')),
      row('materials', material('hidden-input', 'hidden')), row('materials', material('cleared-input', 'cleared')),
    ])
    const first = await files(store, { ownerAgentId: 'alice', limit: 2 })
    expect(first.total).toBe(4); expect(first.items).toHaveLength(2)
    const second = await files(store, { ownerAgentId: 'alice', limit: 2, cursor: first.nextCursor })
    expect(second.total).toBe(4); expect(second.nextCursor).toBeUndefined()
    const items = [...first.items, ...second.items]
    expect(items.map(item => item.id).sort()).toEqual(['own-direct', 'own-group', 'received-current', 'received-legacy'])
    expect(items.find(item => item.id === 'own-group')).toMatchObject({ conversationId: 'group', sourceMessageId: 'group-source' })
    expect((await files(store, { ownerAgentId: 'alice', kind: 'material', name: 'current' })).items.map(item => item.id)).toEqual(['received-current'])
    // A group continues to show that group's files, including another member's output.
    expect((await files(store, { conversationId: 'group' })).items.some(item => item.id === 'other-group')).toBe(true)
    await expect(files(store, { conversationId: 'group', limit: 2, cursor: first.nextCursor })).rejects.toThrow('STALE_CURSOR')
    await store.write([row('conversations', { ...conversation('group'), agentIds: ['bob'] })])
    await expect(files(store, { ownerAgentId: 'alice', limit: 2, cursor: first.nextCursor })).rejects.toThrow('STALE_CURSOR')
    expect((await files(store, { ownerAgentId: 'alice' })).items.map(item => item.id)).toEqual(['own-direct'])
    expect((await files(store, { ownerAgentId: 'removed' })).total).toBe(0)
  })
  it('文件查询必须明确指定员工或会话，不能组合或省略范围', () => {
    expect(conversationFileQuerySchema.safeParse({}).success).toBe(false)
    expect(conversationFileQuerySchema.safeParse({ ownerAgentId: 'alice', conversationId: 'direct' }).success).toBe(false)
  })
  it('同名输入/独立交付分开，最新与采用分开，明确家族才能查历史', async () => {
    const store = await fixture()
    await store.write([row('artifacts', artifact('v1', 'family')), row('artifacts', { ...artifact('v2', 'family', 2), previousArtifactId: 'v1' }), row('artifacts', artifact('independent')), row('artifacts', { ...artifact('copied'), registrationSource: undefined }), row('artifactAdoptionCurrent', { id: 'family', conversationId: 'direct', artifactId: 'v1', contentVersion: 1, contentHash: 'a'.repeat(64) }), row('materials', { id: 'input', conversationId: 'direct', name: 'report.md', size: 20, createdAt: time, messageId: 'source', format: 'markdown', status: 'ready', revision: 1 }), row('materials', { id: 'draft', conversationId: 'direct', name: 'draft.md', size: 20, createdAt: time, format: 'markdown', status: 'ready' })])
    const page = await files(store, { conversationId: 'direct' })
    expect(page.total).toBe(3); expect(page.items.map(value => value.id).sort()).toEqual(['independent', 'input', 'v2'])
    expect(page.items.find(value => value.id === 'v2')).toMatchObject({ versionCount: 2, contentVersion: 2, adopted: { artifactId: 'v1', contentVersion: 1 } })
    const old = await files(store, { conversationId: 'direct', logicalArtifactId: 'family', limit: 1 })
    expect(old.total).toBe(2); expect(old.items[0].id).toBe('v2')
    const next = await files(store, { conversationId: 'direct', logicalArtifactId: 'family', limit: 1, cursor: old.nextCursor })
    expect(next.items[0].id).toBe('v1')
  })
  it('文件种类、名称、发送人和扩展名共同前置过滤，缺原消息不伪造发送', async () => {
    const store = await fixture()
    await store.write([row('artifacts', artifact('markdown')), row('artifacts', { ...artifact('typescript'), name: 'report.index.ts' }), row('materials', { id: 'orphan', conversationId: 'direct', name: 'report.md', createdAt: time, messageId: 'missing', status: 'ready' })])
    const page = await files(store, { conversationId: 'direct', kind: 'artifact', actorId: 'alice', name: 'report index', fileType: '.TS', limit: 1 })
    expect(page.total).toBe(1); expect(page.items[0]).toMatchObject({ id: 'typescript', fileType: 'ts' })
    await store.write([row('conversations', conversation('direct', true))])
    expect((await files(store, { conversationId: 'direct' })).total).toBe(0)
  })
})
describe('确切原目标点击', () => {
  it('交付文件固定登记ID/hash并核验真实受管字节，外改后拒绝原目标', async () => {
    const store = await fixture(), root = roots.at(-1)!, hash = createHash('sha256').update('# 真实成果').digest('hex')
    const file = join(root, 'workspaces', 'direct', 'artifacts', 'result', 'report.md'); await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, '# 真实成果')
    await store.write([row('agents', { id: 'alice', name: 'Alice', active: true }), row('workItems', work('work', { artifactIds: ['artifact'], resultMessageIds: ['result'] })), row('messages', { ...message('result'), senderType: 'agent', senderId: 'alice' })])
    const artifacts = new ArtifactRepository(store, root)
    await store.transaction(tx => artifacts.register(tx, { id: 'artifact', name: 'report.md', path: file, size: Buffer.byteLength('# 真实成果'), ownerAgentId: 'alice', contentHash: hash }, { conversationId: 'direct', sourceMessageId: 'result', sourceWorkId: 'work', revisionRequestId: null }))
    const repository = new WorkViewRepository(store, { message: async () => undefined, work: async () => undefined, material: async () => undefined, artifact: async (tx, artifact, hash) => { await artifacts.validateCurrentArtifact(tx, artifact.id, hash, undefined, false) } })
    expect(await repository.resolveWork({ workId: 'work', kind: 'result', artifactId: 'artifact' })).toMatchObject({ artifactId: 'artifact', contentHash: hash, messageId: 'result' })
    await expect(repository.resolveFile({ conversationId: 'direct', kind: 'artifact', id: 'artifact', contentHash: 'b'.repeat(64) })).rejects.toThrow('版本已失效')
    await writeFile(file, '# 外部修改')
    await expect(repository.resolveWork({ workId: 'work', kind: 'result', artifactId: 'artifact' })).rejects.toThrow('外部修改')
    expect((await store.load<WorkItem>('workItems'))[0].status).toBe('ready')
  })
  it('核对原消息和所见成果身份，不猜最近消息，不恢复隐藏会话', async () => {
    const store = await fixture(), called: string[] = []
    const repository = new WorkViewRepository(store, { message: async (_, value) => { called.push(value.id) }, work: async () => undefined, material: async () => undefined, artifact: async () => undefined })
    await store.write([row('workItems', work('work', { resultMessageIds: ['result'] })), row('messages', { ...message('result'), senderType: 'agent', senderId: 'alice' })])
    expect(await repository.resolveWork({ workId: 'work', kind: 'source' })).toMatchObject({ messageId: 'source' })
    expect(await repository.resolveWork({ workId: 'work', kind: 'result' })).toMatchObject({ messageId: 'result' })
    await expect(repository.resolveWork({ workId: 'work', kind: 'source', messageId: 'result' })).rejects.toThrow('原始目标')
    await store.write([], [{ collection: 'messages', id: 'result' }])
    await expect(repository.resolveWork({ workId: 'work', kind: 'result' })).rejects.toThrow('原消息已失效')
    await store.write([row('conversations', conversation('direct', true))])
    await expect(repository.resolveWork({ workId: 'work', kind: 'source' })).rejects.toThrow('失效')
    expect((await store.load<Conversation>('conversations'))[0].list?.hidden).toBe(true)
    expect(called).toEqual(['source', 'result'])
  })
})
describe('确切审批原卡定位', () => {
  const run = (changes: Partial<AgentRun> = {}): AgentRun => ({ id: 'active-run', workId: 'work', conversationId: 'direct', agentId: 'alice', agentName: 'Alice', triggerMessageId: 'source', messageId: 'run-message', status: 'waiting_approval', createdAt: time, toolEvents: [], ...changes })
  const approval = (changes: Partial<Approval> = {}): Approval => ({ id: 'approval', runId: 'active-run', conversationId: 'direct', agentName: 'Alice', command: 'explicit command', cwd: '/unused', kind: 'command', ...changes })
  const reply = (changes: Partial<Message> = {}): Message => ({ ...message('run-message'), senderType: 'agent', senderId: 'alice', senderName: 'Alice', runId: 'active-run', status: 'streaming', ...changes })
  const target = { workId: 'work', kind: 'approval' as const, approvalId: 'approval', runId: 'active-run' }
  const repository = (store: ProductStore, seen: string[] = []) => new WorkViewRepository(store, { message: async (_, value) => { seen.push(value.id) }, work: async () => undefined, material: async () => undefined, artifact: async () => undefined })
  const pending = async (store: ProductStore) => store.write([row('workItems', work('work', { status: 'running', activeRunId: 'active-run' })), row('runs', run()), row('approvals', approval())])
  it('审批回复未发布仍定位固定待审批卡，发布后只定位同Run真实员工消息，读取零业务写入', async () => {
    const store = await fixture(), seen: string[] = [], reader = repository(store, seen)
    await pending(store)
    expect((await query(store)).items[0].approvalTargets).toEqual([{ approvalId: 'approval', runId: 'active-run', kind: 'command' }])
    const before = await Promise.all(['workItems', 'runs', 'approvals'].map(collection => store.load(collection)))
    expect(await reader.resolveWork(target)).toEqual({ conversationId: 'direct', workId: 'work', approvalId: 'approval', runId: 'active-run' })
    expect(seen).toEqual([])
    expect(await Promise.all(['workItems', 'runs', 'approvals'].map(collection => store.load(collection)))).toEqual(before)
    await store.write([row('messages', reply()), row('messages', { ...reply(), id: 'nearby-reply' })])
    expect((await query(store)).items[0].approvalTargets).toEqual([{ approvalId: 'approval', runId: 'active-run', kind: 'command', messageId: 'run-message' }])
    expect(await reader.resolveWork({ ...target, messageId: 'run-message' })).toEqual({ conversationId: 'direct', workId: 'work', approvalId: 'approval', runId: 'active-run', messageId: 'run-message' })
    expect(seen).toEqual(['run-message'])
    await expect(reader.resolveWork({ ...target, messageId: 'nearby-reply' })).rejects.toThrow('消息身份已失效')
    expect((await store.load<WorkItem>('workItems'))[0].status).toBe('running')
  })
  it('审批与实际holder/负责人/会话/Run严格相同，错误消息关联不降级为邻近卡', async () => {
    const store = await fixture(), reader = repository(store)
    await pending(store)
    for (const changes of [{ workId: 'other-work' }, { agentId: 'bob' }, { conversationId: 'other-chat' }, { status: 'completed' as const }]) {
      await store.write([row('runs', run(changes))])
      expect((await query(store)).items[0].approvalTargets).toEqual([])
      await expect(reader.resolveWork(target)).rejects.toThrow('原审批已结束')
    }
    await store.write([row('runs', run())])
    for (const changes of [{ runId: 'other-run' }, { conversationId: 'other-chat' }]) {
      await store.write([row('approvals', approval(changes))])
      expect((await query(store)).items[0].approvalTargets).toEqual([])
      await expect(reader.resolveWork(target)).rejects.toThrow('原审批已结束')
    }
    await store.write([row('approvals', approval())])
    for (const changes of [{ senderType: 'user' as const }, { senderId: 'bob' }, { runId: 'other-run' }, { conversationId: 'other-chat' }, { status: 'failed' as const }]) {
      await store.write([row('messages', reply(changes))])
      await expect(reader.resolveWork(target)).rejects.toThrow('消息身份已失效')
    }
    await store.write([row('messages', reply())])
    await expect(reader.resolveWork({ ...target, runId: 'other-run' })).rejects.toThrow('原审批已结束')
    await expect(reader.resolveWork({ ...target, approvalId: 'another-approval' })).rejects.toThrow('原审批已结束')
  })
  it('审批结束或切换运行后旧身份拒绝，隐藏和清理不恢复会话，失去实际等待钩子拒绝', async () => {
    const store = await fixture(), reader = repository(store)
    await pending(store)
    const noLiveApproval = new WorkViewRepository(store, { message: async () => undefined, work: async () => undefined, material: async () => undefined, artifact: async () => undefined, approval: () => { throw new Error('原审批已结束') } })
    await expect(noLiveApproval.resolveWork(target)).rejects.toThrow('原审批已结束')
    await store.write([row('approvals', approval({ id: 'new-approval' }))], [{ collection: 'approvals', id: 'approval' }])
    await expect(reader.resolveWork(target)).rejects.toThrow('原审批已结束')
    await pending(store)
    await store.write([row('workItems', work('work', { status: 'running', activeRunId: 'new-run' })), row('runs', run({ id: 'new-run' })), row('approvals', approval({ id: 'new-approval', runId: 'new-run' }))])
    await expect(reader.resolveWork(target)).rejects.toThrow('原审批已结束')
    await pending(store)
    await store.write([row('conversations', conversation('direct', true))])
    await expect(reader.resolveWork(target)).rejects.toThrow('失效')
    expect((await store.load<Conversation>('conversations'))[0].list?.hidden).toBe(true)
    await store.write([row('conversations', conversation('direct')), row('conversationCleanup', { id: 'direct' })])
    await expect(reader.resolveWork(target)).rejects.toThrow('失效')
    expect((await query(store)).total).toBe(0)
  })
  it('审批或Run变化使当前列表游标失效，导航输入必须固定审批身份而非业务动作', async () => {
    const store = await fixture()
    await pending(store); await store.write([row('workItems', work('other'))])
    const first = await query(store, { limit: 1 })
    await store.write([], [{ collection: 'approvals', id: 'approval' }])
    await expect(query(store, { limit: 1, cursor: first.nextCursor })).rejects.toThrow('STALE_CURSOR')
    const second = await query(store, { limit: 1 })
    await store.write([row('runs', run({ status: 'running' }))])
    await expect(query(store, { limit: 1, cursor: second.nextCursor })).rejects.toThrow('STALE_CURSOR')
    expect(workViewTargetSchema.parse(target)).toEqual(target)
    expect(() => workViewTargetSchema.parse({ workId: 'work', kind: 'approval' })).toThrow()
    expect(() => workViewTargetSchema.parse({ ...target, artifactId: 'artifact' })).toThrow()
    expect(() => workViewTargetSchema.parse({ ...target, approved: true })).toThrow()
    expect(() => workViewTargetSchema.parse({ workId: 'work', kind: 'source', approvalId: 'approval' })).toThrow()
  })
})

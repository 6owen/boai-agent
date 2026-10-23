/*
 * [INPUT]: 隔离SQLite、空闲旧房间、消息/材料/Work/原生线程及阅读完成记录。
 * [OUTPUT]: 同事务归一与回滚、精确房间引用/原件hash保持、旧session失效和阅读身份重建回归。
 * [POS]: 第16组持久迁移验证；不启动外部平台或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore, type StoredRecord } from '../src/runtime/adapters/storage/product-store'
import { mergeRooms } from '../src/runtime/modules/conversations/room-migration'
import { ConversationReadingRepository, completionHash } from '../src/runtime/modules/conversations/reading-repository'
import type { Conversation, Message } from '../src/shared/domain'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-room-migration-')); roots.push(root)
  const store = new ProductStore(join(root, 'boai.sqlite')); stores.push(store); await store.init()
  const room = (id: string): Conversation => ({ id, kind: 'direct', title: '写手', agentIds: ['writer'], mode: 'natural', workspacePath: join(root, id), sharedKnowledgeIds: [], createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z' })
  const main = { ...room('main'), mainPrivate: true }, old = room('old')
  const message = (id: string, conversationId: string, createdAt: string): Message => ({ id, conversationId, sequence: 1, createdAt, senderType: 'agent', senderId: 'writer', senderName: '写手', content: id, status: 'completed' })
  const a = message('message-a', main.id, '2026-10-13T01:00:00Z'), b = message('message-b', old.id, '2026-10-13T02:00:00Z')
  const records: StoredRecord[] = [
    ...[main, old, room('unrelated')].map(value => ({ collection: 'conversations', id: value.id, value })),
    ...[a, b].map(value => ({ collection: 'messages', id: value.id, value })),
    { collection: 'materials', id: 'material', value: { id: 'material', conversationId: old.id, contentHash: 'immutable-bytes-hash', path: join(root, 'old', 'original.txt'), revision: 1 } },
    { collection: 'artifacts', id: 'artifact', value: { id: 'artifact', conversationId: old.id, ownerAgentId: 'writer', contentHash: 'immutable-artifact-hash', path: join(root, 'old', 'result.md'), materialSources: [{ id: 'material', conversationId: old.id, revision: 1, contentHash: 'immutable-bytes-hash' }] } },
    { collection: 'workItems', id: 'work', value: { id: 'work', conversationId: old.id, sourceMessageId: b.id, artifactIds: ['artifact'], materialSources: [{ conversationId: old.id }], scope: 'literal old stays prose' } },
    { collection: 'snapshots', id: 'snapshot', value: { id: 'snapshot', conversation: old, materialRefs: [{ conversationId: old.id }] } },
    { collection: 'channelDeliveries', id: 'delivery', value: { id: 'delivery', conversationId: old.id, messageId: b.id, status: 'unknown', externalMessageIds: ['external'] } },
    ...['codexSessions', 'claudeSessions'].flatMap(collection => [main, old].map(room => ({ collection, id: `${collection}-${room.id}`, value: { id: `${collection}-${room.id}`, conversationId: room.id, state: 'completed', threadId: `native-${room.id}` } }))),
    { collection: 'messageReceipts', id: 'receipt', value: { id: 'receipt', conversationId: old.id, messageId: b.id, fingerprint: 'original-request-hash' } },
    { collection: 'messages', id: 'other', value: message('other', 'unrelated', '2026-10-13T03:00:00Z') },
  ]
  await store.write(records)
  const reading = new ConversationReadingRepository(store)
  await store.transaction(async tx => { await reading.recordCompletion(tx, a); await reading.recordCompletion(tx, b) })
  const state = await reading.readState(old.id), completion = (await store.load<import('../src/shared/domain/reading').ConversationCompletion>('conversationCompletions')).find(value => value.messageId === b.id)!
  await reading.observe({ conversationId: old.id, epoch: state.epoch, expectedRevision: state.revision, completions: [completion] })
  return { store, main, old, records, reading, a, b }
}
it('preserves linked business identities, original bytes, unknown sends and read facts while invalidating old native threads', async () => {
  const f = await fixture()
  await f.store.transaction(tx => mergeRooms(tx, f.main, [f.old]))
  const material = await f.store.get<Record<string, unknown>>('materials', 'material'), artifact = await f.store.get<Record<string, unknown>>('artifacts', 'artifact')
  expect(material).toMatchObject({ conversationId: 'main', contentHash: 'immutable-bytes-hash', revision: 1, path: (f.records.find(record => record.id === 'material')!.value as { path: string }).path })
  expect(artifact).toMatchObject({ conversationId: 'main', contentHash: 'immutable-artifact-hash', materialSources: [{ conversationId: 'main' }] })
  expect(await f.store.get('workItems', 'work')).toMatchObject({ conversationId: 'main', sourceMessageId: f.b.id, artifactIds: ['artifact'], materialSources: [{ conversationId: 'main' }], scope: 'literal old stays prose' })
  expect(await f.store.get('snapshots', 'snapshot')).toMatchObject({ conversation: { id: 'main' }, materialRefs: [{ conversationId: 'main' }] })
  expect(await f.store.get('channelDeliveries', 'delivery')).toMatchObject({ status: 'unknown', conversationId: 'main', messageId: f.b.id, externalMessageIds: ['external'] })
  expect(await f.store.get('messageReceipts', 'receipt')).toMatchObject({ conversationId: 'main', fingerprint: 'original-request-hash' })
  expect(await f.store.get('messages', 'other')).toMatchObject({ conversationId: 'unrelated', sequence: 1 })
  for (const collection of ['codexSessions', 'claudeSessions']) expect((await f.store.load<Record<string, unknown>>(collection)).every(session => session.resumeInvalidated === 'room-merged')).toBe(true)
  const state = await f.reading.readState('main')
  expect(state).toMatchObject({ completionCount: 2, unreadCount: 1, sparseSeen: [2], firstUnreadMessageId: f.a.id })
  const migrated = await f.store.get<Message>('messages', f.b.id), completion = await f.store.get<import('../src/shared/domain/reading').ConversationCompletion>('conversationCompletions', f.b.id)
  expect(completion?.contentHash).toBe(completionHash(migrated!))
  expect(await f.store.get('conversations', 'old')).toMatchObject({ mergedInto: 'main', list: { hidden: true } })
})
it('rolls back all relationships when migration fails halfway, and rejects a cleanup fence', async () => {
  const f = await fixture()
  await expect(f.store.transaction(async tx => {
    let count = 0
    const original = tx.put
    tx.put = async record => { await original(record); if (++count === 3) throw new Error('injected write failure') }
    return mergeRooms(tx, f.main, [f.old])
  })).rejects.toThrow('injected write failure')
  expect(await f.store.get('messages', f.b.id)).toEqual(f.b)
  expect(await f.store.get('conversations', 'old')).toEqual(f.old)
  expect(await f.store.get('workItems', 'work')).toMatchObject({ conversationId: 'old' })
  await f.store.write([{ collection: 'conversationCleanup', id: 'old', value: { id: 'old' } }])
  await expect(f.store.transaction(tx => mergeRooms(tx, f.main, [f.old]))).rejects.toThrow('清理待核对')
})

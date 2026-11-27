/*
 * [OUTPUT]: 清理所用主键投影保留写入顺序和空范围，限定到实际集合。
 * [OUTPUT]: 资料及成果按会话保留写入顺序、事务可见性与旧记录隔离。
 * [OUTPUT]: 关闭期间拒绝迟到读写并等待原事务完成，重复关闭幂等且已提交内容仍可只读核对。
 * [INPUT]: 真实SQLite、持有中的写事务、已核验正文索引和独立取证连接。
 * [OUTPUT]: 取证不争写锁、不清正文/推进代际、不创建缺失库；读取仅看已提交事实。
 * [POS]: tests 的 ProductStore 只读取证边界回归；不替代 Electron 功能验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import type { Client, InStatement } from '@libsql/client'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SEARCH_INDEX_CLOCK_COLLECTION, SEARCH_INDEX_COLLECTION } from '../packages/runtime/src/modules/conversations/search-index-sql'

const roots: string[] = [], stores: Pick<ProductStore, 'close'>[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

test('returns only stored primary keys in insertion order for full or restricted cleanup scopes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-record-ids-')); roots.push(root)
  const store = new ProductStore(join(root, 'data.sqlite')); await store.init(); stores.push(store)
  const ids = ['second', 'first', 'third']
  await store.write([...ids.map(id => ({ collection: 'agents', id, value: { id, instructions: 'private instructions' } })), { collection: 'other', id: 'absent', value: { id: 'absent' } }])
  expect(await store.recordIds('agents')).toEqual(ids)
  expect(await store.recordIds('agents', ['first', 'absent', 'second', 'first'])).toEqual(ids.slice(0, 2))
  expect(await store.recordIds('agents', [])).toEqual([])
})

test.each(['artifacts', 'materials'])('scopes %s to the same records and order inside and outside a write transaction', async collection => {
  const root = await mkdtemp(join(tmpdir(), 'boai-file-scope-')); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  const first = { id: 'z', conversationId: 'a', status: 'ready' }
  const other = { id: 'other', conversationId: 'b', status: 'ready' }
  const legacy = { id: 'legacy', status: 'removed' }
  const last = { id: 'a', conversationId: 'a', status: 'removed' }
  await store.write([first, other, legacy, last].map(value => ({ collection, id: value.id, value })))
  const expected = [first, last]
  // Inspect the actual driver call so the assertion covers the shipped query.
  const driver = (store as unknown as { client: Client }).client
  const execute = vi.spyOn(driver, 'execute')
  try {
    expect(await store.load(collection, { conversationId: 'a' })).toEqual(expected)
    const statement = execute.mock.calls.at(-1)?.[0] as InStatement | undefined
    if (!statement || typeof statement !== 'object') throw new Error('Expected a parameterized record query')
    const plan = await driver.execute({ ...statement, sql: 'EXPLAIN QUERY PLAN ' + statement.sql })
    expect(plan.rows.map(row => String(row.detail)).join(' ')).toMatch(/USING INDEX conversation_file_scope .*collection=\? AND <expr>=\?/)
  } finally { execute.mockRestore() }
  await expect(store.transaction(async tx => {
    expect(await tx.list(collection, { conversationId: 'a' })).toEqual(expected)
    expect(await tx.list(collection, { status: 'ready' })).toEqual([first, other])
    await tx.put({ collection, id: last.id, value: { ...last, conversationId: 'b' } })
    expect(await tx.list(collection, { conversationId: 'a' })).toEqual([first])
    throw new Error('test rollback')
  })).rejects.toThrow('test rollback')
  expect(await store.load(collection)).toEqual([first, other, legacy, last])
  expect(await store.load(collection, { conversationId: 'a' })).toEqual(expected)
})

test('evidence reads stay read-only while the actual runtime writer holds its transaction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-readonly-')); roots.push(root)
  const writer = new ProductStore(join(root, 'product.sqlite')); stores.push(writer); await writer.init()
  const indexed = { id: 'body', status: 'indexed', text: 'verified original' }
  await writer.write([{ collection: SEARCH_INDEX_COLLECTION, id: indexed.id, value: indexed }, { collection: 'evidence', id: 'record', value: { id: 'record', state: 'committed' } }])
  const clock = await writer.load(SEARCH_INDEX_CLOCK_COLLECTION)
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve }), held = new Promise<void>(resolve => { release = resolve })
  const mutation = writer.transaction(async tx => {
    await tx.put({ collection: 'evidence', id: 'record', value: { id: 'record', state: 'next' } }); entered(); await held
  })
  await started
  try {
    const reader = await ProductStore.openReadOnly(writer.filename); stores.push(reader)
    expect(await reader.load('evidence')).toEqual([{ id: 'record', state: 'committed' }])
    expect(await reader.load(SEARCH_INDEX_COLLECTION)).toEqual([indexed])
    expect(await reader.load(SEARCH_INDEX_CLOCK_COLLECTION)).toEqual(clock)
  } finally { release(); await mutation }
  expect(await writer.load(SEARCH_INDEX_COLLECTION)).toEqual([indexed])
  expect(await writer.load(SEARCH_INDEX_CLOCK_COLLECTION)).toEqual(clock)
  expect(await writer.load('evidence')).toEqual([{ id: 'record', state: 'next' }])
})

test('opening a missing evidence database cannot create or initialize it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-readonly-')); roots.push(root)
  const file = join(root, 'absent.sqlite')
  await expect(ProductStore.openReadOnly(file)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('closing drains admitted transactions once and rejects later operations before they touch the client', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-store-close-')); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve }), held = new Promise<void>(resolve => { release = resolve })
  const writing = store.transaction(async tx => { await tx.put({ collection: 'test', id: 'accepted', value: { id: 'accepted' } }); entered(); await held })
  await started
  const closing = store.close(), again = store.close()
  try {
    // This must reject while the accepted transaction still owns the database.
    let failure: unknown
    void store.write([{ collection: 'test', id: 'late', value: { id: 'late' } }]).catch(error => { failure = error })
    await Promise.resolve()
    expect(failure).toEqual(expect.objectContaining({ message: '存储正在关闭' }))
  } finally { release(); await writing; await Promise.all([closing, again]) }
  await expect(store.load('test')).rejects.toThrow('存储正在关闭')
  const reader = await ProductStore.openReadOnly(store.filename); stores.push(reader)
  expect(await reader.load('test')).toEqual([{ id: 'accepted' }])
})

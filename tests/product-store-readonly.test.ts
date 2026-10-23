/*
 * [INPUT]: 真实SQLite、持有中的写事务、已核验正文索引和独立取证连接。
 * [OUTPUT]: 取证不争写锁、不清正文/推进代际、不创建缺失库；读取仅看已提交事实。
 * [POS]: tests 的 ProductStore 只读取证边界回归；不替代 Electron 功能验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { SEARCH_INDEX_CLOCK_COLLECTION, SEARCH_INDEX_COLLECTION } from '../src/runtime/modules/conversations/search-index-sql'

const roots: string[] = [], stores: Pick<ProductStore, 'close'>[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
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

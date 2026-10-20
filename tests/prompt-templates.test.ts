/*
 * [INPUT]: 真实ProductStore与提示词目录公共保存/删除schema。
 * [OUTPUT]: CRUD/重启持久化、过期修改删除拒绝、相同请求去重及已删除创建不复活。
 * [POS]: 提示词目录模块检查，无模型或用户数据。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { listPromptTemplates, savePromptTemplate, removePromptTemplate } from '../src/runtime/modules/resources/prompt-templates'
import { AppService } from '../src/runtime/service'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-prompt-templates-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  return { root, store }
}
it('persists created and edited prompts across restarts and deletes without reviving an old create intent', async () => {
  const { root, store } = await fixture(), input = { id: randomUUID(), expectedRevision: 0, name: '  总结  ', content: '按事实、结论、待办组织回答。' }
  const created = await savePromptTemplate(store, input)
  expect(created).toMatchObject({ id: input.id, revision: 1, name: '总结', description: '' })
  expect(await savePromptTemplate(store, input)).toEqual(created)
  const updated = await savePromptTemplate(store, { ...input, expectedRevision: 1, description: '通用总结', content: '先列结论，再列事实和待办。' })
  expect(updated.revision).toBe(2)
  await expect(savePromptTemplate(store, { ...input, content: '旧版本修改' })).rejects.toThrow('已更新')
  await expect(removePromptTemplate(store, { id: input.id, expectedRevision: 1 })).rejects.toThrow('已更新')
  await store.close()
  const reopened = new ProductStore(join(root, 'boai.sqlite')); await reopened.init(); cleanup.push(() => reopened.close())
  expect(await listPromptTemplates(reopened)).toEqual([updated])
  await removePromptTemplate(reopened, { id: input.id, expectedRevision: 2 })
  await removePromptTemplate(reopened, { id: input.id, expectedRevision: 2 })
  expect(await listPromptTemplates(reopened)).toEqual([])
  await expect(savePromptTemplate(reopened, input)).rejects.toThrow('已删除')
})
it('serializes competing edits at the same seen version and validates required content', async () => {
  const { store } = await fixture(), input = { id: randomUUID(), expectedRevision: 0, name: '提示词', content: '内容' }
  await expect(savePromptTemplate(store, { ...input, content: ' ' })).rejects.toThrow()
  await savePromptTemplate(store, input)
  const result = await Promise.allSettled(['甲', '乙'].map(content => savePromptTemplate(store, { ...input, expectedRevision: 1, content })))
  expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  expect(result.filter(item => item.status === 'rejected')).toHaveLength(1)
  expect((await listPromptTemplates(store))[0].revision).toBe(2)
})

it('connects the public owner methods to the same store without running an employee or model', async () => {
  const { root } = await fixture()
  const service = new AppService({ dataPath: root, emit() {}, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, engine: { test: async () => '', run: async () => { throw new Error('unexpected model') }, decide: async () => { throw new Error('unexpected model') } } })
  cleanup.push(() => service.close()); await service.init()
  const input = { id: randomUUID(), expectedRevision: 0, name: '复盘', content: '依据当前事实复盘。' }
  const saved = await service.handle('savePromptTemplate', input)
  expect(await service.handle('listPromptTemplates', undefined)).toEqual([saved])
  await service.handle('removePromptTemplate', { id: input.id, expectedRevision: 1 })
  expect(await service.handle('listPromptTemplates', undefined)).toEqual([])
})

/*
 * [OUTPUT]: 独立集合的旧序兼容/原子移动/CAS/删除身份、损坏拒绝及SQLite备份恢复回归。
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
import { readPromptCollections, updatePromptCollections } from '../src/runtime/modules/resources/prompt-collections'
import type { PromptCollectionAction } from '../src/shared/domain/prompt-templates'

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


const collections = (store: ProductStore) => store.transaction(readPromptCollections)
const change = async (store: ProductStore, action: PromptCollectionAction) => updatePromptCollections(store, { expectedRevision: (await collections(store)).revision, action })
it('projects legacy prompts in their previous order and appends new prompts without changing old bodies', async () => {
  const { store } = await fixture()
  const older = await savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name: '旧', content: '旧正文' })
  const newer = await savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name: '新', content: '新正文' })
  await store.transaction(async tx => { await tx.remove('promptCollections', 'library'); await tx.put({ collection: 'promptTemplates', id: older.id, value: { ...older, updatedAt: '2020-01-01' } }); await tx.put({ collection: 'promptTemplates', id: newer.id, value: { ...newer, updatedAt: '2021-01-01' } }) })
  expect(await collections(store)).toMatchObject({ revision: 0, promptIds: [newer.id, older.id], groups: [] })
  expect(await store.get('promptCollections', 'library')).toBeUndefined()
  const added = await savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name: '追加', content: '追加正文' })
  expect((await collections(store)).promptIds).toEqual([newer.id, older.id, added.id])
  const before = await collections(store)
  await savePromptTemplate(store, { id: older.id, expectedRevision: 1, name: older.name, content: '编辑正文' })
  expect(await collections(store)).toEqual(before)
})
it('moves and orders prompts atomically, then deletes only the group and appends its members to ungrouped', async () => {
  const { store } = await fixture()
  const prompts = await Promise.all(['甲', '乙', '丙'].map(name => savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name, content: name + '正文' })))
  const ids = prompts.map(value => value.id)
  const grouped = await change(store, { kind: 'create-group', name: ' 工作   模板 ' }), groupId = grouped.groups[0].id
  expect(grouped.groups[0].name).toBe('工作 模板')
  await change(store, { kind: 'assign-group', promptId: ids[0], groupId })
  await change(store, { kind: 'move-prompt', promptId: ids[1], targetId: ids[0], placement: 'before' })
  const ordered = await collections(store)
  expect(ordered.groupByPromptId).toEqual({ [ids[0]]: groupId, [ids[1]]: groupId })
  expect(ordered.promptIds).toEqual([ids[2], ids[1], ids[0]])
  await change(store, { kind: 'delete-group', groupId })
  expect(await collections(store)).toMatchObject({ promptIds: [ids[2], ids[1], ids[0]], groups: [], groupByPromptId: {} })
  expect((await listPromptTemplates(store)).sort((a, b) => a.name.localeCompare(b.name))).toEqual([...prompts].sort((a, b) => a.name.localeCompare(b.name)))
})
it('rejects concurrent collection writes, reserved/duplicate names and deleted identities without reviving them', async () => {
  const { store } = await fixture()
  const prompt = await savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name: '正文', content: '正文' })
  const initial = await collections(store)
  const writes = await Promise.allSettled(['Work', 'Other'].map(name => updatePromptCollections(store, { expectedRevision: initial.revision, action: { kind: 'create-group', name } })))
  expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const value = await collections(store), group = value.groups[0]
  await expect(change(store, { kind: 'create-group', name: group.name.toLowerCase() })).rejects.toThrow('已存在')
  await expect(change(store, { kind: 'create-group', name: '未分组' })).rejects.toThrow('保留名称')
  await change(store, { kind: 'assign-group', promptId: prompt.id, groupId: group.id })
  await removePromptTemplate(store, { id: prompt.id, expectedRevision: prompt.revision })
  expect(await collections(store)).toMatchObject({ promptIds: [], groupByPromptId: {} })
  await expect(change(store, { kind: 'assign-group', promptId: prompt.id, groupId: group.id })).rejects.toThrow('已删除')
  await change(store, { kind: 'delete-group', groupId: group.id })
  await expect(change(store, { kind: 'rename-group', groupId: group.id, name: '复活' })).rejects.toThrow('不存在')
})
it('preserves independent skill collections, body references and grouped ordering through a SQLite backup', async () => {
  const { store, root } = await fixture()
  const prompt = await savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name: '引用', content: '发送原正文' })
  const reference = structuredClone(prompt)
  const group = (await change(store, { kind: 'create-group', name: '同名组' })).groups[0]
  const skills = { revision: 9, favoriteResourceIds: ['skill'], groups: [{ id: 'skill-group', name: '同名组' }], groupByResourceId: { skill: 'skill-group' } }
  await store.write([{ collection: 'skillCollections', id: 'library', value: skills }])
  await change(store, { kind: 'assign-group', promptId: prompt.id, groupId: group.id })
  const before = await collections(store), backup = join(root, 'backup.sqlite')
  await store.backup(backup)
  const restored = new ProductStore(backup); await restored.init(); cleanup.push(() => restored.close())
  expect(await collections(restored)).toEqual(before)
  expect(await restored.get('skillCollections', 'library')).toEqual(skills)
  expect(await listPromptTemplates(restored)).toEqual([reference])
})
it('projects dangling references safely but refuses corrupt metadata without overwriting bodies or stored records', async () => {
  const { store } = await fixture()
  const prompt = await savePromptTemplate(store, { id: randomUUID(), expectedRevision: 0, name: '保留', content: '不可丢失' })
  await store.write([{ collection: 'promptCollections', id: 'library', value: { revision: 6, promptIds: ['deleted', prompt.id], groups: [], groupByPromptId: { [prompt.id]: 'missing' } } }])
  expect(await collections(store)).toEqual({ revision: 6, promptIds: [prompt.id], groups: [], groupByPromptId: {} })
  const corrupt = { revision: 'broken', groups: [] }
  await store.write([{ collection: 'promptCollections', id: 'library', value: corrupt }])
  await expect(collections(store)).rejects.toThrow('损坏')
  await expect(change(store, { kind: 'create-group', name: '不能覆盖' })).rejects.toThrow('损坏')
  expect(await store.get('promptCollections', 'library')).toEqual(corrupt)
  expect(await listPromptTemplates(store)).toEqual([prompt])
})

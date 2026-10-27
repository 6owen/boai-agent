/*
 * [INPUT]: 真实SQLite、定时任务和独立列表偏好仓库。
 * [OUTPUT]: 标签批量写入原子性、CAS竞争、跨组移动保留其他标签、重启与原任务/执行记录隔离。
 * [POS]: 定时任务列表持久化回归；无Electron或模型调用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与tests/.folder.md。
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ScheduleListRepository } from '../packages/runtime/src/modules/automations/schedule-list'
import { scheduleListChangeSchema, sortedSchedules, type ScheduleListAction } from '../packages/shared/src/domain/schedule-list'

const roots: string[] = [], stores = new Set<ProductStore>()
afterEach(async () => { for (const store of stores) await store.close(); stores.clear(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-schedule-list-')); roots.push(root)
  const store = new ProductStore(join(root, 'test.sqlite')); await store.init(); stores.add(store)
  const tasks = [{ id: 'a', name: '早报', createdAt: '2026-10-01', revision: 3, enabled: true }, { id: 'b', name: '日报', createdAt: '2026-10-02', revision: 7, enabled: false }]
  const record = { id: 'history', automationId: 'a', status: 'failed', stateVersion: 2 }
  await store.write([...tasks.map(value => ({ collection: 'automations', id: value.id, value })), { collection: 'automationOccurrences', id: record.id, value: record }])
  const repo = new ScheduleListRepository(store)
  const change = async (action: ScheduleListAction) => repo.update({ expectedRevision: (await repo.read()).revision, action })
  return { store, repo, change, tasks, record, root }
}
test('moving between tags preserves unrelated labels and never changes execution data, including after restart', async () => {
  const f = await setup()
  for (const name of ['日报', '关注', '归档']) await f.change({ kind: 'create-tag', name })
  const [daily, keep, archive] = (await f.repo.read()).tags.map(tag => tag.id)
  await f.change({ kind: 'set-tags', automationIds: ['a', 'b'], tagIds: [daily, keep], mode: 'add' })
  let value = await f.change({ kind: 'move-to-tag', id: 'a', fromTagId: daily, tagId: archive })
  expect(value.tagIdsByAutomationId).toEqual({ a: [keep, archive], b: [daily, keep] })
  value = await f.change({ kind: 'delete-tag', tagId: keep })
  expect(value.tagIdsByAutomationId).toEqual({ a: [archive], b: [daily] })
  value = await f.change({ kind: 'move-task', id: 'a', targetId: 'b', placement: 'before' })
  expect(sortedSchedules(f.tasks, value.order).map(task => task.id)).toEqual(['a', 'b'])
  expect(await f.store.get('automations', 'a')).toEqual(f.tasks[0])
  expect(await f.store.get('automationOccurrences', 'history')).toEqual(f.record)
  await f.store.close(); stores.delete(f.store)
  const reopened = new ProductStore(join(f.root, 'test.sqlite')); await reopened.init(); stores.add(reopened)
  expect(await new ScheduleListRepository(reopened).read()).toEqual(value)
})
test('unknown or deleted task and label reject the entire batch without erasing prior assignments', async () => {
  const { store, repo, change } = await setup()
  const tagId = (await change({ kind: 'create-tag', name: '工作' })).tags[0].id
  await change({ kind: 'set-tags', automationIds: ['b'], tagIds: [tagId], mode: 'add' })
  const before = await repo.read()
  for (const automationIds of [['a', 'missing'], ['missing']]) await expect(change({ kind: 'set-tags', automationIds, tagIds: [tagId], mode: 'add' })).rejects.toThrow('不存在')
  await expect(change({ kind: 'set-tags', automationIds: ['a'], tagIds: [tagId, 'missing'], mode: 'replace' })).rejects.toThrow('标签不存在')
  await store.write([{ collection: 'automations', id: 'a', value: { id: 'a', deletedAt: '2026-10-27' } }])
  await expect(change({ kind: 'set-tags', automationIds: ['a', 'b'], tagIds: [], mode: 'replace' })).rejects.toThrow('已删除')
  expect(await repo.read()).toEqual(before)
})
test('concurrent writes cannot overwrite each other; duplicate/reserved labels and stale drag sources fail', async () => {
  const { repo, change } = await setup()
  const writes = await Promise.allSettled(['工作', '个人'].map(name => repo.update({ expectedRevision: 0, action: { kind: 'create-tag', name } })))
  expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(writes.filter(result => result.status === 'rejected')).toHaveLength(1)
  const before = await repo.read(), tag = before.tags[0]
  await expect(change({ kind: 'create-tag', name: ` ${tag.name} ` })).rejects.toThrow('已存在')
  await expect(change({ kind: 'create-tag', name: '无标签' })).rejects.toThrow('已存在')
  await expect(change({ kind: 'move-to-tag', id: 'a', fromTagId: tag.id })).rejects.toThrow('已变化')
  expect(await repo.read()).toEqual(before)
  expect(scheduleListChangeSchema.safeParse({ expectedRevision: 1, action: { kind: 'set-tags', automationIds: [], tagIds: [], mode: 'replace' } }).success).toBe(false)
})
test('tag ordering and removing a task to the untagged group survive deterministic ordering', async () => {
  const { repo, change } = await setup()
  const first = (await change({ kind: 'create-tag', name: '第一组' })).tags[0].id
  const second = (await change({ kind: 'create-tag', name: '第二组' })).tags[1].id
  expect((await change({ kind: 'move-tag', tagId: second, targetId: first, placement: 'before' })).tags.map(tag => tag.id)).toEqual([second, first])
  await change({ kind: 'set-tags', automationIds: ['a', 'a'], tagIds: [first, first, second], mode: 'replace' })
  expect((await repo.read()).tagIdsByAutomationId.a).toEqual([first, second])
  expect((await change({ kind: 'move-to-tag', id: 'a', fromTagId: first })).tagIdsByAutomationId.a).toEqual([])
})

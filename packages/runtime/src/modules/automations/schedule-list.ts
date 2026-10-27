/*
 * [INPUT]: ProductStore 事务、现存定时任务和版本化展示操作。
 * [OUTPUT]: 原子保存标签/排序；拒绝过期版本、已删任务和未知标签，删除标签保留任务及其他标签。
 * [POS]: automations 展示偏好仓库；不调用调度或执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import type { AutomationDefinition } from '@boai/shared/domain/automations'
import { emptyScheduleList, scheduleListChangeSchema, scheduleTagIds, sortedSchedules, type ScheduleListChange, type ScheduleListPreferences } from '@boai/shared/domain/schedule-list'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

const read = async (tx: RecordTransaction): Promise<ScheduleListPreferences> => await tx.get<ScheduleListPreferences>('scheduleList', 'schedules') ?? emptyScheduleList()
function move<T>(items: T[], source: T, target: T, placement: 'before' | 'after') {
  if (source === target) return
  items.splice(items.indexOf(source), 1)
  items.splice(items.indexOf(target) + (placement === 'after' ? 1 : 0), 0, source)
}
export class ScheduleListRepository {
  constructor(private readonly store: ProductStore) {}
  read() { return this.store.transaction(read) }
  update(input: ScheduleListChange) {
    const { expectedRevision, action } = scheduleListChangeSchema.parse(input)
    return this.store.transaction(async tx => {
      const value = await read(tx)
      if (value.revision !== expectedRevision) throw new Error('定时任务标签已在其他窗口修改，请重新选择')
      const requireTag = (id: string) => {
        const tag = value.tags.find(tag => tag.id === id)
        if (!tag) throw new Error('标签不存在')
        return tag
      }
      const requireTask = async (id: string) => {
        const task = await tx.get<AutomationDefinition>('automations', id)
        if (!task || task.deletedAt) throw new Error('定时任务已删除或不存在')
      }
      if ('tagId' in action && action.tagId) requireTag(action.tagId)
      if (action.kind === 'create-tag' || action.kind === 'rename-tag') {
        const name = action.name.trim().replace(/\s+/g, ' ')
        if (['全部', '全部定时任务', '无标签'].includes(name) || value.tags.some(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase() && (action.kind === 'create-tag' || tag.id !== action.tagId))) throw new Error('标签名称已存在')
        if (action.kind === 'create-tag') {
          if (value.tags.length >= 100) throw new Error('最多创建 100 个标签')
          value.tags.push({ id: randomUUID(), name })
        } else requireTag(action.tagId).name = name
      } else if (action.kind === 'delete-tag') {
        value.tags = value.tags.filter(tag => tag.id !== action.tagId)
        for (const [id, tags] of Object.entries(value.tagIdsByAutomationId)) value.tagIdsByAutomationId[id] = tags.filter(tag => tag !== action.tagId)
      } else if (action.kind === 'move-tag') {
        move(value.tags, requireTag(action.tagId), requireTag(action.targetId), action.placement)
      } else if (action.kind === 'set-tags') {
        for (const tagId of action.tagIds) requireTag(tagId)
        for (const id of new Set(action.automationIds)) await requireTask(id)
        for (const id of new Set(action.automationIds)) {
          const current = scheduleTagIds(value, id)
          value.tagIdsByAutomationId[id] = [...new Set(action.mode === 'replace' ? action.tagIds : action.mode === 'add' ? [...current, ...action.tagIds] : current.filter(tag => !action.tagIds.includes(tag)))]
        }
      } else if (action.kind === 'move-to-tag') {
        await requireTask(action.id)
        if (action.fromTagId) requireTag(action.fromTagId)
        const current = scheduleTagIds(value, action.id)
        if (action.fromTagId && !current.includes(action.fromTagId)) throw new Error('任务分组已变化，请重新拖拽')
        value.tagIdsByAutomationId[action.id] = action.tagId ? [...new Set([...current.filter(tag => tag !== action.fromTagId), action.tagId])] : []
      } else {
        await requireTask(action.id); await requireTask(action.targetId)
        const tasks = (await tx.list<AutomationDefinition>('automations')).filter(task => !task.deletedAt)
        value.order = sortedSchedules(tasks, value.order).map(task => task.id)
        move(value.order, action.id, action.targetId, action.placement)
      }
      value.revision++
      await tx.put({ collection: 'scheduleList', id: 'schedules', value })
      return value
    })
  }
}

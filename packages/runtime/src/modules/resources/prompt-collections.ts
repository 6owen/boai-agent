/*
 * [INPUT]: 原ProductStore事务、全局提示词身份和集合所见版本。
 * [OUTPUT]: 独立分组/顺序原子更新、旧目录投影、失效身份清理和损坏元数据拒绝；不修改正文。
 * [POS]: 提示词集合用例，与技能收藏和正文版本独立。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { promptCollectionChangeSchema, type PromptCollections, type PromptTemplate } from '@boai/shared/domain/prompt-templates'

const savedSchema = z.object({
  revision: z.number().int().nonnegative(), promptIds: z.array(z.string().min(1)),
  groups: z.array(z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(40) })).max(100),
  groupByPromptId: z.record(z.string(), z.string().min(1)),
})
export async function readPromptCollections(tx: RecordTransaction): Promise<PromptCollections> {
  const prompts = (await tx.list<PromptTemplate & { deletedAt?: string }>('promptTemplates')).filter(item => !item.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  const raw = await tx.get<unknown>('promptCollections', 'library')
  if (raw === undefined) return { revision: 0, promptIds: prompts.map(item => item.id), groups: [], groupByPromptId: {} }
  const parsed = savedSchema.safeParse(raw)
  if (!parsed.success) throw new Error('提示词分组记录损坏，请保留原数据并恢复备份。')
  const value = parsed.data
  const groups = new Set(value.groups.map(group => group.id)), ids = new Set(prompts.map(item => item.id))
  if (groups.size !== value.groups.length || new Set(value.promptIds).size !== value.promptIds.length || new Set(value.groups.map(group => group.name.toLocaleLowerCase())).size !== value.groups.length) throw new Error('提示词分组身份或名称重复，请保留原数据并恢复备份。')
  return { ...value, promptIds: [...value.promptIds.filter(id => ids.has(id)), ...prompts.filter(item => !value.promptIds.includes(item.id)).map(item => item.id)],
    groupByPromptId: Object.fromEntries(Object.entries(value.groupByPromptId).filter(([id, group]) => ids.has(id) && groups.has(group))) }
}
export async function writePromptCollections(tx: RecordTransaction, value: PromptCollections) {
  value.revision++
  await tx.put({ collection: 'promptCollections', id: 'library', value })
}
export function updatePromptCollections(store: ProductStore, input: unknown) {
  const { expectedRevision, action } = promptCollectionChangeSchema.parse(input)
  return store.transaction(async tx => {
    const value = await readPromptCollections(tx)
    if (value.revision !== expectedRevision) throw new Error('提示词分组已在其他窗口修改，请刷新后重试。')
    if ('promptId' in action && !value.promptIds.includes(action.promptId)) throw new Error('提示词已删除，请刷新后重试。')
    if ('groupId' in action && action.groupId && !value.groups.some(group => group.id === action.groupId)) throw new Error('分组不存在，请刷新后重试。')
    if (action.kind === 'create-group' || action.kind === 'rename-group') {
      const name = action.name.trim().replace(/\s+/g, ' ')
      if (name === '未分组') throw new Error('“未分组”是保留名称，请使用其他名称。')
      if (value.groups.some(group => group.name.toLocaleLowerCase() === name.toLocaleLowerCase() && (action.kind === 'create-group' || group.id !== action.groupId))) throw new Error('分组名称已存在。')
      if (action.kind === 'create-group') {
        if (value.groups.length >= 100) throw new Error('最多创建 100 个分组。')
        value.groups.push({ id: randomUUID(), name })
      } else value.groups = value.groups.map(group => group.id === action.groupId ? { ...group, name } : group)
    } else if (action.kind === 'delete-group') {
      const members = value.promptIds.filter(id => value.groupByPromptId[id] === action.groupId)
      value.promptIds = [...value.promptIds.filter(id => !members.includes(id)), ...members]
      value.groups = value.groups.filter(group => group.id !== action.groupId)
      value.groupByPromptId = Object.fromEntries(Object.entries(value.groupByPromptId).filter(([, group]) => group !== action.groupId))
    } else if (action.kind === 'move-group') {
      if (!value.groups.some(group => group.id === action.targetId)) throw new Error('目标分组不存在。')
      if (action.groupId === action.targetId) return value
      const group = value.groups.find(group => group.id === action.groupId)!
      value.groups = value.groups.filter(group => group.id !== action.groupId)
      value.groups.splice(value.groups.findIndex(group => group.id === action.targetId) + (action.placement === 'after' ? 1 : 0), 0, group)
    } else if (action.kind === 'move-prompt') {
      if (!value.promptIds.includes(action.targetId)) throw new Error('目标提示词已删除。')
      if (action.promptId === action.targetId) return value
      value.promptIds = value.promptIds.filter(id => id !== action.promptId)
      value.promptIds.splice(value.promptIds.indexOf(action.targetId) + (action.placement === 'after' ? 1 : 0), 0, action.promptId)
      const group = value.groupByPromptId[action.targetId]
      if (group) value.groupByPromptId[action.promptId] = group
      else delete value.groupByPromptId[action.promptId]
    } else {
      if (value.groupByPromptId[action.promptId] === action.groupId) return value
      value.promptIds = [...value.promptIds.filter(id => id !== action.promptId), action.promptId]
      if (action.groupId) value.groupByPromptId[action.promptId] = action.groupId
      else delete value.groupByPromptId[action.promptId]
    }
    await writePromptCollections(tx, value)
    return value
  })
}

/*
 * [INPUT]: SQLite 产品事务、受管资源和带版本的用户收藏操作。
 * [OUTPUT]: 分组前后排序、技能顺序与跨组归属原子保存；本机 local 身份与受管资源共用收藏事务，仍不改变授权；持久收藏/分组、便携库的事务内幂等合并、冲突拒绝与删除资源关联清理；不改变员工授权。
 * [POS]: resources 的集合用例。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Resource } from '../../../shared/domain'
import type { SkillCollections, SkillCollectionAction } from '../../../shared/domain/skills'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

const id = z.string().min(1).max(200)
const groupName = z.string().trim().min(1).max(40)
export const collectionChangeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('favorite'), resourceId: id, favorite: z.boolean() }).strict(),
    z.object({ kind: z.literal('create-group'), name: groupName }).strict(),
    z.object({ kind: z.literal('rename-group'), groupId: id, name: groupName }).strict(),
    z.object({ kind: z.literal('delete-group'), groupId: id }).strict(),
    z.object({ kind: z.literal('move-group'), groupId: id, targetId: id, placement: z.enum(['before', 'after']).optional() }).strict(),
    z.object({ kind: z.literal('move-skill'), resourceId: id, targetId: id, placement: z.enum(['before', 'after']) }).strict(),
    z.object({ kind: z.literal('assign-group'), resourceId: id, groupId: id.optional() }).strict(),
  ]),
}).strict()
export const emptySkillCollections = (): SkillCollections => ({ revision: 0, favoriteResourceIds: [], groups: [], groupByResourceId: {} })
export async function readSkillCollections(tx: RecordTransaction): Promise<SkillCollections> {
  return await tx.get<SkillCollections>('skillCollections', 'library') ?? emptySkillCollections()
}
export async function writeSkillCollections(tx: RecordTransaction, value: SkillCollections) {
  value.revision++
  await tx.put({ collection: 'skillCollections', id: 'library', value })
}
export async function mergeSkillCollection(tx: RecordTransaction, resourceId: string, groupName?: string, groupOrder: string[] = []) {
  const value = await readSkillCollections(tx)
  // Reimport must not replace the user's current grouping of an existing favorite.
  if (value.favoriteResourceIds.includes(resourceId)) return
  value.favoriteResourceIds.push(resourceId)
  if (groupName) {
    const name = groupName.trim().replace(/\s+/g, ' ')
    let group = value.groups.find(group => group.name.toLowerCase() === name.toLowerCase())
    if (!group) {
      if (value.groups.length >= 100) throw new Error('收藏分组已达 100 个，请整理后重新导入')
      group = { id: randomUUID(), name }
      const position = groupOrder.findIndex(value => value.toLowerCase() === name.toLowerCase())
      const following = position < 0 ? [] : groupOrder.slice(position + 1).map(value => value.toLowerCase())
      const before = value.groups.findIndex(group => following.includes(group.name.toLowerCase()))
      value.groups.splice(before < 0 ? value.groups.length : before, 0, group)
    }
    value.groupByResourceId[resourceId] = group.id
  }
  await writeSkillCollections(tx, value)
}
export async function detachSkillRecords(tx: RecordTransaction, resourceId: string) {
  await tx.remove('skillUpdateChecks', resourceId)
  const value = await readSkillCollections(tx)
  if (value.favoriteResourceIds.includes(resourceId) || value.groupByResourceId[resourceId]) {
    value.favoriteResourceIds = value.favoriteResourceIds.filter(id => id !== resourceId)
    delete value.groupByResourceId[resourceId]
    await writeSkillCollections(tx, value)
  }
  await tx.remove('skillInstallations', resourceId)
}
export class SkillCollectionRepository {
  constructor(private readonly store: ProductStore, private readonly localExists: (id: string) => Promise<boolean> = async () => false) {}
  read() { return this.store.transaction(readSkillCollections) }
  update(expectedRevision: number, action: SkillCollectionAction) {
    return this.store.transaction(async tx => {
      const value = await readSkillCollections(tx)
      if (value.revision !== expectedRevision) throw new Error('收藏已在其他窗口修改，请刷新后重试')
      if ('resourceId' in action) {
        if ((await tx.get<Resource>('resources', action.resourceId))?.kind !== 'skill' && !(action.resourceId.startsWith('local:') && await this.localExists(action.resourceId))) throw new Error('技能不存在，不能修改收藏')
      }
      if ('groupId' in action && action.groupId && !value.groups.some(group => group.id === action.groupId)) throw new Error('分组不存在')
      if (action.kind === 'favorite') {
        if (action.favorite && !value.favoriteResourceIds.includes(action.resourceId)) value.favoriteResourceIds.push(action.resourceId)
        if (!action.favorite) {
          value.favoriteResourceIds = value.favoriteResourceIds.filter(id => id !== action.resourceId)
          delete value.groupByResourceId[action.resourceId]
        }
      } else if (action.kind === 'create-group' || action.kind === 'rename-group') {
        const name = action.name.trim().replace(/\s+/g, ' ')
        if (!name || name.length > 40) throw new Error('分组名称需要 1–40 个字符')
        if (value.groups.some(group => group.name.toLocaleLowerCase() === name.toLocaleLowerCase() && (action.kind === 'create-group' || group.id !== action.groupId))) throw new Error('分组名称已存在')
        if (action.kind === 'create-group') {
          if (value.groups.length >= 100) throw new Error('最多创建 100 个分组')
          value.groups.push({ id: randomUUID(), name })
        } else value.groups = value.groups.map(group => group.id === action.groupId ? { ...group, name } : group)
      } else if (action.kind === 'delete-group') {
        value.groups = value.groups.filter(group => group.id !== action.groupId)
        value.groupByResourceId = Object.fromEntries(Object.entries(value.groupByResourceId).filter(([, groupId]) => groupId !== action.groupId))
      } else if (action.kind === 'move-group') {
        const group = value.groups.find(group => group.id === action.groupId)!
        if (!value.groups.some(group => group.id === action.targetId)) throw new Error('目标分组不存在')
        if (action.groupId !== action.targetId) {
          value.groups = value.groups.filter(group => group.id !== action.groupId)
          value.groups.splice(value.groups.findIndex(group => group.id === action.targetId) + (action.placement === 'after' ? 1 : 0), 0, group)
        }
      } else if (action.kind === 'move-skill') {
        if (!value.favoriteResourceIds.includes(action.resourceId) || !value.favoriteResourceIds.includes(action.targetId)) throw new Error('只能移动已收藏的技能')
        if ((await tx.get<Resource>('resources', action.targetId))?.kind !== 'skill' && !(action.targetId.startsWith('local:') && await this.localExists(action.targetId))) throw new Error('目标技能不存在')
        if (action.resourceId !== action.targetId) {
          value.favoriteResourceIds = value.favoriteResourceIds.filter(id => id !== action.resourceId)
          value.favoriteResourceIds.splice(value.favoriteResourceIds.indexOf(action.targetId) + (action.placement === 'after' ? 1 : 0), 0, action.resourceId)
          const groupId = value.groupByResourceId[action.targetId]
          if (groupId) value.groupByResourceId[action.resourceId] = groupId
          else delete value.groupByResourceId[action.resourceId]
        }
      } else {
        if (!value.favoriteResourceIds.includes(action.resourceId)) throw new Error('请先将技能加入我的')
        if (action.groupId) value.groupByResourceId[action.resourceId] = action.groupId
        else delete value.groupByResourceId[action.resourceId]
      }
      await writeSkillCollections(tx, value)
      return value
    })
  }
}

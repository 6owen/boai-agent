/*
 * [INPUT]: 产品事务、现存员工/群聊、版本化通讯录操作及团队发布身份和成员。
 * [OUTPUT]: 分类/顺序原子持久化；解散分类保留员工，分类员工批量删除由宿主清理用例处理；团队同事务新建唯一名称分类并归入成员。
 * [POS]: employees 的通讯录展示偏好，不写员工定义或会话列表偏好。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Conversation, DigitalAgent } from '../../../shared/domain'
import { emptyContactList, sortedContacts, type ContactListAction, type ContactListPreferences } from '../../../shared/domain/contact-list'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

const id = z.string().trim().min(1).max(200)
const CATEGORY_NAME_LIMIT = 40
const CATEGORY_COUNT_LIMIT = 100
const name = z.string().trim().min(1).max(CATEGORY_NAME_LIMIT)
export const contactListChangeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('create-category'), name }).strict(),
    z.object({ kind: z.literal('rename-category'), categoryId: id, name }).strict(),
    z.object({ kind: z.literal('delete-category'), categoryId: id }).strict(),
    z.object({ kind: z.literal('delete-category-agents'), categoryId: id }).strict(),
    z.object({ kind: z.literal('move-category'), categoryId: id, targetId: id, placement: z.enum(['before', 'after']) }).strict(),
    z.object({ kind: z.literal('assign-category'), agentId: id, categoryId: id.optional() }).strict(),
    z.object({ kind: z.literal('move'), itemKind: z.enum(['agent', 'group']), id, targetId: id, placement: z.enum(['before', 'after']) }).strict(),
  ]),
}).strict()

async function readPreferences(tx: RecordTransaction): Promise<ContactListPreferences> {
  return await tx.get<ContactListPreferences>('contactList', 'contacts') ?? emptyContactList()
}

export async function createTeamContactCategory(tx: RecordTransaction, categoryId: string, teamName: string, agentIds: string[]) {
  const value = await readPreferences(tx)
  if (value.categories.length >= CATEGORY_COUNT_LIMIT) throw new Error('最多创建 100 个分类，请删除不需要的分类后继续创建团队')
  if (value.categories.some(category => category.id === categoryId)) throw new Error('团队分类身份已被占用')
  const base = teamName.trim().replace(/\s+/g, ' ')
  const usedNames = new Set(['未分类', ...value.categories.map(category => category.name.toLocaleLowerCase())])
  let categoryName = base.slice(0, CATEGORY_NAME_LIMIT), index = 2
  while (usedNames.has(categoryName.toLocaleLowerCase())) {
    const suffix = `（${index++}）`
    categoryName = base.slice(0, CATEGORY_NAME_LIMIT - suffix.length).trimEnd() + suffix
  }
  value.categories.push({ id: categoryId, name: categoryName })
  for (const agentId of agentIds) value.categoryByAgentId[agentId] = categoryId
  value.revision++
  await tx.put({ collection: 'contactList', id: 'contacts', value })
}

export class ContactListRepository {
  constructor(private readonly store: ProductStore) {}
  read() { return this.store.transaction(readPreferences) }
  update(expectedRevision: number, action: ContactListAction) {
    if (action.kind === 'delete-category-agents') throw new Error('分类员工删除必须经过宿主清理用例')
    return this.store.transaction(async tx => {
      const value = await readPreferences(tx)
      if (value.revision !== expectedRevision) throw new Error('通讯录已在其他窗口修改，请重试')
      if ('categoryId' in action && action.categoryId && !value.categories.some(category => category.id === action.categoryId)) throw new Error('员工分类不存在')
      if (action.kind === 'create-category' || action.kind === 'rename-category') {
        const categoryName = action.name.trim().replace(/\s+/g, ' ')
        if (!categoryName || categoryName.length > CATEGORY_NAME_LIMIT) throw new Error('分类名称需要 1–40 个字符')
        if (categoryName === '未分类' || value.categories.some(category => category.name.toLocaleLowerCase() === categoryName.toLocaleLowerCase() && (action.kind === 'create-category' || category.id !== action.categoryId))) throw new Error('分类名称已存在')
        if (action.kind === 'create-category') {
          if (value.categories.length >= CATEGORY_COUNT_LIMIT) throw new Error('最多创建 100 个分类')
          value.categories.push({ id: randomUUID(), name: categoryName })
        } else value.categories = value.categories.map(category => category.id === action.categoryId ? { ...category, name: categoryName } : category)
      } else if (action.kind === 'delete-category') {
        value.categories = value.categories.filter(category => category.id !== action.categoryId)
        value.categoryByAgentId = Object.fromEntries(Object.entries(value.categoryByAgentId).filter(([, categoryId]) => categoryId !== action.categoryId))
      } else if (action.kind === 'move-category') {
        const category = value.categories.find(category => category.id === action.categoryId)!
        if (!value.categories.some(category => category.id === action.targetId)) throw new Error('目标员工分类不存在')
        if (action.categoryId !== action.targetId) {
          value.categories = value.categories.filter(category => category.id !== action.categoryId)
          value.categories.splice(value.categories.findIndex(category => category.id === action.targetId) + (action.placement === 'after' ? 1 : 0), 0, category)
        }
      } else if (action.kind === 'assign-category') {
        if (!await tx.get<DigitalAgent>('agents', action.agentId)) throw new Error('员工不存在')
        if (action.categoryId) value.categoryByAgentId[action.agentId] = action.categoryId
        else delete value.categoryByAgentId[action.agentId]
      } else {
        const agents = action.itemKind === 'agent'
        const items = agents
          ? (await tx.list<DigitalAgent>('agents')).map(agent => ({ id: agent.id, name: agent.name }))
          : (await tx.list<Conversation>('conversations')).filter(conversation => conversation.kind === 'group').map(group => ({ id: group.id, name: group.title }))
        if (!items.some(item => item.id === action.id) || !items.some(item => item.id === action.targetId)) throw new Error('只能在同一类型的通讯录条目之间排序')
        if (agents && value.categoryByAgentId[action.id] !== value.categoryByAgentId[action.targetId]) throw new Error('只能在同一员工分类内排序，请拖到分类标题或通过右键菜单切换分类')
        const key = agents ? 'agentOrder' : 'groupOrder'
        const order = sortedContacts(items, value[key], item => item.name).map(item => item.id)
        if (action.id !== action.targetId) {
          order.splice(order.indexOf(action.id), 1)
          order.splice(order.indexOf(action.targetId) + (action.placement === 'after' ? 1 : 0), 0, action.id)
        }
        value[key] = order
      }
      value.revision++
      await tx.put({ collection: 'contactList', id: 'contacts', value })
      return value
    })
  }
}

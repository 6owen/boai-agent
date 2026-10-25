/*
 * [INPUT]: 产品事务、现存员工/群聊、版本化通讯录操作及团队发布身份和成员。
 * [OUTPUT]: 兼容旧分类的多标签和统一员工顺序原子持久化；批量标签全部校验后更新，员工删除由宿主清理用例处理；标签错误文案与未分类/无标签保留名统一；团队同事务新建唯一名称标签并绑定成员。
 * [POS]: employees 的通讯录展示偏好，不写员工定义或会话列表偏好。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Conversation, DigitalAgent } from '@boai/shared/domain'
import { contactTagIds, emptyContactList, sortedContacts, type ContactListAction, type ContactListPreferences } from '@boai/shared/domain/contact-list'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

const id = z.string().trim().min(1).max(200)
const CATEGORY_NAME_LIMIT = 40
const CATEGORY_COUNT_LIMIT = 100
const AGENT_BATCH_LIMIT = 1000
const RESERVED_TAG_NAMES = ['未分类', '无标签']
const name = z.string().trim().min(1, '标签名称需要 1–40 个字符').max(CATEGORY_NAME_LIMIT, '标签名称需要 1–40 个字符')
const agentIds = z.array(id).min(1).max(AGENT_BATCH_LIMIT).transform(value => [...new Set(value)])
const tagIds = z.array(id).max(CATEGORY_COUNT_LIMIT).transform(value => [...new Set(value)])
export const contactListChangeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('create-category'), name }).strict(),
    z.object({ kind: z.literal('rename-category'), categoryId: id, name }).strict(),
    z.object({ kind: z.literal('delete-category'), categoryId: id }).strict(),
    z.object({ kind: z.literal('delete-category-agents'), categoryId: id }).strict(),
    z.object({ kind: z.literal('move-category'), categoryId: id, targetId: id, placement: z.enum(['before', 'after']) }).strict(),
    z.object({ kind: z.literal('assign-category'), agentId: id, categoryId: id.optional() }).strict(),
    z.object({ kind: z.literal('set-agent-tags'), agentIds, tagIds, mode: z.enum(['replace', 'add', 'remove']) }).strict(),
    z.object({ kind: z.literal('delete-agents'), agentIds }).strict(),
    z.object({ kind: z.literal('move'), itemKind: z.enum(['agent', 'group']), id, targetId: id, placement: z.enum(['before', 'after']) }).strict(),
  ]),
}).strict()

async function readPreferences(tx: RecordTransaction): Promise<ContactListPreferences> {
  return await tx.get<ContactListPreferences>('contactList', 'contacts') ?? emptyContactList()
}

function tagAssignments(value: ContactListPreferences) {
  return Object.fromEntries([...new Set([...Object.keys(value.categoryByAgentId), ...Object.keys(value.tagIdsByAgentId ?? {})])].map(agentId => [agentId, contactTagIds(value, agentId)]))
}

function setAgentTags(value: ContactListPreferences, agentId: string, tags: string[]) {
  value.tagIdsByAgentId![agentId] = tags
  if (tags[0]) value.categoryByAgentId[agentId] = tags[0]
  else delete value.categoryByAgentId[agentId]
}

async function requireOrdinaryAgent(tx: RecordTransaction, agentId: string) {
  const agent = await tx.get<DigitalAgent>('agents', agentId)
  if (!agent) throw new Error('员工不存在')
  if (isCoreAgent(agent)) throw new Error('核心助手不参与员工标签或排序')
  return agent
}

export async function createTeamContactCategory(tx: RecordTransaction, categoryId: string, teamName: string, agentIds: string[]) {
  const value = await readPreferences(tx)
  if (value.categories.length >= CATEGORY_COUNT_LIMIT) throw new Error('最多创建 100 个标签，请删除不需要的标签后继续创建团队')
  if (value.categories.some(category => category.id === categoryId)) throw new Error('团队标签身份已被占用')
  const base = teamName.trim().replace(/\s+/g, ' ')
  const usedNames = new Set([...RESERVED_TAG_NAMES, ...value.categories.map(category => category.name.toLocaleLowerCase())])
  let categoryName = base.slice(0, CATEGORY_NAME_LIMIT), index = 2
  while (usedNames.has(categoryName.toLocaleLowerCase())) {
    const suffix = `（${index++}）`
    categoryName = base.slice(0, CATEGORY_NAME_LIMIT - suffix.length).trimEnd() + suffix
  }
  value.categories.push({ id: categoryId, name: categoryName })
  value.tagIdsByAgentId = tagAssignments(value)
  for (const agentId of agentIds) setAgentTags(value, agentId, [...new Set([...contactTagIds(value, agentId), categoryId])])
  value.revision++
  await tx.put({ collection: 'contactList', id: 'contacts', value })
}

export class ContactListRepository {
  constructor(private readonly store: ProductStore) {}
  read() { return this.store.transaction(readPreferences) }
  update(expectedRevision: number, action: ContactListAction) {
    if (action.kind === 'delete-category-agents' || action.kind === 'delete-agents') throw new Error('员工删除必须经过宿主清理用例')
    return this.store.transaction(async tx => {
      const value = await readPreferences(tx)
      if (value.revision !== expectedRevision) throw new Error('通讯录已在其他窗口修改，请重试')
      if ('categoryId' in action && action.categoryId && !value.categories.some(category => category.id === action.categoryId)) throw new Error('员工标签不存在')
      value.tagIdsByAgentId = tagAssignments(value)
      if (action.kind === 'create-category' || action.kind === 'rename-category') {
        const categoryName = action.name.trim().replace(/\s+/g, ' ')
        if (!categoryName || categoryName.length > CATEGORY_NAME_LIMIT) throw new Error('标签名称需要 1–40 个字符')
        if (RESERVED_TAG_NAMES.includes(categoryName) || value.categories.some(category => category.name.toLocaleLowerCase() === categoryName.toLocaleLowerCase() && (action.kind === 'create-category' || category.id !== action.categoryId))) throw new Error('标签名称已存在')
        if (action.kind === 'create-category') {
          if (value.categories.length >= CATEGORY_COUNT_LIMIT) throw new Error('最多创建 100 个标签')
          value.categories.push({ id: randomUUID(), name: categoryName })
        } else value.categories = value.categories.map(category => category.id === action.categoryId ? { ...category, name: categoryName } : category)
      } else if (action.kind === 'delete-category') {
        value.categories = value.categories.filter(category => category.id !== action.categoryId)
        for (const [agentId, tags] of Object.entries(value.tagIdsByAgentId)) setAgentTags(value, agentId, tags.filter(tagId => tagId !== action.categoryId))
      } else if (action.kind === 'move-category') {
        const category = value.categories.find(category => category.id === action.categoryId)!
        if (!value.categories.some(category => category.id === action.targetId)) throw new Error('目标员工标签不存在')
        if (action.categoryId !== action.targetId) {
          value.categories = value.categories.filter(category => category.id !== action.categoryId)
          value.categories.splice(value.categories.findIndex(category => category.id === action.targetId) + (action.placement === 'after' ? 1 : 0), 0, category)
        }
      } else if (action.kind === 'assign-category') {
        await requireOrdinaryAgent(tx, action.agentId)
        setAgentTags(value, action.agentId, action.categoryId ? [action.categoryId] : [])
      } else if (action.kind === 'set-agent-tags') {
        if (!action.agentIds.length) throw new Error('请选择要设置标签的员工')
        const tags = [...new Set(action.tagIds)]
        if (tags.some(tagId => !value.categories.some(category => category.id === tagId))) throw new Error('员工标签不存在')
        for (const agentId of new Set(action.agentIds)) await requireOrdinaryAgent(tx, agentId)
        for (const agentId of new Set(action.agentIds)) {
          const current = contactTagIds(value, agentId)
          setAgentTags(value, agentId, action.mode === 'replace' ? tags : action.mode === 'add' ? [...new Set([...current, ...tags])] : current.filter(tagId => !tags.includes(tagId)))
        }
      } else {
        const agents = action.itemKind === 'agent'
        const items = agents
          ? (await tx.list<DigitalAgent>('agents')).filter(agent => !isCoreAgent(agent)).map(agent => ({ id: agent.id, name: agent.name }))
          : (await tx.list<Conversation>('conversations')).filter(conversation => conversation.kind === 'group').map(group => ({ id: group.id, name: group.title }))
        if (!items.some(item => item.id === action.id) || !items.some(item => item.id === action.targetId)) throw new Error('只能在同一类型的通讯录条目之间排序')
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

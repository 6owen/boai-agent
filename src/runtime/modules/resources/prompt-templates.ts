/*
 * [INPUT]: 既有ProductStore与明确的提示词保存/删除请求。
 * [OUTPUT]: 事务内按所见版本保存；新建/删除同步集合顺序，正文编辑不改归属；重复回执不增版，删除留最小身份。
 * [POS]: 全局提示词目录，不启动模型、工作或执行工具。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { ProductStore } from '../../adapters/storage/product-store'
import { savePromptTemplateSchema, removePromptTemplateSchema, type PromptTemplate } from '../../../shared/domain/prompt-templates'
import { readPromptCollections, writePromptCollections } from './prompt-collections'
type StoredPrompt = PromptTemplate | { id: string; revision: number; deletedAt: string }
const collection = 'promptTemplates'
export async function listPromptTemplates(store: ProductStore): Promise<PromptTemplate[]> {
  const entries = await store.load<StoredPrompt>(collection)
  return entries.filter((entry): entry is PromptTemplate => !('deletedAt' in entry)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}
export async function savePromptTemplate(store: ProductStore, input: unknown) {
  const value = savePromptTemplateSchema.parse(input)
  return store.transaction(async tx => {
    const prior = await tx.get<StoredPrompt>(collection, value.id)
    if (prior && 'deletedAt' in prior) throw new Error('此提示词已删除，请重新创建。')
    if ((prior?.revision ?? 0) !== value.expectedRevision) {
      if (prior && prior.revision === value.expectedRevision + 1 && prior.name === value.name && prior.description === value.description && prior.content === value.content) return prior
      throw new Error('提示词已更新，请重新打开后修改。')
    }
    const time = new Date().toISOString()
    const entry: PromptTemplate = { id: value.id, revision: value.expectedRevision + 1, name: value.name, description: value.description, content: value.content, createdAt: prior?.createdAt ?? time, updatedAt: time }
    if (!prior) {
      const groups = await readPromptCollections(tx)
      groups.promptIds.push(entry.id)
      await writePromptCollections(tx, groups)
    }
    await tx.put({ collection, id: entry.id, value: entry })
    return entry
  })
}
export async function removePromptTemplate(store: ProductStore, input: unknown) {
  const value = removePromptTemplateSchema.parse(input)
  await store.transaction(async tx => {
    const prior = await tx.get<StoredPrompt>(collection, value.id)
    if (!prior || 'deletedAt' in prior) return
    if (prior.revision !== value.expectedRevision) throw new Error('提示词已更新，请重新打开后删除。')
    const groups = await readPromptCollections(tx)
    groups.promptIds = groups.promptIds.filter(id => id !== prior.id)
    delete groups.groupByPromptId[prior.id]
    await writePromptCollections(tx, groups)
    await tx.put({ collection, id: prior.id, value: { id: prior.id, revision: prior.revision + 1, deletedAt: new Date().toISOString() } })
  })
}

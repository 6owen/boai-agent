/*
 * [INPUT]: 用户维护的提示词名称、说明与正文。
 * [OUTPUT]: 全局提示词正文与独立分组/顺序的版本化合同；引用复制正文快照，分组不改变发送内容。
 * [POS]: 资源库与Composer共享的提示词合同，不授予工具或员工权限。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { z } from 'zod'

export const savePromptTemplateSchema = z.object({
  id: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).default(''),
  content: z.string().trim().min(1).max(40000),
}).strict()
export const removePromptTemplateSchema = savePromptTemplateSchema.pick({ id: true, expectedRevision: true })
export type SavePromptTemplateInput = z.input<typeof savePromptTemplateSchema>
export interface PromptTemplate {
  id: string; revision: number; name: string; description: string; content: string; createdAt: string; updatedAt: string
}
export type PromptTemplateReference = Pick<PromptTemplate, 'id' | 'revision' | 'name' | 'content'>

const collectionId = z.string().min(1).max(200)
const groupName = z.string().trim().min(1).max(40)
export const promptCollectionChangeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('create-group'), name: groupName }).strict(),
    z.object({ kind: z.literal('rename-group'), groupId: collectionId, name: groupName }).strict(),
    z.object({ kind: z.literal('delete-group'), groupId: collectionId }).strict(),
    z.object({ kind: z.literal('move-group'), groupId: collectionId, targetId: collectionId, placement: z.enum(['before', 'after']) }).strict(),
    z.object({ kind: z.literal('move-prompt'), promptId: collectionId, targetId: collectionId, placement: z.enum(['before', 'after']) }).strict(),
    z.object({ kind: z.literal('assign-group'), promptId: collectionId, groupId: collectionId.optional() }).strict(),
  ]),
}).strict()
export type PromptCollectionChange = z.infer<typeof promptCollectionChangeSchema>
export type PromptCollectionAction = PromptCollectionChange['action']
export interface PromptCollections {
  revision: number
  promptIds: string[]
  groups: { id: string; name: string }[]
  groupByPromptId: Record<string, string>
}

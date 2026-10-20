/*
 * [INPUT]: 用户维护的提示词名称、说明与正文。
 * [OUTPUT]: 全局提示词及所见版本保存/删除合同；引用复制正文快照，发送时展开为普通消息正文。
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

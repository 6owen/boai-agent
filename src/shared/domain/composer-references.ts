/*
 * [INPUT]: 用户选择的已绑定技能、获准数据源或当前会话文件身份。
 * [OUTPUT]: 不含本机路径的固定引用合同；标签不能授予资源权限。
 * [POS]: Composer、消息受理和执行上下文共用合同。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { z } from 'zod'
const id = z.string().min(1).max(256)
const base = { id, agentId: id, name: z.string().min(1).max(300) }
const file = { ...base, conversationId: id, contentHash: z.string().regex(/^[a-f0-9]{64}$/) }
export const composerReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('skill'), configVersion: z.number().int().positive() }).strict(),
  z.object({ ...base, kind: z.literal('source'), revision: z.number().int().positive() }).strict(),
  z.object({ ...file, kind: z.literal('artifact') }).strict(),
  z.object({ ...file, kind: z.literal('material'), revision: z.number().int().positive() }).strict(),
])
export const composerReferencesSchema = z.array(composerReferenceSchema).max(20)
export type ComposerReference = z.infer<typeof composerReferenceSchema>

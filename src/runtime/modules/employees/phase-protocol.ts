/*
 * [INPUT]: 员工判断与记忆阶段的产品协议。
 * [OUTPUT]: API与本机共享判断/记忆合同；新判断选择wait必须声明非空消息依赖，宿主身份校验与旧协议解析保持，不调用模型。
 * [POS]: employees 阶段协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import { workIntentSchema } from '../collaboration/work-protocol'
const decisionSchema = z.object({
  work: workIntentSchema.optional(),
  action: z.enum(['reply', 'pass', 'wait', 'ask', 'request_handoff']),
  responseKind: z.enum(['chat', 'task']).optional(),
  replyToMessageId: z.string().optional(),
  recipientAgentIds: z.array(z.string()).max(20).optional(),
  purpose: z.string().max(500).optional(),
  dependencyMessageIds: z.array(z.string()).max(20).optional(),
  proposedContribution: z.object({ key: z.literal('main'), purpose: z.string().min(1).max(500) }).strict().optional(),
  dependsOnContributions: z.array(z.object({ agentId: z.string(), key: z.literal('main') }).strict()).max(20).optional(),
  observedThroughSequence: z.number().int().nonnegative(),
}).strict()
export const decisionModelSchema = decisionSchema.omit({ observedThroughSequence: true })
// New decisions use durable work. Continue accepting legacy fields from older callers,
// but do not present the competing contribution protocol to the model.
export const decisionPromptSchema = decisionModelSchema.omit({ proposedContribution: true, dependsOnContributions: true })
export function decisionJsonSchema(schema: z.ZodType) {
  return { ...z.toJSONSchema(schema, { target: 'draft-07' }), allOf: [{
    if: { properties: { action: { const: 'wait' } }, required: ['action'] },
    then: { required: ['dependencyMessageIds'], properties: { dependencyMessageIds: { type: 'array', minItems: 1 } } },
  }] }
}
export const memorySchema = z.object({ candidates: z.array(z.object({
  content: z.string().trim().min(1).max(400),
  sourceMessageIds: z.array(z.string()).min(1).max(4),
  sourceResourceIds: z.array(z.string()).max(4).optional(),
  kind: z.enum(['long_term', 'experience', 'temporary']).optional(),
  evidence: z.enum(['fact', 'preference', 'decision', 'claim', 'inference']).optional(),
  useScope: z.literal('conversation').optional(),
  contextRef: z.object({ kind: z.enum(['conversation', 'work']), id: z.string().min(1).max(200) }).strict().optional(),
  expiresAt: z.iso.datetime().optional(),
  supersedes: z.array(z.object({ id: z.string().min(1).max(200), version: z.number().int().positive() }).strict()).max(4).optional(),
}).strict()).max(6) }).strict()

export function parseJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
}

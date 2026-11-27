/*
 * [OUTPUT]: 工作额度与结果证据沿 shared/domain/work 的业务规则判断；预留、核权和结算由宿主事务负责。
 * [INPUT]: 员工提出的共享工作意图与结果声明。
 * [OUTPUT]: 模型输入按组织/业务、真实登记 ID 和已声明等待收窄；仅组织提供协作回执，依赖等待不能改为用户问题或业务交付；权威结果 schema/宿主证据检查保持独立；模型仅判断组织模式/目标，真实组织证据由宿主核验。
 * [POS]: collaboration 工作协议；声明不替代权限和证据检查。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'

export const workIntentSchema = z.object({
  key: z.string().trim().min(1).max(100),
  scope: z.string().trim().min(1).max(2000),
  deliverable: z.string().trim().min(1).max(2000),
  workId: z.string().min(1).max(200).optional(),
  expectedVersion: z.number().int().positive().optional(),
  organization: z.object({ mode: z.enum(['employee_creation', 'organize_only', 'organize_and_execute']), goal: z.string().trim().min(1).max(12000) }).strict().optional(),
}).strict()
export const workOutcomeSchema = z.object({
  userQuestion: z.string().trim().min(1).max(4000).optional(),
  disposition: z.enum(['delivered', 'progress', 'waiting', 'blocked', 'no_progress']),
  summary: z.string().trim().min(1).max(2000),
  evidence: z.array(z.object({ kind: z.enum(['answer', 'artifact', 'collaboration']), reference: z.string().trim().min(1).max(4000) }).strict()).max(20).optional(),
}).strict()
export const workReportSchema = z.object({
  action: z.enum(['publish', 'discard']),
  text: z.string().trim().min(1).max(48000).optional(),
  outcome: workOutcomeSchema.optional(),
}).strict()
/** The model sees only evidence available in this phase; repository checks remain authoritative. */
export function modelWorkOutcomeSchema(input: { organization: boolean; waiting?: boolean; artifactIds?: readonly string[]; collaborationIds?: readonly string[] }) {
  const reference = (ids: readonly string[] | undefined) => ids === undefined
    ? z.string().trim().min(1).max(4000)
    : ids.length ? z.enum([...new Set(ids)] as [string, ...string[]]) : z.never()
  const evidence = input.organization
    ? z.object({ kind: z.literal('collaboration'), reference: reference(input.collaborationIds) }).strict()
    : z.union([
      z.object({ kind: z.literal('answer'), reference: z.string().trim().min(1).max(4000) }).strict(),
      z.object({ kind: z.literal('artifact'), reference: reference(input.artifactIds) }).strict(),
    ])
  // wait_for_work already saved the real waiting contract. No evidence or user question is needed to repeat it.
  if (input.waiting) return workOutcomeSchema.omit({ userQuestion: true, evidence: true }).extend({ disposition: z.literal('waiting') }).strict()
  return workOutcomeSchema.extend({ evidence: z.array(evidence).max(20).optional() }).strict()
}
export function modelWorkReportSchema(input: Parameters<typeof modelWorkOutcomeSchema>[0]) {
  return workReportSchema.extend({ outcome: modelWorkOutcomeSchema(input).optional() }).strict()
}
const dependencySchema = z.object({ workId: z.string().min(1).max(200), resultVersion: z.number().int().positive() }).strict()
const dependenciesSchema = z.array(dependencySchema).max(12).refine(items => new Set(items.map(item => item.workId)).size === items.length, '依赖不能重复')
export const workDelegationSchema = z.object({
  key: z.string().trim().min(1).max(100), scope: z.string().trim().min(1).max(2000),
  deliverable: z.string().trim().min(1).max(2000), ownerAgentId: z.string().min(1).max(200),
  dependencies: dependenciesSchema.optional(),
}).strict()
export const workWaitSchema = z.object({ dependencies: dependenciesSchema.refine(items => items.length > 0, '必须明确等待的工作'), nextStep: z.string().trim().min(1).max(2000) }).strict()

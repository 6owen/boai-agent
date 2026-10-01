/*
 * [INPUT]: 员工提出的共享工作意图与结果声明。
 * [OUTPUT]: waiting 的明确用户问题必须引用本次公开正文，不能解除工作依赖等待；工作意图/委派/等待 schema、交付证据与已声明等待的统一检查、私有汇报边界。
 * [POS]: collaboration 工作协议；声明不替代权限和证据检查。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import type { WorkOutcome } from '../../../shared/domain'

export function workEvidenceError(outcome: WorkOutcome, receipt: { content: string; artifactIds: string[] }, waiting = false): string | undefined {
  if (outcome.userQuestion && (outcome.disposition !== 'waiting' || waiting || !receipt.content.includes(outcome.userQuestion))) return '用户补充问题必须明确为 waiting、出现在本次公开正文且不能解除工作依赖等待'
  if (waiting && outcome.disposition !== 'waiting') return '已声明依赖等待，本次结果必须为 waiting'
  for (const evidence of outcome.evidence ?? []) {
    if (evidence.kind === 'artifact' && !receipt.artifactIds.includes(evidence.reference)) return '交付证据未引用本次已登记产物'
    if (evidence.kind === 'answer' && (!evidence.reference.trim() || !receipt.content.includes(evidence.reference))) return '答复证据不在本次结果中'
  }
  if (outcome.disposition === 'delivered' && !outcome.evidence?.length) return '已交付状态必须有可检查的结果证据'
}

export const workIntentSchema = z.object({
  key: z.string().trim().min(1).max(100),
  scope: z.string().trim().min(1).max(2000),
  deliverable: z.string().trim().min(1).max(2000),
  workId: z.string().min(1).max(200).optional(),
  expectedVersion: z.number().int().positive().optional(),
}).strict()
export const workOutcomeSchema = z.object({
  userQuestion: z.string().trim().min(1).max(4000).optional(),
  disposition: z.enum(['delivered', 'progress', 'waiting', 'blocked', 'no_progress']),
  summary: z.string().trim().min(1).max(2000),
  evidence: z.array(z.object({ kind: z.enum(['answer', 'artifact']), reference: z.string().trim().min(1).max(4000) }).strict()).max(20).optional(),
}).strict()
export const workReportSchema = z.object({
  action: z.enum(['publish', 'discard']),
  text: z.string().trim().min(1).max(48000).optional(),
  outcome: workOutcomeSchema.optional(),
}).strict()
const dependencySchema = z.object({ workId: z.string().min(1).max(200), resultVersion: z.number().int().positive() }).strict()
const dependenciesSchema = z.array(dependencySchema).max(12).refine(items => new Set(items.map(item => item.workId)).size === items.length, '依赖不能重复')
export const workDelegationSchema = z.object({
  key: z.string().trim().min(1).max(100), scope: z.string().trim().min(1).max(2000),
  deliverable: z.string().trim().min(1).max(2000), ownerAgentId: z.string().min(1).max(200),
  dependencies: dependenciesSchema.optional(),
}).strict()
export const workWaitSchema = z.object({ dependencies: dependenciesSchema.refine(items => items.length > 0, '必须明确等待的工作'), nextStep: z.string().trim().min(1).max(2000) }).strict()

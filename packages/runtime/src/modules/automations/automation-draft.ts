/*
 * [INPUT]: 用户明确选择的模型连接、自然语言要求、获准候选与日历纯规则。
 * [OUTPUT]: 无工具的结构化草稿、必要追问、候选身份/周期校验；不保存计划或创建 Work。
 * [POS]: 自动化创建辅助的协议与确定性校验，模型只做提取。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import type { AutomationDraftRequest, AutomationDraftResult } from '@boai/shared/domain/automations'
import { automationCron, nextTimes, scheduleSchema } from './schedule-policy'

const identity = z.string().trim().min(1).max(200)
export const automationDraftRequestSchema = z.object({ draftId: identity, version: z.number().int().nonnegative(), requestId: identity, connectionId: identity, instruction: z.string().trim().min(1).max(10000), timezone: z.string().min(1).max(100) }).strict()
export const automationDraftCandidateSchema = z.object({
  name: z.string().trim().max(100), prompt: z.string().trim().max(40000),
  target: z.object({ kind: z.enum(['employee', 'conversation']), name: z.string().min(1).max(200) }).strict().nullable(),
  frequency: z.enum(['daily', 'workdays', 'weekly']).nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
  time: z.string().nullable(), timezone: z.string().max(100).nullable(),
  notificationPolicy: z.enum(['important_only', 'all_results', 'muted']),
  unsupported: z.array(z.string().max(500)).max(5),
}).strict()
export interface AutomationDraftTarget { kind: 'employee' | 'conversation'; id: string; name: string }
export function validateAutomationDraft(request: AutomationDraftRequest, output: unknown, targets: AutomationDraftTarget[]): AutomationDraftResult {
  const value = automationDraftCandidateSchema.parse(output), questions: string[] = []
  const candidate: AutomationDraftResult['candidate'] = { name: value.name, prompt: value.prompt, taskKind: 'report', conversationPolicy: 'new-conversation', employeeIds: [], enabled: true, notify: value.notificationPolicy !== 'muted', notificationPolicy: value.notificationPolicy, timezone: value.timezone ?? request.timezone, time: value.time ?? '', frequency: value.frequency === 'daily' ? 'daily' : 'weekly', daysOfWeek: value.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : value.frequency === 'workdays' ? [1, 2, 3, 4, 5] : value.daysOfWeek, weekday: value.daysOfWeek[0] ?? 1 }
  // A model suggestion is not authorization: the exact, unambiguous identity must occur in the user's request.
  const matches = value.target && request.instruction.includes(value.target.name) ? targets.filter(t => t.kind === value.target!.kind && t.name === value.target!.name) : []
  if (matches.length === 1) {
    const target = matches[0]
    if (target.kind === 'employee') candidate.employeeIds = [target.id]
    else { candidate.conversationPolicy = 'existing-conversation'; candidate.conversationId = target.id; delete candidate.employeeIds }
  } else questions.push('请选择执行员工或指定聊天；未明确或同名的对象不会自动选择。')
  if (!value.name || !value.prompt) questions.push('请补充任务标题和希望完成的内容。')
  if (!value.frequency) { candidate.time = ''; questions.push('请明确重复规则：每天、工作日或每周选日。') }
  if (!value.time) questions.push('请明确几点几分执行。')
  const schedule = scheduleSchema.safeParse({ frequency: candidate.frequency, daysOfWeek: candidate.daysOfWeek, weekday: candidate.weekday, time: candidate.time, timezone: candidate.timezone })
  if (!schedule.success && value.time && value.frequency) questions.push(schedule.error.issues[0]?.message ?? '请检查执行时间和时区。')
  const times = schedule.success && !value.unsupported.length ? nextTimes({ ...schedule.data, cron: automationCron(schedule.data) }) : []
  if (value.unsupported.length) candidate.time = ''
  return { draftId: request.draftId, version: request.version, candidate, questions, unsupported: value.unsupported, nextTimes: times }
}

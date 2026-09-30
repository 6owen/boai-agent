/*
 * [INPUT]: 保留的调用回执、运行、本人消息、工作执行区间和技能激活。
 * [OUTPUT]: 同一快照的时区日桶、全部保留摘要、完整性与技能排行；缺少实际开始时间的旧预算不摊入日桶。
 * [POS]: 个人活动的确定性聚合；不从模型/预算汇总推测使用量。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { AgentRun, BudgetModelCall, Message, ModelUsage, Resource, WorkItem } from '../../../shared/domain'
import { isPersonalMessage, type ProfileActivity, type ProfileActivityQuery } from '../../../shared/domain/profile'

export interface ProfileModelCall {
  id: string; runId: string; conversationId: string; phase: string; startedAt: string; finishedAt?: string
  budgetOwned: boolean; thinking?: string; usage?: ModelUsage
}
export interface SkillActivation { id: string; runId: string; conversationId: string; skillId: string; name: string; createdAt: string }
export interface ExecutionIntervals { id: string; runId: string; conversationId: string; workId: string; intervals: { from: string; to: string }[]; openAt?: string; complete: boolean }
export interface ActivityEvidence { calls: ProfileModelCall[]; budgets: BudgetModelCall[]; messages: Message[]; runs: AgentRun[]; works: WorkItem[]; intervals: ExecutionIntervals[]; skills: SkillActivation[]; resources: Resource[] }
export function dayAt(instant: string, timezone: string): string | null {
  if (!Number.isFinite(Date.parse(instant))) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant))
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}
export const shiftDay = (day: string, count: number) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10)
export function knownTotal(usage?: ModelUsage): number | null {
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (count(usage?.totalTokens)) return usage.totalTokens
  return count(usage?.inputTokens) && count(usage?.outputTokens) ? usage.inputTokens + usage.outputTokens : null
}
export function unionDuration(intervals: { from: string; to: string }[]): number | null {
  const sorted = intervals.map(item => [Date.parse(item.from), Date.parse(item.to)] as const).sort((a, b) => a[0] - b[0])
  if (!sorted.length || sorted.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b) || b < a)) return null
  let total = 0, from = sorted[0]![0], to = sorted[0]![1]
  for (const [a, b] of sorted.slice(1)) { if (a > to) { total += to - from; from = a }; to = Math.max(to, b) }
  return total + to - from
}
export function aggregateActivity(evidence: ActivityEvidence, range: ProfileActivityQuery, now = new Date().toISOString()): ProfileActivity {
  const today = dayAt(now, range.timezone)!, runIds = new Set(evidence.runs.map(run => run.id))
  const calls = new Map(evidence.calls.filter(call => runIds.has(call.runId)).map(call => [call.id, call]))
  // Automation owns the sole receipt. Its observation stores only timing/preferences.
  for (const call of evidence.budgets) if (runIds.has(call.runId)) {
    const metadata = calls.get(call.id)
    calls.set(call.id, { ...metadata, id: call.id, runId: call.runId, conversationId: call.conversationId, phase: call.phase, startedAt: metadata?.startedAt ?? '', budgetOwned: true, usage: call.settledAt ? call.usage : undefined })
  }
  const recordedRuns = new Set([...calls.values()].map(call => call.runId))
  const missing = evidence.runs.filter(run => !recordedRuns.has(run.id) || run.activityError)
  const buckets = new Map<string, { tokens: number; known: number; unknownCalls: number; calls: number }>()
  const bucket = (date: string) => { if (!buckets.has(date)) buckets.set(date, { tokens: 0, known: 0, unknownCalls: 0, calls: 0 }); return buckets.get(date)! }
  let totalTokens = 0, knownCalls = 0, unknownCalls = 0, undated = 0
  const thinkingCounts = new Map<string, number>()
  for (const call of calls.values()) {
    const date = dayAt(call.startedAt, range.timezone), total = knownTotal(call.usage), day = date && date <= today ? bucket(date) : null
    if (total === null) unknownCalls++; else { totalTokens += total; knownCalls++ }
    if (!day) undated++
    else { day.calls++; if (total === null) day.unknownCalls++; else { day.tokens += total; day.known++ } }
    if (call.thinking) thinkingCounts.set(call.thinking, (thinkingCounts.get(call.thinking) ?? 0) + 1)
  }
  for (const run of missing) { const date = dayAt(run.createdAt, range.timezone); if (date && date <= today) bucket(date).unknownCalls++; else undated++ }
  const active = new Set<string>(), chats = new Set<string>(); let unknownDates = false
  for (const message of evidence.messages) if (isPersonalMessage(message)) {
    chats.add(message.conversationId)
    const date = dayAt(message.createdAt, range.timezone)
    if (!date || date > today) unknownDates = true; else active.add(date)
  }
  let longest = 0, streak = 0, previous = ''
  for (const day of [...active].sort()) { streak = previous && shiftDay(previous, 1) === day ? streak + 1 : 1; longest = Math.max(longest, streak); previous = day }
  let current = 0, day = active.has(today) ? today : shiftDay(today, -1)
  while (active.has(day)) { current++; day = shiftDay(day, -1) }
  let peak: ProfileActivity['peak'] = null
  for (const [date, value] of [...buckets].sort()) if (value.known && (!peak || value.tokens >= peak.tokens)) peak = { date, tokens: value.tokens }
  let longestTaskMs: number | null = null, missingIntervals = false
  for (const root of evidence.works.filter(work => !work.parentWorkId && ['delivered', 'failed', 'cancelled', 'interrupted', 'blocked'].includes(work.status))) {
    const owned = new Set(evidence.works.filter(work => work.id === root.id || work.rootWorkId === root.id).map(work => work.id))
    const runs = evidence.runs.filter(run => run.workId && owned.has(run.workId))
    const records = evidence.intervals.filter(item => runs.some(run => run.id === item.runId))
    if (!runs.length || runs.some(run => !records.some(item => item.runId === run.id) || !['completed', 'failed', 'cancelled'].includes(run.status)) || records.some(item => !item.complete || item.openAt)) { missingIntervals = true; continue }
    const duration = unionDuration(records.flatMap(item => item.intervals))
    if (duration === null) missingIntervals = true; else longestTaskMs = Math.max(longestTaskMs ?? 0, duration)
  }
  const skills = new Map<string, { id: string; name: string; count: number; available: boolean }>()
  for (const event of new Map(evidence.skills.filter(item => runIds.has(item.runId)).map(item => [item.id, item])).values()) {
    const prior = skills.get(event.skillId), resource = evidence.resources.find(item => item.id === event.skillId && item.kind === 'skill')
    skills.set(event.skillId, { id: event.skillId, name: resource?.name ?? event.name, count: (prior?.count ?? 0) + 1, available: Boolean(resource) })
  }
  const ranked = [...skills.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)), thinking = [...thinkingCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const days: ProfileActivity['days'] = []
  for (let date = range.from; date <= range.to && date <= today; date = shiftDay(date, 1)) {
    const value = buckets.get(date)
    days.push({ date, tokens: value ? value.known ? value.tokens : null : null, unknownCalls: value?.unknownCalls ?? 0, calls: value?.calls ?? 0 })
  }
  return { schemaVersion: 1, scope: 'retained-local', dataVersion: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'), generatedAt: now, range,
    totalTokens: knownCalls ? totalTokens : null, peak, longestTaskMs, currentStreak: unknownDates ? null : current, longestStreak: unknownDates ? null : longest, days,
    unknownCalls, unrecordedRuns: missing.length, incomplete: !!(unknownCalls || missing.length || undated), chats: chats.size, exploredSkills: skills.size, skillActivations: ranked.reduce((sum, item) => sum + item.count, 0),
    thinking: thinking ? { level: thinking[0], count: thinking[1], samples: [...thinkingCounts.values()].reduce((a, b) => a + b, 0) } : null, skills: ranked.slice(0, 5),
    limitations: ['基于本机保留记录；连接测试、独立草稿生成及 ACP 自有调用未记录。', ...(unknownCalls || missing.length || undated ? ['部分用量或调用日期未记录；已知值不代表完整用量。'] : []), ...(missingIntervals ? ['部分任务缺少可信执行区间。'] : []), ...(unknownDates ? ['部分本人消息缺少可信日期，连续天数不可用。'] : [])] }
}

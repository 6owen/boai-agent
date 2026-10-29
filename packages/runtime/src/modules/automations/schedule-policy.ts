/*
 * [OUTPUT]: 同员工/群成员任务互斥与持久FIFO顺序；等待输入释放计算槽，原生执行循环保持。
 * [OUTPUT]: 取消自动化固定执行时限；旧时间预算取消仅由本人显式继续恢复，原occurrence、预算计账、容量与人工停止门禁保持。
 * [OUTPUT]: 手动无时钟、小时按分钟、月按日期及开始日期共用预览与真实触发校验。
 * [INPUT]: 显式时区、周期规则、实际触发时刻与版本。
 * [OUTPUT]: 工作日/星期多选统一校验、规范化 cron 和纯预览；共用日历匹配/预览、稳定手动/周期身份与等待/取消退出占用与准入容量常量。
 * [POS]: 自动化时间和身份的确定性策略；不启动周期时钟。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { Cron } from 'croner'
import { z } from 'zod'
import type { AutomationDefinition, AutomationInput, AutomationOccurrence, OccurrenceStatus } from '@boai/shared/domain/automations'

export const AUTOMATION_MISFIRE_MS = 10 * 60_000
export const MAX_ACTIVE_AUTOMATIONS = 2
export const activeOccurrence = new Set<OccurrenceStatus>(['admitted', 'running', 'waiting_approval', 'cancelling'])
export const pendingOccurrence = new Set<OccurrenceStatus>([...activeOccurrence, 'queued', 'waiting_user', 'waiting_work'])
/** A group assignment occupies each participating employee, but ordinary chats stay independent. */
export function sharesTaskExecutor(a: AutomationOccurrence, b: AutomationOccurrence) {
  return a.conversationId === b.conversationId || a.automationId === b.automationId || Boolean(a.plan?.employeeIds.some(id => b.plan?.employeeIds.includes(id)))
}
export function queuedOrder(a: AutomationOccurrence, b: AutomationOccurrence) {
  return (a.queueOrder ?? 0) - (b.queueOrder ?? 0) || (a.admittedAt ?? a.startedAt).localeCompare(b.admittedAt ?? b.startedAt) || a.id.localeCompare(b.id)
}
const hash = (...parts: (string | number)[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')

export const scheduleSchema = z.object({ frequency: z.enum(['manual', 'hourly', 'daily', 'weekly', 'monthly']), startsOn: z.iso.date().optional(), dayOfMonth: z.number().int().min(1).max(31).optional(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '请填写有效的执行时间'), weekday: z.number().int().min(0).max(6), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, '请至少选择一个星期').max(7).optional(), timezone: z.string().min(1).max(100).refine(t => { try { new Intl.DateTimeFormat('en', { timeZone: t }); return true } catch { return false } }, '无效 IANA 时区') }).strict()
type Schedule = Pick<AutomationInput, 'time' | 'frequency' | 'weekday' | 'daysOfWeek' | 'timezone' | 'startsOn' | 'dayOfMonth'>
export function scheduleDays(input: Pick<AutomationInput, 'frequency' | 'weekday' | 'daysOfWeek'>) {
  return input.frequency !== 'weekly' ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(input.daysOfWeek ?? [input.weekday])].sort((a, b) => a - b)
}
export function automationCron(input: Pick<Schedule, 'time' | 'frequency' | 'weekday' | 'daysOfWeek' | 'dayOfMonth' | 'startsOn'>) {
  if (input.frequency === 'manual') return ''
  const [hour, minute] = input.time.split(':').map(Number)
  if (input.frequency === 'hourly') return `${minute} * * * *`
  if (input.frequency === 'monthly') return `${minute} ${hour} ${input.dayOfMonth ?? Number(input.startsOn?.slice(8) ?? 1)} * *`
  return `${minute} ${hour} * * ${input.frequency === 'daily' ? '*' : scheduleDays(input).join(',')}`
}

export function calendarSlot(time: number, timezone: string) {
  if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) throw new Error('无法验证调度触发时间')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

export function matchesSchedule(d: Schedule, time: number) {
  if (d.frequency === 'manual') return false
  const slot = calendarSlot(time, d.timezone)
  if (d.startsOn && slot.slice(0, 10) < d.startsOn) return false
  if (d.frequency === 'hourly') return slot.slice(-2) === d.time.slice(-2)
  if (d.frequency === 'monthly') return slot.endsWith(d.time) && Number(slot.slice(8, 10)) === (d.dayOfMonth ?? Number(d.startsOn?.slice(8) ?? 1))
  return slot.endsWith(d.time) && scheduleDays(d).includes(new Date(`${slot.slice(0, 10)}T00:00:00Z`).getUTCDay())
}

export function nextTimes(d: Schedule & Pick<AutomationDefinition, 'cron'>, count = 5, after = new Date()) {
  if (d.frequency === 'manual') return []
  const cron = new Cron(d.cron, { timezone: d.timezone, paused: true }), slots = new Set<string>(), result: string[] = []
  // Start at a safe UTC lower bound for the requested local date, including UTC+14.
  let previous = d.startsOn ? new Date(Math.max(after.getTime(), Date.parse(d.startsOn + 'T00:00:00Z') - 14 * 3600_000 - 1)) : after
  // A DST gap can be returned by the clock as a shifted local time. Admission and preview both reject it.
  for (let attempts = 0; result.length < count && attempts < 400; attempts++) {
    const date = cron.nextRun(previous)
    if (!date) break
    previous = date
    const slot = calendarSlot(date.getTime(), d.timezone)
    if (!matchesSchedule(d, date.getTime()) || slots.has(slot)) continue
    slots.add(slot); result.push(date.toISOString())
  }
  return result
}

export const manualIdentity = (automationId: string, requestId: string) => hash('manual', automationId, requestId)
export const scheduleIdentity = (automationId: string, generation: number, timezone: string, slot: string) => hash('schedule', automationId, generation, timezone, slot)
export const nativeAlias = (runId: string) => hash('native', runId)
/** Conservative migration guard, never presented as a reconstructed historical version. */
export const historicalSlotAlias = (automationId: string, timezone: string, slot: string) => hash('historical-slot', automationId, timezone, slot)

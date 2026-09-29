/*
 * [INPUT]: 显式时区、周期规则、实际触发时刻与版本。
 * [OUTPUT]: 工作日/星期多选统一校验、规范化 cron 和纯预览；共用日历匹配/预览、稳定手动/周期身份与等待/取消退出占用与准入容量常量。
 * [POS]: 自动化时间和身份的确定性策略；不启动周期时钟。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { Cron } from 'croner'
import { z } from 'zod'
import type { AutomationDefinition, AutomationInput, OccurrenceStatus } from '../../../shared/domain/automations'

export const AUTOMATION_MISFIRE_MS = 10 * 60_000
export const AUTOMATION_RUN_MS = 10 * 60_000
export const MAX_ACTIVE_AUTOMATIONS = 2
export const activeOccurrence = new Set<OccurrenceStatus>(['admitted', 'running', 'waiting_approval', 'cancelling'])
export const pendingOccurrence = new Set<OccurrenceStatus>([...activeOccurrence, 'waiting_user', 'waiting_work'])
const hash = (...parts: (string | number)[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')

export const scheduleSchema = z.object({ frequency: z.enum(['daily', 'weekly']), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '请填写有效的执行时间'), weekday: z.number().int().min(0).max(6), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, '请至少选择一个星期').max(7).optional(), timezone: z.string().min(1).max(100).refine(t => { try { new Intl.DateTimeFormat('en', { timeZone: t }); return true } catch { return false } }, '无效 IANA 时区') }).strict()
export function scheduleDays(input: Pick<AutomationInput, 'frequency' | 'weekday' | 'daysOfWeek'>) {
  return input.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(input.daysOfWeek ?? [input.weekday])].sort((a, b) => a - b)
}
export function automationCron(input: Pick<AutomationInput, 'time' | 'frequency' | 'weekday' | 'daysOfWeek'>) {
  const [hour, minute] = input.time.split(':').map(Number)
  return `${minute} ${hour} * * ${input.frequency === 'daily' ? '*' : scheduleDays(input).join(',')}`
}

export function calendarSlot(time: number, timezone: string) {
  if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) throw new Error('无法验证调度触发时间')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

export function matchesSchedule(d: Pick<AutomationInput, 'time' | 'frequency' | 'weekday' | 'daysOfWeek' | 'timezone'>, time: number) {
  const slot = calendarSlot(time, d.timezone)
  return slot.endsWith(d.time) && scheduleDays(d).includes(new Date(`${slot.slice(0, 10)}T00:00:00Z`).getUTCDay())
}

export function nextTimes(d: Pick<AutomationDefinition, 'cron' | 'time' | 'frequency' | 'weekday' | 'daysOfWeek' | 'timezone'>, count = 5, after = new Date()) {
  const cron = new Cron(d.cron, { timezone: d.timezone, paused: true }), slots = new Set<string>(), result: string[] = []
  let previous = after
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

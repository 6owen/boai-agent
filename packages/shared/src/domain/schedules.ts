/*
 * [INPUT]: Public schedule commands and trusted employee/timezone context.
 * [OUTPUT]: Strict business schemas, actionable domain validation messages and unambiguous local-time resolution; no runtime or transport dependency.
 * [POS]: Shared schedule API contract, independent of internal automation/employee-task storage.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { z } from 'zod'

const id = z.string().min(1).max(200)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '请填写 HH:mm 格式的时间')
const timezone = z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }, '无效 IANA 时区')
const calendar = { timezone: timezone.optional(), startsOn: z.iso.date().optional() }
export const scheduleTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), date: z.iso.date(), time, timezone: timezone.optional() }).strict(),
  z.object({ kind: z.literal('hourly'), minute: z.number().int().min(0).max(59), ...calendar }).strict(),
  z.object({ kind: z.literal('daily'), time, ...calendar }).strict(),
  z.object({ kind: z.literal('weekly'), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7), time, ...calendar }).strict(),
  z.object({ kind: z.literal('monthly'), dayOfMonth: z.number().int().min(1).max(31), time, ...calendar }).strict(),
  z.object({ kind: z.literal('manual') }).strict(),
])
const fields = {
  employeeId: id.optional(), name: z.string().trim().min(1).max(100).optional(),
  instruction: z.string().trim().min(1).max(40000), trigger: scheduleTriggerSchema,
  enabled: z.boolean().optional(), notification: z.enum(['all_results', 'important_only', 'muted']).optional(),
}
export const createScheduleSchema = z.object(fields).strict()
export const updateScheduleSchema = z.object({ ...fields, instruction: fields.instruction.optional(), trigger: fields.trigger.optional(), id, expectedRevision: z.number().int().positive() }).strict().refine(value => Object.entries(value).some(([key, item]) => key !== 'id' && key !== 'expectedRevision' && item !== undefined), '请选择要修改的内容')
export const previewScheduleSchema = z.object({ trigger: scheduleTriggerSchema }).strict()
export const listSchedulesSchema = z.object({ employeeId: id.optional(), before: z.object({ updatedAt: z.iso.datetime(), id }).strict().optional(), limit: z.number().int().min(1).max(100).optional() }).strict()
export const scheduleMutationSchema = z.object({ id, expectedRevision: z.number().int().positive() }).strict()
export type ScheduleTrigger = z.infer<typeof scheduleTriggerSchema>
export type CreateSchedule = z.infer<typeof createScheduleSchema>
export type UpdateSchedule = z.infer<typeof updateScheduleSchema>
export interface ScheduleView {
  id: string; revision: number; name: string; instruction: string; employeeId?: string; legacy?: boolean
  trigger: ScheduleTrigger; enabled: boolean; notification: 'all_results' | 'important_only' | 'muted'
  activation: 'ready' | 'pending' | 'failed'
  state: 'scheduled' | 'activating' | 'paused' | 'finished' | 'needs_attention' | 'deleted'
  nextTriggerAt?: string; nextTimes: string[]; activationError?: string; lastOccurrenceId?: string
}
export type ScheduleErrorCode = 'INVALID_INPUT' | 'MISSING_FIELD' | 'UNSUPPORTED_SCHEDULE' | 'PAST_TRIGGER_TIME' | 'AMBIGUOUS_LOCAL_TIME' | 'NOT_FOUND' | 'FORBIDDEN' | 'REVISION_CONFLICT' | 'REQUEST_CONFLICT'
/** Safe business precondition only: never wrap an uncertain storage/transport exception in this type. */
export class ScheduleError extends Error {
  constructor(readonly code: ScheduleErrorCode, message: string, readonly fields?: string[]) { super(message); this.name = 'ScheduleError' }
}
export function parseSchedule<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  const missing = parsed.error.issues.some(issue => issue.path.length && issue.path.reduce<unknown>((at, key) => at && typeof at === 'object' ? (at as Record<PropertyKey, unknown>)[key] : undefined, value) === undefined)
  const paths = parsed.error.issues.flatMap(issue => issue.code === 'unrecognized_keys' ? issue.keys.map(key => [...issue.path, key].join('.')) : [issue.path.join('.')])
  // These schema-owned constraint messages contain no submitted values; retain useful corrections such as an empty weekday selection.
  const feedback = parsed.error.issues.filter(issue => issue.code === 'too_small' || issue.code === 'custom').map(issue => issue.message)
  throw new ScheduleError(missing ? 'MISSING_FIELD' : 'INVALID_INPUT', [...new Set(feedback)].join('；') || '请补齐或修正定时任务参数。', [...new Set(paths)])
}
/** Resolve a local wall clock without silently shifting DST gaps or choosing an overlap. */
export function scheduleInstant(date: string, clock: string, zone: string): number {
  const parsed = z.object({ date: z.iso.date(), clock: time, zone: timezone }).safeParse({ date, clock, zone })
  if (!parsed.success) throw new ScheduleError('INVALID_INPUT', '请填写有效日期、时间和时区。', ['trigger'])
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const parts = (at: number) => Object.fromEntries(format.formatToParts(new Date(at)).map(part => [part.type, part.value]))
  const wall = Date.parse(`${date}T${clock}:00Z`), offsets = new Set<number>(), candidates = new Set<number>()
  for (let hours = -48; hours <= 48; hours += 6) {
    const at = wall + hours * 3600000, p = parts(at)
    offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - at)
  }
  for (const offset of offsets) {
    const at = wall - offset, p = parts(at)
    if (`${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === clock) candidates.add(at)
  }
  if (!candidates.size) throw new ScheduleError('INVALID_INPUT', '该时区不存在这个本地时刻，请选择其他时间。', ['trigger.time'])
  if (candidates.size !== 1) throw new ScheduleError('AMBIGUOUS_LOCAL_TIME', '该时刻在夏令时切换中重复，请选择无歧义的时间。', ['trigger.time'])
  return [...candidates][0]
}

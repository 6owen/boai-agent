/*
 * [INPUT]: 定时任务身份、标签及列表移动。
 * [OUTPUT]: 独立版本化列表偏好；多标签、顺序和跨组移动不改变执行配置。
 * [POS]: shared/domain 定时任务展示合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import { z } from 'zod'

const id = z.string().trim().min(1).max(200)
const name = z.string().trim().min(1).max(40)
const placement = z.enum(['before', 'after'])
export const scheduleListChangeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('create-tag'), name }).strict(),
    z.object({ kind: z.literal('rename-tag'), tagId: id, name }).strict(),
    z.object({ kind: z.literal('delete-tag'), tagId: id }).strict(),
    z.object({ kind: z.literal('move-tag'), tagId: id, targetId: id, placement }).strict(),
    z.object({ kind: z.literal('set-tags'), automationIds: z.array(id).min(1).max(1000), tagIds: z.array(id).max(100), mode: z.enum(['add', 'remove', 'replace']) }).strict(),
    z.object({ kind: z.literal('move-task'), id, targetId: id, placement }).strict(),
    z.object({ kind: z.literal('move-to-tag'), id, fromTagId: id.optional(), tagId: id.optional() }).strict(),
  ]),
}).strict()
export type ScheduleListChange = z.infer<typeof scheduleListChangeSchema>
export type ScheduleListAction = ScheduleListChange['action']
export interface ScheduleListPreferences {
  revision: number
  tags: { id: string; name: string }[]
  tagIdsByAutomationId: Record<string, string[]>
  order: string[]
}
export const emptyScheduleList = (): ScheduleListPreferences => ({ revision: 0, tags: [], tagIdsByAutomationId: {}, order: [] })
export const scheduleTagIds = (value: ScheduleListPreferences | null | undefined, id: string): string[] => value?.tagIdsByAutomationId[id] ?? []
export function sortedSchedules<T extends { id: string; createdAt: string }>(items: T[], order: string[]): T[] {
  const positions = new Map(order.map((id, index) => [id, index]))
  return [...items].sort((a, b) => (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

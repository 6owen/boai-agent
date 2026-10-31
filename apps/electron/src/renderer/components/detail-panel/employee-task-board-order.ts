/*
 * [INPUT]: Employee identity and loaded task pages.
 * [OUTPUT]: Bounded per-employee board display ordering, separate from execution FIFO.
 * [POS]: Local view preference; task status remains server-owned.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { EMPLOYEE_TASK_STATUSES, type TrackedTaskListItem, type TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
export type TaskColumns = Record<string, TrackedTaskListItem[]>
export type TaskBoardOrder = Partial<Record<TrackedTaskStatus, string[]>>
const key = (employeeId: string) => `boai.v2.employeeTaskBoardOrder:${employeeId}`
export function readTaskBoardOrder(employeeId: string): TaskBoardOrder {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(employeeId)) ?? '{}')
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(EMPLOYEE_TASK_STATUSES.map(status => {
      const ids = (value as Record<string, unknown>)[status]
      return [status, Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))].slice(0, 1000) : []]
    }))
  } catch { return {} }
}
export function orderedTaskColumns(columns: TaskColumns, order: TaskBoardOrder): TaskColumns {
  return Object.fromEntries(EMPLOYEE_TASK_STATUSES.map(status => {
    const positions = new Map((order[status] ?? []).map((id, index) => [id, index]))
    return [status, [...(columns[status] ?? [])].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity))]
  }))
}
export function commitTaskBoardOrder(employeeId: string, columns: TaskColumns, previous: TaskBoardOrder) {
  const order = Object.fromEntries(EMPLOYEE_TASK_STATUSES.map(status => [status, [...new Set([...columns[status].map(task => task.id), ...(previous[status] ?? [])])].slice(0, 1000)]))
  localStorage.setItem(key(employeeId), JSON.stringify(order))
  return order
}

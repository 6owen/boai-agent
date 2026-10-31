/*
 * [OUTPUT]: 默认任务列表排除完成和关闭，显式状态仍沿SQL分页。
 * [OUTPUT]: 任务来源和最近执行状态投影不读取正文；任务筛选仍在LIMIT之前。
 * [INPUT]: Normalized explicit-task filters and trusted viewer scope.
 * [OUTPUT]: One fixed SQL query with source/identity checks before LIMIT and bounded list projection.
 * [POS]: Original records-table task read model; no state transitions or writes.
 * [PROTOCOL]: Update Header and storage/.folder.md on change.
 */
import { TASK_PAGE_LIMITS, type TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'

export interface TaskPageSqlQuery {
  agentId?: string
  conversationId?: string
  status?: TrackedTaskStatus
  includeDone: boolean
  limit: number
  before?: { updatedAt: string; id: string }
  viewer?: { employeeId: string; conversationId: string }
}
export function taskPageSql(query: TaskPageSqlQuery) {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > TASK_PAGE_LIMITS.maxPage) throw new Error('Invalid task page size')
  const args: (string | number)[] = []
  const filters = [
    "t.collection='agentTasks'",
    "a.id IS NOT NULL",
    `(json_extract(t.value,'$.conversationId') IS NULL OR (
      c.id IS NOT NULL AND COALESCE(json_extract(c.value,'$.list.hidden'),0)=0
      AND COALESCE(json_extract(c.value,'$.mergedInto'),'')=''
      AND EXISTS (SELECT 1 FROM json_each(json_extract(c.value,'$.agentIds')) member WHERE member.value=json_extract(t.value,'$.agentId'))
      AND NOT EXISTS (SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=c.id)
    ))`,
  ]
  if (query.agentId) { filters.push("json_extract(t.value,'$.agentId')=?"); args.push(query.agentId) }
  if (query.conversationId) { filters.push("json_extract(t.value,'$.conversationId')=?"); args.push(query.conversationId) }
  if (query.status) { filters.push("json_extract(t.value,'$.status')=?"); args.push(query.status) }
  else if (!query.includeDone) filters.push("json_extract(t.value,'$.status') NOT IN ('done','closed')")
  if (query.viewer) {
    filters.push(`json_extract(t.value,'$.agentId')=? AND EXISTS (
      SELECT 1 FROM records current WHERE current.collection='conversations' AND current.id=?
      AND COALESCE(json_extract(current.value,'$.list.hidden'),0)=0 AND COALESCE(json_extract(current.value,'$.mergedInto'),'')=''
      AND EXISTS (SELECT 1 FROM json_each(json_extract(current.value,'$.agentIds')) member WHERE member.value=?)
      AND NOT EXISTS (SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=current.id)
      AND (json_extract(t.value,'$.conversationId')=? OR (
        json_extract(current.value,'$.kind')='direct' AND json_extract(current.value,'$.channel') IS NULL
        AND json_extract(c.value,'$.channel') IS NULL AND COALESCE(json_extract(c.value,'$.memoryScope'),'')<>'conversation'
        AND COALESCE(json_extract(c.value,'$.kind'),'')<>'group'
      ))
    )`)
    args.push(query.viewer.employeeId, query.viewer.conversationId, query.viewer.employeeId, query.viewer.conversationId)
  }
  if (query.before) {
    filters.push("(json_extract(t.value,'$.updatedAt')<? OR (json_extract(t.value,'$.updatedAt')=? AND t.id<?))")
    args.push(query.before.updatedAt, query.before.updatedAt, query.before.id)
  }
  return {
    sql: `SELECT t.id, json_extract(t.value,'$.agentId') AS agentId, json_extract(t.value,'$.conversationId') AS conversationId,
      json_extract(t.value,'$.sourceKind') AS sourceKind, json_extract(t.value,'$.latestOccurrenceId') AS latestOccurrenceId,
      (SELECT json_extract(e.value,'$.status') FROM records e WHERE e.collection='automationOccurrences' AND e.id=json_extract(t.value,'$.latestOccurrenceId') AND json_extract(e.value,'$.deletedAt') IS NULL) AS executionStatus,
      json_extract(t.value,'$.title') AS title, json_extract(t.value,'$.status') AS status, json_extract(t.value,'$.revision') AS revision,
      json_extract(t.value,'$.createdAt') AS createdAt, json_extract(t.value,'$.updatedAt') AS updatedAt,
      COALESCE(json_array_length(t.value,'$.steps'),0) AS stepCount,
      (SELECT COUNT(*) FROM json_each(t.value,'$.steps') step WHERE json_extract(step.value,'$.done')=1) AS completedStepCount,
      (SELECT substr(json_extract(step.value,'$.title'),1,${TASK_PAGE_LIMITS.stepTitleCharacters}) FROM json_each(t.value,'$.steps') step WHERE COALESCE(json_extract(step.value,'$.done'),0)=0 ORDER BY CAST(step.key AS INTEGER) LIMIT 1) AS nextStepTitle,
      substr(COALESCE(json_extract(t.value,'$.note'),''),1,${TASK_PAGE_LIMITS.noteCharacters}) AS noteExcerpt,
      length(COALESCE(json_extract(t.value,'$.note'),''))>${TASK_PAGE_LIMITS.noteCharacters} AS noteTruncated
      FROM records t LEFT JOIN records a ON a.collection='agents' AND a.id=json_extract(t.value,'$.agentId')
      LEFT JOIN records c ON c.collection='conversations' AND c.id=json_extract(t.value,'$.conversationId')
      WHERE ${filters.join(' AND ')} ORDER BY json_extract(t.value,'$.updatedAt') DESC,t.id DESC LIMIT ?`,
    args: [...args, query.limit + 1],
  }
}

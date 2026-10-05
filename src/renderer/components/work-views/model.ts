/*
 * [INPUT]: 工作视图的受控筛选、现有业务工作状态、审批/运行身份与明确查询范围。
 * [OUTPUT]: 五组展示口径、日期边界及不制造业务状态的筛选转换；审批导航/文件原件固定所见身份，列表偏好与业务Work分离。
 * [POS]: work-views 的纯展示合同，供会话、全局与员工概览复用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { WorkItem } from '@shared/domain'
import type { ConversationFileItem, WorkViewItem, WorkViewQuery, WorkViewTarget, WorkViewTargetInput } from '@shared/domain/work-views'

export type WorkViewMode = 'board' | 'list'
export interface WorkViewFilters { search: string; ownerAgentId: string; conversationId: string; state: string; source: string; from: string; to: string }
export const emptyWorkFilters: WorkViewFilters = { search: '', ownerAgentId: '', conversationId: '', state: '', source: '', from: '', to: '' }
export const workGroups = [
  { id: 'ready', label: '待开始' }, { id: 'running', label: '进行中' }, { id: 'waiting', label: '等待或受阻' }, { id: 'delivered', label: '已交付' }, { id: 'ended', label: '异常或结束' },
] as const
export const workStateLabels: Record<WorkItem['status'], string> = { ready: '待开始', running: '进行中', waiting: '等待输入或依赖', blocked: '受阻', delivered: '已交付', failed: '失败', cancelled: '已停止', interrupted: '已中断' }
export const currentWorkStates: WorkItem['status'][] = ['ready', 'running', 'waiting', 'blocked']
export function dateBoundary(value: string, end = false): string | undefined {
  if (!value) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请选择有效日期。')
  const date = new Date(value + (end ? 'T23:59:59.999' : 'T00:00:00'))
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(value.slice(0, 4)) || date.getMonth() + 1 !== Number(value.slice(5, 7)) || date.getDate() !== Number(value.slice(8, 10))) throw new Error('请选择有效日期。')
  return date.toISOString()
}
export function workQuery(filters: WorkViewFilters, scope: { conversationId?: string; ownerAgentId?: string }, compact = false): WorkViewQuery {
  if (compact) filters = emptyWorkFilters
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('开始日期不能晚于结束日期。')
  return { search: filters.search.trim() || undefined, conversationId: scope.conversationId || filters.conversationId || undefined,
    ownerAgentId: scope.ownerAgentId || filters.ownerAgentId || undefined,
    states: compact ? currentWorkStates : filters.state ? [filters.state as WorkItem['status']] : undefined,
    source: (filters.source || undefined) as WorkViewQuery['source'], from: dateBoundary(filters.from), to: dateBoundary(filters.to, true), limit: compact ? 5 : 30 }
}
export function appendUnique<T>(previous: T[], next: T[], identity: (item: T) => string): T[] {
  const known = new Set(previous.map(identity))
  return [...previous, ...next.filter(item => { const id = identity(item); if (known.has(id)) return false; known.add(id); return true })]
}
export interface FileSelection { id: string; kind: 'material' | 'artifact'; contentHash?: string; revision?: number }
/** A frozen historical selection cannot silently become another version or a same-id changed material. */
export function selectedFileMatches(selected: FileSelection | undefined, item: ConversationFileItem): boolean {
  return Boolean(selected && selected.id === item.id && selected.kind === item.kind && (!selected.contentHash || selected.contentHash === item.contentHash) && (selected.revision === undefined || selected.revision === item.revision))
}
/** A late preview/source reply cannot survive a changed original, permission era, or source on the same row id. */
export function fileRowTargetMatches(expected: ConversationFileItem, current: ConversationFileItem): boolean {
  return expected.id === current.id && expected.kind === current.kind && expected.conversationId === current.conversationId && expected.contentHash === current.contentHash && expected.revision === current.revision && expected.status === current.status && expected.sourceMessageId === current.sourceMessageId && expected.logicalArtifactId === current.logicalArtifactId && expected.contentVersion === current.contentVersion
}
/** Pending approvals have a real card identity before a run reply is published. Never substitute another approval or run. */
export function workApprovalTargetMatches(item: WorkViewItem, input: WorkViewTargetInput, target?: WorkViewTarget): boolean {
  const approval = item.approvalTargets?.find(value => value.approvalId === input.approvalId && value.runId === input.runId)
  return Boolean(input.kind === 'approval' && input.workId === item.work.id && approval && item.work.activeRunId === approval.runId && ['running', 'waiting'].includes(item.work.status)
    && (!input.messageId || input.messageId === approval.messageId)
    && (!target || target.workId === input.workId && target.conversationId === item.work.conversationId && target.approvalId === input.approvalId && target.runId === input.runId && (!input.messageId || target.messageId === input.messageId)))
}

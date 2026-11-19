/*
 * [INPUT]: 员工任务目标、当前快照、原主私聊创建/显隐接口与导航存活检查。
 * [OUTPUT]: 员工任务在当前同员工聊天打开，其他入口使用固定主聊天；bobo无主聊天时仅打开首发草稿。
 * [POS]: 所有员工任务入口的共同导航边界，定时任务页不承载员工任务面板。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { Conversation, Snapshot } from '@boai/shared/domain'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import { isEmployeeMainChat } from '@boai/shared/domain/conversation-list'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DetailTarget } from '../detail-panel/tabs-state'

export type EmployeeTaskTarget = Extract<DetailTarget, { type: 'employee-tasks' }>
export function isEmployeeTaskHost(room: Conversation | undefined, employeeId: string) {
  return Boolean(room && (isEmployeeMainChat(room, employeeId) || room.employeeChat === 'topic' &&
    room.kind === 'direct' && !room.employeeTaskId && !room.mergedInto && !room.channel && room.agentIds.length === 1 && room.agentIds[0] === employeeId))
}
export async function resolveEmployeeTaskDestination({ api, snapshot, target, current, conversationId }: {
  api: DesktopApi; snapshot: Snapshot; target: EmployeeTaskTarget; current(): boolean; conversationId?: string | null
}) {
  if (!current()) return
  const employee = snapshot.agents.find(agent => agent.id === target.id)
  if (!employee) throw new Error('该员工已不存在')
  // Include hidden main chats: opening a task must not create a second private chat.
  const existing = snapshot.conversations.find(room => room.id === conversationId && isEmployeeTaskHost(room, employee.id)) ??
    snapshot.conversations.find(room => isEmployeeMainChat(room, employee.id))
  if (!existing && isCoreAgent(employee)) return { route: { page: 'conversations' as const, conversationId: null, employeeChatDraft: { employeeId: employee.id, role: 'main' as const } }, scope: 'conversations' as const, target }
  const room = existing ?? await api.request('createConversation', { kind: 'direct', title: employee.name, agentIds: [employee.id], mode: 'natural' })
  if (!current()) return
  if (!isEmployeeTaskHost(room, employee.id)) throw new Error('员工主会话身份不匹配，请重新打开')
  if (room.list?.hidden) await api.request('updateConversationList', { id: room.id, action: 'show' })
  if (!current()) return
  return { route: { page: 'conversations' as const, conversationId: room.id }, scope: 'conversations' as const, target }
}

/*
 * [INPUT]: 已发布消息、工作结果、产物与当前审批的共享合同。
 * [OUTPUT]: 本轮用户触发关联不重复显示为引用，保留手动/跨消息引用；保守连续发言、文件/审批关联与有证据的工作状态展示。
 * [POS]: 群聊纯展示投影，不创建任务或推断执行归属。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Approval, Artifact, ConversationDetail, Message, WorkItem } from '@shared/domain'

const MESSAGE_GROUP_WINDOW_MS = 3 * 60_000
const workLabels: Record<WorkItem['status'], string> = { ready: '等待接续', running: '正在处理', delivered: '已交付', waiting: '等待输入或依赖', blocked: '需要处理', failed: '执行失败', cancelled: '已停止', interrupted: '已中断，需明确恢复' }

/** The host's trigger link is context, not a repeated quote of the user's current request. */
export function groupMessages(detail: ConversationDetail) {
  const messages = new Map(detail.messages.map(message => [message.id, message]))
  const runs = new Map(detail.runs.map(run => [run.id, run]))
  const turns = new Map(detail.turns?.map(turn => [turn.id, turn]))
  return detail.messages.map(message => {
    const target = message.replyToMessageId && messages.get(message.replyToMessageId)
    if (message.senderType !== 'agent' || !target || target.senderType !== 'user' || target.conversationId !== message.conversationId) return message
    const run = message.runId && runs.get(message.runId)
    const turn = message.turnId && turns.get(message.turnId)
    const triggerId = run && run.messageId === message.id && run.agentId === message.senderId && run.conversationId === message.conversationId
      ? run.triggerMessageId
      : turn && turn.conversationId === message.conversationId ? turn.triggerMessageId : undefined
    return target.id === triggerId ? { ...message, replyToMessageId: undefined } : message
  })
}

export function continuesMessage(previous: Message | undefined, message: Message, separated = false) {
  if (!previous || separated || previous.senderType === 'system' || message.senderType === 'system') return false
  if (previous.status !== 'completed' || message.status !== 'completed' || previous.replyToMessageId || message.replyToMessageId) return false
  if (!previous.turnId || previous.turnId !== message.turnId || previous.conversationId !== message.conversationId || previous.senderType !== message.senderType || previous.senderId !== message.senderId) return false
  const a = previous.origin, b = message.origin
  if (Boolean(a) !== Boolean(b) || a && b && (a.kind !== b.kind || a.automationId !== b.automationId || a.occurrenceId !== b.occurrenceId || a.authorizedFingerprint !== b.authorizedFingerprint)) return false
  const elapsed = Date.parse(message.createdAt) - Date.parse(previous.createdAt)
  return elapsed >= 0 && elapsed <= MESSAGE_GROUP_WINDOW_MS && new Date(message.createdAt).toDateString() === new Date(previous.createdAt).toDateString()
}

/** Ambiguous result sets stay in the conversation's file list instead of guessing a message. */
export function artifactsByMessage(detail: ConversationDetail) {
  const result = new Map<string, Artifact[]>()
  for (const artifact of detail.artifacts) {
    const works = artifact.id ? detail.workItems?.filter(work => work.conversationId === detail.conversation.id && work.artifactIds.includes(artifact.id!)) ?? [] : []
    let message: Message | undefined
    if (works.length) {
      const ids = new Set(works.flatMap(work => work.resultMessageIds))
      if (ids.size !== 1) continue
      message = detail.messages.find(value => ids.has(value.id))
    } else if (artifact.runId) {
      const run = detail.runs.find(value => value.id === artifact.runId)
      const candidates = detail.messages.filter(value => value.runId === artifact.runId)
      if (candidates.length === 1 && candidates[0].id === run?.messageId && candidates[0].senderId === run.agentId) message = candidates[0]
    }
    if (!message || message.status !== 'completed' || message.senderType !== 'agent' || message.conversationId !== detail.conversation.id) continue
    if (artifact.ownerAgentId && message.senderId !== artifact.ownerAgentId) continue
    if (artifact.runId && message.runId && artifact.runId !== message.runId) continue
    const list = result.get(message.id) ?? []
    if (!list.some(value => value.path === artifact.path)) list.push(artifact)
    result.set(message.id, list)
  }
  return result
}

export function approvalsByMessage(detail: ConversationDetail, approvals: Approval[]) {
  const byMessage = new Map<string, Approval[]>(), pending: Approval[] = []
  for (const approval of approvals.filter(value => value.conversationId === detail.conversation.id)) {
    const run = detail.runs.find(value => value.id === approval.runId && value.conversationId === detail.conversation.id)
    const message = detail.messages.find(value => value.id === run?.messageId && value.runId === run.id && value.senderType === 'agent' && value.senderId === run.agentId)
    if (!message) { pending.push(approval); continue }
    byMessage.set(message.id, [...(byMessage.get(message.id) ?? []), approval])
  }
  return { byMessage, pending }
}

export function workDisplayState(work: WorkItem, detail: ConversationDetail, approvals: Approval[]) {
  if (work.status === 'delivered') {
    const evidence = work.outcome?.evidence ?? []
    const verified = !work.requiresReview && work.outcome?.disposition === 'delivered' && evidence.length > 0 && evidence.every(item => item.kind === 'artifact'
      ? work.artifactIds.includes(item.reference) && detail.artifacts.some(artifact => artifact.id === item.reference && (!artifact.ownerAgentId || artifact.ownerAgentId === work.ownerAgentId))
      : Boolean(item.reference.trim()) && detail.messages.some(message => work.resultMessageIds.includes(message.id) && message.conversationId === work.conversationId && message.senderType === 'agent' && message.senderId === work.ownerAgentId && message.status === 'completed' && message.content.includes(item.reference)))
    return { label: verified ? '已交付' : '交付待核对', tone: verified ? 'success' : 'warning' }
  }
  if (work.activeRunId && ['running', 'waiting'].includes(work.status) && approvals.some(approval => approval.conversationId === work.conversationId && approval.runId === work.activeRunId)) return { label: '待确认', tone: 'warning' }
  return { label: workLabels[work.status], tone: work.status === 'running' ? 'active' : ['failed', 'blocked'].includes(work.status) ? 'error' : 'muted' }
}

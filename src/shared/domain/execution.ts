/*
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 执行历史支持按定时任务单次occurrence身份限定，在分页前排除同会话其他运行。
 * [OUTPUT]: 2026-10-12原生回应接受/提交/未知与公开模型/目录/容量来源合同；提交不等于接收。
 * [INPUT]: 原生执行事件、实际运行身份与Rovai执行呈现合同。
 * [OUTPUT]: 可分页重读的执行证据和原生交互请求；正文按需读取，不截断持久内容。
 * [POS]: 员工执行面板与运行时共用合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { AgentRun } from './index'
import type { LiveRuntimeEvent } from '../rovai'

export type ExecutionEvent = Pick<LiveRuntimeEvent, 'eventType' | 'payload' | 'canonical'> & {
  id: string
  /** Delta changes the saved block, preserving its first position. */
  appendText?: string
  appendOutput?: string
  parentId?: string
}
export type ExecutionEvidence = LiveRuntimeEvent & {
  runId: string; conversationId: string; agentId: string; sequence: number; updatedAt: string
  parentId?: string; contentLength: number; deferred: boolean
}
export type ExecutionHistoryQuery = { conversationId: string; agentId?: string; occurrenceId?: string; before?: { createdAt: string; id: string } }
export type ExecutionHistoryPage = {
  items: { run: AgentRun; trigger: string }[]
  next?: { createdAt: string; id: string }
}
export type ExecutionEvidenceQuery = { conversationId: string; runId: string; after?: number }
export type ExecutionEvidencePage = { items: ExecutionEvidence[]; next?: number; revision: number }
export type ExecutionWindowQuery = { conversationId: string; runId: string; beforeSequence?: number | null; afterSequence?: number; afterChangeSequence?: number; limit: number }
export type NativeActionOption = { id: string; label: string }
export type NativeActionInput = {
  id: string; method: string; title: string; detail: unknown
  kind: 'approval' | 'input'; options: NativeActionOption[]
  questions?: { id: string; header?: string; question: string; options?: { label: string; description?: string }[]; isSecret?: boolean }[]
}
export type NativeAction = NativeActionInput & {
  runId: string; conversationId: string; agentId: string; createdAt: string
  status: 'pending' | 'answered' | 'interrupted'; response?: NativeActionResponse; responseMessageId?: string
  /** User acceptance and transport submission are distinct; submission is not native receipt proof. */
  delivery?: 'accepted' | 'submitted' | 'unknown'
}
export type NativeActionResponse = { option?: string; answers?: Record<string, string[]> }
export type NativeAgentInfo = {
  models?: { value: string; displayName?: string; description?: string; supportsEffort?: boolean; supportedEffortLevels?: string[] }[]
  commands?: { name: string; description?: string; argumentHint?: string }[]
  agents?: { name: string; description?: string; model?: string }[]
  tools?: string[]
  mcpServers?: { name: string; status?: string }[]
}
export type NativeExecutionReceipt = {
  modelSource?: { mode: 'boai-connection'; connectionId: string; connectionRevision: number; protocol: import('./model-gateway').ModelProtocol; selectedModelId: string }
  modelId?: string; selectedModelId?: string; reportedModelId?: string; modelIdSource?: 'native-init' | 'api-event'
  sessionId?: string; turnId?: string; inputAccepted?: boolean
  contextUsedTokens?: number; contextWindowTokens?: number; totalCostUsd?: number
  contextWindowSource?: { modelId: string; event: 'result.modelUsage'; sessionId: string; runId: string }
  nativeInfo?: NativeAgentInfo
}
export type NativeRuntimeOptions = {
  effort?: string
  codexApprovalPolicy?: 'untrusted' | 'on-request' | 'never'
  codexSandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  claudePermissionMode?: 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions'
}

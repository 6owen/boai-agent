/*
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: 显式CLI权限仅核对员工已保存模式，受理后继续沿原审批和当前授权，不临时改权。
 * [OUTPUT]: API/Codex/Claude共用整体执行权限；原生访问范围和审批参数由同一选择派生，旧配置未选择时保留。
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 执行历史支持按定时任务单次occurrence身份限定，在分页前排除同会话其他运行。
 * [OUTPUT]: 2026-10-12原生回应接受/提交/未知与公开模型/目录/容量来源合同；提交不等于接收。
 * [INPUT]: 原生执行事件、实际运行身份与Rovai执行呈现合同。
 * [OUTPUT]: 可分页重读的执行证据和原生交互请求；正文按需读取，不截断持久内容。
 * [POS]: 员工执行面板与运行时共用合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import type { AgentRun } from './index'
import type { LiveRuntimeEvent } from '../rovai'

export const executionPermissionSchema = z.enum(['read-only', 'ask', 'full-access'])
export type ExecutionPermission = z.infer<typeof executionPermissionSchema>
export type MessagePermissionExpectation = { permission: ExecutionPermission; agentIds: string[] }
export const executionPermissionLabels: Record<ExecutionPermission, string> = { 'read-only': '只读', ask: '请求审批', 'full-access': '完全访问（跳过审批）' }
export type ExecutionOperation = { kind: 'command' | 'file' | 'source' | 'browser' | 'configuration'; description: string }

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
  /** Explicitly return permission decisions to the selected native configuration. */
  useNativePermissions?: boolean
  effort?: string
  codexApprovalPolicy?: 'untrusted' | 'on-request' | 'never'
  codexSandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  claudePermissionMode?: 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions'
}

/** One employee permission controls both the native access boundary and its approval policy. */
export function executionPermissionNativeOptions(kind: string, options: NativeRuntimeOptions | undefined, permission?: ExecutionPermission): NativeRuntimeOptions | undefined {
  if (options?.useNativePermissions && ['codex-local', 'claude-local'].includes(kind)) return { useNativePermissions: true, ...(options.effort ? { effort: options.effort } : {}) }
  if (!permission) return options
  if (kind === 'codex-local') return { ...options, codexSandbox: permission === 'full-access' ? 'danger-full-access' : 'read-only', codexApprovalPolicy: permission === 'ask' ? 'on-request' : 'never' }
  if (kind === 'claude-local') return { ...options, claudePermissionMode: permission === 'full-access' ? 'bypassPermissions' : permission === 'read-only' ? 'plan' : 'default' }
  return options
}

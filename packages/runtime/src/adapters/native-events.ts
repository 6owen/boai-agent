/*
 * [OUTPUT]: 独立浏览器插件输入及截图沿原生媒体脱敏边界。
 * [OUTPUT]: Codex公开summary增量进入思考块；原始reasoning正文仍不暴露。
 * [OUTPUT]: 网页工具原生事件不保留输入值，截图持久化仅存媒体摘要；模型内存结果保持完整媒体。
 * [INPUT]: Rovai codex.rs normalize_event / claude.rs normalize_claude_runtime_events @ f9acc239 (MIT)，真实原生事件。
 * [OUTPUT]: 相同执行语义的TypeScript移植；保留原参数/结果，按Rovai核验文件活动与提取公开文本，私有thinking不进入公开证据。
 * [POS]: 原生事件与直接迁入的Rovai呈现模块之间的协议接线；许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { summarizeMedia } from '../modules/browser/media'
import type { ExecutionEvent } from '@boai/shared/domain/execution'
import type { CanonicalRuntimeActivityView } from '@boai/shared/rovai/contracts'
import { createHash } from 'node:crypto'

export const recordValue = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
// Port of public_claude_tool_result_text: only actual text blocks become text;
// structured/media results are retained untouched in item.result.
export function publicNativeToolResult(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (!Array.isArray(value)) return
  return value.filter(block => block?.type === 'text' && typeof block.text === 'string' && block.text.length)
    .map(block => block.text).join('\n') || undefined
}
export function nativeActivity(id: string, item: Record<string, any>, completed: boolean, parentId?: string): ExecutionEvent {
  const name = String(item.name ?? item.tool ?? item.type ?? 'tool')
  if (/(^|__)(browser_tool|call_browser_plugin)$/.test(name)) item={...item,input:{omitted:'网页输入不进入持久事件'},arguments:{omitted:'网页输入不进入持久事件'},result:summarizeMedia(item.result)}
  const type = String(item.type ?? name), input = recordValue(item.input ?? item.arguments)
  const domain = /commandExecution|Bash|shell|exec_command/.test(type + name) ? 'shell'
    : /fileChange|Write|Edit|NotebookEdit/.test(type + name) || name === 'Read' ? 'file' : /webSearch|WebSearch|WebFetch/.test(type + name) ? 'web' : 'tool'
  const state = String(item.status ?? (completed ? 'completed' : 'inProgress'))
  const canonical: CanonicalRuntimeActivityView = {
    operationId: id, activityDomain: domain, semanticKind: domain === 'shell' ? 'shell.execute' : name === 'Read' ? 'file.read' : ['Write', 'Edit'].includes(name) ? 'file.write' : 'tool.call',
    toolName: name, presentationHint: domain === 'shell' ? '运行命令' : name,
    phase: completed ? 'terminal' : 'started', outcome: /fail|error/i.test(state) || item.isError ? 'failed' : /cancel|interrupt/i.test(state) ? 'cancelled' : completed ? 'succeeded' : 'unknown',
    credibility: 'runtime_structured', coverageLevel: 'fine_grained', sourceAuthority: 'runtime',
    sourceEvidenceIds: [id], classifierVersion: 'rovai-boai-native-v1', firstEvidenceSequence: 0, lastEvidenceSequence: 0, revision: 1,
  }
  const changes = Array.isArray(item.changes) ? item.changes : []
  if (type === 'fileChange' && changes.length) {
    canonical.diffProjection = { schemaVersion: 1, source: 'runtime_reported', revision: 1, sourceEvidenceIds: [id], status: 'available', semanticKind: 'unified_diff_snapshot', entries: changes.map((value: unknown) => {
      const change = recordValue(value), diff = typeof change.diff === 'string' ? change.diff : ''
      const kind = typeof change.kind === 'string' ? change.kind : recordValue(change.kind).type
      return { path: String(change.path ?? ''), changeKind: kind === 'add' || kind === 'delete' ? kind : 'update', diff,
        additions: diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).length,
        deletions: diff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---')).length }
    }) }
  }
  const path = typeof input.file_path === 'string' ? input.file_path.trim() : ''
  const fileResult = recordValue(item.toolUseResult)
  const runtimeFileOperation = type === 'tool_use' && ['Read', 'Write', 'Edit'].includes(name) && path && completed && canonical.outcome === 'succeeded'
    ? { schemaVersion: 2, status: 'available', adapterKind: 'claude-code-cli', protocolFamily: 'claude-stream-json',
      sourceEventKind: 'assistant.tool_use.file+user.tool_result.completed', operationKind: name === 'Read' ? 'read' : 'write', path,
      // Rovai deliberately does not infer "add" from Claude's ambiguous create.
      ...(name !== 'Read' && typeof fileResult.filePath === 'string' && fileResult.filePath.trim() === path && fileResult.type === 'update' ? { changeKind: 'update' } : {}) } : undefined
  const output = publicNativeToolResult(item.result)
  // Claude's typed file inputs retain full before/after strings; no synthesized diff is claimed.
  return { id, eventType: completed ? 'activity.completed' : 'activity.started', parentId,
    payload: { item: { ...item, ...(output === undefined ? {} : { output }), ...(domain === 'shell' && !item.command && input.command ? { command: input.command } : {}) }, ...(runtimeFileOperation ? { runtimeFileOperation } : {}) }, canonical }
}

export function codexExecutionEvent(method: string, params: Record<string, any>): ExecutionEvent | undefined {
  const item = recordValue(params.item), itemId = String(item.id ?? params.itemId ?? '')
  if (method === 'item/reasoning/summaryTextDelta') return { id: `reasoning:${itemId}:${params.summaryIndex ?? 0}`, eventType: 'agent.reasoning.block', payload: { text: '' }, appendText: String(params.delta ?? '') }
  if (method.startsWith('item/reasoning/')) return
  if (method === 'item/agentMessage/delta') return { id: `text:${itemId}`, eventType: 'agent.text.block', payload: { itemId, text: '' }, appendText: String(params.delta ?? '') }
  if (method === 'item/started' || method === 'item/completed') {
    if (['reasoning', 'userMessage'].includes(item.type)) return
    if (item.type === 'agentMessage') return { id: `text:${itemId}`, eventType: 'agent.text.block', payload: { itemId, text: item.text ?? '', phase: item.phase } }
    if (item.type === 'contextCompaction') return { id: `compaction:${itemId}`, eventType: 'runtime.compaction.display', payload: { schemaVersion: 1, compactionId: itemId, adapterKind: 'codex', phase: method === 'item/completed' ? 'completed' : 'started', completionEvidence: method === 'item/completed' ? 'native_terminal' : null } }
    return nativeActivity(itemId, item, method === 'item/completed', item.parentItemId)
  }
  if (method === 'item/commandExecution/outputDelta' || method === 'command/exec/outputDelta') return { id: itemId || String(params.processId), eventType: 'activity.updated', payload: {}, appendOutput: String(params.delta ?? '') }
  if (method === 'hook/started' || method === 'hook/completed') {
    const run = recordValue(params.run)
    return nativeActivity(`hook:${run.id}`, { type: 'tool', name: `Hook · ${run.eventName ?? '执行'}`, arguments: { source: run.sourcePath, handlerType: run.handlerType, executionMode: run.executionMode }, result: run.statusMessage ?? run.entries, status: run.status, native: params }, method === 'hook/completed')
  }
  if (method === 'turn/plan/updated') return { id: `plan:${params.turnId}`, eventType: 'runtime.plan', payload: params }
  if (method === 'item/plan/delta') return { id: `plan-text:${itemId}`, eventType: 'runtime.plan.delta', payload: params, appendText: String(params.delta ?? '') }
  if (method === 'item/fileChange/patchUpdated') return { id: `patch:${itemId}`, eventType: 'file.change.updated', payload: params }
  // Lifecycle/token bookkeeping has its own run projection. Preserve all other
  // public extensions instead of losing tools introduced by a new CLI version.
  if (['thread/started', 'thread/status/changed', 'thread/tokenUsage/updated', 'turn/started', 'turn/completed', 'account/rateLimits/updated'].includes(method)) return
  return { id: createHash('sha256').update(JSON.stringify([method, params])).digest('hex'), eventType: 'runtime.native', payload: { method, params } }
}

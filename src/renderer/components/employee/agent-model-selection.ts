/*
 * [INPUT]: 员工当前运行配置、API连接与已保存本机启动项。
 * [OUTPUT]: 模型API/本机Agent两类统一选择、真实配置名称、协议精确映射与提交资格；不改运行时能力或自动清除员工资源。
 * [POS]: employee 的纯选择合同，供创建、配置和聊天入口共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Connection, ExecutionBackend, LaunchProfile } from '@shared/domain'
import { backendProtocol } from '@shared/domain/backends'

export type AgentModelSelection = { executionBackend?: ExecutionBackend; connectionId: string; modelId: string }
export const agentRunModes = [{ value: 'api', label: '模型 API' }, { value: 'local', label: '本机 Agent' }] as const
export const agentRunMode = (value: AgentModelSelection) => !value.executionBackend || value.executionBackend.kind === 'mastra-model' ? 'api' : 'local'
export const modelConnectionOptions = (connections: Connection[]) => connections.map(connection => ({ value: connection.id, label: `${connection.name}${connection.defaultModel ? ` · ${connection.defaultModel}` : ''}` }))

export function changeAgentRunMode(value: AgentModelSelection, mode: 'api' | 'local'): AgentModelSelection {
  if (mode === agentRunMode(value)) return value
  return { ...value, executionBackend: mode === 'api' ? { kind: 'mastra-model' } : { kind: 'acp-local', profileId: '' } }
}

export function selectAgentProfile(value: AgentModelSelection, profile: LaunchProfile): AgentModelSelection {
  const kind = profile.protocol === 'codex-app-server' ? 'codex-local' : profile.protocol === 'claude-cli' ? 'claude-local' : 'acp-local'
  return { executionBackend: { kind, profileId: profile.id }, connectionId: kind === 'claude-local' ? value.connectionId : '', modelId: kind === 'claude-local' ? value.modelId : '' }
}

export function agentModelSelectionReady(value: AgentModelSelection, connections: Connection[], profiles: LaunchProfile[], allowTaskOnly = true): boolean {
  const backend = value.executionBackend
  if (backend && backend.kind !== 'mastra-model') {
    const profile = profiles.find(item => item.id === backend.profileId)
    if (!profile?.verified || (profile.protocol ?? 'acp') !== backendProtocol(backend.kind) || backend.kind === 'acp-local' && !allowTaskOnly) return false
    if (backend.kind !== 'claude-local') return true
  }
  const connection = connections.find(item => item.id === value.connectionId)
  return !!connection && !!(value.modelId.trim() || connection.defaultModel.trim()) && (connection.provider === 'openai-compatible' ? !!connection.baseUrl.trim() : connection.hasApiKey)
}

export function agentModelLabel(value: AgentModelSelection, connections: Connection[], profiles: LaunchProfile[]): string {
  const backend = value.executionBackend
  if (backend && backend.kind !== 'mastra-model') {
    const profile = profiles.find(item => item.id === backend.profileId)
    return profile?.name ?? '本机 Agent · 请选择连接'
  }
  const connection = connections.find(item => item.id === value.connectionId)
  return connection ? `${connection.name} · ${value.modelId || connection.defaultModel || '未配置模型'}` : '模型 API · 请选择连接'
}

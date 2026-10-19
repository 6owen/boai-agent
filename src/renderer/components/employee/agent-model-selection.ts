/*
 * [OUTPUT]: 明确选择本机连接默认遵循该连接原生权限，不把API整体权限转成原生限制；仍可随后明确选择原生模式。
 * [OUTPUT]: 运行选择携带整体执行权限，切换模型来源不拆分或重置已选权限。
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 模型ID共用1000字符/无控制符边界，完整供应商前缀及原生模型名不截断。
 * [OUTPUT]: 本机网关公开标识可用于三协议API选择；推理偏好随明确换源返回默认。
 * [OUTPUT]: 员工运行选择支持通用插件绑定、原生默认模型和连接能力事实。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [OUTPUT]: 2026-10-10 恢复全局/员工/聊天共用本机入口，默认Codex草稿且不隐式选程序；Claude来源与后端共用纯校验，拒绝Codex/API混绑。
 * [INPUT]: 员工当前运行配置、API连接与已保存本机启动项。
 * [OUTPUT]: 共用前端开关开放本机Agent设置与选择；保留配置名称、协议映射和提交资格，不自动迁移员工绑定。
 * [POS]: employee 的纯选择合同，供创建、配置和聊天入口共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { pluginGatewayProvider } from '@shared/domain/plugin-model-source'
import { validModelId } from '@shared/domain/model-id'
import type { Connection, ExecutionBackend, LaunchProfile } from '@shared/domain'
import { backendProtocol } from '@shared/domain/backends'
import { assertClaudeGatewayVersion, claudeProvider } from '@shared/domain/claude-provider'
import { gatewayCredentialsReady } from '@shared/domain/model-gateway'
import { assertCodexGatewayVersion, codexGatewayProvider } from '@shared/domain/codex-provider'

export type AgentModelSelection = { executionBackend?: ExecutionBackend; connectionId: string; modelId: string; thinkingLevel?: import('@shared/domain/model-preferences').ThinkingLevel; executionPermission?: import('@shared/domain/execution').ExecutionPermission; nativeOptions?: import('@shared/domain/execution').NativeRuntimeOptions }
// 全局只管理执行资源；员工绑定资源后仍保留原身份、记忆与工作。
export const localAgentSetupEnabled = true
export const agentRunModes = ([{ value: 'api', label: '模型 API' }, { value: 'local', label: '本机 Agent' }] as const).filter(mode => mode.value !== 'local' || localAgentSetupEnabled)
export const agentRunMode = (value: AgentModelSelection) => !value.executionBackend || value.executionBackend.kind === 'mastra-model' ? 'api' : 'local'
export const modelConnectionOptions = (connections: Connection[]) => connections.map(connection => ({ value: connection.id, label: `${connection.name}${connection.defaultModel ? ` · ${connection.defaultModel}` : ''}` }))
export function agentModelConnections(value: AgentModelSelection, connections: Connection[], profile?: LaunchProfile): Connection[] {
  if (value.executionBackend?.kind === 'runtime-plugin') return connections.filter(connection => {
    try { pluginGatewayProvider(connection, connection.defaultModel || 'manual-model', profile?.verified); return true } catch { return false }
  })
  if (value.executionBackend?.kind === 'codex-local') return connections.filter(connection => {
    try { codexGatewayProvider(connection, connection.defaultModel || 'manual-model'); return true } catch { return false }
  })
  return value.executionBackend?.kind === 'claude-local' ? connections.filter(connection => {
    try { claudeProvider(connection, connection.defaultModel || 'manual-model'); return true } catch { return false }
  }) : connections
}

export function changeAgentRunMode(value: AgentModelSelection, mode: 'api' | 'local'): AgentModelSelection {
  if (mode === agentRunMode(value)) return value
  return { ...value, executionBackend: mode === 'api' ? { kind: 'mastra-model' } : { kind: 'codex-local', profileId: '' } }
}

export function selectAgentProfile(value: AgentModelSelection, profile: LaunchProfile): AgentModelSelection {
  if (profile.protocol === 'runtime-plugin' && profile.runtimePlugin) return { executionBackend: {kind:'runtime-plugin',profileId:profile.id,pluginId:profile.runtimePlugin.pluginId,providerId:profile.runtimePlugin.providerId}, connectionId:'',modelId:'' }
  const kind = profile.protocol === 'codex-app-server' ? 'codex-local' : profile.protocol === 'claude-cli' ? 'claude-local' : 'acp-local'
  return { ...(kind === 'codex-local' || kind === 'claude-local' ? { executionPermission: undefined, nativeOptions: { ...value.nativeOptions, useNativePermissions: true } } : {}), executionBackend: { kind, profileId: profile.id }, connectionId: kind === 'claude-local' && !profile.useExistingLogin ? value.connectionId : '', modelId: kind === 'claude-local' ? value.modelId : '' }
}

export function agentModelSelectionReady(value: AgentModelSelection, connections: Connection[], profiles: LaunchProfile[], allowTaskOnly = true): boolean {
  const backend = value.executionBackend
  if (backend && backend.kind !== 'mastra-model') {
    const profile = profiles.find(item => item.id === backend.profileId)
    if (!profile?.verified || (profile.protocol ?? 'acp') !== backendProtocol(backend.kind) || backend.kind === 'acp-local' && !allowTaskOnly) return false
    if (backend.kind === 'runtime-plugin' && (backend.pluginId !== profile.runtimePlugin?.pluginId || backend.providerId !== profile.runtimePlugin?.providerId)) return false
    if (backend.kind === 'runtime-plugin' && value.connectionId) {
      try { pluginGatewayProvider(connections.find(item => item.id === value.connectionId), value.modelId, profile.verified); return true } catch { return false }
    }
    if (backend.kind === 'codex-local' && value.connectionId) {
      try { codexGatewayProvider(connections.find(item => item.id === value.connectionId), value.modelId); assertCodexGatewayVersion(profile.verified.version); return true } catch { return false }
    }
    if (backend.kind !== 'claude-local' || profile.useExistingLogin) return !value.connectionId && validModelId(value.modelId.trim(), true)
    try { const connection = connections.find(item => item.id === value.connectionId); claudeProvider(connection, value.modelId); assertClaudeGatewayVersion(connection, profile.verified.version); return true } catch { return false }
  }
  const connection = connections.find(item => item.id === value.connectionId)
  return !!connection && validModelId(value.modelId.trim() || connection.defaultModel.trim()) && (connection.gateway ? gatewayCredentialsReady(connection) : connection.provider === 'openai-compatible' ? !!connection.baseUrl.trim() : connection.hasApiKey)
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

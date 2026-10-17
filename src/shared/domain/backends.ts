/*
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [OUTPUT]: 通用插件员工/Run绑定、能力快照、协议映射及无歧义provider命名空间。
 * [OUTPUT]: 2026-10-14固定网页引用由宿主核源；本机只读租约绑定真实消息/run，写操作沿Work；重开窗口使用独立实例身份。
 * [OUTPUT]: 本机Codex/Claude独立类型与协议映射；本机分类不代替精确kind/profile归属核对。
 * [OUTPUT]: 通用runtime-plugin绑定、能力快照和provider命名空间；旧绑定仍按原协议读取。
 * [INPUT]: 员工后端选择与受信任本地程序启动配置。
 * [OUTPUT]: 启动项以可选 protocol 区分旧 ACP 与原生 Codex app-server，旧记录缺省仍为 ACP。
 * [OUTPUT]: 单个已保存启动项的当前程序/hash/登录目录只读状态；核对不执行程序、不修改原验证记录。
 * [OUTPUT]: ACP 启动输入接受短命令、持久化使用已解析绝对路径与自动 Node 方式；指定登录目录与执行能力合同；启用中的 Mastra 员工默认具备浏览器能力，旧 allowBrowser 值不控制权限，ACP 保持不支持。
 * [POS]: shared/domain/backends.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { RuntimeBinding, RuntimePluginRef, RuntimeProbe } from '../plugins/runtime-api'
import type { DigitalAgent } from './index'

export type ExecutionBackend = ({ kind: 'runtime-plugin'; profileId: string } & RuntimeBinding) | { kind: 'mastra-model' } | { kind: 'acp-local'; profileId: string } | { kind: 'codex-local'; profileId: string } | { kind: 'claude-local'; profileId: string }
export type NativeExecutionBackend = Extract<ExecutionBackend, { kind: 'codex-local' | 'claude-local' | 'runtime-plugin' }>
export function isNativeBackend(backend: { kind: string } | undefined): backend is NativeExecutionBackend {
  return backend?.kind === 'runtime-plugin' || backend?.kind === 'codex-local' || backend?.kind === 'claude-local'
}
/** Runtime category cannot authorize a receipt from another native driver or profile. */
export function sameBackendBinding(first: {kind:string;profileId?:string;pluginId?:string;providerId?:string} | undefined, second: {kind:string;profileId?:string;pluginId?:string;providerId?:string} | undefined): boolean {
  if (isNativeBackend(first) || isNativeBackend(second)) return isNativeBackend(first) && isNativeBackend(second) && first.kind === second.kind && first.profileId === second.profileId && (first.kind !== 'runtime-plugin' || second.kind === 'runtime-plugin' && first.pluginId === second.pluginId && first.providerId === second.providerId)
  return (first?.kind ?? 'mastra-model') === (second?.kind ?? 'mastra-model')
}
export function backendProtocol(kind: Exclude<ExecutionBackend['kind'], 'mastra-model'>): NonNullable<LaunchProfile['protocol']> {
  return kind === 'runtime-plugin' ? 'runtime-plugin' : kind === 'codex-local' ? 'codex-app-server' : kind === 'claude-local' ? 'claude-cli' : 'acp'
}
/** Browser availability is a backend capability; deprecated allowBrowser is not an authorization switch. */
export function isBrowserCapableAgent(agent: Pick<DigitalAgent, 'active' | 'executionBackend'> | undefined): boolean {
  return !!agent?.active && (agent.executionBackend?.kind ?? 'mastra-model') !== 'acp-local'
}
export interface LaunchProfile { id: string; name: string; executable: string; args: string[]; protocol?: 'acp' | 'codex-app-server' | 'claude-cli' | 'runtime-plugin'; runtimePlugin?: RuntimePluginRef; runtime?: 'node'; codexHome?: string; localConfigId?: string; useExistingLogin: boolean; hostAccessAcknowledged: true; revision: number; executableHash: string; verified?: { name: string; version: string; protocolVersion: number; checkedAt: string; capabilities?: RuntimeProbe['capabilities']; modelSource?: RuntimeProbe['modelSource'] } }
export interface LaunchProfileStatus { profile: LaunchProfile; status: 'available' | 'changed' | 'unavailable'; detail: string; checkedAt: string }
/** executable accepts an installed command name or absolute path; save/test resolves it without a shell. */
export type LaunchProfileInput = Omit<LaunchProfile,'id'|'revision'|'executableHash'|'verified'> & { id?: string; expectedRevision?: number }

export const externalTaskCapabilities = {
  phases: { task: 'supported', chat: 'unsupported', decision: 'unsupported', memory: 'unsupported' },
  toolControl: 'external', isolation: 'host', filesystemBridge: 'unsupported', terminalBridge: 'unsupported',
  skills: 'unsupported', knowledge: 'unsupported', usage: 'unknown', sessionPolicy: 'fresh', cancellation: 'managed-process',
} as const

/** Stable namespaces isolate provider sessions and private files without brand switches. */
export function nativeRuntimeNamespace(backend: ExecutionBackend | undefined): string {
  return backend?.kind === 'runtime-plugin' ? `plugin-${backend.pluginId.length}.${backend.pluginId}-${backend.providerId.length}.${backend.providerId}` : backend?.kind === 'claude-local' ? 'claude' : 'codex'
}

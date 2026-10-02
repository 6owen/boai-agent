/*
 * [INPUT]: 员工后端选择与受信任本地程序启动配置。
 * [OUTPUT]: ACP 启动输入接受短命令、持久化使用已解析绝对路径与自动 Node 方式；指定登录目录与执行能力合同；启用中的 Mastra 员工默认具备浏览器能力，旧 allowBrowser 值不控制权限，ACP 保持不支持。
 * [POS]: shared/domain/backends.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { DigitalAgent } from './index'

export type ExecutionBackend = { kind: 'mastra-model' } | { kind: 'acp-local'; profileId: string }
/** Browser availability is a backend capability; deprecated allowBrowser is not an authorization switch. */
export function isBrowserCapableAgent(agent: Pick<DigitalAgent, 'active' | 'executionBackend'> | undefined): boolean {
  return !!agent?.active && (agent.executionBackend?.kind ?? 'mastra-model') === 'mastra-model'
}
export interface LaunchProfile { id: string; name: string; executable: string; args: string[]; runtime?: 'node'; codexHome?: string; localConfigId?: string; useExistingLogin: boolean; hostAccessAcknowledged: true; revision: number; executableHash: string; verified?: { name: string; version: string; protocolVersion: number; checkedAt: string } }
/** executable accepts an installed command name or absolute path; save/test resolves it without a shell. */
export type LaunchProfileInput = Omit<LaunchProfile,'id'|'revision'|'executableHash'|'verified'> & { id?: string; expectedRevision?: number }

export const externalTaskCapabilities = {
  phases: { task: 'supported', chat: 'unsupported', decision: 'unsupported', memory: 'unsupported' },
  toolControl: 'external', isolation: 'host', filesystemBridge: 'unsupported', terminalBridge: 'unsupported',
  skills: 'unsupported', knowledge: 'unsupported', usage: 'unknown', sessionPolicy: 'fresh', cancellation: 'managed-process',
} as const

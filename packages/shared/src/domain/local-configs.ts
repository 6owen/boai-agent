/*
 * [OUTPUT]: 通用插件员工/Run绑定、能力快照、协议映射及无歧义provider命名空间。
 * [INPUT]: 本地配置扫描与显式导入请求。
 * [OUTPUT]: 无密钥 API/登录元数据及实际发现的本机程序；注册表区分已接入协议和仅发现，手动命令仅精确名称自动识别。
 * [POS]: shared/domain/local-configs.ts；从 boai-app 的本地配置扫描实现适配，保留 Apache-2.0 许可。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { LaunchProfile } from './backends'

export const localAgentPrograms: readonly { command: string; name: string; protocol?: LaunchProfile['protocol'] }[] = [
  { command: 'codex', name: 'Codex', protocol: 'codex-app-server' },
  { command: 'claude', name: 'Claude', protocol: 'claude-cli' },
  { command: 'codex-acp', name: 'Codex ACP', protocol: 'acp' },
  { command: 'claude-code-acp', name: 'Claude Code ACP', protocol: 'acp' },
  { command: 'pi', name: 'Pi' },
  { command: 'omp', name: 'omp' },
]

/** Names inside a directory or a longer program name do not identify a protocol. */
export function localAgentProtocol(command: string): LaunchProfile['protocol'] {
  const name = command.trim().split(/[\\/]/).pop()?.replace(/\.exe$/i, '')
  return localAgentPrograms.find(item => item.command === name)?.protocol
}

export interface DetectedLocalAgent {
  candidateId: string
  name: string
  executable: string
  protocol?: LaunchProfile['protocol']
  runtimePlugin?: import('@boai/runtime-plugin-sdk').RuntimePluginRef
  availability: 'available' | 'unsupported'
  localConfigId?: string
  sourcePath?: string
}
/** Secret-free configuration metadata shared with the renderer. */
export type LocalConfigIssue = 'missing-api-key' | 'missing-model' | 'invalid-base-url' | 'unsupported-config' | 'invalid-config'
export interface DetectedApiKeyConfig {
  sourceId: 'codex-api-key' | 'claude-code-api-key' | 'openai-config'
  authType: 'api_key'
  provider: 'openai' | 'anthropic'
  providerName: string
  configId: string
  sourcePath?: string
  baseUrl?: string
  model?: string
  api: 'openai-responses' | 'openai-completions' | 'anthropic-messages'
  hasApiKey: boolean
  usable: boolean
  issue?: LocalConfigIssue
  envKey?: string
}
export interface LocalApiKeyConfig {
  detected: DetectedApiKeyConfig
  /** Server-side only. Never return this container through RPC. */
  apiKey?: string
}
export interface LocalConfigScanOptions { directory?: string }
export interface LocalApiKeyImportOptions extends LocalConfigScanOptions { model?: string }
export interface DetectedOAuthConfig {
  authType: 'oauth'
  sourceId: 'codex-cli'
  configId: string
  sourcePath: string
  usable: boolean
  acp?: { executable: string; runtime?: 'node' }
}
export interface LocalConfigScanResult {
  logins: (DetectedApiKeyConfig | DetectedOAuthConfig)[]
  agents?: DetectedLocalAgent[]
  truncated: boolean
  skippedFiles: number
  directory?: string
}

/*
 * [INPUT]: 本地配置扫描与显式导入请求。
 * [OUTPUT]: 无密钥 API/Codex 登录元数据与可用 ACP 程序位置；登录有效性须由会话测试确认。
 * [POS]: shared/domain/local-configs.ts；从 boai-app 的本地配置扫描实现适配，保留 Apache-2.0 许可。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
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
  truncated: boolean
  skippedFiles: number
  directory?: string
}

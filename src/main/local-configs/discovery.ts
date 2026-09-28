/*
 * [INPUT]: 有界配置扫描、当前扫描范围与用户选中的配置标识。
 * [OUTPUT]: 无密钥预览、重读导入 API 连接或指定登录目录的 ACP 启动项；发现不执行程序。
 * [POS]: main/local-configs 的模型连接用例，扫描不访问网络或修改源文件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { dirname } from 'node:path'
import type { ConnectionInput, LaunchProfileInput } from '../../shared/domain'
import { scanLocalConfigs, readScannedApiKeyConfig } from './local-config-scan'
import { findCodexAcp, inspectCodexAcp, type CodexAcpProgram } from './codex-acp'

export class LocalConfigDiscovery {
  private scope: Parameters<typeof scanLocalConfigs>[0]
  private selected = new Set<string>()
  private agents = new Set<string>()
  private program?: CodexAcpProgram

  constructor(private searchPaths?: string[]) {}

  scan(options: Parameters<typeof scanLocalConfigs>[0] = {}) {
    this.selected.clear()
    this.agents.clear()
    this.program = undefined
    const result = scanLocalConfigs(options)
    this.scope = options
    this.selected = new Set(result.logins.filter(item => item.authType === 'api_key').map(item => item.configId))
    this.program = findCodexAcp(this.searchPaths)
    for (const login of result.logins) {
      if (login.authType !== 'oauth') continue
      this.agents.add(login.configId)
      if (this.program) login.acp = { executable: this.program.executable, runtime: this.program.runtime }
    }
    return result
  }

  launchProfile(configId: string): LaunchProfileInput {
    if (!this.agents.has(configId)) throw new Error('请先扫描并选择 Codex 登录')
    const login = scanLocalConfigs(this.scope).logins.find(item => item.authType === 'oauth' && item.configId === configId)
    if (!login || !login.sourcePath) throw new Error('源登录已变化或被移除，请重新扫描')
    if (!this.program) throw new Error('未找到 codex-acp，请安装后重新扫描')
    let program: CodexAcpProgram
    try { program = inspectCodexAcp(this.program.executable) } catch { throw new Error('ACP 程序已移除，请重新扫描') }
    if (program.executableHash !== this.program.executableHash) throw new Error('ACP 程序已变化，请重新扫描')
    return {
      name: 'Codex · 本地登录', executable: program.executable, args: [], runtime: program.runtime,
      codexHome: dirname(login.sourcePath), localConfigId: configId,
      useExistingLogin: true, hostAccessAcknowledged: true,
    }
  }

  connection(configId: string, model?: string): ConnectionInput {
    if (!this.selected.has(configId)) throw new Error('请先扫描并选择 API 配置')
    const config = readScannedApiKeyConfig(configId, { ...this.scope, model })
    if (!config) throw new Error('源配置已变化或被移除，请重新扫描')
    const { detected, apiKey } = config
    if (!detected.usable || !apiKey || !detected.baseUrl) throw new Error('源配置尚不完整或不受支持，请修正后重新扫描')
    if (!detected.model) throw new Error('请填写默认模型 ID 后导入')
    const anthropic = detected.provider === 'anthropic'
    // Claude Code's SDK adds /v1; the AI SDK expects it in baseURL already.
    const baseUrl = anthropic && !detected.baseUrl.endsWith('/v1') ? `${detected.baseUrl}/v1` : detected.baseUrl
    const source = detected.sourceId === 'codex-api-key' ? 'Codex' : detected.sourceId === 'claude-code-api-key' ? 'Claude Code' : detected.providerName
    return {
      name: `${source} · ${detected.model}`.slice(0, 100),
      provider: anthropic ? 'anthropic' : baseUrl === 'https://api.openai.com/v1' ? 'openai' : 'openai-compatible',
      baseUrl, defaultModel: detected.model, apiKey,
      ...(!anthropic ? { api: detected.api === 'openai-responses' ? 'responses' as const : 'chat' as const } : {}),
      localConfigId: configId,
    }
  }
}

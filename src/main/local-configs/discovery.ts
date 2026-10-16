/*
 * [OUTPUT]: 从运行时贡献声明发现Pi/ACP程序并固定provider/hash；扫描不执行CLI，停用不能生成连接。
 * [OUTPUT]: 2026-10-11 第13组员工执行来源/本机登录和运行选项沿原产品身份接线；持续原生合同见13组10/11，实际成绩唯一归06 §122。
 * [INPUT]: 有界配置扫描、当前扫描范围与用户选中的配置标识。
 * [OUTPUT]: 实际程序候选与独立协议/来源预填；选择时复查程序身份，未接入程序不可生成草稿；原API/ACP导入保持。
 * [POS]: main/local-configs 的模型连接用例，扫描不访问网络或修改源文件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { dirname } from 'node:path'
import type { ConnectionInput, LaunchProfileInput } from '../../shared/domain'
import { scanLocalConfigs, readScannedApiKeyConfig } from './local-config-scan'
import { findCodexAcp, inspectCodexAcp, type CodexAcpProgram } from './codex-acp'
import { inspectProgram, resolveProgram } from '../../runtime/modules/backends/program'
import { discoverAgentPrograms } from './agent-programs'
import { CLAUDE_PROGRAM_LIMIT } from '../../runtime/adapters/claude/policy'

export class LocalConfigDiscovery {
  private scope: Parameters<typeof scanLocalConfigs>[0]
  private selected = new Set<string>()
  private agents = new Set<string>()
  private program?: CodexAcpProgram
  private detected = new Map<string, ReturnType<typeof discoverAgentPrograms>[number]>()

  private plugins: import('../../shared/plugins/runtime-catalog').RuntimePluginSummary[] = []
  setRuntimePlugins(plugins: import('../../shared/plugins/runtime-catalog').RuntimePluginSummary[]) { this.plugins = plugins }
  constructor(private searchPaths?: string[]) {}

  scan(options: Parameters<typeof scanLocalConfigs>[0] = {}) {
    this.selected.clear()
    this.agents.clear()
    this.program = undefined
    this.detected.clear()
    const result = scanLocalConfigs(options)
    this.scope = options
    this.selected = new Set(result.logins.filter(item => item.authType === 'api_key').map(item => item.configId))
    this.program = findCodexAcp(this.searchPaths)
    for (const login of result.logins) {
      if (login.authType !== 'oauth') continue
      this.agents.add(login.configId)
      if (this.program) login.acp = { executable: this.program.executable, runtime: this.program.runtime }
    }
    const programs = discoverAgentPrograms(this.searchPaths, result.logins.filter(item => item.authType === 'oauth'), !!options.directory, this.plugins)
    this.detected = new Map(programs.map(item => [item.candidate.candidateId, item]))
    result.agents = programs.map(item => item.candidate)
    return result
  }

  detectedProfile(candidateId: string): LaunchProfileInput {
    const detected = this.detected.get(candidateId)
    if (!detected) throw new Error('请重新扫描并选择本机 Agent')
    const { candidate, hash } = detected
    if (candidate.protocol && candidate.availability !== 'available') throw new Error('运行时插件未启用或尚未安装，请在设置的插件中核对')
    if (!candidate.protocol) throw new Error('已发现这个程序，但暂未接入它的运行协议')
    let program
    try { program = inspectProgram(candidate.executable, candidate.protocol === 'claude-cli' ? CLAUDE_PROGRAM_LIMIT : undefined) }
    catch { throw new Error('程序已移除或不可读取，请重新扫描') }
    if (program.hash !== hash || program.path !== candidate.executable) throw new Error('程序已变化，请重新扫描')
    if (candidate.localConfigId && candidate.protocol !== 'claude-cli' && candidate.protocol !== 'runtime-plugin') {
      const draft = this.launchProfile(candidate.localConfigId, candidate.protocol)
      if (draft.executable !== candidate.executable) throw new Error('程序路径已变化，请重新扫描')
      return { ...draft, protocol: candidate.protocol }
    }
    return { name: candidate.name, executable: program.path, runtime: program.runtime, protocol: candidate.protocol, ...(candidate.runtimePlugin ? {runtimePlugin:candidate.runtimePlugin} : {}), args: [], useExistingLogin: true, hostAccessAcknowledged: true }
  }

  launchProfile(configId: string, protocol: 'acp' | 'codex-app-server' = 'acp'): LaunchProfileInput {
    if (!this.agents.has(configId)) throw new Error('请先扫描并选择 Codex 登录')
    const login = scanLocalConfigs(this.scope).logins.find(item => item.authType === 'oauth' && item.configId === configId)
    if (!login || !login.sourcePath) throw new Error('源登录已变化或被移除，请重新扫描')
    if (protocol === 'codex-app-server') {
      const program = resolveProgram('codex', this.searchPaths)
      return {
        name: '本机 Codex · 本地登录', protocol, executable: program.path, args: [], runtime: program.runtime,
        codexHome: dirname(login.sourcePath), localConfigId: configId,
        useExistingLogin: true, hostAccessAcknowledged: true,
      }
    }
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

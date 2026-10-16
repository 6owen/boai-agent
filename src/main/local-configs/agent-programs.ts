/*
 * [OUTPUT]: 从运行时贡献声明发现Pi/ACP程序并固定provider/hash；扫描不执行CLI，停用不能生成连接。
 * [INPUT]: 已知 Agent 命令注册表、获准搜索路径及无凭据登录来源。
 * [OUTPUT]: 只读实际可执行文件后才产生候选；保存协议/来源/程序身份，未接入的程序只报告发现。
 * [POS]: main/local-configs 的可扩展程序发现；不运行程序、不读取 Claude 个人登录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { RuntimePluginSummary } from '../../shared/plugins/runtime-catalog'
import { createHash } from 'node:crypto'
import { localAgentPrograms, type DetectedLocalAgent, type DetectedOAuthConfig } from '../../shared/domain/local-configs'
import { resolveProgram } from '../../runtime/modules/backends/program'
import { CLAUDE_PROGRAM_LIMIT } from '../../runtime/adapters/claude/policy'

export function discoverAgentPrograms(paths: string[] | undefined, logins: DetectedOAuthConfig[], directoryOnly = false, plugins: RuntimePluginSummary[] = []) {
  const found: { candidate: DetectedLocalAgent; hash: string }[] = []
  const runtimePrograms = plugins.flatMap(plugin => plugin.manifest.contributions.flatMap(contribution => contribution.discovery.commands.map(command => ({ command, name: plugin.manifest.name, protocol: 'runtime-plugin' as const, enabled: plugin.enabled, runtimePlugin: { pluginId: plugin.manifest.id, providerId: contribution.providerId, packageHash: plugin.packageHash } }))))
  const entries: {command:string;name:string;protocol?:import('../../shared/domain/backends').LaunchProfile['protocol'];enabled?:boolean;runtimePlugin?:import('../../shared/plugins/runtime-api').RuntimePluginRef}[] = [...localAgentPrograms.filter(entry => !runtimePrograms.some(plugin => plugin.command === entry.command)), ...runtimePrograms]
  for (const entry of entries) {
    let program
    try { program = resolveProgram(entry.command, paths, entry.protocol === 'claude-cli' ? CLAUDE_PROGRAM_LIMIT : undefined) }
    catch { continue }
    const sources = ['codex', 'codex-acp'].includes(entry.command) ? logins : []
    if (directoryOnly && !sources.length) continue
    for (const source of sources.length ? sources : [undefined]) {
      found.push({
        hash: program.hash,
        candidate: {
          candidateId: createHash('sha256').update(JSON.stringify([entry.command, program.path, source?.configId, ...('runtimePlugin' in entry ? [entry.runtimePlugin] : [])])).digest('hex'),
          name: entry.name, executable: program.path, protocol: entry.protocol,
          availability: entry.protocol && (entry.enabled !== false) ? 'available' : 'unsupported',
          ...(entry.runtimePlugin ? { runtimePlugin: entry.runtimePlugin } : {}),
          ...(source ? { localConfigId: source.configId, sourcePath: source.sourcePath } : {}),
        },
      })
    }
  }
  return found
}

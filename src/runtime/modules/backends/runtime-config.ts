/*
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 受信运行时包登记/内容hash/CAS/租约、通用连接验证与配置指纹。
 * [OUTPUT]: 插件绑定复用协作/自动化指纹；实际启用与包核验在统一宿主执行前完成。
 * [OUTPUT]: 2026-10-11 第13组员工执行来源/本机登录和运行选项沿原产品身份接线；持续原生合同见13组10/11，实际成绩唯一归06 §122。
 * [OUTPUT]: Claude自动化沿原七项表单、原Mastra时钟/occurrence/预算和宿主文件交付接入；明确程序/API来源逐次核对，命令/旧ACP限制保持，实际验证见第13组06 §57。
 * [OUTPUT]: Claude核心与组织/具名团队沿已核对程序及明确API来源接线；新员工保留原运行绑定，发布前重核指纹，自动化沿相同明确来源核对。
 * [OUTPUT]: API/Codex原指纹保持；Claude单员工按明确API/profile核对程序和来源，核心/组织/团队复用同一指纹核对；自动化入口同样核对明确来源，命令与旧ACP仍受限。
 * [INPUT]: 当前员工运行配置、SQLite事务与受管程序身份。
 * [OUTPUT]: API沿原模型指纹，本机Codex冻结启动项/程序/验证/模型身份；不启动程序、不回退API、不读取登录凭据。
 * [POS]: 组织、团队与自动化共用的运行配置核对；本机核对不嵌套产品事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { pluginGatewayProvider } from '../../../shared/domain/plugin-model-source'
import { stat } from 'node:fs/promises'
import type { Connection, DigitalAgent, LaunchProfile } from '../../../shared/domain'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import { resolveTeamModel, teamError, teamHash } from '../teams/team-repository'
import { inspectProgram } from './program'
import { CLAUDE_PROGRAM_LIMIT } from '../../adapters/claude/policy'
import { claudeProvider } from '../../adapters/claude/provider'
import { assertClaudeGatewayVersion } from '../../../shared/domain/claude-provider'
import { assertCodexGatewayVersion, codexGatewayProvider } from '../../../shared/domain/codex-provider'

export async function resolveEmployeeRuntime(tx: RecordTransaction, input: Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'nativeOptions'>) {
  const executionBackend = input.executionBackend ?? { kind: 'mastra-model' as const }
  if (executionBackend.kind === 'mastra-model') return { executionBackend, nativeOptions: undefined, connectionId: input.connectionId, ...resolveTeamModel(await tx.get<Connection>('connections', input.connectionId), input.modelId) }
  if (executionBackend.kind === 'runtime-plugin') return resolvePluginRuntime(input, await tx.get<LaunchProfile>('launchProfiles', executionBackend.profileId), await tx.get<Connection>('connections', input.connectionId))
  if (executionBackend.kind === 'claude-local') return resolveClaudeRuntime(input, await tx.get<LaunchProfile>('launchProfiles', executionBackend.profileId), await tx.get<Connection>('connections', input.connectionId))
  if (executionBackend.kind !== 'codex-local') return teamError('MODEL_UNAVAILABLE', '当前运行方式尚未开放自主协作或自动化')
  return resolveCodexRuntime(input, await tx.get<LaunchProfile>('launchProfiles', executionBackend.profileId), await tx.get<Connection>('connections', input.connectionId))
}

export function resolveClaudeRuntime(input: Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'nativeOptions'>, profile: LaunchProfile | undefined, connection: Connection | undefined) {
  const backend = input.executionBackend
  if (backend?.kind !== 'claude-local' || !profile || profile.id !== backend.profileId || profile.protocol !== 'claude-cli' || !profile.verified) return teamError('MODEL_UNAVAILABLE', '请先核对本机Claude程序')
  if (profile.args.length || profile.codexHome || profile.localConfigId) return teamError('CONFIG_CHANGED', 'Claude需要受管程序与明确API来源')
  if (profile.useExistingLogin) {
    if (input.connectionId) return teamError('CONFIG_CHANGED', '本机登录不能同时选择API来源')
    const file = inspectProgram(profile.executable, CLAUDE_PROGRAM_LIMIT)
    if (file.path !== profile.executable || file.hash !== profile.executableHash) return teamError('CONFIG_CHANGED', 'Claude程序已变化，请重新核对')
    return { executionBackend: backend, nativeOptions: input.nativeOptions, connectionId: '', modelId: input.modelId, fingerprint: teamHash({ executionBackend: backend, ...(input.nativeOptions ? {nativeOptions: input.nativeOptions} : {}), profile, modelId: input.modelId }) }
  }
  if (!connection || connection.id !== input.connectionId) return teamError('MODEL_UNAVAILABLE', '请选择Claude使用的兼容API连接')
  assertClaudeGatewayVersion(connection, profile.verified.version)
  const provider = claudeProvider(connection, input.modelId), file = inspectProgram(profile.executable, CLAUDE_PROGRAM_LIMIT)
  if (file.path !== profile.executable || file.hash !== profile.executableHash || file.runtime !== profile.runtime) return teamError('CONFIG_CHANGED', 'Claude程序已变化，请重新核对')
  return { executionBackend: backend, nativeOptions: input.nativeOptions, connectionId: connection.id, modelId: provider.model, fingerprint: teamHash({ executionBackend: backend, ...(input.nativeOptions ? {nativeOptions: input.nativeOptions} : {}), profile, connection, modelId: provider.model }) }
}

export async function resolveCodexRuntime(input: Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'nativeOptions'>, profile: LaunchProfile | undefined, connection?: Connection) {
  const executionBackend = input.executionBackend
  if (executionBackend?.kind !== 'codex-local' || profile?.id !== executionBackend.profileId) return teamError('MODEL_UNAVAILABLE', '本机员工的启动配置不可用')
  if (!profile || profile.protocol !== 'codex-app-server' || !profile.verified) return teamError('MODEL_UNAVAILABLE', '请先测试当前本机Codex连接')
  if (input.connectionId) {
    if (connection?.id !== input.connectionId) return teamError('MODEL_UNAVAILABLE', '原模型网关连接已不可用')
    assertCodexGatewayVersion(profile.verified.version)
    codexGatewayProvider(connection, input.modelId)
  }
  const file = inspectProgram(profile.executable)
  if (file.path !== profile.executable || file.hash !== profile.executableHash) return teamError('CONFIG_CHANGED', '本机程序已变化，请重新核对连接')
  if (profile.codexHome && !(await stat(profile.codexHome)).isDirectory()) return teamError('MODEL_UNAVAILABLE', '本机登录目录不可用')
  const modelId = input.connectionId ? codexGatewayProvider(connection, input.modelId).model : input.modelId
  return { executionBackend, nativeOptions: input.nativeOptions, connectionId: input.connectionId || '', modelId, fingerprint: teamHash({ executionBackend, ...(input.nativeOptions ? {nativeOptions: input.nativeOptions} : {}), profile, ...(input.connectionId ? { connection } : {}), modelId }) }
}

export function resolvePluginRuntime(input: Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'nativeOptions'>, profile: LaunchProfile | undefined, connection?: Connection) {
  const backend = input.executionBackend, ref = profile?.runtimePlugin
  if (backend?.kind !== 'runtime-plugin' || !profile || profile.id !== backend.profileId || profile.protocol !== 'runtime-plugin' || !profile.verified || !ref || ref.pluginId !== backend.pluginId || ref.providerId !== backend.providerId) return teamError('MODEL_UNAVAILABLE', '请先测试运行时插件连接')
  if (profile.args.length || profile.codexHome) return teamError('CONFIG_CHANGED', '插件连接与原生登录来源不一致')
  const file = inspectProgram(profile.executable)
  if (file.path !== profile.executable || file.hash !== profile.executableHash) return teamError('CONFIG_CHANGED', '本机程序已变化，请重新测试并保存连接')
  if (input.connectionId && connection?.id !== input.connectionId) return teamError('MODEL_UNAVAILABLE', '原模型网关连接已不可用')
  const modelId = input.connectionId ? pluginGatewayProvider(connection, input.modelId, profile.verified).modelId : input.modelId
  return { executionBackend: backend, nativeOptions: input.nativeOptions, connectionId: input.connectionId || '', modelId, fingerprint: teamHash({ executionBackend: backend, profile, ...(input.connectionId ? { connection } : {}), modelId }) }
}

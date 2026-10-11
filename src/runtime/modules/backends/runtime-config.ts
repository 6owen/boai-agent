/*
 * [OUTPUT]: 2026-10-11 第13组员工执行来源/本机登录和运行选项沿原产品身份接线；持续原生合同见13组10/11，实际成绩唯一归06 §122。
 * [OUTPUT]: Claude自动化沿原七项表单、原Mastra时钟/occurrence/预算和宿主文件交付接入；明确程序/API来源逐次核对，命令/旧ACP限制保持，实际验证见第13组06 §57。
 * [OUTPUT]: Claude核心与组织/具名团队沿已核对程序及明确API来源接线；新员工保留原运行绑定，发布前重核指纹，自动化沿相同明确来源核对。
 * [OUTPUT]: API/Codex原指纹保持；Claude单员工按明确API/profile核对程序和来源，核心/组织/团队复用同一指纹核对；自动化入口同样核对明确来源，命令与旧ACP仍受限。
 * [INPUT]: 当前员工运行配置、SQLite事务与受管程序身份。
 * [OUTPUT]: API沿原模型指纹，本机Codex冻结启动项/程序/验证/模型身份；不启动程序、不回退API、不读取登录凭据。
 * [POS]: 组织、团队与自动化共用的运行配置核对；本机核对不嵌套产品事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { stat } from 'node:fs/promises'
import type { Connection, DigitalAgent, LaunchProfile } from '../../../shared/domain'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import { resolveTeamModel, teamError, teamHash } from '../teams/team-repository'
import { inspectProgram } from './program'
import { CLAUDE_PROGRAM_LIMIT } from '../../adapters/claude/policy'
import { claudeProvider } from '../../adapters/claude/provider'

export async function resolveEmployeeRuntime(tx: RecordTransaction, input: Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'nativeOptions'>) {
  const executionBackend = input.executionBackend ?? { kind: 'mastra-model' as const }
  if (executionBackend.kind === 'mastra-model') return { executionBackend, nativeOptions: undefined, connectionId: input.connectionId, ...resolveTeamModel(await tx.get<Connection>('connections', input.connectionId), input.modelId) }
  if (executionBackend.kind === 'claude-local') return resolveClaudeRuntime(input, await tx.get<LaunchProfile>('launchProfiles', executionBackend.profileId), await tx.get<Connection>('connections', input.connectionId))
  if (executionBackend.kind !== 'codex-local') return teamError('MODEL_UNAVAILABLE', '当前运行方式尚未开放自主协作或自动化')
  return resolveCodexRuntime(input, await tx.get<LaunchProfile>('launchProfiles', executionBackend.profileId))
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
  const provider = claudeProvider(connection, input.modelId), file = inspectProgram(profile.executable, CLAUDE_PROGRAM_LIMIT)
  if (file.path !== profile.executable || file.hash !== profile.executableHash || file.runtime !== profile.runtime) return teamError('CONFIG_CHANGED', 'Claude程序已变化，请重新核对')
  return { executionBackend: backend, nativeOptions: input.nativeOptions, connectionId: connection.id, modelId: provider.model, fingerprint: teamHash({ executionBackend: backend, ...(input.nativeOptions ? {nativeOptions: input.nativeOptions} : {}), profile, connection, modelId: provider.model }) }
}

export async function resolveCodexRuntime(input: Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'nativeOptions'>, profile: LaunchProfile | undefined) {
  const executionBackend = input.executionBackend
  if (executionBackend?.kind !== 'codex-local' || profile?.id !== executionBackend.profileId) return teamError('MODEL_UNAVAILABLE', '本机员工的启动配置不可用')
  if (input.connectionId) return teamError('CONFIG_CHANGED', '本机员工不能同时绑定API连接')
  if (!profile || profile.protocol !== 'codex-app-server' || !profile.verified) return teamError('MODEL_UNAVAILABLE', '请先测试当前本机Codex连接')
  const file = inspectProgram(profile.executable)
  if (file.path !== profile.executable || file.hash !== profile.executableHash) return teamError('CONFIG_CHANGED', '本机程序已变化，请重新核对连接')
  if (profile.codexHome && !(await stat(profile.codexHome)).isDirectory()) return teamError('MODEL_UNAVAILABLE', '本机登录目录不可用')
  return { executionBackend, nativeOptions: input.nativeOptions, connectionId: '', modelId: input.modelId, fingerprint: teamHash({ executionBackend, ...(input.nativeOptions ? {nativeOptions: input.nativeOptions} : {}), profile, modelId: input.modelId }) }
}

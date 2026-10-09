/*
 * [INPUT]: 共用运行配置选择合同、实际API连接/本机启动项及受控草稿。
 * [OUTPUT]: 创建/配置/聊天共用入口开关，当前仅开放模型API；已有本机绑定只读保留，可明确切换API；恢复入口后沿原协议/来源字段，不自动换绑。
 * [OUTPUT]: 连接选项仅含实际连接；模型与设置页共用列表获取/手动编辑，默认模型作为当前值和输入占位，不重复显示说明。
 * [POS]: 员工创建、配置和聊天模型选择共用字段。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Connection, LaunchProfile } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Field } from '@/components/common'
import { ModelPicker } from '@/components/common/model-picker'
import { SelectField } from '@/components/ui/select-field'
import { agentRunMode, agentRunModes, changeAgentRunMode, localAgentSetupEnabled, modelConnectionOptions, selectAgentProfile, type AgentModelSelection } from './agent-model-selection'

export { agentModelLabel, agentModelSelectionReady, type AgentModelSelection } from './agent-model-selection'

export function AgentModelFields({ api, value, connections, profiles, onChange, disabled = false, allowTaskOnly = true, profileError, full = false }: {
  api: DesktopApi; value: AgentModelSelection; connections: Connection[]; profiles: LaunchProfile[]; onChange(value: AgentModelSelection): void
  disabled?: boolean; allowTaskOnly?: boolean; profileError?: string; full?: boolean
}) {
  const mode = agentRunMode(value), backend = value.executionBackend
  const profileId = backend && backend.kind !== 'mastra-model' ? backend.profileId : ''
  const connection = connections.find(item => item.id === value.connectionId)
  const profile = profiles.find(item => item.id === profileId)
  const taskOnly = profile && (profile.protocol ?? 'acp') === 'acp'
  const localUnavailable = mode === 'local' && !localAgentSetupEnabled
  const modeOptions = localUnavailable ? [...agentRunModes, { value: 'local', label: '本机 Agent（暂不开放）', disabled: true }] : agentRunModes
  const needsApi = mode === 'api' || localAgentSetupEnabled && backend?.kind === 'claude-local'
  return <>
    <Field label="运行方式" full={full} hint={localUnavailable ? '已保存的本机配置保留，可选择模型 API。' : undefined}><SelectField disabled={disabled} value={mode} onValueChange={selected => { if (selected === 'local' && !localAgentSetupEnabled) return; onChange(changeAgentRunMode(value, selected === 'local' ? 'local' : 'api')) }} options={modeOptions} /></Field>
    {localAgentSetupEnabled && mode === 'local' && <Field label="本机 Agent" full={full} hint={profileError || (!profiles.length ? '还没有本机连接，请先在设置 → 模型连接中扫描或手动添加。' : taskOnly ? '此连接仅支持显式任务，不支持普通聊天、群协作或资源绑定。' : '选择已添加并测试的本机连接；程序名称与运行协议由该配置决定。')}>
      <SelectField required disabled={disabled} value={profileId} onValueChange={id => { const selected = profiles.find(item => item.id === id); if (selected?.verified && (allowTaskOnly || (selected.protocol ?? 'acp') !== 'acp')) onChange(selectAgentProfile(value, selected)) }} options={[
        { value: '', label: '请选择本机 Agent' },
        ...(profileId && !profile ? [{ value: profileId, label: '原本机 Agent 已不可用', disabled: true }] : []),
        ...profiles.map(item => { const restricted = !allowTaskOnly && (item.protocol ?? 'acp') === 'acp'; return { value: item.id, label: `${item.name}${restricted ? ' · 不适用于当前员工' : !item.verified ? ' · 请先测试' : (item.protocol ?? 'acp') === 'acp' ? ' · 仅显式任务' : ''}`, disabled: !item.verified || restricted } }),
      ]} />
    </Field>}
    {needsApi && <>
      <Field label={mode === 'api' ? '模型连接' : 'Agent 的模型 API'} full={full} hint={mode === 'local' ? '此 Agent 需要额外指定模型来源；当前支持 Anthropic 接口与 DeepSeek 官方连接。' : !connections.length ? '还没有模型连接，请先在设置中添加。' : undefined}>
        <SelectField required disabled={disabled || !connections.length} value={connection ? value.connectionId : ''} placeholder={value.connectionId && !connection ? '原模型连接已不可用' : '请选择模型连接'} onValueChange={connectionId => onChange({ ...value, connectionId, modelId: '' })} options={modelConnectionOptions(connections)} />
      </Field>
      <ModelPicker key={connection?.id ?? 'unselected'} api={api} draft={{ id: connection?.id, baseUrl: connection?.baseUrl ?? '', defaultModel: value.modelId }} fallbackModel={connection?.defaultModel} catalogAvailable={connection?.provider === 'openai-compatible'} disabled={disabled || !connection} full={full} placeholder={connection?.defaultModel || '输入模型 ID'} onChange={modelId => onChange({ ...value, modelId })} />
    </>}
  </>
}

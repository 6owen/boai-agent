/*
 * [INPUT]: 共用运行配置选择合同、实际API连接/本机启动项及受控草稿。
 * [OUTPUT]: 统一两级表单：模型API/本机Agent→具体连接，API显示模型ID；本机协议由配置决定，Claude保留必要API来源，失效选项不自动换绑。
 * [POS]: 员工创建、配置和聊天模型选择共用字段。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Connection, LaunchProfile } from '@shared/domain'
import { Field } from '@/components/common'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { agentRunMode, agentRunModes, changeAgentRunMode, modelConnectionOptions, selectAgentProfile, type AgentModelSelection } from './agent-model-selection'

export { agentModelLabel, agentModelSelectionReady, type AgentModelSelection } from './agent-model-selection'

export function AgentModelFields({ value, connections, profiles, onChange, disabled = false, allowTaskOnly = true, profileError, full = false }: {
  value: AgentModelSelection; connections: Connection[]; profiles: LaunchProfile[]; onChange(value: AgentModelSelection): void
  disabled?: boolean; allowTaskOnly?: boolean; profileError?: string; full?: boolean
}) {
  const mode = agentRunMode(value), backend = value.executionBackend
  const profileId = backend && backend.kind !== 'mastra-model' ? backend.profileId : ''
  const connection = connections.find(item => item.id === value.connectionId)
  const profile = profiles.find(item => item.id === profileId)
  const taskOnly = profile && (profile.protocol ?? 'acp') === 'acp'
  const needsApi = mode === 'api' || backend?.kind === 'claude-local'
  return <>
    <Field label="运行方式" full={full}><SelectField disabled={disabled} value={mode} onValueChange={selected => onChange(changeAgentRunMode(value, selected === 'local' ? 'local' : 'api'))} options={agentRunModes} /></Field>
    {mode === 'local' && <Field label="本机 Agent" full={full} hint={profileError || (!profiles.length ? '还没有本机连接，请先在设置 → 模型连接中扫描或手动添加。' : taskOnly ? '此连接仅支持显式任务，不支持普通聊天、群协作或资源绑定。' : '选择已添加并测试的本机连接；程序名称与运行协议由该配置决定。')}>
      <SelectField required disabled={disabled} value={profileId} onValueChange={id => { const selected = profiles.find(item => item.id === id); if (selected?.verified && (allowTaskOnly || (selected.protocol ?? 'acp') !== 'acp')) onChange(selectAgentProfile(value, selected)) }} options={[
        { value: '', label: '请选择本机 Agent' },
        ...(profileId && !profile ? [{ value: profileId, label: '原本机 Agent 已不可用', disabled: true }] : []),
        ...profiles.map(item => { const restricted = !allowTaskOnly && (item.protocol ?? 'acp') === 'acp'; return { value: item.id, label: `${item.name}${restricted ? ' · 不适用于当前员工' : !item.verified ? ' · 请先测试' : (item.protocol ?? 'acp') === 'acp' ? ' · 仅显式任务' : ''}`, disabled: !item.verified || restricted } }),
      ]} />
    </Field>}
    {needsApi && <>
      <Field label={mode === 'api' ? '模型连接' : 'Agent 的模型 API'} full={full} hint={mode === 'local' ? '此 Agent 需要额外指定模型来源；当前支持 Anthropic 接口与 DeepSeek 官方连接。' : !connections.length ? '还没有模型连接，请先在设置中添加。' : undefined}>
        <SelectField required disabled={disabled} value={value.connectionId} onValueChange={connectionId => onChange({ ...value, connectionId, modelId: '' })} options={[{ value: '', label: '请选择模型连接' }, ...(value.connectionId && !connection ? [{ value: value.connectionId, label: '原模型连接已不可用', disabled: true }] : []), ...modelConnectionOptions(connections)]} />
      </Field>
      <Field label="模型 ID" full={full} hint={connection?.defaultModel ? `留空使用连接默认模型：${connection.defaultModel}` : '选择模型连接后，可填写具体模型 ID。'}><Input disabled={disabled} value={value.modelId} onChange={event => onChange({ ...value, modelId: event.target.value })} placeholder={connection?.defaultModel || '填写模型 ID'} /></Field>
    </>}
  </>
}

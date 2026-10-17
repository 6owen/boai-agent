/*
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: 网关目录请求携带所见连接revision，旧来源不能安装为当前模型能力。
 * [OUTPUT]: API员工沿原模型选择支持Magpie三协议目录，绑定仍由明确保存决定。
 * [OUTPUT]: 员工运行选择支持通用插件绑定、原生默认模型和连接能力事实。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [OUTPUT]: 2026-10-10 恢复共用本机执行能力入口，Codex支持显式目录/手动模型，Claude仅列宿主认可的API来源；员工绑定仍按实际协议。
 * [INPUT]: 共用运行配置选择合同、实际API连接/本机启动项及受控草稿。
 * [OUTPUT]: 创建/配置/聊天共用模型API/本机入口，沿原协议/来源字段，已保存绑定不自动换绑。
 * [OUTPUT]: 连接选项仅含实际连接；模型与设置页共用列表获取/手动编辑，默认模型作为当前值和输入占位，不重复显示说明。
 * [POS]: 员工创建、配置和聊天模型选择共用字段。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Connection, LaunchProfile } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Field } from '@/components/common'
import { ModelPicker } from '@/components/common/model-picker'
import { SelectField } from '@/components/ui/select-field'
import { Input } from '@/components/ui/input'
import type { NativeRuntimeOptions } from '@shared/domain/execution'
import { agentModelConnections, agentRunMode, agentRunModes, changeAgentRunMode, localAgentSetupEnabled, modelConnectionOptions, selectAgentProfile, type AgentModelSelection } from './agent-model-selection'

export { agentModelLabel, agentModelSelectionReady, type AgentModelSelection } from './agent-model-selection'

export function AgentModelFields({ api, value, connections, profiles, onChange, disabled = false, allowTaskOnly = true, profileError, full = false }: {
  api: DesktopApi; value: AgentModelSelection; connections: Connection[]; profiles: LaunchProfile[]; onChange(value: AgentModelSelection): void
  disabled?: boolean; allowTaskOnly?: boolean; profileError?: string; full?: boolean
}) {
  const mode = agentRunMode(value), backend = value.executionBackend
  const profileId = backend && backend.kind !== 'mastra-model' ? backend.profileId : ''
  const profile = profiles.find(item => item.id === profileId)
  const availableConnections = agentModelConnections(value, connections, profile)
  const connection = availableConnections.find(item => item.id === value.connectionId)
  const optionalSource = backend?.kind === 'codex-local' || backend?.kind === 'runtime-plugin' && (!!profile?.verified?.modelSource || !!value.connectionId)
  const taskOnly = profile && (profile.protocol ?? 'acp') === 'acp'
  const localUnavailable = mode === 'local' && !localAgentSetupEnabled
  const modeOptions = localUnavailable ? [...agentRunModes, { value: 'local', label: '本机 Agent（暂不开放）', disabled: true }] : agentRunModes
  const needsApi = mode === 'api' || localAgentSetupEnabled && (backend?.kind === 'claude-local' && !profile?.useExistingLogin || optionalSource && !!value.connectionId)
  const native = mode === 'local' && (backend?.kind === 'codex-local' || backend?.kind === 'claude-local')
  const option = <K extends keyof NativeRuntimeOptions>(key: K, selected: string) => onChange({ ...value, nativeOptions: { ...value.nativeOptions, [key]: selected || undefined } })
  return <>
    <Field label="运行方式" full={full} hint={localUnavailable ? '已保存的本机配置保留，可选择模型 API。' : undefined}><SelectField disabled={disabled} value={mode} onValueChange={selected => { if (selected === 'local' && !localAgentSetupEnabled) return; onChange(changeAgentRunMode(value, selected === 'local' ? 'local' : 'api')) }} options={modeOptions} /></Field>
    {localAgentSetupEnabled && mode === 'local' && <Field label="本机 Agent" full={full} hint={profileError || (!profiles.length ? '还没有本机连接，请先在设置 → 模型连接中扫描或手动添加。' : taskOnly ? '此连接仅支持显式任务，不支持普通聊天、群协作或资源绑定。' : '选择已添加并测试的本机连接；程序名称与运行协议由该配置决定。')}>
      <SelectField required disabled={disabled} value={profileId} onValueChange={id => { const selected = profiles.find(item => item.id === id); if (selected?.verified && (allowTaskOnly || (selected.protocol ?? 'acp') !== 'acp')) onChange(selectAgentProfile(value, selected)) }} options={[
        { value: '', label: '请选择本机 Agent' },
        ...(profileId && !profile ? [{ value: profileId, label: '原本机 Agent 已不可用', disabled: true }] : []),
        ...profiles.map(item => { const restricted = !allowTaskOnly && (item.protocol ?? 'acp') === 'acp'; return { value: item.id, label: `${item.name}${restricted ? ' · 不适用于当前员工' : !item.verified ? ' · 请先测试' : (item.protocol ?? 'acp') === 'acp' ? ' · 仅显式任务' : ''}`, disabled: !item.verified || restricted } }),
      ]} />
    </Field>}
    {localAgentSetupEnabled && mode === 'local' && optionalSource && <Field label="模型来源" full={full}><SelectField disabled={disabled} value={value.connectionId} onValueChange={connectionId => onChange({ ...value, connectionId, modelId: '', thinkingLevel: 'auto' })} options={[{ value: '', label: backend?.kind === 'codex-local' ? '沿用 Codex 原生配置' : '沿用本机 Agent 原生配置' }, ...(value.connectionId && !connection ? [{ value: value.connectionId, label: '原网关连接已不可用', disabled: true }] : []), ...modelConnectionOptions(availableConnections)]} /></Field>}
    {localAgentSetupEnabled && mode === 'local' && backend?.kind === 'codex-local' && !value.connectionId && <ModelPicker key={`${profile?.id}:${profile?.revision}`} api={api} draft={{ defaultModel: value.modelId, baseUrl: '' }} catalogSource={`codex:${profile?.id}:${profile?.revision}:${profile?.verified?.checkedAt}`} fetchModels={() => api.request('listLaunchProfileModels', { id: profileId })} disabled={disabled || !profile?.verified} full={full} defaultOption="使用 Codex 默认模型" placeholder="留空使用 Codex 当前默认模型" onChange={modelId => onChange({ ...value, modelId })} />}
    {native && backend?.kind === 'claude-local' && profile?.useExistingLogin && <Field label="模型" full={full}><Input value={value.modelId} disabled={disabled} placeholder="留空使用 Claude 默认模型，也可填写 sonnet、opus 或模型 ID" onChange={event => onChange({ ...value, modelId: event.target.value })} /></Field>}
    {backend?.kind === 'runtime-plugin' && !value.connectionId && <Field label="模型" full={full}><Input value={value.modelId} disabled={disabled} placeholder="留空使用本机 Agent 默认模型" onChange={event => onChange({...value,modelId:event.target.value})} /></Field>}
    {native && <Field label="思考强度" full={full}><Input value={value.nativeOptions?.effort ?? ''} disabled={disabled} placeholder="遵循本机 Agent 默认值" onChange={event => option('effort', event.target.value)} /></Field>}
    {native && backend?.kind === 'codex-local' && <>
      <Field label="操作批准" full={full}><SelectField disabled={disabled} value={value.nativeOptions?.codexApprovalPolicy ?? ''} onValueChange={value => option('codexApprovalPolicy', value)} options={[{ value: '', label: '遵循 Codex 配置' }, { value: 'untrusted', label: '非可信操作请求批准' }, { value: 'on-request', label: 'Agent 按需请求批准' }, { value: 'never', label: '不申请额外权限' }]} /></Field>
      <Field label="运行权限" full={full}><SelectField disabled={disabled} value={value.nativeOptions?.codexSandbox ?? ''} onValueChange={value => option('codexSandbox', value)} options={[{ value: '', label: '遵循 Codex 配置' }, { value: 'read-only', label: '只读' }, { value: 'workspace-write', label: '允许工作区写入' }, { value: 'danger-full-access', label: '完全访问本机' }]} /></Field>
    </>}
    {native && backend?.kind === 'claude-local' && <Field label="运行权限" full={full}><SelectField disabled={disabled} value={value.nativeOptions?.claudePermissionMode ?? ''} onValueChange={value => option('claudePermissionMode', value)} options={[{ value: '', label: '默认权限' }, { value: 'default', label: '请求批准' }, { value: 'acceptEdits', label: '自动允许编辑文件' }, { value: 'plan', label: '计划模式' }, { value: 'dontAsk', label: '不申请额外权限' }, { value: 'bypassPermissions', label: '完全访问本机' }]} /></Field>}
    {needsApi && <>
      {!optionalSource && <Field label={mode === 'api' ? '模型连接' : 'Agent 的模型 API'} full={full} hint={mode === 'local' ? '选择本机 Agent 调用的模型来源。' : !connections.length ? '还没有模型连接，请先在设置中添加。' : undefined}>
        <SelectField required disabled={disabled || !availableConnections.length} value={connection ? value.connectionId : ''} placeholder={value.connectionId && !connection ? '原模型连接不适用于此引擎' : '请选择模型连接'} onValueChange={connectionId => onChange({ ...value, connectionId, modelId: '', ...(value.thinkingLevel ? { thinkingLevel: 'auto' } : {}) })} options={modelConnectionOptions(availableConnections)} />
      </Field>}
      <ModelPicker key={connection?.id ?? 'unselected'} api={api} draft={{ id: connection?.id, baseUrl: connection?.baseUrl ?? '', defaultModel: value.modelId, ...(connection?.gateway ? { gateway: connection.gateway, expectedRevision: connection.revision } : {}) }} fallbackModel={connection?.defaultModel} catalogAvailable={connection?.provider === 'openai-compatible' || !!connection?.gateway} disabled={disabled || !connection} full={full} placeholder={connection?.defaultModel || '输入模型 ID'} onChange={modelId => onChange({ ...value, modelId, ...(value.thinkingLevel ? { thinkingLevel: 'auto' } : {}) })} />
    </>}
  </>
}

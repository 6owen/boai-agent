/*
 * [OUTPUT]: 2026-10-19 员工详情显示独立网页检索 Card，与数据源资源 Card 分开。
 * [OUTPUT]: 同一能力配置后台核对时保留已读内容，仅姓名/描述/头像变更不清空闪动；连接/权限/资源变化立即隔离旧状态，读取按原版本成组提交。
 * [OUTPUT]: 资料页展示与基础配置一致的模型与权限/工作方式/资源分区，标题右侧切换就地编辑；高级功能独立弹窗，不重复展示定时任务。
 * [OUTPUT]: API与本机实际能力优先展示同一整体执行权限，旧原生参数只作为未选择时的兼容配置。
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 模型与权限/工作方式/技能/数据源/知识使用标题加Card；配置值后紧凑状态，说明仅Tooltip，资料底页不再重复展示执行记录。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 定时任务列表归高级配置中的自动化分类，资料页仅展示基础配置。
 * [OUTPUT]: 资料首页移除聊天派生的当前工作看板；执行记录统一从执行详情查看。
 * [OUTPUT]: 2026-10-10 资料首页可直接打开本人执行详情，API/本机共用记录、Work/成果及原聊天导航；关闭隐藏停止读取。
 * [OUTPUT]: Codex同次读取启动项状态与员工资源说明；隐藏后迟到结果不覆盖当前配置。
 * [OUTPUT]: 本机Codex复用当前启动项只读核对，能力声明不继承无关配置。
 * [INPUT]: 员工已提交配置、DesktopApi、受管能力说明/同次启动项只读身份核对及执行详情。
 * [OUTPUT]: 员工能力失效/原握手范围、本人执行详情与原聊天导航；隐藏停读、迟到隔离，读取失败与空清单分别呈现，查看不自动验证。
 * [POS]: 通讯录基础配置的已保存值投影与分区编辑插槽，文件/工作区/记忆仍由 EmployeeDetail 管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { executionPermissionLabels } from '@boai/shared/domain/execution'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import { useEffect, useRef, useState } from 'react'
import type { AgentHome, DigitalAgent, LaunchProfileStatus, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Cpu, Key } from '@/components/icons'
import { ContactProfileCard, ContactProfileRow, ContactProfileSection, EmployeeSectionEdit, type EmployeeSectionEditing } from './profile-card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SkillContent } from '@/pages/library/skill-content'
import { employeeCapabilityFacts } from './overview-state'
import { EmployeeWebSearchCard } from './web-search'
import { EmployeeResourceCards } from './resource-cards'

export function EmployeeOverview({ api, snapshot, agent, active, editing }: { api: DesktopApi; snapshot: Snapshot; agent: DigitalAgent; active: boolean; editing: EmployeeSectionEditing }) {
  const [checked, setChecked] = useState<{ key: string; agent: DigitalAgent; home: AgentHome | null; launchStatus?: LaunchProfileStatus } | null>(null)
  const [skillId, setSkillId] = useState<string>()
  const [error, setError] = useState('')
  const token = useRef(0)
  const [revision, setRevision] = useState(0)
  const resourceKey = JSON.stringify(snapshot.resources.filter(resource => agent.skillIds.includes(resource.id)).map(resource => [resource.id, resource.name, resource.path, resource.ownerAgentId]))
  const capabilityKey = JSON.stringify({ ...agent, name: undefined, role: undefined, avatar: undefined, color: undefined, configVersion: undefined, connection: snapshot.connections.find(item => item.id === agent.connectionId), resources: resourceKey, commandPermission: snapshot.commandPermissions?.find(item => item.agentId === agent.id) })
  // Keep the actual checked agent/version together with its results while identity-only updates revalidate.
  const current = active && checked?.key === capabilityKey ? checked : null
  const launchStatus = current?.launchStatus
  const selectedSkill = snapshot.resources.find(resource => resource.id === skillId && resource.kind === 'skill' && agent.skillIds.includes(resource.id) && (!resource.ownerAgentId || resource.ownerAgentId === agent.id))
  useEffect(() => { if (!active) { setSkillId(undefined) } }, [active])
  useEffect(() => {
    const request = ++token.current
    setError('')
    if (!active) { setChecked(null); return }
    const read = async () => {
      try {
        let launchStatus: LaunchProfileStatus | undefined
        let home: AgentHome | null = null
        if (agent.executionBackend && agent.executionBackend.kind !== 'mastra-model') {
          const profileId = agent.executionBackend.profileId
          launchStatus = await api.request('getLaunchProfileStatus', { id: profileId })
        }
        if (agent.executionBackend?.kind !== 'acp-local') {
          home = await api.request('getAgentHome', { agentId: agent.id })
        }
        if (token.current !== request || home && (home.agentId !== agent.id || home.configVersion !== agent.configVersion)) return
        setChecked({ key: capabilityKey, agent, home, launchStatus })
      } catch (reason) { if (token.current === request) { setChecked(null); setError(errorText(reason)) } }
    }
    void read()
    return () => { token.current++ }
  }, [api, active, agent.id, agent.configVersion, capabilityKey, revision])
  useEffect(() => {
    if (!active) return
    return api.subscribe(event => {
      if (event.type === 'changed' && !event.conversationId) setRevision(value => value + 1)
    })
  }, [api, active])
  const capabilities = agent.executionBackend && agent.executionBackend.kind !== 'mastra-model' && (!current || error) ? [] : employeeCapabilityFacts(current?.agent ?? agent, snapshot, current?.home ?? null, launchStatus?.profile, launchStatus)
  const connection = snapshot.connections.find(item => item.id === agent.connectionId)
  const native = agent.executionBackend && agent.executionBackend.kind !== 'mastra-model'
  const connectionFact = capabilities.find(fact => fact.id === (native ? 'connection' : 'model'))
  const connectionName = native ? launchStatus?.profile.name ?? '未配置' : connection?.name ?? '未配置'
  const connectionStatus = native && !current && !error ? '读取中' : connectionFact?.status ?? '未配置'
  const remembered = snapshot.commandPermissions?.some(permission => permission.agentId === agent.id)
  const options = agent.nativeOptions
  const core = isCoreAgent(agent)
  const resourcesAvailable = agent.executionBackend?.kind !== 'acp-local'
  const commandValue = agent.executionPermission ? executionPermissionLabels[agent.executionPermission] : agent.executionBackend?.kind === 'codex-local'
    ? options?.codexApprovalPolicy ? ({ untrusted: '非可信操作请求批准', 'on-request': 'Agent 按需请求批准', never: '不申请额外权限' })[options.codexApprovalPolicy] : '遵循 Codex 配置'
    : agent.executionBackend?.kind === 'claude-local'
      ? options?.claudePermissionMode ? ({ default: '请求批准', acceptEdits: '自动允许编辑文件', plan: '计划模式', dontAsk: '不申请额外权限', bypassPermissions: '完全访问本机' })[options.claudePermissionMode] : '默认权限'
      : native ? '遵循本机 Agent 配置' : executionPermissionLabels[remembered ? 'full-access' : agent.allowCommands ? 'ask' : 'read-only']
  return <>
    {editing.section === 'model' ? editing.render('model') : <ContactProfileSection title="模型与权限" hint="以下为已保存的配置；连接状态只表达当前已有记录。" actions={<EmployeeSectionEdit editing={editing} section="model" label="模型与权限" />}>
      {error && <><Banner>{`能力说明读取失败：${error}`}</Banner><Button variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>重新读取</Button></>}
      <ContactProfileCard label="模型与权限配置">
        <ContactProfileRow icon={<Cpu />} title="运行方式">{native ? '本机 Agent' : '模型 API'}</ContactProfileRow>
        <ContactProfileRow icon={<Cpu />} title={native ? '本机 Agent' : '模型连接'}><span className="contact-value-status"><span>{connectionName}</span><small className="contact-inline-status" data-positive={connectionStatus === '已配置' || connectionStatus.startsWith('已记录')}>{connectionStatus}</small></span></ContactProfileRow>
        {(agent.executionBackend?.kind === 'claude-local' || agent.executionBackend?.kind === 'codex-local' || agent.executionBackend?.kind === 'runtime-plugin') && <ContactProfileRow icon={<Cpu />} title="模型来源"><span className="contact-value-status"><span>{agent.executionBackend?.kind === 'runtime-plugin' ? agent.connectionId ? connection?.name ?? '未配置' : launchStatus?.profile.name ?? '本机 Agent' : agent.executionBackend?.kind === 'codex-local' ? agent.connectionId ? connection?.name ?? '未配置' : '本机 Codex' : launchStatus?.profile.useExistingLogin ? '本机 Claude' : connection?.name ?? '未配置'}</span><small className="contact-inline-status" data-positive={capabilities.find(fact => fact.id === 'model')?.status === '已配置'}>{capabilities.find(fact => fact.id === 'model')?.status ?? '未配置'}</small></span></ContactProfileRow>}
        <ContactProfileRow icon={<Cpu />} title="模型 ID">{agent.modelId || (agent.connectionId ? connection?.defaultModel : '') || (native ? '使用本机默认模型' : '未设置')}{!agent.modelId && connection?.defaultModel && <span className="ml-2 text-muted-foreground">使用连接默认模型</span>}</ContactProfileRow>
        {(agent.executionBackend?.kind === 'codex-local' || agent.executionBackend?.kind === 'claude-local') && <ContactProfileRow icon={<Cpu />} title="思考强度">{agent.nativeOptions?.effort || '遵循本机 Agent 默认值'}</ContactProfileRow>}
        {(!core || native) && <ContactProfileRow icon={<Key />} title="执行权限"><span className="contact-value-status"><span>{commandValue}</span><small className="contact-inline-status" data-positive={native || agent.allowCommands}>{agent.executionPermission ? '已配置' : native ? '跟随配置' : agent.allowCommands ? '已启用' : '未启用'}</small></span></ContactProfileRow>}
      </ContactProfileCard>
    </ContactProfileSection>}
    {editing.section === 'instructions' ? editing.render('instructions') : <ContactProfileSection title="工作方式" actions={<EmployeeSectionEdit editing={editing} section="instructions" label="工作方式" />}><ContactProfileCard label="工作方式内容" fields={false}><p className="contact-card-copy">{agent.instructions || <span className="text-muted-foreground">未设置</span>}</p></ContactProfileCard></ContactProfileSection>}
    {resourcesAvailable && <EmployeeWebSearchCard api={api} agent={agent} active={active} editing={editing} />}
    {resourcesAvailable && <EmployeeResourceCards api={api} agent={agent} snapshot={snapshot} active={active} revision={revision} capabilities={capabilities} onOpenSkill={setSkillId} editing={editing} />}
    <Dialog open={active && Boolean(selectedSkill)} onOpenChange={value => { if (!value) setSkillId(undefined) }}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>{selectedSkill?.name} · 来源与说明</DialogTitle><DialogDescription>当前员工已绑定的受管副本。说明可读取不表示执行依赖或交付效果已验证。</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-y-auto">{active && selectedSkill && <SkillContent key={selectedSkill.id} api={api} resourceId={selectedSkill.id} />}</div></DialogContent></Dialog>
  </>
}

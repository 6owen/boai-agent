/*
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 工作方式/实际能力/技能/数据源使用标题加Card；配置值后紧凑状态，说明仅Tooltip，执行记录直接展示。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 员工资料直接展示只读定时任务列表，点击定位全局管理页。
 * [OUTPUT]: 资料首页移除聊天派生的当前工作看板；执行记录统一从执行详情查看。
 * [OUTPUT]: 2026-10-10 资料首页可直接打开本人执行详情，API/本机共用记录、Work/成果及原聊天导航；关闭隐藏停止读取。
 * [OUTPUT]: Codex同次读取启动项状态与员工资源说明；隐藏后迟到结果不覆盖当前配置。
 * [OUTPUT]: 本机Codex复用当前启动项只读核对，能力声明不继承无关配置。
 * [INPUT]: 员工已提交配置、DesktopApi、受管能力说明/同次启动项只读身份核对及执行详情。
 * [OUTPUT]: 员工能力失效/原握手范围、本人执行详情与原聊天导航；隐藏停读、迟到隔离，读取失败与空清单分别呈现，查看不自动验证。
 * [POS]: 通讯录资料首页的只读概览，配置/文件/工作区/记忆仍由 EmployeeDetail 管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentHome, DigitalAgent, LaunchProfileStatus, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { OwnerAutomations } from '@/pages/schedules/owner-automations'
import { Cpu, Key } from '@/components/icons'
import { ContactProfileCard, ContactProfileRow, ContactProfileSection } from './profile-card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SkillContent } from '@/pages/library/skill-content'
import { employeeCapabilityFacts } from './overview-state'
import { EmployeeExecutionPane } from './execution-pane'
import { EmployeeResourceCards } from './resource-cards'

export function EmployeeOverview({ api, snapshot, agent, active, onConfigure }: { api: DesktopApi; snapshot: Snapshot; agent: DigitalAgent; active: boolean; onConfigure(): void }) {
  const [home, setHome] = useState<AgentHome | null>(null)
  const [launchStatus, setLaunchStatus] = useState<LaunchProfileStatus>()
  const [skillId, setSkillId] = useState<string>()
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const token = useRef(0)
  const [revision, setRevision] = useState(0)
  const resourceKey = JSON.stringify(snapshot.resources.filter(resource => agent.skillIds.includes(resource.id)).map(resource => [resource.id, resource.name, resource.path, resource.ownerAgentId]))
  const selectedSkill = snapshot.resources.find(resource => resource.id === skillId && resource.kind === 'skill' && agent.skillIds.includes(resource.id) && (!resource.ownerAgentId || resource.ownerAgentId === agent.id))
  useEffect(() => { if (!active) { setSkillId(undefined) } }, [active])
  useEffect(() => {
    const request = ++token.current
    setHome(null); setLaunchStatus(undefined); setError('')
    if (!active) { setLoading(false); return }
    setLoading(true)
    const read = async () => {
      try {
        if (agent.executionBackend && agent.executionBackend.kind !== 'mastra-model') {
          const profileId = agent.executionBackend.profileId
          const result = await api.request('getLaunchProfileStatus', { id: profileId })
          if (token.current === request) setLaunchStatus(result)
        }
        if (agent.executionBackend?.kind !== 'acp-local') {
          const result = await api.request('getAgentHome', { agentId: agent.id })
          if (token.current === request) setHome(result)
        }
      } catch (reason) { if (token.current === request) setError(errorText(reason)) }
      finally { if (token.current === request) setLoading(false) }
    }
    void read()
    return () => { token.current++ }
  }, [api, active, agent.id, agent.configVersion, resourceKey, revision])
  useEffect(() => {
    if (!active) return
    return api.subscribe(event => {
      if (event.type === 'changed' && !event.conversationId) setRevision(value => value + 1)
    })
  }, [api, active])
  const capabilities = agent.executionBackend && agent.executionBackend.kind !== 'mastra-model' && (loading || error) ? [] : employeeCapabilityFacts(agent, snapshot, home, launchStatus?.profile, launchStatus)
  const connection = snapshot.connections.find(item => item.id === agent.connectionId)
  const native = agent.executionBackend && agent.executionBackend.kind !== 'mastra-model'
  const connectionFact = capabilities.find(fact => fact.id === (native ? 'connection' : 'model'))
  const connectionName = native ? launchStatus?.profile.name ?? '未配置' : connection?.name ?? '未配置'
  const connectionStatus = loading && native ? '读取中' : connectionFact?.status ?? '未配置'
  const remembered = snapshot.commandPermissions?.some(permission => permission.agentId === agent.id)
  const options = agent.nativeOptions
  const commandValue = agent.executionBackend?.kind === 'codex-local'
    ? options?.codexApprovalPolicy ? ({ untrusted: '非可信操作请求批准', 'on-request': 'Agent 按需请求批准', never: '不申请额外权限' })[options.codexApprovalPolicy] : '遵循 Codex 配置'
    : agent.executionBackend?.kind === 'claude-local'
      ? options?.claudePermissionMode ? ({ default: '请求批准', acceptEdits: '自动允许编辑文件', plan: '计划模式', dontAsk: '不申请额外权限', bypassPermissions: '完全访问本机' })[options.claudePermissionMode] : '默认权限'
      : native ? '遵循本机 Agent 配置' : agent.allowCommands ? remembered ? '允许，不再询问' : '允许，执行前确认' : '关闭'
  return <>
    <ContactProfileSection title="工作方式"><ContactProfileCard label="工作方式内容" fields={false}><p className="contact-card-copy">{agent.instructions || <span className="text-muted-foreground">未设置</span>}</p></ContactProfileCard></ContactProfileSection>
    <ContactProfileSection title="实际能力" hint="职责与工作方式来自已保存配置；以下状态只表达当前已有记录。" actions={<div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新能力状态</Button><Button variant="ghost" size="sm" onClick={onConfigure}>查看配置与系统文件</Button></div>}>
      {error && <><Banner>{`能力说明读取失败：${error}`}</Banner><Button variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>重新读取</Button></>}
      <ContactProfileCard label="实际能力配置">
        <ContactProfileRow icon={<Cpu />} title="模型连接"><span className="contact-value-status"><span>{connectionName}</span><small className="contact-inline-status" data-positive={connectionStatus === '已配置' || connectionStatus.startsWith('已记录')}>{connectionStatus}</small></span></ContactProfileRow>
        {(agent.executionBackend?.kind === 'claude-local' || agent.executionBackend?.kind === 'codex-local' || agent.executionBackend?.kind === 'runtime-plugin') && <ContactProfileRow icon={<Cpu />} title="模型来源"><span className="contact-value-status"><span>{agent.executionBackend?.kind === 'runtime-plugin' ? agent.connectionId ? connection?.name ?? '未配置' : launchStatus?.profile.name ?? '本机 Agent' : agent.executionBackend?.kind === 'codex-local' ? agent.connectionId ? connection?.name ?? '未配置' : '本机 Codex' : launchStatus?.profile.useExistingLogin ? '本机 Claude' : connection?.name ?? '未配置'}</span><small className="contact-inline-status" data-positive={capabilities.find(fact => fact.id === 'model')?.status === '已配置'}>{capabilities.find(fact => fact.id === 'model')?.status ?? '未配置'}</small></span></ContactProfileRow>}
        <ContactProfileRow icon={<Key />} title="命令授权"><span className="contact-value-status"><span>{commandValue}</span><small className="contact-inline-status" data-positive={native || agent.allowCommands}>{native ? '跟随配置' : agent.allowCommands ? '已启用' : '未启用'}</small></span></ContactProfileRow>
      </ContactProfileCard>
    </ContactProfileSection>
    <EmployeeResourceCards api={api} agent={agent} snapshot={snapshot} active={active} revision={revision} capabilities={capabilities} onOpenSkill={setSkillId} />
    <OwnerAutomations api={api} snapshot={snapshot} owner={{ kind: 'employee', employeeId: agent.id }} active={active} />
    <div className="contact-section"><EmployeeExecutionPane key={agent.id} api={api} agent={agent} snapshot={snapshot} active={active} /></div>
    <Dialog open={active && Boolean(selectedSkill)} onOpenChange={value => { if (!value) setSkillId(undefined) }}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>{selectedSkill?.name} · 来源与说明</DialogTitle><DialogDescription>当前员工已绑定的受管副本。说明可读取不表示执行依赖或交付效果已验证。</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-y-auto">{active && selectedSkill && <SkillContent key={selectedSkill.id} api={api} resourceId={selectedSkill.id} />}</div></DialogContent></Dialog>
  </>
}

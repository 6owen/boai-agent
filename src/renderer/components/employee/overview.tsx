/*
 * [OUTPUT]: Codex同次读取启动项状态与员工资源说明；隐藏后迟到结果不覆盖当前配置。
 * [OUTPUT]: 本机Codex复用当前启动项只读核对，能力声明不继承无关配置。
 * [INPUT]: 员工已提交配置、DesktopApi、受管能力说明/同次启动项只读身份核对及共用有界 Work 视图。
 * [OUTPUT]: 员工能力失效/原握手范围、本人当前工作及全部任务/真实触发导航；隐藏停读、迟到隔离，读取失败与空清单分别呈现，查看不自动验证。
 * [POS]: 通讯录资料首页的只读概览，配置/文件/工作区/记忆仍由 EmployeeDetail 管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentHome, AutomationOrigin, DigitalAgent, LaunchProfileStatus, Snapshot } from '@shared/domain'
import type { WorkViewTarget } from '@shared/domain/work-views'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SkillContent } from '@/pages/library/skill-content'
import { WorkView } from '@/components/work-views/work-view'
import { employeeCapabilityFacts } from './overview-state'

export function EmployeeOverview({ api, snapshot, agent, active, onConfigure, onViewTasks, onOpenWork, onAutomation }: { api: DesktopApi; snapshot: Snapshot; agent: DigitalAgent; active: boolean; onConfigure(): void; onViewTasks?(agentId: string): void; onOpenWork?(target: WorkViewTarget, current?: () => boolean): void; onAutomation?(origin: AutomationOrigin, current?: () => boolean, conversationId?: string): void }) {
  const [home, setHome] = useState<AgentHome | null>(null)
  const [launchStatus, setLaunchStatus] = useState<LaunchProfileStatus>()
  const [skillId, setSkillId] = useState<string>()
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const token = useRef(0)
  const [revision, setRevision] = useState(0)
  const resourceKey = JSON.stringify(snapshot.resources.filter(resource => agent.skillIds.includes(resource.id)).map(resource => [resource.id, resource.name, resource.path, resource.ownerAgentId]))
  const selectedSkill = snapshot.resources.find(resource => resource.id === skillId && resource.kind === 'skill' && agent.skillIds.includes(resource.id) && (!resource.ownerAgentId || resource.ownerAgentId === agent.id))
  useEffect(() => { if (!active) setSkillId(undefined) }, [active])
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
  return <>
    <section className="my-6 space-y-4" aria-label="员工实际能力">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">实际能力</h2><div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新能力状态</Button><Button variant="ghost" size="sm" onClick={onConfigure}>查看配置与系统文件</Button></div></div>
      <p className="field-hint">职责与工作方式来自已保存配置；以下状态只表达当前已有记录。</p>
      {loading && <Loading>正在核对能力说明…</Loading>}
      {error && <Banner>{`能力说明读取失败：${error}`}<Button variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>重新读取</Button></Banner>}
      <div className="space-y-4">{capabilities.map(fact => <div key={fact.id} className="space-y-1">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-medium">{fact.name}</strong><Badge variant="secondary">{fact.status}</Badge></div>
        <p className="field-hint">{fact.detail}</p>
        {fact.skillId && <Button variant="ghost" size="sm" onClick={() => setSkillId(fact.skillId)}>{`查看 ${fact.name} 的来源与说明`}</Button>}
      </div>)}</div>
      {!agent.skillIds.length && agent.executionBackend?.kind !== 'acp-local' && <p className="field-hint">尚未绑定技能，可在配置中从本机技能选择。</p>}
    </section>
    <Separator />
    <section className="my-6 space-y-4" aria-label="员工当前负责工作">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">当前负责工作</h2>{onViewTasks && <Button variant="ghost" size="sm" onClick={() => onViewTasks(agent.id)}>查看全部任务</Button>}</div>
      {agent.executionBackend && agent.executionBackend.kind !== 'mastra-model' && <p className="field-hint">外部任务的执行记录仍在原聊天查看；仅已登记的业务工作出现在此清单。</p>}
      <WorkView api={api} snapshot={snapshot} active={active} ownerAgentId={agent.id} compact onNavigate={(target, current) => onOpenWork?.(target, current)} onAutomation={onAutomation} />
    </section>
    {agent.instructions && <><Separator /><section className="my-6 space-y-2" aria-label="员工工作方式"><h2 className="text-sm font-semibold">工作方式</h2><p className="field-hint">已保存的配置声明</p><p className="contact-prompt whitespace-pre-wrap break-words">{agent.instructions}</p></section></>}
    <Dialog open={active && Boolean(selectedSkill)} onOpenChange={value => { if (!value) setSkillId(undefined) }}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>{selectedSkill?.name} · 来源与说明</DialogTitle><DialogDescription>当前员工已绑定的受管副本。说明可读取不表示执行依赖或交付效果已验证。</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-y-auto">{active && selectedSkill && <SkillContent key={selectedSkill.id} api={api} resourceId={selectedSkill.id} />}</div></DialogContent></Dialog>
  </>
}

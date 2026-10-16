/*
 * [OUTPUT]: 员工/群资料复用紧凑配置Card与两行列表；独立执行折叠区和右侧过程导航；滚动预留/同设置Panel reveal。
 * [OUTPUT]: 移除员工资料的旧工作看板导航，保留配置、自动化及执行详情。
 * [OUTPUT]: 通讯录侧栏通过共用 PanelResize 收缩，保留列表状态并在关闭时隔离交互。
 * [OUTPUT]: 通讯录员工/群配置共用归属自动化和原结果聊天定位。
 * [OUTPUT]: 2026-10-10 通讯录资料透传员工执行详情的固定原聊天导航，不复制员工/聊天，原配置保存与返回守卫保持。
 * [INPUT]: 员工/群聊快照、独立选中项、会话导航、现有配置编辑器与统一 UI 组件。
 * [OUTPUT]: 旧偏好选中的渠道房间仅显示渠道信息，不再进入BOAI群编辑器。
 * [OUTPUT]: 配置页返回/保存共单一滚动吸顶操作行，无发消息或底部保存/取消；保存仍提交原表单，返回沿未保存守卫。
 * [OUTPUT]: 员工资料先显示身份职责、实际能力和执行详情，发消息/配置及原聊天导航保留独立身份；隐藏停止读取；群资料人数跟随成员标题，删除与团队编辑沿原未保存守卫。
 * [POS]: 通讯录页面；浏览资料不创建会话、不挂载聊天内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { GroupAvatar } from '@/components/common/group-avatar'
import { Avatar, GuardContext } from '@/components/common'
import { EmployeeDetail } from '@/components/employee'
import { EmployeeOverview } from '@/components/employee/overview'
import { GroupEditor } from '@/components/employee/editors'
import { ChannelConversationInfo } from '@/components/employee/channel-conversation-info'
import { isChannelConversation } from '@shared/domain/conversation-list'
import { BookOpen, FileText, MessageCircle, Settings } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { ContactProfileCard, ContactProfileRow } from '@/components/employee/profile-card'
import { EmployeeExecutionDisclosure } from '@/components/employee/execution-pane'
import { OwnerAutomations } from '@/pages/schedules/owner-automations'
import { ContactList, type ContactSelection } from './contact-list'
import { ContactEditorLayout } from './contact-editor-layout'
import { PanelResize } from '@/components/common/panel-resize'
import type { ExecutionSourceNavigation } from '@/components/employee/execution-pane'

export type { ContactSelection } from './contact-list'
interface ContactsPageProps {
  api: DesktopApi
  snapshot: Snapshot
  selected: ContactSelection | null
  onSelect: (selection: ContactSelection) => void
  onCreateTeam(): void
  onCreate: (kind: 'agent' | 'group') => void
  onMessage: (selection: ContactSelection) => void
  refresh: () => Promise<void>
  sidebarShown: boolean
  divider: ReactNode
  generation: number
  busy: boolean
  active?: boolean
  onConversation(id: string, messageId?: string): void
  onOpenExecutionSource?: ExecutionSourceNavigation
}

export function ContactsPage({ api, snapshot, selected, onSelect, onMessage, onCreate, onCreateTeam, refresh, sidebarShown, divider, generation, busy, active = true, onConversation, onOpenExecutionSource }: ContactsPageProps) {
  const selectionKey = `${generation}-${selected?.kind}-${selected?.id}`
  const [detail, setDetail] = useState({ key: selectionKey, editing: false })
  if (detail.key !== selectionKey) setDetail({ key: selectionKey, editing: false })
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = content.current
    if (!active || !element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    element.style.transition = 'none'; element.dataset.settled = 'false'; element.dataset.open = 'false'
    void element.offsetWidth
    element.style.transition = ''; element.dataset.open = 'true'
    const settle = (event: TransitionEvent) => { if (event.target === element && event.propertyName === 'opacity') element.dataset.settled = 'true' }
    element.addEventListener('transitionend', settle)
    return () => { element.removeEventListener('transitionend', settle); element.dataset.settled = 'true' }
  }, [selectionKey, detail.editing, active])
  const guard = useContext(GuardContext)
  const select = (next: ContactSelection, editing = false) => {
    if (next.kind !== selected?.kind || next.id !== selected.id || editing !== detail.editing) guard.navigate(() => {
      setDetail({ key: `${generation}-${next.kind}-${next.id}`, editing }); onSelect(next)
    })
  }
  return <div className="contacts-page">
    <PanelResize open={sidebarShown} side="left" divider={divider}><ContactList onCreateTeam={onCreateTeam} api={api} snapshot={snapshot} selected={selected} onSelect={select} onMessage={onMessage} onCreate={onCreate} busy={busy} refresh={refresh} onRemoved={(agentIds, groupIds) => {
      if (selected && (selected.kind === 'agent' ? agentIds : groupIds).includes(selected.id)) guard.saved(() => setDetail({ key: selectionKey, editing: false }))
    }} /></PanelResize>
    <section className="contacts-detail" aria-label="通讯录详情"><div ref={content} className="contact-content-transition settings-page-transition t-panel-slide" data-open="true" data-settled="true">
      <ContactDetail key={selectionKey} api={api} snapshot={snapshot} selected={selected} refresh={refresh} onSelect={select} onMessage={onMessage} busy={busy} active={active} onConversation={onConversation} onOpenExecutionSource={onOpenExecutionSource} editing={detail.editing} onEditingChange={editing => setDetail({ key: selectionKey, editing })} />
    </div></section>
  </div>
}

function ContactDetail({ api, snapshot, selected, refresh, onSelect, onMessage, busy, active = true, onConversation, onOpenExecutionSource, editing, onEditingChange: setEditing }: Pick<ContactsPageProps, 'api' | 'snapshot' | 'selected' | 'refresh' | 'onSelect' | 'onMessage' | 'busy' | 'active' | 'onConversation' | 'onOpenExecutionSource'> & { editing: boolean; onEditingChange(editing: boolean): void }) {
  const guard = useContext(GuardContext)
  const agent = selected?.kind === 'agent' ? snapshot.agents.find(item => item.id === selected.id) : undefined
  const group = selected?.kind === 'group' ? snapshot.conversations.find(item => item.id === selected.id && item.kind === 'group') : undefined
  if (!selected || (!agent && !group)) return <IllustratedEmpty kind="contacts" />
  if (group && isChannelConversation(group)) return <ChannelConversationInfo conversation={group} snapshot={snapshot} onOpenAgent={id => onSelect({ kind: 'agent', id })} />
  const name = agent?.name ?? group!.title
  const resources = (ids: string[]) => ids.map(id => snapshot.resources.find(resource => resource.id === id)?.name ?? '资料已移除').join('、') || '未绑定'
  const members = group?.agentIds.map(id => snapshot.agents.find(item => item.id === id)).filter((item): item is DigitalAgent => Boolean(item)) ?? []
  if (editing) return <ContactEditorLayout active={active} onBack={() => guard.navigate(() => setEditing(false))}>{actionsTarget => agent
    ? <EmployeeDetail onConversation={onConversation} api={api} snapshot={snapshot} agent={agent} actionsTarget={actionsTarget} refresh={refresh} active={active} onClose={() => setEditing(false)} />
    : <GroupEditor active={active} onConversation={onConversation} api={api} snapshot={snapshot} conversation={group!} actionsTarget={actionsTarget} onOpenAgent={id => onSelect({ kind: 'agent', id })} onSaved={refresh} onDeleted={refresh} onClose={() => setEditing(false)} />
  }</ContactEditorLayout>
  return <div className="contact-document">
      <header className="contact-profile-heading">
        {agent ? <Avatar name={name} seed={agent.id} avatar={agent.avatar} color={agent.color} /> : <GroupAvatar members={members} />}
        <div className="contact-profile-identity"><h1>{name}</h1>{agent && <p>{agent.role || '数字员工'}</p>}{group && <Badge variant="secondary">群聊</Badge>}</div>
      </header>
      <div className="flex flex-wrap gap-3 mb-6"><Button disabled={busy} onClick={() => onMessage(selected)}><MessageCircle />发消息</Button><Button variant="secondary" onClick={() => setEditing(true)}><Settings />编辑配置</Button></div>
      {agent ? <EmployeeOverview key={agent.id} api={api} snapshot={snapshot} agent={agent} active={active} onConfigure={() => setEditing(true)} onOpenExecutionSource={onOpenExecutionSource} /> : <div className="contact-group-info">
        <ContactProfileCard label="员工组资料">
          {group!.teamSetup && <><ContactProfileRow icon={<FileText />} title="团队目的">{group!.teamSetup.purpose}</ContactProfileRow><ContactProfileRow icon={<MessageCircle />} title="协作建议">{group!.teamSetup.collaborationGuide || '未设置'}</ContactProfileRow>{group!.teamSetup.scenarioKind === 'roleplay' && <ContactProfileRow icon={<MessageCircle />} title="角色互动">玩家群不包含正式游戏规则、隐藏身份或胜负裁定。</ContactProfileRow>}</>}
          <ContactProfileRow icon={<BookOpen />} title="共享知识">{resources(group!.sharedKnowledgeIds)}</ContactProfileRow>
        </ContactProfileCard>
        <section className="automation-records contact-section" aria-label="群成员"><div className="automation-records-heading"><h3>群成员 {group!.agentIds.length}</h3></div><div className="automation-record-list">{members.map(member => <Button key={member.id} variant="ghost" size="content" className="conversation-item automation-record-row" aria-label={`查看 ${member.name} 的资料`} onClick={() => onSelect({ kind: 'agent', id: member.id })}><Avatar name={member.name} seed={member.id} avatar={member.avatar} color={member.color} /><span className="conversation-copy"><strong className="conversation-title">{member.name}</strong><small className="conversation-preview">{member.role || '数字员工'}</small></span></Button>)}</div></section>
        <OwnerAutomations api={api} snapshot={snapshot} owner={{ kind: 'group', conversationId: group!.id }} active={active} />
        <EmployeeExecutionDisclosure key={group!.id} api={api} snapshot={snapshot} conversationId={group!.id} active={active} />
      </div>}
  </div>
}

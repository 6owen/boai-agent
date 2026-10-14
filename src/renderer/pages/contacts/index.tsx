/*
 * [OUTPUT]: 2026-10-10 通讯录资料透传员工执行详情的固定原聊天导航，不复制员工/聊天，原配置保存与返回守卫保持。
 * [INPUT]: 员工/群聊快照、独立选中项、会话导航、现有配置编辑器与统一 UI 组件。
 * [OUTPUT]: 旧偏好选中的渠道房间仅显示渠道信息，不再进入BOAI群编辑器。
 * [OUTPUT]: 配置页返回/保存共单一滚动吸顶操作行，无发消息或底部保存/取消；保存仍提交原表单，返回沿未保存守卫。
 * [OUTPUT]: 员工资料先显示身份职责、实际能力和有界当前工作，发消息/配置及精确工作/原定时触发导航保留独立身份；隐藏停止读取；群资料人数跟随成员标题，删除与团队编辑沿原未保存守卫。
 * [POS]: 通讯录页面；浏览资料不创建会话、不挂载聊天内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useState, type ReactNode } from 'react'
import type { AutomationOrigin, DigitalAgent, Snapshot } from '@shared/domain'
import type { WorkViewTarget } from '@shared/domain/work-views'
import type { DesktopApi } from '@shared/ipc'
import { GroupAvatar } from '@/components/common/group-avatar'
import { Avatar, GuardContext } from '@/components/common'
import { EmployeeDetail } from '@/components/employee'
import { EmployeeOverview } from '@/components/employee/overview'
import { GroupEditor } from '@/components/employee/editors'
import { ChannelConversationInfo } from '@/components/employee/channel-conversation-info'
import { isChannelConversation } from '@shared/domain/conversation-list'
import { MessageCircle, Settings } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { Separator } from '@/components/ui/separator'
import { ContactList, type ContactSelection } from './contact-list'
import { ContactEditorLayout } from './contact-editor-layout'
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
  onViewTasks?(agentId: string): void
  onOpenWork?(target: WorkViewTarget, current?: () => boolean): void
  onAutomation?(origin: AutomationOrigin, current?: () => boolean, conversationId?: string): void
  onOpenExecutionSource?: ExecutionSourceNavigation
}

export function ContactsPage({ api, snapshot, selected, onSelect, onMessage, onCreate, onCreateTeam, refresh, sidebarShown, divider, generation, busy, active = true, onViewTasks, onOpenWork, onAutomation, onOpenExecutionSource }: ContactsPageProps) {
  const selectionKey = `${generation}-${selected?.kind}-${selected?.id}`
  const [detail, setDetail] = useState({ key: selectionKey, editing: false })
  if (detail.key !== selectionKey) setDetail({ key: selectionKey, editing: false })
  const guard = useContext(GuardContext)
  const select = (next: ContactSelection, editing = false) => {
    if (next.kind !== selected?.kind || next.id !== selected.id || editing !== detail.editing) guard.navigate(() => {
      setDetail({ key: `${generation}-${next.kind}-${next.id}`, editing }); onSelect(next)
    })
  }
  return <div className="contacts-page">
    {sidebarShown && <><ContactList onCreateTeam={onCreateTeam} api={api} snapshot={snapshot} selected={selected} onSelect={select} onMessage={onMessage} onCreate={onCreate} busy={busy} refresh={refresh} onRemoved={(agentIds, groupIds) => {
      if (selected && (selected.kind === 'agent' ? agentIds : groupIds).includes(selected.id)) guard.saved(() => setDetail({ key: selectionKey, editing: false }))
    }} />{divider}</>}
    <section className="contacts-detail" aria-label="通讯录详情">
      <ContactDetail key={selectionKey} api={api} snapshot={snapshot} selected={selected} refresh={refresh} onSelect={select} onMessage={onMessage} busy={busy} active={active} onViewTasks={onViewTasks} onOpenWork={onOpenWork} onAutomation={onAutomation} onOpenExecutionSource={onOpenExecutionSource} editing={detail.editing} onEditingChange={editing => setDetail({ key: selectionKey, editing })} />
    </section>
  </div>
}

function ContactDetail({ api, snapshot, selected, refresh, onSelect, onMessage, busy, active = true, onViewTasks, onOpenWork, onAutomation, onOpenExecutionSource, editing, onEditingChange: setEditing }: Pick<ContactsPageProps, 'api' | 'snapshot' | 'selected' | 'refresh' | 'onSelect' | 'onMessage' | 'busy' | 'active' | 'onViewTasks' | 'onOpenWork' | 'onAutomation' | 'onOpenExecutionSource'> & { editing: boolean; onEditingChange(editing: boolean): void }) {
  const guard = useContext(GuardContext)
  const agent = selected?.kind === 'agent' ? snapshot.agents.find(item => item.id === selected.id) : undefined
  const group = selected?.kind === 'group' ? snapshot.conversations.find(item => item.id === selected.id && item.kind === 'group') : undefined
  if (!selected || (!agent && !group)) return <IllustratedEmpty kind="contacts" />
  if (group && isChannelConversation(group)) return <ChannelConversationInfo conversation={group} snapshot={snapshot} onOpenAgent={id => onSelect({ kind: 'agent', id })} />
  const name = agent?.name ?? group!.title
  const resources = (ids: string[]) => ids.map(id => snapshot.resources.find(resource => resource.id === id)?.name ?? '资料已移除').join('、') || '未绑定'
  const members = group?.agentIds.map(id => snapshot.agents.find(item => item.id === id)).filter((item): item is DigitalAgent => Boolean(item)) ?? []
  if (editing) return <ContactEditorLayout active={active} onBack={() => guard.navigate(() => setEditing(false))}>{actionsTarget => agent
    ? <EmployeeDetail api={api} snapshot={snapshot} agent={agent} actionsTarget={actionsTarget} refresh={refresh} active={active} onClose={() => setEditing(false)} />
    : <GroupEditor api={api} snapshot={snapshot} conversation={group!} actionsTarget={actionsTarget} onOpenAgent={id => onSelect({ kind: 'agent', id })} onSaved={refresh} onDeleted={refresh} onClose={() => setEditing(false)} />
  }</ContactEditorLayout>
  return <div className="contact-document">
      <header className="contact-profile-heading">
        {agent ? <Avatar name={name} seed={agent.id} avatar={agent.avatar} color={agent.color} /> : <GroupAvatar members={members} />}
        <div className="contact-profile-identity"><h1>{name}</h1>{agent && <p>{agent.role || '数字员工'}</p>}{group && <Badge variant="secondary">群聊</Badge>}</div>
      </header>
      {agent && <div className="flex flex-wrap gap-3 mb-6"><Button disabled={busy} onClick={() => onMessage(selected)}><MessageCircle />发消息</Button><Button variant="secondary" onClick={() => setEditing(true)}><Settings />编辑配置</Button></div>}
      <Separator />
      {agent ? <EmployeeOverview key={agent.id} api={api} snapshot={snapshot} agent={agent} active={active} onConfigure={() => setEditing(true)} onViewTasks={onViewTasks} onOpenWork={onOpenWork} onAutomation={onAutomation} onOpenExecutionSource={onOpenExecutionSource} /> : <div className="contact-group-info">
        <section aria-label="群成员"><h2>群成员 {group!.agentIds.length}</h2><div className="contact-members">{members.map(member => <Button key={member.id} variant="ghost" size="content" className="contact-member" aria-label={`查看 ${member.name} 的资料`} onClick={() => onSelect({ kind: 'agent', id: member.id })}><Avatar name={member.name} seed={member.id} avatar={member.avatar} color={member.color} /><span>{member.name}</span></Button>)}</div></section>
        <dl className="contact-facts">{group!.teamSetup && <><div><dt>团队目的</dt><dd>{group!.teamSetup.purpose}</dd></div><div><dt>协作建议</dt><dd>{group!.teamSetup.collaborationGuide || '未设置'}</dd></div>{group!.teamSetup.scenarioKind === 'roleplay' && <div><dt>角色互动</dt><dd>玩家群不包含正式游戏规则、隐藏身份或胜负裁定。</dd></div>}</>}<div><dt>共享知识</dt><dd>{resources(group!.sharedKnowledgeIds)}</dd></div></dl>
      </div>}
      {!agent && <><Separator /><div className="contact-actions"><Button disabled={busy} onClick={() => onMessage(selected)}><MessageCircle />发消息</Button><Button variant="secondary" onClick={() => setEditing(true)}><Settings />编辑配置</Button></div></>}
  </div>
}

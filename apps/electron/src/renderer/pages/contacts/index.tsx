/*
 * [OUTPUT]: 原Panel reveal生命周期提至共用usePanelReveal，消息与通讯录复用同一重置/显现/真实结束清理；通讯录现有布局/动效保持。
 * [OUTPUT]: 群聊基础配置与员工一致就地编辑，名称局部保存、头像配置成员；高级配置继续保留基础分类。
 * [OUTPUT]: 员工身份保存回执直接局部更新Shell快照，不触发整页刷新或资料入场过渡。
 * [OUTPUT]: 员工基础配置直接在资料页分区编辑，原配置按钮改为高级配置；群聊沿同样的资料编辑与高级配置入口，页面导航继续保护草稿。
 * [OUTPUT]: 通讯录空状态直接显示，不挂载内容过渡样式或触发显现；有效员工/群资料继续沿原Panel reveal。
 * [OUTPUT]: 员工高级配置/员工组配置打开分栏Dialog，资料底页保持；原保存协议及草稿保护沿用。
 * [OUTPUT]: 员工/群资料复用紧凑配置Card与两行列表；执行记录统一从编辑弹窗进入，底页不重复展示；滚动预留/同设置Panel reveal。
 * [OUTPUT]: 移除员工资料的旧工作看板导航，保留配置、自动化及执行详情。
 * [OUTPUT]: 通讯录侧栏通过共用 PanelResize 收缩，保留列表状态并在关闭时隔离交互。
 * [OUTPUT]: 通讯录员工/群配置共用归属自动化和原结果聊天定位。
 * [OUTPUT]: 2026-10-10 通讯录资料透传员工执行详情的固定原聊天导航，不复制员工/聊天，原配置保存与返回守卫保持。
 * [INPUT]: 员工/群聊快照、独立选中项、会话导航、现有配置编辑器与统一 UI 组件。
 * [OUTPUT]: 旧偏好选中的渠道房间仅显示渠道信息，不再进入BOAI群编辑器。
 * [OUTPUT]: 弹窗关闭/取消沿局部未保存守卫，保存提交原表单并关闭；资料滚动和过渡不因开关弹窗重播。
 * [OUTPUT]: 员工资料先显示身份职责、实际能力和执行详情，发消息/配置及原聊天导航保留独立身份；隐藏停止读取；群资料人数跟随成员标题，删除与团队编辑沿原未保存守卫。
 * [POS]: 通讯录页面；浏览资料不创建会话、不挂载聊天内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useState, type ReactNode } from 'react'
import type { Conversation, DigitalAgent, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { GuardContext } from '@/components/common'
import { ChannelConversationInfo } from '@/components/employee/channel-conversation-info'
import { isChannelConversation } from '@boai/shared/domain/conversation-list'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { ContactList, type ContactSelection } from './contact-list'
import { GroupProfile } from './group-profile'
import { EmployeeProfile } from './employee-profile'
import { PanelResize } from '@/components/common/panel-resize'
import { usePanelReveal } from '@/components/common/use-panel-reveal'

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
  onAgentSaved(agent: DigitalAgent): void
  onGroupSaved(group: Conversation): void
  sidebarShown: boolean
  divider: ReactNode
  generation: number
  busy: boolean
  active?: boolean
  onConversation(id: string, messageId?: string): void
}

export function ContactsPage({ api, snapshot, selected, onSelect, onMessage, onCreate, onCreateTeam, refresh, onAgentSaved, onGroupSaved, sidebarShown, divider, generation, busy, active = true, onConversation }: ContactsPageProps) {
  const selectionKey = `${generation}-${selected?.kind}-${selected?.id}`
  const hasDetail = selected?.kind === 'agent' ? snapshot.agents.some(item => item.id === selected.id) : selected?.kind === 'group' && snapshot.conversations.some(item => item.id === selected.id && item.kind === 'group')
  const [detail, setDetail] = useState({ key: selectionKey, editing: false })
  if (detail.key !== selectionKey) setDetail({ key: selectionKey, editing: false })
  const content = usePanelReveal(selectionKey, active && Boolean(hasDetail))
  const guard = useContext(GuardContext)
  const select = (next: ContactSelection, editing = false) => {
    if (next.kind !== selected?.kind || next.id !== selected.id || editing !== detail.editing) guard.navigate(() => {
      setDetail({ key: `${generation}-${next.kind}-${next.id}`, editing }); onSelect(next)
    }, { resetOnDiscard: false })
  }
  return <div className="contacts-page">
    <PanelResize open={sidebarShown} side="left" divider={divider}><ContactList onCreateTeam={onCreateTeam} api={api} snapshot={snapshot} selected={selected} onSelect={select} onMessage={onMessage} onCreate={onCreate} busy={busy} refresh={refresh} onRemoved={(agentIds, groupIds) => {
      if (selected && (selected.kind === 'agent' ? agentIds : groupIds).includes(selected.id)) guard.saved(() => setDetail({ key: selectionKey, editing: false }))
    }} /></PanelResize>
    <section className="contacts-detail" aria-label="通讯录详情"><div ref={content} className={`contact-content-transition${hasDetail ? ' settings-page-transition t-panel-slide' : ''}`} data-open="true" data-settled="true">
      <ContactDetail key={selectionKey} api={api} snapshot={snapshot} selected={selected} refresh={refresh} onAgentSaved={onAgentSaved} onGroupSaved={onGroupSaved} onSelect={select} onMessage={onMessage} busy={busy} active={active} onConversation={onConversation} editing={detail.editing} onEditingChange={editing => setDetail({ key: selectionKey, editing })} />
    </div></section>
  </div>
}

function ContactDetail({ api, snapshot, selected, refresh, onAgentSaved, onGroupSaved, onSelect, onMessage, busy, active = true, onConversation, editing, onEditingChange: setEditing }: Pick<ContactsPageProps, 'api' | 'snapshot' | 'selected' | 'refresh' | 'onAgentSaved' | 'onGroupSaved' | 'onSelect' | 'onMessage' | 'busy' | 'active' | 'onConversation'> & { editing: boolean; onEditingChange(editing: boolean): void }) {
  const agent = selected?.kind === 'agent' ? snapshot.agents.find(item => item.id === selected.id) : undefined
  const group = selected?.kind === 'group' ? snapshot.conversations.find(item => item.id === selected.id && item.kind === 'group') : undefined
  if (!selected || (!agent && !group)) return <IllustratedEmpty kind="contacts" />
  if (group && isChannelConversation(group)) return <ChannelConversationInfo conversation={group} snapshot={snapshot} onOpenAgent={id => onSelect({ kind: 'agent', id })} />
  if (agent) return <EmployeeProfile api={api} snapshot={snapshot} agent={agent} active={active} busy={busy} refresh={refresh} onAgentSaved={onAgentSaved} onMessage={() => onMessage(selected)} advancedOpen={editing} onAdvancedChange={setEditing} onOpenAgent={id => onSelect({ kind: 'agent', id })} onConversation={onConversation} />
  return <GroupProfile api={api} snapshot={snapshot} group={group!} active={active} busy={busy} refresh={refresh} onGroupSaved={onGroupSaved} onMessage={() => onMessage(selected)} advancedOpen={editing} onAdvancedChange={setEditing} onOpenAgent={id => onSelect({ kind: 'agent', id })} onConversation={onConversation} />
}

/*
 * [INPUT]: 员工/群聊快照、独立选中项、会话导航、现有配置编辑器与统一 UI 组件。
 * [OUTPUT]: 带统一员工头像的分组搜索通讯录、资料和配置详情、受未保存保护的编辑及发消息入口。
 * [POS]: 通讯录页面；浏览资料不创建会话、不挂载聊天内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useState, type ReactNode } from 'react'
import { cn } from 'cn'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Avatar, GuardContext } from '@/components/common'
import { EmployeeDetail } from '@/components/employee'
import { GroupEditor } from '@/components/employee/editors'
import { ArrowLeft, ChevronRight, Contact, MessageCircle, Search, Settings, Users } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'

export type ContactSelection = { kind: 'agent' | 'group'; id: string }
interface ContactsPageProps {
  api: DesktopApi
  snapshot: Snapshot
  selected: ContactSelection | null
  onSelect: (selection: ContactSelection) => void
  onMessage: (selection: ContactSelection) => void
  refresh: () => Promise<void>
  sidebarShown: boolean
  divider: ReactNode
  generation: number
  busy: boolean
}

export function ContactsPage({ api, snapshot, selected, onSelect, onMessage, refresh, sidebarShown, divider, generation, busy }: ContactsPageProps) {
  const [query, setQuery] = useState('')
  const [groupsOpen, setGroupsOpen] = useState(true), [contactsOpen, setContactsOpen] = useState(true)
  const guard = useContext(GuardContext)
  const search = query.trim().toLocaleLowerCase()
  const groups = snapshot.conversations.filter(item => item.kind === 'group' && item.title.toLocaleLowerCase().includes(search))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  const contacts = snapshot.agents.filter(agent => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const select = (next: ContactSelection) => {
    if (next.kind !== selected?.kind || next.id !== selected.id) guard.navigate(() => onSelect(next))
  }
  const row = (item: ContactSelection, name: string, description: string, avatar: ReactNode) => <Button
    variant="ghost" size="content" key={item.id} className={cn('conversation-item', { selected: selected?.kind === item.kind && selected.id === item.id })}
    aria-label={name} aria-current={selected?.kind === item.kind && selected.id === item.id ? 'true' : undefined} onClick={() => select(item)}
  >{avatar}<span className="conversation-copy"><span className="conversation-title">{name}</span><span className="conversation-preview">{description}</span></span></Button>
  return <div className="contacts-page">
    {sidebarShown && <><aside className="contacts-list" aria-label="通讯录列表">
      <div className="list-heading"><h2>通讯录</h2></div>
      <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索通讯录" placeholder="搜索联系人或群聊" value={query} onChange={event => { setQuery(event.target.value); if (event.target.value.trim()) { setGroupsOpen(true); setContactsOpen(true) } }} /></InputGroup>
      <div className="contacts-sections">
        <Collapsible open={groupsOpen} onOpenChange={setGroupsOpen}>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="contacts-section-heading" />}><ChevronRight /><span>群聊</span><span className="contacts-count">{groups.length}</span></CollapsibleTrigger>
          <CollapsibleContent><div role="group" aria-label="群聊">{groups.map(group => row({ kind: 'group', id: group.id }, group.title, `${group.agentIds.length} 位数字员工`, <span className="group-avatar"><Users /></span>))}{!groups.length && <p className="contacts-list-empty">{search ? '没有匹配的群聊' : '暂无群聊'}</p>}</div></CollapsibleContent>
        </Collapsible>
        <Collapsible open={contactsOpen} onOpenChange={setContactsOpen}>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="contacts-section-heading" />}><ChevronRight /><span>联系人</span><span className="contacts-count">{contacts.length}</span></CollapsibleTrigger>
          <CollapsibleContent><div role="group" aria-label="联系人">{contacts.map(agent => row({ kind: 'agent', id: agent.id }, agent.name, agent.active ? agent.role || '数字员工' : '已停用', <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />))}{!contacts.length && <p className="contacts-list-empty">{search ? '没有匹配的联系人' : '暂无联系人'}</p>}</div></CollapsibleContent>
        </Collapsible>
      </div>
    </aside>{divider}</>}
    <section className="contacts-detail" aria-label="通讯录详情">
      <ContactDetail key={`${generation}-${selected?.kind}-${selected?.id}`} api={api} snapshot={snapshot} selected={selected} refresh={refresh} onSelect={select} onMessage={onMessage} busy={busy} />
    </section>
  </div>
}

function ContactDetail({ api, snapshot, selected, refresh, onSelect, onMessage, busy }: Pick<ContactsPageProps, 'api' | 'snapshot' | 'selected' | 'refresh' | 'onSelect' | 'onMessage' | 'busy'>) {
  const [editing, setEditing] = useState(false)
  const guard = useContext(GuardContext)
  const agent = selected?.kind === 'agent' ? snapshot.agents.find(item => item.id === selected.id) : undefined
  const group = selected?.kind === 'group' ? snapshot.conversations.find(item => item.id === selected.id && item.kind === 'group') : undefined
  if (!selected || (!agent && !group)) return <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><Contact /></EmptyMedia><EmptyTitle>通讯录</EmptyTitle><EmptyDescription>选择联系人或群聊，查看资料与配置。</EmptyDescription></EmptyHeader></Empty>
  const name = agent?.name ?? group!.title
  const resources = (ids: string[]) => ids.map(id => snapshot.resources.find(resource => resource.id === id)?.name ?? '资料已移除').join('、') || '未绑定'
  const members = group?.agentIds.map(id => snapshot.agents.find(item => item.id === id)).filter((item): item is DigitalAgent => Boolean(item)) ?? []
  const connection = snapshot.connections.find(item => item.id === agent?.connectionId)
  const external = agent?.executionBackend?.kind === 'acp-local'
  return <div className="contact-document">
    {editing ? <>
      <div className="contact-edit-heading"><Button variant="ghost" size="sm" onClick={() => guard.navigate(() => setEditing(false))}><ArrowLeft />返回资料</Button><Button size="sm" disabled={busy} onClick={() => onMessage(selected)}><MessageCircle />发消息</Button></div>
      <div className="contact-editor">{agent ? <EmployeeDetail api={api} snapshot={snapshot} agent={agent} refresh={refresh} onClose={() => setEditing(false)} /> : <GroupEditor api={api} snapshot={snapshot} conversation={group!} onSaved={refresh} onClose={() => setEditing(false)} />}</div>
    </> : <>
      <header className="contact-profile-heading">
        {agent ? <Avatar name={name} seed={agent.id} avatar={agent.avatar} color={agent.color} /> : <span className="group-avatar"><Users size={24} /></span>}
        <div className="contact-profile-identity"><h1>{name}</h1><p>{agent ? agent.role || '数字员工' : `${group!.agentIds.length} 位数字员工`}</p><Badge variant="secondary">{agent ? agent.active ? '已启用' : '已停用' : '群聊'}</Badge></div>
      </header>
      <Separator />
      {agent ? <dl className="contact-facts">
        <div><dt>模型</dt><dd>{external ? '由外部 Agent 管理' : connection ? agent.modelId || connection.defaultModel || '尚未选择模型' : '尚未配置模型连接'}</dd></div>
        {!external && <><div><dt>命令权限</dt><dd>{agent.allowCommands ? '每次运行前请求批准' : '禁止运行命令'}</dd></div><div><dt>技能</dt><dd>{resources(agent.skillIds)}</dd></div><div><dt>知识库</dt><dd>{resources(agent.knowledgeIds)}</dd></div></>}
        <div><dt>Prompt</dt><dd className="contact-prompt">{agent.instructions || '尚未填写'}</dd></div>
      </dl> : <div className="contact-group-info">
        <section aria-label="群成员"><h2>群成员</h2><div className="contact-members">{members.map(member => <Button key={member.id} variant="ghost" size="content" className="contact-member" aria-label={`查看 ${member.name} 的资料`} onClick={() => onSelect({ kind: 'agent', id: member.id })}><Avatar name={member.name} seed={member.id} avatar={member.avatar} color={member.color} /><span>{member.name}</span></Button>)}</div></section>
        <dl className="contact-facts"><div><dt>共享知识</dt><dd>{resources(group!.sharedKnowledgeIds)}</dd></div></dl>
      </div>}
      <Separator />
      <div className="contact-actions"><Button disabled={busy} onClick={() => onMessage(selected)}><MessageCircle />发消息</Button><Button variant="secondary" onClick={() => setEditing(true)}><Settings />编辑配置</Button></div>
    </>}
  </div>
}

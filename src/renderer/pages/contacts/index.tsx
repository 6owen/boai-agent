/*
 * [INPUT]: 员工/群聊快照、独立选中项、会话导航、现有配置编辑器与统一 UI 组件。
 * [OUTPUT]: 群资料人数仅以数字显示在群成员标题后；团队群资料与 roleplay 未支持规则提示；团队创建回调与旧员工/群聊入口共存； 左侧分类/排序/右键菜单委托 ContactList，资料和编辑导航共用未保存守卫；未选中时展示无标题且不可选中/拖拽的动物伙伴 SVG；复用会话置顶分组的无底色标题与悬停箭头；带共用添加入口、员工及群拼图头像的分组搜索通讯录、资料和配置详情、受未保存保护的编辑及发消息入口。 群头像网格编辑与成员跳转。
 * [POS]: 通讯录页面；浏览资料不创建会话、不挂载聊天内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useState, type ReactNode } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { GroupAvatar } from '@/components/common/group-avatar'
import { Avatar, GuardContext } from '@/components/common'
import { EmployeeDetail } from '@/components/employee'
import { GroupEditor } from '@/components/employee/editors'
import { ArrowLeft, MessageCircle, Settings } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { Separator } from '@/components/ui/separator'
import { ContactList, type ContactSelection } from './contact-list'

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
}

export function ContactsPage({ api, snapshot, selected, onSelect, onMessage, onCreate, onCreateTeam, refresh, sidebarShown, divider, generation, busy }: ContactsPageProps) {
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
    {sidebarShown && <><ContactList onCreateTeam={onCreateTeam} api={api} snapshot={snapshot} selected={selected} onSelect={select} onMessage={onMessage} onCreate={onCreate} busy={busy} />{divider}</>}
    <section className="contacts-detail" aria-label="通讯录详情">
      <ContactDetail key={selectionKey} api={api} snapshot={snapshot} selected={selected} refresh={refresh} onSelect={select} onMessage={onMessage} busy={busy} editing={detail.editing} onEditingChange={editing => setDetail({ key: selectionKey, editing })} />
    </section>
  </div>
}

function ContactDetail({ api, snapshot, selected, refresh, onSelect, onMessage, busy, editing, onEditingChange: setEditing }: Pick<ContactsPageProps, 'api' | 'snapshot' | 'selected' | 'refresh' | 'onSelect' | 'onMessage' | 'busy'> & { editing: boolean; onEditingChange(editing: boolean): void }) {
  const guard = useContext(GuardContext)
  const agent = selected?.kind === 'agent' ? snapshot.agents.find(item => item.id === selected.id) : undefined
  const group = selected?.kind === 'group' ? snapshot.conversations.find(item => item.id === selected.id && item.kind === 'group') : undefined
  if (!selected || (!agent && !group)) return <IllustratedEmpty kind="contacts" />
  const name = agent?.name ?? group!.title
  const resources = (ids: string[]) => ids.map(id => snapshot.resources.find(resource => resource.id === id)?.name ?? '资料已移除').join('、') || '未绑定'
  const members = group?.agentIds.map(id => snapshot.agents.find(item => item.id === id)).filter((item): item is DigitalAgent => Boolean(item)) ?? []
  const connection = snapshot.connections.find(item => item.id === agent?.connectionId)
  const external = agent?.executionBackend?.kind === 'acp-local'
  return <div className="contact-document">
    {editing ? <>
      <div className="contact-edit-heading"><Button variant="ghost" size="sm" onClick={() => guard.navigate(() => setEditing(false))}><ArrowLeft />返回资料</Button><Button size="sm" disabled={busy} onClick={() => onMessage(selected)}><MessageCircle />发消息</Button></div>
      <div className="contact-editor">{agent ? <EmployeeDetail api={api} snapshot={snapshot} agent={agent} refresh={refresh} onClose={() => setEditing(false)} /> : <GroupEditor api={api} snapshot={snapshot} conversation={group!} onOpenAgent={id => onSelect({ kind: 'agent', id })} onSaved={refresh} onClose={() => setEditing(false)} />}</div>
    </> : <>
      <header className="contact-profile-heading">
        {agent ? <Avatar name={name} seed={agent.id} avatar={agent.avatar} color={agent.color} /> : <GroupAvatar members={members} />}
        <div className="contact-profile-identity"><h1>{name}</h1>{agent && <p>{agent.role || '数字员工'}</p>}<Badge variant="secondary">{agent ? agent.active ? '已启用' : '已停用' : '群聊'}</Badge></div>
      </header>
      <Separator />
      {agent ? <dl className="contact-facts">
        <div><dt>模型</dt><dd>{external ? '由外部 Agent 管理' : connection ? agent.modelId || connection.defaultModel || '尚未选择模型' : '尚未配置模型连接'}</dd></div>
        {!external && <><div><dt>命令权限</dt><dd>{agent.allowCommands ? '每次运行前请求批准' : '禁止运行命令'}</dd></div><div><dt>技能</dt><dd>{resources(agent.skillIds)}</dd></div><div><dt>知识库</dt><dd>{resources(agent.knowledgeIds)}</dd></div></>}
        <div><dt>Prompt</dt><dd className="contact-prompt">{agent.instructions || '尚未填写'}</dd></div>
      </dl> : <div className="contact-group-info">
        <section aria-label="群成员"><h2>群成员 {group!.agentIds.length}</h2><div className="contact-members">{members.map(member => <Button key={member.id} variant="ghost" size="content" className="contact-member" aria-label={`查看 ${member.name} 的资料`} onClick={() => onSelect({ kind: 'agent', id: member.id })}><Avatar name={member.name} seed={member.id} avatar={member.avatar} color={member.color} /><span>{member.name}</span></Button>)}</div></section>
        <dl className="contact-facts">{group!.teamSetup && <><div><dt>团队目的</dt><dd>{group!.teamSetup.purpose}</dd></div><div><dt>协作建议</dt><dd>{group!.teamSetup.collaborationGuide || '未设置'}</dd></div>{group!.teamSetup.scenarioKind === 'roleplay' && <div><dt>角色互动</dt><dd>玩家群不包含正式游戏规则、隐藏身份或胜负裁定。</dd></div>}</>}<div><dt>共享知识</dt><dd>{resources(group!.sharedKnowledgeIds)}</dd></div></dl>
      </div>}
      <Separator />
      <div className="contact-actions"><Button disabled={busy} onClick={() => onMessage(selected)}><MessageCircle />发消息</Button><Button variant="secondary" onClick={() => setEditing(true)}><Settings />编辑配置</Button></div>
    </>}
  </div>
}

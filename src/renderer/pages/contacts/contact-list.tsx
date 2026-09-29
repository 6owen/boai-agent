/*
 * [INPUT]: 员工/群聊快照、独立通讯录偏好与资料/编辑/发消息回调。
 * [OUTPUT]: 分组搜索列表、员工分类管理与右键菜单；复用 DragList 的组内拖拽/键盘排序，不跨类型或分类。
 * [POS]: contacts 左侧列表；界面操作通过类型化 IPC 持久化，不修改会话顺序。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState, type ReactNode } from 'react'
import { cn } from 'cn'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { sortedContacts } from '@shared/domain/contact-list'
import type { DesktopApi } from '@shared/ipc'
import { Avatar, Banner } from '@/components/common'
import { AddContactMenu } from '@/components/common/add-contact-menu'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { GroupAvatar } from '@/components/common/group-avatar'
import { ChevronRight, Contact, FolderOpen, MessageCircle, Search, Settings } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ContactCategories } from './contact-categories'
import { useContactList } from './use-contact-list'

export type ContactSelection = { kind: 'agent' | 'group'; id: string }
interface Props {
  api: DesktopApi; snapshot: Snapshot; selected: ContactSelection | null; busy: boolean
  onSelect(selection: ContactSelection, editing?: boolean): void
  onMessage(selection: ContactSelection): void
  onCreate(kind: 'agent' | 'group'): void
}

export function ContactList({ api, snapshot, selected, busy, onSelect, onMessage, onCreate }: Props) {
  const [query, setQuery] = useState('')
  const [groupsOpen, setGroupsOpen] = useState(true), [contactsOpen, setContactsOpen] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const preferences = useContactList(api), value = preferences.value
  const disabled = busy || preferences.busy || !value
  const search = query.trim().toLocaleLowerCase()
  const groups = sortedContacts(snapshot.conversations.filter(item => item.kind === 'group'), value?.groupOrder ?? [], item => item.title).filter(item => item.title.toLocaleLowerCase().includes(search))
  const contacts = sortedContacts(snapshot.agents, value?.agentOrder ?? [], agent => agent.name).filter(agent => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(search))
  const row = (item: ContactSelection, name: string, description: string, avatar: ReactNode) => <DragListItem key={item.id} id={item.id} className="conversation-row">{({ dragging, dragProps }) => <ContextMenu>
    <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: selected?.kind === item.kind && selected.id === item.id, 'drag-list-dragging': dragging })} />}
      {...dragProps} aria-label={name} aria-current={selected?.kind === item.kind && selected.id === item.id ? 'true' : undefined}
      aria-description="可在组内拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。" onClick={() => { if (!dragging) onSelect(item) }}>
      {avatar}<span className="conversation-copy"><span className="conversation-title">{name}</span><span className="conversation-preview">{description}</span></span>
    </ContextMenuTrigger>
    <ContextMenuContent className="w-44"><ContextMenuGroup>
      <ContextMenuItem disabled={busy} onClick={() => onMessage(item)}><MessageCircle />发消息</ContextMenuItem>
      <ContextMenuItem onClick={() => onSelect(item)}><Contact />查看资料</ContextMenuItem>
      <ContextMenuItem onClick={() => onSelect(item, true)}><Settings />编辑配置</ContextMenuItem>
    </ContextMenuGroup>
      {item.kind === 'agent' && <><ContextMenuSeparator /><ContextMenuSub>
        <ContextMenuSubTrigger disabled={disabled}><FolderOpen />移到分类</ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-w-64 min-w-40"><ContextMenuRadioGroup value={value?.categoryByAgentId[item.id] ?? ''} onValueChange={categoryId => { void preferences.change({ kind: 'assign-category', agentId: item.id, categoryId: categoryId || undefined }) }}>
          <ContextMenuRadioItem value="" disabled={disabled}>未分类</ContextMenuRadioItem>
          {value?.categories.map(category => <ContextMenuRadioItem key={category.id} value={category.id} disabled={disabled}><span className="truncate">{category.name}</span></ContextMenuRadioItem>)}
        </ContextMenuRadioGroup></ContextMenuSubContent>
      </ContextMenuSub></>}
    </ContextMenuContent>
  </ContextMenu>}</DragListItem>
  const renderAgents = (agents: DigitalAgent[]) => <DragList ids={agents.map(agent => agent.id)} disabled={disabled} onMove={move => { void preferences.change({ ...move, kind: 'move', itemKind: 'agent' }) }}>
    {agents.map(agent => row({ kind: 'agent', id: agent.id }, agent.name, agent.active ? agent.role || '数字员工' : '已停用', <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />))}
  </DragList>
  return <aside className="contacts-list" aria-label="通讯录列表">
    <div className="list-heading"><h2>通讯录</h2><div className="list-heading-actions"><ContactCategories value={value} agentIds={snapshot.agents.map(agent => agent.id)} change={preferences.change} busy={disabled} /><AddContactMenu onCreate={onCreate} /></div></div>
    <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索通讯录" placeholder="搜索联系人或群聊" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
    {preferences.error && <Banner>{preferences.error}</Banner>}
    <div className="contacts-sections">
      <Collapsible open={Boolean(search) || groupsOpen} onOpenChange={setGroupsOpen}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading" />}><span>群聊</span><ChevronRight /><span className="contacts-count">{groups.length}</span></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="群聊"><DragList ids={groups.map(group => group.id)} disabled={disabled} onMove={move => { void preferences.change({ ...move, kind: 'move', itemKind: 'group' }) }}>
          {groups.map(group => row({ kind: 'group', id: group.id }, group.title, `${group.agentIds.length} 位数字员工`, <GroupAvatar members={group.agentIds.map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))} />))}
        </DragList>{!groups.length && <p className="contacts-list-empty">{search ? '没有匹配的群聊' : '暂无群聊'}</p>}</div></CollapsibleContent>
      </Collapsible>
      <Collapsible open={Boolean(search) || contactsOpen} onOpenChange={setContactsOpen}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading" />}><span>联系人</span><ChevronRight /><span className="contacts-count">{contacts.length}</span></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="联系人">
          {value?.categories.length ? [...value.categories, { id: '', name: '未分类' }].map(category => {
            const agents = contacts.filter(agent => (value.categoryByAgentId[agent.id] ?? '') === category.id)
            if (search && !agents.length) return null
            return <Collapsible key={category.id} open={Boolean(search) || !collapsed[category.id]} onOpenChange={open => setCollapsed(previous => ({ ...previous, [category.id]: !open }))}>
              <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading contacts-category-heading" />}><span className="truncate">{category.name}</span><ChevronRight /><span className="contacts-count">{agents.length}</span></CollapsibleTrigger>
              <CollapsibleContent><div role="group" aria-label={`员工分类 ${category.name}`}>{renderAgents(agents)}{!agents.length && <p className="contacts-list-empty">暂无员工</p>}</div></CollapsibleContent>
            </Collapsible>
          }) : renderAgents(contacts)}
          {!contacts.length && (search || !value?.categories.length) && <p className="contacts-list-empty">{search ? '没有匹配的联系人' : '暂无联系人'}</p>}
        </div></CollapsibleContent>
      </Collapsible>
    </div>
  </aside>
}

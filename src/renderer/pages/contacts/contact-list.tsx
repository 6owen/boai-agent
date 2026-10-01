/*
 * [INPUT]: 员工/群聊快照、独立通讯录偏好与资料/编辑/发消息回调。
 * [OUTPUT]: 员工/群聊右键删除及分类标题重命名/解散/整类员工删除，完整影响确认和错误反馈；核心助手不参与分类/删除；保留加号团队入口、分类搜索/排序与本机折叠状态。
 * [POS]: contacts 左侧列表；界面操作通过类型化 IPC 持久化，不修改会话顺序。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from 'cn'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { isCoreAgent } from '@shared/domain/core-agent'
import { sortedContacts } from '@shared/domain/contact-list'
import type { DesktopApi } from '@shared/ipc'
import { Avatar, Banner, useMutation } from '@/components/common'
import { AddContactMenu } from '@/components/common/add-contact-menu'
import { DragList, DragListItem, DragListGroupTarget } from '@/components/common/drag-list'
import { GroupAvatar } from '@/components/common/group-avatar'
import { ChevronRight, Contact, FolderOpen, MessageCircle, Pencil, Search, Settings, Trash2 } from '@/components/icons'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ContactCategories, ContactCategoryDialog, type ContactCategoryOperation } from './contact-categories'
import { useContactList } from './use-contact-list'

const LIST_STATE_KEY = 'boai.contacts.list-state'
interface ContactListState { groupsOpen: boolean; contactsOpen: boolean; collapsed: Record<string, boolean> }
function readListState(): ContactListState {
  try {
    const value = JSON.parse(localStorage.getItem(LIST_STATE_KEY) ?? '{}')
    return {
      groupsOpen: typeof value?.groupsOpen === 'boolean' ? value.groupsOpen : true,
      contactsOpen: typeof value?.contactsOpen === 'boolean' ? value.contactsOpen : true,
      collapsed: value?.collapsed && typeof value.collapsed === 'object' && !Array.isArray(value.collapsed)
        ? Object.fromEntries(Object.entries(value.collapsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')) : {},
    }
  } catch { return { groupsOpen: true, contactsOpen: true, collapsed: {} } }
}

export type ContactSelection = { kind: 'agent' | 'group'; id: string }
interface Props {
  api: DesktopApi; snapshot: Snapshot; selected: ContactSelection | null; busy: boolean
  onSelect(selection: ContactSelection, editing?: boolean): void
  onMessage(selection: ContactSelection): void
  onCreateTeam(): void
  onCreate(kind: 'agent' | 'group'): void
  refresh(): Promise<void>
  onRemoved(agentIds: string[], groupIds: string[]): void
}

export function ContactList({ api, snapshot, selected, busy, onSelect, onMessage, onCreate, onCreateTeam, refresh, onRemoved }: Props) {
  const [query, setQuery] = useState('')
  const [listState, setListState] = useState(readListState)
  const [deleting, setDeleting] = useState<{ selection: ContactSelection; name: string } | null>(null)
  const [categoryOperation, setCategoryOperation] = useState<ContactCategoryOperation | null>(null)
  const mutation = useMutation()
  useEffect(() => { try { localStorage.setItem(LIST_STATE_KEY, JSON.stringify(listState)) } catch { /* Optional presentation preferences. */ } }, [listState])
  const preferences = useContactList(api), value = preferences.value
  const disabled = busy || preferences.busy || mutation.busy || !value
  const sortingDisabled = disabled || Boolean(deleting || categoryOperation)
  const search = query.trim().toLocaleLowerCase()
  const groups = sortedContacts(snapshot.conversations.filter(item => item.kind === 'group'), value?.groupOrder ?? [], item => item.title).filter(item => item.title.toLocaleLowerCase().includes(search))
  const ordinaryAgents = snapshot.agents.filter(agent => !isCoreAgent(agent))
  const assistants = snapshot.agents.filter(isCoreAgent).filter(agent => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(search))
  const contacts = sortedContacts(ordinaryAgents, value?.agentOrder ?? [], agent => agent.name).filter(agent => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(search))
  const categories = value?.categories.length ? [...value.categories, { id: '', name: '未分类' }].filter(category => !search || contacts.some(agent => (value.categoryByAgentId[agent.id] ?? '') === category.id)) : []
  const categoryDragIds = new Map(categories.filter(category => category.id).map(category => [`category:${category.id}`, category.id]))
  const removedGroups = (agentIds: string[]) => snapshot.conversations.filter(group => group.kind === 'group' && group.agentIds.length > 0 && group.agentIds.every(id => agentIds.includes(id))).map(group => group.id)
  const categoryAction = (kind: ContactCategoryOperation['kind'], category: { id: string; name: string }) => {
    mutation.setError('')
    if (value) setCategoryOperation({ kind, category, revision: value.revision, agentIds: ordinaryAgents.filter(agent => value.categoryByAgentId[agent.id] === category.id).map(agent => agent.id) })
  }
  const changeCategory = async (action: Parameters<typeof preferences.change>[0]) => {
    let saved = false
    await mutation.run(async () => {
      if (categoryOperation && categoryOperation.revision !== value?.revision) throw new Error('分类内容已变化，请关闭弹窗后重新确认。')
      saved = await preferences.change(action)
      if (saved && action.kind === 'delete-category-agents') {
        const agentIds = categoryOperation?.agentIds ?? []
        onRemoved(agentIds, removedGroups(agentIds))
        await refresh()
      }
    })
    return saved
  }
  const row = (item: ContactSelection, name: string, description: string, avatar: ReactNode) => <DragListItem key={item.id} id={item.id} className="conversation-row">{({ dragging, dragProps }) => <ContextMenu>
    <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: selected?.kind === item.kind && selected.id === item.id, 'drag-list-dragging': dragging })} />}
      {...dragProps} aria-label={name} aria-current={selected?.kind === item.kind && selected.id === item.id ? 'true' : undefined}
      aria-description={item.kind === 'agent' ? isCoreAgent(snapshot.agents.find(agent => agent.id === item.id)) ? '系统助手。右键查看资料、编辑配置或发消息。' : '拖到分类标题可切换分类；组内可拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。' : '可在组内拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。'} onClick={() => { if (!dragging) onSelect(item) }}>
      {avatar}<span className="conversation-copy"><span className="conversation-title">{name}</span><span className="conversation-preview">{description}</span></span>
    </ContextMenuTrigger>
    <ContextMenuContent className="w-44"><ContextMenuGroup>
      <ContextMenuItem disabled={busy} onClick={() => onMessage(item)}><MessageCircle />发消息</ContextMenuItem>
      <ContextMenuItem onClick={() => onSelect(item)}><Contact />查看资料</ContextMenuItem>
      <ContextMenuItem onClick={() => onSelect(item, true)}><Settings />编辑配置</ContextMenuItem>
    </ContextMenuGroup>
      {item.kind === 'agent' && !isCoreAgent(snapshot.agents.find(agent => agent.id === item.id)) && <><ContextMenuSeparator /><ContextMenuSub>
        <ContextMenuSubTrigger disabled={disabled}><FolderOpen />移到分类</ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-w-64 min-w-40"><ContextMenuRadioGroup value={value?.categoryByAgentId[item.id] ?? ''} onValueChange={categoryId => { void preferences.change({ kind: 'assign-category', agentId: item.id, categoryId: categoryId || undefined }) }}>
          <ContextMenuRadioItem value="" disabled={disabled}>未分类</ContextMenuRadioItem>
          {value?.categories.map(category => <ContextMenuRadioItem key={category.id} value={category.id} disabled={disabled}><span className="truncate">{category.name}</span></ContextMenuRadioItem>)}
        </ContextMenuRadioGroup></ContextMenuSubContent>
      </ContextMenuSub></>}
      {(item.kind === 'group' || !isCoreAgent(snapshot.agents.find(agent => agent.id === item.id))) && <><ContextMenuSeparator /><ContextMenuItem variant="destructive" disabled={disabled} onClick={() => { mutation.setError(''); setDeleting({ selection: item, name }) }}><Trash2 />{item.kind === 'group' ? '解散群聊' : '删除员工'}</ContextMenuItem></>}
    </ContextMenuContent>
  </ContextMenu>}</DragListItem>
  const renderAgents = (agents: DigitalAgent[]) => agents.map(agent => row({ kind: 'agent', id: agent.id }, agent.name, agent.role || '数字员工', <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />))
  return <aside className="contacts-list" aria-label="通讯录列表">
    <div className="list-heading"><h2>通讯录</h2><div className="list-heading-actions">
      <AddContactMenu onCreate={onCreate} onCreateTeam={onCreateTeam}><ContactCategories value={value} agentIds={ordinaryAgents.map(agent => agent.id)} change={preferences.change} busy={disabled} /></AddContactMenu>
    </div></div>
    <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索通讯录" placeholder="搜索联系人或群聊" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
    {preferences.error && <Banner>{preferences.error}</Banner>}
    {mutation.error && !deleting && !categoryOperation && <Banner>{mutation.error}</Banner>}
    <div className="contacts-sections">
      {assistants.length > 0 && <section aria-label="系统助手">
        <DragList ids={assistants.map(agent => agent.id)} disabled onMove={() => {}}>{renderAgents(assistants)}</DragList>
      </section>}
      <Collapsible open={Boolean(search) || listState.groupsOpen} onOpenChange={open => { if (!search) setListState(previous => ({ ...previous, groupsOpen: open })) }}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading" />}><span>群聊</span><ChevronRight /><span className="contacts-count">{groups.length}</span></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="群聊"><DragList ids={groups.map(group => group.id)} disabled={sortingDisabled} onMove={move => { void preferences.change({ ...move, kind: 'move', itemKind: 'group' }) }}>
          {groups.map(group => row({ kind: 'group', id: group.id }, group.title, `${group.agentIds.length} 位数字员工`, <GroupAvatar members={group.agentIds.map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))} />))}
        </DragList>{!groups.length && <p className="contacts-list-empty">{search ? '没有匹配的群聊' : '暂无群聊'}</p>}</div></CollapsibleContent>
      </Collapsible>
      <Collapsible open={Boolean(search) || listState.contactsOpen} onOpenChange={open => { if (!search) setListState(previous => ({ ...previous, contactsOpen: open })) }}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading" />}><span>联系人</span><ChevronRight /><span className="contacts-count">{contacts.length}</span></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="联系人">
          <DragList ids={[...categoryDragIds.keys(), ...contacts.map(agent => agent.id)]} disabled={sortingDisabled}
            canMove={(id, targetId) => categoryDragIds.has(id) || categoryDragIds.has(targetId)
              ? categoryDragIds.has(id) && categoryDragIds.has(targetId)
              : value?.categoryByAgentId[id] === value?.categoryByAgentId[targetId]}
            canGroupDrop={id => !categoryDragIds.has(id)}
            onMove={move => { void preferences.change(categoryDragIds.has(move.id)
              ? { kind: 'move-category', categoryId: categoryDragIds.get(move.id)!, targetId: categoryDragIds.get(move.targetId)!, placement: move.placement }
              : { ...move, kind: 'move', itemKind: 'agent' }) }}
            onGroupDrop={(agentId, categoryId) => {
              if ((value?.categoryByAgentId[agentId] ?? '') === categoryId) return
              void preferences.change({ kind: 'assign-category', agentId, categoryId: categoryId || undefined }).then(saved => {
                if (saved) setListState(previous => ({ ...previous, collapsed: { ...previous.collapsed, [categoryId]: false } }))
              })
            }}>
          {categories.length ? categories.map(category => {
            const agents = contacts.filter(agent => (value!.categoryByAgentId[agent.id] ?? '') === category.id)
            const heading = (dragging = false, dragProps: HTMLAttributes<HTMLElement> = {}) => {
              const content = <><span className="truncate">{category.name}</span><ChevronRight /><span className="contacts-count">{agents.length}</span></>
              const trigger = <CollapsibleTrigger {...dragProps} render={<Button variant="ghost" size="content" className={cn('conversation-section-heading contacts-section-heading contacts-category-heading', { 'drag-list-dragging': dragging })} />} />
              return <DragListGroupTarget id={category.id}>{category.id ? <ContextMenu>
                <ContextMenuTrigger render={trigger}>{content}</ContextMenuTrigger>
                <ContextMenuContent><ContextMenuGroup>
                  <ContextMenuItem disabled={disabled} onClick={() => categoryAction('rename', category)}><Pencil />重命名分类</ContextMenuItem>
                  <ContextMenuItem disabled={disabled} onClick={() => categoryAction('delete', category)}><FolderOpen />解散分类</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" disabled={disabled} onClick={() => categoryAction('delete-agents', category)}><Trash2 />删除分类及全部员工</ContextMenuItem>
                </ContextMenuGroup></ContextMenuContent>
              </ContextMenu> : <CollapsibleTrigger {...dragProps} render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading contacts-category-heading" />} >{content}</CollapsibleTrigger>}</DragListGroupTarget>
            }
            return <Collapsible key={category.id} open={Boolean(search) || !listState.collapsed[category.id]} onOpenChange={open => { if (!search) setListState(previous => ({ ...previous, collapsed: { ...previous.collapsed, [category.id]: !open } })) }}>
              {category.id ? <DragListItem id={`category:${category.id}`}>{({ dragging, dragProps }) => heading(dragging, dragProps)}</DragListItem> : heading()}
              <CollapsibleContent><div role="group" aria-label={`员工分类 ${category.name}`}>{renderAgents(agents)}</div></CollapsibleContent>
            </Collapsible>
          }) : renderAgents(contacts)}
          </DragList>
          {!contacts.length && (search || !value?.categories.length) && <p className="contacts-list-empty">{search ? '没有匹配的联系人' : '暂无联系人'}</p>}
        </div></CollapsibleContent>
      </Collapsible>
    </div>
    <ContactCategoryDialog target={categoryOperation} busy={busy || preferences.busy || mutation.busy} error={mutation.error || preferences.error} change={changeCategory} onClose={() => { mutation.setError(''); setCategoryOperation(null) }} />
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !mutation.busy) { mutation.setError(''); setDeleting(null) } }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{deleting?.selection.kind === 'group' ? '解散群聊' : '删除员工'}？</AlertDialogTitle><AlertDialogDescription>{deleting?.selection.kind === 'group'
          ? `将解散“${deleting.name}”，永久删除群聊记录、任务记录、会话记忆及专属文件，无法恢复。群成员保留在通讯录。`
          : `将删除“${deleting?.name}”，永久清空该员工的单聊记录、记忆和工作区，无法恢复。员工会从群聊中移除，有成员的群聊记录保留，空群自动解散。`}</AlertDialogDescription></AlertDialogHeader>
        {mutation.error && <Banner>{mutation.error}</Banner>}
        <AlertDialogFooter><Button variant="secondary" disabled={mutation.busy} onClick={() => { mutation.setError(''); setDeleting(null) }}>取消</Button><Button variant="destructive" disabled={disabled} onClick={() => {
          if (deleting) void mutation.run(async () => {
            const item = deleting.selection
            if (item.kind === 'agent') { await api.request('deleteAgent', { id: item.id }); onRemoved([item.id], removedGroups([item.id])) }
            else { await api.request('deleteConversation', { id: item.id }); onRemoved([], [item.id]) }
            await refresh(); await preferences.reload(); setDeleting(null)
          })
        }}>{mutation.busy ? '正在删除…' : deleting?.selection.kind === 'group' ? '解散群聊' : '删除员工'}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </aside>
}

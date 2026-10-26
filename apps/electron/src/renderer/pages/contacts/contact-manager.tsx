/*
 * [INPUT]: 员工快照、独立通讯录标签/顺序、宿主版本化保存和删除用例及资料导航。
 * [OUTPUT]: 紧凑通讯录管理双栏弹窗；默认收起权限/标签筛选，列表内常规按钮新建标签、搜索与表格多选；标签局部保存保留筛选/搜索/员工列表和按钮外观，写入及关闭仍串行锁定并冻结目标/版本；Motion 滑入标签/删除批量操作栏，已选人数仅数字使用主色，取消选择同用主色，量词和标签文字为普通颜色，紧凑只读名单与危险删除确认浮层；标签勾选保留选择，过滤后清空选择，删除冻结身份/版本且排除核心助手。
 * [POS]: contacts 的独立管理视图；Dialog 和标题搜索框显式覆盖默认宽度，尺寸复用 pages.css 的响应变量；Motion 退出时禁用操作与 Portal 浮层并尊重减少动态偏好，所有写入经现有 ContactList Hook，不复制员工配置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { DigitalAgent, Snapshot } from '@boai/shared/domain'
import { contactTagIds, sortedContacts, type ContactListAction } from '@boai/shared/domain/contact-list'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DesktopApi } from '@boai/shared/ipc'
import { Avatar, Banner, useMutation } from '@/components/common'
import { Check, ChevronRight, Contact, Pencil, Plus, Search, ShieldCheck, Trash2, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ContactSelection } from './contact-list'
import { ContactTagAssignment, ContactTagCreateRow, ContactTagDialog, type ContactTagTarget } from './contact-tags'
import type { useContactList } from './use-contact-list'

type Filter = { kind: 'all' } | { kind: 'tag'; id: string } | { kind: 'untagged' } | { kind: 'permission'; id: 'commands-off' | 'approval' | 'external' }
type Preferences = ReturnType<typeof useContactList>
interface Props {
  open: boolean; onOpenChange(open: boolean): void; api: DesktopApi; snapshot: Snapshot; busy: boolean; preferences: Preferences
  refresh(): Promise<void>; onRemoved(agentIds: string[], groupIds: string[]): void
  onSelect(selection: ContactSelection, editing?: boolean): void; onCreate(kind: 'agent' | 'group'): void
}
const permissionNames = { 'commands-off': '禁止运行命令', approval: '请求批准', external: '外部 Agent 管理' }
function permission(agent: DigitalAgent): keyof typeof permissionNames { return agent.executionBackend?.kind === 'acp-local' ? 'external' : agent.allowCommands ? 'approval' : 'commands-off' }

function ContactSelectionPanel({ reduceMotion, children }: { reduceMotion: boolean | null; children(present: boolean): ReactNode }) {
  const present = useIsPresent()
  return <motion.div className="contact-manager-selection-shell" inert={!present} initial={reduceMotion ? false : { height: 0, opacity: 0, y: 24 }} animate={{ height: 'auto', opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: reduceMotion ? 0 : 16 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}>{children(present)}</motion.div>
}

export function ContactManagerDialog(props: Props) {
  return props.open ? <ContactManager {...props} /> : null
}

function ContactManager({ snapshot, busy, preferences, refresh, onRemoved, onOpenChange }: Props) {
  const [filter, setFilter] = useState<Filter>({ kind: 'all' }), [query, setQuery] = useState(''), [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tagTarget, setTagTarget] = useState<ContactTagTarget | null>(null)
  const [creatingTag, setCreatingTag] = useState<number | null>(null)
  const [selectedListOpen, setSelectedListOpen] = useState(false)
  const [deleting, setDeleting] = useState<{ ids: string[]; names: string[]; revision: number } | null>(null)
  const [pendingAction, setPendingAction] = useState<ContactListAction['kind'] | null>(null)
  const reduceMotion = useReducedMotion()
  const mutation = useMutation(), value = preferences.value
  const disabled = busy || preferences.busy || mutation.busy || !value
  const browsingDisabled = busy || !value || (pendingAction !== 'set-agent-tags' && (preferences.busy || mutation.busy))
  const agents = sortedContacts(snapshot.agents.filter(agent => !isCoreAgent(agent)), value?.agentOrder ?? [], agent => agent.name)
  const tags = value?.categories ?? [], search = query.trim().toLocaleLowerCase()
  const activeFilter = filter.kind === 'tag' && !tags.some(tag => tag.id === filter.id) ? { kind: 'all' } as const : filter
  const title = activeFilter.kind === 'all' ? '通讯录管理' : activeFilter.kind === 'tag' ? tags.find(tag => tag.id === activeFilter.id)!.name : activeFilter.kind === 'untagged' ? '无标签' : permissionNames[activeFilter.id]
  const visible = agents.filter(agent => {
    const ids = contactTagIds(value, agent.id)
    const matchesFilter = activeFilter.kind === 'all' || activeFilter.kind === 'tag' && ids.includes(activeFilter.id) || activeFilter.kind === 'untagged' && !ids.length || activeFilter.kind === 'permission' && permission(agent) === activeFilter.id
    return matchesFilter && `${agent.name} ${agent.role} ${tags.filter(tag => ids.includes(tag.id)).map(tag => tag.name).join(' ')}`.toLocaleLowerCase().includes(search)
  })
  const selected = selectedIds.filter(id => visible.some(agent => agent.id === id))
  if (selected.length !== selectedIds.length) { setSelectedIds(selected); setDeleting(null); setSelectedListOpen(false) }
  if (activeFilter !== filter) { setFilter(activeFilter); setSelectedIds([]); setDeleting(null); setSelectedListOpen(false) }
  const clearSelection = () => { setSelectedIds([]); setDeleting(null); setSelectedListOpen(false) }
  const chooseFilter = (next: Filter) => { setFilter(next); clearSelection(); mutation.setError('') }
  const toggle = (id: string) => { setDeleting(null); setSelectedListOpen(false); setSelectedIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]) }
  const change = async (action: ContactListAction, revision?: number) => {
    let saved = false
    await mutation.run(async () => {
      setPendingAction(action.kind)
      try {
        if (!value || revision !== undefined && value.revision !== revision) throw new Error('通讯录已变化，请关闭操作面板后重新选择。')
        saved = await preferences.change(action)
        if (!saved) return
        if (action.kind === 'delete-agents') {
          const groups = snapshot.conversations.filter(group => group.kind === 'group' && group.agentIds.length && group.agentIds.every(id => action.agentIds.includes(id))).map(group => group.id)
          onRemoved(action.agentIds, groups)
          await refresh()
        }
        if (action.kind === 'delete-agents') clearSelection()
      } finally { setPendingAction(null) }
    })
    return saved
  }
  const startTag = (kind: ContactTagTarget['kind'], id = '', name = '') => { if (value) { mutation.setError(''); setTagTarget({ kind, id, name, revision: value.revision }) } }
  const nav = (label: string, count: number, next: Filter, active: boolean) => <Button variant="ghost" size="content" className="contact-manager-menu" aria-pressed={active} disabled={browsingDisabled} onClick={() => chooseFilter(next)}><span className="truncate">{label}</span><span className="contacts-count">{count}</span></Button>
  const close = () => { if (!disabled && !tagTarget && !deleting) onOpenChange(false) }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="contact-manager" data-tag-saving={pendingAction === 'set-agent-tags' || undefined} aria-label="通讯录管理" style={{ display: 'flex', gap: 0, width: 'var(--contact-manager-width)', maxWidth: 'none', height: 'var(--contact-manager-height)', padding: 0, overflow: 'hidden' }} showCloseButton={false}>
      <DialogDescription className="sr-only">筛选、搜索和批量管理联系人及标签。</DialogDescription>
      <aside className="contact-manager-sidebar" aria-label="通讯录管理筛选">
        <div className="contact-manager-sidebar-heading"><Contact /><span>通讯录</span></div>
        {nav('全部', agents.length, { kind: 'all' }, activeFilter.kind === 'all')}
        <p className="contact-manager-filter-label">筛选</p>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contact-manager-filter-heading" />}><ShieldCheck /><span>Agent 权限</span><ChevronRight /></CollapsibleTrigger>
          <CollapsibleContent><div className="contact-manager-submenu">
            {(Object.keys(permissionNames) as (keyof typeof permissionNames)[]).map(id => <div key={id}>{nav(permissionNames[id], agents.filter(agent => permission(agent) === id).length, { kind: 'permission', id }, activeFilter.kind === 'permission' && activeFilter.id === id)}</div>)}
            <Button variant="ghost" size="content" className="contact-manager-menu" data-unavailable disabled title="当前不支持完全访问"><span>完全访问</span><span className="contacts-count">暂不可用</span></Button>
          </div></CollapsibleContent>
        </Collapsible>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contact-manager-filter-heading" />}><i aria-hidden className="app-icon i-carbon-tag" /><span>标签</span><ChevronRight /></CollapsibleTrigger>
          <CollapsibleContent><div className="contact-manager-submenu">
            {nav('无标签', agents.filter(agent => !contactTagIds(value, agent.id).length).length, { kind: 'untagged' }, activeFilter.kind === 'untagged')}
            {tags.map(tag => <ContextMenu key={tag.id}><ContextMenuTrigger render={<Button variant="ghost" size="content" className="contact-manager-menu" aria-pressed={activeFilter.kind === 'tag' && activeFilter.id === tag.id} aria-label={`筛选标签 ${tag.name}`} disabled={browsingDisabled} onClick={() => chooseFilter({ kind: 'tag', id: tag.id })} />}><span className="truncate">{tag.name}</span><span className="contacts-count">{agents.filter(agent => contactTagIds(value, agent.id).includes(tag.id)).length}</span></ContextMenuTrigger>
              <ContextMenuContent><ContextMenuGroup><ContextMenuItem disabled={disabled} onClick={() => startTag('rename', tag.id, tag.name)}><Pencil />重命名标签</ContextMenuItem><ContextMenuItem variant="destructive" disabled={disabled} onClick={() => startTag('delete', tag.id, tag.name)}><Trash2 />删除标签</ContextMenuItem></ContextMenuGroup></ContextMenuContent>
            </ContextMenu>)}
            {creatingTag !== null ? <ContactTagCreateRow key={creatingTag} revision={creatingTag} busy={disabled} error={mutation.error || preferences.error} change={change} onClose={() => { mutation.setError(''); setCreatingTag(null) }} /> : <Button variant="secondary" size="sm" className="contact-manager-create-tag" disabled={disabled} onClick={() => { if (value) { mutation.setError(''); setCreatingTag(value.revision) } }}><Plus /><span>新建标签</span></Button>}
          </div></CollapsibleContent>
        </Collapsible>
      </aside>
      <section className="contact-manager-main">
        <header className="contact-manager-header"><DialogTitle>{title}</DialogTitle><InputGroup style={{ width: 'var(--contact-manager-search-width)', flex: 'var(--contact-manager-search-flex)' }}><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索管理通讯录" placeholder="搜索名称、角色或标签" value={query} disabled={browsingDisabled} onChange={event => { setQuery(event.target.value); clearSelection() }} /></InputGroup><Button variant="ghost" size="icon-sm" aria-label="关闭通讯录管理" disabled={disabled} onClick={close}><X /></Button></header>
        {(mutation.error || preferences.error) && !tagTarget && !deleting && creatingTag === null && <Banner>{mutation.error || preferences.error}</Banner>}
        <div className="contact-manager-table-scroll">
          <Table className="contact-manager-table"><TableHeader><TableRow><TableHead className="contact-manager-check"><Checkbox aria-label="全选当前结果" checked={Boolean(visible.length) && visible.every(agent => selected.includes(agent.id))} indeterminate={visible.some(agent => selected.includes(agent.id)) && !visible.every(agent => selected.includes(agent.id))} disabled={browsingDisabled || !visible.length} onCheckedChange={checked => { if (checked) setSelectedIds(visible.map(agent => agent.id)); else clearSelection() }} /></TableHead><TableHead>Agent</TableHead><TableHead>角色</TableHead><TableHead>标签</TableHead><TableHead>命令权限</TableHead></TableRow></TableHeader>
            <TableBody>{visible.map(agent => <TableRow key={agent.id} data-state={selected.includes(agent.id) ? 'selected' : undefined} tabIndex={browsingDisabled ? -1 : 0} aria-selected={selected.includes(agent.id)} onClick={() => { if (!browsingDisabled) toggle(agent.id) }} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); if (!browsingDisabled) toggle(agent.id) } }}>
              <TableCell className="contact-manager-check"><Checkbox aria-label={`选择 ${agent.name}`} checked={selected.includes(agent.id)} disabled={browsingDisabled} onClick={event => event.stopPropagation()} onCheckedChange={() => toggle(agent.id)} /></TableCell>
              <TableCell><div className="contact-manager-identity"><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span title={agent.name}>{agent.name}</span></div></TableCell>
              <TableCell className="contact-manager-role" title={agent.role}>{agent.role || '数字员工'}</TableCell>
              <TableCell><div className="contact-manager-tags">{tags.filter(tag => contactTagIds(value, agent.id).includes(tag.id)).map(tag => <span key={tag.id}>{tag.name}</span>)}</div></TableCell>
              <TableCell>{permissionNames[permission(agent)]}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {!visible.length && <div className="contact-manager-empty"><p>{query ? '没有匹配的联系人' : activeFilter.kind === 'tag' ? '当前标签暂无成员' : '暂无联系人'}</p></div>}
        </div>
        <AnimatePresence initial={false}>
          {selected.length > 0 && value && <ContactSelectionPanel key="selection" reduceMotion={reduceMotion}>{present => <footer className="contact-manager-selection" aria-label="批量操作"><div>
              <Popover open={present && selectedListOpen} onOpenChange={open => { if (present && !browsingDisabled) setSelectedListOpen(open) }}><PopoverTrigger render={<Button variant="ghost" size="sm" aria-label={`查看已选择的 ${selected.length} 人`} disabled={browsingDisabled || !present} />}><span>已选择 <span className="text-primary">{selected.length}</span> 人</span></PopoverTrigger>
                <PopoverContent side="top" align="start" className="contact-manager-selected-list w-[240px] p-2" aria-label="已选 Agent"><div role="list">{agents.filter(agent => selected.includes(agent.id)).map(agent => <div key={agent.id} role="listitem" className="contact-manager-selected-agent"><Check /><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span>{agent.name}</span></div>)}</div></PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" className="text-primary" disabled={browsingDisabled || !present} onClick={clearSelection}>取消选择</Button>
            </div><div className="contact-manager-selection-actions">
              <ContactTagAssignment key={selected.join(':')} value={value} agentIds={selected} busy={disabled} browsingDisabled={browsingDisabled} active={present} change={change} />
              <Popover open={present && Boolean(deleting)} onOpenChange={open => { if (present && !disabled) { mutation.setError(''); setDeleting(open ? { ids: [...selected], names: agents.filter(agent => selected.includes(agent.id)).map(agent => agent.name), revision: value.revision } : null) } }}>
                <PopoverTrigger render={<Button variant="destructive" disabled={disabled || !present} />}><Trash2 />删除</PopoverTrigger>
                <PopoverContent side="top" align="end" className="contact-manager-delete-confirm" aria-label="删除选中的 Agent">
                  <PopoverHeader><PopoverTitle>删除选中的 Agent？</PopoverTitle><PopoverDescription>将删除 {deleting?.ids.length ?? 0} 位 Agent（{deleting?.names.join('、')}），永久清空这些员工的单聊记录、记忆和工作区，无法恢复。员工从群聊中移除，其他成员及群聊记录保留，空群自动解散。</PopoverDescription></PopoverHeader>
                  {(mutation.error || preferences.error) && <Banner>{mutation.error || preferences.error}</Banner>}
                  <div className="contact-manager-confirm-actions"><Button variant="secondary" disabled={disabled || !present} onClick={() => { mutation.setError(''); setDeleting(null) }}>取消</Button><Button variant="destructive" disabled={disabled || !present} onClick={() => { if (present && !disabled && deleting) void change({ kind: 'delete-agents', agentIds: deleting.ids }, deleting.revision).then(saved => { if (saved) setDeleting(null) }) }}>{mutation.busy || preferences.busy ? '正在删除…' : '确认删除 Agent'}</Button></div>
                </PopoverContent>
              </Popover>
            </div></footer>}</ContactSelectionPanel>}
        </AnimatePresence>
      </section>
    </DialogContent>
    <ContactTagDialog target={tagTarget} busy={disabled} error={mutation.error || preferences.error} change={change} onClose={() => { mutation.setError(''); setTagTarget(null) }} />
  </Dialog>
}

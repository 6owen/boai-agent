/*
 * [INPUT]: 领域类型、IPC 事件、独立页面组件与桌面请求入口、统一 UI 基础组件。
 * [OUTPUT]: 窄图标导航、圆角分栏容器、页面与详情状态管理，以及统一菜单和未保存确认对话框。
 * [POS]: src/renderer/components/app-shell/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { flushAppearance } from '@/stores/appearance'
import { getDesktopClient } from '@/services/request/desktop-client'
import { DesktopToolbar } from './desktop-toolbar'
import { DetailPanel } from '../detail-panel'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react'
import { Library, Clock, Home, CircleHelp, MessageCircle, Plus, Settings } from '@/components/icons/index'
import type { AppEvent } from '@shared/ipc'
import type { ConversationDetail, DigitalAgent, Message, Snapshot } from '@shared/domain'
import { ActivityDetail } from '@/pages/conversations/-components/activity-detail'
import { ChatView } from '@/pages/conversations/-components/chat-view'
import { ConversationList } from '@/pages/conversations/-components/conversation-list'
import type { ChatDraft } from '@/pages/conversations/presentation'
import { AgentEditor, GroupEditor, templates } from '@/components/employee/editors'
import { EmployeeDetail } from '@/components/employee/index'
import { HelpPage } from '@/pages/help'
import { LibraryPage, ResourceDetail } from '@/pages/library'
import { ScheduleDetail, SchedulePage } from '@/pages/schedules'
import { SettingsPage } from '@/pages/settings'
import { Banner, errorText, GuardContext, Loading } from '@/components/common/index'

type Page = 'conversations' | 'schedules' | 'library' | 'settings' | 'help'
type Panel = { type: 'agent'; id: string } | { type: 'new-agent'; template?: number } | { type: 'group'; id?: string } | { type: 'activity'; id: string } | { type: 'resource'; id: string } | { type: 'schedule' }
interface Route { page: Page; conversationId: string | null }
const EMPTY: Snapshot = { agents: [], conversations: [], connections: [], resources: [], approvals: [], dataPath: '' }
const DEFAULT_LIST_WIDTH = 312
const EMPTY_DRAFT: ChatDraft = { text: '', mentionIds: [] }
const labels: Record<Page, string> = { conversations: '会话', schedules: '定时任务', library: '资料库', settings: '设置', help: '帮助' }
function pref(key: string, fallback: number) { try { return Number(localStorage.getItem(`boai.v2.${key}`)) || fallback } catch { return fallback } }
function initialRoute(): Route { try { const p = localStorage.getItem('boai.v2.page'); return { page: p && p in labels ? p as Page : 'conversations', conversationId: localStorage.getItem('boai.v2.conversation') || null } } catch { return { page: 'conversations', conversationId: null } } }

export function AppShell() {
  const api = getDesktopClient()
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY), [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [route, setRoute] = useState<Route>(initialRoute), [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), busyRef = useRef(false)
  const [dirty, setDirtyState] = useState(false), dirtyRef = useRef(false), pendingNavigation = useRef<(() => void) | null>(null)
  const [leaving, setLeaving] = useState(false), [panelGeneration, setPanelGeneration] = useState(0)
  const [listShown, setListShown] = useState(true), [listWidth, setListWidth] = useState(() => { const width = pref('listWidth', DEFAULT_LIST_WIDTH); return width === 272 ? DEFAULT_LIST_WIDTH : width }), [detailWidth, setDetailWidth] = useState(() => pref('detailWidth', 360))
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [search, setSearch] = useState('')
  const [, setDraftVersion] = useState(0), drafts = useRef(new Map<string, ChatDraft>()), scrollPositions = useRef(new Map<string, number>())
  const [previews, setPreviews] = useState<Record<string,string>>({})
  const [messageTimes, setMessageTimes] = useState<Record<string,string>>({})
  const [settingsSection,setSettingsSection]=useState<'connections'|'data'|'appearance'|'external'>('connections')
  const [menu, setMenu] = useState<'settings' | 'help' | null>(null)
  const detailHeader = useRef<HTMLElement | null>(null), detailTrigger = useRef<HTMLElement | null>(null)
  const history = useRef<Route[]>([route]), historyIndex = useRef(0)
  const mounted = useRef(true), selectedRef = useRef<string | null>(route.conversationId), snapshotRequest = useRef(0), detailRequest = useRef(0)
  const eventRevision = useRef(0), messageRevisions = useRef(new Map<string, number>()), incoming = useRef(new Map<string, Message>())
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panel = panels.at(-1), selectedId = route.conversationId
  const conversation = snapshot.conversations.find(c => c.id === selectedId)
  const currentDetail = detail?.conversation.id === selectedId ? detail : null
  const panelKey = panel ? `${panel.type}-${'id' in panel ? panel.id ?? '' : ''}` : ''
  useEffect(() => { if (panelKey) detailHeader.current?.focus(); else if (detailTrigger.current?.isConnected) detailTrigger.current.focus() }, [panelKey])
  const setDirty = useCallback((value: boolean) => { dirtyRef.current = value; setDirtyState(value) }, [])
  const navigate = useCallback((action: () => void) => { void flushAppearance(); if (dirtyRef.current) { pendingNavigation.current = action; setLeaving(true) } else action() }, [])
  const saved = useCallback((fallback?: () => void) => { setDirty(false); const next = pendingNavigation.current; pendingNavigation.current = null; setLeaving(false); if (next) next(); else fallback?.() }, [setDirty])
  const guard = useMemo(() => ({ dirty, setDirty, navigate, saved }), [dirty, setDirty, navigate, saved])
  const discard = () => { setDirty(false); const next = pendingNavigation.current; pendingNavigation.current = null; setLeaving(false); setPanelGeneration(v => v + 1); next?.() }

  const refreshSnapshot = useCallback(async () => {
    if (!api) return
    const token = ++snapshotRequest.current, result = await api.request('snapshot', undefined)
    if (mounted.current && token === snapshotRequest.current) { setSnapshot(result); setLoading(false) }
  }, [api])
  const refreshDetail = useCallback(async (id: string) => {
    if (!api) return
    const token = ++detailRequest.current, started = eventRevision.current, result = await api.request('getConversation', { id })
    if (!mounted.current || token !== detailRequest.current || selectedRef.current !== id) return
    const messages = new Map(result.messages.map(m => [m.id, m]))
    for (const m of incoming.current.values()) if (m.conversationId === id && (messageRevisions.current.get(m.id) ?? 0) > started) messages.set(m.id, m)
    const updated = { ...result, messages: [...messages.values()].sort((a,b) => a.sequence - b.sequence) }
    setDetail(updated); setDetailLoading(false)
    const last = updated.messages.at(-1)
    if (last) {
      setPreviews(previous => ({ ...previous, [id]: `${last.senderName}：${last.content.slice(0,90)}` }))
      setMessageTimes(previous => ({ ...previous, [id]: previous[id] && previous[id] > last.createdAt ? previous[id] : last.createdAt }))
    }
  }, [api])
  useEffect(() => {
    mounted.current = true
    if (!api) { setLoading(false); return }
    const report = (e: unknown) => { if (mounted.current) { setError(errorText(e)); setLoading(false); setDetailLoading(false) } }
    void refreshSnapshot().catch(report)
    const schedule = () => { if (refreshTimer.current) return; refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void refreshSnapshot().catch(report); if (selectedRef.current) void refreshDetail(selectedRef.current).catch(report) }, 100) }
    const unsubscribe = api.subscribe((event: AppEvent) => {
      if(event.type==='focus-conversation'){navigate(()=>{selectedRef.current=event.conversationId;setRoute({page:'conversations',conversationId:event.conversationId})});return}
      if (event.type === 'runtime-error') { setError(event.error); return }
      if (event.type === 'changed') { schedule(); return }
      if (event.type !== 'message') return
      setMessageTimes(previous => { const id = event.message.conversationId, time = event.message.createdAt; return previous[id] && previous[id] >= time ? previous : { ...previous, [id]: time } })
      incoming.current.set(event.message.id, event.message); messageRevisions.current.set(event.message.id, ++eventRevision.current)
      if (event.message.conversationId === selectedRef.current) setDetail(previous => { if (!previous || previous.conversation.id !== event.message.conversationId) return previous; const messages = new Map(previous.messages.map(m => [m.id,m])); messages.set(event.message.id, event.message); return { ...previous, messages: [...messages.values()].sort((a,b) => a.sequence - b.sequence) } })
      if (event.message.status !== 'streaming') { setPreviews(previous => ({ ...previous, [event.message.conversationId]: `${event.message.senderName}：${event.message.content.slice(0,90)}` })); schedule() }
    })
    return () => { mounted.current = false; unsubscribe(); if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = null }
  }, [api, refreshSnapshot, refreshDetail])
  useEffect(() => {
    selectedRef.current = selectedId
    if (!selectedId) { setDetail(null); setDetailLoading(false); return }
    setDetailLoading(true)
    void refreshDetail(selectedId).catch(e => { if (selectedRef.current === selectedId) { setError(errorText(e)); setDetailLoading(false) } })
  }, [selectedId, refreshDetail])
  useEffect(() => { const listener = () => setWindowWidth(window.innerWidth); window.addEventListener('resize', listener); return () => window.removeEventListener('resize', listener) }, [])
  useEffect(() => { try { localStorage.setItem('boai.v2.listWidth', String(listWidth)); localStorage.setItem('boai.v2.detailWidth', String(detailWidth)); localStorage.setItem('boai.v2.page', route.page); if (selectedId) localStorage.setItem('boai.v2.conversation', selectedId); else localStorage.removeItem('boai.v2.conversation') } catch { /* Preferences are optional. */ } }, [listWidth, detailWidth, route.page, selectedId])
  useEffect(() => { if (api) void api.request('setUnsavedChanges', { dirty }).catch(e => setError(errorText(e))) }, [api, dirty])
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !menu && !leaving && panel) navigate(() => setPanels([])) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [menu, panel, leaving, navigate])
  const action = async (fn: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { await fn() } catch (e) { if (mounted.current) setError(errorText(e)) } finally { busyRef.current = false; if (mounted.current) setBusy(false) } }
  const applyRoute = (next: Route, addHistory = true) => {
    if (addHistory && (next.page !== route.page || next.conversationId !== route.conversationId)) { history.current = history.current.slice(0, historyIndex.current + 1); history.current.push(next); historyIndex.current++ }
    if (next.conversationId !== selectedRef.current) { selectedRef.current = next.conversationId; detailRequest.current++; setDetail(null) }
    setRoute(next); setPanels([]); setError(''); setMenu(null)
  }
  const goPage = (page: Page) => navigate(() => applyRoute({ ...route, page }))
  const selectConversation = (id: string) => navigate(() => { applyRoute({ page: 'conversations', conversationId: id }); if (windowWidth < 900) setListShown(false) })
  const openPanel = (next: Panel, push = false) => { const trigger = document.activeElement as HTMLElement | null; navigate(() => { if (!panel) detailTrigger.current = trigger; setPanels(previous => push ? [...previous,next] : [next]); setMenu(null) }) }
  const closePanel = () => navigate(() => setPanels([]))
  const openAgent = (agent: DigitalAgent, push = false) => openPanel({ type: 'agent', id: agent.id }, push)
  const openDirect = (agent: DigitalAgent) => navigate(() => { if (!api) return; void action(async () => { const existing = snapshot.conversations.find(c => c.kind === 'direct' && c.agentIds[0] === agent.id); const result = existing ?? await api.request('createConversation', { kind: 'direct', title: agent.name, agentIds: [agent.id], mode: 'natural' }); await refreshSnapshot(); applyRoute({ page: 'conversations', conversationId: result.id }); if (windowWidth < 900) setListShown(false) }) })
  const draft = selectedId ? drafts.current.get(selectedId) ?? EMPTY_DRAFT : EMPTY_DRAFT
  const setDraft = (value: ChatDraft) => { if (selectedId) { drafts.current.set(selectedId, value); setDraftVersion(v => v+1) } }
  const send = (stopPrevious = false) => {
    if (!api || !selectedId || !draft.text.trim() || busyRef.current) return
    const id = selectedId, sent = { ...draft }, text = sent.text.trim()
    void action(async () => { const external=conversation?.kind==='direct'&&snapshot.agents.find(a=>a.id===conversation.agentIds[0])?.executionBackend?.kind==='acp-local'; if(external){if(stopPrevious)await api.request('cancelRun',{conversationId:id});await api.request('sendExternalTask',{conversationId:id,content:text,requestId:crypto.randomUUID()})}else await api.request('sendMessage', { conversationId: id, content: text, mentionIds: sent.mentionIds, requestId: crypto.randomUUID(), replyToMessageId: sent.replyId, stopPrevious }); const current = drafts.current.get(id); if (current?.text === sent.text && current.replyId === sent.replyId && JSON.stringify(current.mentionIds) === JSON.stringify(sent.mentionIds)) drafts.current.delete(id); setDraftVersion(v => v+1); if (selectedRef.current === id) await refreshDetail(id); await refreshSnapshot() })
  }
  const onOpenPath = (path: string) => { if (!api) return; void action(async () => { await api.request('openPath', { path }) }) }
  const title = route.page === 'conversations' ? conversation?.title ?? '会话' : labels[route.page]
  const panelTitle = panel?.type === 'agent' ? '数字员工' : panel?.type === 'new-agent' ? '新建员工' : panel?.type === 'group' ? panel.id ? '群聊详情' : '新建群聊' : panel?.type === 'activity' ? '任务与产物' : panel?.type === 'resource' ? '资源详情' : '任务详情'
  const effectiveList = listShown && !(panel && windowWidth < 1100)
  const detailMax = Math.max(300, Math.min(560, windowWidth - 56 - (effectiveList && route.page === 'conversations' ? listWidth : 0) - 444))
  const actualDetailWidth = Math.min(detailWidth, detailMax)
  const startResize = (kind: 'list' | 'detail', event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX, initial = kind === 'list' ? listWidth : detailWidth, target = event.currentTarget
    const move = (e: globalThis.PointerEvent) => { const delta = (e.clientX - startX) * (kind === 'detail' ? -1 : 1); if (kind === 'list') setListWidth(Math.max(232,Math.min(360,initial+delta))); else setDetailWidth(Math.max(300,Math.min(detailMax,initial+delta))) }
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end) }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end)
  }
  const resizeKey = (kind: 'list' | 'detail', event: KeyboardEvent<HTMLDivElement>) => { if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return; event.preventDefault(); if (event.key === 'Home') { kind === 'list' ? setListWidth(DEFAULT_LIST_WIDTH) : setDetailWidth(360); return }; const amount = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10); if (kind === 'list') setListWidth(v => Math.max(232,Math.min(360,v+amount))); else setDetailWidth(v => Math.max(300,Math.min(detailMax,v-amount))) }
  const toggleDetails = () => panel ? closePanel() : conversation && route.page === 'conversations' ? openPanel(conversation.kind === 'group' ? {type:'group',id:conversation.id} : {type:'agent',id:conversation.agentIds[0]!}) : route.page === 'schedules' ? openPanel({type:'schedule'}) : undefined
  const resizer = (kind: 'list' | 'detail') => <div className={`resize-handle ${kind}-resizer`} role="separator" tabIndex={0} aria-label={kind==='list'?'调整会话列表宽度':'调整详情宽度'} aria-orientation="vertical" aria-valuemin={kind==='list'?232:300} aria-valuemax={kind==='list'?360:detailMax} aria-valuenow={kind==='list'?listWidth:actualDetailWidth} onPointerDown={event=>startResize(kind,event)} onDoubleClick={()=>kind==='list'?setListWidth(DEFAULT_LIST_WIDTH):setDetailWidth(360)} onKeyDown={event=>resizeKey(kind,event)} />
  if (!api) return <div className="unavailable-page"><MessageCircle size={34}/><h1>请在桌面应用打开</h1><p>当前浏览器没有本地运行接口，无法访问员工、文件或模型。</p></div>
  return <GuardContext.Provider value={guard}><div className="app-shell">
    <DesktopToolbar title={title} showListToggle={route.page === 'conversations' || route.page === 'schedules'} listLabel={route.page === 'conversations' ? '显示或隐藏会话列表' : '显示或隐藏任务列表'} listShown={listShown} detailOpen={Boolean(panel)} canBack={historyIndex.current > 0} canForward={historyIndex.current < history.current.length - 1} detailDisabled={!panel && !(conversation && route.page === 'conversations')} onBack={() => navigate(() => { historyIndex.current--; applyRoute(history.current[historyIndex.current]!, false) })} onForward={() => navigate(() => { historyIndex.current++; applyRoute(history.current[historyIndex.current]!, false) })} onToggleList={() => { if (panel && windowWidth < 1100) navigate(() => { setPanels([]); setListShown(true) }); else setListShown(!listShown) }} onToggleDetails={toggleDetails} />
    <div className="app-body"><nav className="navigation-rail" aria-label="主导航"><div className="rail-top">{([{page:'conversations',icon:Home,label:'会话'},{page:'schedules',icon:Clock,label:'定时任务'},{page:'library',icon:Library,label:'资料库'}] as const).map(item=><Button variant="ghost" size="content" className={`rail-item${route.page===item.page?' selected':''}`} key={item.page} aria-label={item.label} title={item.label} aria-current={route.page===item.page?'page':undefined} onClick={()=>goPage(item.page)}><item.icon size={18}/>{item.page==='conversations'&&snapshot.approvals.length>0&&<i className="attention-dot"/>}</Button>)}</div><div className="rail-bottom">{(['help', 'settings'] as const).map(item => <DropdownMenu key={item} open={menu === item} onOpenChange={open => setMenu(open ? item : null)}>
      <DropdownMenuTrigger render={<Button variant={route.page === item ? 'secondary' : 'ghost'} size="icon-lg" className="rail-item" aria-label={item === 'settings' ? '设置' : '帮助'} title={item === 'settings' ? '设置' : '帮助'} />}>{item === 'settings' ? <Settings size={18} /> : <CircleHelp size={18} />}</DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-48"><DropdownMenuGroup><DropdownMenuLabel>{item === 'settings' ? '应用设置' : '帮助与说明'}</DropdownMenuLabel>
        {item === 'settings' && (['appearance', 'external'] as const).map(section => <DropdownMenuItem key={section} onClick={() => navigate(() => { setSettingsSection(section); applyRoute({ ...route, page: 'settings' }) })}>{section === 'appearance' ? '外观' : '外部 Agent'}</DropdownMenuItem>)}
        <DropdownMenuItem onClick={() => navigate(() => { if (item === 'settings') setSettingsSection('connections'); applyRoute({ ...route, page: item }) })}>{item === 'settings' ? '模型连接与数据备份' : '使用说明与关于'}</DropdownMenuItem>
      </DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>)}</div></nav>
    <div className={`content-frame${panel?' detail-open':''}${effectiveList?' list-open':''}`} style={{'--list-width':`${listWidth}px`,'--detail-width':`${actualDetailWidth}px`} as CSSProperties}>
      <div className="content-main">{error&&<Banner onClose={()=>setError('')}>{error}</Banner>}
      {route.page==='conversations'&&<div className="conversation-layout">{effectiveList&&<><aside className="conversation-list-container"><ConversationList snapshot={snapshot} selectedId={selectedId} query={search} onQuery={setSearch} previews={previews} messageTimes={messageTimes} drafts={drafts.current} onSelect={selectConversation} onAgent={openDirect} onEdit={openAgent} onCreate={kind=>openPanel(kind==='agent'?{type:'new-agent'}:{type:'group'})}/></aside>{resizer('list')}</>}
        <div className="conversation-stage">{currentDetail?<ChatView key={currentDetail.conversation.id} detail={currentDetail} snapshot={snapshot} draft={draft} setDraft={setDraft} busy={busy} onSend={send} onStop={()=>{if(selectedId)void action(async()=>{await api.request('cancelRun',{conversationId:selectedId});await refreshDetail(selectedId)})}} onDetails={()=>{if(conversation)openPanel(conversation.kind==='group'?{type:'group',id:conversation.id}:{type:'agent',id:conversation.agentIds[0]!})}} onEmployee={openAgent} onActivity={()=>{if(selectedId)openPanel({type:'activity',id:selectedId})}} onSettings={()=>goPage('settings')} onApprove={(id,approved)=>{void action(async()=>{await api.request('approve',{id,approved});await refreshSnapshot();if(selectedRef.current)await refreshDetail(selectedRef.current)})}} onOpenPath={onOpenPath} scrollPosition={scrollPositions.current.get(currentDetail.conversation.id)} onScrollPosition={position=>scrollPositions.current.set(currentDetail.conversation.id,position)}/>:loading||detailLoading?<Loading>正在载入工作空间…</Loading>:<div className="conversation-welcome"><MessageCircle size={38}/><h1>和你的数字同事一起工作</h1><p>创建员工，直接对话，或邀请他们组成一个群。</p><div className="button-row"><Button onClick={()=>openPanel({type:'new-agent'})}><Plus size={16}/>新建员工</Button><Button variant="secondary" onClick={()=>openPanel({type:'group'})}>创建群聊</Button></div><div className="starter-cards">{templates.map((template,index)=><Button variant="surface" size="content" key={template.name} onClick={()=>openPanel({type:'new-agent',template:index})}><template.icon size={22}/><strong>{template.name}</strong><small>{template.role}</small></Button>)}</div></div>}</div>
      </div>}
      {route.page==='library'&&<LibraryPage api={api} snapshot={snapshot} refresh={refreshSnapshot} onResource={resource=>openPanel({type:'resource',id:resource.id})} onAgent={agent=>openAgent(agent)}/>}
      {route.page==='schedules'&&<SchedulePage api={api} snapshot={snapshot} sidebarShown={effectiveList} onConversation={selectConversation} onInfo={()=>openPanel({type:'schedule'})}/>}
      {route.page==='settings'&&<SettingsPage key={`${panelGeneration}-${settingsSection}`} initialTab={settingsSection} api={api} snapshot={snapshot} refresh={refreshSnapshot}/>}
      {route.page==='help'&&<HelpPage/>}
      </div>
      {panel&&<>{resizer('detail')}<DetailPanel title={panelTitle} headerRef={detailHeader} nested={panels.length > 1} dirty={dirty} onBack={() => navigate(() => setPanels(previous => previous.slice(0, -1)))} onClose={closePanel}><div className="detail-content" key={`${panelGeneration}-${panel.type}-${'id' in panel?panel.id??'':''}-${panel.type==='new-agent'?panel.template:''}`}>
        {panel.type==='new-agent'&&<AgentEditor api={api} snapshot={snapshot} template={panel.template} onSaved={refreshSnapshot} onClose={()=>setPanels([])}/>}
        {panel.type==='agent'&&(snapshot.agents.find(a=>a.id===panel.id)?<EmployeeDetail api={api} snapshot={snapshot} agent={snapshot.agents.find(a=>a.id===panel.id)!} conversationId={selectedId??undefined} refresh={refreshSnapshot} onClose={()=>setPanels(previous=>previous.slice(0,-1))}/>:<p className="empty-note">该员工已不存在。</p>)}
        {panel.type==='group'&&<>{panel.id&&<div className="group-member-grid">{snapshot.conversations.find(c=>c.id===panel.id)?.agentIds.map(id=>snapshot.agents.find(a=>a.id===id)).filter((a):a is DigitalAgent=>Boolean(a)).map(agent=><Button variant="ghost" size="content" key={agent.id} onClick={()=>openAgent(agent,true)}><span style={{background:`${agent.color}18`,color:agent.color}}>{agent.name.slice(0,1)}</span><small>{agent.name}</small></Button>)}</div>}<GroupEditor api={api} snapshot={snapshot} conversation={snapshot.conversations.find(c=>c.id===panel.id)} onClose={()=>setPanels([])} onSaved={async result=>{await refreshSnapshot();if(selectedRef.current===result.id)await refreshDetail(result.id);else{selectedRef.current=result.id;setRoute({page:'conversations',conversationId:result.id});if(windowWidth<900)setListShown(false)}}}/></>}
        {panel.type==='activity'&&(currentDetail?.conversation.id===panel.id?<ActivityDetail detail={currentDetail} snapshot={snapshot} busy={busy} onOpenPath={onOpenPath} onRetry={id=>{void action(async()=>{await api.request('retryRun',{id,requestId:crypto.randomUUID()});if(selectedRef.current)await refreshDetail(selectedRef.current)})}}/>:<p className="empty-note">请先打开对应会话。</p>)}
        {panel.type==='resource'&&(snapshot.resources.find(r=>r.id===panel.id)?<ResourceDetail api={api} resource={snapshot.resources.find(r=>r.id===panel.id)!} snapshot={snapshot} refresh={refreshSnapshot} onRemoved={()=>setPanels([])} onAgent={agent=>openAgent(agent,true)}/>:<p className="empty-note">该资源已被移除。</p>)}
        {panel.type==='schedule'&&<ScheduleDetail/>}
      </div></DetailPanel></>}
      <AlertDialog open={leaving} onOpenChange={open => { setLeaving(open); if (!open) pendingNavigation.current = null }}>
        <AlertDialogContent className="sm:max-w-md"><AlertDialogHeader><AlertDialogTitle>有未保存的修改</AlertDialogTitle><AlertDialogDescription>保存或放弃修改后，再继续切换。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="secondary" onClick={discard}>放弃并继续</Button><Button onClick={() => {
            const form = document.querySelector<HTMLFormElement>('[data-edit-form]')
            setLeaving(false)
            if (!form?.checkValidity()) pendingNavigation.current = null
            requestAnimationFrame(() => form?.requestSubmit())
          }}>保存并继续</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div></div>
  </div></GuardContext.Provider>
}

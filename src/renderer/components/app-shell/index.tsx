import { flushAppearance } from '@/stores/appearance'
import { getDesktopClient } from '@/services/request/desktop-client'
import { DesktopToolbar } from './desktop-toolbar'
import { DetailPanel } from '../detail-panel'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CalendarClock, CircleHelp, MessageCircle, Plus, Settings } from '@/components/icons/index'
import type { AppEvent, ConversationDetail, DigitalAgent, Message, Snapshot } from '@shared/contracts'
import { ActivityDetail, ChatView, ConversationList, type ChatDraft } from '@/pages/conversations'
import { AgentEditor, GroupEditor, templates } from '@/components/employee/editors'
import { EmployeeDetail } from '@/components/employee/index'
import { HelpPage, LibraryPage, ResourceDetail, ScheduleDetail, SchedulePage } from '@/pages'
import { SettingsPage } from '@/pages/settings'
import { Banner, errorText, GuardContext, Loading } from '@/components/common/index'

type Page = 'conversations' | 'schedules' | 'library' | 'settings' | 'help'
type Panel = { type: 'agent'; id: string } | { type: 'new-agent'; template?: number } | { type: 'group'; id?: string } | { type: 'activity'; id: string } | { type: 'resource'; id: string } | { type: 'schedule' }
interface Route { page: Page; conversationId: string | null }
const EMPTY: Snapshot = { agents: [], conversations: [], connections: [], resources: [], approvals: [], dataPath: '' }
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
  const [listShown, setListShown] = useState(true), [listWidth, setListWidth] = useState(() => pref('listWidth', 272)), [detailWidth, setDetailWidth] = useState(() => pref('detailWidth', 360))
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [search, setSearch] = useState('')
  const [, setDraftVersion] = useState(0), drafts = useRef(new Map<string, ChatDraft>()), scrollPositions = useRef(new Map<string, number>())
  const [previews, setPreviews] = useState<Record<string,string>>({})
  const [messageTimes, setMessageTimes] = useState<Record<string,string>>({})
  const [settingsSection,setSettingsSection]=useState<'connections'|'data'|'appearance'|'external'>('connections')
  const [menu, setMenu] = useState<'settings' | 'help' | null>(null), menuRef = useRef<HTMLDivElement>(null)
  const menuTrigger = useRef<HTMLButtonElement | null>(null), detailHeader = useRef<HTMLElement | null>(null), detailTrigger = useRef<HTMLElement | null>(null)
  const history = useRef<Route[]>([route]), historyIndex = useRef(0)
  const mounted = useRef(true), selectedRef = useRef<string | null>(route.conversationId), snapshotRequest = useRef(0), detailRequest = useRef(0)
  const eventRevision = useRef(0), messageRevisions = useRef(new Map<string, number>()), incoming = useRef(new Map<string, Message>())
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panel = panels.at(-1), selectedId = route.conversationId
  const conversation = snapshot.conversations.find(c => c.id === selectedId)
  const currentDetail = detail?.conversation.id === selectedId ? detail : null
  const panelKey = panel ? `${panel.type}-${'id' in panel ? panel.id ?? '' : ''}` : ''
  useEffect(() => { if (panelKey) detailHeader.current?.focus(); else if (detailTrigger.current?.isConnected) detailTrigger.current.focus() }, [panelKey])
  useEffect(() => { if (menu) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus() }, [menu])
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
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { if (menu) { setMenu(null); menuTrigger.current?.focus() } else if (leaving) { pendingNavigation.current = null; setLeaving(false) } else if (panel) navigate(() => setPanels([])) } }
    const click = (event: MouseEvent) => { if (menu && !menuRef.current?.contains(event.target as Node)) setMenu(null) }
    document.addEventListener('keydown', key); document.addEventListener('mousedown', click)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click) }
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
  const detailMax = Math.max(300, Math.min(560, windowWidth - 64 - (effectiveList && route.page === 'conversations' ? listWidth : 0) - 444))
  const actualDetailWidth = Math.min(detailWidth, detailMax)
  const startResize = (kind: 'list' | 'detail', event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX, initial = kind === 'list' ? listWidth : detailWidth, target = event.currentTarget
    const move = (e: globalThis.PointerEvent) => { const delta = (e.clientX - startX) * (kind === 'detail' ? -1 : 1); if (kind === 'list') setListWidth(Math.max(232,Math.min(360,initial+delta))); else setDetailWidth(Math.max(300,Math.min(detailMax,initial+delta))) }
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end) }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end)
  }
  const resizeKey = (kind: 'list' | 'detail', event: KeyboardEvent<HTMLDivElement>) => { if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return; event.preventDefault(); if (event.key === 'Home') { kind === 'list' ? setListWidth(272) : setDetailWidth(360); return }; const amount = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10); if (kind === 'list') setListWidth(v => Math.max(232,Math.min(360,v+amount))); else setDetailWidth(v => Math.max(300,Math.min(detailMax,v-amount))) }
  const toggleDetails = () => panel ? closePanel() : conversation && route.page === 'conversations' ? openPanel(conversation.kind === 'group' ? {type:'group',id:conversation.id} : {type:'agent',id:conversation.agentIds[0]!}) : route.page === 'schedules' ? openPanel({type:'schedule'}) : undefined
  const resizer = (kind: 'list' | 'detail') => <div className={`resize-handle ${kind}-resizer`} role="separator" tabIndex={0} aria-label={kind==='list'?'调整会话列表宽度':'调整详情宽度'} aria-orientation="vertical" aria-valuemin={kind==='list'?232:300} aria-valuemax={kind==='list'?360:detailMax} aria-valuenow={kind==='list'?listWidth:actualDetailWidth} onPointerDown={event=>startResize(kind,event)} onDoubleClick={()=>kind==='list'?setListWidth(272):setDetailWidth(360)} onKeyDown={event=>resizeKey(kind,event)} />
  if (!api) return <div className="unavailable-page"><MessageCircle size={34}/><h1>请在桌面应用打开</h1><p>当前浏览器没有本地运行接口，无法访问员工、文件或模型。</p></div>
  return <GuardContext.Provider value={guard}><div className="app-shell">
    <DesktopToolbar title={title} showListToggle={route.page === 'conversations'} listShown={listShown} detailOpen={Boolean(panel)} canBack={historyIndex.current > 0} canForward={historyIndex.current < history.current.length - 1} detailDisabled={!panel && !(conversation && route.page === 'conversations') && route.page !== 'schedules'} onBack={() => navigate(() => { historyIndex.current--; applyRoute(history.current[historyIndex.current]!, false) })} onForward={() => navigate(() => { historyIndex.current++; applyRoute(history.current[historyIndex.current]!, false) })} onToggleList={() => { if (panel && windowWidth < 1100) navigate(() => { setPanels([]); setListShown(true) }); else setListShown(!listShown) }} onToggleDetails={toggleDetails} />
    <div className="app-body"><nav className="navigation-rail" aria-label="主导航"><div className="rail-top">{([{page:'conversations',icon:MessageCircle,label:'会话'},{page:'schedules',icon:CalendarClock,label:'定时任务'},{page:'library',icon:BookOpen,label:'资料库'}] as const).map(item=><button className={`rail-item${route.page===item.page?' selected':''}`} key={item.page} aria-label={item.label} title={item.label} aria-current={route.page===item.page?'page':undefined} onClick={()=>goPage(item.page)}><item.icon size={23}/><span>{item.label}</span>{item.page==='conversations'&&snapshot.approvals.length>0&&<i className="attention-dot"/>}</button>)}</div><div className="rail-bottom" ref={menuRef}><button className={`rail-item${route.page==='settings'?' selected':''}`} aria-label="设置" title="设置" aria-haspopup="menu" aria-expanded={menu==='settings'} onClick={event=>{menuTrigger.current=event.currentTarget;setMenu(menu==='settings'?null:'settings')}}><Settings size={22}/><span>设置</span></button><button className={`rail-item${route.page==='help'?' selected':''}`} aria-label="帮助" title="帮助" aria-haspopup="menu" aria-expanded={menu==='help'} onClick={event=>{menuTrigger.current=event.currentTarget;setMenu(menu==='help'?null:'help')}}><CircleHelp size={22}/><span>帮助</span></button>{menu&&<div className="rail-menu popover-menu" role="menu" onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));const index=items.indexOf(document.activeElement as HTMLButtonElement);items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}}}><strong>{menu==='settings'?'应用设置':'帮助与说明'}</strong>{menu==='settings'&&(['appearance','external']as const).map(section=><button key={section} role="menuitem" onClick={()=>navigate(()=>{setSettingsSection(section);applyRoute({...route,page:'settings'})})}>{section==='appearance'?'外观':'外部 Agent'}</button>)}<button role="menuitem" onClick={()=>goPage(menu==='settings'?'settings':'help')}>{menu==='settings'?'模型连接与数据备份':'使用说明与关于'}</button></div>}<span className="rail-version">0.2.2</span></div></nav>
    <div className={`content-frame${panel?' detail-open':''}${effectiveList?' list-open':''}`} style={{'--list-width':`${listWidth}px`,'--detail-width':`${actualDetailWidth}px`} as CSSProperties}>
      <div className="content-main">{error&&<Banner onClose={()=>setError('')}>{error}</Banner>}
      {route.page==='conversations'&&<div className="conversation-layout">{effectiveList&&<><aside className="conversation-list-container"><ConversationList snapshot={snapshot} selectedId={selectedId} query={search} onQuery={setSearch} previews={previews} messageTimes={messageTimes} drafts={drafts.current} onSelect={selectConversation} onAgent={openDirect} onEdit={openAgent} onCreate={kind=>openPanel(kind==='agent'?{type:'new-agent'}:{type:'group'})}/></aside>{resizer('list')}</>}
        <div className="conversation-stage">{currentDetail?<ChatView key={currentDetail.conversation.id} detail={currentDetail} snapshot={snapshot} draft={draft} setDraft={setDraft} busy={busy} onSend={send} onStop={()=>{if(selectedId)void action(async()=>{await api.request('cancelRun',{conversationId:selectedId});await refreshDetail(selectedId)})}} onDetails={()=>{if(conversation)openPanel(conversation.kind==='group'?{type:'group',id:conversation.id}:{type:'agent',id:conversation.agentIds[0]!})}} onEmployee={openAgent} onActivity={()=>{if(selectedId)openPanel({type:'activity',id:selectedId})}} onSettings={()=>goPage('settings')} onApprove={(id,approved)=>{void action(async()=>{await api.request('approve',{id,approved});await refreshSnapshot();if(selectedRef.current)await refreshDetail(selectedRef.current)})}} onOpenPath={onOpenPath} scrollPosition={scrollPositions.current.get(currentDetail.conversation.id)} onScrollPosition={position=>scrollPositions.current.set(currentDetail.conversation.id,position)}/>:loading||detailLoading?<Loading>正在载入工作空间…</Loading>:<div className="conversation-welcome"><MessageCircle size={38}/><h1>和你的数字同事一起工作</h1><p>创建员工，直接对话，或邀请他们组成一个群。</p><div className="button-row"><button className="button primary" onClick={()=>openPanel({type:'new-agent'})}><Plus size={16}/>新建员工</button><button className="button subtle" onClick={()=>openPanel({type:'group'})}>创建群聊</button></div><div className="starter-cards">{templates.map((template,index)=><button key={template.name} onClick={()=>openPanel({type:'new-agent',template:index})}><template.icon size={22}/><strong>{template.name}</strong><small>{template.role}</small></button>)}</div></div>}</div>
      </div>}
      {route.page==='library'&&<LibraryPage api={api} snapshot={snapshot} refresh={refreshSnapshot} onResource={resource=>openPanel({type:'resource',id:resource.id})} onAgent={agent=>openAgent(agent)}/>}
      {route.page==='schedules'&&<SchedulePage api={api} snapshot={snapshot} onConversation={selectConversation}/>}
      {route.page==='settings'&&<SettingsPage key={`${panelGeneration}-${settingsSection}`} initialTab={settingsSection} api={api} snapshot={snapshot} refresh={refreshSnapshot}/>}
      {route.page==='help'&&<HelpPage/>}
      </div>
      {panel&&<>{resizer('detail')}<DetailPanel title={panelTitle} headerRef={detailHeader} nested={panels.length > 1} dirty={dirty} onBack={() => navigate(() => setPanels(previous => previous.slice(0, -1)))} onClose={closePanel}><div className="detail-content" key={`${panelGeneration}-${panel.type}-${'id' in panel?panel.id??'':''}-${panel.type==='new-agent'?panel.template:''}`}>
        {panel.type==='new-agent'&&<AgentEditor api={api} snapshot={snapshot} template={panel.template} onSaved={refreshSnapshot} onClose={()=>setPanels([])}/>}
        {panel.type==='agent'&&(snapshot.agents.find(a=>a.id===panel.id)?<EmployeeDetail api={api} snapshot={snapshot} agent={snapshot.agents.find(a=>a.id===panel.id)!} conversationId={selectedId??undefined} refresh={refreshSnapshot} onClose={()=>setPanels(previous=>previous.slice(0,-1))}/>:<p className="empty-note">该员工已不存在。</p>)}
        {panel.type==='group'&&<>{panel.id&&<div className="group-member-grid">{snapshot.conversations.find(c=>c.id===panel.id)?.agentIds.map(id=>snapshot.agents.find(a=>a.id===id)).filter((a):a is DigitalAgent=>Boolean(a)).map(agent=><button key={agent.id} onClick={()=>openAgent(agent,true)}><span style={{background:`${agent.color}18`,color:agent.color}}>{agent.name.slice(0,1)}</span><small>{agent.name}</small></button>)}</div>}<GroupEditor api={api} snapshot={snapshot} conversation={snapshot.conversations.find(c=>c.id===panel.id)} onClose={()=>setPanels([])} onSaved={async result=>{await refreshSnapshot();if(selectedRef.current===result.id)await refreshDetail(result.id);else{selectedRef.current=result.id;setRoute({page:'conversations',conversationId:result.id});if(windowWidth<900)setListShown(false)}}}/></>}
        {panel.type==='activity'&&(currentDetail?.conversation.id===panel.id?<ActivityDetail detail={currentDetail} snapshot={snapshot} busy={busy} onOpenPath={onOpenPath} onRetry={id=>{void action(async()=>{await api.request('retryRun',{id,requestId:crypto.randomUUID()});if(selectedRef.current)await refreshDetail(selectedRef.current)})}}/>:<p className="empty-note">请先打开对应会话。</p>)}
        {panel.type==='resource'&&(snapshot.resources.find(r=>r.id===panel.id)?<ResourceDetail api={api} resource={snapshot.resources.find(r=>r.id===panel.id)!} snapshot={snapshot} refresh={refreshSnapshot} onRemoved={()=>setPanels([])} onAgent={agent=>openAgent(agent,true)}/>:<p className="empty-note">该资源已被移除。</p>)}
        {panel.type==='schedule'&&<ScheduleDetail/>}
      </div></DetailPanel></>}
      {leaving&&<div className="leave-confirm" role="alert"><div><strong>有未保存的修改</strong><p>保存或放弃修改后，再继续切换。</p></div><div className="button-row"><button className="button subtle small" onClick={()=>{pendingNavigation.current=null;setLeaving(false)}}>继续编辑</button><button className="button subtle small" onClick={discard}>放弃并继续</button><button className="button primary small" onClick={()=>document.querySelector<HTMLFormElement>('[data-edit-form]')?.requestSubmit()}>保存并继续</button></div></div>}
    </div></div>
  </div></GuardContext.Provider>
}

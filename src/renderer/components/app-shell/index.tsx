/*
 * [INPUT]: 领域类型、员工思考强度配置、IPC 事件、独立页面组件与桌面请求入口、统一 UI 基础组件。
 * [OUTPUT]: 回复旁图标打开固定消息/员工的执行过程标签；Carbon 导航、会话页按手动宽度和显式开关控制的分栏容器、保留草稿和独立会话上下文的顶栏多标签及下方配置、通讯录/会话路由、共用创建入口、列表排序/置顶/隐藏恢复、创建弹窗、头像配置保存、工作树停止及支持局部标签切换的退出编辑保护。 列表和标题下拉菜单共用置顶/清理能力、会话清理缓存及右侧窗口排序。
 * [POS]: src/renderer/components/app-shell/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { detailTabsReducer, emptyDetailTabs, type DetailTarget as Panel } from '../detail-panel/tabs-state'
import { DetailTabSession, type DetailTabHandle } from '../detail-panel/tab-session'
import { TraceTab } from '../detail-panel/trace-tab'
import { ActivityTab } from '../detail-panel/activity-tab'
import { getDesktopClient } from '@/services/request/desktop-client'
import { DesktopToolbar } from './desktop-toolbar'
import { DetailPanel, DetailPanelHeader } from '../detail-panel'
import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react'
import { Library, Clock, Home, Contact, CircleHelp, MessageCircle, Plus, Settings, Users, FileText, Terminal, Workflow } from '@/components/icons/index'
import { sortedConversations, type ConversationListChange } from '@shared/domain/conversation-list'
import type { AppEvent } from '@shared/ipc'
import type { ConversationDetail, DigitalAgent, Conversation, Message, Snapshot } from '@shared/domain'
import { ChatView } from '@/pages/conversations/-components/chat-view'
import type { ComposerAgentPatch } from '@/pages/conversations/-components/composer-toolbar'
import { ConversationList } from '@/pages/conversations/-components/conversation-list'
import type { ChatDraft } from '@/pages/conversations/presentation'
import { GroupEditor, templates } from '@/components/employee/editors'
import { CreateAgentDialog, CreateGroupDialog } from '@/components/employee/creation-dialogs'
import { EmployeeDetail } from '@/components/employee/index'
import { ContactsPage, type ContactSelection } from '@/pages/contacts'
import { HelpPage } from '@/pages/help'
import { LibraryPage, ResourceDetail } from '@/pages/library'
import { ScheduleDetail, SchedulePage } from '@/pages/schedules'
import { SettingsPage } from '@/pages/settings'
import { Avatar, Banner, errorText, GuardContext, Loading } from '@/components/common/index'

type Page = 'conversations' | 'contacts' | 'schedules' | 'library' | 'settings' | 'help'
type Creation = { type: 'agent'; template?: number } | { type: 'group' }
interface Route { page: Page; conversationId: string | null }
const EMPTY: Snapshot = { agents: [], conversations: [], connections: [], resources: [], approvals: [], dataPath: '' }
const DEFAULT_LIST_WIDTH = 312
const EMPTY_DRAFT: ChatDraft = { text: '', mentionIds: [] }
const labels: Record<Page, string> = { conversations: '会话', contacts: '通讯录', schedules: '定时任务', library: '资料库', settings: '设置', help: '帮助' }
function pref(key: string, fallback: number) { try { return Number(localStorage.getItem(`boai.v2.${key}`)) || fallback } catch { return fallback } }
function initialRoute(): Route { try { const p = localStorage.getItem('boai.v2.page'); return { page: p && p in labels ? p as Page : 'conversations', conversationId: localStorage.getItem('boai.v2.conversation') || null } } catch { return { page: 'conversations', conversationId: null } } }

export function AppShell() {
  const api = getDesktopClient()
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY), [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [route, setRoute] = useState<Route>(initialRoute)
  const [detailTabs, dispatchDetails] = useReducer(detailTabsReducer, emptyDetailTabs)
  const tabHandles = useRef(new Map<string, DetailTabHandle>())
  const [tabDirty, setTabDirty] = useState<Record<string, boolean>>({})
  const onTabDirty = useCallback((key: string, value: boolean) => setTabDirty(previous => {
    if (Boolean(previous[key]) === value) return previous
    const next = { ...previous }; if (value) next[key] = true; else delete next[key]; return next
  }), [])
  const [contactSelection, setContactSelection] = useState<ContactSelection | null>(null)
  const [creation, setCreation] = useState<Creation | null>(null)
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), busyRef = useRef(false)
  const [panelGeneration, setPanelGeneration] = useState(0)
  const { guard, dirty, dirtyRef, navigate, saved, leaving, confirmation } = useEditorGuard({
    reset: () => setPanelGeneration(value => value + 1),
    getForm: () => document.querySelector('[data-edit-form]:not(.detail-panel [data-edit-form])'),
  })
  const anyDirty = dirty || Object.values(tabDirty).some(Boolean)
  const [listShown, setListShown] = useState(true), [listWidth, setListWidth] = useState(() => { const width = pref('listWidth', DEFAULT_LIST_WIDTH); return width === 272 ? DEFAULT_LIST_WIDTH : width }), [detailWidth, setDetailWidth] = useState(() => pref('detailWidth', 360))
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [search, setSearch] = useState('')
  const [, setDraftVersion] = useState(0), drafts = useRef(new Map<string, ChatDraft>()), scrollPositions = useRef(new Map<string, number>())
  const [previews, setPreviews] = useState<Record<string,string>>({})
  const [messageTimes, setMessageTimes] = useState<Record<string,string>>({})
  const [settingsSection,setSettingsSection]=useState<'connections'|'data'|'appearance'|'external'>('connections')
  const [menu, setMenu] = useState<'settings' | 'help' | null>(null)
  const detailTrigger = useRef<HTMLElement | null>(null)
  const history = useRef<Route[]>([route]), historyIndex = useRef(0)
  const mounted = useRef(true), selectedRef = useRef<string | null>(route.conversationId), snapshotRequest = useRef(0), detailRequest = useRef(0)
  const eventRevision = useRef(0), messageRevisions = useRef(new Map<string, number>()), incoming = useRef(new Map<string, Message>())
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTab = detailTabs.tabs.find(tab => tab.key === detailTabs.activeKey)
  const panel = detailTabs.shown ? activeTab?.target : undefined, selectedId = route.conversationId
  const conversation = snapshot.conversations.find(c => c.id === selectedId)
  const currentDetail = detail?.conversation.id === selectedId ? detail : null
  useEffect(() => { if (!panel && detailTrigger.current?.isConnected) detailTrigger.current.focus() }, [Boolean(panel)])

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
      if (event.type === 'conversation:cleared') {
        const id = event.conversationId
        for (const [key, message] of incoming.current) if (message.conversationId === id) { incoming.current.delete(key); messageRevisions.current.delete(key) }
        drafts.current.delete(id)
        setPreviews(previous => ({ ...previous, [id]: '' })); setMessageTimes(previous => ({ ...previous, [id]: '' }))
        if (selectedRef.current === id) { detailRequest.current++; setDetail(null); setDetailLoading(true) }
        schedule(); return
      }
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
  useEffect(() => { if (api) void api.request('setUnsavedChanges', { dirty: anyDirty }).catch(e => setError(errorText(e))) }, [api, anyDirty])
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !menu && !leaving && !creation && panel && !document.querySelector('[role=alertdialog]')) tabHandles.current.get(detailTabs.activeKey!)?.close() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [menu, panel, leaving, creation, detailTabs.activeKey])
  const action = async (fn: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { await fn() } catch (e) { if (mounted.current) setError(errorText(e)) } finally { busyRef.current = false; if (mounted.current) setBusy(false) } }
  const applyRoute = (next: Route, addHistory = true) => {
    if (addHistory && (next.page !== route.page || next.conversationId !== route.conversationId)) { history.current = history.current.slice(0, historyIndex.current + 1); history.current.push(next); historyIndex.current++ }
    if (next.conversationId !== selectedRef.current) { selectedRef.current = next.conversationId; detailRequest.current++; setDetail(null) }
    setRoute(next); setCreation(null); setError(''); setMenu(null)
  }
  const goPage = (page: Page) => navigate(() => applyRoute({ ...route, page }))
  const selectConversation = (id: string, clearSearch = false) => navigate(() => {
    const open = () => { if (clearSearch) setSearch(''); applyRoute({ page: 'conversations', conversationId: id }) }
    if (!snapshot.conversations.find(item => item.id === id)?.list?.hidden) { open(); return }
    if (api) void action(async () => { await api.request('updateConversationList', { id, action: 'show' }); await refreshSnapshot(); open() })
  })
  const changeConversationList = (change: ConversationListChange) => {
    const update = () => { if (!api) return; void action(async () => {
      await api.request('updateConversationList', change)
      if (change.action === 'hide') {
        history.current = history.current.map(entry => entry.conversationId === change.id ? { ...entry, conversationId: null } : entry)
        if (selectedRef.current === change.id) {
          const next = sortedConversations(snapshot.conversations, messageTimes).find(item => item.id !== change.id)
          applyRoute({ ...route, conversationId: next?.id ?? null }, false)
        }
      }
      await refreshSnapshot()
    }) }
    if (change.action === 'hide') navigate(update); else update()
  }
  const clearConversationHistory = async (id: string, hide: boolean) => {
    if (!api) return
    await api.request('clearConversationHistory', { id, hide })
    for (const [key, message] of incoming.current) if (message.conversationId === id) { incoming.current.delete(key); messageRevisions.current.delete(key) }
    drafts.current.delete(id)
    setPreviews(previous => ({ ...previous, [id]: '' }))
    setMessageTimes(previous => ({ ...previous, [id]: '' }))
    if (hide) {
      history.current = history.current.map(entry => entry.conversationId === id ? { ...entry, conversationId: null } : entry)
      if (selectedRef.current === id) {
        const next = sortedConversations(snapshot.conversations, messageTimes).find(item => item.id !== id)
        applyRoute({ ...route, conversationId: next?.id ?? null }, false)
      }
    } else if (selectedRef.current === id) await refreshDetail(id)
    await refreshSnapshot()
  }
  const openPanel = (next: Panel) => {
    const trigger = document.activeElement as HTMLElement | null
    navigate(() => { if (!panel) detailTrigger.current = trigger; dispatchDetails({ type: 'open', target: next }); setMenu(null) })
  }
  const openCreation = (next: Creation) => navigate(() => { setCreation(next); setMenu(null) })
  const createdConversation = async (result: Conversation) => { await refreshSnapshot(); saved(() => { setSearch(''); applyRoute({ page: 'conversations', conversationId: result.id }) }) }
  const closeTab = (key: string) => dispatchDetails({ type: 'close', key })
  const requestCloseTab = (key: string) => {
    if (tabDirty[key]) dispatchDetails({ type: 'select', key })
    tabHandles.current.get(key)?.close()
  }
  const openAgent = (agent: DigitalAgent) => openPanel({ type: 'agent', id: agent.id, conversationId: selectedId ?? undefined })
  const openDirect = (agent: DigitalAgent) => navigate(() => { if (!api) return; void action(async () => { const existing = snapshot.conversations.find(c => c.kind === 'direct' && c.agentIds[0] === agent.id); const result = existing ?? await api.request('createConversation', { kind: 'direct', title: agent.name, agentIds: [agent.id], mode: 'natural' }); await api.request('updateConversationList', { id: result.id, action: 'show' }); await refreshSnapshot(); setSearch(''); applyRoute({ page: 'conversations', conversationId: result.id }) }) })
  const messageContact = (selection: ContactSelection) => {
    if (selection.kind === 'agent') { const agent = snapshot.agents.find(item => item.id === selection.id); if (agent) openDirect(agent) }
    else selectConversation(selection.id, true)
  }
  const draft = selectedId ? drafts.current.get(selectedId) ?? EMPTY_DRAFT : EMPTY_DRAFT
  const setDraft = (value: ChatDraft) => { if (selectedId) { drafts.current.set(selectedId, value); setDraftVersion(v => v+1) } }
  const send = (stopPrevious = false) => {
    if (!api || !selectedId || !draft.text.trim() || busyRef.current) return
    const id = selectedId, sent = { ...draft }, text = sent.text.trim()
    void action(async () => { const external=conversation?.kind==='direct'&&snapshot.agents.find(a=>a.id===conversation.agentIds[0])?.executionBackend?.kind==='acp-local'; if(external){if(stopPrevious)await api.request('cancelRun',{conversationId:id});await api.request('sendExternalTask',{conversationId:id,content:text,requestId:crypto.randomUUID()})}else await api.request('sendMessage', { conversationId: id, content: text, mentionIds: sent.mentionIds, requestId: crypto.randomUUID(), replyToMessageId: sent.replyId, stopPrevious }); const current = drafts.current.get(id); if (current?.text === sent.text && current.replyId === sent.replyId && JSON.stringify(current.mentionIds) === JSON.stringify(sent.mentionIds)) drafts.current.delete(id); setDraftVersion(v => v+1); if (selectedRef.current === id) await refreshDetail(id); await refreshSnapshot() })
  }
  const changeComposerAgent = (agent: DigitalAgent, patch: ComposerAgentPatch) => {
    if (!api || dirtyRef.current || Object.values(tabDirty).some(Boolean)) return
    void action(async () => {
      await api.request('saveAgent', {
        id: agent.id, expectedConfigVersion: agent.configVersion, executionBackend: agent.executionBackend,
        avatar: agent.avatar, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color,
        connectionId: agent.connectionId, modelId: agent.modelId, thinkingLevel: agent.thinkingLevel, skillIds: agent.skillIds,
        knowledgeIds: agent.knowledgeIds, allowCommands: agent.allowCommands, active: agent.active, ...patch,
      })
      await refreshSnapshot()
    })
  }
  const onOpenPath = (path: string) => { if (!api) return; void action(async () => { await api.request('openPath', { path }) }) }
  const title = route.page === 'conversations' ? conversation?.title ?? '会话' : labels[route.page]
  const describePanel = (item: Panel) => {
    const title = item.type === 'agent' ? '数字员工' : item.type === 'group' ? '群聊详情' : item.type === 'trace' ? '执行过程' : item.type === 'activity' ? '任务与产物' : item.type === 'resource' ? '资源详情' : '任务详情'
    const name = item.type === 'trace' ? `执行过程${item.agentId ? ` · ${snapshot.agents.find(a => a.id === item.agentId)?.name ?? '员工'}` : ''}` : item.type === 'agent' ? snapshot.agents.find(a => a.id === item.id)?.name : item.type === 'group' ? snapshot.conversations.find(c => c.id === item.id)?.title : item.type === 'resource' ? snapshot.resources.find(r => r.id === item.id)?.name : undefined
    const context = item.type === 'agent' ? snapshot.conversations.find(c => c.id === item.conversationId)?.title : (item.type === 'activity' || item.type === 'trace') ? snapshot.conversations.find(c => c.id === item.id)?.title : undefined
    const sameType = detailTabs.tabs.filter(tab => tab.target.type === item.type && (item.type !== 'agent' || (tab.target.type === 'agent' && tab.target.id === item.id))).length > 1
    const label = `${name ?? title}${sameType && context ? ` · ${context}` : ''}`
    const Icon = item.type === 'agent' ? Contact : item.type === 'group' ? Users : item.type === 'resource' ? FileText : item.type === 'trace' ? Workflow : item.type === 'activity' ? Terminal : Clock
    return { title, label, description: [title, name, context].filter(Boolean).join(' · '), icon: <Icon /> }
  }
  const panelTitle = panel ? describePanel(panel).title : '详情'
  const effectiveList = listShown
  const detailMax = route.page === 'conversations' ? 560 : Math.max(300, Math.min(560, windowWidth - 56 - 444))
  const actualDetailWidth = Math.min(detailWidth, detailMax)
  const startResize = (kind: 'list' | 'detail', event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX, initial = kind === 'list' ? listWidth : detailWidth, target = event.currentTarget
    const move = (e: globalThis.PointerEvent) => { const delta = (e.clientX - startX) * (kind === 'detail' ? -1 : 1); if (kind === 'list') setListWidth(Math.max(232,Math.min(360,initial+delta))); else setDetailWidth(Math.max(300,Math.min(detailMax,initial+delta))) }
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end) }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end)
  }
  const resizeKey = (kind: 'list' | 'detail', event: KeyboardEvent<HTMLDivElement>) => { if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return; event.preventDefault(); if (event.key === 'Home') { kind === 'list' ? setListWidth(DEFAULT_LIST_WIDTH) : setDetailWidth(360); return }; const amount = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10); if (kind === 'list') setListWidth(v => Math.max(232,Math.min(360,v+amount))); else setDetailWidth(v => Math.max(300,Math.min(detailMax,v-amount))) }
  const toggleDetails = () => {
    if (detailTabs.tabs.length) dispatchDetails({ type: 'visibility', shown: !detailTabs.shown })
    else if (conversation && route.page === 'conversations') openPanel(conversation.kind === 'group' ? { type: 'group', id: conversation.id } : { type: 'agent', id: conversation.agentIds[0]!, conversationId: conversation.id })
    else if (route.page === 'schedules') openPanel({ type: 'schedule' })
  }
  const resizer = (kind: 'list' | 'detail') => <div className={`resize-handle ${kind}-resizer`} role="separator" tabIndex={0} aria-label={kind==='list'?(route.page==='contacts'?'调整通讯录列表宽度':'调整会话列表宽度'):'调整详情宽度'} aria-orientation="vertical" aria-valuemin={kind==='list'?232:300} aria-valuemax={kind==='list'?360:detailMax} aria-valuenow={kind==='list'?listWidth:actualDetailWidth} onPointerDown={event=>startResize(kind,event)} onDoubleClick={()=>kind==='list'?setListWidth(DEFAULT_LIST_WIDTH):setDetailWidth(360)} onKeyDown={event=>resizeKey(kind,event)} />
  if (!api) return <div className="unavailable-page"><MessageCircle size={34}/><h1>请在桌面应用打开</h1><p>当前浏览器没有本地运行接口，无法访问员工、文件或模型。</p></div>
  return <GuardContext.Provider value={guard}><Tabs value={detailTabs.activeKey} onValueChange={value => { if (typeof value === 'string') dispatchDetails({ type: 'select', key: value }) }} className={`app-shell gap-0${effectiveList ? ' list-open' : ''}`} data-page={route.page} style={{'--list-width':`${listWidth}px`,'--detail-width':`${actualDetailWidth}px`} as CSSProperties}>
    <DesktopToolbar title={title} detailHeader={panel && <DetailPanelHeader tabs={detailTabs.tabs.map(tab => ({ key: tab.key, ...describePanel(tab.target), dirty: Boolean(tabDirty[tab.key]) }))} activeKey={detailTabs.activeKey} onClose={requestCloseTab} onMove={(key, targetKey, placement) => dispatchDetails({ type: 'move', key, targetKey, placement })} />} showListToggle={route.page === 'conversations' || route.page === 'contacts' || route.page === 'schedules'} listLabel={route.page === 'conversations' ? '显示或隐藏会话列表' : route.page === 'contacts' ? '显示或隐藏通讯录列表' : '显示或隐藏任务列表'} listShown={listShown} detailOpen={Boolean(panel)} canBack={historyIndex.current > 0} canForward={historyIndex.current < history.current.length - 1} detailDisabled={!detailTabs.tabs.length && !(conversation && route.page === 'conversations') && route.page !== 'schedules'} onBack={() => navigate(() => { historyIndex.current--; applyRoute(history.current[historyIndex.current]!, false) })} onForward={() => navigate(() => { historyIndex.current++; applyRoute(history.current[historyIndex.current]!, false) })} onToggleList={() => setListShown(shown => !shown)} onToggleDetails={toggleDetails} />
    <div className="app-body"><nav className="navigation-rail" aria-label="主导航"><div className="rail-top">{([{page:'conversations',icon:Home,label:'会话'},{page:'contacts',icon:Contact,label:'通讯录'},{page:'schedules',icon:Clock,label:'定时任务'},{page:'library',icon:Library,label:'资料库'}] as const).map(item=><Button variant="ghost" size="content" className={`rail-item${route.page===item.page?' selected':''}`} key={item.page} aria-label={item.label} title={item.label} aria-current={route.page===item.page?'page':undefined} onClick={()=>goPage(item.page)}><item.icon size={16}/>{item.page==='conversations'&&snapshot.approvals.length>0&&<i className="attention-dot"/>}</Button>)}</div><div className="rail-bottom">{(['help', 'settings'] as const).map(item => <DropdownMenu key={item} open={menu === item} onOpenChange={open => setMenu(open ? item : null)}>
      <DropdownMenuTrigger render={<Button variant={route.page === item ? 'secondary' : 'ghost'} size="icon-lg" className="rail-item" aria-label={item === 'settings' ? '设置' : '帮助'} title={item === 'settings' ? '设置' : '帮助'} />}>{item === 'settings' ? <Settings size={16} /> : <CircleHelp size={16} />}</DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-48"><DropdownMenuGroup><DropdownMenuLabel>{item === 'settings' ? '应用设置' : '帮助与说明'}</DropdownMenuLabel>
        {item === 'settings' && (['appearance', 'external'] as const).map(section => <DropdownMenuItem key={section} onClick={() => navigate(() => { setSettingsSection(section); applyRoute({ ...route, page: 'settings' }) })}>{section === 'appearance' ? '外观' : '外部 Agent'}</DropdownMenuItem>)}
        <DropdownMenuItem onClick={() => navigate(() => { if (item === 'settings') setSettingsSection('connections'); applyRoute({ ...route, page: item }) })}>{item === 'settings' ? '模型连接与数据备份' : '使用说明与关于'}</DropdownMenuItem>
      </DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>)}</div></nav>
    <div className={`content-frame${panel?' detail-open':''}${effectiveList?' list-open':''}`}>
      <div className="content-main">{error&&<Banner onClose={()=>setError('')}>{error}</Banner>}
      {route.page==='conversations'&&<div className="conversation-layout">{effectiveList&&<><aside className="conversation-list-container"><ConversationList snapshot={snapshot} selectedId={selectedId} query={search} onQuery={setSearch} previews={previews} messageTimes={messageTimes} drafts={drafts.current} onSelect={selectConversation} onChange={changeConversationList} onClear={clearConversationHistory} busy={busy} onCreate={type=>openCreation({type})}/></aside>{resizer('list')}</>}
        <div className="conversation-stage">{currentDetail?<ChatView key={currentDetail.conversation.id} detail={currentDetail} snapshot={snapshot} draft={draft} setDraft={setDraft} busy={busy} onSend={send} onStop={()=>{if(selectedId)void action(async()=>{await api.request('cancelRun',{conversationId:selectedId});await refreshDetail(selectedId)})}} onDetails={()=>{if(conversation)openPanel(conversation.kind==='group'?{type:'group',id:conversation.id}:{type:'agent',id:conversation.agentIds[0]!,conversationId:conversation.id})}} onChangeConversationList={changeConversationList} onClear={clearConversationHistory} onActivity={()=>{if(selectedId)openPanel({type:'activity',id:selectedId})}} onTrace={message=>{if(selectedId)openPanel({type:'trace',requestId:crypto.randomUUID(),id:selectedId,messageId:message?.id,turnId:message?.turnId,agentId:message?.senderId})}} onSettings={()=>{setSettingsSection('connections');goPage('settings')}} onChangeAgent={changeComposerAgent} configurationLocked={anyDirty} onApprove={(id,approved)=>{void action(async()=>{await api.request('approve',{id,approved});await refreshSnapshot();if(selectedRef.current)await refreshDetail(selectedRef.current)})}} onOpenPath={onOpenPath} scrollPosition={scrollPositions.current.get(currentDetail.conversation.id)} onScrollPosition={position=>scrollPositions.current.set(currentDetail.conversation.id,position)}/>:loading||detailLoading?<Loading>正在载入工作空间…</Loading>:<div className="conversation-welcome"><MessageCircle size={38}/><h1>和你的数字同事一起工作</h1><p>创建员工，直接对话，或邀请他们组成一个群。</p><div className="button-row"><Button onClick={()=>openCreation({type:'agent'})}><Plus size={16}/>新建员工</Button><Button variant="secondary" onClick={()=>openCreation({type:'group'})}>创建群聊</Button></div><div className="starter-cards">{templates.map((template,index)=><Button variant="surface" size="content" key={template.name} onClick={()=>openCreation({type:'agent',template:index})}><template.icon size={22}/><strong>{template.name}</strong><small>{template.role}</small></Button>)}</div></div>}</div>
      </div>}
      {route.page==='contacts'&&<ContactsPage api={api} snapshot={snapshot} selected={contactSelection} onSelect={setContactSelection} onMessage={messageContact} onCreate={type=>openCreation({type})} refresh={refreshSnapshot} sidebarShown={effectiveList} divider={resizer('list')} generation={panelGeneration} busy={busy}/>}
      {route.page==='library'&&<LibraryPage api={api} snapshot={snapshot} refresh={refreshSnapshot} onResource={resource=>openPanel({type:'resource',id:resource.id})} onAgent={agent=>openAgent(agent)}/>}
      {route.page==='schedules'&&<SchedulePage api={api} snapshot={snapshot} sidebarShown={effectiveList} onConversation={selectConversation} onInfo={()=>openPanel({type:'schedule'})}/>}
      {route.page==='settings'&&<SettingsPage key={`${panelGeneration}-${settingsSection}`} initialTab={settingsSection} api={api} snapshot={snapshot} refresh={refreshSnapshot}/>}
      {route.page==='help'&&<HelpPage/>}
      </div>
      {panel && resizer('detail')}
      {!!detailTabs.tabs.length && <DetailPanel title={panelTitle} hidden={!detailTabs.shown}>
        {/* Keep content DOM order stable when only the header tabs move. */}
        {[...detailTabs.tabs].sort((a, b) => a.key.localeCompare(b.key)).map(tab => {
          const target = tab.target, active = detailTabs.shown && tab.key === detailTabs.activeKey
          return <DetailTabSession key={tab.key} tabKey={tab.key} active={active} ref={handle => { if (handle) tabHandles.current.set(tab.key, handle); else tabHandles.current.delete(tab.key) }} onClose={() => closeTab(tab.key)} onDirty={onTabDirty}>
            {target.type === 'agent' && (snapshot.agents.find(a => a.id === target.id) ? <EmployeeDetail api={api} snapshot={snapshot} agent={snapshot.agents.find(a => a.id === target.id)!} conversationId={target.conversationId} refresh={refreshSnapshot} onClose={() => closeTab(tab.key)} /> : <p className="empty-note">该员工已不存在。</p>)}
            {target.type === 'group' && <GroupEditor api={api} snapshot={snapshot} conversation={snapshot.conversations.find(c => c.id === target.id)} onOpenAgent={id => openPanel({ type: 'agent', id, conversationId: target.id })} onClose={() => closeTab(tab.key)} onSaved={async result => { await refreshSnapshot(); if (selectedRef.current === result.id) await refreshDetail(result.id) }} />}
            {target.type === 'activity' && <ActivityTab api={api} conversationId={target.id} active={active} currentDetail={currentDetail} snapshot={snapshot} busy={busy} onOpenPath={onOpenPath} onStopWork={workId => { void action(async () => { await api.request('cancelRun', { conversationId: target.id, workId }); if (selectedRef.current === target.id) await refreshDetail(target.id) }) }} />}
            {target.type === 'trace' && <TraceTab key={target.requestId} api={api} conversationId={target.id} messageId={target.messageId} agentId={target.agentId} active={active} snapshot={snapshot} busy={busy} onRetry={id => { void action(async () => { await api.request('retryRun', { id, requestId: crypto.randomUUID() }); if (selectedRef.current === target.id) await refreshDetail(target.id) }) }} />}
            {target.type === 'resource' && (snapshot.resources.find(r => r.id === target.id) ? <ResourceDetail api={api} resource={snapshot.resources.find(r => r.id === target.id)!} snapshot={snapshot} refresh={refreshSnapshot} onRemoved={() => closeTab(tab.key)} onAgent={agent => openPanel({ type: 'agent', id: agent.id })} /> : <p className="empty-note">该资源已被移除。</p>)}
            {target.type === 'schedule' && <ScheduleDetail />}
          </DetailTabSession>
        })}
      </DetailPanel>}
      {creation?.type==='agent'&&<CreateAgentDialog key={`agent-${panelGeneration}`} api={api} snapshot={snapshot} template={creation.template} onClose={()=>setCreation(null)} onCreated={createdConversation}/>}
      {creation?.type==='group'&&<CreateGroupDialog key={`group-${panelGeneration}`} api={api} snapshot={snapshot} onClose={()=>setCreation(null)} onCreated={createdConversation}/>}
      {confirmation}
    </div></div>
  </Tabs></GuardContext.Provider>
}

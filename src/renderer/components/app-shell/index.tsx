/*
 * [OUTPUT]: 聊天附件随消息发到当前聊天，移除所有草稿/消息共享设置与授权修改回调。
 * [OUTPUT]: 图片/文件附件粘贴与拖入沿现有材料草稿/发送回执接线；不按模型视觉能力限制，消息列表复用真实附件原件预览。
 * [OUTPUT]: composer仅发送消息，无停止本轮/停止并发送按钮或即时停止回调；普通发送不主动取消当前处理，员工回复继续沿消息流展示。
 * [INPUT]: sidebar 主页面及其独立详情标签作用域、领域类型、员工思考强度配置、IPC 事件、独立页面组件与桌面请求入口、统一 UI 基础组件与 Sonner 操作提示。
 * [OUTPUT]: 顶栏浏览器入口沿当前会话真实成员，Mastra 新旧员工与核心助手默认可用、ACP/停用拒绝，群聊先选员工，无任务人工开空白/已有窗口只查看；页面瞬时操作/校验/宿主错误使用 Sonner，成果未决身份的本地存储故障保留持续提醒；核心会话行/右键/更多和聊天标题菜单共用明确会话标题弹窗，仅调用列表rename且刷新快照，失败留在弹窗不重写成员/配置；边界滚动有界分页的同步请求门禁/保留当前位置与请求期间实时消息，方向反转后不淘汰当前阅读锚点，清空/删除同步移除固定消息定位与导航历史定位，过期详情失败不显示顶栏错误；独立个人有界历史/真实完成未读与稳定锚点、普通 Dialog 会话/正文/文件混合搜索点击复核和固定目标导航；搜索不隐式恢复隐藏会话，编辑器延迟导航后再次只读核对原目标与当前可见元信息，实际导航成功才关闭弹窗，弹窗期间暂停背景阅读，隐藏会话暂停查询；撤销独立待处理主页面，原问题消息通过聊天输入框明确关联回复；补充未决载荷持久化并只读核对，原审批和任务记录保留；员工技能绑定按主页面/详情标签传递活跃状态与作用域，隐藏暂停回执读取；成果按逻辑家族复用明确版本标签，未决修订/采用身份沿页面隔离并持久化，关闭/重启只读核对、清理删除私有输入；会话材料原生选择/drop、按聊天保留草稿与稳定发送请求、未知准备/发送回执只读核对、当前聊天发送范围、独立材料来源标签与清理失效；聊天头像资料导航指定员工配置或本人资料，复用既有导航/详情标签并保留未保存守卫；真实群删除清除选中会话、草稿和导航历史，群编辑解散使用独立刷新回调；核心助手空白页重复打开保留输入、首次发送稳定受理才持久化、失败只读核对原请求回执；团队名称与需求弹窗受理后即时会话导航及当前工作团队结果/恢复入口，普通单聊复用排除核心会话；头像菜单首项展示本人头像/名称，后接分享/设置/帮助；分享直接打开全屏弹窗并恢复头像按钮焦点；个人资料导航及唯一快照、设置分类/滚动与聊天 DOM 保留；定时任务常驻阅读状态与隐藏暂停读取，七项手动/Agent/专用监控共用编辑标签；通讯录加号菜单团队创建弹窗； 发送时分离 composer 行内标签和正文，沿用结构化成员 ID；移除独立外部 Agent 设置路由与导航菜单项；设置与定时任务复用列表拖拽线、键盘调宽、双击复位及宽度记忆；右侧标签按 sidebar 页面分别保留顺序/选中/显隐与编辑草稿，切换主页面不混用标签；技能更新复用任务与产物所在的 Shell 右侧详情 Tabs，重复打开激活既有标签、保留技能主详情并在升级后刷新/定位本机技能；移除 Skills 统计并回退旧分类偏好；技能/商城复用会话可调分栏，旧更新/记录页面偏好回到本地； 单一技能图标与统一页面、本地/收藏/商城顶部 Tabs、独立于员工资源、独立列表详情及重启不自动联网；启动与删除当前会话后保持未选中，仅展示居中的共用毛绒伙伴插画，不含标题、按钮或模板卡片；消费系统提醒导航，重载后定位具体结果或无消息的执行记录；独立定时任务编辑标签/选中计划、指定结果消息导航与普通单聊复用隔离；商店详情复用独立标签；回复旁图标打开固定消息/员工的执行过程标签；Carbon 导航、会话页按手动宽度和显式开关控制的分栏容器、保留草稿和独立会话上下文的顶栏多标签及下方配置、通讯录/会话路由、共用创建入口、列表排序/置顶/隐藏恢复、创建弹窗、头像配置保存、工作树停止及支持局部标签切换的退出编辑保护。 列表和标题下拉菜单共用置顶/清理能力、会话清理缓存及右侧窗口排序。
 * [OUTPUT]: 聊天标题栏不提供阅读状态或返回未读/最新按钮，滚动锚点/历史加载/可见阅读观测保持。
 * [OUTPUT]: 删除资料库主页面与导航；旧资料库启动偏好回退会话，技能页及共享资源详情保留。
 * [POS]: src/renderer/components/app-shell/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { detailWorkspacesReducer, emptyDetailTabs, type DetailWorkspaces, type DetailTabsAction, type DetailTarget as Panel } from '../detail-panel/tabs-state'
import { DetailTabSession, type DetailTabHandle } from '../detail-panel/tab-session'
import { TraceTab } from '../detail-panel/trace-tab'
import { ActivityTab } from '../detail-panel/activity-tab'
import { MaterialTab } from '../detail-panel/material-tab'
import { ArtifactTab } from '../detail-panel/artifact-tab'
import { ARTIFACT_PENDING_KEY, artifactPendingKey, artifactPendingScope, restoreArtifactPending, updateArtifactPending, type ArtifactPending, type ArtifactPendingMap } from '../detail-panel/artifact-state'
import { useChatMaterials } from './use-chat-materials'
import { getDesktopClient } from '@/services/request/desktop-client'
import { DesktopToolbar } from './desktop-toolbar'
import { HeaderBrowser } from './header-browser'
import { SkillsNavigation } from './skills-navigation'
import { DetailPanel, DetailPanelHeader } from '../detail-panel'
import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react'
import { Clock, Home, Contact, CircleHelp, MessageCircle, Users, FileText, Terminal, Workflow, RefreshCw, Settings, Share } from '@/components/icons/index'
import type { ConversationListChange } from '@shared/domain/conversation-list'
import type { AppEvent } from '@shared/ipc'
import type { Artifact, DigitalAgent, Conversation, Message, Snapshot } from '@shared/domain'
import { READING_LIMITS, type ConversationReadingState, type ConversationSearchResult, type ConversationSearchTarget, type ConversationView } from '@shared/domain/reading'
import { mergeMessagePages, mergeReadingState, readingSourceKey, sameSearchTarget, updateLiveMessage } from '@/pages/conversations/reading-state'
import type { ConversationSearchRequest } from '@/pages/conversations/-components/conversation-search'
import { MATERIAL_LIMITS, type ConversationMaterial } from '@shared/domain/materials'
import { isCoreAgent, isCoreConversation } from '@shared/domain/core-agent'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { ChatView } from '@/pages/conversations/-components/chat-view'
import { useChatQuestionReplies } from '@/pages/conversations/question-reply'
import { CoreChatStart } from '@/pages/conversations/-components/core-chat-start'
import type { ComposerAgentPatch } from '@/pages/conversations/-components/composer-toolbar'
import { ConversationList } from '@/pages/conversations/-components/conversation-list'
import { ConversationTitleDialog } from '@/pages/conversations/-components/conversation-title-dialog'
import type { ChatDraft } from '@/pages/conversations/presentation'
import { draftContent } from '@/pages/conversations/inline-mentions'
import { GroupEditor } from '@/components/employee/editors'
import { CreateAgentDialog, CreateGroupDialog } from '@/components/employee/creation-dialogs'
import { EmployeeDetail } from '@/components/employee/index'
import { TeamCreator } from '@/pages/contacts/team-creator'
import { ContactsPage, type ContactSelection } from '@/pages/contacts'
import { HelpPage } from '@/pages/help'
import { SkillsWorkspace, type SkillsSection } from '@/pages/library/skills-workspace'
import type { SkillMarketplaceProvider } from '@shared/domain/skill-marketplace'
import { SkillMarketplaceDetail } from '@/pages/library/skill-marketplace'
import { SkillUpdateBatchView } from '@/pages/library/skill-update-batch'
import { ResourceDetail } from '@/pages/library/resource-detail'
import { ScheduleDetail, SchedulePage, type ScheduleLocation } from '@/pages/schedules'
import { AutomationEditorTab } from '@/pages/schedules/automation-editor'
import { UserAvatar } from '@/components/common/user-avatar'
import { ProfileShare } from '@/pages/settings/profile-share'
import { SettingsPage, type SettingsTab } from '@/pages/settings'
import { Avatar, Banner, errorText, GuardContext, Loading } from '@/components/common/index'
import { toast } from 'sonner'

type Page = 'conversations' | 'contacts' | 'schedules' | 'skills' | 'settings' | 'help'
type Creation = { type: 'agent'; template?: number } | { type: 'group' | 'team' }
interface Route { page: Page; conversationId: string | null; coreDraft?: true; focusMessage?: { id: string; requestId: string } }
const EMPTY: Snapshot = { agents: [], conversations: [], connections: [], resources: [], approvals: [], dataPath: '' }
const DEFAULT_LIST_WIDTH = 312
const EMPTY_DRAFT: ChatDraft = { text: '', mentionIds: [] }
const labels: Record<Page, string> = { conversations: '会话', contacts: '通讯录', schedules: '定时任务', skills: '技能', settings: '设置', help: '帮助' }
function pref(key: string, fallback: number) { try { return Number(localStorage.getItem(`boai.v2.${key}`)) || fallback } catch { return fallback } }
function initialRoute(): Route { try { const p = localStorage.getItem('boai.v2.page'); return { page: p === 'marketplace' ? 'skills' : p && p in labels ? p as Page : 'conversations', conversationId: null } } catch { return { page: 'conversations', conversationId: null } } }
function draftFingerprint(draft: ChatDraft) { return JSON.stringify({ text: draft.text, mentionIds: draft.mentionIds, mentions: draft.mentions, replyId: draft.replyId, questionReply: draft.questionReply, materials: draft.materials?.map(item => [item.material?.id, item.material?.revision]) }) }

export function AppShell() {
  const api = getDesktopClient()
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY), [detail, setDetail] = useState<ConversationView | null>(null)
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot
  const [restoredArtifacts] = useState(() => {
    try { return { pending: restoreArtifactPending(JSON.parse(localStorage.getItem(ARTIFACT_PENDING_KEY) ?? 'null')), error: '' } }
    catch { return { pending: {} as ArtifactPendingMap, error: '未能读取成果未决请求，请恢复本地存储后核对原请求。' } }
  })
  const [artifactPending, setArtifactPending] = useState<ArtifactPendingMap>(restoredArtifacts.pending), artifactPendingRef = useRef(restoredArtifacts.pending)
  const [route, setRoute] = useState<Route>(initialRoute)
  const routeRef = useRef(route); routeRef.current = route
  const detailRef = useRef(detail); detailRef.current = detail
  const viewLocations = useRef(new Map<string, { messageId?: string; offset?: number; initialized: boolean; focusRequestId?: string }>())
  const [searchRequest, setSearchRequest] = useState<ConversationSearchRequest>(), [conversationSearchOpen, setConversationSearchOpen] = useState(false), [paging, setPaging] = useState(false), [pageEdges, setPageEdges] = useState({ before: true, after: true })
  const [editingTitle, setEditingTitle] = useState<Conversation | null>(null)
  const pagingFlight = useRef(0)
  const [sourceChecks, setSourceChecks] = useState<Record<string, number>>({})
  const [skillsSection, setSkillsSection] = useState<SkillsSection>('all')
  const [skillProvider, setSkillProvider] = useState<SkillMarketplaceProvider>(() => { try { const value = localStorage.getItem('boai.skills.provider'); return ['skills-sh','clawhub','skillhub'].includes(value ?? '') ? value as SkillMarketplaceProvider : 'skills-sh' } catch { return 'skills-sh' } })
  useEffect(() => { try { localStorage.setItem('boai.skills.section', skillsSection); localStorage.setItem('boai.skills.provider', skillProvider) } catch { /* Optional navigation preferences. */ } }, [skillsSection, skillProvider])
  const [focusedSkill, setFocusedSkill] = useState<{ id: string; requestId: string }>()
  const [skillsRevision, setSkillsRevision] = useState(0)
  const skillUpdated = useCallback(() => setSkillsRevision(value => value + 1), [])
  const skillsNavigation = route.page === 'skills'
  const [scheduleLocation, setScheduleLocation] = useState<ScheduleLocation>({ kind: 'overview' })
  const [detailWorkspaces, dispatchWorkspace] = useReducer(detailWorkspacesReducer, {} as DetailWorkspaces)
  const detailTabs = detailWorkspaces[route.page] ?? emptyDetailTabs
  const allDetailTabs = Object.entries(detailWorkspaces).flatMap(([scope, state]) => state.tabs.map(tab => ({ scope, ...tab })))
  const dispatchDetails = (action: DetailTabsAction, scope: string = route.page) => dispatchWorkspace({ scope, action })
  const tabHandles = useRef(new Map<string, DetailTabHandle>())
  const [tabDirty, setTabDirty] = useState<Record<string, boolean>>({})
  const onTabDirty = useCallback((key: string, value: boolean) => setTabDirty(previous => {
    if (Boolean(previous[key]) === value) return previous
    const next = { ...previous }; if (value) next[key] = true; else delete next[key]; return next
  }), [])
  const [contactSelection, setContactSelection] = useState<ContactSelection | null>(null)
  const [creation, setCreation] = useState<Creation | null>(null)
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [artifactStorageError, setArtifactStorageError] = useState(restoredArtifacts.error)
  const saveArtifactPending = useCallback((key: string, value?: ArtifactPending) => {
    const next = updateArtifactPending(artifactPendingRef.current, key, value)
    artifactPendingRef.current = next; setArtifactPending(next)
    try { if (Object.keys(next).length) localStorage.setItem(ARTIFACT_PENDING_KEY, JSON.stringify(next)); else localStorage.removeItem(ARTIFACT_PENDING_KEY); return true }
    catch { setArtifactStorageError('未能保存成果请求身份，跨重启核对尚无保证。请恢复本地存储后重试。'); return false }
  }, [])
  const clearArtifactPending = useCallback((conversationId: string) => {
    for (const [key, value] of Object.entries(artifactPendingRef.current)) if (value.conversationId === conversationId) saveArtifactPending(key)
  }, [saveArtifactPending])
  useEffect(() => {
    if (loading) return
    for (const value of Object.values(artifactPendingRef.current)) if (!snapshot.conversations.some(conversation => conversation.id === value.conversationId)) clearArtifactPending(value.conversationId)
  }, [loading, snapshot.conversations, clearArtifactPending])
  const [busy, setBusy] = useState(false), busyRef = useRef(false)
  const [panelGeneration, setPanelGeneration] = useState(0)
  const { guard, dirty, dirtyRef, navigate, saved, leaving, confirmation } = useEditorGuard({
    reset: () => setPanelGeneration(value => value + 1),
    getForm: () => document.querySelector('[data-edit-form]:not(.detail-panel [data-edit-form])'),
  })
  const anyDirty = dirty || Object.values(tabDirty).some(Boolean)
  const [listShown, setListShown] = useState(true), [listWidth, setListWidth] = useState(() => { const width = pref('listWidth', DEFAULT_LIST_WIDTH); return width === 272 ? DEFAULT_LIST_WIDTH : width }), [detailWidth, setDetailWidth] = useState(() => pref('detailWidth', 360))
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [, setDraftVersion] = useState(0), drafts = useRef(new Map<string, ChatDraft>()), scrollPositions = useRef(new Map<string, number>())
  const bumpDrafts = useCallback(() => setDraftVersion(value => value + 1), [])
  const materialDrafts = useChatMaterials({ api, snapshot, drafts, onChange: bumpDrafts, onError: toast.error })
  const [previews, setPreviews] = useState<Record<string,string>>({})
  const [messageTimes, setMessageTimes] = useState<Record<string,string>>({})
  const settingsMounted = useRef(route.page === 'settings')
  if (route.page === 'settings') settingsMounted.current = true
  const [settingsSection,setSettingsSection]=useState<SettingsTab>('connections')
  const [menu, setMenu] = useState<'settings' | null>(null)
  const [sharingProfile, setSharingProfile] = useState(false), userMenuButton = useRef<HTMLButtonElement>(null)
  const detailTrigger = useRef<{ scope: string; element: HTMLElement | null } | null>(null)
  const history = useRef<Route[]>([route]), historyIndex = useRef(0)
  const mounted = useRef(true), selectedRef = useRef<string | null>(route.conversationId), snapshotRequest = useRef(0), detailRequest = useRef(0)
  const coreConversationRequest = useRef<{ requestId: string; content: string } | undefined>(undefined)
  const coreDraft = useRef<ChatDraft>(EMPTY_DRAFT)
  const eventRevision = useRef(0), messageRevisions = useRef(new Map<string, number>()), incoming = useRef(new Map<string, Message>())
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTab = detailTabs.tabs.find(tab => tab.key === detailTabs.activeKey)
  const panel = detailTabs.shown ? activeTab?.target : undefined, selectedId = route.conversationId
  const conversation = snapshot.conversations.find(c => c.id === selectedId)
  const currentDetail = detail?.conversation.id === selectedId ? detail : null
  useEffect(() => { const trigger = detailTrigger.current; if (!panel && trigger?.scope === route.page && trigger.element?.isConnected) trigger.element.focus() }, [Boolean(panel), route.page])

  const refreshSnapshot = useCallback(async () => {
    if (!api) return
    const token = ++snapshotRequest.current, result = await api.request('snapshot', undefined)
    if (mounted.current && token === snapshotRequest.current) { setSnapshot(result); setLoading(false) }
  }, [api])
  const clearConversationLocation = useCallback((id: string, removed: boolean) => {
    viewLocations.current.delete(id); scrollPositions.current.delete(id)
    history.current = history.current.map(entry => entry.conversationId === id ? { ...entry, conversationId: removed ? null : id, focusMessage: undefined } : entry)
    if (selectedRef.current !== id) return
    detailRequest.current++; pagingFlight.current = 0; setPaging(false)
    setDetail(null); setDetailLoading(!removed)
    const next = { ...routeRef.current, conversationId: removed ? null : id, focusMessage: undefined }
    routeRef.current = next; selectedRef.current = next.conversationId; setRoute(next)
  }, [])
  const refreshDetail = useCallback(async (id: string) => {
    if (!api || selectedRef.current !== id || routeRef.current.page !== 'conversations') return
    const token = ++detailRequest.current, started = eventRevision.current, focus = routeRef.current.focusMessage
    const current = () => mounted.current && token === detailRequest.current && selectedRef.current === id && routeRef.current.page === 'conversations'
    try {
      let location = viewLocations.current.get(id) ?? { initialized: false }
      if (focus && location.focusRequestId !== focus.requestId) location = { initialized: true, messageId: focus.id, focusRequestId: focus.requestId }
      if (!location.initialized) {
        const reading = await api.request('getConversationReading', { conversationId: id })
        if (!current()) return
        location = { initialized: true, messageId: reading.anchor?.messageId, offset: reading.anchor?.offset }
      }
      viewLocations.current.set(id, location)
      const result = await api.request('getConversationView', { conversationId: id, limit: READING_LIMITS.maxPage, aroundMessageId: location.messageId })
      if (!current()) return
      let messagePage = result.messagePage
      for (const message of incoming.current.values()) if ((messageRevisions.current.get(message.id) ?? 0) > started) messagePage = updateLiveMessage(messagePage, message, !location.messageId)
      const updated: ConversationView = { ...result, messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) }
      const previous = detailRef.current
      if (previous?.conversation.id === id) updated.reading = mergeReadingState(previous.reading, updated.reading)
      materialDrafts.reconcile(id, result.materials ?? [])
      setDetail(updated); setDetailLoading(false); setPageEdges({ before: true, after: true })
      const last = updated.messages.at(-1)
      if (last) {
        setPreviews(previous => ({ ...previous, [id]: `${last.senderName}：${last.content.slice(0,90)}` }))
        setMessageTimes(previous => ({ ...previous, [id]: previous[id] && previous[id] > last.createdAt ? previous[id] : last.createdAt }))
      }
    } catch (failure) { if (current()) { setDetail(null); setDetailLoading(false); toast.error(errorText(failure)) } }
  }, [api, materialDrafts.reconcile])
  const questionReplies = useChatQuestionReplies(api, {
    conversationId: selectedId ?? undefined, active: route.page === 'conversations' && !conversationSearchOpen,
    onSubmitted: (message, target) => {
      const current = drafts.current.get(message.conversationId)
      if (current?.questionReply?.itemId === target.itemId && current.questionReply.questionMessageId === target.questionMessageId && (current.questionReply.occurrenceId ? current.questionReply.occurrenceId === target.occurrenceId : current.questionReply.revision === target.revision)) {
        if (draftContent(current) === message.content && !current.materials?.length && !current.mentionIds.length) drafts.current.delete(message.conversationId)
        else drafts.current.set(message.conversationId, { ...current, questionReply: undefined, replyId: undefined })
        bumpDrafts()
      }
      void refreshSnapshot().catch(failure => toast.error(`补充已提交，列表刷新未完成：${errorText(failure)}`))
      if (selectedRef.current === message.conversationId) void refreshDetail(message.conversationId)
    },
  })
  useEffect(() => {
    mounted.current = true
    if (!api) { setLoading(false); return }
    const report = (e: unknown) => { if (mounted.current) { toast.error(errorText(e)); setLoading(false); setDetailLoading(false) } }
    void refreshSnapshot().catch(report)
    const schedule = () => { if (refreshTimer.current) return; refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void refreshSnapshot().catch(report); if (selectedRef.current && routeRef.current.page === 'conversations') void refreshDetail(selectedRef.current) }, 100) }
    const openAutomationNotice = () => { void api.request('getPendingAutomationNavigation', undefined).then(target => {
      if (!target || !mounted.current) return
      navigate(() => {
        if (target.conversationId && target.messageId) applyRoute({ page: 'conversations', conversationId: target.conversationId, focusMessage: { id: target.messageId, requestId: crypto.randomUUID() } })
        else { setScheduleLocation({ kind: 'occurrence', id: target.occurrenceId, requestId: crypto.randomUUID() }); applyRoute({ ...routeRef.current, page: 'schedules' }) }
      })
    }).catch(report) }
    const unsubscribe = api.subscribe((event: AppEvent) => {
      if (event.type === 'automation:navigate') { openAutomationNotice(); return }
      if(event.type==='focus-conversation'){navigate(()=>applyRoute({page:'conversations',conversationId:event.conversationId,focusMessage:event.messageId?{id:event.messageId,requestId:crypto.randomUUID()}:undefined}));return}
      if (event.type === 'runtime-error') { toast.error(event.error); return }
      if (event.type === 'conversation:cleared' || event.type === 'conversation:deleted') {
        const id = event.conversationId
        clearArtifactPending(id)
        materialDrafts.invalidate(id)
        for (const [key, message] of incoming.current) if (message.conversationId === id) { incoming.current.delete(key); messageRevisions.current.delete(key) }
        drafts.current.delete(id)
        clearConversationLocation(id, event.type === 'conversation:deleted')
        setPreviews(previous => ({ ...previous, [id]: '' })); setMessageTimes(previous => ({ ...previous, [id]: '' }))
        schedule(); return
      }
      if (event.type === 'changed') { schedule(); return }
      if (event.type !== 'message') return
      setMessageTimes(previous => { const id = event.message.conversationId, time = event.message.createdAt; return previous[id] && previous[id] >= time ? previous : { ...previous, [id]: time } })
      incoming.current.set(event.message.id, event.message); messageRevisions.current.set(event.message.id, ++eventRevision.current)
      if (event.message.conversationId === selectedRef.current && routeRef.current.page === 'conversations') setDetail(previous => { if (!previous || previous.conversation.id !== event.message.conversationId) return previous; const messagePage = updateLiveMessage(previous.messagePage, event.message, !viewLocations.current.get(event.message.conversationId)?.messageId); return { ...previous, messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) } })
      if (event.message.status !== 'streaming') { setPreviews(previous => ({ ...previous, [event.message.conversationId]: `${event.message.senderName}：${event.message.content.slice(0,90)}` })); schedule() }
    })
    openAutomationNotice()
    return () => { mounted.current = false; unsubscribe(); if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = null }
  }, [api, refreshSnapshot, refreshDetail, materialDrafts.invalidate, clearArtifactPending, clearConversationLocation])
  useEffect(() => {
    selectedRef.current = selectedId
    pagingFlight.current = 0; setPaging(false)
    if (!selectedId) { setDetail(null); setDetailLoading(false); return }
    if (route.page !== 'conversations') { detailRequest.current++; setDetailLoading(false); return }
    setDetailLoading(true)
    void refreshDetail(selectedId)
  }, [selectedId, route.page, route.focusMessage?.requestId, refreshDetail])
  useEffect(() => { const listener = () => setWindowWidth(window.innerWidth); window.addEventListener('resize', listener); return () => window.removeEventListener('resize', listener) }, [])
  useEffect(() => { try { localStorage.setItem('boai.v2.listWidth', String(listWidth)); localStorage.setItem('boai.v2.detailWidth', String(detailWidth)); localStorage.setItem('boai.v2.page', route.page); localStorage.removeItem('boai.v2.conversation') } catch { /* Preferences are optional. */ } }, [listWidth, detailWidth, route.page])
  useEffect(() => { if (api) void api.request('setUnsavedChanges', { dirty: anyDirty }).catch(e => toast.error(errorText(e))) }, [api, anyDirty])
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !menu && !sharingProfile && !leaving && !creation && panel && !document.querySelector('[role=alertdialog]')) tabHandles.current.get(detailTabs.activeKey!)?.close() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [menu, sharingProfile, panel, leaving, creation, detailTabs.activeKey])
  const action = async (fn: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { await fn() } catch (e) { if (mounted.current) toast.error(errorText(e)) } finally { busyRef.current = false; if (mounted.current) setBusy(false) } }
  const applyRoute = (next: Route, addHistory = true) => {
    if (addHistory && (next.page !== route.page || next.conversationId !== route.conversationId || next.coreDraft !== route.coreDraft)) { history.current = history.current.slice(0, historyIndex.current + 1); history.current.push(next); historyIndex.current++ }
    if (next.conversationId !== selectedRef.current || next.page !== routeRef.current.page || next.focusMessage?.requestId !== routeRef.current.focusMessage?.requestId) detailRequest.current++
    if (next.conversationId !== selectedRef.current) { selectedRef.current = next.conversationId; setDetail(null) }
    routeRef.current = next
    if (next.page !== 'skills') setFocusedSkill(undefined)
    setRoute(next); setCreation(null); setMenu(null)
  }
  const goPage = (page: Page) => navigate(() => applyRoute({ ...route, page }))
  const openUserProfile = () => navigate(() => { setSettingsSection('profile'); applyRoute({ ...route, page: 'settings' }) })
  const selectConversation = (id: string, _clearSearch = false, messageId?: string, current?: () => boolean, navigated?: () => void) => {
    let pending: Promise<void> | undefined
    navigate(() => {
      const open = () => { if (current && !current()) return; applyRoute({ page: 'conversations', conversationId: id, focusMessage: messageId ? { id: messageId, requestId: crypto.randomUUID() } : undefined }); navigated?.() }
      if (!snapshot.conversations.find(item => item.id === id)?.list?.hidden) { open(); return }
      if (api) pending = action(async () => { await api.request('updateConversationList', { id, action: 'show' }); await refreshSnapshot(); open() })
    })
    return pending
  }
  const updateReading = (reading: ConversationReadingState) => setDetail(previous => previous?.conversation.id === reading.conversationId ? { ...previous, reading: mergeReadingState(previous.reading, reading) } : previous)
  const loadMessagePage = async (direction: 'before' | 'after') => {
    if (!api || pagingFlight.current || paging || routeRef.current.page !== 'conversations') return
    const previous = detailRef.current, id = selectedRef.current
    if (!previous || previous.conversation.id !== id) return
    const cursor = direction === 'before' ? previous.messagePage.beforeCursor : previous.messagePage.afterCursor
    if (!cursor) return
    const token = ++detailRequest.current, started = eventRevision.current; pagingFlight.current = token; setPaging(true)
    try {
      const next = await api.request('getConversationView', { conversationId: previous.conversation.id, limit: READING_LIMITS.page, [direction]: cursor })
      if (!mounted.current || token !== detailRequest.current || selectedRef.current !== id || routeRef.current.page !== 'conversations') return
      if (!next.messagePage.items.length) { setPageEdges(value => ({ ...value, [direction]: false })); return }
      let messagePage = mergeMessagePages(previous.messagePage, next.messagePage, direction)
      for (const message of incoming.current.values()) if ((messageRevisions.current.get(message.id) ?? 0) > started) messagePage = updateLiveMessage(messagePage, message, false)
      const anchorId = viewLocations.current.get(id)?.messageId
      if (anchorId && !messagePage.items.some(item => item.messageId === anchorId)) return
      const latestReading = detailRef.current?.conversation.id === id ? detailRef.current.reading : previous.reading
      setDetail({ ...next, reading: mergeReadingState(latestReading, next.reading), messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) }); setPageEdges({ before: true, after: true })
    } catch (failure) { if (mounted.current && token === detailRequest.current && selectedRef.current === id && routeRef.current.page === 'conversations') toast.error(errorText(failure)) }
    finally { if (token === pagingFlight.current) { pagingFlight.current = 0; setPaging(false) } }
  }
  const saveConversationTitle = async (id: string, title: string) => {
    if (!api) throw new Error('桌面连接暂不可用')
    await api.request('updateConversationList', { id, action: 'rename', title })
    await refreshSnapshot()
  }
  const changeConversationList = (change: ConversationListChange) => {
    const update = () => { if (!api) return; void action(async () => {
      await api.request('updateConversationList', change)
      if (change.action === 'hide') {
        history.current = history.current.map(entry => entry.conversationId === change.id ? { ...entry, conversationId: null, focusMessage: undefined } : entry)
        if (selectedRef.current === change.id) {
          applyRoute({ ...route, conversationId: null, focusMessage: undefined }, false)
        }
      }
      await refreshSnapshot()
    }) }
    if (change.action === 'hide') navigate(update); else update()
  }
  const clearConversationHistory = async (id: string, hide: boolean) => {
    if (!api) return
    await api.request('clearConversationHistory', { id, hide })
    clearConversationLocation(id, hide)
    materialDrafts.invalidate(id)
    for (const [key, message] of incoming.current) if (message.conversationId === id) { incoming.current.delete(key); messageRevisions.current.delete(key) }
    drafts.current.delete(id)
    setPreviews(previous => ({ ...previous, [id]: '' }))
    setMessageTimes(previous => ({ ...previous, [id]: '' }))
    if (hide) {
      history.current = history.current.map(entry => entry.conversationId === id ? { ...entry, conversationId: null, focusMessage: undefined } : entry)
      if (selectedRef.current === id) {
        applyRoute({ ...route, conversationId: null, focusMessage: undefined }, false)
      }
    } else if (selectedRef.current === id) await refreshDetail(id)
    await refreshSnapshot()
  }
  const openPanel = (next: Panel, scope: string = route.page, current?: () => boolean, navigated?: () => void) => {
    const trigger = document.activeElement as HTMLElement | null
    navigate(() => { if (current && !current()) return; if (!panel) detailTrigger.current = { scope, element: trigger }; dispatchDetails({ type: 'open', target: next }, scope); setMenu(null); navigated?.() })
  }
  const openLocalSkill = (id: string) => navigate(() => {
    setSkillsSection('all'); setFocusedSkill({ id, requestId: crypto.randomUUID() }); applyRoute({ ...route, page: 'skills' })
  })
  const openCreation = (next: Creation) => navigate(() => { setCreation(next); setMenu(null) })
  const createdConversation = async (result: Conversation) => { await refreshSnapshot(); saved(() => { applyRoute({ page: 'conversations', conversationId: result.id }) }) }
  const coreConversationStarted = (result: Conversation) => {
    setSnapshot(previous => ({ ...previous, conversations: previous.conversations.some(item => item.id === result.id) ? previous.conversations : [...previous.conversations, result] }))
    navigate(() => { applyRoute({ page: 'conversations', conversationId: result.id }) })
    void refreshSnapshot().catch(failure => toast.error(errorText(failure)))
  }
  const createCoreConversation = () => navigate(() => {
    applyRoute({ page: 'conversations', conversationId: null, coreDraft: true })
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.core-chat-start [aria-label="消息内容"]')?.focus())
  })
  const closeTab = (key: string, scope: string = route.page) => {
    const target = detailWorkspaces[scope]?.tabs.find(tab => tab.key === key)?.target
    if (target?.type === 'artifact') {
      const pendingKey = artifactPendingKey(scope, target.conversationId, target.logicalArtifactId), pending = artifactPendingRef.current[pendingKey]
      if (pending) saveArtifactPending(pendingKey, { ...pending, revision: pending.revision?.status === 'pending' ? { ...pending.revision, status: 'unknown' } : pending.revision, adoption: pending.adoption?.status === 'pending' ? { ...pending.adoption, status: 'unknown' } : pending.adoption, acceptance: pending.acceptance?.status === 'pending' ? { ...pending.acceptance, status: 'unknown' } : pending.acceptance })
    }
    dispatchDetails({ type: 'close', key }, scope)
  }
  const requestCloseTab = (key: string) => {
    if (tabDirty[key]) dispatchDetails({ type: 'select', key })
    tabHandles.current.get(key)?.close()
  }
  const openAgent = (agent: DigitalAgent, configurationRequest?: string) => openPanel({ type: 'agent', id: agent.id, conversationId: selectedId ?? undefined, configurationRequest })
  const openDirect = (agent: DigitalAgent) => {
    if (isCoreAgent(agent)) { createCoreConversation(); return }
    navigate(() => { if (!api) return; void action(async () => { const existing = snapshot.conversations.find(c => c.kind === 'direct' && c.purpose !== 'automation' && !isCoreConversation(c) && c.agentIds[0] === agent.id); const result = existing ?? await api.request('createConversation', { kind: 'direct', title: agent.name, agentIds: [agent.id], mode: 'natural' }); await api.request('updateConversationList', { id: result.id, action: 'show' }); await refreshSnapshot(); applyRoute({ page: 'conversations', conversationId: result.id }) }) })
  }
  const messageContact = (selection: ContactSelection) => {
    if (selection.kind === 'agent') { const agent = snapshot.agents.find(item => item.id === selection.id); if (agent) openDirect(agent) }
    else selectConversation(selection.id, true)
  }
  const draft = route.coreDraft ? coreDraft.current : selectedId ? drafts.current.get(selectedId) ?? EMPTY_DRAFT : EMPTY_DRAFT
  const setDraft = (value: ChatDraft) => { if (route.coreDraft) coreDraft.current = value; else if (selectedId) drafts.current.set(selectedId, value); else return; setDraftVersion(v => v+1) }
  const acceptMessage = async (id: string, submission: NonNullable<ChatDraft['submission']>) => {
    const current = drafts.current.get(id)
    if (current?.submission?.requestId === submission.requestId) {
      if (draftFingerprint(current) === submission.fingerprint) drafts.current.delete(id)
      else {
        const sentMaterials = new Set(submission.input.materialSelections?.map(material => material.id))
        drafts.current.set(id, { ...current, submission: undefined, materials: current.materials?.filter(item => !item.material || !sentMaterials.has(item.material.id)) })
      }
      bumpDrafts()
    }
    if (selectedRef.current === id) await refreshDetail(id)
    await refreshSnapshot()
  }
  const updateSubmission = (id: string, requestId: string, status: NonNullable<ChatDraft['submission']>['status']) => {
    const current = drafts.current.get(id)
    if (current?.submission?.requestId !== requestId) return
    drafts.current.set(id, { ...current, submission: { ...current.submission, status } }); bumpDrafts()
  }
  const clearUnacceptedSubmission = () => {
    if (!api || !selectedId) return
    const id = selectedId, submission = drafts.current.get(id)?.submission
    if (submission?.status !== 'not_accepted') return
    void action(async () => {
      const receipt = await api.request('getMessageReceipt', { requestId: submission.requestId })
      if (receipt) { await acceptMessage(id, submission); return }
      const current = drafts.current.get(id)
      if (current?.submission?.requestId === submission.requestId) { drafts.current.set(id, { ...current, submission: undefined }); bumpDrafts() }
    })
  }
  const send = () => {
    const text = draftContent(draft)
    if (!api || busyRef.current || questionReplies.busy) return
    if (route.coreDraft) {
      if (!text) return
      void action(async () => {
        // Keep the original request until its receipt is known, including after a lost response.
        coreConversationRequest.current ??= { requestId: crypto.randomUUID(), content: text }
        const request = coreConversationRequest.current
        let result: Conversation
        try { result = await api.request('startCoreConversation', request) }
        catch (failure) {
          let accepted: Conversation | null | undefined
          try { accepted = await api.request('getCoreConversationStart', { requestId: request.requestId }) } catch { /* Preserve the request when its receipt cannot be checked. */ }
          if (!accepted) { if (accepted === null) coreConversationRequest.current = undefined; throw failure }
          result = accepted
        }
        if (draftContent(coreDraft.current) !== request.content) drafts.current.set(result.id, coreDraft.current)
        coreDraft.current = EMPTY_DRAFT; coreConversationRequest.current = undefined
        setSnapshot(previous => ({ ...previous, conversations: previous.conversations.some(item => item.id === result.id) ? previous.conversations : [...previous.conversations, result] }))
        history.current = history.current.map(entry => entry.coreDraft ? { ...entry, coreDraft: undefined, conversationId: result.id } : entry)
        setRoute(previous => previous.coreDraft ? { ...previous, coreDraft: undefined, conversationId: result.id } : previous)
        setDraftVersion(value => value + 1); await refreshSnapshot()
      })
      return
    }
    if (!selectedId) return
    const id = selectedId, sent = drafts.current.get(id) ?? draft, sentText = draftContent(sent)
    const pendingQuestions = Object.values(questionReplies.values).filter(request => request.conversationId === id)
    if (sent.questionReply) {
      if (sent.submission || sent.materials?.length || sent.mentionIds.length) { toast.error('回复原问题时请只发送补充正文；可取消问题关联后发送材料、提及或新的要求。'); return }
      if (!sentText) return
      if (pendingQuestions.some(request => request.itemId !== sent.questionReply!.itemId)) { toast.error('请先核对本聊天的原补充请求，再回复其他问题。'); return }
      void action(async () => { await questionReplies.submit(sent.questionReply!, sentText) })
      return
    }
    if (pendingQuestions.length) { toast.error('本聊天有补充结果尚未确认，请先核对原补充请求。'); return }
    const external = conversation?.kind === 'direct' && snapshot.agents.find(agent => agent.id === conversation.agentIds[0])?.executionBackend?.kind === 'acp-local'
    if (external) {
      if (!sentText) return
      if (sent.materials?.length) { toast.error('外部聊天不支持材料输入，请先移除草稿中的材料。'); return }
      void action(async () => {
        await api.request('sendExternalTask', { conversationId: id, content: sentText, requestId: crypto.randomUUID() })
        if (draftFingerprint(drafts.current.get(id) ?? EMPTY_DRAFT) === draftFingerprint(sent)) drafts.current.delete(id)
        bumpDrafts(); if (selectedRef.current === id) await refreshDetail(id); await refreshSnapshot()
      })
      return
    }
    let submission = sent.submission
    if (submission?.status === 'pending') return
    if (!submission) {
      const items = sent.materials ?? []
      if (!sentText && !items.length) return
      if (items.some(item => item.status !== 'ready' || item.material?.status !== 'ready' || item.busy)) { toast.error('请等待材料就绪；失败材料需要重试或移除后才能发送。'); return }
      if (items.reduce((total, item) => total + (item.material?.format === 'txt' || item.material?.format === 'markdown' ? item.material.characterCount ?? MATERIAL_LIMITS.messageCharacters + 1 : 0), 0) > MATERIAL_LIMITS.messageCharacters) { toast.error(`每条消息的材料正文最多 ${MATERIAL_LIMITS.messageCharacters} 字，请分批发送。`); return }
      if (items.length && sentText.length > MATERIAL_LIMITS.messageTextCharacters) { toast.error(`带材料消息的正文最多 ${MATERIAL_LIMITS.messageTextCharacters} 字，请拆分发送。`); return }
      submission = { requestId: crypto.randomUUID(), status: 'pending', fingerprint: draftFingerprint(sent), input: { content: sentText, mentionIds: [...sent.mentionIds], replyToMessageId: sent.replyId, materialSelections: items.length ? items.map(item => ({ id: item.material!.id, revision: item.material!.revision })) : undefined } }
      drafts.current.set(id, { ...sent, submission }); bumpDrafts()
    }
    const request = submission
    void action(async () => {
      if (request.status === 'unknown') {
        const receipt = await api.request('getMessageReceipt', { requestId: request.requestId })
        if (receipt) await acceptMessage(id, request)
        else updateSubmission(id, request.requestId, 'not_accepted')
        return
      }
      if (request.status === 'not_accepted') {
        const receipt = await api.request('getMessageReceipt', { requestId: request.requestId })
        if (receipt) { await acceptMessage(id, request); return }
      }
      updateSubmission(id, request.requestId, 'pending')
      try { await api.request('sendMessage', { conversationId: id, requestId: request.requestId, ...request.input }) }
      catch (failure) {
        updateSubmission(id, request.requestId, 'unknown')
        let receipt: Message | null | undefined
        try { receipt = await api.request('getMessageReceipt', { requestId: request.requestId }) } catch { /* Preserve the frozen request while its receipt is unknown. */ }
        if (receipt) { await acceptMessage(id, request); return }
        if (receipt === null) updateSubmission(id, request.requestId, 'not_accepted')
        throw failure
      }
      await acceptMessage(id, request)
    })
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
  const previewMaterial = (material: ConversationMaterial, line?: number, current?: () => boolean, navigated?: () => void) => openPanel({ type: 'material', id: material.id, conversationId: material.conversationId, name: material.name, revision: material.revision, line, requestId: crypto.randomUUID() }, 'conversations', current, navigated)
  const previewArtifact = (artifact: Artifact, conversationId: string, scope: string = route.page, current?: () => boolean, navigated?: () => void) => {
    if (!artifact.id) { toast.error('本版成果尚无可核对身份，请刷新后重试。'); return }
    openPanel({ type: 'artifact', id: artifact.id, logicalArtifactId: artifact.logicalArtifactId ?? artifact.id, conversationId, name: artifact.name, contentHash: artifact.contentHash ?? '', contentVersion: artifact.contentVersion, requestId: crypto.randomUUID() }, scope, current, navigated)
  }
  const searchSourceUnavailable = (target: ConversationSearchTarget) => {
    const key = readingSourceKey(target); setSourceChecks(values => ({ ...values, [key]: (values[key] ?? 0) + 1 }))
    if (target.kind === 'message' && selectedRef.current === target.conversationId) void refreshDetail(target.conversationId)
  }
  const openSearchResult = async (result: ConversationSearchResult, current: () => boolean, navigated: () => void) => {
    if (!api || !current() || routeRef.current.page !== 'conversations') return
    const target = result.target
    const visible = () => mounted.current && current() && routeRef.current.page === 'conversations' && snapshotRef.current.conversations.some(item => item.id === target.conversationId && !item.list?.hidden)
    let pending: Promise<void> | undefined
    navigate(() => {
      pending = (async () => {
        if (!visible()) return
        const checked = await api.request('resolveConversationSearchTarget', target)
        if (!visible()) return
        if (!sameSearchTarget(target, checked.target) || checked.status !== 'available') throw new Error(checked.reason ?? '原检索对象已不可用，请重新搜索。')
        const metadata = await api.request('getConversationMetadata', { id: target.conversationId })
        if (!visible()) return
        if (metadata.conversation.id !== target.conversationId || metadata.conversation.list?.hidden) throw new Error('原会话已从列表移除，请重新搜索。')
        if (target.kind === 'conversation' || target.kind === 'message') {
          applyRoute({ page: 'conversations', conversationId: target.conversationId, focusMessage: target.kind === 'message' ? { id: target.messageId, requestId: crypto.randomUUID() } : undefined }); navigated(); return
        }
        if (target.kind === 'material') {
          const preview = await api.request('getMaterialPreview', { id: target.materialId, expectedRevision: target.revision })
          if (!visible()) return
          if (preview.material.conversationId !== target.conversationId || target.contentHash && preview.material.contentHash !== target.contentHash) throw new Error('原材料版本已变化，请重新搜索。')
          previewMaterial(preview.material, undefined, visible, navigated); return
        }
        const preview = await api.request('getArtifactPreview', { id: target.artifactId, expectedHash: target.contentHash })
        if (!visible()) return
        if (preview.artifact.conversationId !== target.conversationId || target.logicalArtifactId && preview.artifact.logicalArtifactId !== target.logicalArtifactId || target.contentVersion !== undefined && preview.artifact.contentVersion !== target.contentVersion) throw new Error('原成果版本已变化，请重新搜索。')
        previewArtifact(preview.artifact, target.conversationId, 'conversations', visible, navigated)
      })()
      void pending.catch(failure => { if (visible()) { searchSourceUnavailable(target); toast.error(errorText(failure)) } })
    })
    await pending
  }
  const title = route.page === 'conversations' ? conversation?.title ?? '会话' : labels[route.page]
  const describePanel = (item: Panel) => {
    const title = item.type === 'artifact' ? '成果预览' : item.type === 'material' ? '材料原文' : item.type === 'skill-updates' ? '技能更新' : item.type === 'automation-editor' ? (item.id ? '编辑定时任务' : '新建定时任务') : item.type === 'agent' ? '数字员工' : item.type === 'group' ? '群聊详情' : item.type === 'trace' ? '执行过程' : item.type === 'activity' ? '任务与产物' : item.type === 'resource' ? '资源详情' : item.type === 'marketplace' ? '商店详情' : '任务详情'
    const name = item.type === 'artifact' || item.type === 'material' ? item.name : item.type === 'automation-editor' ? item.name : item.type === 'marketplace' ? item.name : item.type === 'trace' ? `执行过程${item.agentId ? ` · ${snapshot.agents.find(a => a.id === item.agentId)?.name ?? '员工'}` : ''}` : item.type === 'agent' ? snapshot.agents.find(a => a.id === item.id)?.name : item.type === 'group' ? snapshot.conversations.find(c => c.id === item.id)?.title : item.type === 'resource' ? snapshot.resources.find(r => r.id === item.id)?.name : undefined
    const context = item.type === 'agent' || item.type === 'artifact' || item.type === 'material' ? snapshot.conversations.find(c => c.id === item.conversationId)?.title : (item.type === 'activity' || item.type === 'trace') ? snapshot.conversations.find(c => c.id === item.id)?.title : undefined
    const sameType = detailTabs.tabs.filter(tab => tab.target.type === item.type && (item.type !== 'agent' || (tab.target.type === 'agent' && tab.target.id === item.id))).length > 1
    const label = `${name ?? title}${sameType && context ? ` · ${context}` : ''}`
    const Icon = item.type === 'skill-updates' ? RefreshCw : item.type === 'agent' ? Contact : item.type === 'group' ? Users : item.type === 'artifact' || item.type === 'material' || item.type === 'resource' || item.type === 'marketplace' ? FileText : item.type === 'trace' ? Workflow : item.type === 'activity' ? Terminal : Clock
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
  const resizer = (kind: 'list' | 'detail') => <div className={`resize-handle ${kind}-resizer`} role="separator" tabIndex={0} aria-label={kind==='list'?`调整${labels[route.page]}${route.page==='settings'?'分类':'列表'}宽度`:'调整详情宽度'} aria-orientation="vertical" aria-valuemin={kind==='list'?232:300} aria-valuemax={kind==='list'?360:detailMax} aria-valuenow={kind==='list'?listWidth:actualDetailWidth} onPointerDown={event=>startResize(kind,event)} onDoubleClick={()=>kind==='list'?setListWidth(DEFAULT_LIST_WIDTH):setDetailWidth(360)} onKeyDown={event=>resizeKey(kind,event)} />
  if (!api) return <div className="unavailable-page"><MessageCircle size={34}/><h1>请在桌面应用打开</h1><p>当前浏览器没有本地运行接口，无法访问员工、文件或模型。</p></div>
  return <GuardContext.Provider value={guard}><Tabs value={detailTabs.activeKey} onValueChange={value => { if (typeof value === 'string') dispatchDetails({ type: 'select', key: value }) }} className={`app-shell gap-0${effectiveList ? ' list-open' : ''}${skillsNavigation ? ' skills-navigation' : ''}`} data-page={route.page} style={{'--list-width':`${listWidth}px`,'--detail-width':`${actualDetailWidth}px`} as CSSProperties}>
    <DesktopToolbar title={title} browserAction={<HeaderBrowser api={api} conversation={conversation} agents={snapshot.agents} active={route.page === 'conversations'} />} detailHeader={panel && <DetailPanelHeader tabs={detailTabs.tabs.map(tab => ({ key: tab.key, ...describePanel(tab.target), dirty: Boolean(tabDirty[tab.key]) }))} activeKey={detailTabs.activeKey} onClose={requestCloseTab} onMove={(key, targetKey, placement) => dispatchDetails({ type: 'move', key, targetKey, placement })} />} showListToggle={route.page === 'conversations' || route.page === 'contacts' || route.page === 'schedules'} listLabel={route.page === 'conversations' ? '显示或隐藏会话列表' : route.page === 'contacts' ? '显示或隐藏通讯录列表' : '显示或隐藏任务列表'} listShown={listShown} detailOpen={Boolean(panel)} canBack={historyIndex.current > 0} canForward={historyIndex.current < history.current.length - 1} detailDisabled={!detailTabs.tabs.length && !(conversation && route.page === 'conversations') && route.page !== 'schedules'} onBack={() => navigate(() => { historyIndex.current--; applyRoute(history.current[historyIndex.current]!, false) })} onForward={() => navigate(() => { historyIndex.current++; applyRoute(history.current[historyIndex.current]!, false) })} onToggleList={() => setListShown(shown => !shown)} onToggleDetails={toggleDetails} />
    <div className="app-body"><nav className="navigation-rail" aria-label="主导航"><div className="rail-top">{([{page:'conversations',icon:Home,label:'会话'},{page:'contacts',icon:Contact,label:'通讯录'},{page:'schedules',icon:Clock,label:'定时任务'}] as const).map(item=><Button variant="ghost" size="content" className={`rail-item${route.page===item.page?' selected':''}`} key={item.page} aria-label={item.label} title={item.label} aria-current={route.page===item.page?'page':undefined} onClick={()=>goPage(item.page)}><item.icon size={16}/>{item.page==='conversations'&&snapshot.approvals.length>0&&<i className="attention-dot"/>}</Button>)}<SkillsNavigation page={route.page} onSkills={()=>goPage('skills')} /></div><div className="rail-bottom"><DropdownMenu open={menu === 'settings'} onOpenChange={open => setMenu(open ? 'settings' : null)}>
      <DropdownMenuTrigger render={<Button ref={userMenuButton} variant={route.page === 'settings' ? 'secondary' : 'ghost'} size="icon-lg" className="rail-item" aria-label="我的菜单" title="我" />}><UserAvatar profile={snapshot.userProfile} /></DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-[224px]">
        <DropdownMenuItem className="user-menu-profile" aria-label="个人资料" onClick={openUserProfile}><UserAvatar profile={snapshot.userProfile} /><span><strong>{snapshot.userProfile?.displayName ?? '我'}</strong>{snapshot.userProfile?.username && <small>@{snapshot.userProfile.username}</small>}</span></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => { setMenu(null); setSharingProfile(true) }}><Share />分享</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(() => { setSettingsSection('connections'); applyRoute({ ...route, page: 'settings' }) })}><Settings />设置</DropdownMenuItem>
          <DropdownMenuItem onClick={() => goPage('help')}><CircleHelp />帮助</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu></div></nav>
    <div className={`content-frame${panel?' detail-open':''}${effectiveList?' list-open':''}`}>
      <div className="content-main">{artifactStorageError&&<Banner onClose={()=>setArtifactStorageError('')}>{artifactStorageError}</Banner>}
      {<div className="conversation-layout" style={{ display: route.page === 'conversations' ? undefined : 'none' }}>{effectiveList&&<><aside className="conversation-list-container"><ConversationList api={api} active={route.page === 'conversations'} searchRequest={searchRequest} onSearchResult={openSearchResult} onSearchUnavailable={searchSourceUnavailable} onSearchOpenChange={setConversationSearchOpen} snapshot={snapshot} selectedId={selectedId} previews={previews} messageTimes={messageTimes} drafts={drafts.current} onCreateCore={createCoreConversation} onConfigureCore={() => { const core = snapshot.agents.find(isCoreAgent); if (core) openAgent(core) }} onSelect={selectConversation} onChange={changeConversationList} onEditTitle={setEditingTitle} onClear={clearConversationHistory} busy={busy} onCreate={type=>openCreation({type})}/></aside>{resizer('list')}</>}
        <div className="conversation-stage">{route.coreDraft?<CoreChatStart snapshot={snapshot} draft={draft} setDraft={setDraft} busy={busy} onSend={send} onSettings={()=>{setSettingsSection('connections');goPage('settings')}} onChangeAgent={changeComposerAgent} configurationLocked={anyDirty}/>:currentDetail?<ChatView api={api} questionReplies={questionReplies} onSearch={() => { setListShown(true); setSearchRequest({ conversationId: currentDetail.conversation.id, requestId: crypto.randomUUID() }) }} onReading={updateReading} onLocation={(messageId, following, offset) => { const id = currentDetail.conversation.id; viewLocations.current.set(id, { initialized: true, messageId: following ? undefined : messageId, offset, focusRequestId: viewLocations.current.get(id)?.focusRequestId }) }} onPage={direction => void loadMessagePage(direction)} paging={paging} pageEdges={pageEdges} restoreAnchor={viewLocations.current.get(currentDetail.conversation.id)?.messageId ? { messageId: viewLocations.current.get(currentDetail.conversation.id)!.messageId!, offset: viewLocations.current.get(currentDetail.conversation.id)?.offset } : undefined} pageActive={route.page === 'conversations' && !conversationSearchOpen} onTeamGroup={id => selectConversation(id, true)} key={currentDetail.conversation.id} detail={currentDetail} snapshot={snapshot} draft={draft} setDraft={setDraft} busy={busy || questionReplies.busy} onSend={send} onDetails={()=>{if(conversation)openPanel(conversation.kind==='group'?{type:'group',id:conversation.id}:{type:'agent',id:conversation.agentIds[0]!,conversationId:conversation.id})}} onConfigureAgent={agent => openAgent(agent, crypto.randomUUID())} onProfile={openUserProfile} onChangeConversationList={changeConversationList} onEditTitle={setEditingTitle} onClear={clearConversationHistory} onActivity={()=>{if(selectedId)openPanel({type:'activity',id:selectedId})}} onTrace={message=>{if(selectedId)openPanel({type:'trace',requestId:crypto.randomUUID(),id:selectedId,messageId:message?.id,turnId:message?.turnId,agentId:message?.senderId})}} onSettings={()=>{setSettingsSection('connections');goPage('settings')}} onChangeAgent={changeComposerAgent} configurationLocked={anyDirty} onApprove={(id,approved)=>{void action(async()=>{await api.request('approve',{id,approved});await refreshSnapshot();if(selectedRef.current)await refreshDetail(selectedRef.current)})}} onOpenPath={onOpenPath} onPreviewArtifact={artifact => previewArtifact(artifact, currentDetail.conversation.id)} onAddMaterial={()=>{if(selectedId)void materialDrafts.choose(selectedId)}} onDropMaterials={files=>{if(selectedId)void materialDrafts.drop(selectedId,files)}} onPasteMaterials={files=>{if(selectedId)void materialDrafts.paste(selectedId,files)}} onRemoveMaterial={item=>{if(selectedId)void materialDrafts.remove(selectedId,item)}} onRetryMaterial={item=>{if(selectedId)void materialDrafts.retry(selectedId,item)}} onPreviewMaterial={previewMaterial} onDiscardSubmission={clearUnacceptedSubmission} focusMessage={route.focusMessage} scrollPosition={scrollPositions.current.get(currentDetail.conversation.id)} onScrollPosition={position=>scrollPositions.current.set(currentDetail.conversation.id,position)}/>:loading||detailLoading?<Loading>正在载入工作空间…</Loading>:<IllustratedEmpty kind="conversations" />}</div>
      </div>}
      {route.page==='contacts'&&<ContactsPage onCreateTeam={() => openCreation({ type: 'team' })} api={api} snapshot={snapshot} selected={contactSelection} onSelect={setContactSelection} onMessage={messageContact} onCreate={type=>openCreation({type})} refresh={refreshSnapshot} sidebarShown={effectiveList} divider={resizer('list')} generation={panelGeneration} busy={busy}/>}
      {route.page==='skills'&&<SkillsWorkspace api={api} section={skillsSection} onSection={setSkillsSection} provider={skillProvider} onProvider={setSkillProvider} divider={resizer('list')} onCheckUpdates={()=>openPanel({type:'skill-updates'})} focusSkill={focusedSkill} revision={skillsRevision} />}
      <SchedulePage api={api} snapshot={snapshot} active={route.page==='schedules'} sidebarShown={effectiveList} divider={resizer('list')} location={scheduleLocation} onLocation={setScheduleLocation} onEdit={(definition,mode)=>openPanel({type:'automation-editor',id:definition?.id,name:definition?.name,mode})} onConversation={(id, messageId)=>selectConversation(id, true, messageId)} onInfo={()=>openPanel({type:'schedule'})}/>
      {settingsMounted.current && <div style={{ display: route.page === 'settings' ? 'contents' : 'none' }}><SettingsPage key={panelGeneration} divider={resizer('list')} tab={settingsSection} setTab={setSettingsSection} active={route.page === 'settings'} onSkill={id => openPanel({ type: 'resource', id }, 'settings')} api={api} snapshot={snapshot} refresh={refreshSnapshot}/></div>}
      {route.page==='help'&&<HelpPage/>}
      </div>
      {panel && resizer('detail')}
      {!!allDetailTabs.length && <DetailPanel title={panelTitle} hidden={!panel}>
        {/* Keep content DOM order stable when only the header tabs move. */}
        {[...allDetailTabs].sort((a, b) => a.key.localeCompare(b.key)).map(tab => {
          const target = tab.target, active = tab.scope === route.page && detailTabs.shown && tab.key === detailTabs.activeKey
          const artifactScope = target.type === 'artifact' ? artifactPendingScope(artifactPending, tab.scope, target.conversationId, target.logicalArtifactId) : tab.scope
          return <DetailTabSession key={tab.key} tabKey={tab.key} active={active} ref={handle => { if (handle) tabHandles.current.set(tab.key, handle); else tabHandles.current.delete(tab.key) }} onClose={() => closeTab(tab.key, tab.scope)} onDirty={onTabDirty}>
            {target.type === 'agent' && (snapshot.agents.find(a => a.id === target.id) ? <EmployeeDetail api={api} snapshot={snapshot} agent={snapshot.agents.find(a => a.id === target.id)!} conversationId={target.conversationId} configurationRequest={target.configurationRequest} active={active} scope={tab.scope} refresh={refreshSnapshot} onClose={() => closeTab(tab.key, tab.scope)} /> : <p className="empty-note">该员工已不存在。</p>)}
            {target.type === 'group' && (snapshot.conversations.some(conversation => conversation.id === target.id) ? <GroupEditor api={api} snapshot={snapshot} conversation={snapshot.conversations.find(c => c.id === target.id)} onOpenAgent={id => openPanel({ type: 'agent', id, conversationId: target.id }, tab.scope)} onClose={() => closeTab(tab.key, tab.scope)} onSaved={async result => { await refreshSnapshot(); if (selectedRef.current === result.id) await refreshDetail(result.id) }} onDeleted={refreshSnapshot} /> : <p className="empty-note">该群聊已解散。</p>)}
            {target.type === 'activity' && <ActivityTab api={api} conversationId={target.id} active={active} workId={target.workId} requestId={target.requestId} currentDetail={currentDetail} snapshot={snapshot} busy={busy} onOpenPath={onOpenPath} onPreviewArtifact={artifact => previewArtifact(artifact, target.id, tab.scope)} onStopWork={workId => { void action(async () => { await api.request('cancelRun', { conversationId: target.id, workId }); if (selectedRef.current === target.id) await refreshDetail(target.id) }) }} />}
            {target.type === 'artifact' && <ArtifactTab sourceRevision={sourceChecks[readingSourceKey({ kind: 'artifact', conversationId: target.conversationId, artifactId: target.id })] ?? 0} api={api} conversationId={target.conversationId} id={target.id} logicalArtifactId={target.logicalArtifactId} contentHash={target.contentHash} expectedContentVersion={target.contentVersion} requestId={target.requestId} active={active} snapshot={snapshot} pending={artifactPending[artifactPendingKey(artifactScope, target.conversationId, target.logicalArtifactId)]} onPending={value => saveArtifactPending(artifactPendingKey(artifactScope, target.conversationId, target.logicalArtifactId), { scope: artifactScope, conversationId: target.conversationId, logicalArtifactId: target.logicalArtifactId, ...value })} onVersion={artifact => previewArtifact(artifact, target.conversationId, tab.scope)} onPreviewMaterial={previewMaterial} onMessage={messageId => selectConversation(target.conversationId, true, messageId)} onActivity={() => openPanel({ type: 'activity', id: target.conversationId }, tab.scope)} onOpenPath={onOpenPath} onSubmitted={() => { if (selectedRef.current === target.conversationId) void refreshDetail(target.conversationId) }} />}
            {target.type === 'material' && <MaterialTab sourceRevision={sourceChecks[readingSourceKey({ kind: 'material', conversationId: target.conversationId, materialId: target.id, revision: target.revision })] ?? 0} api={api} conversationId={target.conversationId} id={target.id} revision={target.revision} active={active} line={target.line} requestId={target.requestId} />}
            {target.type === 'trace' && <TraceTab key={target.requestId} api={api} conversationId={target.id} messageId={target.messageId} agentId={target.agentId} active={active} snapshot={snapshot} busy={busy} onRetry={id => { void action(async () => { await api.request('retryRun', { id, requestId: crypto.randomUUID() }); if (selectedRef.current === target.id) await refreshDetail(target.id) }) }} />}
            {target.type === 'resource' && (snapshot.resources.find(r => r.id === target.id) ? <ResourceDetail api={api} resource={snapshot.resources.find(r => r.id === target.id)!} snapshot={snapshot} refresh={refreshSnapshot} onRemoved={() => closeTab(tab.key, tab.scope)} onAgent={agent => openPanel({ type: 'agent', id: agent.id }, tab.scope)} /> : <p className="empty-note">该资源已被移除。</p>)}
            {target.type === 'marketplace' && <SkillMarketplaceDetail api={api} provider={target.provider} id={target.id} refresh={refreshSnapshot} onResource={() => { setSkillsSection('all'); goPage('skills') }} />}
            {target.type === 'skill-updates' && <div className="detail-section"><SkillUpdateBatchView api={api} active={active} autoStart localOnly onUpdated={skillUpdated} onResource={openLocalSkill} /></div>}
            {target.type === 'schedule' && <ScheduleDetail />}
            {target.type === 'automation-editor' && <AutomationEditorTab api={api} snapshot={snapshot} id={target.id} mode={target.mode} onClose={() => closeTab(tab.key, tab.scope)} onSaved={(value, created) => { setScheduleLocation({ kind: 'definition', id: value.id }); if (created) closeTab(tab.key, tab.scope); else dispatchDetails({ type: 'open', target: { type: 'automation-editor', id: value.id, name: value.name } }, tab.scope) }} />}
          </DetailTabSession>
        })}
      </DetailPanel>}
      {editingTitle && <ConversationTitleDialog conversation={editingTitle} busy={busy} onSave={saveConversationTitle} onClose={() => setEditingTitle(null)} />}
      {creation?.type==='agent'&&<CreateAgentDialog key={`agent-${panelGeneration}`} api={api} snapshot={snapshot} template={creation.template} onClose={()=>setCreation(null)} onCreated={createdConversation}/>}
      {creation?.type==='group'&&<CreateGroupDialog key={`group-${panelGeneration}`} api={api} snapshot={snapshot} onClose={()=>setCreation(null)} onCreated={createdConversation}/>}
      <TeamCreator open={creation?.type==='team'} api={api} snapshot={snapshot} onOpenChange={open=>{if(!open)setCreation(null)}} onStarted={coreConversationStarted} onConfigure={()=>{setSettingsSection('connections');goPage('settings')}}/>
      {sharingProfile && <ProfileShare api={api} profile={snapshot.userProfile} onClose={() => setSharingProfile(false)} finalFocus={userMenuButton} />}
      {confirmation}
    </div></div>
  </Tabs></GuardContext.Provider>
}

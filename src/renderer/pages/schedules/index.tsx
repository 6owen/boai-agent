/*
 * [OUTPUT]: 全局自动化作为跨归属总览，按员工/群显示筛选；新建复用归属表单，对话创建归原员工入口。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 执行说明统一模型API/本机Agent分类，受支持协议与命令限制保持。
 * [INPUT]: 自动化投影、明确阅读位置、Shell 页面活跃状态与现有编辑标签/分栏。
 * [OUTPUT]: 说明按实际开放API、本机Codex和Claude受控文件/知识任务，旧ACP和命令自动执行保持限制。
 * [OUTPUT]: 总览搜索筛选、通讯录式两组侧栏、任务/全历史/单次结果导航；保留折叠与滚动，隐藏页面停止列表读取。
 * [POS]: schedules 主阅读页，创建与编辑交给唯一右侧草稿。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState, useContext, useRef, type ReactNode } from 'react'
import type { AutomationDefinition, AutomationsView, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, GuardContext, Loading, useMutation } from '@/components/common'
import { ChevronRight, MoreHorizontal, Plus, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AutomationHistory, AutomationOccurrenceView, occurrenceStatusLabels } from './automation-history'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { automationOwnerKey, automationOwnerLabel } from './automation-owner'
import { SelectField } from '@/components/ui/select-field'
import type { AutomationEditorMode } from './automation-editor'
export type ScheduleLocation = { kind: 'overview' } | { kind: 'definition'; id: string } | { kind: 'history'; attention?: boolean } | { kind: 'occurrence'; id: string; requestId: string }
type Plan = AutomationsView['definitions'][number]
const orderPlans = (a: Plan, b: Plan) => (a.nextTimes[0] ?? 'z').localeCompare(b.nextTimes[0] ?? 'z') || a.id.localeCompare(b.id)
const repeat = (d: AutomationDefinition) => d.frequency === 'daily' ? '每天' : JSON.stringify(d.daysOfWeek) === '[1,2,3,4,5]' ? '工作日' : `每周${(d.daysOfWeek ?? [d.weekday]).map(day => ['日', '一', '二', '三', '四', '五', '六'][day]).join('、')}`
const planStatus = (d: AutomationDefinition) => !d.enabled ? '已暂停' : d.sync === 'error' ? '同步失败' : d.sync === 'pending' ? '等待同步' : '已开启'
const nextLabel = (d: Plan) => d.nextTimes[0] ? new Intl.DateTimeFormat('zh-CN', { timeZone: d.timezone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d.nextTimes[0])) : '暂无下次执行时间'
export function SchedulePage({ api, snapshot, active, sidebarShown, divider, location, onLocation, onEdit, onConversation, onInfo }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; sidebarShown: boolean; divider: ReactNode; location: ScheduleLocation; onLocation(value: ScheduleLocation): void; onEdit(definition?: AutomationDefinition, mode?: AutomationEditorMode): void
  onConversation(id: string, messageId?: string): void; onInfo(): void
}) {
  const [view, setView] = useState<AutomationsView>({ definitions: [], occurrences: [], available: true })
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(''), [query, setQuery] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [filter, setFilter] = useState<'all' | 'enabled' | 'paused' | 'attention'>('all')
  const [upcomingOpen, setUpcomingOpen] = useState(true), [recordsOpen, setRecordsOpen] = useState(true)
  const guard = useContext(GuardContext), { busy, error, run } = useMutation()
  const main = useRef<HTMLElement>(null), positions = useRef(new Map<string, number>())
  const locationKey = location.kind + ('id' in location ? location.id : '')
  const refresh = async () => { setView(await api.request('listAutomations', undefined)); setLoading(false) }
  useEffect(() => {
    if (!active) return
    let live = true, queued = false, reading = false, again = false
    const update = async () => {
      if (reading) { again = true; return }
      reading = true
      try { const value = await api.request('listAutomations', undefined); if (live) { setView(value); setLoading(false); setLoadError('') } }
      catch (cause) { if (live) { setLoadError(String(cause)); setLoading(false) } }
      finally { reading = false; if (again && live) { again = false; void update() } }
    }
    void update()
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !queued) { queued = true; queueMicrotask(() => { queued = false; if (live) void update() }) } })
    return () => { live = false; unsubscribe() }
  }, [api, active])
  useEffect(() => { if (active && main.current) main.current.scrollTop = positions.current.get(locationKey) ?? 0 }, [active, locationKey])
  const definition = location.kind === 'definition' ? view.definitions.find(d => d.id === location.id) : undefined
  const search = query.trim().toLocaleLowerCase()
  const definitions = view.definitions.filter(d => (!ownerFilter || (ownerFilter === 'unassigned' ? !d.owner : automationOwnerKey(d.owner) === ownerFilter)) && `${d.name} ${d.prompt}`.toLocaleLowerCase().includes(search) && (filter === 'all' || (filter === 'attention' ? (d.attentionCount ?? 0) > 0 || d.sync === 'error' : filter === 'enabled' ? d.enabled : !d.enabled))).sort(orderPlans)
  const upcoming = view.definitions.filter(d => d.enabled && d.sync === 'synced' && d.nextTimes.length).sort(orderPlans)
  const records = [...view.occurrences].sort((a,b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id)).slice(0,10)
  const navigate = (value: ScheduleLocation) => guard.navigate(() => onLocation(value))
  const openOccurrence = (id: string) => navigate({ kind: 'occurrence', id, requestId: crypto.randomUUID() })
  const actions = (d: AutomationDefinition) => <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`操作 ${d.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => onEdit(d)}>编辑</DropdownMenuItem>
    <DropdownMenuItem disabled={busy} onClick={() => void run(async () => { await api.request(d.enabled ? 'pauseAutomation' : 'resumeAutomation', { id: d.id }); await refresh() })}>{d.enabled ? '暂停计划' : '恢复计划'}</DropdownMenuItem>
    <DropdownMenuItem disabled={busy} onClick={() => void run(async () => { await api.request('runAutomation', { id: d.id, requestId: crypto.randomUUID() }); await refresh(); onLocation({ kind: 'definition', id: d.id }) })}>立即运行一次</DropdownMenuItem>
    <DropdownMenuItem disabled={busy} onClick={() => void run(async () => { await api.request('deleteAutomation', { id: d.id }); if (location.kind === 'definition' && location.id === d.id) onLocation({ kind: 'overview' }); await refresh() })}>删除计划</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>
  return <div className="schedule-page" style={active ? undefined : { display: 'none' }}>
    <aside className="schedule-list" aria-label="任务列表" style={sidebarShown ? undefined : { display: 'none' }}>
      <div className="list-heading"><h2>定时任务</h2><Button variant="ghost" size="icon-sm" aria-label="定时执行说明" onClick={onInfo}><MoreHorizontal /></Button></div>
      <Button variant="ghost" size="content" className="schedule-create" aria-label="新建任务" onClick={() => onEdit()}><Plus /><span>新建任务</span></Button>
      <Collapsible open={upcomingOpen} onOpenChange={setUpcomingOpen}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading" />}><span>即将执行</span><ChevronRight /></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="即将执行">{upcoming.map(d => <Button variant="ghost" size="content" key={d.id} className={`schedule-item${definition?.id === d.id ? ' selected' : ''}`} onClick={() => navigate({ kind: 'definition', id: d.id })}><strong>{d.name}</strong><small>{nextLabel(d)} · {repeat(d)}</small></Button>)}{!upcoming.length && <p className="schedule-no-results">暂无即将执行的任务</p>}</div></CollapsibleContent>
      </Collapsible>
      <Button variant="ghost" size="content" className="schedule-history-link" onClick={() => navigate({ kind: 'overview' })}>查看全部任务<ChevronRight /></Button>
      <Collapsible open={recordsOpen} onOpenChange={setRecordsOpen}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading" />}><span>执行记录</span><ChevronRight /></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="最近执行记录">{records.map(o => <Button variant="ghost" size="content" key={o.id} className={`schedule-item${location.kind === 'occurrence' && location.id === o.id ? ' selected' : ''}`} onClick={() => openOccurrence(o.id)}><strong>{o.name}</strong><small>{new Date(o.startedAt).toLocaleString()} · {o.deliveryStatus === 'delivered' ? '已交付' : occurrenceStatusLabels[o.status]}</small></Button>)}{!records.length && <p className="schedule-no-results">暂无执行记录</p>}</div></CollapsibleContent>
      </Collapsible>
      <Button variant="ghost" size="content" className="schedule-history-link" onClick={() => navigate({ kind: 'history' })}>查看全部记录<ChevronRight /></Button>
    </aside>{sidebarShown && divider}
    <main ref={main} className="schedule-content page-scroll" onScroll={e => { if (active) positions.current.set(locationKey, e.currentTarget.scrollTop) }}>
      {(error || loadError || view.error) && <Banner>{error || loadError || view.error}</Banner>}
      <div className="schedule-document">
        <div hidden={location.kind !== 'overview'}>
          <div className="schedule-overview-heading"><div><h2>定时任务</h2><p className="field-hint">汇总各员工和群聊的自动化计划与执行结果</p></div><div className="schedule-overview-tools">
            <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索定时任务" placeholder="搜索任务" value={query} onChange={e => setQuery(e.target.value)} /></InputGroup>
            <div className="button-row"><Button onClick={() => onEdit()}>创建</Button><DropdownMenu><DropdownMenuTrigger render={<Button variant="secondary" size="icon-sm" aria-label="更多创建方式" />}><ChevronRight /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEdit(undefined, 'monitor')}>监控已发布数据</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
          </div></div>
          <div className="button-row schedule-filters" aria-label="任务状态筛选">{([{ value:'all',label:'全部' }, { value:'enabled',label:'已开启' }, { value:'paused',label:'已暂停' }, { value:'attention',label:'需处理' }] as const).map(item => <Button key={item.value} variant={filter === item.value ? 'secondary' : 'ghost'} size="sm" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</div>
          <SelectField aria-label="按归属筛选" value={ownerFilter} onValueChange={setOwnerFilter} options={[{ value: '', label: '全部员工与群聊' }, { value: 'unassigned', label: '待确认归属' }, ...[...new Map(view.definitions.filter(d => d.owner).map(d => [automationOwnerKey(d.owner), { value: automationOwnerKey(d.owner), label: automationOwnerLabel(d.owner, snapshot) }])).values()]]} />
          {loading ? <Loading>正在载入任务…</Loading> : !view.definitions.length ? <IllustratedEmpty kind="schedules" title="安排你的第一个定时任务"><Button onClick={() => onEdit()}>新建任务</Button></IllustratedEmpty> : !definitions.length ? <p className="empty-note">没有符合条件的任务</p> : <div className="schedule-overview-list">{definitions.map(d => <div key={d.id} className="schedule-overview-row"><Button variant="ghost" size="content" className="schedule-overview-plan" onClick={() => navigate({ kind:'definition',id:d.id })}><strong>{d.name}</strong><span>{automationOwnerLabel(d.owner, snapshot)} · {repeat(d)} {d.time} · {planStatus(d)}</span><small>下次：{nextLabel(d)}{(d.attentionCount ?? 0) > 0 ? ` · ${d.attentionCount} 次需处理` : ''}</small></Button>{actions(d)}</div>)}</div>}
        </div>
        {location.kind !== 'overview' && <Button variant="ghost" size="sm" onClick={() => navigate({ kind: 'overview' })}>返回全部任务</Button>}
        {location.kind === 'definition' && (definition ? <>
          <div className="page-heading"><h2>{definition.name}</h2><div className="button-row"><Button variant="secondary" onClick={() => onEdit(definition)}>编辑</Button>{actions(definition)}</div></div>
          <section aria-label="计划摘要"><p>归属：{automationOwnerLabel(definition.owner, snapshot)}</p><p className="automation-prompt">{definition.prompt}</p><p>{repeat(definition)} {definition.time} · {definition.timezone} · {planStatus(definition)}</p><p>下次：{nextLabel(definition)}</p><p className="field-hint">{definition.conversationPolicy === 'new-conversation' ? `新任务聊天 · ${snapshot.agents.find(a => a.id === definition.employeeIds?.[0])?.name ?? '员工不可用'}` : snapshot.conversations.find(c => c.id === definition.conversationId)?.title ?? '聊天已不可用'}</p></section>
          {definition.syncError && <Banner>{definition.syncError}</Banner>}
          <AutomationHistory key={definition.id} api={api} active={active} automationId={definition.id} latestOccurrenceId={definition.latestOccurrence?.id} onConversation={onConversation} onOccurrence={openOccurrence} />
        </> : !loading && <Banner>此任务已删除或不可用，留存结果仍可在执行记录中查看。</Banner>)}
        <div hidden={location.kind !== 'history'}><h2>执行记录</h2><AutomationHistory api={api} active={active && location.kind === 'history'} attentionOnly={location.kind === 'history' && location.attention} onConversation={onConversation} onOccurrence={openOccurrence} /></div>
        {location.kind === 'occurrence' && <AutomationOccurrenceView key={location.requestId} api={api} active={active} id={location.id} onConversation={onConversation} />}
      </div>
    </main>
  </div>
}
export function ScheduleDetail(){return <div className="detail-section"><h2>定时执行说明</h2><p>应用打开、最小化或 macOS 关闭窗口后仍可执行；真正退出或休眠期间不执行。</p><p>报告任务使用原有员工和群协作流程，结果保留在会话中。数据监控按保存的规则检查已发布文件，比较证据和失败原因保留在执行记录中。</p><p>支持模型 API 和已验证且具备相应能力的本机 Agent 员工执行受控文件、知识任务。需要模型 API 的本机 Agent 须明确配置模型来源。API员工沿原自动化权限；本机Agent按原生配置执行。外部ACP暂不支持自动执行。</p><p>暂停未来计划不会停止当前执行；需要时在执行记录中停止本次。运行明细保留通知回执；API员工显示用量和预算，本机Agent自主执行。</p></div>}

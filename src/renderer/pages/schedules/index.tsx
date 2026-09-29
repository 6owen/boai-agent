/*
 * [INPUT]: 自动化领域类型、DesktopApi、侧栏显示状态与 Shell 共用分栏拖拽线、共享控件、统一 UI 基础组件。
 * [OUTPUT]: 任务列表复用 Shell 可调分栏，隐藏列表时同步隐藏拖拽线；共用无标题且不可选中/拖拽的小熊时钟 SVG 空态和新建入口；左栏复用会话标题布局、字号、间距与语义颜色；监控来源及结果保存位置/零模型说明；需处理状态筛选与独立排序、两行摘要/实际下次时间、最新结果优先阅读；通知到达时定位包括已删计划在内的单次记录；计划列表/排序/摘要与纯阅读区，交由现有右侧标签编辑、完整历史组件读取记录与定位结果。
 * [POS]: schedules 页面；业务操作沿用现有 IPC 与未保存保护。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { useEffect, useState, useContext, type ReactNode } from 'react'
import type { AutomationDefinition, AutomationsView, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, GuardContext, Loading, useMutation } from '@/components/common'
import { ChevronRight, MoreHorizontal, Plus, Search, Sliders, X } from '@/components/icons'
import { AutomationHistory, occurrenceStatusLabels } from './automation-history'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
export function SchedulePage({ api, snapshot, sidebarShown, divider, selected, focusOccurrence, onSelect, onEdit, onConversation, onInfo }: {
  api: DesktopApi; snapshot: Snapshot; sidebarShown: boolean; divider: ReactNode; selected: string | null; focusOccurrence?: { id: string; requestId: string }; onSelect(id: string | null): void; onEdit(definition?: AutomationDefinition): void
  onConversation: (id: string, messageId?: string) => void; onInfo: () => void
}) {
  const [view, setView] = useState<AutomationsView>({ definitions: [], occurrences: [], available: true })
  const [loading, setLoading] = useState(true), [historyShown, setHistoryShown] = useState(false), [attentionHistory, setAttentionHistory] = useState(false), [loadError, setLoadError] = useState('')
  const [searchShown, setSearchShown] = useState(false), [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'enabled' | 'paused' | 'attention'>('all')
  const [order, setOrder] = useState<'next' | 'latest' | 'name'>('next')
  const guard = useContext(GuardContext), { busy, error, run } = useMutation()
  const refresh = async () => { setView(await api.request('listAutomations', undefined)); setLoading(false) }
  useEffect(() => {
    let live = true, queued = false
    const update = () => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (live) void api.request('listAutomations', undefined).then(value => {
          if (live) { setView(value); setLoading(false); setLoadError('') }
        }).catch(cause => { if (live) { setLoadError(String(cause)); setLoading(false) } })
      })
    }
    void run(refresh)
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') update() })
    return () => { live = false; unsubscribe() }
  }, [api])
  const definition = view.definitions.find(d => d.id === selected)
  const syncIssues = view.definitions.filter(d => d.sync === 'error')
  const attentionCount = (view.attentionCount ?? 0) + syncIssues.length
  const definitions = view.definitions.filter(d => d.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'attention' ? (d.attentionCount ?? 0) > 0 || d.sync === 'error' : filter === 'enabled' ? d.enabled : !d.enabled))).sort((a, b) => (order === 'next' ? (a.nextTimes[0] ?? 'z').localeCompare(b.nextTimes[0] ?? 'z') : order === 'latest' ? (b.latestOccurrence?.finishedAt ?? b.latestOccurrence?.startedAt ?? '').localeCompare(a.latestOccurrence?.finishedAt ?? a.latestOccurrence?.startedAt ?? '') : 0) || a.name.localeCompare(b.name, 'zh-CN'))
  const openNew = () => onEdit()
  const openHistory = (onlyAttention = false) => guard.navigate(() => { onSelect(null); setHistoryShown(true); setAttentionHistory(onlyAttention) })
  const welcome = !definition && !historyShown && !focusOccurrence
  return <div className="schedule-page">
    {sidebarShown && <><aside className="schedule-list" aria-label="任务列表">
      <div className="list-heading"><h2>定时任务</h2><div className="list-heading-actions"><Button variant="ghost" size="icon-sm" aria-label="搜索任务" title="搜索任务" aria-expanded={searchShown} onClick={() => { setSearchShown(!searchShown); setQuery('') }}><Search /></Button></div></div>
      {searchShown && <InputGroup className="schedule-search"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput autoFocus aria-label="搜索任务名称" placeholder="搜索任务" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setSearchShown(false) } }} /><InputGroupAddon align="inline-end"><Button variant="ghost" size="icon-sm" aria-label="关闭任务搜索" onClick={() => { setQuery(''); setSearchShown(false) }}><X size={14} /></Button></InputGroupAddon></InputGroup>}
      <Button variant="ghost" size="content" className="schedule-create" aria-label="新建" onClick={openNew}><Plus /><span>新建任务</span></Button>
      <div className="schedule-section-heading"><span>{{ all: '全部任务', enabled: '已启用', paused: '已暂停', attention: '需处理' }[filter]}</span><div className="schedule-list-actions">
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="筛选任务" title="筛选任务" />}><Sliders /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-36"><DropdownMenuGroup><DropdownMenuLabel>显示任务</DropdownMenuLabel><DropdownMenuRadioGroup value={filter} onValueChange={value => setFilter(value as typeof filter)}>{([{ value: 'all', label: '全部任务' }, { value: 'enabled', label: '已启用' }, { value: 'paused', label: '已暂停' }, { value: 'attention', label: '需处理' }] as const).map(option => <DropdownMenuRadioItem closeOnClick key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup><DropdownMenuGroup><DropdownMenuLabel>排序</DropdownMenuLabel><DropdownMenuRadioGroup value={order} onValueChange={value => setOrder(value as typeof order)}>{([{ value: 'next', label: '即将执行' }, { value: 'latest', label: '最近执行' }, { value: 'name', label: '任务名称' }] as const).map(option => <DropdownMenuRadioItem closeOnClick key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
        <Button variant="ghost" size="icon-sm" aria-label="定时执行说明" title="定时执行说明" onClick={onInfo}><MoreHorizontal /></Button>
      </div></div>
      <div className="schedule-items">{definitions.map(d => <Button variant="ghost" size="content" key={d.id} className={`schedule-item${selected === d.id ? ' selected' : ''}`} onClick={() => guard.navigate(() => { onSelect(d.id); setHistoryShown(false) })}><strong>{d.name}</strong><span className="schedule-item-summary">{d.prompt}</span><small>{d.sync === 'error' ? '尚未启用 · 同步失败' : d.sync === 'pending' ? '等待同步' : d.enabled ? '已启用' : '已暂停'} · {d.nextTimes[0] ? `下次 ${new Intl.DateTimeFormat('zh-CN', { timeZone: d.timezone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d.nextTimes[0]))}` : d.time}{(d.attentionCount ?? 0) > 0 ? ` · ${d.attentionCount} 次需处理` : d.latestOccurrence ? ` · 最近：${occurrenceStatusLabels[d.latestOccurrence.status]}` : ''}</small></Button>)}{!definitions.length && !loading && (query || filter !== 'all') && <p className="schedule-no-results">没有符合条件的任务</p>}</div>
      <Button variant="ghost" size="content" className={`schedule-history-link${historyShown && !attentionHistory ? ' selected' : ''}`} onClick={() => openHistory()}>执行记录<ChevronRight size={16} /></Button>
      <Button variant="ghost" size="content" aria-label="查看待处理事项" className={`schedule-history-link${historyShown && attentionHistory ? ' selected' : ''}`} onClick={() => openHistory(true)}>需处理{attentionCount > 0 ? `（${attentionCount}）` : ''}<ChevronRight size={16} /></Button>
    </aside>{divider}</>}
    <main className={`schedule-content page-scroll${welcome ? ' is-welcome' : ''}`}>
      {(error || loadError || view.error) && <Banner>{error || loadError || view.error}</Banner>}
      {welcome ? loading ? <Loading>正在载入任务…</Loading> : <IllustratedEmpty kind="schedules"><Button onClick={openNew}>新建任务</Button></IllustratedEmpty> : <div className="schedule-document">
        <>
          <div className="page-heading"><div><h2>{definition?.name ?? (attentionHistory ? '待处理事项' : '执行记录')}</h2><p>{definition ? '查看最新结果、处理事项与执行记录。' : attentionHistory ? '等待补充或审批、失败、中断及未交付结果；打开记录不会将其标为已解决。' : '每次触发、结果和跳过原因都保存在这里。'}</p></div></div>
          {definition?.syncError && <section aria-label="计划需要处理"><h3>计划需要处理</h3><Banner>{definition.syncError}</Banner><Button variant="secondary" onClick={() => onEdit(definition)}>检查计划配置</Button></section>}
          {!definition && attentionHistory && !!syncIssues.length && <section aria-label="计划需要处理"><h3>计划需要处理</h3>{syncIssues.map(d => <div key={d.id}><p>{d.name} · {d.syncError ?? '同步失败'}</p><Button variant="secondary" onClick={() => onEdit(d)}>检查“{d.name}”计划</Button></div>)}</section>}
          <AutomationHistory key={`${selected ?? 'all'}:${!selected && attentionHistory}`} api={api} automationId={selected ?? undefined} attentionOnly={!selected && attentionHistory} latestOccurrenceId={definition?.latestOccurrence?.id} focusOccurrence={focusOccurrence} onConversation={onConversation} summary={definition ? <section aria-label="计划摘要"><h3>计划摘要</h3>
            <p>{definition.frequency === 'daily' ? '每天' : `每周${(definition.daysOfWeek ?? [definition.weekday]).map(day => ['日', '一', '二', '三', '四', '五', '六'][day]).join('、')}`} {definition.time} · {definition.timezone}</p>
            <p className="automation-prompt">{definition.prompt}</p><p className="field-hint">{definition.taskKind === 'monitor' ? `检查文件：${definition.monitor?.source.name} · 来源聊天：` : '结果写入：'}{definition.conversationPolicy === 'new-conversation' ? `每次新建任务聊天 · ${(definition.employeeIds ?? []).map(id => snapshot.agents.find(a => a.id === id)?.name ?? '员工不可用').join('、')}` : snapshot.conversations.find(c => c.id === definition.conversationId)?.title ?? '会话已不可用'}</p>
            <div className="button-row automation-actions">
              <Button disabled={busy} onClick={() => void run(async () => { await api.request('runAutomation', { id: definition.id, requestId: crypto.randomUUID() }); await refresh() })}>立即运行一次</Button>
              <Button variant="secondary" onClick={() => onEdit(definition)}>编辑{!definition.enabled ? ' / 启用' : ''}</Button>
              {definition.enabled && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api.request('pauseAutomation', { id: definition.id }); await refresh() })}>暂停计划</Button>}
              <Button variant="destructive" disabled={busy} onClick={() => void run(async () => { await api.request('deleteAutomation', { id: definition.id }); onSelect(null); await refresh() })}>删除计划</Button>
            </div>
            {definition.nextTimes.length > 0 && <details><summary>未来 5 次执行时间</summary><ol>{definition.nextTimes.map(t => <li key={t}>{new Intl.DateTimeFormat('zh-CN', { timeZone: definition.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t))}</li>)}</ol></details>}
            <p className="field-hint">{definition.taskKind === 'monitor' ? '检查已发布的数据，不调用模型；比较值、时间和来源证据保存在执行记录中。' : '每次新运行共用 5 分钟预算，最多 24 次模型请求和 8 次工作执行；判断、子工作、重试和记忆整理一并计入，等待不重置期限。'}并发或会话忙碌时跳过。错过超过 10 分钟不补跑。暂停计划不会停止已经开始的运行。</p></section> : undefined} />
        </>
      </div>}
    </main>
  </div>
}
export function ScheduleDetail(){return <div className="detail-section"><h2>定时执行说明</h2><p>应用打开、最小化或 macOS 关闭窗口后仍可执行；真正退出或休眠期间不执行。</p><p>报告任务使用原有员工和群协作流程，结果保留在会话中。数据监控按保存的规则检查已发布文件，比较证据和失败原因保留在执行记录中。</p><p>目前开放模型 API 员工的受控文件和知识任务。外部 Agent 与命令脚本不支持自动执行。</p></div>}

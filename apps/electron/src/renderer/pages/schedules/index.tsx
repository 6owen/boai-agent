/*
 * [OUTPUT]: 员工任务页统一普通任务/定时计划、员工筛选和独立任务工作区；日常聊天不承载任务过程。
 * [OUTPUT]: 列表右键删除固定所选任务，经统一AlertDialog确认后沿原删除接口提交；取消不提交，成功同步移除并退出已删任务详情。
 * [OUTPUT]: 定时任务侧栏委托独立标签/排序管理；说明移至标题Tooltip，原执行与详情行为保持。
 * [OUTPUT]: 立即运行只提交并全程loading防重复，两个图标分别打开过程和定位聊天；准备阶段保留等待提示。
 * [OUTPUT]: 重回定时任务页及首次异步载入详情也播放Panel reveal，后台数据刷新不重播。
 * [OUTPUT]: 对话创建转到会话页并预选管理定时任务技能；本页只保留手动创建/编辑Dialog及任务详情/历史。
 * [OUTPUT]: 详情/历史内容切换沿设置页Panel reveal，后台刷新不重播；滚动条占位由真实滚动区保持。
 * [OUTPUT]: 编辑主色/暂停中性/删除危险色；删除Popover只保留确认标题与按钮，取消不提交，失败保留确认入口。
 * [INPUT]: 计划投影、Shell页面状态、单员工编辑器与普通bobo会话导航。
 * [OUTPUT]: 40px操作行下统一执行记录列表，检索和分页留在主区，点击记录或查看图标打开Shell执行面板，运行按钮只受理并显示loading。
 * [POS]: 定时任务唯一管理页；员工入口只跳转至本页，隐藏停止读取。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useLayoutEffect, useRef, useState, useContext, type ReactNode } from 'react'
import type { AutomationsView, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, GuardContext, useMutation } from '@/components/common'
import { Plus, MessageCircle, Pencil } from '@/components/icons'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { AutomationHistory } from './automation-history-list'
import { FilterTabs } from '@/components/common/filter-tabs'
import { SelectField } from '@/components/ui/select-field'
import { TaskWorkspace, type TaskWorkspaceProps } from './task-workspace'
import { PanelResize } from '@/components/common/panel-resize'
import { AutomationRunActions } from './automation-run-actions'
import type { ExecutionMessageNavigation } from '@/components/detail-panel/execution-message-button'
import { AutomationDetails } from './automation-details'
import { AutomationDialog, type AutomationDialogTarget } from './automation-dialog'
import { ScheduleList } from './schedule-list'
import { useScheduleList } from './use-schedule-list'
export type ScheduleLocation = { kind: 'overview' } | { kind: 'definition'; id: string } | { kind: 'history'; attention?: boolean } | { kind: 'occurrence'; id: string; requestId: string; focusMessage?: { id: string; requestId: string } }
export function SchedulePage({ api, snapshot, active, sidebarShown, divider, location, onLocation, onOccurrence, onCreateConversation, selectedOccurrenceId, onNavigateMessage, taskWorkspace }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; sidebarShown: boolean; divider: ReactNode; location: ScheduleLocation; onLocation(value: ScheduleLocation): void
  taskWorkspace: Pick<TaskWorkspaceProps, 'onContext' | 'renderChat' | 'onMaterials'>
  onNavigateMessage: ExecutionMessageNavigation
  onOccurrence(id: string): void; onCreateConversation(): void; selectedOccurrenceId?: string
}) {
  const [view, setView] = useState<AutomationsView>({ definitions: [], occurrences: [], available: true })
  const [employee, setEmployee] = useState('all'), [kind, setKind] = useState('all')
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('')
  const [dialog, setDialog] = useState<AutomationDialogTarget>()
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const guard = useContext(GuardContext), { busy, error, run } = useMutation()
  useEffect(() => {
    if (!active) return
    let live = true, reading = false, again = false
    const update = async () => {
      if (reading) { again = true; return }
      reading = true
      try { const value = await api.request('listAutomations', undefined); if (live) { setView(value); setLoading(false); setLoadError('') } }
      catch (cause) { if (live) { setLoadError(String(cause)); setLoading(false) } }
      finally { reading = false; if (again && live) { again = false; void update() } }
    }
    void update()
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') void update() })
    return () => { live = false; unsubscribe() }
  }, [api, active])
  const definition = location.kind === 'definition' ? view.definitions.find(d => d.id === location.id) : undefined
  const content = useRef<HTMLDivElement>(null), previousContent = useRef('')
  const contentKey = location.kind === 'definition' ? `definition:${definition?.id ?? ''}` : location.kind
  useLayoutEffect(() => {
    if (!active) { previousContent.current = ''; return }
    const element = content.current
    if (!element) return
    const changed = previousContent.current !== contentKey
    previousContent.current = contentKey
    if (!changed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    element.style.transition = 'none'
    element.dataset.settled = 'false'
    element.dataset.open = 'false'
    void element.offsetWidth
    element.style.transition = ''
    element.dataset.open = 'true'
    const settle = (event: TransitionEvent) => { if (event.target === element && event.propertyName === 'opacity') element.dataset.settled = 'true' }
    element.addEventListener('transitionend', settle)
    return () => { element.removeEventListener('transitionend', settle); element.dataset.settled = 'true' }
  }, [contentKey, active])
  const preferences = useScheduleList(api, active)
  const navigate = (value: ScheduleLocation) => guard.navigate(() => onLocation(value), { resetOnDiscard: false })
  const openDialog = (target: AutomationDialogTarget) => guard.navigate(() => setDialog(target), { resetOnDiscard: false })
  const openOccurrence = (id: string) => navigate({ kind: 'occurrence', id, requestId: crypto.randomUUID() })
  const filtered = view.definitions.filter(d => (employee === 'all' || d.owner?.kind === 'employee' && d.owner.employeeId === employee || d.employeeIds?.includes(employee)) && (kind === 'all' || (kind === 'manual') === (d.frequency === 'manual')))
  return <div className="schedule-page" style={active ? undefined : { display: 'none' }}>
    <PanelResize open={sidebarShown} side="left" divider={divider}><aside className="schedule-list conversation-list-panel" aria-label="员工任务列表">
      <ScheduleList filters={<div className="flex flex-col gap-2 px-3 pb-2"><SelectField aria-label="筛选执行员工" value={employee} onValueChange={value => guard.navigate(() => { setEmployee(value); onLocation({ kind: 'overview' }) }, { resetOnDiscard: false })} options={[{ value: 'all', label: '全部员工' }, ...snapshot.agents.filter(a => view.definitions.some(d => d.employeeIds?.includes(a.id) || d.owner?.kind === 'employee' && d.owner.employeeId === a.id)).map(a => ({ value: a.id, label: a.name }))]} />
      <FilterTabs label="任务类型" value={kind} onValueChange={setKind} children={null} options={[{ value: 'all', label: '全部' }, { value: 'manual', label: '普通任务' }, { value: 'scheduled', label: '定时计划' }]} /></div>} definitions={filtered} preferences={preferences} loading={loading} busy={busy} selectedId={location.kind === 'definition' ? location.id : undefined} onSelect={id => navigate({ kind: 'definition', id })} onHistory={() => navigate({ kind: 'history' })} onDelete={setDeleting} create={
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="secondary" className="schedule-create" aria-label="新建任务" />}><Plus /><span>新建任务</span></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={() => openDialog({ kind: 'task', key: crypto.randomUUID() })}><Pencil />普通任务</DropdownMenuItem><DropdownMenuItem onClick={() => openDialog({ kind: 'manual', key: crypto.randomUUID() })}><Pencil />定时计划</DropdownMenuItem><DropdownMenuItem onClick={onCreateConversation}><MessageCircle />对话创建</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      } />
    </aside></PanelResize>
    <main className={location.kind === 'occurrence' ? "schedule-content min-h-0 overflow-hidden" : "schedule-content page-scroll"}>
      {(error || loadError || view.error) && <Banner>{error || loadError || view.error}</Banner>}
      {location.kind === 'overview' && <div className="schedule-document"><h2>任务执行</h2><AutomationHistory api={api} active={active} employeeId={employee === 'all' ? undefined : employee} selectedId={selectedOccurrenceId} onOccurrence={openOccurrence} /></div>}
      {location.kind === 'occurrence' && <TaskWorkspace {...taskWorkspace} key={location.id} api={api} snapshot={snapshot} id={location.id} focusMessage={location.focusMessage} active={active} onProcess={onOccurrence} onDefinition={id => navigate({ kind: 'definition', id })} />}
      {location.kind === 'definition' && (definition ? <div ref={content} className="schedule-document schedule-content-transition t-panel-slide" data-open="true" data-settled="true">
        <div className="page-heading"><h2>{definition.name}</h2><div className="button-row" role="group" aria-label="定时任务操作">
          <Button disabled={busy} onClick={() => openDialog({ kind: 'manual', id: definition.id, key: crypto.randomUUID() })}>编辑</Button>
          {definition.frequency !== 'manual' && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api.request(definition.enabled ? 'pauseAutomation' : 'resumeAutomation', { id: definition.id }) })}>{definition.enabled ? '暂停' : '恢复'}</Button>}
          <DeleteAutomationButton key={definition.id} name={definition.name} busy={busy} onConfirm={() => void run(async () => { await api.request('deleteAutomation', { id: definition.id }); onLocation({ kind: 'overview' }) })} />
        </div></div>
        <AutomationDetails definition={definition} snapshot={snapshot} action={<AutomationRunActions key={definition.id} api={api} automationId={definition.id} occurrences={view.occurrences} active={active} onOccurrence={openOccurrence} onNavigateMessage={onNavigateMessage} />} />
        {definition.syncError && <Banner>{definition.syncError}</Banner>}
        <AutomationHistory key={definition.id} api={api} active={active} automationId={definition.id} selectedId={selectedOccurrenceId} onOccurrence={openOccurrence} />
      </div> : !loading && <Banner>此任务已删除或不可用，留存结果仍可在执行记录中查看。</Banner>)}
      {<div ref={location.kind === 'history' ? content : undefined} hidden={location.kind !== 'history'} className="schedule-document schedule-content-transition t-panel-slide" data-open="true" data-settled="true"><AutomationHistory api={api} employeeId={employee === 'all' ? undefined : employee} active={active && location.kind === 'history'} attentionOnly={location.kind === 'history' && location.attention} selectedId={selectedOccurrenceId} onOccurrence={openOccurrence} /></div>}
    </main>
    <AlertDialog open={active && Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle className="break-words">删除“{deleting?.name}”？</AlertDialogTitle><AlertDialogDescription>删除后不再按计划执行，已有执行记录保留。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busy || !deleting} onClick={() => {
          if (!deleting) return
          const id = deleting.id
          void run(async () => {
            await api.request('deleteAutomation', { id })
            setView(current => ({ ...current, definitions: current.definitions.filter(task => task.id !== id) }))
            setDeleting(null)
            if (location.kind === 'definition' && location.id === id) onLocation({ kind: 'overview' })
          })
        }}>确认删除</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {dialog && <AutomationDialog key={dialog.key} api={api} snapshot={snapshot} active={active} target={dialog} onClose={() => setDialog(undefined)} onSaved={value => {
      setView(current => ({ ...current, definitions: [{ ...value, nextTimes: [] }, ...current.definitions.filter(d => d.id !== value.id)] }))
      setDialog(undefined); onLocation({ kind: 'definition', id: value.id })
    }} />}
  </div>
}
function DeleteAutomationButton({ name, busy, onConfirm }: { name: string; busy: boolean; onConfirm(): void }) {
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
    <PopoverTrigger render={<Button variant="destructive" disabled={busy} />}>删除</PopoverTrigger>
    <PopoverContent align="end">
      <PopoverTitle className="break-words">删除“{name}”？</PopoverTitle>
      <div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>{busy ? '正在删除…' : '确认删除'}</Button></div>
    </PopoverContent>
  </Popover>
}
export function ScheduleDetail(){return <div className="detail-section"><h2>定时执行说明</h2><p>应用打开、最小化或 macOS 关闭窗口后仍可执行；真正退出或休眠期间不执行。</p><p>任务使用员工原有执行能力，过程和结果保留在独立任务上下文。同一员工按队列顺序执行，等待补充时释放计算名额。数据监控按保存的规则检查已发布文件，比较证据和失败原因保留在执行记录中。</p><p>支持模型 API 和已验证且具备相应能力的本机 Agent 员工执行受控文件、知识任务。需要模型 API 的本机 Agent 须明确配置模型来源。API员工沿原自动化权限；本机Agent按原生配置执行。外部ACP暂不支持自动执行。</p><p>暂停未来计划不会停止当前执行。</p></div>}

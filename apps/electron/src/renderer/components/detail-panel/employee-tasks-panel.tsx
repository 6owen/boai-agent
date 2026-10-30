/*
 * [OUTPUT]: 仅在员工主会话右侧挂载；任务上下文按实际标签身份隔离。
 * [INPUT]: 固定员工身份、原任务分页与受理接口、共享任务详情交互。
 * [OUTPUT]: 员工右侧当前任务/队列/历史与普通任务创建；隐藏停读，定时计划保持原管理页。
 * [POS]: 员工任务面板，不复制执行内核或把任务写入日常聊天。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import type { AutomationDefinition, AutomationHistoryPage, AutomationListPage, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loading, errorText, showErrorToast } from '@/components/common'
import { AutomationDialog, type AutomationDialogTarget } from '@/pages/schedules/automation-dialog'
import { AutomationHistory } from '@/pages/schedules/automation-history-list'
import { occurrenceStatusLabels } from '@/pages/schedules/automation-history'
import { EmployeeTaskDetail, type EmployeeTaskDetailProps } from './employee-task-detail'
import type { DetailTarget } from './tabs-state'

export const EmployeeTasksNavigation = createContext<(employeeId: string) => void>(() => {})
type Props = Pick<EmployeeTaskDetailProps, 'renderChat' | 'onMaterials' | 'onProcess'> & {
  api: DesktopApi; snapshot: Snapshot; employeeId: string; active: boolean
  contextKey?: string
  target: Extract<DetailTarget, { type: 'employee-tasks' }>
  onContext(employeeId: string, conversationId?: string): void
}
export function EmployeeTasksPanel({ api, snapshot, employeeId, contextKey = employeeId, target, active, onContext, ...detail }: Props) {
  const [selected, setSelected] = useState(target.occurrenceId)
  const [dialog, setDialog] = useState<AutomationDialogTarget>()
  const [tasks, setTasks] = useState<AutomationListPage>()
  const [current, setCurrent] = useState<AutomationHistoryPage>()
  const [revision, setRevision] = useState(0), [pages, setPages] = useState(1), [taskPages, setTaskPages] = useState(1)
  const [failed, setFailed] = useState(false)
  const reportContext = useCallback((id?: string) => onContext(contextKey, id), [contextKey, onContext])
  useEffect(() => { setSelected(target.occurrenceId) }, [target.requestId, target.occurrenceId])
  useEffect(() => { if (!active || !selected) reportContext(undefined) }, [active, selected, reportContext])
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      const occurrences: AutomationHistoryPage['occurrences'] = []
      let before: AutomationHistoryPage['nextCursor']
      for (let page = 0; page < pages; page++) {
        const result = await api.request('listAutomationHistory', { employeeId, status: 'active', limit: 30, before })
        if (!live) return
        occurrences.push(...result.occurrences); before = result.nextCursor
        if (!before) break
      }
      const definitions: AutomationListPage['definitions'] = []
      let cursor: AutomationListPage['nextCursor']
      for (let page = 0; page < taskPages; page++) {
        const result = await api.request('listOwnerAutomations', { owner: { kind: 'employee', employeeId }, purpose: 'employee-task', limit: 30, before: cursor })
        if (!live) return
        definitions.push(...result.definitions); cursor = result.nextCursor
        if (!cursor) break
      }
      setCurrent({ occurrences, nextCursor: before }); setTasks({ definitions, nextCursor: cursor }); setFailed(false)
    })().catch(error => { if (live) { setFailed(true); showErrorToast(errorText(error)) } })
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'changed' || event.type === 'automation:history-deleted') && !timer) timer = setTimeout(() => setRevision(v => v + 1), 150)
      if (event.type === 'automation:history-deleted') setSelected(value => value === event.occurrenceId ? undefined : value)
    })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, employeeId, active, pages, taskPages, revision])
  const employee = snapshot.agents.find(agent => agent.id === employeeId)
  if (!employee) return <p className="empty-note">该员工已不存在。</p>
  const ongoing = current?.occurrences ?? []
  const queue = ongoing.filter(o => o.status === 'queued').sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0) || a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
  const running = ongoing.filter(o => o.status !== 'queued')
  const rows = (records: typeof ongoing) => records.map(o => <Button key={o.id} variant="ghost" size="content" className="conversation-item automation-record-row" data-occurrence-id={o.id} onClick={() => setSelected(o.id)}>
    <span className="conversation-copy"><strong className="conversation-title">{o.name}</strong><small className="conversation-preview">{occurrenceStatusLabels[o.status]} · {o.source === 'schedule' ? '定时触发' : '手动触发'}</small></span>
  </Button>)
  return <section className="flex h-full min-h-0 flex-col" aria-label={`${employee.name}的任务`} data-employee-tasks={employeeId}>
    {selected ? <EmployeeTaskDetail {...detail} api={api} snapshot={snapshot} id={selected} employeeId={employeeId} active={active} onContext={reportContext} onBack={() => setSelected(undefined)} focusMessage={selected === target.occurrenceId ? target.focusMessage : undefined} /> : <>
      <header className="flex items-center justify-between gap-3 px-6 py-4"><h2 className="truncate">{employee.name} · 任务</h2><Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'task', employeeId, key: crypto.randomUUID() })}>新建任务</Button></header>
      <ScrollArea className="min-h-0 flex-1"><div className="flex flex-col gap-6 px-6 pb-6">
        {failed && <Button variant="secondary" onClick={() => setRevision(v => v + 1)}>重试读取任务</Button>}
        {!current && !failed && <Loading>正在读取任务…</Loading>}
        <section aria-label="当前任务"><h3>当前任务</h3>{rows(running)}{current && !running.length && <p className="field-hint">暂无正在执行的任务</p>}</section>
        {!!queue.length && <section aria-label="排队任务"><h3>排队中</h3>{rows(queue)}</section>}
        {current?.nextCursor && <Button variant="secondary" size="sm" onClick={() => setPages(v => v + 1)}>加载更多当前任务</Button>}
        {!!tasks?.definitions.length && <section aria-label="普通任务"><h3>普通任务</h3>{tasks.definitions.map(task => <div key={task.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate">{task.name}</span><StartEmployeeTask api={api} task={task} active={active} ongoing={ongoing.some(o => o.automationId === task.id)} onStarted={id => { setSelected(id); setRevision(v => v + 1) }} /></div>)}</section>}
        {tasks?.nextCursor && <Button variant="secondary" size="sm" onClick={() => setTaskPages(v => v + 1)}>加载更多普通任务</Button>}
        <AutomationHistory key={employeeId} api={api} active={active && !selected} employeeId={employeeId} onOccurrence={setSelected} />
      </div></ScrollArea>
    </>}
    {dialog && <AutomationDialog api={api} snapshot={snapshot} target={dialog} active={active} onClose={() => setDialog(undefined)} onSaved={() => { setDialog(undefined); setRevision(v => v + 1) }} />}
  </section>
}
function StartEmployeeTask({ api, task, active, ongoing, onStarted }: { api: DesktopApi; task: AutomationDefinition; active: boolean; ongoing: boolean; onStarted(id: string): void }) {
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false)
  const request = useRef<string | undefined>(undefined), locked = useRef(false), visible = useRef(active)
  visible.current = active
  const start = async () => {
    if (!active || ongoing || locked.current) return
    locked.current = true; setBusy(true); request.current ??= crypto.randomUUID()
    try {
      const result = await api.request('runAutomation', { id: task.id, requestId: request.current })
      request.current = undefined; setUnknown(false)
      if (visible.current) onStarted(result.id)
    } catch (error) { setUnknown(true); showErrorToast(errorText(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <Button variant="secondary" size="sm" disabled={!active || ongoing || busy} onClick={() => void start()}>{busy ? '正在提交…' : ongoing ? '已在队列中' : unknown ? '核对本次提交' : '加入队列'}</Button>
}

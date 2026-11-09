/*
 * [OUTPUT]: 2026-11-09 任务详情不再提供项目切换；项目配置统一归员工，已有任务沿原目录续接。
 * [OUTPUT]: 任务属性显示独立项目目录，沿同会话CAS保存；执行中禁切换，保存回执更新原任务会话。
 * [OUTPUT]: 属性操作区按需读取诊断；显式让bobo解释沿稳定请求及原消息导航，不轮询或修复任务。
 * [OUTPUT]: 2026-11-04外部定位在任务Dialog内按原消息读取和滚动，复用既有任务会话。
 * [INPUT]: One employee task, its dedicated conversation and original execution history.
 * [OUTPUT]: Resizable Task Dialog with title/requirements in properties and shared chat without an extra introduction; close waits for the shared exit animation.
 * [OUTPUT]: 属性标题右侧编辑打开紧凑标题/描述Dialog；无footer或折叠入口，正文顶部留白缩小，字段前保留细分隔线。
 * [OUTPUT]: 属性区不展示手动/消息等创建方式分类；真实原消息定位仍独立保留。
 * [OUTPUT]: 标题/正文无label；属性使用较小的语义字号和弱化色，状态通过Popover选择。
 * [POS]: Task session boundary; closing the dialog never stops an accepted execution.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Conversation, Message, Snapshot } from '@boai/shared/domain'
import type { EmployeeTaskDetail as TaskDetail } from '@boai/shared/domain/employee-tasks'
import type { TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import type { ConversationView } from '@boai/shared/domain/reading'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import type { DesktopApi } from '@boai/shared/ipc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Separator } from '@/components/ui/separator'
import { Loading, showErrorToast, errorText, GuardContext } from '@/components/common'
import { Markdown } from '@/components/common/markdown'
import { EmployeeTaskStatusPopover } from './employee-task-status'
import { useConversationWindow } from './use-conversation-window'
import type { ChannelChatWindow } from './channels-tab'
import { TraceTab } from './trace-tab'
import { Pencil } from '@/components/icons'
import { EmployeeTaskRequirements } from './employee-task-requirements'
import { EmployeeTaskDiagnosis } from './employee-task-diagnosis'
export { taskStatusLabels } from './employee-task-status'
export type EmployeeTaskDetailProps = {
  api: DesktopApi; snapshot: Snapshot; id?: string; occurrenceId?: string; employeeId: string; active: boolean
  focusMessage?: { id: string; requestId: string }
  onBack(): void
  onSource(source: { conversationId: string; messageId: string }, process?: boolean): void
  renderChat(window: ChannelChatWindow, onTrace: (message?: Message) => void, historyHeader?: ReactNode): ReactNode
  onMaterials(id: string, materials: NonNullable<ConversationView['materials']>): void
  onContext(conversation: Conversation | undefined): void
}
export function EmployeeTaskDetail({ api, snapshot, id, occurrenceId, employeeId, active, focusMessage, onBack, onSource, renderChat, onMaterials, onContext }: EmployeeTaskDetailProps) {
  const [open, setOpen] = useState(true), [editingRequirements, setEditingRequirements] = useState(false), visible = active && open
  const [record, setRecord] = useState<TaskDetail>(), [room, setRoom] = useState<Conversation>(), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false)
  const startRequest = useRef<import('@boai/shared/ipc').Methods['runEmployeeTask']['input'] | undefined>(undefined)
  const [process, setProcess] = useState<{ conversationId: string; messageId?: string; occurrenceId?: string }>()
  const guard = useContext(GuardContext), locked = useRef(false), contextCallback = useRef(onContext); contextCallback.current = onContext
  useEffect(() => {
    if (!visible) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      const result = await api.request('getEmployeeTask', { employeeId, ...(id ? { id } : { occurrenceId }), before: undefined })
      if (!live) return
      if (result.task.agentId !== employeeId) throw new Error('此任务不属于当前员工')
      setRecord(result); setFailed(false)
      if (!room) { const session = await api.request('openEmployeeTaskSession', { employeeId, id: result.task.id }); if (live) setRoom(session) }
    })().catch(error => { if (live) { setFailed(true); showErrorToast(errorText(error)) } })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 150) })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, id, occurrenceId, employeeId, visible, revision, room])
  useEffect(() => { contextCallback.current(visible ? room : undefined); return () => contextCallback.current(undefined) }, [room, visible])
  const { window, error } = useConversationWindow({ api, id: room?.id, active: visible, chatActive: !process, available: !!room && room.employeeTaskId === record?.task.id && room.agentIds[0] === employeeId, target: { requestId: focusMessage?.requestId ?? id ?? occurrenceId ?? '', focusMessage }, onMaterials })
  useEffect(() => { if (error) showErrorToast(error) }, [error])
  const act = async (operation: () => Promise<unknown>) => {
    if (!visible || locked.current) return
    locked.current = true; setBusy(true)
    try { await operation(); setRevision(v => v + 1) } catch (error) { showErrorToast(errorText(error)); setRevision(v => v + 1) } finally { locked.current = false; setBusy(false) }
  }
  const task = record?.task, employee = snapshot.agents.find(a => a.id === employeeId), ongoing = record?.executions.occurrences.find(o => (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status))
  const status = (value: TrackedTaskStatus) => task && void act(() => api.request('updateEmployeeTask', { employeeId, id: task.id, expectedRevision: task.revision, status: value }))
  const start = () => task && void act(async () => {
    if (!startRequest.current) { const current = (await api.request('getEmployeeTask', { employeeId, id: task.id })).task; startRequest.current = { employeeId, id: task.id, expectedRevision: current.revision, requestId: crypto.randomUUID() } }
    await api.request('runEmployeeTask', startRequest.current); startRequest.current = undefined
  })
  return <Dialog open={visible} onOpenChange={next => { if (visible && !next) guard.navigate(() => setOpen(false)) }} onOpenChangeComplete={next => { if (!next && !open) onBack() }}><DialogContent aria-describedby={undefined} className="flex h-[min(90dvh,1000px)] w-[min(1400px,calc(100vw-48px))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none [&>[data-slot=dialog-close]]:z-20" data-employee-task-dialog={task?.id}>
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0">
    {task && <><ResizablePanel defaultSize="300px" minSize="18%" maxSize="40%">
    <aside aria-label="任务属性" className="relative flex h-full min-h-0 min-w-0 flex-col">
      <header className="chat-header"><h3 className="chat-title">属性</h3><div className="chat-header-actions"><EmployeeTaskDiagnosis key={`${employeeId}:${task.id}`} api={api} employeeId={employeeId} taskId={task.id} active={visible && !failed && !!employee} onSource={source => guard.navigate(() => { onSource(source); onBack() })} /><Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label="编辑任务" title="编辑任务" disabled={busy || editingRequirements} onClick={() => guard.navigate(() => setEditingRequirements(true))}><Pencil /></Button></div></header>
      <ScrollArea className="mt-[36px] min-h-0 flex-1" viewportProps={{ className: 'overscroll-contain scroll-fade-t scroll-fade-6', 'aria-label': '任务属性' }}>
        <div className="flex flex-col gap-8 px-6 pb-6 pt-6 text-[length:var(--text-ui-secondary)] leading-[var(--leading-ui-body)] text-foreground/80">
          <section aria-label="任务要求" className="min-w-0">
            <h2 className="m-0 min-w-0 break-words text-sm font-medium leading-relaxed">{task.title}</h2>
            {(task.description || task.note) && <div className="markdown mt-2 min-w-0 break-words text-muted-foreground [--text-content-body:var(--text-ui-secondary)]"><Markdown>{task.description || task.note}</Markdown></div>}
          </section>
          <Separator />
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3">
            <dt className="py-1 text-muted-foreground">状态</dt><dd className="m-0 min-w-0"><EmployeeTaskStatusPopover status={task.status} disabled={busy} onChange={status} /></dd>
            <dt className="text-muted-foreground">负责人</dt><dd className="m-0 min-w-0 break-words">{employee?.name}</dd>
            <dt className="text-muted-foreground">创建时间</dt><dd className="m-0 min-w-0 break-words text-muted-foreground">{new Date(task.createdAt).toLocaleString('zh-CN')}</dd>
            <dt className="text-muted-foreground">更新时间</dt><dd className="m-0 min-w-0 break-words text-muted-foreground">{new Date(task.updatedAt).toLocaleString('zh-CN')}</dd>
          </dl>
          {(ongoing || !record.executions.occurrences.length || task.source) && <div className="flex flex-wrap items-center gap-2">
            {ongoing ? <Button variant="secondary" size="sm" disabled={busy || ongoing.status === 'cancelling'} onClick={() => void act(() => api.request('stopAutomation', { id: ongoing.id }))}>{ongoing.status === 'queued' ? '取消排队' : '停止本次执行'}</Button> : !record.executions.occurrences.length && <Button variant="secondary" size="sm" disabled={busy || !room || editingRequirements} onClick={start}>开始执行</Button>}
            {task.source && <Button variant="ghost" size="sm" onClick={() => guard.navigate(() => { onSource(task.source!); onBack() })}>原消息</Button>}
          </div>}
        </div>
      </ScrollArea>
    </aside>
    </ResizablePanel>
    <ResizableHandle className="resize-handle bg-transparent hover:bg-ring data-[separator=hover]:bg-ring data-[separator=active]:bg-ring" aria-label="调整任务属性与会话宽度" />
    </>}
    <ResizablePanel minSize="60%">
    <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden" aria-label="任务会话">
      <DialogHeader className="chat-header flex-row pr-14"><DialogTitle className="chat-title">{employee?.name ?? '员工'} · 任务</DialogTitle>{process && <div className="chat-header-actions"><Button variant="ghost" size="sm" onClick={() => setProcess(undefined)}>返回任务会话</Button></div>}</DialogHeader>
      {process ? <div className="flex min-h-0 flex-1 flex-col pt-[52px]"><TraceTab api={api} snapshot={snapshot} conversationId={process.conversationId} messageId={process.messageId} occurrenceId={process.occurrenceId} active={visible} agentId={employeeId} /></div> : window ? renderChat(window, message => setProcess({ conversationId: room!.id, messageId: message?.id })) : <ScrollArea className="mt-[36px] min-h-0 flex-1" viewportProps={{ className: 'scroll-fade-t scroll-fade-6' }}><div className="p-6 pt-[36px]">{failed ? <Button onClick={() => setRevision(v => v + 1)}>重试读取任务</Button> : <Loading>正在读取会话…</Loading>}</div></ScrollArea>}
    </section>
    </ResizablePanel>
    </ResizablePanelGroup>
    {task && editingRequirements && <EmployeeTaskRequirements api={api} task={task} active={visible} onClose={() => { setEditingRequirements(false); setRevision(value => value + 1) }} />}
  </DialogContent></Dialog>
}

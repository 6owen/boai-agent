/*
 * [INPUT]: One employee task, its dedicated conversation and original execution history.
 * [OUTPUT]: Task Dialog with globally resizable panes; user close waits for the shared exit animation before unmounting.
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
import { Avatar, Loading, showErrorToast, errorText, GuardContext } from '@/components/common'
import { Markdown } from '@/components/common/markdown'
import { EmployeeTaskStatus } from './employee-task-status'
import { useConversationWindow } from './use-conversation-window'
import type { ChannelChatWindow } from './channels-tab'
import { TraceTab } from './trace-tab'
export { taskStatusLabels } from './employee-task-status'
export type EmployeeTaskDetailProps = {
  api: DesktopApi; snapshot: Snapshot; id?: string; occurrenceId?: string; employeeId: string; active: boolean
  onBack(): void
  onSource(source: { conversationId: string; messageId: string }, process?: boolean): void
  renderChat(window: ChannelChatWindow, onTrace: (message?: Message) => void, historyHeader?: ReactNode): ReactNode
  onMaterials(id: string, materials: NonNullable<ConversationView['materials']>): void
  onContext(conversation: Conversation | undefined): void
}
export function EmployeeTaskDetail({ api, snapshot, id, occurrenceId, employeeId, active, onBack, onSource, renderChat, onMaterials, onContext }: EmployeeTaskDetailProps) {
  const [open, setOpen] = useState(true), visible = active && open
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
  const { window, error } = useConversationWindow({ api, id: room?.id, active: visible, chatActive: !process, available: !!room && room.employeeTaskId === record?.task.id && room.agentIds[0] === employeeId, target: { requestId: id ?? occurrenceId ?? '' }, onMaterials })
  useEffect(() => { if (error) showErrorToast(error) }, [error])
  const act = async (operation: () => Promise<unknown>) => {
    if (!visible || locked.current) return
    locked.current = true; setBusy(true)
    try { await operation(); setRevision(v => v + 1) } catch (error) { showErrorToast(errorText(error)); setRevision(v => v + 1) } finally { locked.current = false; setBusy(false) }
  }
  const task = record?.task, employee = snapshot.agents.find(a => a.id === employeeId), ongoing = record?.executions.occurrences.find(o => (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status))
  const status = (value: TrackedTaskStatus) => task && void act(() => api.request('updateEmployeeTask', { employeeId, id: task.id, expectedRevision: task.revision, status: value }))
  const start = () => task && void act(async () => { startRequest.current ??= { employeeId, id: task.id, expectedRevision: task.revision, requestId: crypto.randomUUID() }; await api.request('runEmployeeTask', startRequest.current); startRequest.current = undefined })
  const introduction = task && <section className="mx-auto mb-8 w-full max-w-(--content-width)" aria-label="任务要求"><h2 className="m-0 mb-5 text-xl font-semibold">{task.title}</h2>{(task.description || task.note) && <div className="markdown text-sm"><Markdown>{task.description || task.note}</Markdown></div>}</section>
  return <Dialog open={visible} onOpenChange={next => { if (visible && !next) guard.navigate(() => setOpen(false)) }} onOpenChangeComplete={next => { if (!next && !open) onBack() }}><DialogContent aria-describedby={undefined} className="flex h-[min(90dvh,1000px)] w-[min(1400px,calc(100vw-48px))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none [&>[data-slot=dialog-close]]:z-20" data-employee-task-dialog={task?.id}>
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0">
    {task && <><ResizablePanel defaultSize="300px" minSize="18%" maxSize="40%">
    <aside aria-label="任务属性" className="relative flex h-full min-h-0 min-w-0 flex-col bg-muted/20">
      <header className="chat-header pointer-events-none"><h3 className="chat-title">属性</h3></header>
      <ScrollArea className="mt-[36px] min-h-0 flex-1" viewportProps={{ className: 'overscroll-contain scroll-fade-t scroll-fade-6', 'aria-label': '任务属性' }}>
        <div className="flex flex-col gap-8 px-6 pb-6 pt-[36px]">
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-5 text-sm">
            <dt className="text-muted-foreground">状态</dt><dd className="m-0 min-w-0"><EmployeeTaskStatus status={task.status} disabled={busy} onChange={status} /></dd>
            <dt className="text-muted-foreground">负责人</dt><dd className="m-0 flex min-w-0 items-center gap-2 [&_.avatar]:size-6">{employee && <Avatar small name={employee.name} seed={employee.id} avatar={employee.avatar} color={employee.color} />}<span className="truncate">{employee?.name}</span></dd>
            {task.sourceKind && <><dt className="text-muted-foreground">来源</dt><dd className="m-0">{{ schedule: '定时任务', message: '聊天消息', manual: '手动创建' }[task.sourceKind]}</dd></>}
          </dl>
          {(ongoing || !['done', 'closed'].includes(task.status) && !record.executions.occurrences.length || task.source) && <div className="flex flex-col items-start gap-3">
            {ongoing ? <Button variant="secondary" size="sm" disabled={busy || ongoing.status === 'cancelling'} onClick={() => void act(() => api.request('stopAutomation', { id: ongoing.id }))}>{ongoing.status === 'queued' ? '取消排队' : '停止本次执行'}</Button> : !['done', 'closed'].includes(task.status) && !record.executions.occurrences.length && <Button variant="secondary" size="sm" disabled={busy || !room} onClick={start}>开始执行</Button>}
            {task.source && <Button variant="ghost" size="sm" onClick={() => guard.navigate(() => { onSource(task.source!); onBack() })}>原消息</Button>}
          </div>}
          <dl className="m-0 flex flex-col gap-3 text-xs"><div><dt className="text-muted-foreground">创建时间</dt><dd className="m-0 mt-1">{new Date(task.createdAt).toLocaleString('zh-CN')}</dd></div><div><dt className="text-muted-foreground">更新时间</dt><dd className="m-0 mt-1">{new Date(task.updatedAt).toLocaleString('zh-CN')}</dd></div></dl>
        </div>
      </ScrollArea>
    </aside>
    </ResizablePanel>
    <ResizableHandle className="resize-handle bg-transparent hover:bg-ring data-[separator=hover]:bg-ring data-[separator=active]:bg-ring" aria-label="调整任务属性与会话宽度" />
    </>}
    <ResizablePanel minSize="60%">
    <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden" aria-label="任务会话">
      <DialogHeader className="chat-header flex-row pr-14"><DialogTitle className="chat-title">{employee?.name ?? '员工'} · 任务</DialogTitle>{process && <div className="chat-header-actions"><Button variant="ghost" size="sm" onClick={() => setProcess(undefined)}>返回任务会话</Button></div>}</DialogHeader>
      {process ? <div className="flex min-h-0 flex-1 flex-col pt-[52px]"><TraceTab api={api} snapshot={snapshot} conversationId={process.conversationId} messageId={process.messageId} occurrenceId={process.occurrenceId} active={visible} agentId={employeeId} /></div> : window ? renderChat(window, message => setProcess({ conversationId: room!.id, messageId: message?.id }), introduction) : <ScrollArea className="mt-[36px] min-h-0 flex-1" viewportProps={{ className: 'scroll-fade-t scroll-fade-6' }}><div className="p-6 pt-[36px]">{introduction}{failed ? <Button onClick={() => setRevision(v => v + 1)}>重试读取任务</Button> : <Loading>正在读取会话…</Loading>}</div></ScrollArea>}
    </section>
    </ResizablePanel>
    </ResizablePanelGroup>
  </DialogContent></Dialog>
}

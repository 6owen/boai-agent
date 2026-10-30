/*
 * [OUTPUT]: 任务详情固定使用面板所属员工阅读，原任务身份与补充请求不变。
 * [INPUT]: 本次任务身份、原执行上下文和共享消息渲染/材料回调。
 * [OUTPUT]: 任务独立阅读、补充和结果入口；排队取消不启动员工，运行过程沿原occurrence。
 * [POS]: 员工右侧任务详情，不创建第二套Agent循环或复制聊天数据。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AutomationOccurrence, Snapshot } from '@boai/shared/domain'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import type { ConversationView } from '@boai/shared/domain/reading'
import type { DesktopApi } from '@boai/shared/ipc'
import { ChannelsTab, type ChannelChatWindow } from '@/components/detail-panel/channels-tab'
import { Button } from '@/components/ui/button'
import { Loading, showErrorToast, errorText } from '@/components/common'
import { AutomationOccurrenceView, occurrenceStatusLabels } from '@/pages/schedules/automation-history'

export type EmployeeTaskDetailProps = {
  api: DesktopApi; snapshot: Snapshot; id: string; employeeId?: string; active: boolean; focusMessage?: { id: string; requestId: string }
  onContext(id?: string): void; onProcess(id: string): void; onBack(): void
  onMaterials(id: string, materials: NonNullable<ConversationView['materials']>): void
  renderChat(window: ChannelChatWindow, headerActions: ReactNode): ReactNode
}
export function EmployeeTaskDetail({ api, snapshot, id, employeeId, active, focusMessage, onContext, onProcess, onBack, onMaterials, renderChat }: EmployeeTaskDetailProps) {
  const [record, setRecord] = useState<AutomationOccurrence>(), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0), [stopping, setStopping] = useState(false)
  const stopLocked = useRef(false)
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void api.request('getAutomationOccurrence', { id }).then(value => { if (live) { setRecord(value); setFailed(false) } }).catch(error => { if (live) { setRecord(undefined); setFailed(true); showErrorToast(errorText(error)) } })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 100) })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, id, active, revision])
  const belongs = !employeeId || record?.plan?.employeeIds.includes(employeeId) || !record?.plan && snapshot.conversations.some(room => room.id === record?.conversationId && room.agentIds.includes(employeeId))
  const o = record?.id === id && belongs ? record : undefined
  const contextId = o?.messageId ? o.conversationId : undefined
  useEffect(() => { onContext(active ? contextId : undefined); return () => onContext(undefined) }, [active, contextId, onContext])
  if (record?.id === id && !belongs) return <p className="empty-note">此任务不属于当前员工。</p>
  if (!o) return <div className="p-6">{failed ? <Button onClick={() => setRevision(v => v + 1)}>重试读取</Button> : <Loading>正在读取任务…</Loading>}</div>
  const agent = snapshot.agents.find(agent => (!employeeId || agent.id === employeeId) && (o.plan?.employeeIds ?? snapshot.conversations.find(c => c.id === o.conversationId)?.agentIds ?? []).includes(agent.id))
  const canStop = (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status)
  const stop = async () => {
    if (stopLocked.current) return
    stopLocked.current = true; setStopping(true)
    try { await api.request('stopAutomation', { id: o.id }); setRevision(v => v + 1) }
    catch (error) { showErrorToast(errorText(error)) }
    finally { stopLocked.current = false; setStopping(false) }
  }
  return <section className="flex h-full min-h-0 flex-col" aria-label="员工任务详情" data-task-occurrence-id={o.id}>
    <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
      <Button variant="ghost" size="sm" onClick={onBack}>返回任务</Button><strong className="min-w-0 truncate">{o.name}</strong>
      <span className="text-sm text-muted-foreground">{occurrenceStatusLabels[o.status]}</span>
      <div className="ml-auto flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => onProcess(o.id)}>执行过程</Button>
        {canStop && <Button variant="secondary" size="sm" disabled={stopping || o.status === 'cancelling'} onClick={() => void stop()}>{o.status === 'queued' ? '取消排队' : stopping || o.status === 'cancelling' ? '正在停止…' : '停止'}</Button>}
      </div>
    </div>
    {contextId && snapshot.conversations.find(c => c.id === contextId)?.purpose !== 'automation' ? <AutomationOccurrenceView api={api} snapshot={snapshot} id={o.id} active={active} /> : contextId && agent ? <div className="min-h-0 flex-1"><ChannelsTab api={api} agent={agent} taskSnapshot={snapshot} active={active} chatActive={active} target={{ type: 'channels', id: agent.id, conversationId: contextId, requestId: focusMessage?.requestId ?? o.id, focusMessage }} onMaterials={onMaterials} renderChat={renderChat} /></div>
      : <div className="p-6 text-sm text-muted-foreground">{o.reason ?? (o.status === 'queued' ? '已加入员工队列，轮到本任务时自动开始。' : o.status === 'admitted' ? '正在准备本次执行。' : '本次任务没有开始执行。')}</div>}
  </section>
}

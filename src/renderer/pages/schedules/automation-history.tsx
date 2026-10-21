/*
 * [OUTPUT]: 活动单次记录提供停止本次执行，冻结occurrence身份并锁定提交；只调用原stopAutomation，计划开关独立。
 * [OUTPUT]: 未投递/无Run记录不读取未创建的会话；真实失败原因沿Sonner展示，提供查看任务修复入口。
 * [OUTPUT]: 执行卡片可定位到员工/群的实际聊天消息，删除后由Sonner提示。
 * [INPUT]: 单次自动化记录、DesktopApi、Snapshot与共用TraceTab。
 * [OUTPUT]: 已投递显示本次执行卡片；未开始显示状态与原因/任务入口，错误统一Sonner，隐藏停止读取。
 * [POS]: schedules单次执行面板；按occurrence身份限定过程，列表状态文案共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { AutomationHistoryPage, AutomationOccurrence, Snapshot } from '@shared/domain'
import { AUTOMATION_ONGOING_STATUSES } from '@shared/domain/automations'
import type { DesktopApi } from '@shared/ipc'
import { ErrorToast, errorText, GuardContext, Loading, showErrorToast } from '@/components/common'
import { TraceTab } from '@/components/detail-panel/trace-tab'
import type { ExecutionMessageNavigation } from '@/components/detail-panel/execution-message-button'
import { Button } from '@/components/ui/button'
import { ScheduleNavigationContext } from './owner-automations'

export const occurrenceStatusLabels:Record<AutomationOccurrence['status'],string>={admitted:'已接收',running:'执行中',waiting_approval:'等待审批',waiting_user:'等待补充',waiting_work:'等待工作',cancelling:'正在停止',completed:'运行结束',failed:'失败',skipped:'已跳过',interrupted:'已中断',needs_review:'需核对',cancelled:'已停止'}
export const deliveries: Record<AutomationOccurrence['deliveryStatus'], string> = { pending: '尚待交付', delivered: '已交付', no_change: '没有变化', partial: '部分结果', blocked: '未交付', unknown: '交付待核对' }

export function AutomationOccurrenceView({ api, id, active, snapshot, onNavigateMessage }: { api: DesktopApi; id: string; active: boolean; snapshot: Snapshot; onNavigateMessage?: ExecutionMessageNavigation }) {
  const openTask = useContext(ScheduleNavigationContext), guard = useContext(GuardContext)
  const [record, setRecord] = useState<AutomationHistoryPage['occurrences'][number]>(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const [stopping, setStopping] = useState(false), stopLocked = useRef(false)
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void api.request('getAutomationOccurrence', { id }).then(value => { if (live) { setRecord(value); setError('') } }).catch(cause => { if (live) setError(errorText(cause)) })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 100) })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, id, active, revision])
  const o = record?.id === id ? record : undefined
  const hasExecution = o && (!!o.messageId || o.runIds.length > 0)
  const canStop = o && (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status)
  const stop = async (occurrenceId: string) => {
    if (stopLocked.current) return
    stopLocked.current = true; setStopping(true)
    try { await api.request('stopAutomation', { id: occurrenceId }); setRevision(value => value + 1) }
    catch (cause) { showErrorToast(errorText(cause)) }
    finally { stopLocked.current = false; setStopping(false) }
  }
  const failureReason = o?.reason && ['skipped', 'failed', 'interrupted', 'needs_review'].includes(o.status) ? errorText(o.reason) : undefined
  return <section className="automation-occurrence-panel" aria-label="本次执行过程" data-occurrence-detail-id={id}>
    {error && <ErrorToast>{error}</ErrorToast>}
    {active && failureReason && <ErrorToast key={o!.id}>{failureReason}</ErrorToast>}
    {active && o && canStop && <div className="flex shrink-0 justify-end border-b p-3"><Button variant="secondary" size="sm" disabled={stopping || o.status === 'cancelling'} onClick={() => void stop(o.id)}>{stopping || o.status === 'cancelling' ? '正在停止…' : '停止本次执行'}</Button></div>}
    {o ? hasExecution ? <TraceTab key={o.id} api={api} snapshot={snapshot} active={active} conversationId={o.conversationId} occurrenceId={o.id} onNavigateMessage={onNavigateMessage} emptyMessage="本次运行没有保存执行过程。" /> : <div className="flex flex-col items-start gap-3 p-4">
      <p className="m-0 text-sm text-muted-foreground">{occurrenceStatusLabels[o.status]} · {o.status === 'skipped' ? '本次没有启动员工执行。' : '本次运行没有保存执行过程。'}</p>
      <div className="button-row">
        {failureReason && <Button variant="secondary" size="sm" onClick={() => showErrorToast(failureReason)}>查看原因</Button>}
        <Button variant="secondary" size="sm" onClick={() => guard.navigate(() => openTask(o.automationId))}>查看任务</Button>
      </div>
    </div> : <div className="p-4">{error ? <Button variant="secondary" size="sm" onClick={() => setRevision(v => v + 1)}>重试读取</Button> : <Loading>正在读取执行记录…</Loading>}</div>}
  </section>
}

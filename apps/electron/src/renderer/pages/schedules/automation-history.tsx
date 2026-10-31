/*
 * [OUTPUT]: 任务排队状态及未开始取消入口。
 * [OUTPUT]: 查看历史不自动弹出当时失败原因；未启动/过程不可读时保留名称、时间、状态与历史原因。
 * [OUTPUT]: 立即运行只提交并全程loading防重复，两个图标分别打开过程和定位聊天；准备阶段保留等待提示。
 * [OUTPUT]: 单次过程无额外顶部操作栏；停止图标位于最新执行卡片的聊天定位左侧，冻结occurrence身份并锁定提交；只调用原stopAutomation。
 * [OUTPUT]: 未投递/无Run记录不读取未创建的会话；历史原因作为记录字段，读取/停止操作失败沿Sonner，提供查看任务入口。
 * [OUTPUT]: 执行卡片可定位到员工/群的实际聊天消息，删除后由Sonner提示。
 * [INPUT]: 单次自动化记录、DesktopApi、Snapshot与共用TraceTab。
 * [OUTPUT]: 已投递显示本次执行卡片；未开始显示状态与原因/任务入口，错误统一Sonner，隐藏停止读取。
 * [POS]: schedules单次执行面板；按occurrence身份限定过程，列表状态文案共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { AutomationHistoryPage, AutomationOccurrence, Snapshot } from '@boai/shared/domain'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import type { DesktopApi } from '@boai/shared/ipc'
import { ErrorToast, errorText, GuardContext, Loading, showErrorToast } from '@/components/common'
import { TraceTab } from '@/components/detail-panel/trace-tab'
import type { ExecutionMessageNavigation } from '@/components/detail-panel/execution-message-button'
import { Square } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScheduleNavigationContext } from './owner-automations'

export const occurrenceStatusLabels:Record<AutomationOccurrence['status'],string>={queued:'排队中',admitted:'已接收',running:'执行中',waiting_approval:'等待审批',waiting_user:'等待补充',waiting_work:'等待工作',cancelling:'正在停止',completed:'运行结束',failed:'失败',skipped:'已跳过',interrupted:'已中断',needs_review:'需核对',cancelled:'已停止'}
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
  const stopLabel = stopping || o?.status === 'cancelling' ? '正在停止…' : '停止本次执行'
  const stopAction = active && o && canStop ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" disabled={stopping || o.status === 'cancelling'} aria-label={stopLabel} onClick={() => void stop(o.id)} />}><Square /></TooltipTrigger><TooltipContent>{stopLabel}</TooltipContent></Tooltip> : undefined
  const recordContent = o && <div className="flex min-w-0 flex-col items-start gap-3">
    <dl className="m-0 flex min-w-0 flex-col gap-2 text-sm" aria-label="本次运行记录">
      <div><dt className="text-muted-foreground">任务</dt><dd className="m-0">{o.name}</dd></div>
      <div><dt className="text-muted-foreground">触发时间</dt><dd className="m-0"><time dateTime={o.startedAt}>{new Date(o.startedAt).toLocaleString('zh-CN')}</time></dd></div>
      <div><dt className="text-muted-foreground">运行结果</dt><dd className="m-0">{occurrenceStatusLabels[o.status]} · {deliveries[o.deliveryStatus]}</dd></div>
      {o.reason && <div><dt className="text-muted-foreground">记录原因</dt><dd className="m-0 whitespace-pre-wrap break-words">{errorText(o.reason)}</dd></div>}
    </dl>
    <p className="m-0 text-sm text-muted-foreground">{canStop ? '任务已接收，正在等待员工开始处理…' : hasExecution ? '本次运行记录仍保留，当前没有可读取的过程明细。' : o.status === 'skipped' ? '本次没有启动员工执行。' : '本次运行没有产生员工执行记录。'}</p>
    <div className="button-row">{stopAction}<Button variant="secondary" size="sm" onClick={() => guard.navigate(() => openTask(o.automationId))}>查看任务</Button></div>
  </div>
  return <section className="automation-occurrence-panel" aria-label="本次执行过程" data-occurrence-detail-id={id}>
    {error && <ErrorToast>{error}</ErrorToast>}
    {o ? hasExecution ? <TraceTab key={o.id} api={api} snapshot={snapshot} active={active} conversationId={o.conversationId} occurrenceId={o.id} onNavigateMessage={onNavigateMessage} stopAction={stopAction} emptyContent={recordContent} /> : <div className="p-4">{recordContent}</div> : <div className="p-4">{error ? <Button variant="secondary" size="sm" onClick={() => setRevision(v => v + 1)}>重试读取</Button> : <Loading>正在读取执行记录…</Loading>}</div>}
  </section>
}

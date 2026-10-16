/*
 * [OUTPUT]: 执行卡片可定位到员工/群的实际聊天消息，删除后由Sonner提示。
 * [INPUT]: 单次自动化记录、DesktopApi、Snapshot与共用TraceTab。
 * [OUTPUT]: 右侧只展示本次执行卡片，移除卡片外摘要/结果/明细及操作；错误统一Sonner，隐藏停止读取。
 * [POS]: schedules单次执行面板；按occurrence身份限定过程，列表状态文案共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useState } from 'react'
import type { AutomationHistoryPage, AutomationOccurrence, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { ErrorToast, errorText, Loading } from '@/components/common'
import { TraceTab } from '@/components/detail-panel/trace-tab'
import type { ExecutionMessageNavigation } from '@/components/detail-panel/execution-message-button'
import { Button } from '@/components/ui/button'

export const occurrenceStatusLabels:Record<AutomationOccurrence['status'],string>={admitted:'已接收',running:'执行中',waiting_approval:'等待审批',waiting_user:'等待补充',waiting_work:'等待工作',cancelling:'正在停止',completed:'运行结束',failed:'失败',skipped:'已跳过',interrupted:'已中断',needs_review:'需核对',cancelled:'已停止'}
export const deliveries: Record<AutomationOccurrence['deliveryStatus'], string> = { pending: '尚待交付', delivered: '已交付', no_change: '没有变化', partial: '部分结果', blocked: '未交付', unknown: '交付待核对' }

export function AutomationOccurrenceView({ api, id, active, snapshot, onNavigateMessage }: { api: DesktopApi; id: string; active: boolean; snapshot: Snapshot; onNavigateMessage?: ExecutionMessageNavigation }) {
  const [record, setRecord] = useState<AutomationHistoryPage['occurrences'][number]>(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void api.request('getAutomationOccurrence', { id }).then(value => { if (live) { setRecord(value); setError('') } }).catch(cause => { if (live) setError(errorText(cause)) })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 100) })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, id, active, revision])
  const o = record?.id === id ? record : undefined
  return <section className="automation-occurrence-panel" aria-label="本次执行过程" data-occurrence-detail-id={id}>
    {error && <ErrorToast>{error}</ErrorToast>}
    {o ? <TraceTab key={o.id} api={api} snapshot={snapshot} active={active} conversationId={o.conversationId} occurrenceId={o.id} onNavigateMessage={onNavigateMessage} emptyMessage="本次运行没有保存执行过程。" /> : <div className="p-4">{error ? <Button variant="secondary" size="sm" onClick={() => setRevision(v => v + 1)}>重试读取</Button> : <Loading>正在读取执行记录…</Loading>}</div>}
  </section>
}

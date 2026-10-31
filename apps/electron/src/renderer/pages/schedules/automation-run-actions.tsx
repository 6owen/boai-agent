/*
 * [OUTPUT]: 定位聊天同时携带本次occurrence，右侧保留同一次执行过程。
 * [INPUT]: 已保存任务、本次真实记录和主聊天导航。
 * [OUTPUT]: 两枚查看图标只跟随本组件手动发起且尚未结束的occurrence，历史/自动触发不显示，结束后清除本次身份。
 * [OUTPUT]: 单次提交锁与整个运行期间loading；查看过程/定位聊天由用户点击，未知回执复用请求ID。
 * [POS]: 定时任务详情底部操作行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { AutomationOccurrence } from '@boai/shared/domain'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, showErrorToast } from '@/components/common'
import { LoaderCircle, Workflow } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ExecutionMessageButton, type ExecutionMessageNavigation } from '@/components/detail-panel/execution-message-button'

export function AutomationRunActions({ api, automationId, occurrences, active, onOccurrence, onNavigateMessage }: {
  api: DesktopApi; automationId: string; occurrences: AutomationOccurrence[]; active: boolean
  onOccurrence(id: string): void; onNavigateMessage: ExecutionMessageNavigation
}) {
  const [accepted, setAccepted] = useState<AutomationOccurrence>(), [submitting, setSubmitting] = useState(false)
  const [unknown, setUnknown] = useState(false)
  const [manualOccurrenceId, setManualOccurrenceId] = useState<string>()
  const locked = useRef(false), requestId = useRef<string | undefined>(undefined)
  useEffect(() => {
    // The live list owns the accepted occurrence once observed; an evicted or
    // deleted history row must not revive an old running receipt indefinitely.
    if (accepted && occurrences.some(item => item.id === accepted.id)) setAccepted(undefined)
    if (manualOccurrenceId && occurrences.some(item => item.id === manualOccurrenceId && !(AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(item.status))) setManualOccurrenceId(undefined)
  }, [accepted, manualOccurrenceId, occurrences])
  const candidates = occurrences.filter(item => item.automationId === automationId)
  if (accepted && !candidates.some(item => item.id === accepted.id)) candidates.push(accepted)
  const ongoing = candidates.find(item => (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(item.status))
  const occurrence = candidates.find(item => item.id === manualOccurrenceId && (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(item.status))
  const running = submitting || Boolean(ongoing)
  const start = async () => {
    if (!active || locked.current || ongoing) return
    locked.current = true; setSubmitting(true)
    requestId.current ??= crypto.randomUUID()
    try {
      const value = await api.request('runAutomation', { id: automationId, requestId: requestId.current })
      setManualOccurrenceId(value.id); setAccepted(value); setUnknown(false); requestId.current = undefined
    } catch (error) { setUnknown(true); showErrorToast(errorText(error)) }
    finally { locked.current = false; setSubmitting(false) }
  }
  const label = submitting ? '正在提交…' : ongoing ? '本次运行中' : unknown ? '核对本次运行' : '立即运行一次'
  return <div className="flex items-center gap-1">
    {occurrence && <>
      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="查看本次执行过程" disabled={!active} onClick={() => onOccurrence(occurrence.id)} />}><Workflow /></TooltipTrigger><TooltipContent>查看本次执行过程</TooltipContent></Tooltip>
      <ExecutionMessageButton api={api} run={{ id: occurrence.runIds[0] ?? '', conversationId: occurrence.conversationId }} occurrenceId={occurrence.id} active={active && Boolean(occurrence.runIds.length)} onNavigate={onNavigateMessage} />
    </>}
    <Button variant="secondary" size="sm" disabled={!active || running} aria-busy={running} onClick={() => void start()}>{running && <LoaderCircle className="animate-spin" />}{label}</Button>
  </div>
}

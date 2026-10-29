/*
 * [INPUT]: 原Run/occurrence身份、现有取消协议及页面活跃状态。
 * [OUTPUT]: 停止本次执行；定时任务沿原occurrence取消，不停用计划；防连点、失败沿Sonner。
 * [POS]: 聊天卡片footer与执行详情共用停止入口。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import type { AgentRun } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { isNativeBackend } from '@boai/shared/domain/backends'
import { errorText } from '@/components/common'
import { Square } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ExecutionStopButton({ api, run, active, compact = false }: { api: DesktopApi; run: AgentRun; active: boolean; compact?: boolean }) {
  const [pending, setPending] = useState(false), locked = useRef(false)
  if (!['queued', 'running', 'waiting_approval'].includes(run.status)) return null
  const stopping = pending || Boolean(run.cancellation)
  const stop = async () => {
    if (!active || locked.current || run.cancellation) return
    locked.current = true; setPending(true)
    try {
      if (run.origin?.kind === 'automation') await api.request('stopAutomation', { id: run.origin.occurrenceId })
      else if (isNativeBackend(run.backend)) await api.request('stopNativeExecution', { conversationId: run.conversationId, runId: run.id })
      else await api.request('cancelRunExecution', { conversationId: run.conversationId, runId: run.id })
    } catch (error) { toast.error(errorText(error)) }
    finally { locked.current = false; setPending(false) }
  }
  const label = '停止本次执行'
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size={compact ? 'icon-xs' : 'sm'} disabled={!active || stopping} aria-label={label} aria-busy={stopping} onClick={() => void stop()} />}>
    <Square />{!compact && label}
  </TooltipTrigger><TooltipContent>{stopping ? '正在停止…' : label}</TooltipContent></Tooltip>
}

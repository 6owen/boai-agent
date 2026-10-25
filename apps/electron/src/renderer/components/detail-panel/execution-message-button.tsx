/*
 * [INPUT]: 固定执行身份、消息定位IPC和主会话导航。
 * [OUTPUT]: 点击时核对实际聊天消息；清理后仅Sonner提示，隐藏/切换后的迟到结果不导航。
 * [POS]: 共用执行卡片的聊天定位按钮。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import type { AgentRun } from '@boai/shared/domain'
import { errorText } from '@/components/common'
import { MessageCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type ExecutionMessageNavigation = (conversationId: string, messageId: string, current: () => boolean) => void | Promise<void>
export function ExecutionMessageButton({ api, run, active, onNavigate }: { api: DesktopApi; run: Pick<AgentRun, 'id' | 'conversationId'>; active: boolean; onNavigate: ExecutionMessageNavigation }) {
  const [pending, setPending] = useState(false), generation = useRef(0)
  useEffect(() => { setPending(false); return () => { generation.current++ } }, [run.id, run.conversationId, active])
  const locate = async () => {
    if (!active || pending) return
    const request = ++generation.current, current = () => generation.current === request
    setPending(true)
    try {
      const target = await api.request('resolveExecutionMessage', { conversationId: run.conversationId, runId: run.id })
      if (current()) await onNavigate(target.conversationId, target.messageId, current)
    } catch (error) { if (current()) toast.error(errorText(error)) }
    finally { if (current()) setPending(false) }
  }
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" disabled={!active || pending} aria-label="定位聊天记录" onClick={() => void locate()} />}><MessageCircle /></TooltipTrigger><TooltipContent>定位聊天记录</TooltipContent></Tooltip>
}

/*
 * [OUTPUT]: 导出共同资格，查看与继续只在同一终态操作区出现。
 * [INPUT]: 失败运行身份、桌面请求和页面活动状态。
 * [OUTPUT]: 点击沿普通sendMessage发送本人“继续”消息；复用权限操作主按钮、同步防连点与原消息幂等回执。
 * [POS]: 聊天终态卡片的续行入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useRef, useState } from 'react'
import type { AgentRun } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, showErrorToast } from '@/components/common'
import { Button } from '@/components/ui/button'

export function canContinueRun(run: AgentRun) {
  return run.backend?.kind !== 'acp-local' && ['failed', 'cancelled', 'interrupted'].includes(run.status) && ['decision', 'execution'].includes(run.phase ?? '')
}

export function ContinueRunButton({ api, run, active, conversationId = run.conversationId, onDispatch }: { api: DesktopApi; run: AgentRun; active: boolean; conversationId?: string; onDispatch?(): void }) {
  const [pending, setPending] = useState(false), [accepted, setAccepted] = useState(false)
  const locked = useRef(false), requestId = useRef<string | undefined>(undefined)
  if (!canContinueRun(run)) return null
  const resume = async () => {
    if (!active || locked.current || accepted) return
    locked.current = true; setPending(true)
    requestId.current ??= crypto.randomUUID()
    try { onDispatch?.(); await api.request('sendMessage', { conversationId, content: '继续', mentionIds: [], requestId: requestId.current }); setAccepted(true) }
    catch (error) { showErrorToast(errorText(error)) }
    finally { locked.current = false; setPending(false) }
  }
  return <Button size="sm" disabled={!active || pending || accepted} aria-busy={pending} onClick={() => void resume()}>{pending ? '正在发送…' : accepted ? '已发送' : '继续'}</Button>
}

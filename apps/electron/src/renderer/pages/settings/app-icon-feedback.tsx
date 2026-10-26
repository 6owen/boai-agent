/*
 * [INPUT]: Main 图标逐目标状态、单调序号和原重试入口。
 * [OUTPUT]: 不渲染Dock/托盘/安装图标及备用图标状态文案；成功无Toast、失败Sonner与同位重试，无需重试时不占位。
 * [POS]: 外观应用图标Card的失败反馈与重试入口，不拥有选择或持久化。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { AppIconStatus } from '@boai/shared/appearance'

export function acceptAppIconStatus(previous: AppIconStatus | null, next: AppIconStatus) {
  return previous && previous.sequence > next.sequence ? previous : next
}
export function AppIconFeedback({ status, onRetry }: { status: AppIconStatus; onRetry(): void }) {
  const lastError = useRef('')
  const failures = [status.dock.error && `Dock：${status.dock.error}`, status.tray.error && `托盘：${status.tray.error}`, status.installed.available && status.installed.error && `安装图标：${status.installed.error}`].filter(Boolean).join('；')
  useEffect(() => {
    if (status.pending) { lastError.current = ''; return }
    const key = failures ? `${status.requestedId}:${failures}` : ''
    if (key && lastError.current !== key) toast.error(failures)
    lastError.current = key
  }, [failures, status.pending, status.requestedId])
  const retry = Boolean(failures || status.tray.state === 'waiting') && status.tray.state !== 'closed'
  return !status.pending && retry ? <div className="mt-3"><Button type="button" variant="secondary" size="sm" onClick={onRetry}>重试应用</Button></div> : null
}

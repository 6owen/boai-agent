/*
 * [INPUT]: Main 图标逐目标状态、单调序号和原重试入口。
 * [OUTPUT]: 开发/安装均可见Dock/托盘反馈；成功无Toast、失败Sonner与同位重试。
 * [POS]: 外观应用图标Card的状态区，不拥有选择或持久化。
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
  const target = (value: { appliedId: string | null; error: string | null }) => value.error ? '未更新' : value.appliedId === status.requestedId ? '已更新' : status.pending ? '正在更新…' : '等待更新'
  const tray = status.tray.state === 'unavailable' ? '不可用' : status.tray.state === 'waiting' ? '等待就绪' : status.tray.state === 'closed' ? '已停止' : status.tray.state === 'unsupported' ? '不支持切换' : target(status.tray)
  const failures = [status.dock.error && `Dock：${status.dock.error}`, status.tray.error && `托盘：${status.tray.error}`, status.installed.available && status.installed.error && `安装图标：${status.installed.error}`].filter(Boolean).join('；')
  useEffect(() => {
    if (status.pending) { lastError.current = ''; return }
    const key = failures ? `${status.requestedId}:${failures}` : ''
    if (key && lastError.current !== key) toast.error(failures)
    lastError.current = key
  }, [failures, status.pending, status.requestedId])
  const retry = Boolean(failures || status.tray.state === 'waiting') && status.tray.state !== 'closed'
  return <div className="mt-3 space-y-2">
    <p className="field-hint" role="status">Dock：{target(status.dock)}；托盘：{tray}{status.installed.available ? `；安装图标：${status.pending ? '正在更新…' : target(status.installed)}` : ''}</p>
    {status.tray.fallback && <p className="field-hint">{status.tray.fallback === 'default' ? '托盘当前使用默认图标。' : '托盘当前使用备用图标。'}</p>}
    {!status.pending && retry && <Button type="button" variant="secondary" size="sm" onClick={onRetry}>重试应用</Button>}
  </div>
}

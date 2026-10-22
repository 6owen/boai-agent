/*
 * [INPUT]: Conversation scope, existing preview operations and bounded process diagnostics.
 * [OUTPUT]: Independent sandboxed webpage preview; no interactive terminal, input stream or terminal polling.
 * [POS]: Detail panel content; hiding pauses reads without stopping a preview server.
 * [PROTOCOL]: Update Header and detail-panel/.folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { TerminalScope, PreviewInfo } from '@shared/domain/workspace-tools'
import { applicationCall } from '@/components/common/application-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw } from '@/components/icons'
import { toast } from 'sonner'

export function WorkspacePanel({ api, scope, active }: { api: DesktopApi; scope: TerminalScope; active: boolean }) {
  const [previews, setPreviews] = useState<PreviewInfo[]>([]), [busy, setBusy] = useState(false), [command, setCommand] = useState(''), [directory, setDirectory] = useState(''), [reload, setReload] = useState(0)
  const generation = useRef(0), scopeRef = useRef(scope), pending = useRef(false); scopeRef.current = scope
  const refresh = async () => {
    const ticket = generation.current
    const pages = await applicationCall<PreviewInfo[]>(api, 'preview.list', { ...scopeRef.current })
    if (ticket === generation.current) setPreviews(pages)
  }
  useEffect(() => {
    generation.current++; setBusy(pending.current)
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout>
    const poll = async () => { try { await refresh() } catch (error) { if (live) toast.error(String(error)); return } if (live) timer = setTimeout(poll, 2000) }
    void poll()
    return () => { live = false; generation.current++; clearTimeout(timer) }
  }, [api, active, scope.employeeId, scope.conversationId])
  const action = async (run: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true; setBusy(true)
    const ticket = generation.current
    try { await run() } catch (error) { if (ticket === generation.current) toast.error(String(error)) }
    finally {
      pending.current = false
      if (ticket === generation.current) { await refresh().catch(error => toast.error(`预览状态刷新失败：${String(error)}`)); setBusy(false) }
    }
  }
  const preview = previews.find(p => p.status === 'ready' || p.status === 'starting') ?? previews.at(-1)
  const safeUrl = preview?.status === 'ready' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(preview.url) && new URL(preview.url).origin !== window.location.origin ? preview.url : undefined
  return <div className="flex h-full min-h-0 flex-col gap-3 p-4" aria-label="网页预览">
    <Input aria-label="预览目录" placeholder="当前会话工作区（可填写绝对路径）" value={directory} disabled={busy} onChange={e => setDirectory(e.target.value)} />
    <Input aria-label="预览启动命令" placeholder="留空预览静态文件；开发命令用 {{port}} 指定端口" value={command} disabled={busy} onChange={e => setCommand(e.target.value)} />
    <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={busy || preview?.status === 'ready' || preview?.status === 'starting'} onClick={() => void action(async () => { const p = await applicationCall<PreviewInfo>(api, 'preview.start', { ...scope, ...(directory.trim() ? { directory: directory.trim() } : {}), ...(command.trim() ? { command: command.trim() } : {}) }, true); if (p.status === 'failed') throw new Error(p.error ?? '预览启动失败') })}>启动预览</Button>
      <Button variant="ghost" size="sm" disabled={busy || !preview || preview.status === 'stopped'} onClick={() => void action(async () => { await applicationCall(api, 'preview.stop', { id: preview!.id }, true) })}>停止</Button>
      <Button variant="ghost" size="icon-sm" aria-label="刷新预览" disabled={!safeUrl} onClick={() => setReload(x => x + 1)}><RefreshCw /></Button>
    </div>
    {safeUrl ? <><p className="text-muted-foreground truncate text-xs">{safeUrl}</p><iframe key={`${safeUrl}:${reload}`} src={safeUrl} title="本地网页预览" sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer" className="min-h-0 flex-1 rounded-lg border bg-white" /></> : <p className="text-muted-foreground text-sm">{preview?.status === 'starting' ? '预览服务正在启动…' : '启动后在这里查看真实网页。'}</p>}
    {preview?.diagnostics && <details className="min-h-0 text-sm"><summary>查看预览输出{preview.diagnostics.exitCode !== undefined ? ` · 退出码 ${preview.diagnostics.exitCode}` : ''}</summary>{preview.diagnostics.truncated && <p className="field-hint">仅显示最近的输出。</p>}<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{preview.diagnostics.output || '暂无输出'}</pre></details>}
  </div>
}

/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: Conversation scope, shared application protocol and real PTY cursor stream.
 * [OUTPUT]: Persistent xterm view and sandboxed loopback preview in the existing sidebar.
 * [POS]: Detail panel content; tab visibility pauses reads without killing shell/server.
 * [PROTOCOL]: Update Header and detail-panel/.folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { DesktopApi } from '@shared/ipc'
import type { TerminalScope, TerminalInfo, TerminalOutput, PreviewInfo } from '@shared/domain/workspace-tools'
import { applicationCall } from '@/components/common/application-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { RefreshCw, Plus, Trash2 } from '@/components/icons'
import { toast } from 'sonner'
import { resolveTypography } from '@shared/appearance'
import { useAppearance } from '@/stores/appearance'

function TerminalView({ api, id, active }: { api: DesktopApi; id: string; active: boolean }) {
  const container = useRef<HTMLDivElement>(null), terminal = useRef<Terminal | null>(null), fit = useRef<FitAddon | null>(null), cursor = useRef(0)
  useEffect(() => {
    if (!container.current) return
    const colors = getComputedStyle(container.current)
    const typography = resolveTypography(useAppearance.getState().preview.preferences.typography)
    const term = new Terminal({ fontSize: typography.terminalSizePx, fontFamily: typography.families.code, scrollback: 3000, cursorBlink: true, allowProposedApi: false, theme: { background: colors.backgroundColor, foreground: colors.color } })
    const addon = new FitAddon(); term.loadAddon(addon); term.open(container.current)
    terminal.current = term; fit.current = addon; cursor.current = 0
    let input = '', timer: ReturnType<typeof setTimeout> | undefined, queue = Promise.resolve()
    const flush = () => { const data = input; input = ''; if (!data) return; queue = queue.then(() => applicationCall(api, 'terminal.write', { id, data }, true)).then(() => {}).catch(error => { toast.error(String(error)) }) }
    const data = term.onData(value => { input += value; if (timer) clearTimeout(timer); timer = setTimeout(flush, 30) })
    return () => { if (timer) clearTimeout(timer); flush(); data.dispose(); term.dispose(); terminal.current = null; fit.current = null }
  }, [api, id])
  useEffect(() => {
    if (!active || !container.current) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, resizeTimer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      try {
        const output = await applicationCall<TerminalOutput>(api, 'terminal.read', { id, cursor: cursor.current })
        if (!live) return
        if (output.truncated) terminal.current?.reset()
        terminal.current?.write(output.text); cursor.current = output.cursor
        if (output.session.status === 'exited') return
        timer = setTimeout(read, 180)
      } catch (error) { if (live) toast.error(String(error)) }
    }
    const resize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (!live || !container.current?.getClientRects().length) return
        fit.current?.fit()
        const term = terminal.current
        if (term) void applicationCall(api, 'terminal.resize', { id, cols: Math.max(10, Math.min(500, term.cols)), rows: Math.max(2, Math.min(300, term.rows)) }, true).catch(error => toast.error(String(error)))
      }, 100)
    }
    const typographyChanged = () => {
      const term = terminal.current
      if (!term) return
      const next = resolveTypography(useAppearance.getState().preview.preferences.typography)
      term.options.fontFamily = next.families.code
      term.options.fontSize = next.terminalSizePx
      resize()
    }
    const observer = new ResizeObserver(resize); observer.observe(container.current); window.addEventListener('boai:typography-changed', typographyChanged); resize(); void read()
    return () => { live = false; if (timer) clearTimeout(timer); if (resizeTimer) clearTimeout(resizeTimer); observer.disconnect(); window.removeEventListener('boai:typography-changed', typographyChanged) }
  }, [api, id, active])
  return <div ref={container} className="min-h-0 flex-1 overflow-hidden rounded-lg bg-background text-foreground p-2" aria-label="会话终端" />
}
export function WorkspacePanel({ api, scope, active, view: initialView }: { api: DesktopApi; scope: TerminalScope; active: boolean; view: 'terminal' | 'preview' }) {
  const [view, setView] = useState(initialView), [sessions, setSessions] = useState<TerminalInfo[]>([]), [selected, setSelected] = useState(''), [previews, setPreviews] = useState<PreviewInfo[]>([]), [busy, setBusy] = useState(false), [command, setCommand] = useState(''), [directory, setDirectory] = useState(''), [reload, setReload] = useState(0)
  const generation = useRef(0), scopeRef = useRef(scope); scopeRef.current = scope
  useEffect(() => setView(initialView), [initialView])
  const refresh = async () => {
    const ticket = generation.current
    const [next, pages] = await Promise.all([applicationCall<TerminalInfo[]>(api, 'terminal.list', { ...scopeRef.current }), applicationCall<PreviewInfo[]>(api, 'preview.list', { ...scopeRef.current })])
    if (ticket !== generation.current) return
    setSessions(next); setPreviews(pages); setSelected(current => next.some(s => s.id === current) ? current : next.at(-1)?.id ?? '')
  }
  useEffect(() => {
    generation.current++
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout>
    const poll = async () => { try { await refresh() } catch (error) { if (live) toast.error(String(error)); return } if (live) timer = setTimeout(poll, 2000) }
    void poll()
    return () => { live = false; generation.current++; clearTimeout(timer) }
  }, [api, active, scope.employeeId, scope.conversationId])
  const action = async (run: () => Promise<void>) => { if (busy) return; setBusy(true); try { await run() } catch (error) { toast.error(String(error)) } finally { await refresh().catch(() => {}); setBusy(false) } }
  const preview = previews.find(p => p.status === 'ready' || p.status === 'starting') ?? previews.at(-1)
  const safeUrl = preview?.status === 'ready' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(preview.url) && new URL(preview.url).origin !== window.location.origin ? preview.url : undefined
  return <div className="flex h-full min-h-0 flex-col gap-3 p-4">
    <div className="flex items-center gap-2"><Button size="sm" variant={view === 'terminal' ? 'secondary' : 'ghost'} onClick={() => setView('terminal')}>终端</Button><Button size="sm" variant={view === 'preview' ? 'secondary' : 'ghost'} onClick={() => setView('preview')}>预览</Button></div>
    {view === 'terminal' ? <>
      <div className="flex items-center gap-2"><SelectField className="min-w-0 flex-1" size="sm" aria-label="选择终端" value={selected} placeholder="选择终端" options={sessions.map(s => ({ value: s.id, label: `${s.title}${s.status === 'exited' ? ' · 已结束' : ''}` }))} onValueChange={setSelected} />
        <Button size="icon-sm" variant="outline" aria-label="新建终端" disabled={busy} onClick={() => void action(async () => { const result = await applicationCall<TerminalInfo>(api, 'terminal.create', { ...scope }, true); setSelected(result.id) })}><Plus /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="结束终端" disabled={busy || !selected || sessions.find(s => s.id === selected)?.status === 'exited'} onClick={() => void action(async () => { await applicationCall(api, 'terminal.kill', { id: selected }, true) })}><Trash2 /></Button>
      </div>
      {selected ? <TerminalView key={selected} api={api} id={selected} active={active} /> : <p className="text-muted-foreground text-sm">新建终端后可直接输入命令。关闭侧栏不会结束进程。</p>}
    </> : <>
      <Input aria-label="预览目录" placeholder="当前会话工作区（可填写绝对路径）" value={directory} onChange={e => setDirectory(e.target.value)} />
      <Input aria-label="预览启动命令" placeholder="留空预览静态文件；开发命令用 {{port}} 指定端口" value={command} onChange={e => setCommand(e.target.value)} />
      <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={busy || preview?.status === 'ready'} onClick={() => void action(async () => { const p = await applicationCall<PreviewInfo>(api, 'preview.start', { ...scope, ...(directory.trim() ? { directory: directory.trim() } : {}), ...(command.trim() ? { command: command.trim() } : {}) }, true); if (p.status === 'failed') toast.error(p.error ?? '预览启动失败') })}>启动预览</Button>
        <Button variant="ghost" size="sm" disabled={busy || !preview || preview.status === 'stopped'} onClick={() => void action(async () => { await applicationCall(api, 'preview.stop', { id: preview!.id }, true) })}>停止</Button>
        <Button variant="ghost" size="icon-sm" aria-label="刷新预览" disabled={!safeUrl} onClick={() => setReload(x => x + 1)}><RefreshCw /></Button>
      </div>
      {safeUrl ? <><p className="text-muted-foreground truncate text-xs">{safeUrl}</p><iframe key={`${safeUrl}:${reload}`} src={safeUrl} title="本地网页预览" sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer" className="min-h-0 flex-1 rounded-lg border bg-white" /></> : <p className="text-muted-foreground text-sm">启动后在这里查看真实网页。开发命令的输出可在终端中查看。</p>}
    </>}
  </div>
}

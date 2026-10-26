/*
 * [INPUT]: 用户显式创建的terminalId、宿主挂起读取/输入确认协议与标签可见性。
 * [OUTPUT]: 按terminalId常驻xterm、隐藏停读停测量、跟随应用主题及导入色板；主动关闭先停读写/解除附着，真实关闭失败恢复连接。
 * [POS]: 用户交互终端视图；实际进程归宿主，显隐不会重建或解除附着。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header及所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { TerminalInfo } from '@boai/shared/domain/workspace-tools'
import type { WorkspaceTerminalRequest } from '@boai/shared/ipc/workspace-terminal'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { WorkspaceTerminalController } from './workspace-terminal-controller'
import { terminalAppearance, WorkspaceTerminalTheme } from './workspace-terminal-theme'
import { registerWorkspaceTerminal } from './workspace-terminal-sessions'

export function WorkspaceTerminal({ api, active, terminalId, onHome }: { api: DesktopApi; active: boolean; terminalId: string; onHome(): void }) {
  const container = useRef<HTMLDivElement>(null)
  const attachmentQueue = useRef<Promise<void>>(Promise.resolve())
  const visibility = useRef(active), session = useRef<{ setActive(value: boolean): void } | undefined>(undefined)
  const [terminal, setTerminal] = useState<TerminalInfo>(), [connected, setConnected] = useState(false), [revision, reconnect] = useState(0)
  const [closing, setClosing] = useState(false)
  useEffect(() => { visibility.current = active; session.current?.setActive(active) }, [active])
  useEffect(() => {
    setConnected(false); setTerminal(undefined); setClosing(false)
    const previousAttachment = attachmentQueue.current
    let release!: () => void
    attachmentQueue.current = new Promise<void>(resolve => { release = () => { void previousAttachment.then(resolve) } })
    let disposed = false, resizeFrame = 0, resizing = false
    let screen: import('@xterm/xterm').Terminal | undefined, fit: import('@xterm/addon-fit').FitAddon | undefined
    let controller: WorkspaceTerminalController | undefined, appearance: WorkspaceTerminalTheme | undefined
    let observer: ResizeObserver | undefined, themeObserver: MutationObserver | undefined, attachPromise: Promise<void> | undefined
    let lastSize = '', desiredSize: { cols: number; rows: number } | undefined
    const subscriptions: { dispose(): void }[] = []
    const request = (input: WorkspaceTerminalRequest) => api.request('workspaceTerminal', input)
    const stop = async () => {
      disposed = true
      cancelAnimationFrame(resizeFrame)
      observer?.disconnect(); themeObserver?.disconnect()
      if (screen) screen.options.disableStdin = true
      const detached = controller?.dispose()
      await Promise.all([attachPromise, detached])
    }
    const unregister = registerWorkspaceTerminal(terminalId, { stop: async () => { setClosing(true); setConnected(false); await stop() }, resume: () => reconnect(value => value + 1) })
    const applyResize = async () => {
      if (resizing || !controller) return
      resizing = true
      try {
        while (desiredSize && !disposed && visibility.current) {
          const size = desiredSize; desiredSize = undefined
          const key = `${size.cols}:${size.rows}`
          if (key === lastSize) continue
          await controller.resize(size.cols, size.rows)
          lastSize = key
        }
      } finally { resizing = false }
    }
    const resize = () => {
      if (resizeFrame || disposed || !visibility.current) return
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0
        if (disposed || !visibility.current || !screen || !fit || !container.current || container.current.clientWidth < 20 || container.current.clientHeight < 20) return
        const size = fit.proposeDimensions()
        if (!size || size.cols < 10 || size.rows < 2) return
        if (screen.cols !== size.cols || screen.rows !== size.rows) screen.resize(size.cols, size.rows)
        desiredSize = size
        void applyResize()
      })
    }
    const theme = () => {
      if (disposed || !screen || !container.current || !visibility.current) return
      const next = terminalAppearance(container.current)
      screen.options.fontFamily = next.fontFamily
      screen.options.fontSize = next.fontSize
      screen.options.lineHeight = next.lineHeight
      appearance?.update(next.theme)
    }
    const setActive = (value: boolean) => {
      if (disposed) return
      controller?.setActive(value)
      observer?.disconnect()
      if (screen) screen.options.disableStdin = !controller?.canInput
      if (!value) { cancelAnimationFrame(resizeFrame); resizeFrame = 0; desiredSize = undefined; return }
      if (container.current) observer?.observe(container.current)
      theme(); resize()
      if (controller?.canInput) screen?.focus()
    }
    session.current = { setActive }
    void (async () => {
      try {
        await previousAttachment
        if (disposed) { release(); return }
        const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css')])
        if (disposed || !container.current) { release(); return }
        screen = new Terminal({ allowProposedApi: true, cursorBlink: true, scrollback: 2000, minimumContrastRatio: 4.5, disableStdin: true })
        // Host headless is the sole terminal query responder, including while hidden.
        for (const identifier of [{ final: 'c' }, { prefix: '>', final: 'c' }, { final: 'n' }, { prefix: '?', final: 'n' }, { intermediates: '$', final: 'p' }, { prefix: '?', intermediates: '$', final: 'p' }]) subscriptions.push(screen.parser.registerCsiHandler(identifier, () => true))
        subscriptions.push(screen.parser.registerDcsHandler({ intermediates: '$', final: 'q' }, () => true))
        appearance = new WorkspaceTerminalTheme(screen)
        fit = new FitAddon(); screen.loadAddon(fit); screen.open(container.current)
        controller = new WorkspaceTerminalController(request, {
          render: async frame => {
            if (disposed || !screen) return
            const viewport = frame.kind === 'snapshot' && screen.buffer.active.viewportY < screen.buffer.active.baseY
              ? screen.buffer.active.baseY - screen.buffer.active.viewportY : undefined
            if (frame.kind === 'snapshot') { screen.reset(); screen.resize(frame.cols, frame.rows); lastSize = `${frame.cols}:${frame.rows}` }
            await new Promise<void>(resolve => screen!.write(frame.data, resolve))
            if (!disposed && viewport !== undefined) screen!.scrollToLine(Math.max(0, screen!.buffer.active.baseY - viewport))
            if (!disposed && frame.kind === 'snapshot') { theme(); resize() }
          },
          terminal: info => { if (!disposed) setTerminal(info) },
          connected: value => {
            if (disposed || !screen) return
            screen.options.disableStdin = !value || !visibility.current
            setConnected(value)
            if (value && visibility.current) { resize(); screen.focus() }
          },
          error: error => { if (!disposed) toast.error(String(error)) },
        }, visibility.current)
        subscriptions.push(screen.onData(data => controller?.input(data)))
        observer = new ResizeObserver(resize)
        themeObserver = new MutationObserver(() => { theme(); resize() })
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-theme-id'] })
        setActive(visibility.current)
        attachPromise = controller.attach(terminalId)
        await attachPromise
        void document.fonts?.ready.then(() => { if (!disposed) { theme(); resize() } })
      } catch (error) {
        if (!disposed) { setConnected(false); toast.error(String(error)) }
      }
    })()
    return () => {
      unregister()
      const stopped = stop()
      session.current = undefined
      subscriptions.forEach(subscription => subscription.dispose()); appearance?.dispose()
      // Await late attachment cleanup before an explicit reconnect obtains a new
      // owner. Simple tab switches never enter this cleanup or recreate xterm.
      void stopped.then(release)
      screen?.dispose()
    }
  }, [api, terminalId, revision])
  return <section className="workspace-terminal flex h-full min-h-0 flex-col" aria-label="工作区终端">
    <div className="flex shrink-0 items-center gap-2 border-b p-2">
      <Button variant="ghost" size="icon-sm" aria-label="工作区开始" onClick={onHome}><span className="i-solar-home-2-linear size-4" /></Button>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={terminal?.cwd}>{terminal?.cwd}</span>
      {terminal?.status === 'exited' && <span className="text-xs text-muted-foreground">已结束{terminal.exitCode !== undefined ? ` · ${terminal.exitCode}` : ''}</span>}
      <Button variant="ghost" size="icon-sm" aria-label="重新连接终端" disabled={!active || closing} onClick={() => reconnect(value => value + 1)}><span className="i-solar-refresh-linear size-4" /></Button>
    </div>
    <div className="workspace-terminal-screen min-h-0 flex-1 overflow-hidden p-2" ref={container} aria-label="终端屏幕" onKeyDown={event => event.stopPropagation()} aria-busy={!connected && terminal?.status !== 'exited'} />
  </section>
}

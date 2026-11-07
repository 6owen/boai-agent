/*
 * [OUTPUT]: 右侧嵌入沿原detail-session传递确定高度，避免SDK绘图区折叠为0。
 * [INPUT]: One host-owned board controller, active scope, independent container view IDs and desktop IPC.
 * [OUTPUT]: One CanvasView in three containers, saved migration, backup holds and confirmed draft reload.
 * [POS]: Thin BOAI canvas shell; placement never copies or owns the authoritative document.
 * [PROTOCOL]: Update Header and canvas/.folder.md when this file changes.
 */
import { useCallback, useContext, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { CanvasView, createCanvasController } from '@boai/canvas-plugin/editor'
import { CANVAS_PLUGIN_ID, type CanvasExportResult } from '@boai/canvas-plugin/protocol'
import type { DesktopApi } from '@boai/shared/ipc'
import type { CanvasTarget } from '../detail-panel/tabs-state'
import { GuardContext, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppearance } from '@/stores/appearance'
import { pluginUsage } from '@/stores/plugins'
import { toast } from 'sonner'
import { downloadCanvasFile, requestCanvas } from './bridge'
import type { CanvasWorkspaceHandle } from './host-barrier'
import './workspace.css'
export type { CanvasWorkspaceHandle } from './host-barrier'

export type CanvasPlacement = 'right' | 'center' | 'dialog'
interface SelectionReference { boardId: string; viewId: string; pageId: string; shapeIds: string[]; revision: number }

function CanvasButton({ label, icon, disabled, onClick }: { label: string; icon: string; disabled?: boolean; onClick(): void }) {
  return <Tooltip><TooltipTrigger delay={500} render={<Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick} />}><span className={`${icon} size-4`} /></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

export function CanvasWorkspace({ api, target, enabled, active, placement, centerHost, onPlacement, ref }: {
  api: DesktopApi; target: CanvasTarget; enabled: boolean; active: boolean; placement: CanvasPlacement
  centerHost: HTMLElement | null; onPlacement(value: CanvasPlacement): void | Promise<void>; ref: Ref<CanvasWorkspaceHandle>
}) {
  const [controller] = useState(() => createCanvasController({
    scope: { employeeId: target.employeeId, conversationId: target.conversationId }, boardId: target.id,
    request: command => requestCanvas(api, { employeeId: target.employeeId, conversationId: target.conversationId }, command),
  }))
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  const colorScheme = useAppearance(value => value.preview.resolvedMode)
  const guard = useContext(GuardContext), mounted = useRef(true), lifecycle = useRef(0), lock = useRef(false), errorShown = useRef('')
  const hostBarriers = useRef(0)
  const hostHolds = useRef(new Set<string>())
  const [hostBusy, setHostBusy] = useState(false), [busy, setBusy] = useState(false), [selection, setSelection] = useState<SelectionReference | null>(null)
  const reportError = useCallback((error: unknown) => {
    const message = errorText(error)
    if (errorShown.current !== message) { errorShown.current = message; toast.error(message) }
  }, [])
  const flushForHost = useCallback(async (holdId?: string) => {
    if (holdId) hostHolds.current.add(holdId)
    hostBarriers.current++; setHostBusy(true)
    try { await controller.flush() }
    finally { hostBarriers.current--; if (mounted.current) setHostBusy(hostBarriers.current > 0 || hostHolds.current.size > 0) }
  }, [controller])
  useImperativeHandle(ref, () => ({
    flush: () => flushForHost(),
    flushForHost,
    resumeHost(id) { hostHolds.current.delete(id); if (mounted.current) setHostBusy(hostBarriers.current > 0 || hostHolds.current.size > 0) },
  }), [flushForHost])
  useEffect(() => { guard.setDirty(state.dirty) }, [guard.setDirty, state.dirty])
  useEffect(() => () => guard.setDirty(false), [guard.setDirty])
  useEffect(() => { if (state.error) reportError(state.error); else errorShown.current = '' }, [state.error, reportError])
  useEffect(() => { if (active && enabled) void controller.load().catch(reportError) }, [controller, active, enabled, reportError])
  useEffect(() => { if (active && enabled) return pluginUsage.acquire(CANVAS_PLUGIN_ID) }, [active, enabled])
  useEffect(() => { setSelection(null) }, [active, placement])
  useEffect(() => {
    mounted.current = true
    const generation = ++lifecycle.current
    return () => {
      mounted.current = false
      // StrictMode immediately reattaches effects; dispose only after an actual unmount.
      queueMicrotask(() => {
        if (mounted.current || lifecycle.current !== generation) return
        // Explicit close is guarded by flush. Source deletion / root teardown can still
        // remove the component; report a remaining draft and release the revoked view.
        const discard = controller.getState().dirty
        if (discard) reportError(new Error('画板视图已撤回，未保存修改没有写入文档'))
        controller.dispose({ discard })
      })
    }
  }, [controller, reportError])
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current || hostBarriers.current > 0 || hostHolds.current.size > 0 || !enabled || !active) return
    lock.current = true; setBusy(true); errorShown.current = ''
    try { await action() }
    catch (error) { if (mounted.current) reportError(error) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const move = (next: CanvasPlacement) => void run(async () => {
    await controller.flush()
    if (mounted.current) { setSelection(null); await onPlacement(next) }
  })
  const exportFile = (format: CanvasExportResult['format']) => void run(async () => {
    await controller.flush()
    const board = controller.getState().board
    if (!board) return
    const result = await requestCanvas(api, { employeeId: target.employeeId, conversationId: target.conversationId }, { action: 'export', boardId: board.boardId, revision: board.revision, format })
    if (mounted.current) downloadCanvasFile(result)
  })
  const copySelection = () => void run(async () => {
    await controller.flush()
    const board = controller.getState().board
    if (!selection?.shapeIds.length || !board || selection.boardId !== board.boardId) return
    if (selection.revision !== board.revision) throw new Error('画板已更新，请重新选择要引用的图形')
    const content = JSON.stringify(selection)
    if (!api.writeClipboardText) throw new Error('当前宿主不支持复制画板选区')
    await api.writeClipboardText(content)
    toast.success('已复制画板选区')
  })
  if (!active || !enabled) return null
  const blocked = busy || hostBusy
  const content = <div className="canvas-workspace flex h-full min-h-0 min-w-0 flex-1 flex-col" data-canvas-board={target.id} data-canvas-placement={placement}>
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
      <span className="mr-auto truncate text-sm">{state.board?.title ?? target.name}</span>
      <CanvasButton label="保存画板" icon="i-solar-diskette-linear" disabled={blocked || !state.board} onClick={() => void run(async () => { await controller.flush(); toast.success('画板已保存') })} />
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="刷新画板" title="刷新" disabled={blocked} />}><span className="i-solar-refresh-linear size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void run(async () => { await controller.flush(); await controller.refresh() })}>重新读取画板</DropdownMenuItem>
        <DropdownMenuSub><DropdownMenuSubTrigger disabled={!state.dirty && !state.error}>放弃未保存修改</DropdownMenuSubTrigger><DropdownMenuSubContent>
          <DropdownMenuItem>取消</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => void run(async () => { await controller.reloadDiscardingDrafts(); setSelection(null) })}>确认放弃并重新载入</DropdownMenuItem>
        </DropdownMenuSubContent></DropdownMenuSub>
      </DropdownMenuContent></DropdownMenu>
      <CanvasButton label="复制选区引用" icon="i-solar-copy-linear" disabled={blocked || !selection?.shapeIds.length} onClick={copySelection} />
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="导出画板" title="导出" disabled={blocked || !state.board} />}><span className="i-solar-export-linear size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportFile('png')}>PNG 图片</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportFile('svg')}>SVG 图片</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportFile('tldr')}>可编辑 .tldr</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="画板显示位置" title="显示位置" disabled={blocked} />}><span className="i-solar-widget-linear size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem disabled={placement === 'right'} onClick={() => move('right')}>右侧面板</DropdownMenuItem>
        <DropdownMenuItem disabled={placement === 'center'} onClick={() => move('center')}>中间区域</DropdownMenuItem>
        <DropdownMenuItem disabled={placement === 'dialog'} onClick={() => move('dialog')}>弹窗</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      {placement !== 'right' && <CanvasButton label="返回右侧画板" icon="i-solar-close-circle-linear" disabled={blocked} onClick={() => move('right')} />}
    </div>
    <div className="relative min-h-0 flex-1" inert={blocked || undefined}>
      {state.board && <CanvasView controller={controller} viewId={`${target.employeeId}:${target.conversationId}:${target.id}:${placement}`} onSelection={setSelection} onError={reportError} colorScheme={colorScheme} className="absolute inset-0" />}
    </div>
  </div>
  if (placement === 'center') return centerHost ? createPortal(content, centerHost) : null
  if (placement === 'dialog') return <Dialog open onOpenChange={open => { if (!open) move('right') }}><DialogContent aria-describedby={undefined} showCloseButton={false} className="flex h-[min(800px,calc(100dvh-32px))] w-[min(1200px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"><DialogTitle className="sr-only">{state.board?.title ?? target.name}</DialogTitle>{content}</DialogContent></Dialog>
  return content
}

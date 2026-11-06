/*
 * [INPUT]: Current employee conversation, enabled plugin and host-owned board catalog.
 * [OUTPUT]: Scoped board menu with stable retries, explicit local import abandonment and late-read isolation.
 * [POS]: BOAI titlebar canvas entry; editor and persisted documents remain in the canvas package.
 * [PROTOCOL]: Update Header and canvas/.folder.md when this file changes.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { CanvasBoardSummary, CanvasScope } from '@boai/canvas-plugin/protocol'
import type { CanvasTarget } from '../detail-panel/tabs-state'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { errorText } from '@/components/common'
import { toast } from 'sonner'
import { requestCanvas } from './bridge'
import { createCanvasImportIntent } from './import-intent'

export function CanvasMenu({ api, scope, onOpen }: { api: DesktopApi; scope: CanvasScope & { conversationId: string }; onOpen(target: CanvasTarget): void }) {
  const [boards, setBoards] = useState<CanvasBoardSummary[]>([]), [busy, setBusy] = useState(false), [reading, setReading] = useState(false)
  const readVersion = useRef(0), mounted = useRef(true), input = useRef<HTMLInputElement>(null), locked = useRef(false)
  const createOperation = useRef<string | null>(null)
  const [importIntent] = useState(createCanvasImportIntent)
  const [, renderImport] = useReducer(value => value + 1, 0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readVersion.current++ } }, [])
  const open = (board: CanvasBoardSummary) => onOpen({ type: 'canvas', id: board.boardId, name: board.title, employeeId: scope.employeeId, conversationId: scope.conversationId })
  const refresh = async () => {
    const version = ++readVersion.current; setReading(true)
    try { const result = await requestCanvas(api, scope, { action: 'list' }); if (mounted.current && version === readVersion.current) setBoards(result) }
    catch (error) { if (mounted.current && version === readVersion.current) toast.error(errorText(error)) }
    finally { if (mounted.current && version === readVersion.current) setReading(false) }
  }
  const create = async () => {
    if (locked.current) return
    locked.current = true; setBusy(true)
    const operationId = createOperation.current ??= crypto.randomUUID()
    try {
      const result = await requestCanvas(api, scope, { action: 'create', operationId, title: '画板' })
      createOperation.current = null
      if (mounted.current) { setBoards(previous => [result.board, ...previous.filter(board => board.boardId !== result.board.boardId)]); open(result.board) }
    } catch (error) { if (mounted.current) toast.error(errorText(error)) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const importFile = async (file?: File) => {
    if (locked.current || !file && !importIntent.current()) return
    locked.current = true; setBusy(true)
    try {
      const result = await importIntent.submit(file, command => requestCanvas(api, scope, command))
      if (!result) return
      if (mounted.current) { setBoards(previous => [result.board, ...previous.filter(board => board.boardId !== result.board.boardId)]); open(result.board) }
    } catch (error) { if (mounted.current) toast.error(errorText(error)) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const importOperation = importIntent.current()
  return <>
    <DropdownMenu onOpenChange={value => { if (value) void refresh() }}>
      <DropdownMenuTrigger render={<Button className="titlebar-no-drag" variant="ghost" size="icon-sm" aria-label="画板" title="画板" />}><span className="i-solar-palette-round-linear size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 min-w-48 overflow-y-auto">
        <DropdownMenuItem disabled={busy} onClick={() => void create()}><span className="i-solar-add-circle-linear size-4" />{createOperation.current ? '核对新建画板' : '新建画板'}</DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={() => importOperation ? void importFile() : input.current?.click()}><span className="i-solar-import-linear size-4" />{importOperation ? '核对导入画板' : '导入 .tldr'}</DropdownMenuItem>
        {importOperation && <DropdownMenuSub><DropdownMenuSubTrigger disabled={busy}>重新选择导入文件</DropdownMenuSubTrigger><DropdownMenuSubContent>
          <DropdownMenuItem>取消</DropdownMenuItem>
          <DropdownMenuItem onClick={() => {
            if (locked.current || !importIntent.abandon(importOperation.operationId)) return
            renderImport(); toast.success('已放弃本次导入核对；已导入的画板可在列表中刷新查看')
            input.current?.click()
          }}>确认放弃本次核对</DropdownMenuItem>
        </DropdownMenuSubContent></DropdownMenuSub>}
        <DropdownMenuItem disabled={busy || reading} onClick={() => void refresh()}><span className="i-solar-refresh-linear size-4" />刷新</DropdownMenuItem>
        {boards.length > 0 && <DropdownMenuSeparator />}
        {boards.map(board => <DropdownMenuItem key={board.boardId} disabled={busy} onClick={() => open(board)}><span className="i-solar-palette-round-linear size-4" /><span className="max-w-72 truncate">{board.title}</span></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    <input ref={input} type="file" accept=".tldr" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file) }} />
  </>
}

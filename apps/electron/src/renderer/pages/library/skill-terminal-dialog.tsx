/*
 * [INPUT]: Selected skills.sh source and trusted desktop installation terminal.
 * [OUTPUT]: Actual xterm installation output; completion refreshes local discovery, close confirms process exit.
 * [POS]: Marketplace install presentation; no source scan or duplicate candidate picker.
 * [PROTOCOL]: Update Header and library/.folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, showErrorToast, Loading } from '@/components/common'
import { WorkspaceTerminal } from '@/components/detail-panel/workspace-terminal'
import { closeWorkspaceTerminal } from '@/components/detail-panel/workspace-terminal-sessions'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function SkillTerminalDialog({ api, source, onClose, onInstalled }: { api: DesktopApi; source: string; onClose(): void; onInstalled(): Promise<void> }) {
  const [requestId] = useState(() => crypto.randomUUID()), [terminalId, setTerminalId] = useState(''), [closing, setClosing] = useState(false)
  const operation = useRef<Promise<import('@boai/shared/ipc/workspace-terminal').WorkspaceTerminalResponse> | undefined>(undefined)
  useEffect(() => {
    let live = true
    operation.current ??= api.request('skillInstallationTerminal', { action: 'install', requestId, source })
    void operation.current.then(result => { if (live && result.kind === 'created') setTerminalId(result.terminal.id) }, error => { if (live) showErrorToast(errorText(error)) })
    return () => { live = false }
  }, [api, requestId, source])
  const close = async () => {
    if (closing) return
    setClosing(true)
    try {
      const result = await operation.current?.catch(() => undefined)
      const id = terminalId || (result?.kind === 'created' ? result.terminal.id : '')
      if (id) await closeWorkspaceTerminal(id, input => api.request('skillInstallationTerminal', input as never))
      try { await api.request('listLocalSkills', { refresh: true }); await onInstalled() }
      catch (error) { showErrorToast(errorText(error)) }
      onClose()
    } catch (error) { showErrorToast(errorText(error)) }
    finally { setClosing(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open) void close() }}><DialogContent showCloseButton={false} className="flex h-[560px] max-h-[calc(100dvh-48px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]">
    <DialogHeader className="flex-row items-center justify-between px-4 py-3"><DialogTitle>安装技能</DialogTitle><Button variant="ghost" size="sm" disabled={closing} onClick={() => void close()}>关闭</Button></DialogHeader>
    <DialogDescription className="sr-only">通过终端安装 {source}，安装位置为 ~/.agents/skills。</DialogDescription>
    <div className="min-h-0 flex-1">{terminalId ? <WorkspaceTerminal api={api} active terminalId={terminalId} channel="skillInstallationTerminal" onExit={async () => { await api.request('listLocalSkills', { refresh: true }); await onInstalled() }} /> : <Loading />}</div>
  </DialogContent></Dialog>
}

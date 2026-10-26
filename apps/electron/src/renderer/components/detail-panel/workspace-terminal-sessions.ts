/*
 * [INPUT]: Mounted terminal transports and the explicit tab-close request.
 * [OUTPUT]: Quiesce every view before killing its PTY; reconnect retained views if close fails.
 * [POS]: Renderer terminal lifecycle coordination; process exit remains host-confirmed.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { WorkspaceTerminalRequest, WorkspaceTerminalResponse } from '@boai/shared/ipc/workspace-terminal'

type Session = { stop(): Promise<void>; resume(): void }
const sessions = new Map<string, Set<Session>>()

export function registerWorkspaceTerminal(terminalId: string, session: Session): () => void {
  const views = sessions.get(terminalId) ?? new Set<Session>()
  sessions.set(terminalId, views); views.add(session)
  return () => { views.delete(session); if (!views.size) sessions.delete(terminalId) }
}

export async function closeWorkspaceTerminal(terminalId: string, request: (input: WorkspaceTerminalRequest) => Promise<WorkspaceTerminalResponse>): Promise<void> {
  const views = [...sessions.get(terminalId) ?? []]
  try {
    // stop() marks transports disposed synchronously, so in-flight read/write
    // rejections cannot become user-facing errors during intentional shutdown.
    await Promise.all(views.map(view => view.stop()))
    const result = await request({ action: 'close', terminalId })
    if (result.kind !== 'closed' || result.terminal.status !== 'exited') throw new Error('终端尚未确认停止，请重试关闭')
  } catch (error) {
    for (const view of views) if (sessions.get(terminalId)?.has(view)) view.resume()
    throw error
  }
}

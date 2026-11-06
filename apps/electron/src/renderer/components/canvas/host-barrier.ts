/*
 * [INPUT]: Host flush/resume events and current canvas handles, including hidden tabs.
 * [OUTPUT]: One aggregate acknowledgement and token-based hold until a matching resume.
 * [POS]: Thin renderer coordination for host reads, edits, exports and backup consistency.
 * [PROTOCOL]: Update Header and canvas/.folder.md when this file changes.
 */
import type { CanvasScope } from '@boai/canvas-plugin/protocol'

export interface CanvasWorkspaceHandle {
  flush(): Promise<void>
  flushForHost(holdId?: string): Promise<void>
  resumeHost(id: string): void
}
export type CanvasHostEvent = { type: 'canvas:flush'; id: string; scope?: CanvasScope; boardId?: string; hold?: boolean } | { type: 'canvas:resume'; id: string }
export interface CanvasHostTarget { scope: CanvasScope; boardId: string; handle: CanvasWorkspaceHandle }

export function createCanvasHostBarrier(options: {
  targets(): CanvasHostTarget[]
  reply(result: { id: string; error?: string }): Promise<unknown>
  errorText(error: unknown): string
  onError(error: unknown): void
}) {
  const pending = new Set<string>(), held = new Map<string, Set<CanvasWorkspaceHandle>>()
  return {
    async receive(event: CanvasHostEvent) {
      if (event.type === 'canvas:resume') {
        for (const handle of held.get(event.id) ?? []) handle.resumeHost(event.id)
        held.delete(event.id)
        return
      }
      if (pending.has(event.id)) return
      pending.add(event.id)
      const handles = [...new Set(options.targets().filter(target => (!event.scope || target.scope.employeeId === event.scope.employeeId && (!event.scope.conversationId || target.scope.conversationId === event.scope.conversationId)) && (!event.boardId || target.boardId === event.boardId)).map(target => target.handle))]
      if (event.hold) held.set(event.id, new Set(handles))
      const results = await Promise.allSettled(handles.map(handle => handle.flushForHost(event.hold ? event.id : undefined)))
      const failure = results.find(result => result.status === 'rejected')
      try { await options.reply({ id: event.id, ...(failure?.status === 'rejected' ? { error: options.errorText(failure.reason) } : {}) }) }
      catch (error) { options.onError(error) }
      finally { pending.delete(event.id) }
    },
    release() {
      for (const [id, handles] of held) for (const handle of handles) handle.resumeHost(id)
      held.clear()
    },
  }
}

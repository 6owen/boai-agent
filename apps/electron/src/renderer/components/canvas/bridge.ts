/*
 * [INPUT]: Existing trusted desktop API, employee/conversation scope and canvas protocol requests.
 * [OUTPUT]: Typed canvas calls and transient download URLs; document ownership stays in the host.
 * [POS]: Thin BOAI canvas transport adapter; no independent storage or IPC channel.
 * [PROTOCOL]: Update Header and canvas/.folder.md when this file changes.
 */
import type { DesktopApi } from '@boai/shared/ipc'
import type { CanvasExportResult, CanvasRequest, CanvasResponseMap, CanvasScope } from '@boai/canvas-plugin/protocol'

export async function requestCanvas<A extends CanvasRequest['action']>(api: DesktopApi, scope: CanvasScope, command: Extract<CanvasRequest, { action: A }>): Promise<CanvasResponseMap[A]> {
  return await api.request('canvasCommand', { scope, command }) as CanvasResponseMap[A]
}

export function downloadCanvasFile(file: CanvasExportResult) {
  const binary = atob(file.base64)
  const bytes = Uint8Array.from(binary, value => value.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }))
  const link = document.createElement('a')
  link.href = url; link.download = file.filename
  link.click()
  // Let the download consume the URL before revoking it; never persist blob URLs in a board.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

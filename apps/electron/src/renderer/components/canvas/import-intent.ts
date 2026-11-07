/*
 * [INPUT]: A selected .tldr file and the existing authenticated import request.
 * [OUTPUT]: Stable retry identity until success or explicit local abandonment; no board deletion.
 * [POS]: Renderer-only import intent, separate from authoritative persisted boards and receipts.
 * [PROTOCOL]: Update Header and canvas/.folder.md when this file changes.
 */
import { CANVAS_LIMITS, type CanvasMutationResult, type CanvasRequest } from '@boai/canvas-plugin/protocol'

type ImportRequest = Extract<CanvasRequest, { action: 'import' }>
type ImportFile = Pick<File, 'name' | 'size' | 'text'>
export function createCanvasImportIntent() {
  let current: ImportRequest | null = null
  return {
    current: () => current,
    async submit(file: ImportFile | undefined, request: (command: ImportRequest) => Promise<CanvasMutationResult>) {
      if (!current && file) {
        if (file.size > CANVAS_LIMITS.documentBytes) throw new Error('画板文件不能超过 24 MiB')
        if (!/\.tldr$/i.test(file.name)) throw new Error('请选择 .tldr 画板文件')
        current = { action: 'import', operationId: crypto.randomUUID(), file: await file.text(), title: file.name.replace(/\.tldr$/i, '').slice(0, 160) || '导入的画板' }
      }
      if (!current) return
      const attempt = current, result = await request(attempt)
      if (current === attempt) current = null
      return result
    },
    /** Explicitly abandons client retry intent only; the host receipt/board is untouched. */
    abandon(operationId: string) {
      if (current?.operationId !== operationId) return false
      current = null
      return true
    },
  }
}

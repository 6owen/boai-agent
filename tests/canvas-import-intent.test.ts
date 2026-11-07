/*
 * [INPUT]: Real renderer import intent, rejected documents and a committed import with a lost response.
 * [OUTPUT]: Retry identity survives unknown outcomes; explicit local abandonment allows another file without deleting boards.
 * [POS]: WT4 targeted negative acceptance; no renderer, Electron, models or personal data.
 * [PROTOCOL]: Update Header and tests/.folder.md when this file changes.
 */
import { describe, expect, it, vi } from 'vitest'
import type { CanvasMutationResult, CanvasRequest } from '@boai/canvas-plugin/protocol'
import { createCanvasImportIntent } from '../apps/electron/src/renderer/components/canvas/import-intent'

type ImportRequest = Extract<CanvasRequest, { action: 'import' }>
const file = (name: string, text: string) => ({ name, size: text.length, text: async () => text })

describe('canvas import retry intent', () => {
  it('retains a rejected file and operation for retries until explicit abandonment, then accepts another file', async () => {
    const intent = createCanvasImportIntent(), request = vi.fn<(command: ImportRequest) => Promise<CanvasMutationResult>>().mockRejectedValue(new Error('画板文档无效'))
    await expect(intent.submit(file('broken.tldr', '{broken'), request)).rejects.toThrow('画板文档无效')
    const original = intent.current()!
    await expect(intent.submit(undefined, request)).rejects.toThrow('画板文档无效')
    expect(request.mock.calls.map(([command]) => command)).toEqual([original, original])
    expect(intent.abandon('different-operation')).toBe(false)
    expect(intent.current()).toEqual(original)
    expect(intent.abandon(original.operationId)).toBe(true)
    expect(intent.current()).toBeNull()
    await expect(intent.submit(file('replacement.tldr', '{"replacement":true}'), request)).rejects.toThrow('画板文档无效')
    expect(request.mock.calls[2]![0]).toMatchObject({ file: '{"replacement":true}', title: 'replacement' })
    expect(request.mock.calls[2]![0].operationId).not.toBe(original.operationId)
  })
  it('abandoning an unknown result is local only and never removes its committed board or receipt', async () => {
    const intent = createCanvasImportIntent(), persisted = new Map<string, string>(), request = vi.fn(async (command: ImportRequest): Promise<CanvasMutationResult> => {
      persisted.set(command.operationId, command.file)
      throw new Error('response lost after commit')
    })
    await expect(intent.submit(file('saved.tldr', '{"saved":true}'), request)).rejects.toThrow('response lost')
    const operation = intent.current()!
    expect(persisted.get(operation.operationId)).toBe(operation.file)
    expect(intent.abandon(operation.operationId)).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(persisted.get(operation.operationId)).toBe(operation.file)
    await expect(intent.submit(undefined, request)).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('does not leave a pending operation when local file validation rejects before transport', async () => {
    const intent = createCanvasImportIntent(), request = vi.fn<(command: ImportRequest) => Promise<CanvasMutationResult>>()
    await expect(intent.submit(file('wrong.json', '{}'), request)).rejects.toThrow('请选择 .tldr')
    expect(intent.current()).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })
})

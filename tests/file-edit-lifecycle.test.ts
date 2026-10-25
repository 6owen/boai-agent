// @vitest-environment jsdom
/*
 * [INPUT]: 生产useFileEdits、多预览挂载、持久原请求和延迟回执。
 * [OUTPUT]: 最后视图关闭释放内存记录，进行中请求保持共享并在完成后释放，重开仅恢复原请求不重发。
 * [POS]: 文件修改store的生命周期回归，不调用员工或外部服务。
 * [PROTOCOL]: 修改时同步Header与tests/.folder.md。
 */
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { Message } from '../packages/shared/src/domain'
import { useFileEdits } from '../apps/electron/src/renderer/components/detail-panel/use-file-edits'
import { FILE_EDIT_STORAGE, fileEditKey, materialEditInput, type FileEditRequest } from '../apps/electron/src/renderer/components/detail-panel/file-edit-state'

let root: Root, host: HTMLDivElement
let current: ReturnType<typeof useFileEdits>
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const makeRequest = (): FileEditRequest => ({ id: crypto.randomUUID(), source: { kind: 'material', id: crypto.randomUUID(), conversationId: 'chat', contentHash: 'a'.repeat(64), revision: 1, parseVersion: 'text-v1', name: 'notes.txt' }, agentId: 'employee', content: 'review this selection', createdAt: '2026-10-16T00:00:00.000Z', status: 'unknown' })
const apiWith = (request = vi.fn()) => ({ request, subscribe: () => () => {} }) as unknown as DesktopApi
function Probe({ api, fileKey }: { api: DesktopApi; fileKey: string }) { current = useFileEdits(api, fileKey, 'chat', false); return null }
const open = async (api: DesktopApi, fileKey: string) => { await act(async () => root.render(createElement(Probe, { api, fileKey }))) }
const close = async () => { await act(async () => root.render(null)) }

test('closed file stores release their cached records; reopen restores the same pending identity without sending', async () => {
  const api = apiWith(), read = vi.spyOn(Storage.prototype, 'getItem')
  for (let index = 0; index < 30; index++) {
    const request = makeRequest(), key = fileEditKey(request.source), storage = FILE_EDIT_STORAGE + key
    localStorage.setItem(storage, JSON.stringify({ version: 1, requests: [request] }))
    await open(api, key)
    expect(current.requests[0].id).toBe(request.id)
    await close()
    await open(api, key)
    expect(current.requests[0]).toMatchObject({ id: request.id, status: 'unknown' })
    expect(read.mock.calls.filter(([name]) => name === storage)).toHaveLength(2)
    await close()
  }
  expect(api.request).not.toHaveBeenCalled()
})

test('two mounted views share a store through StrictMode effect replay and release only after both close', async () => {
  const api = apiWith(), request = makeRequest(), key = fileEditKey(request.source), read = vi.spyOn(Storage.prototype, 'getItem')
  localStorage.setItem(FILE_EDIT_STORAGE + key, JSON.stringify({ version: 1, requests: [request] }))
  await act(async () => root.render(createElement(StrictMode, null, createElement(Probe, { key: 'one', api, fileKey: key }), createElement(Probe, { key: 'two', api, fileKey: key }))))
  await act(async () => root.render(createElement(StrictMode, null, createElement(Probe, { key: 'two', api, fileKey: key }))))
  expect(current.requests[0].id).toBe(request.id)
  expect(read.mock.calls.filter(([name]) => name === FILE_EDIT_STORAGE + key)).toHaveLength(1)
  await close(); await open(api, key)
  expect(read.mock.calls.filter(([name]) => name === FILE_EDIT_STORAGE + key)).toHaveLength(2)
})

test('an accepted late reply keeps its in-flight identity across close/reopen and releases it after completion', async () => {
  let resolve!: (value: Message) => void
  const send = new Promise<Message>(done => { resolve = done }), call = vi.fn(() => send), api = apiWith(call)
  const request = { ...makeRequest(), status: 'pending' as const }, key = fileEditKey(request.source), read = vi.spyOn(Storage.prototype, 'getItem')
  await open(api, key)
  let execution!: Promise<boolean>
  await act(async () => { execution = current.execute(request, 'send') })
  await close(); await open(api, key)
  expect(current.busy).toBe(true)
  expect(read.mock.calls.filter(([name]) => name === FILE_EDIT_STORAGE + key)).toHaveLength(1)
  await act(async () => { expect(await current.execute(request, 'send')).toBe(false) })
  await close()
  const input = materialEditInput(request)
  await act(async () => { resolve({ id: 'receipt', conversationId: 'chat', senderId: 'user', senderType: 'user', status: 'completed', content: input.content, mentionIds: input.mentionIds, materialReference: input.materialReference } as Message); expect(await execution).toBe(true) })
  await open(api, key)
  expect(current.requests[0]).toMatchObject({ id: request.id, status: 'accepted', messageId: 'receipt' })
  expect(current.busy).toBe(false)
  expect(call).toHaveBeenCalledOnce()
  expect(read.mock.calls.filter(([name]) => name === FILE_EDIT_STORAGE + key)).toHaveLength(2)
})

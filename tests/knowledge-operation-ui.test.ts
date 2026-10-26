// @vitest-environment jsdom
/*
 * [INPUT]: 实际React知识操作hook、浏览器持久身份与受控IPC回执。
 * [OUTPUT]: 未知跨挂载保持、只读核对、旧回执不清除新请求及错误身份拒绝；不冒充Electron/模型验收。
 * [POS]: 知识文件操作的异步交互回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { KnowledgeReceipt } from '../packages/shared/src/domain/knowledge'
import { useKnowledgeOperation } from '../apps/electron/src/renderer/components/work-views/use-knowledge-operation'
vi.mock('../apps/electron/src/renderer/components/common/error-feedback', () => ({ showErrorToast: vi.fn(), ErrorToast: () => null }))
const roots: Root[] = []
beforeEach(() => { localStorage.clear(); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })
async function mount(api: DesktopApi) {
  let value!: ReturnType<typeof useKnowledgeOperation>
  const element = document.createElement('div'); document.body.append(element); const root = createRoot(element); roots.push(root)
  function View() { value = useKnowledgeOperation(api, 'test'); return null }
  await act(async () => root.render(createElement(View)))
  return { get value() { return value }, async unmount() { roots.splice(roots.indexOf(root), 1); await act(async () => root.unmount()) } }
}
const complete = (requestId: string): KnowledgeReceipt => ({ requestId, agentId: 'employee', status: 'completed', resourceId: 'resource' })
const deferred = () => { let resolve!: (value: KnowledgeReceipt) => void; const promise = new Promise<KnowledgeReceipt>(done => { resolve = done }); return { promise, resolve } }
describe('knowledge operation receipt truth', () => {
  it('keeps an unknown identity across mounts and only queries the original receipt without repeating the mutation', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline')), api = { request } as unknown as DesktopApi, mutation = vi.fn().mockRejectedValue(new Error('lost reply'))
    const first = await mount(api)
    await act(async () => { expect(await first.value.execute('original', mutation)).toBe(false) })
    expect(first.value.pending).toBe('original'); expect(localStorage.getItem('boai.knowledge.pending:test')).toBe('original')
    await first.unmount(); const next = await mount(api)
    await act(async () => { expect(await next.value.execute('replacement', mutation)).toBe(false) })
    expect(mutation).toHaveBeenCalledTimes(1)
    request.mockResolvedValue(complete('original'))
    await act(async () => { expect(await next.value.check()).toBe(true) })
    expect(next.value.pending).toBeNull(); expect(request).toHaveBeenLastCalledWith('getEmployeeKnowledgeReceipt', { requestId: 'original' })
  })
  it('never clears a newer request when an older detached component receives its late successful reply', async () => {
    const api = { request: vi.fn().mockResolvedValue(complete('first')) } as unknown as DesktopApi
    const first = await mount(api), old = deferred(); let oldResult!: Promise<boolean>
    await act(async () => { oldResult = first.value.execute('first', () => old.promise) })
    await first.unmount(); const next = await mount(api)
    await act(async () => { expect(await next.value.check()).toBe(true) })
    const newer = deferred(); let nextResult!: Promise<boolean>
    await act(async () => { nextResult = next.value.execute('second', () => newer.promise) })
    await act(async () => { old.resolve(complete('first')); expect(await oldResult).toBe(false) })
    expect(localStorage.getItem('boai.knowledge.pending:test')).toBe('second'); expect(next.value.pending).toBe('second')
    await act(async () => { newer.resolve(complete('second')); expect(await nextResult).toBe(true) })
    expect(next.value.pending).toBeNull()
  })
  it('rejects mismatched receipts and retains the exact request for later verification', async () => {
    const api = { request: vi.fn().mockResolvedValue(complete('wrong')) } as unknown as DesktopApi, view = await mount(api)
    await act(async () => { expect(await view.value.execute('expected', async () => complete('wrong'))).toBe(false) })
    expect(view.value.pending).toBe('expected')
    await act(async () => { expect(await view.value.check()).toBe(false) })
    expect(view.value.pending).toBe('expected')
  })
})

/*
 * [INPUT]: 数据源详情的公开请求及可控异步响应/变更事件。
 * [OUTPUT]: 详情只读目标配置、可见订阅刷新、旧版本/隐藏迟到隔离、错误恢复；不加载员工快照，不启动Electron或连接真实MCP。
 * [POS]: 数据源右侧详情读取生命周期的模块回归。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import type { AppEvent, DesktopApi } from '../src/shared/ipc'
import type { DataSource } from '../src/shared/domain/sources'
import { observeSourceDetail } from '../src/renderer/pages/sources/source-detail-state'

const source = { id: 'source-a', name: 'MCP', type: 'mcp', revision: 1, mcp: { transport: 'http', url: 'https://example.com/mcp', authType: 'none' } } as DataSource
function deferred() {
  let resolve!: (value: DataSource) => void, reject!: (reason: Error) => void
  const promise = new Promise<DataSource>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
function fixture() {
  vi.useFakeTimers()
  const requests: ReturnType<typeof deferred>[] = [], listeners = new Set<(event: AppEvent) => void>()
  const request = vi.fn((method: string) => {
    if (method !== 'getDataSource') throw new Error(`unexpected request ${method}`)
    const item = deferred(); requests.push(item); return item.promise
  })
  const api = { request, subscribe: (callback: (event: AppEvent) => void) => { listeners.add(callback); return () => { listeners.delete(callback) } } } as unknown as DesktopApi
  const emit = (event: AppEvent = { type: 'changed' }) => { for (const listener of listeners) listener(event) }
  const value = vi.fn(), error = vi.fn(), stop = observeSourceDetail(api, source.id, value, error)
  return { requests, request, listeners, emit, value, error, stop }
}
const flush = async () => { for (let n = 0; n < 5; n++) await Promise.resolve() }
afterEach(() => { vi.useRealTimers() })

it('reads only the selected configuration without loading employees', async () => {
  const f = fixture(); f.requests[0].resolve(source); await flush()
  expect(f.request).toHaveBeenCalledExactlyOnceWith('getDataSource', { id: source.id })
  expect(f.value).toHaveBeenCalledExactlyOnceWith({ source })
  expect(f.error).not.toHaveBeenCalled(); f.stop()
})

it('ignores chat changes and coalesces global updates', async () => {
  const f = fixture(); f.requests[0].resolve(source); await flush()
  f.emit({ type: 'changed', conversationId: 'chat' }); await vi.advanceTimersByTimeAsync(200)
  expect(f.requests).toHaveLength(1)
  for (let n = 0; n < 10; n++) f.emit()
  await vi.advanceTimersByTimeAsync(120); expect(f.requests).toHaveLength(2)
  f.requests[1].resolve({ ...source, revision: 2 }); await flush()
  expect(f.value).toHaveBeenLastCalledWith({ source: { ...source, revision: 2 } }); f.stop()
})

it('discards an old read even when it arrives during the refresh debounce', async () => {
  const f = fixture(); f.emit(); f.requests[0].resolve(source); await flush()
  expect(f.value).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(120); f.requests[1].resolve({ ...source, revision: 2 }); await flush()
  expect(f.value).toHaveBeenCalledTimes(1); f.stop()
})

it('hiding or closing cancels queued refreshes and ignores pending responses', async () => {
  const f = fixture(); f.emit(); f.stop(); f.requests[0].resolve(source); f.emit()
  await vi.advanceTimersByTimeAsync(500)
  expect(f.value).not.toHaveBeenCalled(); expect(f.error).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(1); expect(f.listeners.size).toBe(0)
  const failing = fixture(); failing.stop(); failing.requests[0].reject(new Error('late failure')); await flush()
  expect(failing.error).not.toHaveBeenCalled()
})

it('reports a real read failure and recovers on the next global change', async () => {
  const f = fixture(); const reason = new Error('数据源已删除'); f.requests[0].reject(reason); await flush()
  expect(f.error).toHaveBeenCalledExactlyOnceWith(reason); expect(f.value).not.toHaveBeenCalled()
  f.emit(); await vi.advanceTimersByTimeAsync(120); f.requests[1].resolve(source); await flush()
  expect(f.value).toHaveBeenCalledTimes(1); f.stop()
})

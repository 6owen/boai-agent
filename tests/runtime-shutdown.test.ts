/*
 * [OUTPUT]: 真实桌面活动清理在宿主退出状态仍能完成并发出stopped，不等8秒兜底；原真实exit屏障保持。
 * [INPUT]: 假 utilityProcess、stopped 回执和实际 exit 事件。
 * [OUTPUT]: 回执/kill 都不能冒充实际退出；超时未知不批准退出。
 * [POS]: 桌面退出可靠性回归。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { assertRuntimeHostRequest, stopRuntime } from '../apps/electron/src/main/runtime-shutdown'
import { DesktopActivityService } from '../packages/runtime/src/modules/desktop-activity/activity-service'
import type { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
class Child extends EventEmitter { postMessage = vi.fn(); kill = vi.fn(() => true) }
afterEach(() => { vi.useRealTimers() })
it('退出期间继续受理原运行服务的停止采集清理，拒绝新采集和其他业务', () => {
  expect(() => assertRuntimeHostRequest(true, 'captureDesktopActivity', { action: 'stop', excludedApps: undefined, options: undefined })).not.toThrow()
  for (const action of ['status', 'request', 'probe', 'sample', 'request-input', 'open-screen-settings', 'open-input-settings']) {
    expect(() => assertRuntimeHostRequest(true, 'captureDesktopActivity', { action })).toThrow('正在退出')
  }
  for (const input of [undefined, null, {}, { action: 'stop-monitor' }]) expect(() => assertRuntimeHostRequest(true, 'captureDesktopActivity', input)).toThrow('正在退出')
  expect(() => assertRuntimeHostRequest(true, 'updateAppearance', { action: 'stop' })).toThrow('正在退出')
  expect(() => assertRuntimeHostRequest(false, 'updateAppearance', {})).not.toThrow()
})
it('原采集服务在退出状态完成清理后发送stopped，宿主无需等待超时', async () => {
  const calls: string[] = [], errors: unknown[] = []
  const activity = new DesktopActivityService({} as ProductStore, {
    available: () => true, changed() {}, capture: async action => {
      assertRuntimeHostRequest(true, 'captureDesktopActivity', { action })
      calls.push(action); return { supported: false }
    },
  })
  const child = new Child()
  child.postMessage.mockImplementation(() => { void activity.close().then(() => { calls.push('stopped'); child.emit('message', { type: 'stopped' }) }, error => errors.push(error)) })
  child.kill.mockImplementation(() => { calls.push('kill'); queueMicrotask(() => child.emit('exit', 0)); return true })
  await stopRuntime(child)
  expect(errors).toEqual([])
  expect(calls).toEqual(['stop', 'stopped', 'kill'])
})
it('收到 stopped 后仍等实际 exit，且清理自己的监听', async () => {
  const child = new Child(), settled = vi.fn()
  const exit = stopRuntime(child).then(settled)
  expect(child.postMessage).toHaveBeenCalledWith({ type: 'shutdown' })
  child.emit('message', { type: 'stopped' }); await Promise.resolve()
  expect(child.kill).toHaveBeenCalledTimes(1); expect(settled).not.toHaveBeenCalled()
  child.emit('exit', 0); await exit
  expect(settled).toHaveBeenCalledTimes(1); expect(child.listenerCount('message')).toBe(0)
})
it('超时 kill 只终止资源；exit 到达前不视为结束', async () => {
  vi.useFakeTimers()
  const child = new Child(), settled = vi.fn(), exit = stopRuntime(child, 10).then(settled)
  await vi.advanceTimersByTimeAsync(10)
  expect(child.kill).toHaveBeenCalledTimes(1); expect(settled).not.toHaveBeenCalled()
  child.emit('exit', 1); await exit; expect(settled).toHaveBeenCalledTimes(1)
})
it('无法确认退出时拒绝批准，保留未知事实', async () => {
  vi.useFakeTimers()
  const exit = stopRuntime(new Child(), 10)
  const rejected = expect(exit).rejects.toThrow('尚未确认退出')
  await vi.advanceTimersByTimeAsync(4010); await rejected
})

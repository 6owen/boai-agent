/*
 * [INPUT]: 假 utilityProcess、stopped 回执和实际 exit 事件。
 * [OUTPUT]: 回执/kill 都不能冒充实际退出；超时未知不批准退出。
 * [POS]: 桌面退出可靠性回归。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { stopRuntime } from '../src/main/runtime-shutdown'
class Child extends EventEmitter { postMessage = vi.fn(); kill = vi.fn(() => true) }
afterEach(() => { vi.useRealTimers() })
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

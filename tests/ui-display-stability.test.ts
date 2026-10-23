/*
 * [INPUT]: 显示器事件协议夹具、虚拟时钟及云端实际681到684的启动序列。
 * [OUTPUT]: 初始就绪不冒充稳定；采样变化/事件均重置屏障，持续变化/读取错误拒绝且清理监听器。
 * [POS]: UI预检就绪合同；不启动Electron或修改系统显示设置。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
// @ts-expect-error Plain Node CJS entry intentionally has no declaration file.
import stableDisplays from '../scripts/ui-display-stability.cjs'

afterEach(() => { vi.useRealTimers() })
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(0)
  const screen = Object.assign(new EventEmitter(), {
    height: 681,
    getPrimaryDisplay: () => ({ id: 1 }),
    getAllDisplays() { return [{ id: 1, bounds: { width: 1024, height: 768 }, workArea: { width: 1024, height: this.height }, scaleFactor: 1 }] },
  })
  return screen
}
it('稳定一秒才就绪，返回真实最终工作区并移除计时器/监听器', async () => {
  const screen = fixture(), result = stableDisplays(screen); let ready = false
  void result.then(() => { ready = true })
  await vi.advanceTimersByTimeAsync(999); expect(ready).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toEqual([{ width: 1024, height: 768, workWidth: 1024, workHeight: 681, scaleFactor: 1, primary: true }])
  expect(screen.listenerCount('display-metrics-changed')).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
it.each([true, false])('实际681到684变更%s事件均重新计算稳定窗口', async event => {
  const screen = fixture(), result = stableDisplays(screen); let ready = false
  void result.then(() => { ready = true })
  await vi.advanceTimersByTimeAsync(450); screen.height = 684
  if (event) screen.emit('display-metrics-changed')
  await vi.advanceTimersByTimeAsync(1049); expect(ready).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toMatchObject([{ workHeight: 684 }])
  expect(vi.getTimerCount()).toBe(0)
})
it('相同采样仍在收到显示变更事件后重新等待，持续变更达到上限拒绝', async () => {
  const screen = fixture(), result = stableDisplays(screen)
  const rejected = expect(result).rejects.toThrow('did not settle')
  for (let index = 0; index < 20; index++) { screen.emit('display-metrics-changed'); await vi.advanceTimersByTimeAsync(500) }
  await rejected
  expect(screen.listenerCount('display-metrics-changed')).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
it('实际screen读取失败不可取得环境资格，清理事件和计时器', async () => {
  const screen = fixture(); screen.getAllDisplays = () => { throw new Error('screen unavailable') }
  await expect(stableDisplays(screen)).rejects.toThrow('screen unavailable')
  expect(screen.listenerCount('display-metrics-changed')).toBe(0); expect(vi.getTimerCount()).toBe(0)
})

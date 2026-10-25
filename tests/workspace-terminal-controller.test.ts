/*
 * [INPUT]: 真实终端传输控制器与可控异步宿主回执。
 * [OUTPUT]: 隐藏取消/增量续接、无80ms等待、退出停读、四笔有序窗口及未知输入不重放回归。
 * [POS]: 工作区终端renderer协议回归，不替代真实PTY或桌面验收。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { expect, test, vi } from 'vitest'
import { WorkspaceTerminalController } from '../src/renderer/components/detail-panel/workspace-terminal-controller'
import type { WorkspaceTerminalFrame, WorkspaceTerminalRequest, WorkspaceTerminalResponse } from '../src/shared/ipc/workspace-terminal'

const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
const frame = (sequence = 0, status: 'running' | 'exited' = 'running'): WorkspaceTerminalFrame => ({ sequence, kind: sequence ? 'delta' : 'snapshot', data: `frame-${sequence}`, cols: 80, rows: 24, terminal: { id: 'term', employeeId: 'employee', conversationId: 'conversation', title: 'zsh', cwd: '/workspace', createdAt: '', status } })
function harness(options: { holdWrites?: boolean; holdRender?: boolean; active?: boolean } = {}) {
  const calls: WorkspaceTerminalRequest[] = [], waits: Array<(value: WorkspaceTerminalResponse) => void> = []
  const writes: Array<{ resolve(value: WorkspaceTerminalResponse): void; reject(error: unknown): void }> = []
  let renderDone: (() => void) | undefined
  const callbacks = { render: vi.fn(async (_frame: WorkspaceTerminalFrame) => { if (options.holdRender) await new Promise<void>(resolve => { renderDone = resolve }) }), terminal: vi.fn(), connected: vi.fn(), error: vi.fn() }
  const request = vi.fn(async (input: WorkspaceTerminalRequest): Promise<WorkspaceTerminalResponse> => {
    calls.push(input)
    switch (input.action) {
      case 'attach': return { kind: 'attached', attachmentId: 'attached', frame: frame(), nextInputSequence: 1 }
      case 'read': return new Promise(resolve => waits.push(resolve))
      case 'cancelRead': waits.shift()?.({ kind: 'frame', frame: null }); return { kind: 'readCancelled' }
      case 'ack': return { kind: 'acknowledged', sequence: input.sequence }
      case 'write': return options.holdWrites ? new Promise((resolve, reject) => writes.push({ resolve, reject })) : { kind: 'written', inputSequence: input.inputSequence }
      case 'resize': return { kind: 'resized' }
      case 'detach': return { kind: 'detached' }
      default: throw new Error('unexpected request')
    }
  })
  const controller = new WorkspaceTerminalController(request, callbacks, options.active ?? true)
  return { controller, calls, callbacks, waits, writes, renderDone: () => renderDone?.() }
}

test('data-driven read starts immediately after each ACK, with no polling timer', async () => {
  const h = harness(), timeout = vi.spyOn(globalThis, 'setTimeout')
  try {
    await h.controller.attach('term'); await tick()
    expect(h.calls.filter(call => call.action === 'read')).toEqual([{ action: 'read', attachmentId: 'attached', wait: true }])
    h.waits.shift()!({ kind: 'frame', frame: frame(1) }); await tick()
    expect(h.callbacks.render.mock.calls.map(([value]) => value.sequence)).toEqual([0, 1])
    expect(h.calls.filter(call => call.action === 'read')).toHaveLength(2)
    expect(timeout).not.toHaveBeenCalled()
  } finally { timeout.mockRestore(); await h.controller.dispose() }
})

test('100 hide/show cycles cancel pending read without reattaching or resetting emulator', async () => {
  const h = harness()
  await h.controller.attach('term'); await tick()
  for (let i = 0; i < 100; i++) { h.controller.setActive(false); await tick(); expect(h.waits).toHaveLength(0); h.controller.setActive(true); await tick() }
  expect(h.calls.filter(call => call.action === 'attach')).toHaveLength(1)
  expect(h.calls.filter(call => call.action === 'detach')).toHaveLength(0)
  expect(h.callbacks.render).toHaveBeenCalledTimes(1)
  expect(h.waits).toHaveLength(1)
  await h.controller.dispose()
})

test('output racing with hide is held without ACK and resumes on show', async () => {
  const h = harness()
  await h.controller.attach('term'); await tick()
  h.waits.shift()!({ kind: 'frame', frame: frame(1) })
  h.controller.setActive(false); await tick()
  expect(h.callbacks.render).toHaveBeenCalledTimes(1)
  expect(h.calls.filter(call => call.action === 'ack')).toHaveLength(1)
  h.controller.setActive(true); await tick()
  expect(h.callbacks.render.mock.calls.at(-1)?.[0].sequence).toBe(1)
  expect(h.calls.filter(call => call.action === 'ack')).toHaveLength(2)
  await h.controller.dispose()
})

test('hide during asynchronous screen write still ACKs exactly once and does not read again', async () => {
  const h = harness({ holdRender: true })
  await h.controller.attach('term'); await tick()
  h.controller.setActive(false); h.renderDone(); await tick()
  expect(h.calls.filter(call => call.action === 'ack')).toHaveLength(1)
  expect(h.calls.filter(call => call.action === 'read')).toHaveLength(0)
  h.controller.setActive(true); await tick()
  expect(h.calls.filter(call => call.action === 'read')).toHaveLength(1)
  await h.controller.dispose()
})

test('exit frame disables input and terminates reads even after reopening', async () => {
  const h = harness()
  await h.controller.attach('term'); await tick()
  h.waits.shift()!({ kind: 'frame', frame: frame(1, 'exited') }); await tick()
  h.controller.input('unsafe'); h.controller.setActive(false); h.controller.setActive(true); await tick()
  expect(h.calls.filter(call => call.action === 'read')).toHaveLength(1)
  expect(h.calls.some(call => call.action === 'write')).toBe(false)
  expect(h.controller.canInput).toBe(false)
  await h.controller.dispose()
})

test('four writes overlap but out-of-order ACKs cannot advance the bounded window', async () => {
  const h = harness({ holdWrites: true })
  await h.controller.attach('term'); await tick()
  h.controller.input('x'.repeat(24_576))
  expect(h.writes).toHaveLength(4)
  for (const index of [3, 2, 1]) h.writes[index]!.resolve({ kind: 'written', inputSequence: index + 1 })
  await tick(); expect(h.writes).toHaveLength(4)
  h.writes[0]!.resolve({ kind: 'written', inputSequence: 1 }); await tick()
  expect(h.writes).toHaveLength(6)
  expect(h.calls.filter(call => call.action === 'write').map(call => call.inputSequence)).toEqual([1, 2, 3, 4, 5, 6])
  await h.controller.dispose()
})

test('unknown write outcome clears queued input and late successes cannot replay or reenable', async () => {
  const h = harness({ holdWrites: true })
  await h.controller.attach('term'); await tick()
  h.controller.input('x'.repeat(24_576))
  h.writes[0]!.reject(new Error('unknown delivery')); await tick()
  for (const index of [1, 2, 3]) h.writes[index]!.resolve({ kind: 'written', inputSequence: index + 1 })
  h.controller.setActive(false); h.controller.setActive(true); h.controller.input('again'); await tick()
  expect(h.writes).toHaveLength(4)
  expect(h.callbacks.error).toHaveBeenCalledTimes(1)
  expect(h.controller.canInput).toBe(false)
  expect(h.waits).toHaveLength(0)
  await h.controller.dispose()
})

test('total input bound includes in-flight data, and paste chunks preserve surrogate pairs', async () => {
  const h = harness({ holdWrites: true })
  await h.controller.attach('term'); await tick()
  h.controller.input('x'.repeat(4095) + '😀' + 'y'.repeat(24_000))
  const writes = h.calls.filter(call => call.action === 'write')
  expect(writes[0]?.data).toHaveLength(4095)
  expect(writes[1]?.data.startsWith('😀')).toBe(true)
  h.controller.input('z'.repeat(5000))
  expect(h.callbacks.error).toHaveBeenCalledTimes(1)
  expect(h.controller.canInput).toBe(false)
  await h.controller.dispose()
})

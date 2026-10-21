/*
 * [INPUT]: Independent cumulative CPU/time examples, process identity replacement and unavailable/reset native counters.
 * [OUTPUT]: Correct percentage units and work/observation boundaries; real busy time retained and unknown CPU rejected.
 * [POS]: Resource CPU arithmetic regression; actual Electron counters and high-CPU rejection verified separately in original BDD.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { resourceCpuWindow, type ResourceCpuPoint, type ResourceCpuProcess } from './e2e/support/resource-cpu'

const renderer = (cpuSeconds: number | undefined, patch: Partial<ResourceCpuProcess> = {}): ResourceCpuProcess => ({ pid: 17, createdAt: 20, type: 'Tab', cpuSeconds, ...patch })
const point = (capturedAtMs: number, processes: ResourceCpuProcess[]): ResourceCpuPoint => ({ capturedAtMs, processes })

it('retains actual busy CPU and uses elapsed milliseconds with cumulative seconds', () => {
  const window = resourceCpuWindow(point(1000, [renderer(2)]), point(3000, [renderer(2.8)]))
  expect(window.complete).toBe(true); expect(window.elapsedMs).toBe(2000)
  expect(window.processes[0].cpuPercent).toBeCloseTo(40)
})
it('uses the end of prior observation, retaining work but not counting its explicit GC cost twice', () => {
  // The real application used .04s during the next 2s, after the prior observer
  // already consumed 1.2s CPU. The window must start AFTER that observation.
  const previousEnd = point(1400, [renderer(3.2)])
  const currentStart = point(3400, [renderer(3.24)])
  const window = resourceCpuWindow(previousEnd, currentStart)
  expect(window.complete).toBe(true); expect(window.startedAtMs).toBe(1400)
  expect(window.processes[0].cpuPercent).toBeCloseTo(2)
})
it('matches native identities rather than array position and preserves zero only for a real zero delta', () => {
  const main = renderer(1, { pid: 3, type: 'Browser' }), worker = renderer(2, { pid: 9, type: 'Utility', name: 'BoAI Agent Runtime' })
  const window = resourceCpuWindow(point(0, [main, worker]), point(1000, [{ ...worker, cpuSeconds: 2.1 }, main]))
  expect(window.complete).toBe(true)
  expect(window.processes.map(process => [process.pid, Math.round(process.cpuPercent)])).toEqual([[9, 10], [3, 0]])
})
it.each([undefined, -1, NaN, Infinity])('rejects unavailable or invalid native CPU counter %s', cpuSeconds => {
  const window = resourceCpuWindow(point(0, [renderer(1)]), point(1000, [renderer(cpuSeconds)]))
  expect(window.complete).toBe(false); expect(window.errors.join()).toContain('Cumulative CPU')
})
it('rejects a recycled PID and a reset counter instead of inventing an idle process', () => {
  expect(resourceCpuWindow(point(0, [renderer(1)]), point(1000, [renderer(1.1, { createdAt: 21 })])).complete).toBe(false)
  expect(resourceCpuWindow(point(0, [renderer(1)]), point(1000, [renderer(0.5)])).complete).toBe(false)
})
it('requires a preceding boundary and increasing monotonic time', () => {
  expect(resourceCpuWindow(undefined, point(1000, [renderer(1)])).complete).toBe(false)
  expect(resourceCpuWindow(point(1000, [renderer(1)]), point(1000, [renderer(1.1)])).complete).toBe(false)
  expect(resourceCpuWindow(point(1000, [renderer(1)]), point(900, [renderer(1.1)])).complete).toBe(false)
})

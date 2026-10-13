/*
 * [INPUT]: 隔离Electron、DevTools GC/堆/DOM、官方进程内存/CPU指标。
 * [OUTPUT]: 实际资源采样与循环/空闲有界验收；不安装产品监控或读取用户数据。
 * [POS]: 第17组性能/内存BDD支撑；KB与字节分开，RSS不单独证明泄漏。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import type { CDPSession } from '@playwright/test'
import type { Desktop } from './desktop'

export async function resourceSample(runtime: Desktop, cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage')
  const rendererHeap = await cdp.send('Runtime.getHeapUsage')
  const dom = await cdp.send('Memory.getDOMCounters')
  const host = await runtime.app.evaluate(async ({ app, BrowserWindow, ipcMain }) => {
    const v8 = process.getBuiltinModule('node:v8'), vm = process.getBuiltinModule('node:vm')
    v8.setFlagsFromString('--expose_gc')
    try { vm.runInNewContext('gc')() } finally { v8.setFlagsFromString('--no-expose_gc') }
    const listeners = (object: NodeJS.EventEmitter) => Object.fromEntries(object.eventNames().map(event => [String(event), object.listenerCount(event)]))
    const window = BrowserWindow.getAllWindows()[0]
    return {
      mainHeapBytes: process.memoryUsage().heapUsed,
      listeners: { app: listeners(app), ipc: listeners(ipcMain), window: listeners(window), webContents: listeners(window.webContents) },
      windows: BrowserWindow.getAllWindows().map(window => window.id),
      processes: app.getAppMetrics().map(metric => ({ pid: metric.pid, createdAt: metric.creationTime, type: metric.type, name: metric.name, workingSetKb: metric.memory.workingSetSize, cpuPercent: metric.cpu.percentCPUUsage })),
    }
  })
  return { at: new Date().toISOString(), rendererHeapBytes: rendererHeap.usedSize, dom, ...host }
}
export type ResourceSample = Awaited<ReturnType<typeof resourceSample>>
export function verifyResources(samples: ResourceSample[]) {
  const baseline = samples[0], last = samples.at(-1)!, mebibytes = 1024 * 1024
  expect(baseline.processes.filter(value => value.type === 'Utility' && value.name === 'BoAI Agent Runtime')).toHaveLength(1)
  for (const sample of samples) {
    expect(sample.windows).toEqual(baseline.windows)
    expect(sample.processes.filter(value => value.type === 'Utility' && value.name === 'BoAI Agent Runtime').map(value => [value.pid, value.createdAt])).toEqual(baseline.processes.filter(value => value.type === 'Utility' && value.name === 'BoAI Agent Runtime').map(value => [value.pid, value.createdAt]))
    expect(sample.listeners).toEqual(baseline.listeners)
  }
  // Fixed repeated operations should not retain an unbounded page/host heap after GC.
  expect(last.mainHeapBytes - baseline.mainHeapBytes).toBeLessThan(16 * mebibytes)
  expect(last.rendererHeapBytes - baseline.rendererHeapBytes).toBeLessThan(16 * mebibytes)
  expect(last.dom.documents - baseline.dom.documents).toBeLessThanOrEqual(2)
  expect(last.dom.nodes - baseline.dom.nodes).toBeLessThan(1500)
  expect(last.dom.jsEventListeners - baseline.dom.jsEventListeners).toBeLessThan(150)
  const idle = samples.slice(-5)
  const cpu = idle.map(sample => sample.processes.filter(process => process.type === 'Browser' || process.type === 'Tab' || process.name === 'BoAI Agent Runtime').reduce((sum, process) => sum + process.cpuPercent, 0))
  expect([...cpu].sort((a, b) => a - b)[Math.floor(cpu.length / 2)]).toBeLessThan(5)
  for (const process of baseline.processes.filter(process => process.type === 'Browser' || process.type === 'Tab' || process.name === 'BoAI Agent Runtime')) {
    const final = last.processes.find(value => value.pid === process.pid)
    expect(final).toBeDefined()
    expect(final!.workingSetKb - process.workingSetKb).toBeLessThan(64 * 1024)
  }
}

/*
 * [INPUT]: 任务资源准入、并发请求与取消信号。
 * [OUTPUT]: 六个独立工作区并行、宿主命令互斥、FIFO 和排队取消回归。
 * [POS]: tests/task-admission.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { TaskAdmission } from '../src/runtime/modules/collaboration/task-admission'

const signal = () => new AbortController().signal
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
describe('task resource admission', () => {
  it('allows six independent workspaces but queues a seventh until a lease is released', async () => {
    const gate = new TaskAdmission(), starts: number[] = []
    const releases = await Promise.all(Array.from({ length: 6 }, (_, index) => gate.acquire(false, signal(), `employee-${index}`)))
    const waiting = gate.acquire(false, signal(), 'employee-6').then(release => { starts.push(7); return release })
    await tick(); expect(starts).toEqual([])
    releases[0](); const seventh = await waiting; expect(starts).toEqual([7])
    releases.forEach(release => release()); seventh()
  })
  it('serializes a command-capable task against every task and gives a waiting writer its turn', async () => {
    const gate = new TaskAdmission(), order: string[] = []
    const first = await gate.acquire(false, signal()), second = await gate.acquire(false, signal())
    const command = gate.acquire(true, signal()).then(release => { order.push('command'); return release })
    const read = gate.acquire(false, signal()).then(release => { order.push('independent'); return release })
    first(); await tick(); expect(order).toEqual([])
    second(); const releaseCommand = await command; await tick(); expect(order).toEqual(['command'])
    releaseCommand(); const releaseRead = await read; expect(order).toEqual(['command', 'independent']); releaseRead()
  })
  it('removes a cancelled waiter without releasing a still-active execution lease', async () => {
    const gate = new TaskAdmission(), controller = new AbortController()
    const executing = await gate.acquire(true, signal())
    const cancelled = gate.acquire(true, controller.signal)
    const rejection = expect(cancelled).rejects.toThrow('停止等待')
    controller.abort(new Error('停止等待')); await rejection
    let started = false
    const next = gate.acquire(false, signal()).then(release => { started = true; return release })
    await tick(); expect(started).toBe(false)
    executing(); const release = await next; expect(started).toBe(true); release()
  })
  it('does not overlap two runs that can write the same employee session files', async () => {
    const gate = new TaskAdmission()
    const first = await gate.acquire(false, signal(), 'group:employee')
    let started = false
    const successor = gate.acquire(false, signal(), 'group:employee').then(release => { started = true; return release })
    await tick(); expect(started).toBe(false)
    first(); const release = await successor; expect(started).toBe(true); release()
  })
  it('lets an unrelated workspace proceed past a waiter for an occupied workspace', async () => {
    const gate = new TaskAdmission(), active = await gate.acquire(false, signal(), 'one'), order: string[] = []
    const blocked = gate.acquire(false, signal(), 'one').then(release => { order.push('same'); return release })
    const independent = gate.acquire(false, signal(), 'two').then(release => { order.push('other'); return release })
    try { await tick(); expect(order).toEqual(['other']) }
    finally { active(); (await blocked)(); (await independent)() }
  })
})

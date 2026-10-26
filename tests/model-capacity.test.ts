/*
 * [INPUT]: 跨会话模型准入、取消与结构化供应商限流错误。
 * [OUTPUT]: 共享容量、独立连接、公平排队、取消不执行、预算化退避与禁止重放副作用的回归。
 * [POS]: 协作 G1 模型准入不变量。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { ModelCapacity, type ModelTiming } from '../packages/runtime/src/modules/collaboration/model-capacity'

function barrier() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
const signal = () => new AbortController().signal
const limited = () => Object.assign(new Error('provider limited'), { statusCode: 429 })

describe('connection-wide model capacity', () => {
  it('shares slots across phases and conversations, while another connection remains independent', async () => {
    const capacity = new ModelCapacity(2), first = barrier(), started: string[] = []
    const run = (key: string, phase: string, hold = false) => capacity.run(key, signal(), async () => { started.push(phase); if (hold) await first.promise })
    const a = run('shared', 'group-a decision', true), b = run('shared', 'group-b execution', true)
    const c = run('shared', 'group-c memory'), d = run('other', 'independent decision')
    await d
    expect(started).toEqual(['group-a decision', 'group-b execution', 'independent decision'])
    first.release(); await Promise.all([a, b, c])
    expect(started.at(-1)).toBe('group-c memory')
  })

  it('removes a cancelled waiter without invoking it or blocking the next waiter', async () => {
    const capacity = new ModelCapacity(1), held = barrier(), controller = new AbortController(), calls: string[] = []
    const active = capacity.run('one', signal(), () => held.promise)
    const cancelled = capacity.run('one', controller.signal, async () => { calls.push('cancelled') })
    const rejected = expect(cancelled).rejects.toThrow('user stopped')
    const next = capacity.run('one', signal(), async () => { calls.push('next') })
    controller.abort(new Error('user stopped')); await rejected
    held.release(); await Promise.all([active, next])
    expect(calls).toEqual(['next'])
  })

  it('releases slots after failure and records queue separately from stage duration', async () => {
    const capacity = new ModelCapacity(1), held = barrier(); let timing: ModelTiming | undefined
    const first = capacity.run('one', signal(), async () => { await held.promise; throw new Error('failed') })
    const rejected = expect(first).rejects.toThrow('failed')
    const next = capacity.run('one', signal(), async () => 'ok', { timing: async value => { timing = value } })
    await new Promise(resolve => setTimeout(resolve, 15)); held.release(); await rejected
    expect(await next).toBe('ok'); expect(timing!.queueMs).toBeGreaterThanOrEqual(10)
    expect(timing).toMatchObject({ rateLimitRetries: 0, backoffMs: 0 })
  })

  it('bounds read-only rate-limit retries, reserves each retry and frees slots during backoff', async () => {
    const capacity = new ModelCapacity(1, [5, 5]), calls: string[] = []; let reservations = 0
    const result = capacity.run('one', signal(), async () => { calls.push('decision'); throw new Error('wrapped', { cause: limited() }) }, {
      retryRateLimit: true, reserveRetry: async () => { reservations++; await capacity.run('one', signal(), async () => { calls.push('peer') }) },
    })
    await expect(result).rejects.toThrow('wrapped')
    expect(reservations).toBe(2); expect(calls).toEqual(['decision', 'peer', 'decision', 'peer', 'decision'])
  })

  it('does not retry execution with possible side effects, or treat ordinary failures as rate limits', async () => {
    const capacity = new ModelCapacity(1, [0]); let calls = 0, budget = 0
    await expect(capacity.run('one', signal(), async () => { calls++; throw limited() })).rejects.toThrow('provider limited')
    await expect(capacity.run('one', signal(), async () => { calls++; throw new Error('not a 429 status') }, { retryRateLimit: true, reserveRetry: async () => { budget++ } })).rejects.toThrow('not a 429')
    expect(calls).toBe(2); expect(budget).toBe(0)
  })

  it('cancels during backoff without making the reserved next request', async () => {
    const capacity = new ModelCapacity(1, [10_000]), controller = new AbortController(), reserved = barrier(); let calls = 0
    const result = capacity.run('one', controller.signal, async () => { calls++; throw limited() }, { retryRateLimit: true, reserveRetry: async () => { reserved.release() } })
    const rejected = expect(result).rejects.toThrow('cancel backoff')
    await reserved.promise; controller.abort(new Error('cancel backoff')); await rejected
    expect(calls).toBe(1)
  })
})

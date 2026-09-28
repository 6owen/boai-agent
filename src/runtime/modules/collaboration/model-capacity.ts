/*
 * [INPUT]: 模型连接 ID、取消信号和一次只读判断/记忆或执行阶段。
 * [OUTPUT]: 跨会话共享的 FIFO 容量、有界限流退避及分离的等待/执行耗时。
 * [POS]: 协作模型准入；不决定员工参与，不重放 task 副作用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export interface ModelTiming { queueMs: number; executionMs: number; backoffMs: number; rateLimitRetries: number }
type Waiting = { signal: AbortSignal; start(): void; cancel(): void }
type Lane = { active: number; waiting: Waiting[] }

// Keep the existing three-decision envelope, now shared by a connection across conversations.
const DEFAULT_CAPACITY = 3
const RATE_LIMIT_DELAYS = [500, 1500] as const

export class ModelCapacity {
  private readonly lanes = new Map<string, Lane>()
  constructor(private readonly capacity = DEFAULT_CAPACITY, private readonly retryDelays: readonly number[] = RATE_LIMIT_DELAYS) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('模型连接容量必须是正整数')
    if (retryDelays.some(delay => !Number.isFinite(delay) || delay < 0)) throw new Error('退避时间必须为非负有限值')
  }

  private acquire(connectionId: string, signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    const lane = this.lanes.get(connectionId) ?? { active: 0, waiting: [] }
    this.lanes.set(connectionId, lane)
    return new Promise((resolve, reject) => {
      const waiting: Waiting = {
        signal,
        start: () => {
          signal.removeEventListener('abort', waiting.cancel)
          lane.active++
          let released = false
          resolve(() => {
            if (released) return
            released = true; lane.active--
            this.drain(connectionId, lane)
          })
        },
        cancel: () => {
          lane.waiting = lane.waiting.filter(item => item !== waiting)
          signal.removeEventListener('abort', waiting.cancel)
          reject(signal.reason ?? new Error('模型排队已取消'))
          this.drain(connectionId, lane)
        },
      }
      lane.waiting.push(waiting)
      signal.addEventListener('abort', waiting.cancel, { once: true })
      this.drain(connectionId, lane)
    })
  }

  private drain(connectionId: string, lane: Lane) {
    while (lane.active < this.capacity && lane.waiting.length) {
      const item = lane.waiting.shift()!
      if (item.signal.aborted) item.cancel()
      else item.start()
    }
    if (!lane.active && !lane.waiting.length && this.lanes.get(connectionId) === lane) this.lanes.delete(connectionId)
  }

  async run<T>(connectionId: string, signal: AbortSignal, operation: () => Promise<T>, options: {
    retryRateLimit?: boolean
    reserveRetry?(): Promise<void>
    timing?(timing: ModelTiming): Promise<void>
  } = {}): Promise<T> {
    const timing: ModelTiming = { queueMs: 0, executionMs: 0, backoffMs: 0, rateLimitRetries: 0 }
    try {
      for (;;) {
        const queued = Date.now()
        let release: () => void
        try { release = await this.acquire(connectionId, signal) }
        finally { timing.queueMs += Date.now() - queued }
        const started = Date.now()
        let failure: unknown
        try { signal.throwIfAborted(); return await operation() }
        catch (error) { failure = error }
        finally { timing.executionMs += Date.now() - started; release() }
        signal.throwIfAborted()
        if (!options.retryRateLimit || !isRateLimit(failure) || timing.rateLimitRetries >= this.retryDelays.length) throw failure
        // A failed request still consumed an attempt; retries must use the original turn/work budget.
        if (!options.reserveRetry) throw failure
        await options.reserveRetry()
        const delay = this.retryDelays[timing.rateLimitRetries++]
        const waiting = Date.now()
        try { await backoff(delay, signal) } finally { timing.backoffMs += Date.now() - waiting }
      }
    } finally { await options.timing?.(timing) }
  }
}

function isRateLimit(error: unknown): boolean {
  const visited = new Set<object>()
  while (error && typeof error === 'object' && !visited.has(error)) {
    visited.add(error)
    const value = error as { status?: unknown; statusCode?: unknown; cause?: unknown }
    if (value.status === 429 || value.statusCode === 429) return true
    error = value.cause
  }
  return false
}

function backoff(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason ?? new Error('模型退避已取消')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/*
 * [INPUT]: 任务是否可调用宿主命令、取消信号。
 * [OUTPUT]: 有限独立任务并行、同员工会话文件互斥及宿主命令任务全局互斥。
 * [POS]: 当前进程的资源执行准入；仅文件工具的任务具有会话/员工私有写入范围。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
type Waiter = { exclusive: boolean; resourceKey?: string; signal: AbortSignal; start(): void; cancel(): void }
export const MAX_INDEPENDENT_TASKS = 2

export class TaskAdmission {
  private active = 0
  private exclusive = false
  private activeKeys = new Set<string>()
  private waiting: Waiter[] = []

  acquire(exclusive: boolean, signal: AbortSignal, resourceKey?: string): Promise<() => void> {
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const item: Waiter = {
        exclusive, signal, resourceKey,
        start: () => {
          signal.removeEventListener('abort', item.cancel)
          this.active++; this.exclusive = exclusive
          if (resourceKey) this.activeKeys.add(resourceKey)
          let released = false
          resolve(() => {
            if (released) return
            released = true; this.active--; this.exclusive = false
            if (resourceKey) this.activeKeys.delete(resourceKey)
            this.drain()
          })
        },
        cancel: () => {
          this.waiting = this.waiting.filter(waiter => waiter !== item)
          signal.removeEventListener('abort', item.cancel)
          reject(signal.reason ?? new Error('等待共享资源时任务已取消')); this.drain()
        },
      }
      this.waiting.push(item); signal.addEventListener('abort', item.cancel, { once: true }); this.drain()
    })
  }
  private drain() {
    while (!this.exclusive && this.active < MAX_INDEPENDENT_TASKS && this.waiting.length) {
      const next = this.waiting[0]
      if (next.signal.aborted) { next.cancel(); continue }
      // FIFO prevents a stream of independent tasks from starving a waiting command task.
      if (next.exclusive && this.active) return
      if (next.resourceKey && this.activeKeys.has(next.resourceKey)) return
      this.waiting.shift(); next.start()
    }
  }
}

/*
 * [INPUT]: 受审插件id和实际视图的打开/释放/失败事件。
 * [OUTPUT]: 独立引用计数、有界故障类别和稳定订阅快照；重复释放幂等。
 * [POS]: 内置插件视图生命周期Module，不持有文件正文或业务权限。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
export interface PluginUsageState { readonly views: number; readonly failure?: 'viewer-failed' }
export class PluginUsage {
  private state: Readonly<Record<string, PluginUsageState>> = Object.freeze({})
  private readonly listeners = new Set<() => void>()
  private readonly ids: ReadonlySet<string>
  constructor(ids: readonly string[]) { this.ids = new Set(ids) }
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private change(id: string, value: PluginUsageState) {
    if (!this.ids.has(id)) throw new Error('Unknown plugin usage id')
    const next = { ...this.state }
    if (!value.views && !value.failure) delete next[id]; else next[id] = Object.freeze(value)
    this.state = Object.freeze(next)
    for (const listener of this.listeners) listener()
  }
  acquire(id: string) {
    const current = this.state[id] ?? { views: 0 }
    this.change(id, { ...current, views: current.views + 1 })
    let released = false
    return () => {
      if (released) return
      released = true
      const value = this.state[id]
      this.change(id, { ...value, views: Math.max(0, (value?.views ?? 1) - 1) })
    }
  }
  fail(id: string) { this.change(id, { views: this.state[id]?.views ?? 0, failure: 'viewer-failed' }) }
  clearFailure(id: string) { this.change(id, { views: this.state[id]?.views ?? 0 }) }
}

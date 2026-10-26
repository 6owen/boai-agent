/*
 * [INPUT]: 公开数据源IPC、固定源ID与可见详情的订阅生命周期。
 * [OUTPUT]: 只读取当前数据源配置，不再加载员工快照；变化合并刷新，关闭或隐藏后停读，迟到响应不可覆盖新配置。
 * [POS]: 数据源详情读取，不创建连接或调用模型。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { DesktopApi } from '@boai/shared/ipc'
import type { DataSource } from '@boai/shared/domain/sources'

export type SourceDetailState = { source: DataSource }

export function observeSourceDetail(api: DesktopApi, id: string, onValue: (value: SourceDetailState) => void, onError: (error: unknown) => void) {
  let live = true, request = 0, timer: ReturnType<typeof setTimeout> | undefined
  const load = async () => {
    const token = ++request
    try {
      const source = await api.request('getDataSource', { id })
      if (live && token === request) onValue({ source })
    } catch (error) { if (live && token === request) onError(error) }
  }
  const unsubscribe = api.subscribe(event => {
    if (event.type === 'changed' && !event.conversationId) {
      // Invalidate old reads immediately, including during the debounce window.
      request++
      timer ??= setTimeout(() => { timer = undefined; void load() }, 120)
    }
  })
  void load()
  return () => { live = false; request++; clearTimeout(timer); unsubscribe() }
}

/*
 * [INPUT]: 当前可见会话、页面活跃状态、真实浏览器窗口列表和 typed IPC。
 * [OUTPUT]: 标题区的原版窗口徽标与显式查看/接管/关闭；隐藏停止读取，迟到列表不覆盖新会话，不乐观删除实例。
 * [POS]: conversations 的浏览器窗口条，独立于输入框和任务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { BrowserWindowState } from '@shared/ipc/browser'
import { BrowserTabStrip } from '@/components/browser/BrowserTabStrip'
import { errorText } from '@/components/common'

export function ConversationBrowser({ api, conversationId, active }: { api: DesktopApi; conversationId: string; active: boolean }) {
  const [view, setView] = useState<{ conversationId: string; states: BrowserWindowState[]; error?: string }>({ conversationId, states: [] })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!active) return
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request
      try {
        const states = await api.request('getBrowserWindows', { conversationId })
        if (!disposed && token === request) setView({ conversationId, states })
      } catch (error) {
        if (!disposed && token === request) setView({ conversationId, states: [], error: errorText(error) })
      }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'browser:changed' || event.conversationId !== conversationId) return
      request++
      timer ??= setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, active, revision])
  if (!active || view.conversationId !== conversationId) return null
  if (!view.states.some(state => state.control !== 'closed') && !view.error) return null
  return <div className="flex min-w-0 items-center justify-end gap-2 px-4 pb-2" aria-label="本会话浏览器">
    <BrowserTabStrip states={view.states} onAction={async (scopeKey, action) => {
      const state = view.states.find(item => item.scopeKey === scopeKey)
      if (!state || state.conversationId !== conversationId) throw new Error('浏览器归属已变化，请重新读取。')
      await api.request('browserControl', { agentId: state.agentId, conversationId, action })
      setRevision(value => value + 1)
    }} />
    {view.error && <span role="alert" className="max-w-64 truncate text-xs text-destructive" title={view.error}>{view.error}</span>}
  </div>
}

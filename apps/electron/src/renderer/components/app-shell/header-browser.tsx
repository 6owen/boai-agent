/*
 * [INPUT]: 内置浏览器typed IPC和宿主窗口变更。
 * [OUTPUT]: 顶栏单一内置浏览器入口，复用固定窗口；无归属选择或登录设置，真实回执后更新可见状态。
 * [POS]: app-shell 的项目内置浏览器入口；不创建模型调用或工作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { Button } from '@/components/ui/button'
import { errorText } from '@/components/common'
import { LoaderCircle } from '@/components/icons'
import { toast } from 'sonner'

export function HeaderBrowser({ api }: { api: DesktopApi | undefined }) {
  const flight = useRef(false)
  const [busy, setBusy] = useState(false), [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!api) return
    let disposed = false, request = 0
    const load = async () => {
      const token = ++request
      try {
        const states = await api.request('getBrowserWindows', {})
        if (!disposed && token === request) setVisible(states.some(state => state.control !== 'closed' && state.isVisible))
      } catch (error) { if (!disposed && token === request) toast.error(errorText(error)) }
    }
    void load()
    const unsubscribe = api.subscribe(event => { if (event.type === 'browser:changed') void load() })
    return () => { disposed = true; unsubscribe() }
  }, [api])
  const open = async () => {
    if (!api || flight.current) return
    flight.current = true; setBusy(true)
    try { const state = await api.request('openBrowser', {}); setVisible(state.isVisible) }
    catch (error) { toast.error(errorText(error)) }
    finally { flight.current = false; setBusy(false) }
  }
  return <div className="titlebar-no-drag flex shrink-0 items-center">
    <Button variant="ghost" size="icon-sm" aria-label="打开内置浏览器" title="内置浏览器" aria-pressed={visible} disabled={!api || busy} onClick={() => void open()}>{busy ? <LoaderCircle className="animate-spin" /> : <i aria-hidden="true" className="app-icon i-carbon-earth" />}</Button>
  </div>
}

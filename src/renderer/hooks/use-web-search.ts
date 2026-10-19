/*
 * [INPUT]: Desktop search settings API and page visibility.
 * [OUTPUT]: Versioned settings with source/plugin change refresh and late-response isolation.
 * [POS]: Shared read-only search settings hook.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { WebSearchSettings } from '@shared/domain/web-search'
import { showErrorToast, errorText } from '@/components/common'

export function useWebSearchSettings(api: DesktopApi, active = true) {
  const [settings, setSettings] = useState<WebSearchSettings>(), [failed, setFailed] = useState(false)
  const request = useRef(0), live = useRef(false)
  const refresh = useCallback(async () => {
    const token = ++request.current
    try {
      const next = await api.request('getWebSearchSettings', undefined)
      if (live.current && token === request.current) { setSettings(next); setFailed(false) }
    } catch (error) { if (live.current && token === request.current) { setFailed(true); showErrorToast(errorText(error)) } }
  }, [api])
  useEffect(() => {
    live.current = active
    if (!active) return
    void refresh()
    const unsubscribe = api.subscribe(event => { if (event.type === 'plugins:changed' || event.type === 'changed' && !event.conversationId) void refresh() })
    return () => { live.current = false; request.current++; unsubscribe() }
  }, [api, active, refresh])
  return { settings, failed, refresh }
}

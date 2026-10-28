/*
 * [INPUT]: Desktop search settings API and page visibility.
 * [OUTPUT]: Shared per-API settings cache with source/plugin invalidation, retained confirmed data and version-safe refresh.
 * [POS]: Shared read-only search settings hook.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { useCallback } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { WebSearchSettings } from '@boai/shared/domain/web-search'
import { getSettingsQuery, useSettingsQuery } from '@/stores/settings-query'

export function useWebSearchSettings(api: DesktopApi, active = true) {
  const query = getSettingsQuery<WebSearchSettings>(api, 'web-search-settings', {
    read: () => api.request('getWebSearchSettings', undefined), staleTime: 60_000,
    merge: (previous, next) => previous && previous.revision > next.revision ? previous : next,
    onEvent: (event, current) => {
      if (event.type === 'plugins:changed' || event.type === 'changed' && !event.conversationId) current.invalidate()
    },
  })
  const { data: settings, error } = useSettingsQuery(query, active)
  const refresh = useCallback(() => query.refresh(), [query])
  return { settings, failed: Boolean(error), refresh }
}

/*
 * [INPUT]: 本机技能目录 API、显式扫描与安装/升级版本信号。
 * [OUTPUT]: 跨页面复用目录快照、合并并发读取；有效缓存不发送 IPC，刷新与升级后失效，迟到请求不覆盖新快照。
 * [POS]: library 的本地目录缓存 Hook；不缓存文件正文或改写宿主技能。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { LocalSkillCatalog } from '@boai/shared/domain/skills'
import { errorText } from '@/components/common'

type Cache = { value?: LocalSkillCatalog; revision: number; pending?: Promise<LocalSkillCatalog> }
const catalogs = new WeakMap<DesktopApi, Cache>()

function loadCatalog(api: DesktopApi, revision: number, refresh: boolean) {
  const previous = catalogs.get(api)
  if (!refresh && previous?.revision === revision) {
    if (previous.pending) return previous.pending
    if (previous.value) return Promise.resolve(previous.value)
  }
  const cache: Cache = { value: previous?.value, revision }
  const pending = api.request('listLocalSkills', refresh ? { refresh: true } : undefined).then(value => {
    if (catalogs.get(api) === cache) cache.value = value
    return value
  }).catch(error => {
    if (catalogs.get(api) === cache) cache.revision = -1
    throw error
  }).finally(() => { if (cache.pending === pending) cache.pending = undefined })
  cache.pending = pending; catalogs.set(api, cache)
  return pending
}

export function useLocalSkills(api: DesktopApi, revision: number) {
  const [catalog, setCatalog] = useState(() => catalogs.get(api)?.value ?? null)
  const [loading, setLoading] = useState(!catalog), [error, setError] = useState('')
  const generation = useRef(0)
  const reload = useCallback(async (refresh = false) => {
    const request = ++generation.current
    const cached = catalogs.get(api)
    if (!refresh && cached?.value && cached.revision === revision && !cached.pending) { setCatalog(cached.value); setLoading(false); setError(''); return }
    setLoading(true); setError('')
    try { const value = await loadCatalog(api, revision, refresh); if (request === generation.current) setCatalog(value) }
    catch (error) { if (request === generation.current) setError(errorText(error)) }
    finally { if (request === generation.current) setLoading(false) }
  }, [api, revision])
  useEffect(() => { void reload(); return () => { generation.current++ } }, [reload])
  return { catalog, loading, error, reload }
}

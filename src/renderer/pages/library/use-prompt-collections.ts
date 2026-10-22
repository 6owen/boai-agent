/*
 * [INPUT]: DesktopApi提示词集合、版本化变更及changed事件。
 * [OUTPUT]: 共享快照/合并读取、CAS变更与失败回读；过期读取和卸载后的回执不覆盖当前页面。
 * [POS]: 提示词列表局部集合Hook，不复用技能收藏数据。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { PromptCollections, PromptCollectionAction } from '@shared/domain/prompt-templates'
import { errorText, useMutation } from '@/components/common'

const cache = new WeakMap<DesktopApi, PromptCollections>()
const pending = new WeakMap<DesktopApi, Promise<PromptCollections>>()
const epochs = new WeakMap<DesktopApi, number>()
function read(api: DesktopApi) {
  const flight = pending.get(api)
  if (flight) return flight
  const request = api.request('getPromptCollections', undefined).finally(() => { if (pending.get(api) === request) pending.delete(api) })
  pending.set(api, request)
  return request
}
export function usePromptCollections(api: DesktopApi) {
  const [value, setValue] = useState<PromptCollections | null>(() => cache.get(api) ?? null)
  const [loadError, setLoadError] = useState('')
  const generation = useRef(0), lifecycle = useRef(0), current = useRef(value)
  current.current = value
  const mutation = useMutation()
  const reload = useCallback(async (fresh = false) => {
    if (fresh) pending.delete(api)
    const token = ++generation.current, epoch = epochs.get(api) ?? 0
    try {
      const result = await read(api)
      if (token !== generation.current) return
      const cached = cache.get(api)
      const latest = epoch !== (epochs.get(api) ?? 0) || cached && cached.revision > result.revision ? cached ?? result : result
      cache.set(api, latest); current.current = latest
      setValue(previous => previous?.revision === latest.revision ? previous : latest); setLoadError('')
    } catch (error) { if (token === generation.current) setLoadError(errorText(error)) }
  }, [api])
  useEffect(() => {
    lifecycle.current++; void reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !event.conversationId && !timer) timer = setTimeout(() => { timer = undefined; void reload(true) }, 120) })
    return () => { lifecycle.current++; generation.current++; clearTimeout(timer); unsubscribe() }
  }, [api, reload])
  const change = useCallback(async (action: PromptCollectionAction) => {
    let saved = false
    const life = lifecycle.current
    await mutation.run(async () => {
      if (!current.current) throw new Error('提示词分组尚未读取完成，请稍后重试。')
      try {
        const result = await api.request('updatePromptCollections', { expectedRevision: current.current.revision, action })
        epochs.set(api, (epochs.get(api) ?? 0) + 1); pending.delete(api); cache.set(api, result)
        if (life === lifecycle.current) { generation.current++; current.current = result; setValue(result); setLoadError('') }
        saved = true
      } catch (error) {
        pending.delete(api)
        if (life === lifecycle.current) await reload()
        throw error
      }
    })
    return saved
  }, [api, mutation.run, reload])
  return { value, change, reload, busy: mutation.busy, error: mutation.error || loadError }
}

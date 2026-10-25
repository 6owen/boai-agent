/*
 * [INPUT]: DesktopApi 收藏集合和变更通知。
 * [OUTPUT]: 跨页面复用收藏快照，相同 revision 不触发列表重算，变更事件合并读取；旧后台排序合同不匹配时提示完整重启，不自动降级或重放；带版本冲突反馈的收藏视图；迟到读取不能覆盖新数据。
 * [POS]: library 的局部数据 Hook。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { SkillCollections, SkillCollectionAction } from '@boai/shared/domain'
import { errorText, useMutation } from '@/components/common'

const collections = new WeakMap<DesktopApi, SkillCollections>()
const epochs = new WeakMap<DesktopApi, number>()
const pending = new WeakMap<DesktopApi, Promise<SkillCollections>>()
function readCollections(api: DesktopApi) {
  const current = pending.get(api)
  if (current) return current
  const request = api.request('getSkillCollections', undefined).finally(() => { if (pending.get(api) === request) pending.delete(api) })
  pending.set(api, request)
  return request
}

export function useSkillCollections(api: DesktopApi) {
  const [value, setValue] = useState<SkillCollections | null>(() => collections.get(api) ?? null)
  const [loadError, setLoadError] = useState('')
  const generation = useRef(0)
  const mutation = useMutation()
  const reload = useCallback(async () => {
    const request = ++generation.current, epoch = epochs.get(api) ?? 0
    try {
      const result = await readCollections(api)
      if (request === generation.current) {
        const latest = epoch === (epochs.get(api) ?? 0) ? result : collections.get(api) ?? result
        collections.set(api, latest)
        setValue(previous => previous?.revision === latest.revision ? previous : latest); setLoadError('')
      }
    } catch (error) { if (request === generation.current) setLoadError(errorText(error)) }
  }, [api])
  useEffect(() => {
    void reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !event.conversationId && !timer) timer = setTimeout(() => { timer = undefined; void reload() }, 120) })
    return () => { generation.current++; clearTimeout(timer); unsubscribe() }
  }, [api, reload])
  const change = useCallback(async (action: SkillCollectionAction) => {
    let saved = false
    await mutation.run(async () => {
      if (!value) return
      try {
        const result = await api.request('updateSkillCollections', { expectedRevision: value.revision, action })
        generation.current++; epochs.set(api, (epochs.get(api) ?? 0) + 1); pending.delete(api); collections.set(api, result); setValue(result); saved = true
      } catch (error) {
        await reload()
        const message = errorText(error)
        if (['move-skill', 'move-group'].includes(action.kind) && /invalid_union|unrecognized_keys/.test(message)) throw new Error('技能排序需要新版后台。请完全退出 BoAI 后重新启动；开发模式请重新运行 pnpm dev，刷新页面不会更新后台。')
        throw error
      }
    })
    return saved
  }, [api, value, mutation.run, reload])
  return { value, change, reload, busy: mutation.busy, error: mutation.error || loadError }
}

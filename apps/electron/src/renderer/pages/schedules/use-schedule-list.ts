/*
 * [INPUT]: DesktopApi、页面可见状态和标签操作。
 * [OUTPUT]: 读取与串行 CAS 保存列表偏好；失效响应丢弃，冲突重读，隐藏取消订阅。
 * [POS]: schedules 独立列表偏好 Hook。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScheduleListAction, ScheduleListPreferences } from '@boai/shared/domain/schedule-list'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, useMutation } from '@/components/common'

export function useScheduleList(api: DesktopApi, active: boolean) {
  const [value, setValue] = useState<ScheduleListPreferences | null>(null), [loadError, setLoadError] = useState('')
  const generation = useRef(0), locked = useRef(false), mutation = useMutation()
  const reload = useCallback(async () => {
    const request = ++generation.current
    try {
      const result = await api.request('getScheduleList', undefined)
      if (request === generation.current) { setValue(result); setLoadError('') }
    } catch (error) { if (request === generation.current) setLoadError(errorText(error)) }
  }, [api])
  useEffect(() => {
    if (!active) return
    void reload()
    const unsubscribe = api.subscribe(event => { if (event.type === 'schedule-list:changed') void reload() })
    return () => { generation.current++; unsubscribe() }
  }, [api, active, reload])
  const change = async (action: ScheduleListAction, expectedRevision = value?.revision) => {
    if (locked.current || expectedRevision === undefined) return false
    locked.current = true
    let saved = false
    try {
      await mutation.run(async () => {
        try {
          const result = await api.request('updateScheduleList', { expectedRevision, action })
          generation.current++; setValue(result); saved = true
        } catch (error) { await reload(); throw error }
      })
    } finally { locked.current = false }
    return saved
  }
  return { value, change, busy: mutation.busy, error: mutation.error || loadError, reload }
}

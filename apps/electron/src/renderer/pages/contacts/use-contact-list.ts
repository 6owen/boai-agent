/*
 * [INPUT]: DesktopApi 通讯录偏好、通讯录局部事件和员工删除/恢复的全局变更事件。
 * [OUTPUT]: 持久多标签/顺序、标签/排序只刷新通讯录偏好，批量操作串行提交与错误反馈；版本冲突刷新、迟到读取不覆盖保存结果。
 * [POS]: contacts 的局部数据 Hook。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ContactListAction, ContactListPreferences } from '@boai/shared/domain/contact-list'
import { errorText, useMutation } from '@/components/common'

export function useContactList(api: DesktopApi) {
  const [value, setValue] = useState<ContactListPreferences | null>(null)
  const [loadError, setLoadError] = useState('')
  const generation = useRef(0)
  const mutation = useMutation()
  const reload = useCallback(async () => {
    const request = ++generation.current
    try {
      const result = await api.request('getContactList', undefined)
      if (request === generation.current) { setValue(result); setLoadError('') }
    } catch (error) { if (request === generation.current) setLoadError(errorText(error)) }
  }, [api])
  useEffect(() => {
    void reload()
    const unsubscribe = api.subscribe(event => { if (event.type === 'contact-list:changed' || event.type === 'changed' && !event.conversationId) void reload() })
    return () => { generation.current++; unsubscribe() }
  }, [api, reload])
  const change = useCallback(async (action: ContactListAction) => {
    let saved = false
    await mutation.run(async () => {
      if (!value) return
      try {
        const result = await api.request('updateContactList', { expectedRevision: value.revision, action })
        generation.current++; setValue(result); saved = true
      } catch (error) { await reload(); throw error }
    })
    return saved
  }, [api, value, mutation.run, reload])
  return { value, change, busy: mutation.busy, error: mutation.error || loadError, reload }
}

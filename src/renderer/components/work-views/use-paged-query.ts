/*
 * [INPUT]: 有界宿主查询、明确页面活跃状态与会话清理/数据变化事件。
 * [OUTPUT]: 初页/下一页、独立失败与总数；条件或隐藏后拒绝迟到成功和失败，事件立即移除旧对象再核对。
 * [POS]: 工作与文件视图共享的只读分页生命周期，不加载聊天正文或触发业务执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { errorText } from '@/components/common'
import { appendUnique } from './model'
import { readFreshPages } from './pagination'
import { visibleQueryPage } from './query-lifecycle'

interface Page<T, C> { items: T[]; nextCursor?: C; total: number }
const rememberedDepth = new Map<string, number>()
export function usePagedQuery<T, C, P extends Page<T, C>>({ api, active, queryKey, conversationId, read, identity }: {
  api: DesktopApi; active: boolean; queryKey: string; conversationId?: string; read(cursor?: C): Promise<P>; identity(item: T): string
}) {
  const [value, setValue] = useState<{ key: string; page: P; epoch: number }>(), [loading, setLoading] = useState(false), [failure, setFailure] = useState<{ key: string; page: string; epoch: number }>(), [revision, setRevision] = useState(0)
  const serial = useRef(0), latest = useRef({ active, queryKey, read }), inFlight = useRef(false), epoch = useRef(0)
  if (latest.current.active !== active || latest.current.queryKey !== queryKey) epoch.current++
  latest.current = { active, queryKey, read }
  useEffect(() => {
    const token = ++serial.current, visibleEpoch = epoch.current; inFlight.current = false
    if (!active) { setLoading(false); return }
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined
    setValue(undefined); setLoading(true); setFailure(undefined)
    const current = () => !disposed && token === serial.current && visibleEpoch === epoch.current && latest.current.active && latest.current.queryKey === queryKey
    void readFreshPages(latest.current.read, rememberedDepth.get(queryKey) ?? 1, current, identity).then(page => { if (current() && page) setValue({ key: queryKey, page, epoch: visibleEpoch }) }).catch(cause => { if (current()) { setValue(undefined); setFailure({ key: queryKey, page: errorText(cause), epoch: visibleEpoch }) } }).finally(() => { if (current()) setLoading(false) })
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'changed' && event.type !== 'conversation:cleared' && event.type !== 'conversation:deleted') return
      if (conversationId && event.conversationId && event.conversationId !== conversationId) return
      serial.current++; setValue(undefined); setFailure(undefined); inFlight.current = false
      if (!timer) timer = setTimeout(() => { timer = undefined; if (!disposed) setRevision(value => value + 1) }, 120)
    })
    return () => { disposed = true; serial.current++; unsubscribe(); clearTimeout(timer) }
  }, [api, active, queryKey, conversationId, revision])
  const page = visibleQueryPage(value, { key: queryKey, active, epoch: epoch.current })
  const error = visibleQueryPage(failure, { key: queryKey, active, epoch: epoch.current }) ?? ''
  const loadMore = async () => {
    if (!page?.nextCursor || inFlight.current || !latest.current.active) return
    const token = serial.current, key = queryKey, visibleEpoch = epoch.current; inFlight.current = true; setLoading(true); setFailure(undefined)
    const current = () => token === serial.current && visibleEpoch === epoch.current && latest.current.active && latest.current.queryKey === key
    try { const next = await latest.current.read(page.nextCursor); if (current()) { rememberedDepth.set(key, (rememberedDepth.get(key) ?? 1) + 1); setValue({ key, page: { ...next, items: appendUnique(page.items, next.items, identity) }, epoch: visibleEpoch }) } }
    catch (cause) { if (current()) setFailure({ key, page: errorText(cause), epoch: visibleEpoch }) }
    finally { if (current()) { inFlight.current = false; setLoading(false) } }
  }
  return { page, loading, error, loadMore, reload: () => { serial.current++; setValue(undefined); setRevision(value => value + 1) } }
}

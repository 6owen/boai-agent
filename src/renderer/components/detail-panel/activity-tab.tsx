/*
 * [INPUT]: 固定会话 ID、桌面事件、当前会话的实时快照与活动操作回调。
 * [OUTPUT]: 不随主会话切换漂移的任务与产物内容，活跃标签按事件刷新。
 * [POS]: detail-panel 的活动标签数据边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState, type ComponentProps } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { ConversationDetail } from '@shared/domain'
import { Banner, errorText, Loading } from '@/components/common'
import { ActivityDetail } from '@/pages/conversations/-components/activity-detail'

export function ActivityTab({ api, conversationId, active, currentDetail, ...props }: Omit<ComponentProps<typeof ActivityDetail>, 'detail'> & {
  api: DesktopApi; conversationId: string; active: boolean; currentDetail: ConversationDetail | null
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null), [error, setError] = useState('')
  useEffect(() => {
    if (!active) return
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request
      try { const result = await api.request('getConversation', { id: conversationId }); if (!disposed && token === request) { setDetail(result); setError('') } }
      catch (e) { if (!disposed && token === request) setError(errorText(e)) }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'changed' && !(event.type === 'message' && event.message.conversationId === conversationId)) return
      if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, active])
  const value = currentDetail?.conversation.id === conversationId ? currentDetail : detail
  return <>{error && <Banner>{error}</Banner>}{value ? <ActivityDetail {...props} detail={value} /> : !error && <Loading />}</>
}

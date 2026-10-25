/*
 * [INPUT]: 固定会话 ID、桌面事件、当前会话的实时快照与活动操作回调。
 * [OUTPUT]: 无正文元信息及宿主即时证据检查为本标签权威，清理/失效立即清缓存；不随主会话切换漂移的任务与产物内容，活跃标签按事件刷新，工作详情按明确 workId/requestId 定位原工作，单群成果透传统一固定版本预览入口。
 * [POS]: detail-panel 的活动标签数据边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ConversationDetail } from '@boai/shared/domain'
import { Banner, errorText, Loading } from '@/components/common'
import { ActivityDetail } from '@/pages/conversations/-components/activity-detail'

export function ActivityTab({ api, conversationId, active, currentDetail: _currentDetail, workId, requestId, ...props }: Omit<ComponentProps<typeof ActivityDetail>, 'detail'> & {
  api: DesktopApi; conversationId: string; active: boolean; currentDetail: ConversationDetail | null; workId?: string; requestId?: string
}) {
  const root = useRef<HTMLDivElement>(null), focused = useRef<string | undefined>(undefined)
  const [detail, setDetail] = useState<ConversationDetail | null>(null), [error, setError] = useState('')
  useEffect(() => {
    if (!active) return
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request
      setDetail(null)
      try { const result = await api.request('getConversationMetadata', { id: conversationId }); if (!disposed && token === request) { setDetail(result); setError('') } }
      catch (e) { if (!disposed && token === request) { setDetail(null); setError(errorText(e)) } }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) { request++; clearTimeout(timer); setDetail(null); setError('聊天记录已清理，任务与产物不可用。'); return }
      if (event.type !== 'changed' && !(event.type === 'message' && event.message.conversationId === conversationId)) return
      if (event.type === 'changed' && event.conversationId && event.conversationId !== conversationId) return
      request++; setDetail(null)
      if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, active])
  const value = detail?.conversation.id === conversationId ? detail : null
  useEffect(() => {
    if (!active || !workId || !value || focused.current === (requestId ?? workId)) return
    const element = [...(root.current?.querySelectorAll<HTMLElement>('[data-work-id]') ?? [])].find(element => element.dataset.workId === workId)
    if (!element) return
    focused.current = requestId ?? workId; element.tabIndex = -1; element.scrollIntoView({ block: 'nearest' }); element.focus({ preventScroll: true })
  }, [active, workId, requestId, value])
  return <div ref={root}>{error && <Banner>{error}</Banner>}{workId && value && !value.workItems?.some(work => work.id === workId) && <Banner>该工作已被清理或不可用。</Banner>}{value ? <ActivityDetail {...props} detail={value} /> : !error && <Loading />}</div>
}

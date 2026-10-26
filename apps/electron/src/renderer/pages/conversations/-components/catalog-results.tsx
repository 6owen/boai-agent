/*
 * [OUTPUT]: 资源管理结果导航携已保存名称，数据源打开全局右侧配置标签。
 * [INPUT]: 当前bobo普通会话、已提交目录回执和全局管理导航。
 * [OUTPUT]: 真实回执按目标合并，并以独立员工消息行跟随对应轮次回复；隐藏停读、迟到隔离。
 * [POS]: 正常聊天的目录管理结果，无第二套聊天组件。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { mergeCatalogResults, type CatalogResult } from '@boai/shared/domain/catalog-management'
import type { ConversationDetail, DigitalAgent } from '@boai/shared/domain'
import { CORE_AGENT_ID } from '@boai/shared/domain/core-agent'
import { Button } from '@/components/ui/button'
import { Database, Zap } from '@/components/icons'
import { Avatar, errorText } from '@/components/common'
import { toast } from 'sonner'

export function useCatalogResults(api: DesktopApi, conversationId: string, active: boolean) {
  const [view, setView] = useState<{ conversationId: string; items: CatalogResult[] }>({ conversationId, items: [] })
  useEffect(() => {
    if (!active) return
    let live = true, request = 0, timer: ReturnType<typeof setTimeout> | undefined, lastError = ''
    const load = async () => {
      const token = ++request
      try { const items = await api.request('listCatalogResults', { conversationId }); if (live && token === request) { setView({ conversationId, items }); lastError = '' } }
      catch (error) { const text = errorText(error); if (live && token === request && text !== lastError) { lastError = text; toast.error(text) } }
    }
    void load()
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && (!event.conversationId || event.conversationId === conversationId)) { timer ??= setTimeout(() => { timer = undefined; void load() }, 120) } })
    return () => { live = false; request++; clearTimeout(timer); unsubscribe() }
  }, [api, conversationId, active])
  return view.conversationId === conversationId ? mergeCatalogResults(view.items) : []
}

export function catalogResultsByMessage(items: CatalogResult[], detail: Pick<ConversationDetail, 'messages' | 'runs'>) {
  const triggers = new Map(detail.runs.map(run => [run.id, run.triggerMessageId]))
  const replies = new Map<string, string>()
  for (const message of detail.messages) {
    const trigger = message.runId && triggers.get(message.runId)
    if (trigger && message.senderId === CORE_AGENT_ID && message.status === 'completed') replies.set(trigger, message.id)
  }
  const byMessage = new Map<string, CatalogResult[]>()
  for (const item of items) {
    const anchor = replies.get(item.messageId) ?? item.messageId
    byMessage.set(anchor, [...(byMessage.get(anchor) ?? []), item])
  }
  return byMessage
}

export function CatalogResults({ items, agent, onOpen }: { items: CatalogResult[]; agent?: DigitalAgent; onOpen(kind: 'skill' | 'source', id: string, name?: string): void }) {
  return <>{items.map(item => <article className="message-row agent" aria-label="资源操作结果" key={item.id}>
    <div className="message-avatar"><Avatar name={agent?.name ?? 'bobo'} seed={CORE_AGENT_ID} avatar={agent?.avatar} color={agent?.color} /></div>
    <div className="message-main"><Button variant="secondary" size="content" className="chat-artifact" disabled={!item.available || !item.targetId} onClick={() => onOpen(item.kind, item.targetId!, item.name)}>
      {item.kind === 'skill' ? <Zap /> : <Database />}<span className="chat-artifact-copy"><strong>{item.name}</strong><small>{item.removed ? '已删除' : item.status === 'running' ? '处理中' : item.status === 'cancelled' ? '已取消' : item.status === 'failed' || item.status === 'interrupted' ? '未完成' : item.kind === 'skill' ? '技能' : '数据源'}</small></span>
      {item.available && item.targetId && <span className="chat-artifact-open">打开</span>}
    </Button></div>
  </article>)}</>
}

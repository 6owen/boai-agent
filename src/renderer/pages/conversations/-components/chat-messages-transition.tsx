/*
 * [INPUT]: 当前会话身份、真实消息加载状态与消息滚动区。
 * [OUTPUT]: 消息复用通讯录详情的共享Panel reveal；骨架直接沿messages/message-row的内边距、内容最大宽度与容器断点，不交叉模糊整块滚动区、不使用计时切换。
 * [POS]: ChatView仅消息区的加载过渡，固定header/composer由外层持有。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ReactNode } from 'react'
import { usePanelReveal } from '@/components/common/use-panel-reveal'
import { Skeleton } from '@/components/ui/skeleton'

export function ChatMessagesTransition({ conversationId, loading, active = true, children }: { conversationId: string; loading: boolean; active?: boolean; children: ReactNode }) {
  const content = usePanelReveal(conversationId, active && !loading)
  return <div className="chat-messages-transition" aria-busy={loading}>
    {loading && <div className="messages chat-history-skeleton" aria-hidden="true" inert>
      {(['user', 'agent', 'user', 'agent'] as const).map((sender, index) => <div key={index} className={`message-row ${sender}`}>
        <div className="message-avatar"><Skeleton className="avatar motion-reduce:animate-none" /></div>
        <div className="message-main">
          <div className="chat-history-skeleton-meta"><Skeleton className="h-2.5 w-16 motion-reduce:animate-none" /></div>
          <div className="chat-history-skeleton-bubble">{Array.from({ length: sender === 'agent' ? 3 : 2 }, (_, line) => <Skeleton key={line} className="chat-history-skeleton-line h-3 motion-reduce:animate-none" />)}</div>
        </div>
      </div>)}
    </div>}
    <div ref={content} className="chat-messages-content settings-page-transition t-panel-slide" data-open="true" data-settled="true" hidden={loading} inert={loading} aria-hidden={loading || undefined}>{children}</div>
  </div>
}

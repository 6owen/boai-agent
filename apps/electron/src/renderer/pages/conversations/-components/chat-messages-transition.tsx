/*
 * [INPUT]: 当前会话身份、真实消息加载状态与消息滚动区。
 * [OUTPUT]: 暂时注释加载骨架；消息就绪后保留共享Panel reveal淡入与位移动画，固定布局和加载守卫保持。
 * [POS]: ChatView仅消息区的加载过渡，固定header/composer由外层持有。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ReactNode } from 'react'
import { usePanelReveal } from '@/components/common/use-panel-reveal'
// 恢复骨架屏时，取消此导入及下方骨架 JSX 块的注释即可。
// import { Skeleton } from '@/components/ui/skeleton'

export function ChatMessagesTransition({ conversationId, loading, active = true, children }: { conversationId: string; loading: boolean; active?: boolean; children: ReactNode }) {
  const content = usePanelReveal(conversationId, active && !loading)
  return <div className="chat-messages-transition" aria-busy={loading}>
    {/* 骨架屏暂时停用，保留实现便于恢复。
    {loading && <div className="messages chat-history-skeleton" aria-hidden="true" inert>
      {(['user', 'agent', 'user', 'agent'] as const).map((sender, index) => <div key={index} className={`message-row ${sender}`}>
        <div className="message-avatar"><Skeleton className="avatar motion-reduce:animate-none" /></div>
        <div className="message-main">
          <div className="chat-history-skeleton-meta"><Skeleton className="h-2.5 w-16 motion-reduce:animate-none" /></div>
          <div className="chat-history-skeleton-bubble">{Array.from({ length: sender === 'agent' ? 3 : 2 }, (_, line) => <Skeleton key={line} className="chat-history-skeleton-line h-3 motion-reduce:animate-none" />)}</div>
        </div>
      </div>)}
    </div>}
    */}
    <div ref={content} className="chat-messages-content settings-page-transition t-panel-slide" data-open="true" data-settled="true" hidden={loading} inert={loading} aria-hidden={loading || undefined}>{children}</div>
  </div>
}

/*
 * [OUTPUT]: 规范BOAI对象引用沿明确会话/员工范围打开源卡片；HTTP链接保持原行为。
 * [INPUT]: 消息中的链接文字与网址、共享HoverCard和Button。
 * [OUTPUT]: HTTP/HTTPS链接悬停预览，12px间距和transitions-dev锚定淡入/淡出缩放；Base UI完成退出后卸载，点击沿现有入口打开系统浏览器，其他来源保留文本。
 * [POS]: 会话消息的网页链接预览，不请求网页元数据或读取本机文件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属目录.folder.md。
 */
import type { ReactNode } from 'react'
import { parseReferenceUri, type ReferenceScope } from '@boai/shared/domain/references'
import { ObjectReference } from './object-reference'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

export function MessageLink({ href, children, referenceScope }: { href?: string; children: ReactNode; referenceScope?: ReferenceScope }) {
  if (href && referenceScope && parseReferenceUri(href)) return <ObjectReference key={`${referenceScope.agentId}:${referenceScope.conversationId}:${href}`} uri={href} scope={referenceScope}>{children}</ObjectReference>
  let url: URL | undefined
  try { if (href) url = new URL(href) } catch { /* Non-web references remain plain text. */ }
  if (!url || !['http:', 'https:'].includes(url.protocol)) return <span title={href} className="markdown-link">{children}</span>
  const destination = url.href
  return <HoverCard>
    <HoverCardTrigger href={destination} target="_blank" rel="noopener noreferrer" className="markdown-link cursor-pointer" delay={300}>{children}</HoverCardTrigger>
    <HoverCardContent align="start" sideOffset={12} className="t-dropdown w-80 max-w-[calc(100vw-24px)] p-3" style={{ animation: 'none', transformOrigin: 'var(--transform-origin)' }} render={(props, state) => <div {...props} className={cn(props.className, { 'is-open': state.open && state.transitionStatus !== 'starting', 'is-closing': !state.open && state.transitionStatus === 'ending' })} />}>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><i aria-hidden="true" className="app-icon i-carbon-earth size-4 shrink-0" /><span className="min-w-0 truncate">{url.host}</span></div>
        <div className="break-words font-medium">{children}</div>
        <div className="max-h-24 overflow-y-auto break-all text-xs text-muted-foreground">{destination}</div>
        <Button variant="secondary" size="sm" className="self-start" render={<a href={destination} target="_blank" rel="noopener noreferrer" />}><i aria-hidden="true" className="app-icon i-carbon-launch size-3.5" />在浏览器中打开</Button>
      </div>
    </HoverCardContent>
  </HoverCard>
}

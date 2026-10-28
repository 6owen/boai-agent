/*
 * [OUTPUT]: 消息与来源未变时复用Markdown子树，面板开关不重建正文；事件回调取最新已提交值，正文/授权变化仍重渲染。
 * [OUTPUT]: 用户消息按固定引用将技能/数据源/文件还原为输入框同款行内标签，/命令同款展示；代码和链接原文保持，不改消息正文或引用权限。
 * [OUTPUT]: 实际对象链接携消息员工/会话作用域，无法确定员工时不猜测私人引用范围。
 * [OUTPUT]: 已发布知识引用按宿主实际读取身份打开原全局预览；明确重开更新定位，失效不跳到新内容。
 * [OUTPUT]: 普通网页链接复用MessageLink悬停预览和系统浏览器入口；未核验的本机资料引用仍为文本。
 * [INPUT]: 公开消息或宿主已核对成果正文、各自真实材料来源及当前会话材料回执。
 * [OUTPUT]: 仅为身份/有效授权版本/hash/行范围均可核对的材料引用提供原文定位按钮；同hash显式恢复保留原来源定位，授权变更不继承；其余引用保留纯文本。
 * [POS]: 聊天消息内可信材料来源展示；不根据文件名或模型声明猜测读取权限。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Fragment, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { parseReferenceUri } from '@boai/shared/domain/references'
import { matchKnowledgeCitation, type KnowledgeCitationInput, type KnowledgeReadRef } from '@boai/shared/domain/knowledge'
import type { ConversationDetail, Message } from '@boai/shared/domain'
import { isMaterialReadRevisionValid, type ConversationMaterial } from '@boai/shared/domain/materials'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/common/markdown'
import { materialDisplayName } from './material-draft'
import { MessageLink } from './message-link'
import { MessageReferenceText } from './message-reference-text'

type MaterialMarkdownProps = { onKnowledgePreview?(target: KnowledgeCitationInput, reference: KnowledgeReadRef, agentId: string): void; detail: ConversationDetail; onPreview(material: ConversationMaterial, line?: number): void } & ({ message: Message; source?: never } | { source: Pick<Message, 'content' | 'materialSources'>; message?: never })
export function MaterialMarkdown({ message, source, detail, onPreview, onKnowledgePreview }: MaterialMarkdownProps) {
  const actions = useRef({ onPreview, onKnowledgePreview })
  useLayoutEffect(() => { actions.current = { onPreview, onKnowledgePreview } }, [onPreview, onKnowledgePreview])
  const hasKnowledgePreview = Boolean(onKnowledgePreview)
  return useMemo(() => {
    const published = source ?? message
    const render = (children: ReactNode, tags = true): ReactNode => {
      if (Array.isArray(children)) return children.map((child, index) => <Fragment key={index}>{render(child, tags)}</Fragment>)
      if (typeof children !== 'string') return children
      const pattern = /material:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):text-v1:L([1-9]\d*)(?:-L([1-9]\d*))?(?![\w-])/gi
      const parts: ReactNode[] = []; let start = 0
      for (const match of children.matchAll(pattern)) {
        const index = match.index!, first = Number(match[2]), last = Number(match[3] ?? match[2])
        if (index > start) parts.push(children.slice(start, index))
        const material = detail.materials?.find(value => value.id === match[1] && value.conversationId === detail.conversation.id && value.status === 'ready')
        const verified = material && material.contentHash && published.materialSources?.some(ref => ref.id === material.id && ref.conversationId === material.conversationId && isMaterialReadRevisionValid(material, ref.revision) && ref.contentHash === material.contentHash && ref.parseVersion === material.parseVersion) && first <= last && last <= (material.lineCount ?? 0)
        parts.push(verified ? <Button key={index} variant="link" size="content" className="inline text-inherit" aria-label={`查看材料 ${materialDisplayName(material.name)} 第 ${first} 至 ${last} 行`} onClick={() => actions.current.onPreview(material, first)}>{match[0]}</Button> : match[0])
        start = index + match[0].length
      }
      if (start < children.length) parts.push(children.slice(start))
      const result = parts.length ? parts : [children]
      return tags && message?.senderType === 'user' ? result.map((part, index) => typeof part === 'string' ? <MessageReferenceText key={index} references={message.composerReferences}>{part}</MessageReferenceText> : part) : result
    }
    return <Markdown components={{
      p: ({ children }) => <p>{render(children)}</p>, li: ({ children }) => <li>{render(children)}</li>,
      strong: ({ children }) => <strong>{render(children)}</strong>, em: ({ children }) => <em>{render(children)}</em>,
      code: ({ children, className }) => <code className={className}>{render(children, false)}</code>,
      td: ({ children }) => <td>{render(children)}</td>, th: ({ children }) => <th>{render(children)}</th>,
      h1: ({ children }) => <h1>{render(children)}</h1>, h2: ({ children }) => <h2>{render(children)}</h2>, h3: ({ children }) => <h3>{render(children)}</h3>,
      h4: ({ children }) => <h4>{render(children)}</h4>, h5: ({ children }) => <h5>{render(children)}</h5>, h6: ({ children }) => <h6>{render(children)}</h6>,
      del: ({ children }) => <del>{render(children)}</del>,
      a: ({ children, href }) => {
        const citation = message?.status === 'completed' && message.senderType === 'agent' ? matchKnowledgeCitation(message.knowledgeSources, href) : undefined
        return citation && message && hasKnowledgePreview
          ? <Button variant="link" size="content" className="inline text-inherit" aria-label={`查看知识资料 ${citation.reference.name} 第 ${citation.line} 行`} onClick={() => actions.current.onKnowledgePreview?.({ messageId: message.id, referenceIndex: citation.referenceIndex, line: citation.line }, citation.reference, message.senderId)}>{children}</Button>
          : <MessageLink href={href} referenceScope={href && parseReferenceUri(href) && detail.conversation ? message?.senderType === 'agent' ? { agentId: message.senderId, conversationId: detail.conversation.id } : detail.conversation.agentIds.length === 1 ? { agentId: detail.conversation.agentIds[0]!, conversationId: detail.conversation.id } : undefined : undefined}>{render(children, false)}</MessageLink>
      },
    }}>{published.content}</Markdown>
  }, [message, source, detail, hasKnowledgePreview])
}

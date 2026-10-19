/*
 * [OUTPUT]: 已发布知识引用按宿主实际读取身份打开原全局预览；明确重开更新定位，失效不跳到新内容。
 * [INPUT]: 公开消息或宿主已核对成果正文、各自真实材料来源及当前会话材料回执。
 * [OUTPUT]: 仅为身份/有效授权版本/hash/行范围均可核对的材料引用提供原文定位按钮；同hash显式恢复保留原来源定位，授权变更不继承；其余引用保留纯文本。
 * [POS]: 聊天消息内可信材料来源展示；不根据文件名或模型声明猜测读取权限。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Fragment, type ReactNode } from 'react'
import { matchKnowledgeCitation, type KnowledgeCitationInput, type KnowledgeReadRef } from '@shared/domain/knowledge'
import type { ConversationDetail, Message } from '@shared/domain'
import { isMaterialReadRevisionValid, type ConversationMaterial } from '@shared/domain/materials'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/common/markdown'
import { materialDisplayName } from './material-draft'

type MaterialMarkdownProps = { onKnowledgePreview?(target: KnowledgeCitationInput, reference: KnowledgeReadRef, agentId: string): void; detail: ConversationDetail; onPreview(material: ConversationMaterial, line?: number): void } & ({ message: Message; source?: never } | { source: Pick<Message, 'content' | 'materialSources'>; message?: never })
export function MaterialMarkdown({ message, source, detail, onPreview, onKnowledgePreview }: MaterialMarkdownProps) {
  const published = source ?? message
  const render = (children: ReactNode): ReactNode => {
    if (Array.isArray(children)) return children.map((child, index) => <Fragment key={index}>{render(child)}</Fragment>)
    if (typeof children !== 'string') return children
    const pattern = /material:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):text-v1:L([1-9]\d*)(?:-L([1-9]\d*))?(?![\w-])/gi
    const parts: ReactNode[] = []; let start = 0
    for (const match of children.matchAll(pattern)) {
      const index = match.index!, first = Number(match[2]), last = Number(match[3] ?? match[2])
      if (index > start) parts.push(children.slice(start, index))
      const material = detail.materials?.find(value => value.id === match[1] && value.conversationId === detail.conversation.id && value.status === 'ready')
      const verified = material && material.contentHash && published.materialSources?.some(ref => ref.id === material.id && ref.conversationId === material.conversationId && isMaterialReadRevisionValid(material, ref.revision) && ref.contentHash === material.contentHash && ref.parseVersion === material.parseVersion) && first <= last && last <= (material.lineCount ?? 0)
      parts.push(verified ? <Button key={index} variant="link" size="content" className="inline text-inherit" aria-label={`查看材料 ${materialDisplayName(material.name)} 第 ${first} 至 ${last} 行`} onClick={() => onPreview(material, first)}>{match[0]}</Button> : match[0])
      start = index + match[0].length
    }
    if (start < children.length) parts.push(children.slice(start))
    return parts.length ? parts : children
  }
  return <Markdown components={{
    p: ({ children }) => <p>{render(children)}</p>, li: ({ children }) => <li>{render(children)}</li>,
    strong: ({ children }) => <strong>{render(children)}</strong>, em: ({ children }) => <em>{render(children)}</em>,
    code: ({ children, className }) => <code className={className}>{render(children)}</code>,
    td: ({ children }) => <td>{render(children)}</td>, th: ({ children }) => <th>{render(children)}</th>,
    a: ({ children, href }) => {
      const citation = message?.status === 'completed' && message.senderType === 'agent' ? matchKnowledgeCitation(message.knowledgeSources, href) : undefined
      return citation && message && onKnowledgePreview
        ? <Button variant="link" size="content" className="inline text-inherit" aria-label={`查看知识资料 ${citation.reference.name} 第 ${citation.line} 行`} onClick={() => onKnowledgePreview({ messageId: message.id, referenceIndex: citation.referenceIndex, line: citation.line }, citation.reference, message.senderId)}>{children}</Button>
        : <span title={href} className="markdown-link">{render(children)}</span>
    },
  }}>{published.content}</Markdown>
}

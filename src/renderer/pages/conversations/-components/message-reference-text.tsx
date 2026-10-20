/*
 * [INPUT]: 消息正文文本与受理时固定的技能/数据源/文件引用。
 * [OUTPUT]: 在原位置还原$资源（兼容旧@资源）与/命令的Soft标签，复用输入框皮肤；不改正文、不推断资源身份、不执行操作。
 * [POS]: 聊天正文的纯展示标签，供可信Markdown文字节点使用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Fragment, type ReactNode } from 'react'
import type { ComposerReference } from '@shared/domain/composer-references'
import { cn } from 'cn'
import { buttonVariants } from '@/components/ui/button'
import { composerCommands } from '../composer-commands'

const kindNames = { skill: '技能', source: '数据源', artifact: '文件', material: '文件' }
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tagClass = cn(buttonVariants({ variant: 'secondary', size: 'xs' }), 'inline h-auto py-1 select-text message-reference-tag')
const commands = new Map(composerCommands.map(command => [`/${command.id}`, command]))
const commandPattern = [...commands.keys()].map(escapePattern).join('|')

export function MessageReferenceText({ children: text, references = [] }: { children: string; references?: ComposerReference[] }) {
  const labels = new Map(references.flatMap(reference => [`$${reference.name}`, `@${reference.name}`].map(label => [label, reference] as const)))
  const resourcePattern = [...labels.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join('|')
  // Commands use a separate boundary so URL segments and filesystem paths stay ordinary text.
  const pattern = new RegExp(`${resourcePattern ? `(?:${resourcePattern})(?![\\w.-])|` : ''}(?<![\\p{L}\\p{N}_./:\\\\-])(?:${commandPattern})(?![\\w./\\\\-])`, 'gu')
  const parts: ReactNode[] = []
  let start = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index!, reference = labels.get(match[0])
    if (index > start) parts.push(text.slice(start, index))
    parts.push(<span key={index} className={tagClass} data-reference-kind={reference?.kind ?? 'command'} data-reference-id={reference?.id} title={reference ? `${kindNames[reference.kind]}：${reference.name}` : `命令：${commands.get(match[0])!.name}`}>{match[0]}</span>)
    start = index + match[0].length
  }
  if (!parts.length) return text
  if (start < text.length) parts.push(text.slice(start))
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>
}

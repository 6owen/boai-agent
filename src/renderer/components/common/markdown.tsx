/*
 * [INPUT]: Markdown 文本、可选元素渲染覆盖与全局 CodeBlock。
 * [OUTPUT]: 共享 GFM 渲染；围栏/缩进代码使用 Shiki，行内代码保留普通排版；禁用原始 HTML、远程图片和隐式外链导航。
 * [POS]: 会话与技能说明共用的 Markdown 展示入口，不引入业务 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ComponentProps } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@/components/ui/code-block'

function MarkdownCode({ node, children }: ComponentProps<'pre'> & ExtraProps) {
  const code = node?.children[0]
  if (code?.type !== 'element' || code.tagName !== 'code') return <pre>{children}</pre>
  const text = code.children.map(child => child.type === 'text' ? child.value : '').join('')
  const classes = code.properties.className
  const language = (Array.isArray(classes) ? classes : String(classes ?? '').split(' ')).find(value => String(value).startsWith('language-'))
  return <CodeBlock code={text} language={language ? String(language).slice('language-'.length) : undefined} />
}

const defaults: Components = {
  pre: MarkdownCode,
  a: ({ children, href }) => <span title={href} className="markdown-link">{children}</span>,
  img: ({ alt }) => <span className="muted">[图片：{alt || '外部图片未加载'}]</span>,
}

export function Markdown({ children, components }: { children: string; components?: Components }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ ...defaults, ...components }}>{children}</ReactMarkdown>
}

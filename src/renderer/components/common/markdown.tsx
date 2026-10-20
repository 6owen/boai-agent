/*
 * [OUTPUT]: 仅保留规范boai://ref地址供受信渲染器解析；其他地址仍沿react-markdown默认过滤。
 * [INPUT]: Markdown 文本、可选元素渲染覆盖与全局 CodeBlock。
 * [OUTPUT]: 共享安全GFM渲染及MarkdownContent排版入口；Typeset统一正文/列表/表格，Shiki展示代码；禁用原始HTML、远程图片和隐式外链导航。
 * [POS]: 会话与技能说明共用的 Markdown 展示入口，不引入业务 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ComponentProps } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseReferenceUri } from '@shared/domain/references'
import { CodeBlock } from '@/components/ui/code-block'
import { Typeset } from '@/components/ui/typeset'

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
  return <ReactMarkdown urlTransform={url => parseReferenceUri(url) ? url : defaultUrlTransform(url)} remarkPlugins={[remarkGfm]} skipHtml components={{ ...defaults, ...components }}>{children}</ReactMarkdown>
}

const typesetComponents: Components = {
  table: ({ children }) => <div className="typeset-scroll" tabIndex={0} role="region" aria-label="表格，可横向滚动"><table>{children}</table></div>,
}

export function MarkdownContent({ children, components, ...props }: Omit<ComponentProps<typeof Typeset>, 'children'> & { children: string; components?: Components }) {
  return <Typeset {...props}><Markdown components={{ ...typesetComponents, ...components }}>{children}</Markdown></Typeset>
}

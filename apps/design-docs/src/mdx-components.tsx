/*
 * [INPUT]: 公共示例目录、BOAI组件及共享字体/主题。
 * [OUTPUT]: 按需加载的独立文档预览与真实源码。
 * [POS]: 设计站展示层，无业务API。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import type { MDXComponents } from 'mdx/types'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import { Card, CardHeader, CardTitle, CardDescription } from '@boai/ui/card'
import { Separator } from '@boai/ui/separator'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@boai/ui/table'
import type { ReactNode } from 'react'
function DocCard({ title, description, href, children }: {title: string;description?: string;href?: string;children?: ReactNode}) {
 const body=<Card><CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}{children}</CardHeader></Card>
 return href ? <a className="not-prose block" href={href}>{body}</a> : body
}
export const mdxComponents: MDXComponents = {
 ...defaultMdxComponents,
 table: props => <Table {...props} className="not-prose" />,
 thead: TableHeader, tbody: TableBody, tr: TableRow, th: TableHead, td: TableCell,
 hr: () => <Separator className="my-6" />,
 Card: DocCard,
}

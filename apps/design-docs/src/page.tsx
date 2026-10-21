/*
 * [INPUT]: 白名单公开Markdown、共享组件和真实交互示例。
 * [OUTPUT]: 设计概览、基础规范与组件文档页面。
 * [POS]: 设计站内容层；不执行Markdown内脚本。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Separator } from '@boai/ui'
import type { DesignPage as Page } from 'virtual:boai-design-content'
import { CodeSample, Preview } from './preview'
import { ComponentExample, SettingsExample, TypographyExample, exampleSources } from './examples'

const swatches = ['background', 'card', 'foreground', 'muted-foreground', 'primary', 'border', 'destructive', 'success']

function Foundations({ kind }: { kind: string }) {
  if (kind === 'colors') return <div className="color-grid">{swatches.map(name => <Card size="sm" key={name}><div className="color-swatch" style={{ background: `var(--${name})` }} /><CardHeader><CardTitle>{name}</CardTitle><CardDescription>{`var(--${name})`}</CardDescription></CardHeader></Card>)}</div>
  if (kind === 'typography') return <Preview label="排版" code={exampleSources.typography}><TypographyExample /></Preview>
  if (kind === 'surfaces') return <div className="surface-grid">{['shadow-input', 'shadow-control', 'shadow-card', 'shadow-popover'].map(name => <div className="surface-sample" key={name} style={{ boxShadow: `var(--${name})` }}><span>{name}</span><small>Soft 表面</small></div>)}</div>
  return null
}

function Overview() {
  return <>
    <div className="overview-preview"><div className="overview-mini-sidebar" aria-hidden="true"><span>我的空间</span><span className="active">项目设置</span><span>成员</span><span>资料</span><span>外观</span></div><div className="overview-mini-content"><div className="mini-header"><span>工作空间</span><Badge variant="outline">Personal</Badge></div><SettingsExample /></div></div>
    <div className="overview-principles">{[
      ['01', '熟悉的表面', '中性色、细边缘与轻高光。控件有质感，内容有呼吸。'],
      ['02', '一致的细节', '字体、圆角、阴影和状态共享定义，修改发生在同一个地方。'],
      ['03', '就近的反馈', '动作和状态留在用户操作的位置，异步内容沿稳定结构加载。'],
    ].map(([number, title, description]) => <Card key={number} size="sm"><CardHeader><span className="principle-number">{number}</span><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader></Card>)}</div>
    <div className="overview-next"><a href="/components/button"><span>组件</span><strong>从一个按钮开始 ↗</strong></a><a href="/foundations/typography"><span>设计基础</span><strong>同一套排版语言 ↗</strong></a></div>
  </>
}

export function DesignPage({ page, version }: { page: Page; version: string }) {
  const overview = page.slug === 'overview'
  return <article className="docs-page" data-overview={overview}>
    <header className="page-heading"><div className="page-eyebrow">{overview ? <>BOAI DESIGN <Badge variant="outline">{version} · Preview</Badge></> : page.section}</div><h1>{overview ? <>为专注而设计。<br /><span>让工作界面安静一点。</span></> : page.title}</h1><p>{page.description}</p>
      {overview && <div className="page-actions"><Button render={<a href="/getting-started" />}>开始使用 <span aria-hidden="true">↗</span></Button><Button variant="secondary" render={<a href="/components/button" />}>浏览组件</Button></div>}
    </header>
    {overview && <Overview />}
    <Foundations kind={page.example} />
    <ComponentExample name={page.example} title={page.title} />
    <div className="docs-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      pre: ({ children }) => <pre className="markdown-code">{children}</pre>,
      table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
    }}>{page.body}</ReactMarkdown></div>
    {page.example === 'installation' && <CodeSample label="终端 · 仓库根目录" code="pnpm install --frozen-lockfile\npnpm dev:design" />}
    <Separator />
    <div className="page-bottom-links"><a href={`/${page.slug}.md`}>阅读 Markdown ↗</a><a href="/llms.txt">Agent 文档索引 ↗</a></div>
  </article>
}

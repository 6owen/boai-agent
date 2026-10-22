/*
 * [INPUT]: 公开目录、Fumadocs布局/翻译Provider和React Router。
 * [OUTPUT]: 使用指定SVG标志的中文文档导航、移动侧栏、主题和搜索，不展示预览版本说明。
 * [POS]: 设计站应用壳；组件示例仍消费BOAI共享包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { RootProvider } from 'fumadocs-ui/provider/react-router'
import { i18nProvider, uiTranslations } from 'fumadocs-ui/i18n'
import { defineTranslations } from 'fumadocs-core/i18n'
import type { Root } from 'fumadocs-core/page-tree'
import { useTheme } from 'next-themes'
import { Toaster } from '@boai/ui'
import content from 'virtual:boai-design-content'
import { DesignPage } from './page'
import { DesignSearchDialog } from './search-dialog'

const tree: Root = {
  name: 'BOAI Design',
  children: [...new Set(content.pages.map(page => page.section))].map(section => ({
    type: 'folder' as const, name: section, defaultOpen: true,
    children: content.pages.filter(page => page.section === section).map(page => ({ type: 'page' as const, name: page.title, url: page.path })),
  })),
}
const translations = defineTranslations().extend(uiTranslations()).add({
  'Search(search trigger)': '搜索文档',
  'Open Search(search trigger)(aria-label)': '搜索文档',
  'Search(search dialog)': '搜索文档',
  'Close Search(search dialog)(aria-label)': '关闭搜索',
  'No results found(search dialog)': '没有匹配的文档',
  'On this page(table of contents)': '本页目录',
  'No Headings(table of contents)': '暂无章节',
  'Light(theme switcher)(aria-label)': '浅色',
  'Dark(theme switcher)(aria-label)': '深色',
  'System(theme switcher)(aria-label)': '跟随系统',
  'Toggle Theme(theme switcher)(aria-label)': '切换外观',
  'Open Sidebar(sidebar)(aria-label)': '打开导航',
  'Close Sidebar(sidebar)(aria-label)': '关闭导航',
  'Close Sidebar(aria-label)': '关闭导航',
  'Collapse Sidebar(sidebar)(aria-label)': '收起导航',
  'Show Sidebar(sidebar)': '显示导航',
  'Hide Sidebar(sidebar)': '隐藏导航',
  'Next Page(pagination)': '下一页',
  'Previous Page(pagination)': '上一页',
  'Copy Text(code block)(aria-label)': '复制代码',
  'Copied Text(code block)(aria-label)': '已复制代码',
  'Copy Anchor Link(heading anchor)(aria-label)': '复制章节链接',
  'Copied Anchor Link(heading anchor)(aria-label)': '已复制章节链接',
})

function SiteContent() {
  const { pathname, hash } = useLocation()
  const { resolvedTheme } = useTheme()
  const path = pathname.replace(/\/+$/, '') || '/'
  const page = content.pages.find(page => page.path === path)
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0 })
  }, [pathname, hash])

  return <>
    <DocsLayout
      tree={tree}
      nav={{ title: <span className="docs-brand"><svg className="brand-mark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16.5 3.5H10A5.5 5.5 0 0 0 4.5 9v6a5.5 5.5 0 0 0 5.5 5.5h4a5.5 5.5 0 0 0 0-11h-4.5v6a1.5 1.5 0 0 0 1.5 1.5h2a1.5 1.5 0 0 0 0-3h-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>BOAI Design</span> }}
      githubUrl="https://github.com/6owen/boai-agent"
      themeSwitch={{ mode: 'light-dark-system' }}
      links={[{ text: 'Agent 文档', url: '/llms.txt', external: true }, { text: '组件索引', url: '/components.json', external: true }]}
      containerProps={{ className: 'boai-design-docs' }}
    >
      {page ? <DesignPage key={page.slug} page={page} /> : <main className="docs-not-found"><title>页面不存在 · BOAI Design</title><h1>页面不存在</h1><a href="/">返回概览</a></main>}
    </DocsLayout>
    <Toaster theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
  </>
}

export function App() {
  return <RootProvider
    theme={{ attribute: 'class', storageKey: 'boai-design:mode', defaultTheme: 'system', enableSystem: true }}
    i18n={i18nProvider(translations)}
    search={{ SearchDialog: DesignSearchDialog }}
  ><SiteContent /></RootProvider>
}

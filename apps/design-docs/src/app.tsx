/*
 * [INPUT]: 公开目录、Fumadocs布局/Provider和React Router。
 * [OUTPUT]: Fumadocs文档导航、移动端侧栏、主题和搜索入口。
 * [POS]: 设计站应用壳；组件示例仍消费BOAI共享包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { RootProvider } from 'fumadocs-ui/provider/react-router'
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
const translations = {
  Search: '搜索文档', 'Open Search': '搜索文档', 'Close Search': '关闭搜索',
  'No results found': '没有匹配的文档', 'On this page': '本页目录',
  Light: '浅色', Dark: '深色', System: '跟随系统', 'Toggle Theme': '切换外观',
  'Open Sidebar': '打开导航', 'Close Sidebar': '关闭导航',
  Next: '下一页', Previous: '上一页',
}

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
      nav={{ title: <span className="docs-brand"><span className="brand-mark" aria-hidden="true">b.</span>BOAI Design</span> }}
      githubUrl="https://github.com/6owen/boai-agent"
      themeSwitch={{ mode: 'light-dark-system' }}
      sidebar={{ banner: <div className="sidebar-version">{content.version} · 开发预览</div> }}
      links={[{ text: 'Agent 文档', url: '/llms.txt', external: true }, { text: '组件索引', url: '/components.json', external: true }]}
      containerProps={{ className: 'boai-design-docs' }}
    >
      {page ? <DesignPage key={page.slug} page={page} version={content.version} /> : <main className="docs-not-found"><title>页面不存在 · BOAI Design</title><h1>页面不存在</h1><a href="/">返回概览</a></main>}
    </DocsLayout>
    <Toaster theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
  </>
}

export function App() {
  return <RootProvider
    theme={{ attribute: 'class', storageKey: 'boai-design:mode', defaultTheme: 'system', enableSystem: true }}
    i18n={{ translations }}
    search={{ SearchDialog: DesignSearchDialog }}
  ><SiteContent /></RootProvider>
}

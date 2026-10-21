/*
 * [INPUT]: 同源公开内容、浏览器导航与共享Input/Button/Toaster。
 * [OUTPUT]: 可检索、响应式的设计站导航与系统/明暗模式。
 * [POS]: 设计站应用壳，不导入BOAI业务或桌面store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Button, Input, Toaster } from '@boai/ui'
import content from 'virtual:boai-design-content'
import { DesignPage } from './page'
import { searchPages } from './search'

type Mode = 'system' | 'light' | 'dark'
const modeNames = { system: '跟随系统', light: '浅色', dark: '深色' }
const normalize = (path: string) => path.replace(/\/+$/, '') || '/'

function readMode(): Mode {
  try {
    const mode = localStorage.getItem('boai-design:mode')
    if (mode === 'light' || mode === 'dark') return mode
  } catch { /* Browser storage is optional; use the system setting. */ }
  return 'system'
}

export function App() {
  const [path, setPath] = useState(() => normalize(location.pathname))
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [mode, setMode] = useState<Mode>(readMode)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const search = useRef<HTMLInputElement>(null)
  const resolvedMode = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
  const page = content.pages.find(page => page.path === path)
  const results = searchPages(content.pages, query)
  const sections = [...new Set(content.pages.map(page => page.section))]

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedMode === 'dark')
    document.documentElement.classList.toggle('light', resolvedMode === 'light')
    document.documentElement.style.colorScheme = resolvedMode
  }, [resolvedMode])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystemDark(media.matches)
    const pop = () => setPath(normalize(location.pathname))
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus() }
    }
    media.addEventListener('change', change)
    window.addEventListener('popstate', pop)
    document.addEventListener('keydown', shortcut)
    return () => { media.removeEventListener('change', change); window.removeEventListener('popstate', pop); document.removeEventListener('keydown', shortcut) }
  }, [])
  useEffect(() => {
    document.title = page ? `${page.title} · BOAI Design` : '页面不存在 · BOAI Design'
  }, [page])

  function navigate(destination: string) {
    if (destination !== path) { history.pushState(null, '', destination); setPath(destination); window.scrollTo({ top: 0 }) }
    setQuery(''); setSearching(false)
  }
  function follow(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a') : null
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return
    const destination = new URL(anchor.href)
    if (destination.origin !== location.origin || destination.hash || !content.pages.some(page => page.path === normalize(destination.pathname))) return
    event.preventDefault(); navigate(normalize(destination.pathname))
  }
  function cycleMode() {
    const next: Mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'
    setMode(next)
    try { localStorage.setItem('boai-design:mode', next) } catch { /* Continue with an in-memory preference. */ }
  }

  return <div className="docs-shell" onClick={follow}>
    <a className="skip-link" href="#main-content">跳到正文</a>
    <aside className="docs-sidebar" aria-label="文档导航">
      <a className="docs-brand" href="/"><span className="brand-mark" aria-hidden="true">b.</span><span>BOAI <strong>Design</strong><small>设计语言与组件</small></span></a>
      <div className="sidebar-version"><span className="status-dot" />{content.version}<span>开发预览</span></div>
      <nav>{sections.map(section => <section className="nav-section" key={section}>
        <h2>{section}</h2>
        {content.pages.filter(page => page.section === section).map(item => <a key={item.slug} href={item.path} aria-current={item.path === path ? 'page' : undefined}>{item.title}</a>)}
      </section>)}</nav>
      <div className="sidebar-footer"><a href="/llms.txt">供 Agent 阅读 ↗</a><a href="https://github.com/6owen/boai-agent" target="_blank" rel="noreferrer">GitHub ↗</a></div>
    </aside>
    <div className="docs-workspace">
      <header className="docs-topbar">
        <span className="docs-breadcrumb">文档 <span>/</span> {page?.title ?? '页面不存在'}</span>
        <a className="mobile-brand" href="/">BOAI Design</a>
        <div className="docs-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSearching(false) }}>
          <Input ref={search} type="search" placeholder="搜索文档…" aria-label="搜索文档" value={query} onFocus={() => setSearching(true)} onChange={event => setQuery(event.currentTarget.value)} onKeyDown={event => {
            if (event.key === 'Escape') { setQuery(''); setSearching(false); search.current?.blur() }
            if (event.key === 'Enter' && results[0]) { event.preventDefault(); navigate(results[0].path); search.current?.blur() }
          }} />
          {!query && <kbd>⌘ K</kbd>}
          {searching && query.trim() && <nav className="search-results soft-surface soft-elevated" aria-label="搜索结果">
            {results.length ? results.map(result => <a href={result.path} key={result.slug}><strong>{result.title}</strong><span>{result.description}</span></a>) : <p role="status">没有匹配的文档</p>}
          </nav>}
        </div>
        <Button variant="ghost" size="sm" onClick={cycleMode} aria-label={`当前${modeNames[mode]}，切换外观`}><span aria-hidden="true">◐</span><span className="mode-name">{modeNames[mode]}</span></Button>
      </header>
      <label className="mobile-navigation">浏览文档<select value={path} onChange={event => navigate(event.currentTarget.value)}>{content.pages.map(page => <option value={page.path} key={page.slug}>{page.section} · {page.title}</option>)}</select></label>
      <main id="main-content" tabIndex={-1}>{page ? <DesignPage key={page.slug} page={page} version={content.version} /> : <div className="docs-page"><h1>页面不存在</h1><p>从导航中选择一篇文档，或<a href="/">返回概览</a>。</p></div>}</main>
      <footer className="docs-footer"><span>BOAI Design</span><span>一致的细节，安静的工作界面。</span><a href="/components.json">组件索引 ↗</a></footer>
    </div>
    <Toaster theme={resolvedMode} />
  </div>
}

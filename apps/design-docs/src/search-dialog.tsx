/*
 * [INPUT]: Fumadocs搜索弹窗部件与白名单页面的本地检索。
 * [OUTPUT]: 上游搜索弹窗与本地结果，关闭时显式恢复实际打开者的焦点。
 * [POS]: 设计站搜索UI；复用现有标题优先算法，不需要搜索服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import {
  SearchDialog, SearchDialogClose, SearchDialogContent, SearchDialogHeader,
  SearchDialogIcon, SearchDialogInput, SearchDialogList, SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search'
import content from 'virtual:boai-design-content'
import { searchPages } from './search'

export function DesignSearchDialog(props: SharedProps) {
  const [query, setQuery] = useState('')
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => { if (!props.open) setQuery('') }, [props.open])
  const results = searchPages(content.pages, query).map(page => ({ id: page.slug, type: 'page' as const, content: page.title, url: page.path }))
  return <SearchDialog {...props} search={query} onSearchChange={setQuery}>
    <SearchDialogOverlay />
    <SearchDialogContent aria-label="搜索文档"
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
      onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus() }}
    >
      <SearchDialogHeader>
        <SearchDialogIcon />
        <SearchDialogInput aria-label="搜索文档" placeholder="搜索组件或设计指南…" />
        <SearchDialogClose aria-label="关闭搜索" />
      </SearchDialogHeader>
      <SearchDialogList items={results} Empty={() => <p className="search-empty">{query.trim() ? '没有匹配的文档' : '输入组件名称或关键词开始搜索'}</p>} />
    </SearchDialogContent>
  </SearchDialog>
}

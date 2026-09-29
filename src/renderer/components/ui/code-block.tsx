/*
 * [INPUT]: 代码文本、语言标识与按需加载的 Shiki tokens。
 * [OUTPUT]: 可复用代码块；React 文本节点渲染、明暗主题切换、流式输入防抖与迟到结果隔离，未识别或加载失败时保留原文。
 * [POS]: 全局代码展示组件；定制样式位于 renderer/styles/shiki.css。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Fragment, memo, useEffect, useState, type CSSProperties } from 'react'
import type { ThemedTokenWithVariants } from 'shiki/types'
import { cn } from 'cn'

const HIGHLIGHT_DELAY_MS = 120
function tokenStyle(token: ThemedTokenWithVariants): CSSProperties {
  const styles: Record<string, string | undefined> = {}
  for (const theme of ['light', 'dark']) {
    const variant = token.variants[theme], font = variant?.fontStyle ?? 0
    styles[`--shiki-${theme}`] = variant?.color
    styles[`--shiki-${theme}-font-style`] = font & 1 ? 'italic' : 'normal'
    styles[`--shiki-${theme}-font-weight`] = font & 2 ? 'bold' : 'normal'
    styles[`--shiki-${theme}-text-decoration`] = font & 4 ? 'underline' : 'none'
  }
  return styles as CSSProperties
}

export const CodeBlock = memo(function CodeBlock({ code, language = '', className }: { code: string; language?: string; className?: string }) {
  const [highlighted, setHighlighted] = useState<{ code: string; language: string; tokens: ThemedTokenWithVariants[][] } | null>(null)
  useEffect(() => {
    if (!language || !code) return
    let current = true
    const timer = setTimeout(() => {
      void import('./shiki-highlighter').then(module => current ? module.highlightCode(code, language) : null).then(tokens => {
        if (current) setHighlighted(tokens ? { code, language, tokens } : null)
      }).catch(() => { if (current) setHighlighted(null) })
    }, HIGHLIGHT_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [code, language])
  const tokens = highlighted?.code === code && highlighted.language === language ? highlighted.tokens : null
  return <pre className={cn('shiki-code-block', className)} data-language={language || undefined}><code>{tokens ? tokens.map((line, index) => <Fragment key={index}>{line.map((token, tokenIndex) => <span className="shiki-token" style={tokenStyle(token)} key={tokenIndex}>{token.content}</span>)}{index < tokens.length - 1 ? '\n' : null}</Fragment>) : code}</code></pre>
})

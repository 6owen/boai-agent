/*
 * [INPUT]: 代码文本、语言标识、可选行号/来源定位与按需加载的 Shiki tokens。
 * [OUTPUT]: 可复用代码块；行锚点与可见行号独立，空行保留高度，双色高亮/流式防抖/迟到隔离，支持紧凑详情；高亮失败保留原文。
 * [POS]: 全局代码展示组件；定制样式位于 renderer/styles/shiki.css。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Fragment, memo, useEffect, useState, type ComponentProps, type CSSProperties } from 'react'
import type { ThemedTokenWithVariants } from 'shiki/types'
import { cn } from 'cn'
import { FILE_PREVIEW_LIMITS } from '@shared/domain/file-preview'
import { Button } from './button'

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

export const CodeBlock = memo(function CodeBlock({ code, language = '', className, density = 'default', lineNumbers = false, lineAnchors = false, selectedLine, onLineSelect, ...props }: Omit<ComponentProps<'pre'>, 'children'> & { code: string; language?: string; density?: 'default' | 'compact'; lineNumbers?: boolean; lineAnchors?: boolean; selectedLine?: number; onLineSelect?(line: number): void }) {
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
  const lines = lineNumbers || lineAnchors ? code.split(/\r\n?|\n/) : []
  const anchored = (lineNumbers || lineAnchors) && lines.length <= FILE_PREVIEW_LIMITS.lines
  const renderTokens = (line: ThemedTokenWithVariants[]) => line.map((token, index) => <span className="shiki-token" style={tokenStyle(token)} key={index}>{token.content}</span>)
  return <pre {...props} className={cn('shiki-code-block', anchored && 'shiki-lined', anchored && lineNumbers && 'shiki-numbered', className)} data-density={density} data-language={language || undefined}><code>{anchored ? lines.map((text, index) => <span className="shiki-line" data-file-line={index + 1} data-selected={selectedLine === index + 1 || undefined} key={index}>
    {lineNumbers && (onLineSelect ? <Button variant="ghost" size="content" className="shiki-line-number" aria-label={`定位第 ${index + 1} 行`} aria-pressed={selectedLine === index + 1} onClick={() => onLineSelect(index + 1)}>{index + 1}</Button> : <span className="shiki-line-number" aria-hidden="true">{index + 1}</span>)}
    <span className="shiki-line-content">{text && tokens?.[index]?.length ? renderTokens(tokens[index]) : text || '\u00a0'}</span>
  </span>) : tokens ? tokens.map((line, index) => <Fragment key={index}>{renderTokens(line)}{index < tokens.length - 1 ? '\n' : null}</Fragment>) : code}</code></pre>
})

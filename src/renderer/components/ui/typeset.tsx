/*
 * [INPUT]: shadcn Typeset 排版、应用主题和任意正文/原始文本。
 * [OUTPUT]: 可复用正文排版容器与11px次级色常规等宽详情；compact适用于侧栏，原始文本透传ref/键盘事件。
 * [POS]: 全局展示组件，不解析业务数据；样式见styles/shadcn-typeset.css。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { ComponentProps } from 'react'
import { cn } from 'cn'

export function Typeset({ size = 'default', className, ...props }: ComponentProps<'div'> & { size?: 'default' | 'compact' }) {
  return <div data-slot="typeset" className={cn('typeset min-w-0', size === 'compact' && 'typeset-compact', className)} {...props} />
}

/** Raw tool output stays selectable and complete; no Markdown interpretation. */
export function TypesetCode({ className, ...props }: ComponentProps<'pre'>) {
  return <pre data-slot="typeset-code" data-not-typeset className={cn('m-0 max-h-96 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-[11px] font-normal leading-relaxed text-muted-foreground', className)} {...props} />
}

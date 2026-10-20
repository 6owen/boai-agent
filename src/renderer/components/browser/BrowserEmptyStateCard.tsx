/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: 原居中空态卡片布局。
 * [OUTPUT]: 保留普通浏览器说明/示例布局，无接管/交还控制权提示；示例不自动新建或发送会话。
 * [POS]: src/renderer/components/browser/BrowserEmptyStateCard.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
// Apache-2.0; adapted from Craft Docs Ltd. packages/ui/src/components/ui/BrowserEmptyStateCard.tsx; src/main/browser/NOTICE.txt.
import * as React from 'react'

export interface BrowserEmptyPromptSample {
  short: string
  full: string
}

export interface BrowserEmptyStateCardProps {
  title: string
  description: string
  prompts?: readonly BrowserEmptyPromptSample[]
  showExamplePrompts?: boolean
  onPromptSelect?: (prompt: BrowserEmptyPromptSample) => void
}

export function BrowserEmptyStateCard({
  title,
  description,
  prompts = [],
  showExamplePrompts = true,
  onPromptSelect,
}: BrowserEmptyStateCardProps) {

  return (
    <div className="w-full h-full flex items-center justify-center p-8">
      <div className="w-full max-w-[700px] bg-background shadow-minimal rounded-[8px] overflow-hidden border border-border/30">
        <div className="px-4 py-3 border-b border-border/30 flex items-center bg-muted/20 select-none">
          <h3 className="text-[length:var(--text-ui-body)] font-medium text-foreground tracking-tight">
            {title}
          </h3>
        </div>

        <div className="pl-[22px] pr-[16px] py-3 text-sm">
          <p className="text-foreground/65 leading-relaxed">
            {description}
          </p>

          {showExamplePrompts && prompts.length > 0 && (
            <div className="mt-3.5 space-y-1.5">
              {prompts.map((sample, index) => (
                <button
                  key={sample.short}
                  type="button"
                  title={sample.full}
                  onClick={() => onPromptSelect?.(sample)}
                  className="w-fit max-w-full flex items-center gap-1 h-8 px-2.5 rounded-[6px] bg-background shadow-minimal hover:bg-foreground/[0.03] transition-colors text-left cursor-pointer"
                >
                  <span className="w-4 shrink-0 text-[length:var(--text-ui-caption)] text-foreground/40 tabular-nums">{index + 1}.</span>
                  <span className="truncate text-[length:var(--text-ui-secondary)] text-foreground/70">{sample.short}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

/*
 * [INPUT]: 原紧凑浏览器徽标与当前只读 WindowState。
 * [OUTPUT]: 保留徽标布局/加载图标与员工/会话归属；无远程 favicon 请求、关闭前保留状态。
 * [POS]: src/renderer/components/browser/BrowserTabBadge.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
// Apache-2.0; adapted from Craft Docs Ltd. apps/electron/src/renderer/components/browser/BrowserTabBadge.tsx; src/main/browser/NOTICE.txt.
/**
 * BrowserTabBadge
 *
 * Compact badge used in the top bar browser strip.
 * Render-only surface that acts as a dropdown trigger in BrowserTabStrip.
 */

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { ChevronDownIcon, LoaderCircle } from '@/components/icons'
const Globe = ({className}: {className?:string}) => <i aria-hidden="true" className={`app-icon i-carbon-earth ${className??''}`} />
const Spinner = ({className}: {className?:string}) => <LoaderCircle className={`animate-spin ${className??''}`} />
import type { BrowserWindowState } from '@shared/ipc/browser'
type BrowserInstanceInfo = BrowserWindowState & {favicon?:string|null;themeColor?:string|null;agentControlActive?:boolean}
import { getHostname, getThemeLuminance } from './utils'

interface BrowserTabBadgeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  instance: BrowserInstanceInfo
  isActive: boolean
}

export const BrowserTabBadge = forwardRef<HTMLButtonElement, BrowserTabBadgeProps>(function BrowserTabBadge(
  { instance, isActive: _isActive, className, style, ...buttonProps },
  ref
) {
  const hostname = getHostname(instance.url)
  const displayLabel = instance.title.trim() || hostname || 'Local File'
  const themedBackground = instance.themeColor || undefined

  const themeLuminance = instance.themeColor ? getThemeLuminance(instance.themeColor) : null
  const isDarkThemeColor = themeLuminance !== null && themeLuminance < 0.42

  const foregroundClass = instance.themeColor
    ? (isDarkThemeColor
      ? 'text-white/90 hover:bg-white/10'
      : 'text-black/80 hover:bg-black/5')
    : 'text-foreground hover:bg-foreground/[0.03]'

  return (
    <button
      ref={ref}
      type="button"
      className={`
        group flex items-center gap-1 h-[26px] pl-2.5 pr-1.5 rounded-lg cursor-pointer select-none titlebar-no-drag
        text-[11px] leading-tight transition-colors max-w-[160px] shadow-minimal
        bg-background
        ${foregroundClass}
        ${instance.control === 'agent-controlled' ? 'border border-accent' : ''}
        ${className ?? ''}
      `}
      style={{
        backgroundColor: themedBackground,
        transition: 'background-color 200ms ease, border-color 200ms ease',
        ...style,
      }}
      aria-label={`${displayLabel} actions`}
      title={`${instance.agentName ?? '员工'} · ${instance.conversationTitle ?? ''} · ${displayLabel}`}
      {...buttonProps}
    >
      <span className={`shrink-0 flex items-center justify-center ${isDarkThemeColor ? 'h-3.5 w-3.5' : 'h-3 w-3'}`}>
        {instance.isLoading ? (
          <Spinner className="text-[9px] leading-none" />
        ) : (
          <Globe className="h-3 w-3" />
        )}
      </span>

      <span className="truncate ml-0.5 leading-[12px]">{displayLabel}</span>

      <span className="shrink-0 h-3 w-3 flex items-center justify-center opacity-55 group-hover:opacity-90 transition-opacity">
        <ChevronDownIcon className="h-2.5 w-2.5" />
      </span>
    </button>
  )
})

BrowserTabBadge.displayName = 'BrowserTabBadge'

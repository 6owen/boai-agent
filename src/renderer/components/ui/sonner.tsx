/*
 * [INPUT]: Sonner、body Portal、调用方传入的主题模式、全局主题/Soft 表面 token、本地图标与 Dialog 共用的 ghost 按钮变体。
 * [OUTPUT]: 通知Portal与Dialog同处body，避免根容器层叠上下文遮住真实错误；主题、状态与关闭操作保持。
 * [OUTPUT]: 顶部居中的全局 Sonner 提示入口，左图标/弹性正文/右侧无圈 X 关闭按钮由 skin.css 固定布局；卡片/折叠后层共用状态背景，关闭复用 Dialog ghost 形态并跟随状态图标色与淡色悬停；紧凑正文/圆角/阴影由 skin.css 统一，不读取业务或外观 store。
 * [POS]: components/ui 的 Sonner 适配；仅呈现临时通知，不改变业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { cn } from 'cn'
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon, XIcon } from '@/components/icons'
import { buttonVariants } from '@/components/ui/button'

export function Toaster({ className, style, icons, toastOptions, ...props }: ToasterProps) {
  return createPortal(<Sonner
    position="top-center"
    offset={16}
    closeButton
    containerAriaLabel="通知"
    className={cn('app-toaster', className)}
    style={{
      '--normal-bg': 'var(--card)',
      '--normal-text': 'var(--foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius-card)',
      ...style,
    } as CSSProperties}
    icons={{
      success: <CircleCheckIcon aria-hidden="true" />,
      info: <InfoIcon aria-hidden="true" />,
      warning: <TriangleAlertIcon aria-hidden="true" />,
      error: <OctagonXIcon aria-hidden="true" />,
      loading: <Loader2Icon className="animate-spin" aria-hidden="true" />,
      close: <XIcon aria-hidden="true" />,
      ...icons,
    }}
    toastOptions={{
      closeButtonAriaLabel: '关闭提示',
      ...toastOptions,
      classNames: {
        ...toastOptions?.classNames,
        toast: cn('app-toast soft-surface soft-elevated', toastOptions?.classNames?.toast),
        closeButton: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), toastOptions?.classNames?.closeButton),
      },
    }}
    {...props}
  />, document.body)
}

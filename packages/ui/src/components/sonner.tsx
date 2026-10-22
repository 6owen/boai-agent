/*
 * [INPUT]: Sonner、body Portal与调用者指定的主题/图标。
 * [OUTPUT]: 通用Soft通知呈现，不读取宿主服务；仅支持浏览器挂载。
 * [POS]: @boai/ui/sonner，原桌面图标通过适配传入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { cn } from 'cn'
import { buttonVariants } from './button'

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
    icons={icons}
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

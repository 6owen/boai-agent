/*
 * [INPUT]: Sonner、body Portal与调用者指定的主题/图标。
 * [OUTPUT]: 统一通知发布 API 与 Soft Sonner 呈现。发布方不设置展示位置。
 * [POS]: @boai/ui/sonner，原桌面图标通过适配传入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Toaster as Sonner, toast, type ExternalToast, type ToasterProps } from 'sonner'
import { cn } from 'cn'
import { buttonVariants } from './button'

type NotificationOptions = Omit<ExternalToast, 'position' | 'toasterId'>
type NotificationArgs = [message: Parameters<typeof toast.message>[0], options?: NotificationOptions]

export const notify = {
  success: (...args: NotificationArgs) => toast.success(...args),
  error: (...args: NotificationArgs) => toast.error(...args),
  warning: (...args: NotificationArgs) => toast.warning(...args),
  info: (...args: NotificationArgs) => toast.info(...args),
  message: (...args: NotificationArgs) => toast.message(...args),
  loading: (...args: NotificationArgs) => toast.loading(...args),
  dismiss: (id?: string | number) => toast.dismiss(id),
  getToasts: () => toast.getToasts(),
}

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

/*
 * [INPUT]: 原生 div 属性、ref、滚动事件与 shadcn Scroll Fade 工具类。
 * [OUTPUT]: 会话与详情共用的纵向滚动容器，沿用会话顶部渐隐；滚动跟随、位置恢复与页面留白由调用方管理。
 * [POS]: components/ui 的无业务状态滚动基础组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ComponentProps } from 'react'
import { cn } from 'cn'

export function ScrollFade({ className, ...props }: ComponentProps<'div'>) {
  return <div
    data-slot="scroll-fade"
    className={cn('min-h-0 min-w-0 overflow-y-auto scroll-fade-t scroll-fade-6', className)}
    {...props}
  />
}

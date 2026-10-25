/*
 * [INPUT]: 上游图标含义与BOAI本地Iconify集合。
 * [OUTPUT]: 控件原图标映射；尺寸/可访问名称由原调用者保持。
 * [POS]: Lody Lucide导入的宿主Iconify适配，不访问远程资源。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { HTMLAttributes } from 'react'
export { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, PanelLeft, Search, X, Copy, FolderOpen, Check, Plus, FileText } from '@/components/icons'
const icon = (className: string) => function PreviewIcon({ size = 16, className: extra = '', style, ...props }: HTMLAttributes<HTMLSpanElement> & { size?: number }) {
  return <span {...props} aria-hidden={props['aria-hidden'] ?? true} className={`app-icon ${className} ${extra}`} style={{ width: size, height: size, ...style }} />
}
export const ZoomIn = icon('i-carbon-zoom-in')
export const ZoomOut = icon('i-carbon-zoom-out')
export const RotateCcw = icon('i-carbon-rotate-counterclockwise')
export const RotateCw = icon('i-carbon-rotate-clockwise')
export const ExternalLink = icon('i-carbon-launch')
export const Loader2 = icon('i-carbon-circle-dash')
export const Share2 = icon('i-carbon-share')
export const ChevronDown = icon('i-carbon-chevron-down')
export const MessageSquare = icon('i-carbon-chat')
export const SendHorizontal = icon('i-carbon-send-alt')

/*
 * [INPUT]: 共享Soft Toaster与应用本地图标。
 * [OUTPUT]: 原桌面通知入口及图标保持，呈现实现迁入共享包。
 * [POS]: Renderer Sonner适配，不保存第二份组件实现。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Toaster as SharedToaster } from '@boai/ui/sonner'
import type { ToasterProps } from 'sonner'
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon, XIcon } from '@/components/icons'

export function Toaster({ icons, ...props }: ToasterProps) {
  return <SharedToaster icons={{
    success: <CircleCheckIcon aria-hidden="true" />,
    info: <InfoIcon aria-hidden="true" />,
    warning: <TriangleAlertIcon aria-hidden="true" />,
    error: <OctagonXIcon aria-hidden="true" />,
    loading: <Loader2Icon className="animate-spin" aria-hidden="true" />,
    close: <XIcon aria-hidden="true" />,
    ...icons,
  }} {...props} />
}

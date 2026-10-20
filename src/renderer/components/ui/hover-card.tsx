/*
 * [OUTPUT]: 隐藏页面/详情的链接预览立即撤下Portal并重置展开状态，正常关闭沿原动画。
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: hover-card 基础组件；表面共用 skin.css 的 Soft 高光、圆角与阴影。
 * [POS]: components/ui 的 hover-card 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
"use client"

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"
import { cn } from "cn"
import { useFloatingLayerActions, useFloatingLayerActive } from './floating-layer-scope'

function HoverCard({ actionsRef, ...props }: PreviewCardPrimitive.Root.Props) {
  const actions = useFloatingLayerActions(actionsRef)
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} actionsRef={actions} />
}

function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  return (
    <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 4,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const active = useFloatingLayerActive()
  if (!active) return null
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-50 w-64 origin-(--transform-origin) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground soft-surface soft-elevated outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }

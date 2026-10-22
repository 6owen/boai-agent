/*
 * [OUTPUT]: 字号和默认行高使用同一工具类，宿主字号覆盖时保持原cn合并语义。
 * [OUTPUT]: 所属页面/详情隐藏时立即撤下Portal并关闭浮层，保留页面正文与外部actionsRef。
 * [OUTPUT]: 可选keepMounted透传官方Portal，保留渠道列表搜索/分组状态；默认生命周期保持。
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: popover 基础组件，支持独立 anchor 以复用菜单按钮定位；表面共用 skin.css 的 Soft 高光、圆角与阴影。
 * [POS]: @boai/ui共享实现；原归属： components/ui 的 popover 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "cn"
import { useFloatingLayerActions, useFloatingLayerActive } from './floating-layer-scope'

function Popover({ actionsRef, ...props }: PopoverPrimitive.Root.Props) {
  const actions = useFloatingLayerActions(actionsRef)
  return <PopoverPrimitive.Root data-slot="popover" {...props} actionsRef={actions} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  keepMounted,
  anchor,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  { keepMounted?: boolean } &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "anchor" | "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const active = useFloatingLayerActive()
  if (!active) return null
  return (
    <PopoverPrimitive.Portal keepMounted={keepMounted}>
      <PopoverPrimitive.Positioner
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-(--radius-control) bg-popover p-2.5 text-[length:var(--text-ui-body)]/[var(--tw-leading,var(--text-sm--line-height))] text-popover-foreground soft-surface soft-elevated outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-[length:var(--text-ui-body)]/[var(--tw-leading,var(--text-sm--line-height))]", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}

/*
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: ScrollArea共用滚动条，透传viewport原生属性/ref供阅读定位；Content观察异步正文及展开后的高度变化，支持内容布局属性以复用居中空态。
 * [POS]: components/ui 的 scroll-area 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { cn } from "cn"

function ScrollArea({
  className,
  children,
  viewportProps,
  contentProps,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportProps?: React.ComponentPropsWithRef<"div"> & { [attribute: `data-${string}`]: string | number | boolean | undefined }
  contentProps?: ScrollAreaPrimitive.Content.Props
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        {...viewportProps}
        data-slot="scroll-area-viewport"
        className={cn("size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1", viewportProps?.className)}
      >
        <ScrollAreaPrimitive.Content {...contentProps} className={cn("min-h-full", contentProps?.className)} style={{ minWidth: 0, ...contentProps?.style }}>
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar className="z-20" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }

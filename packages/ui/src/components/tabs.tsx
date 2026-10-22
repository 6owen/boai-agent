/*
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: 紧凑 Soft、线形和可独立关闭的窗口标签变体共用滑动选中层，保留 Base UI 横纵方向、受控选择和键盘语义。
 * [POS]: @boai/ui共享实现；原归属： components/ui 的 tabs 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { TabsSlidingIndicator } from "./tabs-indicator"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn(
        "group/tabs flex min-w-0 gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "soft-tabs-list group/tabs-list inline-flex w-fit max-w-full shrink-0 items-center gap-0.5 p-[3px] text-muted-foreground group-data-horizontal/tabs:h-[32px] group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "",
        line: "gap-1 p-0",
        window: "gap-1 overflow-x-auto p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn("t-tabs", tabsListVariants({ variant }), className)}
      {...props}
    >
      <TabsSlidingIndicator />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "t-tab",
        "soft-tabs-trigger relative inline-flex h-full shrink-0 items-center justify-center gap-1.5 border-0 px-2.5 py-1 text-[length:var(--text-ui-body)] leading-5 font-medium whitespace-nowrap group-data-vertical/tabs:h-[28px] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_:is(svg,.app-icon)]:pointer-events-none [&_:is(svg,.app-icon)]:shrink-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("min-w-0 flex-1 text-[length:var(--text-ui-body)] outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

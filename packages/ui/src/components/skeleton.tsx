/*
 * [OUTPUT]: 使用BOAI语义圆角和字体角色，不依赖宿主通用刻度。
 * [INPUT]: React与BOAI既有Base UI组件合同。
 * [OUTPUT]: skeleton共享实现，保留原变体与data-slot。
 * [POS]: @boai/ui/skeleton，来自原Renderer组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type * as React from "react"
import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[calc(var(--radius-control)*.75)] bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }

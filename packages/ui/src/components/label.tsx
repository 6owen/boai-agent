/*
 * [OUTPUT]: 语义字号保留原默认行高及leading覆盖，避免共享迁移改变桌面排版。
 * [OUTPUT]: 文字直接使用共享角色变量，保持宿主与文档同一字号定义。
 * [INPUT]: React与BOAI既有Base UI组件合同。
 * [OUTPUT]: label共享实现，保留原变体与data-slot。
 * [POS]: @boai/ui/label，来自原Renderer组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
"use client"

import * as React from "react"
import { cn } from "cn"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-[length:var(--text-ui-body)] [line-height:var(--tw-leading,var(--text-sm--line-height))] leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }

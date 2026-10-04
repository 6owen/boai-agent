/*
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: 全局 skin 统一 Button secondary 表面/内侧细边缘的多行输入，无底部外侧阴影并保留中性聚焦/错误校验状态；显式 rows 保留编辑区高度，其余输入按内容自适应，组合内层按 slot 保持无框。
 * [POS]: components/ui 的 textarea 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import * as React from "react"
import { cn } from "cn"

function Textarea({ className, rows, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        "flex min-h-16 w-full px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm ",
        rows ? "field-sizing-fixed" : "field-sizing-content",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

/*
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: Soft 多行输入框；显式 rows 保留编辑区高度，其余输入按内容自适应。
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
        "flex min-h-16 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm ",
        rows ? "field-sizing-fixed" : "field-sizing-content",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

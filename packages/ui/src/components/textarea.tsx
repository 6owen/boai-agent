/*
 * [INPUT]: React与BOAI既有Base UI组件合同。
 * [OUTPUT]: textarea共享实现，保留原变体与data-slot。
 * [POS]: @boai/ui/textarea，来自原Renderer组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
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

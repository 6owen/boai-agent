/*
 * [INPUT]: React与BOAI既有Base UI组件合同。
 * [OUTPUT]: input共享实现，保留原变体与data-slot。
 * [POS]: @boai/ui/input，来自原Renderer组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-(--control-height) w-full min-w-0 px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm ",
        className
      )}
      {...props}
    />
  )
}

export { Input }

/*
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: aspect-ratio 基础组件及其可组合的样式/变体。
 * [POS]: @boai/ui共享实现；原归属： components/ui 的 aspect-ratio 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { cn } from "cn"

function AspectRatio({
  ratio,
  className,
  ...props
}: React.ComponentProps<"div"> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={
        {
          "--ratio": ratio,
        } as React.CSSProperties
      }
      className={cn("relative aspect-(--ratio)", className)}
      {...props}
    />
  )
}

export { AspectRatio }

/*
 * [INPUT]: React、原生 select、共享 buttonVariants 与全局语义样式。
 * [OUTPUT]: native-select 基础组件；复用 Button secondary 表面、字体和圆角，全局 skin 提供无底部外侧阴影的内侧细边缘及中性聚焦/错误校验状态，保留统一高度与原生选择行为。
 * [POS]: components/ui 的 native-select 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import * as React from "react"
import { cn } from "cn"
import { ChevronDownIcon } from "@/components/icons"
import { buttonVariants } from "./button"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(buttonVariants({ variant: "secondary", size: "default" }), "w-full min-w-0 appearance-none py-1 pr-8 pl-2.5 selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none data-[size=sm]:h-7 data-[size=sm]:py-0.5")}
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none" aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }

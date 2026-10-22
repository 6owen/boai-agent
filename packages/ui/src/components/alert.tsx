/*
 * [OUTPUT]: 字号和默认行高使用同一工具类，宿主字号覆盖时保持原cn合并语义。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: alert 基础组件及其可组合的样式/变体。
 * [POS]: @boai/ui共享实现；原归属： components/ui 的 alert 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { ErrorToast } from './error-feedback'

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-(--radius-control) border px-2.5 py-2 text-left text-[length:var(--text-ui-body)]/[var(--tw-leading,var(--text-sm--line-height))] has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>:is(svg,.app-icon)]:grid-cols-[auto_1fr] has-[>:is(svg,.app-icon)]:gap-x-2 *:[:is(svg,.app-icon)]:row-span-2 *:[:is(svg,.app-icon)]:translate-y-0.5 *:[:is(svg,.app-icon)]:text-current *:[:is(svg,.app-icon):not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[:is(svg,.app-icon)]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  if (variant === 'destructive') return <ErrorToast>{props.children}</ErrorToast>
  return (
    <div
      data-slot="alert"
      role="status"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>:is(svg,.app-icon)]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-[length:var(--text-ui-body)]/[var(--tw-leading,var(--text-sm--line-height))] text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }

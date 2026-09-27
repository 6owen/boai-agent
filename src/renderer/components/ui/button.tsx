/*
 * [INPUT]: React、shadcn Base UI 原语与全局语义样式。
 * [OUTPUT]: Soft 按钮、圆形操作、内容自适应按钮与兼容 shadcn 的尺寸/语义变体。
 * [POS]: components/ui 的 button 源码；由 shadcn base-nova 安装，样式在此定制，不读取业务或外观 store。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "soft-button group/button shrink-0 select-none aria-invalid:outline-destructive [&_:is(svg,.app-icon)]:pointer-events-none [&_:is(svg,.app-icon)]:shrink-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "soft-button-primary",
        secondary: "soft-button-secondary",
        surface: "soft-button-secondary soft-surface",
        outline: "soft-button-outline",
        ghost: "soft-button-ghost",
        destructive: "soft-button-destructive",
        ink: "soft-button-ink",
        link: "soft-button-link",
      },
      size: {
        content: "",
        default: "h-[32px] gap-2 px-4",
        xs: "h-[24px] gap-1 px-2 text-xs [&_:is(svg,.app-icon):not([class*='size-'])]:size-3",
        sm: "h-[28px] gap-1.5 px-3 text-xs [&_:is(svg,.app-icon):not([class*='size-'])]:size-3.5",
        lg: "h-[36px] gap-2 px-5",
        icon: "size-[32px] p-0",
        "icon-xs": "size-[24px] p-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-3",
        "icon-sm": "size-[28px] p-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-3.5",
        "icon-lg": "size-[36px] p-0",
      },
      round: { true: "soft-button-round", false: "" },
    },
    compoundVariants: [{
      size: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
      className: "inline-flex items-center justify-center whitespace-nowrap",
    }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  round = false,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, round, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

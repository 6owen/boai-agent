/*
 * [OUTPUT]: 文字直接使用共享角色变量，保持宿主与文档同一字号定义。
 * [INPUT]: React与BOAI既有Base UI组件合同。
 * [OUTPUT]: button共享实现，保留原变体与data-slot。
 * [POS]: @boai/ui/button，来自原Renderer组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "soft-button group/button shrink-0 select-none aria-invalid:outline-destructive [&_:is(svg,.app-icon)]:pointer-events-none [&_:is(svg,.app-icon)]:shrink-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-[16px]",
  {
    variants: {
      variant: {
        default: "soft-button-primary",
        secondary: "soft-button-secondary",
        surface: "soft-button-secondary soft-card",
        outline: "soft-button-outline",
        ghost: "soft-button-ghost",
        destructive: "soft-button-destructive",
        ink: "soft-button-ink",
        link: "soft-button-link",
      },
      size: {
        content: "soft-button-content",
        default: "h-[32px] gap-2 px-4",
        xs: "h-[24px] gap-1 px-2 text-[length:var(--text-ui-caption)] [&_:is(svg,.app-icon):not([class*='size-'])]:size-[12px]",
        sm: "h-[28px] gap-1.5 px-3 text-[length:var(--text-ui-caption)] [&_:is(svg,.app-icon):not([class*='size-'])]:size-[14px]",
        lg: "h-[36px] gap-2 px-5",
        icon: "size-[32px] p-0",
        "icon-2xs": "size-[16px] p-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-[10px]",
        "icon-xs": "size-[24px] p-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-[12px]",
        "icon-sm": "size-[28px] p-0 [&_:is(svg,.app-icon):not([class*='size-'])]:size-[14px]",
        "icon-lg": "size-[36px] p-0",
      },
      round: { true: "soft-button-round", false: "" },
    },
    compoundVariants: [{
      size: ["default", "xs", "sm", "lg", "icon", "icon-2xs", "icon-xs", "icon-sm", "icon-lg"],
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

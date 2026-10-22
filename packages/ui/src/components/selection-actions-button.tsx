/* [INPUT]: Beautiful UI button.json原件。 [OUTPUT]: 原版Button，仅token隔离、import/slot接线和xs=24px。 [POS]: SelectionActions依赖。 [PROTOCOL]: 同步.folder.md。 */
"use client";

import { type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const filledShadow = "shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]";

/* Pill-shaped by default — the app's core button style. Explicit symmetric
 * padding (not a fixed height) so the top/bottom spacing is always equal. */
export const buttonVariants = cva(
  `inline-flex items-center justify-center font-medium select-none
   transition-[transform,background-color,opacity] duration-150 ease-out
   active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none`,
  {
    variants: {
      variant: {
        primary: `bg-bui-ink text-bui-canvas hover:opacity-90 dark:bg-bui-ink dark:text-bui-canvas ${filledShadow}`,
        secondary: "bg-bui-surface text-bui-ink shadow-bui-btn hover:bg-bui-inset aria-expanded:bg-bui-hover",
        ghost: "bg-bui-hover-2 text-bui-ink hover:bg-bui-line-strong",
        accent: `bg-bui-accent text-white hover:bg-bui-accent-ink ${filledShadow}`,
        success: `bg-bui-green text-white hover:brightness-95 ${filledShadow}`,
        /* transparent until hovered — for dense toolbars/action rows */
        quiet: "text-bui-ink hover:bg-bui-hover",
      },
      size: {
        /* compact toolbar pill — fixed height, lighter weight */
        xs: "h-[24px] rounded-full px-2.5 text-[length:var(--text-ui-secondary)] font-normal leading-none gap-1",
        /* canonical action pill — 27px tall, roomy sides */
        sm: "h-[27px] px-3 text-[length:var(--text-ui-body)] leading-none rounded-full gap-1.5",
        md: "px-4 py-[9px] text-[length:var(--text-ui-body)]/[var(--tw-leading,var(--text-sm--line-height))] leading-none rounded-full gap-2",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export function SelectionActionButton({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="selection-actions-button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

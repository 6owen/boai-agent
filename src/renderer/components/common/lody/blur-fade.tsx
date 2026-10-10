/*
 * [INPUT]: Lody固定源码 packages/components/src/ui/blur-fade/blur-fade.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/blur-fade.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import * as React from "react";

import { cn } from "cn";
import styles from "./fade.module.css";

export type FadeProps = {
  stop?: string;
  blur?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  background: string;
  debug?: boolean;
  style?: React.CSSProperties;
};

export const Fade = React.forwardRef<HTMLDivElement, FadeProps>(function Fade(
  { stop, blur, side = "top", className, background, style, debug },
  ref
) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(styles.root, className)}
      data-side={side}
      style={
        {
          "--stop": stop,
          "--blur": blur,
          "--background": background,
          ...(debug && {
            outline: "2px solid red",
          }),
          ...style,
        } as React.CSSProperties
      }
    />
  );
});

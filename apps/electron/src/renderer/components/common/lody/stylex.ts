/*
 * [INPUT]: Lody固定源码 packages/components/src/lib/stylex.ts @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/stylex.ts；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { classProps } from './class-props';

/**
 * `classProps` with a caller's class appended: the compiled styles are the
 * element's own, and a caller's class only lays it out. Never pass a visual
 * class through here to restyle something; two classes setting one property
 * are ordered by the stylesheet, not by this list.
 */
export function withClassName(
  props: ReturnType<typeof classProps>,
  className?: string
): { className?: string; style?: ReturnType<typeof classProps>['style'] } {
  return {
    className: [props.className, className].filter(Boolean).join(' ') || undefined,
    style: props.style,
  };
}

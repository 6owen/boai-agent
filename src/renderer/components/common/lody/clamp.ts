/*
 * [INPUT]: Lody固定源码 packages/components/src/lib/clamp.ts @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/clamp.ts；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export function clamp(val: number, [min, max]: [number, number]): number {
    return Math.min(Math.max(val, min), max);
  }
  
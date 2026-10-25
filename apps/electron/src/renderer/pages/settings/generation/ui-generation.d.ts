/*
 * [INPUT]: 原版 ui-generation.js API。
 * [OUTPUT]: 页面使用的 skeleton 调用、关键标注数量选项及取消句柄类型。
 * [POS]: 上游 JS 的 TypeScript 伴随声明。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export function generate(element: HTMLElement, options?: { mode?: 'skeleton'; maxParts?: number; keys?: number }): {
  element: HTMLElement
  finished: Promise<HTMLElement>
  cancel: () => void
}

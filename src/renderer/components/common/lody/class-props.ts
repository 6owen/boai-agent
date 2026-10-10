/*
 * [INPUT]: 机械转换后的CSS类和原动态声明。
 * [OUTPUT]: 合并原声明的className/style；不注入规则或修改布局值。
 * [POS]: Lody StyleX声明到普通CSS的局部接线。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { CSSProperties } from 'react'
export function classProps(...values: ({ className?: string; style?: object } | false | null | undefined)[]): { className?: string; style?: CSSProperties } {
  const styles = values.filter(value => Boolean(value)) as { className?: string; style?: CSSProperties }[]
  return { className: styles.map(value => value.className).filter(Boolean).join(' ') || undefined, style: Object.assign({}, ...styles.map(value => value.style)) }
}

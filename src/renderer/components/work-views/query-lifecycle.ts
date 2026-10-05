/*
 * [INPUT]: 查询范围/筛选key、可见代际与宿主响应保存的页身份。
 * [OUTPUT]: 只展示当前范围已核对的页；隐藏保留DOM数据，重新显示必须经过新代际核对。
 * [POS]: 共享分页hook的纯可见性合同，防止切范围/隐藏后旧页瞬间重新显示。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录.folder.md。
 */
export function visibleQueryPage<P>(value: { key: string; page: P; epoch: number } | undefined, current: { key: string; epoch: number; active: boolean }): P | undefined {
  return value?.key === current.key && (!current.active || value.epoch === current.epoch) ? value.page : undefined
}

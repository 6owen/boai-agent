/*
 * [INPUT]: 受控筛选值、选项和结果区域。
 * [OUTPUT]: 共用Tabs的键盘/滑动选中层与关联tabpanel；原系统圆角和reduced-motion保持。
 * [POS]: renderer 跨页面筛选Tab组合。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function FilterTabs<T extends string>({ value, options, onValueChange, label, children }: {
  value: T; options: readonly { value: T; label: string }[]; onValueChange(value: T): void; label: string; children: ReactNode
}) {
  return <Tabs value={value} onValueChange={next => { const option = options.find(option => option.value === next); if (option && option.value !== value) onValueChange(option.value) }}>
    <TabsList className="filter-tabs" aria-label={label}>{options.map(option => <TabsTrigger key={option.value} value={option.value}>{option.label}</TabsTrigger>)}</TabsList>
    {options.map(option => <TabsContent key={option.value} value={option.value}>{value === option.value ? children : null}</TabsContent>)}
  </Tabs>
}

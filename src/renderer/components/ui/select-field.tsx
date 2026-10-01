/*
 * [INPUT]: 受控选中值、选项、字段标识/提示及禁用/必填状态，现有 shadcn Select 原语。
 * [OUTPUT]: 统一的单选下拉字段，复用 Soft 触发器和浮层；选项标签即时显示，空值和数值选项保持原表单语义，透传官方变更原因及取消能力供动态范围守卫使用。
 * [POS]: components/ui 的 Select 组合组件，不读取业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './select'

type SelectOption = { value: string | number; label: string; disabled?: boolean }
type SelectFieldProps = Omit<ComponentProps<typeof SelectTrigger>, 'value' | 'onChange' | 'children' | 'name'> & {
  value: string | number
  options: readonly SelectOption[]
  onValueChange(value: string, details: Parameters<NonNullable<ComponentProps<typeof Select>['onValueChange']>>[1]): void
  name?: string
  required?: boolean
}

export function SelectField({ value, options, onValueChange, disabled, required, name, id, className, ...props }: SelectFieldProps) {
  const items = options.map(option => ({ ...option, value: String(option.value) }))
  return <Select value={String(value)} items={items} disabled={disabled} required={required} name={name} id={id} onValueChange={(next, details) => { if (next !== null) onValueChange(next, details) }}>
    <SelectTrigger {...props} className={cn('w-full min-w-0', className)}><SelectValue /></SelectTrigger>
    <SelectContent align="start" alignItemWithTrigger={false}>
      <SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={item.disabled} label={item.label}>{item.label}</SelectItem>)}</SelectGroup>
    </SelectContent>
  </Select>
}

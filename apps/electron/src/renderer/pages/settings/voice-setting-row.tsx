/*
 * [OUTPUT]: 220px/32px选择器在utilities同层约束，避免共享Select默认36px覆盖低层页面规则。
 * [INPUT]: 语音设置字段、帮助说明和控件。
 * [OUTPUT]: 复用 SettingsRow 两端对齐；主要按钮/选择器统一宽度，辅助操作居左，多行编辑独立占满。
 * [POS]: 语音设置局部布局，保持单控件的标签关联。
 * [PROTOCOL]: 变化同步 Header 与 settings/.folder.md。
 */
import { cloneElement, isValidElement, useId, type ReactNode } from 'react'
import { SettingsHelp, SettingsRow } from './settings-layout'

export function VoiceSettingRow({ label, hint, children, full = false }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  const id = useId()
  const element = isValidElement<{ id?: string; 'aria-label'?: string }>(children) && typeof children.type !== 'string' ? children : null
  const controlId = element?.props.id ?? id
  const control = element ? cloneElement(element, { id: controlId, 'aria-label': element.props['aria-label'] ?? label }) : children
  const heading = <div className="flex shrink-0 items-center gap-1 font-medium">{element ? <label htmlFor={controlId}>{label}</label> : <span>{label}</span>}{hint && <SettingsHelp label={`${label}说明`}>{hint}</SettingsHelp>}</div>
  if (full) return <div className="space-y-2 py-3" data-voice-setting-row>{heading}{control}</div>
  return <SettingsRow data-voice-setting-row>{heading}<div className="appearance-row-controls max-w-full flex-wrap [&_input]:w-64 [&_input]:max-w-full [&_[data-slot=select-trigger]]:h-[32px] [&_[data-slot=select-trigger]]:w-[220px] [&_[data-slot=select-trigger]]:max-w-full">{control}</div></SettingsRow>
}

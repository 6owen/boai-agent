/*
 * [OUTPUT]: 资料页基础分区共用编辑入口与单分区编辑状态，标题右侧小尺寸按钮仅悬停或键盘聚焦时显示。
 * [OUTPUT]: 员工表单分区支持标题右侧操作；没有内容时不渲染空Card。
 * [INPUT]: 员工或员工组的资料字段与受控编辑内容。
 * [OUTPUT]: 共用分区标题/说明Tooltip；员工表单Card使用12px标签/内容、32px控件和24px模型操作，保留横向行布局。
 * [POS]: 通讯录资料与员工表单的展示结构，不持有编辑草稿。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoIcon, Pencil } from '@/components/icons'
import type { AgentConfigurationSection } from './editors'

export interface EmployeeSectionEditing {
  section: AgentConfigurationSection | null
  locked: boolean
  onEdit(section: AgentConfigurationSection): void
  render(section: AgentConfigurationSection): ReactNode
}
export function EmployeeSectionEdit({ editing, section, label }: { editing?: EmployeeSectionEditing; section: AgentConfigurationSection; label: string }) {
  return editing ? <Button type="button" variant="ghost" size="sm" className="contact-section-edit" aria-label={`编辑${label}`} disabled={editing.locked} onClick={() => editing.onEdit(section)}><Pencil />编辑</Button> : null
}
export function ContactProfileSection({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="contact-section" aria-label={title}>
    <div className="contact-section-heading"><div className="flex items-center gap-1"><h2 className="contact-section-title">{title}</h2>{hint && <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${title}说明`} />}><InfoIcon /></TooltipTrigger><TooltipContent>{hint}</TooltipContent></Tooltip>}</div>{actions}</div>
    {children}
  </section>
}
export function ContactProfileCard({ label, children, fields = true }: { label: string; children: ReactNode; fields?: boolean }) {
  return <Card className="automation-details contact-profile-card gap-0 bg-muted p-0" role="region" aria-label={label}>{fields ? <dl className="automation-detail-fields soft-divide-y">{children}</dl> : <div className="contact-card-content">{children}</div>}</Card>
}
export function ContactProfileRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="automation-detail-row"><dt>{icon}<span>{title}</span></dt><dd>{children}</dd></div>
}

export function EmployeeFormSection({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return <ContactProfileSection title={title} actions={actions}>
    {children && <Card className="contact-profile-card employee-form-card gap-0 rounded-lg bg-muted p-0 [&_[data-slot=field-label]]:text-[12px] [&_[data-slot=input]]:h-[32px] [&_[data-slot=input]]:text-[12px] [&_[data-slot=select-trigger]]:h-[32px] [&_[data-slot=select-trigger]]:text-[12px] [&_.connection-model-actions_button]:h-[24px] [&_.connection-model-actions_.app-icon]:size-[12px]"><div className="connection-fields employee-form-fields soft-divide-y">{children}</div></Card>}
  </ContactProfileSection>
}

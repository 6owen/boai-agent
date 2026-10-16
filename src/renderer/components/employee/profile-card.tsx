/*
 * [INPUT]: 员工或员工组的只读配置字段。
 * [OUTPUT]: 分区标题/说明Tooltip和紧凑Card，正文或图标字段行；状态紧随配置值。
 * [POS]: 通讯录资料卡共用展示，不持有编辑草稿。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoIcon } from '@/components/icons'
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

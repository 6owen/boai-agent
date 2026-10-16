/*
 * [INPUT]: 员工或员工组的只读配置字段。
 * [OUTPUT]: 复用定时任务紧凑详情Card、图标标题/值及分隔行。
 * [POS]: 通讯录资料卡共用展示，不持有编辑草稿。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
export function ContactProfileCard({ label, children }: { label: string; children: ReactNode }) {
  return <Card className="automation-details contact-profile-card gap-0 bg-muted p-0" role="region" aria-label={label}><dl className="automation-detail-fields soft-divide-y">{children}</dl></Card>
}
export function ContactProfileRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="automation-detail-row"><dt>{icon}<span>{title}</span></dt><dd>{children}</dd></div>
}

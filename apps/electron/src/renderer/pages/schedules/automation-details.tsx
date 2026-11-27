/*
 * [OUTPUT]: 2026-11-27 只读计划卡片移除底部操作行。
 * [INPUT]: 已保存计划与通讯录快照。
 * [OUTPUT]: 紧凑只读配置Card。
 * [POS]: 定时任务详情的只读配置卡片，独立于执行记录与创建草稿。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ReactNode } from 'react'
import type { AutomationDefinition, Snapshot } from '@boai/shared/domain'
import { CalendarClock, Clock, Contact, FileText, MessageCircle, Pencil } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { automationOwnerLabel } from './automation-owner'
import { scheduleSummary } from './schedule-presentation'

function DetailRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="automation-detail-row"><dt>{icon}<span>{title}</span></dt><dd>{children}</dd></div>
}

export function AutomationDetails({ definition, snapshot }: { definition: AutomationDefinition; snapshot: Snapshot }) {
  return <Card className="automation-details gap-0 bg-muted p-0" role="region" aria-label="计划摘要">
    <dl className="automation-detail-fields soft-divide-y">
      <DetailRow icon={<Pencil />} title="名称">{definition.name}</DetailRow>
      <DetailRow icon={<MessageCircle />} title="描述">{definition.description || <span className="text-muted-foreground">未填写</span>}</DetailRow>
      <DetailRow icon={<FileText />} title="任务指令">{definition.prompt}</DetailRow>
      <DetailRow icon={<Clock />} title="频率">{scheduleSummary(definition)}</DetailRow>
      {definition.frequency === 'monthly' && definition.startsOn && <DetailRow icon={<CalendarClock />} title="开始日期">{definition.startsOn}</DetailRow>}
      <DetailRow icon={<Contact />} title="执行员工">{automationOwnerLabel(definition.owner, snapshot)}</DetailRow>
    </dl>
  </Card>
}

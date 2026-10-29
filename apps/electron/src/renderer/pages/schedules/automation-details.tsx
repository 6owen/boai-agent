/*
 * [OUTPUT]: 普通任务显示手动加入队列，暂停仅针对未来定时计划。
 * [INPUT]: 已保存计划、通讯录快照及单次运行操作。
 * [OUTPUT]: 紧凑只读配置Card；底部固定40px透明操作行，避免CardFooter默认背景/圆角/内边距覆盖。
 * [POS]: 定时任务详情的只读配置卡片，独立于执行记录与创建草稿。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ReactNode } from 'react'
import type { AutomationDefinition, Snapshot } from '@boai/shared/domain'
import { CalendarClock, Clock, Contact, FileText, InfoIcon, MessageCircle, Pencil } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { automationOwnerLabel } from './automation-owner'
import { scheduleSummary } from './schedule-presentation'

function DetailRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="automation-detail-row"><dt>{icon}<span>{title}</span></dt><dd>{children}</dd></div>
}

export function AutomationDetails({ definition, snapshot, action }: { definition: AutomationDefinition; snapshot: Snapshot; action: ReactNode }) {
  const status = definition.frequency === 'manual' ? '手动加入队列' : !definition.enabled ? '已暂停' : definition.sync === 'error' ? '同步失败' : definition.sync === 'pending' ? '等待同步' : '已开启'
  return <Card className="automation-details gap-0 bg-muted p-0" role="region" aria-label="计划摘要">
    <dl className="automation-detail-fields soft-divide-y">
      <DetailRow icon={<Pencil />} title="名称">{definition.name}</DetailRow>
      <DetailRow icon={<MessageCircle />} title="描述">{definition.description || <span className="text-muted-foreground">未填写</span>}</DetailRow>
      <DetailRow icon={<FileText />} title="任务指令">{definition.prompt}</DetailRow>
      <DetailRow icon={<Clock />} title="频率">{scheduleSummary(definition)}</DetailRow>
      {definition.frequency === 'monthly' && definition.startsOn && <DetailRow icon={<CalendarClock />} title="开始日期">{definition.startsOn}</DetailRow>}
      <DetailRow icon={<Contact />} title="执行员工">{automationOwnerLabel(definition.owner, snapshot)}</DetailRow>
      <DetailRow icon={<InfoIcon />} title="状态">{status}</DetailRow>
    </dl>
    <div className="automation-detail-actions soft-divider-top">{action}</div>
  </Card>
}

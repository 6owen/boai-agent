/*
 * [INPUT]: 技能名称/说明/来源、选中或拖拽状态及原按钮事件。
 * [OUTPUT]: 共用技能行按钮显式限制可收缩宽度；名称/说明单行省略，不以长正文撑宽资源库或选择弹窗。
 * [POS]: 技能列表展示单元，不读取目录、改变收藏或提交绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属.folder.md。
 */
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Zap } from '@/components/icons'

export function SkillListItem({ entry, selected = false, dragging = false, className, ...props }: Omit<ComponentProps<typeof Button>, 'children'> & {
  entry: { name: string; description: string; source?: string }; selected?: boolean; dragging?: boolean
}) {
  return <Button type="button" variant="ghost" size="content" {...props} className={cn('conversation-item skill-list-select min-w-0 max-w-full', selected && 'selected', dragging && 'drag-list-dragging', className)} aria-pressed={selected}>
    <span className="skill-list-icon"><Zap /></span><span className="conversation-copy min-w-0 flex-1 overflow-hidden"><strong className="conversation-title block truncate" title={entry.name}>{entry.name}</strong><small className="conversation-preview block truncate">{entry.source && <span className="skill-source-badge">{entry.source}</span>}{entry.description || '查看技能说明'}</small></span>
  </Button>
}

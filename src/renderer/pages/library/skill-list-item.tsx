/*
 * [INPUT]: 技能名称/说明/来源、选中或拖拽状态及原按钮事件。
 * [OUTPUT]: 资源库和员工技能选择共用的技能行按钮，统一图标/名称/说明与交互皮肤。
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
  return <Button type="button" variant="ghost" size="content" {...props} className={cn('conversation-item skill-list-select', selected && 'selected', dragging && 'drag-list-dragging', className)} aria-pressed={selected}>
    <span className="skill-list-icon"><Zap /></span><span className="conversation-copy"><strong className="conversation-title">{entry.name}</strong><small className="conversation-preview">{entry.source && <span className="skill-source-badge">{entry.source}</span>}{entry.description || '查看技能说明'}</small></span>
  </Button>
}

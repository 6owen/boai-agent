/*
 * [INPUT]: 技能名称/说明/来源、选中或拖拽状态及原按钮事件。
 * [OUTPUT]: 技能行复用共享ListRow，只保留来源与拖拽适配；原名称/说明省略、按钮事件和选中保持。
 * [POS]: 技能列表展示单元，不读取目录、改变收藏或提交绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属.folder.md。
 */
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { ListRow } from '@/components/ui/item'
import { Zap } from '@/components/icons'

export function SkillListItem({ entry, selected = false, dragging = false, className, ...props }: Omit<ComponentProps<typeof ListRow>, 'label' | 'description' | 'icon'> & {
  entry: { name: string; description: string; source?: string }; selected?: boolean; dragging?: boolean
}) {
  return <ListRow {...props} label={entry.name} icon={<Zap />} selected={selected} className={cn('skill-list-select', dragging && 'drag-list-dragging', className)}
    description={<>{entry.source && <span className="skill-source-badge">{entry.source}</span>}{entry.description || '查看技能说明'}</>} />
}

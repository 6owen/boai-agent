/*
 * [INPUT]: 页面类别、可选标题/操作及原创伙伴 SVG，现有 shadcn Empty 组件。
 * [OUTPUT]: 会话、定时任务、技能和通讯录共用的居中插画空状态；SVG 不可选中/拖拽，仅会话传入并展示标题，不展示描述文字。
 * [POS]: 跨页面空状态组合；仅负责展示，不持有导航或业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ReactNode } from 'react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import conversations from '@/assets/conversation-companions.svg'
import schedules from '@/assets/schedule-companion.svg'
import skills from '@/assets/skill-companion.svg'
import contacts from '@/assets/contact-companions.svg'

const illustrations = {
  conversations: { src: conversations, alt: '等你开聊的小伙伴' },
  schedules: { src: schedules, alt: '小熊和准时的小闹钟' },
  skills: { src: skills, alt: '猫头鹰和知识小书' },
  contacts: { src: contacts, alt: '等你认识的动物伙伴' },
}

export function IllustratedEmpty({ kind, title, children }: { kind: keyof typeof illustrations; title?: string; children?: ReactNode }) {
  return <Empty className="illustrated-empty h-full min-h-64">
    <EmptyHeader>
      <EmptyMedia><img className="empty-illustration select-none" draggable={false} src={illustrations[kind].src} width={240} height={184} alt={illustrations[kind].alt} /></EmptyMedia>
      {title && <EmptyTitle>{title}</EmptyTitle>}
    </EmptyHeader>
    {children}
  </Empty>
}

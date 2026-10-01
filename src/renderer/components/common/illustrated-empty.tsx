/*
 * [INPUT]: 页面类别、可选标题/操作及透明毛绒伙伴 WebP，现有 shadcn Empty 组件。
 * [OUTPUT]: 会话、定时任务、技能和通讯录共用的居中毛绒插画空状态；图片不可选中/拖拽，展示可选标题与操作，不展示描述文字。
 * [POS]: 跨页面空状态组合；仅负责展示，不持有导航或业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ReactNode } from 'react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import conversations from '@/assets/conversation-companions.webp'
import schedules from '@/assets/schedule-companion.webp'
import skills from '@/assets/skill-companion.webp'
import contacts from '@/assets/contact-companions.webp'

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

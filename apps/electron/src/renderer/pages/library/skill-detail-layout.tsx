/*
 * [OUTPUT]: 技能与员工任务共用DetailPanelHeader，原技能正文与操作保持。
 * [INPUT]: 本地/商城的技能名称、元数据、正文与各自操作。
 * [OUTPUT]: 本地/商城技能和数据源共用标题栏、滚动容器、图标标题、元数据卡片和说明卡片。
 * [POS]: 技能详情纯表现层，不请求数据或执行安装。
 * [PROTOCOL]: 变化同步 Header 与 .folder.md。
 */
import { DetailPanelHeader } from '@/components/common/detail-panel-header'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Zap } from '@/components/icons'
import { SkillMarkdown } from './skill-markdown'

export function SkillDetailPanel({ name, actions, children, className = '', label = '技能详情' }: { name: string; actions?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return <section className={`skill-detail-panel ${className}`} aria-label={label}>
    <DetailPanelHeader title={name} actions={actions} />
    <ScrollFade className="skills-detail-content">{children}</ScrollFade>
  </section>
}

export function SkillDetailBody({ name, description, metadata, metadataActions, content, contentActions, children, notice, icon, emptyContent = '提供方未提供正文，安装前需要检查实际技能包。' }: { name: string; description?: string; metadata: { label: string; value: ReactNode }[]; metadataActions?: ReactNode; content?: string; contentActions?: ReactNode; notice?: ReactNode; children?: ReactNode; icon?: ReactNode; emptyContent?: string }) {
  return <article className="skill-info-page">
    {notice}
    <div className="skill-info-heading"><span className="skill-info-icon">{icon ?? <Zap size={30} />}</span><div><h2>{name}</h2><p title={description}>{description}</p></div></div>
    <div className="skill-info-section-heading"><h3>元数据</h3>{metadataActions}</div>
    <Card className="gap-0 p-0"><CardContent className="p-0"><dl className="skill-metadata soft-divide-y">{metadata.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></CardContent></Card>
    <div className="skill-info-section-heading"><h3>说明</h3>{contentActions}</div>
    <Card className="skill-document-card gap-0 p-4"><CardContent className="p-0">{content ? <SkillMarkdown content={content} /> : <p className="field-hint">{emptyContent}</p>}</CardContent></Card>
    {children}
  </article>
}

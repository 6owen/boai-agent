/*
 * [OUTPUT]: 侧栏入口名称与tooltip统一资源库，承载技能/数据源及后续资源类别。
 * [INPUT]: 当前页面与统一技能页面导航回调。
 * [OUTPUT]: 侧栏资源库入口；内部整合技能与数据源。
 * [POS]: app-shell 的 Skills 一级图标导航。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { AtSign } from '@/components/icons'

export function SkillsNavigation({ page, onSkills }: { page: string; onSkills: () => void }) {
  return <Button variant="ghost" size="content" className={`rail-item${page === 'skills' ? ' selected' : ''}`} aria-label="资源库" title="资源库" aria-current={page === 'skills' ? 'page' : undefined} onClick={onSkills}><AtSign /></Button>
}

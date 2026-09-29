/*
 * [INPUT]: 当前页面与统一技能页面导航回调。
 * [OUTPUT]: 侧栏唯一的技能入口，无二级菜单；管理与商城在同页顶部 Tabs 切换。
 * [POS]: app-shell 的 Skills 一级图标导航。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { Zap } from '@/components/icons'

export function SkillsNavigation({ page, onSkills }: { page: string; onSkills: () => void }) {
  return <Button variant="ghost" size="content" className={`rail-item${page === 'skills' ? ' selected' : ''}`} aria-label="技能" title="技能" aria-current={page === 'skills' ? 'page' : undefined} onClick={onSkills}><Zap /></Button>
}

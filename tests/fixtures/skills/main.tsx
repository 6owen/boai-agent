/*
 * [INPUT]: 生产 SkillsWorkspace、真实 DesktopApi、测试商店接口和明确空的隔离本机目录。
 * [OUTPUT]: 目录与显式右侧详情并存，默认进入实际 marketplace 分区，沿生产工作区保留商城详情/本地切换；共享详情面板与全局Sonner；可控延迟、分页失败及离线状态的桌面交互页面，不扫描开发者本机技能。
 * [POS]: 只在 BDD fixture 使用，不进入生产包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { SkillsWorkspace, type SkillsSection } from '@/pages/library/skills-workspace'
import { SkillMarketplaceDetail } from '@/pages/library/skill-marketplace'
import type { SkillMarketplaceItem, SkillMarketplaceProvider } from '@boai/shared/domain/skill-marketplace'
import type { DesktopApi } from '@boai/shared/ipc'
import { Toaster } from '@/components/ui/sonner'
import '@/styles/global.css'

const api: DesktopApi = { ...window.boai, request: async (method, input) => {
  if (method === 'listLocalSkills') return { skills: [], issues: [] }
  if (!['listSkillMarketplace', 'getSkillMarketplaceDetail', 'refreshSkillMarketplace'].includes(method)) return window.boai.request(method, input)
  const response = await fetch('/fixture-marketplace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, input }) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error)
  return body.result
} }
function Fixture() {
  const [section, setSection] = useState<SkillsSection>('marketplace'), [provider, setProvider] = useState<SkillMarketplaceProvider>('skills-sh')
  const [selected, setSelected] = useState<SkillMarketplaceItem | null>(null)
  return <main style={{ height: '100vh', display: 'flex' }}><div style={{ flex: 1, minWidth: 0 }}><SkillsWorkspace embedded onOpenSkill={() => { setSection('all'); setSelected(null) }} onOpenMarketplace={setSelected} api={api} section={section} onSection={setSection} provider={provider} onProvider={setProvider} divider={null} onCheckUpdates={() => {}} revision={0} /></div>{selected && <aside className="skills-detail-content" style={{ flex: '0 0 45%' }}><SkillMarketplaceDetail api={api} provider={selected.provider} id={selected.id} refresh={async () => {}} onResource={() => { setSection('all'); setSelected(null) }} /></aside>}<Toaster /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)

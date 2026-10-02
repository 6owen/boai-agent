/*
 * [INPUT]: 生产 SkillsWorkspace、真实 DesktopApi、测试商店接口和明确空的隔离本机目录。
 * [OUTPUT]: 默认进入实际 marketplace 分区，沿生产工作区保留商城详情/本地切换；可控延迟、分页失败及离线状态的桌面交互页面，不扫描开发者本机技能。
 * [POS]: 只在 BDD fixture 使用，不进入生产包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { SkillsWorkspace, type SkillsSection } from '@/pages/library/skills-workspace'
import type { SkillMarketplaceProvider } from '@shared/domain/skill-marketplace'
import type { DesktopApi } from '@shared/ipc'
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
  return <main style={{ height: '100vh' }}><SkillsWorkspace api={api} section={section} onSection={setSection} provider={provider} onProvider={setProvider} divider={null} onCheckUpdates={() => {}} revision={0} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)

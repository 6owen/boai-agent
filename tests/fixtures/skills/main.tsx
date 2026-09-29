/*
 * [INPUT]: 生产资料库/详情组件、真实 DesktopApi 和测试商店接口。
 * [OUTPUT]: 商店详情沿用当前无 snapshot 的组件接口；可控延迟、分页失败及离线状态的桌面交互页面。
 * [POS]: 只在 BDD fixture 使用，不进入生产包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import { LibraryPage } from '@/pages/library'
import { SkillMarketplaceDetail } from '@/pages/library/skill-marketplace'
import type { Snapshot } from '@shared/domain'
import type { SkillMarketplaceItem } from '@shared/domain/skill-marketplace'
import type { DesktopApi } from '@shared/ipc'
import '@/styles/global.css'

const api: DesktopApi = { ...window.boai, request: async (method, input) => {
  if (!['listSkillMarketplace', 'getSkillMarketplaceDetail', 'refreshSkillMarketplace'].includes(method)) return window.boai.request(method, input)
  const response = await fetch('/fixture-marketplace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, input }) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error)
  return body.result
} }
function Fixture() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [item, setItem] = useState<SkillMarketplaceItem | null>(null)
  const refresh = async () => setSnapshot(await api.request('snapshot', undefined))
  useEffect(() => { void refresh() }, [])
  return snapshot && <main style={{ display: 'grid', gridTemplateColumns: item ? '1fr 360px' : '1fr', height: '100vh' }}><LibraryPage api={api} snapshot={snapshot} refresh={refresh} onResource={() => {}} onAgent={() => {}} onMarketplace={setItem} />{item && <aside aria-label="商店详情" style={{ overflow: 'auto' }}><SkillMarketplaceDetail api={api} provider={item.provider} id={item.id} refresh={refresh} onResource={() => {}} /></aside>}</main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)

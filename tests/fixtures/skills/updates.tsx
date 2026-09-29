/*
 * [INPUT]: 生产资料库/资源详情、真实 AppService 的受控 HTTP 请求与变化事件。
 * [OUTPUT]: 更新与本地修改确认的 Electron 交互组合。
 * [POS]: 仅 BDD 使用的组件与服务桥；不进入生产包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'
import { LibraryPage, ResourceDetail } from '@/pages/library'
import type { Resource, Snapshot } from '@shared/domain'
import type { AppEvent, DesktopApi } from '@shared/ipc'
import '@/styles/global.css'

const listeners = new Set<(event: AppEvent) => void>(), events = new EventSource('/fixture-skill-events')
events.onmessage = message => { const event = JSON.parse(message.data) as AppEvent; for (const listener of listeners) listener(event) }
const api: DesktopApi = { request: async (method, input) => {
  const response = await fetch('/fixture-skill-runtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, input }) })
  const body = await response.json(); if (!response.ok) throw new Error(body.error); return body.result
}, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
function Fixture() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [resource, setResource] = useState<Resource | null>(null)
  const refresh = useCallback(async () => setSnapshot(await api.request('snapshot', undefined)), [])
  useEffect(() => { void refresh(); return api.subscribe(event => { if (event.type === 'changed') void refresh() }) }, [refresh])
  return snapshot && <main style={{ display: 'grid', gridTemplateColumns: resource ? '1fr 480px' : '1fr', height: '100vh' }}><LibraryPage api={api} snapshot={snapshot} refresh={refresh} onResource={setResource} onAgent={() => {}} onMarketplace={() => {}} />{resource && <aside aria-label="技能更新详情" style={{ overflow: 'auto' }}><ResourceDetail api={api} resource={resource} snapshot={snapshot} refresh={refresh} onRemoved={() => setResource(null)} onAgent={() => {}} /></aside>}</main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)

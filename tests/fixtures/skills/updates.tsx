/*
 * [INPUT]: 独立 SkillUpdateBatchView/ResourceDetail、真实 AppService 的受控 HTTP 请求与变化事件。
 * [OUTPUT]: 更新批次与真实已安装技能导航独立组合，保留差异/本地修改确认的 Electron 交互入口，不重建资料库主页面。
 * [POS]: 仅 BDD 使用的组件与服务桥；不进入生产包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'
import { ResourceDetail } from '@/pages/library/resource-detail'
import { SkillUpdateBatchView } from '@/pages/library/skill-update-batch'
import { Button } from '@/components/ui/button'
import type { Resource, Snapshot } from '@boai/shared/domain'
import type { AppEvent, DesktopApi } from '@boai/shared/ipc'
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
  return snapshot && <main style={{ display: 'grid', gridTemplateColumns: resource ? '1fr 480px' : '1fr', height: '100vh' }}><section style={{ overflow: 'auto', padding: 16 }}><nav aria-label="已安装技能">{snapshot.resources.filter(value => value.kind === 'skill').map(value => <Button key={value.id} variant="ghost" size="content" onClick={() => setResource(value)}>{value.name} {value.description}</Button>)}</nav><SkillUpdateBatchView api={api} onResource={id => setResource(snapshot.resources.find(value => value.id === id) ?? null)} onUpdated={() => { void refresh() }} /></section>{resource && <aside aria-label="技能更新详情" style={{ overflow: 'auto' }}><ResourceDetail api={api} resource={resource} snapshot={snapshot} refresh={refresh} onRemoved={() => setResource(null)} onAgent={() => {}} /></aside>}</main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)

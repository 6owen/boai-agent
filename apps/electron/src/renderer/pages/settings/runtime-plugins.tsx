/*
 * [INPUT]: Runtime plugin catalog and explicit local package/CAS operations.
 * [OUTPUT]: Page-independent confirmed catalog cache, visible-only usage polling and CAS writes with read-only reconciliation.
 * [POS]: Runtime contributions within the common settings plugin page.
 * [PROTOCOL]: Update Header and settings/.folder.md when changing management.
 */
import { useEffect, useRef, useState } from 'react'
import type { RuntimePluginCatalog } from '@boai/shared/plugins/runtime-catalog'
import { getDesktopClient } from '@/services/request/desktop-client'
import { Banner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { getSettingsQuery, useSettingsQuery } from '@/stores/settings-query'
export function RuntimePluginManager({ query, kind, active = true }: { query: string; kind: string; active?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const api = getDesktopClient()
  const cache = api && getSettingsQuery<RuntimePluginCatalog>(api, 'runtime-plugins', {
    read: () => api.request('listRuntimePlugins', undefined), staleTime: 3000, refreshOnFocus: true,
    merge: (previous, next) => previous && next.revision < previous.revision ? previous : next,
    onEvent: (event, current) => { if (event.type === 'changed' && !event.conversationId) current.invalidate() },
  })
  const visible = active && (kind === 'all' || kind === 'agent-runtime')
  const { data: catalog } = useSettingsQuery(cache, visible)
  const current = useRef({ api, visible })
  current.current = { api, visible }
  useEffect(() => {
    current.current = { api, visible }
    return () => { current.current = { api, visible: false } }
  }, [api, visible])
  useEffect(() => {
    if (!cache || !visible || busy) return
    const timer = setInterval(() => void cache.ensure({ silent: true }), 3000)
    return () => clearInterval(timer)
  }, [cache, visible, busy])
  async function run(operation: () => Promise<RuntimePluginCatalog | null>) {
    if (busy || !cache || !visible) return; setBusy(true); setError('')
    try { const value = await operation(); if (value) cache.accept(value) }
    catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      // Reconcile unknown writes once when visible; never restart hidden polling or replay a write.
      if (current.current.api === api && current.current.visible) await cache.refresh()
      else cache.invalidate()
    }
    finally { setBusy(false) }
  }
  if (kind !== 'all' && kind !== 'agent-runtime') return null
  const plugins = catalog?.plugins.filter(plugin => `${plugin.manifest.name} ${plugin.manifest.id} ${plugin.manifest.description}`.toLowerCase().includes(query.trim().toLowerCase())) ?? []
  return <div className="mt-4">
    <div className="mb-3 flex items-center justify-between gap-3"><p className="field-hint">本机 Agent 运行时 · 使用已安装的原生程序</p><Button size="sm" variant="outline" disabled={busy || !catalog || catalog.readOnly} onClick={() => void run(() => api!.request('installRuntimePlugin', { expectedRevision: catalog!.revision }))}>安装或更新插件</Button></div>
    <p className="field-hint mb-3">可选择受信任的本地插件文件夹。插件包需要清单和许可证；自定义驱动还需预构建代码。</p>
    {(error || catalog?.diagnostic) && <Banner>{error || catalog?.diagnostic}</Banner>}
    <Card className="gap-0 p-0"><CardContent className="soft-divide-y px-4 py-0">{plugins.map(item => <div key={item.manifest.id} data-application-plugin={item.manifest.id} className="flex items-center gap-4 py-4">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><label className="font-medium" htmlFor={`runtime-${item.manifest.id}`}>{item.manifest.name}</label><span className="text-xs text-muted-foreground">{item.manifest.version} · {item.bundled ? '内置' : '本地安装'}</span></div><p className="field-hint mt-1">{item.manifest.description}</p><p role="status" className="field-hint mt-1">{item.enabled ? '已启用' : '已停用'}{item.inUse ? ` · ${item.inUse} 个执行${item.enabled ? '进行中' : '正在收尾'}` : ' · 当前无执行'}</p></div>
      {!item.bundled && <Button size="sm" variant="ghost" disabled={busy || !!item.inUse || catalog?.readOnly} onClick={() => void run(() => api!.request('uninstallRuntimePlugin', { id: item.manifest.id, expectedRevision: catalog!.revision }))}>卸载</Button>}
      <Switch id={`runtime-${item.manifest.id}`} aria-label={`${item.manifest.name}运行时`} checked={item.enabled} disabled={busy || catalog?.readOnly} onCheckedChange={enabled => void run(() => api!.request('setRuntimePluginEnabled', { id: item.manifest.id, enabled, expectedRevision: catalog!.revision }))} />
    </div>)}{!plugins.length && <p className="field-hint py-4">{catalog ? '没有匹配的运行时插件。' : '正在读取运行时插件…'}</p>}</CardContent></Card>
  </div>
}

import { ExternalSettings } from './external'
import { AppearanceSettings } from './appearance'
import { DataSettings } from './data'
import { useContext, useState } from 'react'
import { LoaderCircle, Plus, HardDrive, Sparkles } from '@/components/icons/index'
import type { Connection, DesktopApi, Snapshot } from '@shared/contracts'
import { Banner, connectionReady, GuardContext, useMutation } from '@/components/common/index'
import { ConnectionEditor } from './connections'
export function SettingsPage({ api, snapshot, refresh, initialTab='connections' }: { api: DesktopApi; snapshot: Snapshot; refresh: () => Promise<void>; initialTab?: 'connections'|'data'|'appearance'|'external' }) {
  const [tab, setTab] = useState<'connections' | 'data' | 'appearance' | 'external'>(initialTab)
  const [editing, setEditing] = useState<Connection | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const guard = useContext(GuardContext)
  const { busy, error, run } = useMutation()
  return <div className="settings-page"><nav className="page-subnav" aria-label="设置分类"><h2>设置</h2><button className={tab === 'external' ? 'selected' : ''} onClick={() => guard.navigate(() => { setTab('external'); setEditing(null) })}>外部 Agent</button><button className={tab === 'appearance' ? 'selected' : ''} onClick={() => guard.navigate(() => { setTab('appearance'); setEditing(null) })}>外观</button><button className={tab === 'connections' ? 'selected' : ''} onClick={() => guard.navigate(() => { setTab('connections'); setEditing(null) })}><Sparkles size={17} />模型连接</button><button className={tab === 'data' ? 'selected' : ''} onClick={() => guard.navigate(() => { setTab('data'); setEditing(null) })}><HardDrive size={17} />数据与备份</button></nav><div className="settings-content page-scroll">
    {error && <Banner>{error}</Banner>}{notice && <Banner kind="notice" onClose={() => setNotice('')}>{notice}</Banner>}
    {tab === 'connections' && (editing ? <><div className="page-heading"><h2>{editing === 'new' ? '添加模型连接' : '编辑模型连接'}</h2></div><ConnectionEditor key={editing === 'new' ? 'new' : editing.id} api={api} connection={editing === 'new' ? undefined : editing} onSaved={refresh} onCancel={() => setEditing(null)} /></> : <><div className="page-heading"><div><h2>模型连接</h2><p>为每位数字员工选择适合的模型。</p></div><button className="button primary" onClick={() => setEditing('new')}><Plus size={16} />添加连接</button></div><p className="field-hint">连接测试会发送简短模型请求；兼容本地服务可按服务要求留空密钥。</p><div className="connection-list">{snapshot.connections.map(connection => <article className="connection-card" key={connection.id}><div className="connection-card-top"><span className={`connection-dot${connectionReady(connection) ? ' ready' : ''}`} /><strong>{connection.name}</strong><span className="pill">{connection.provider}</span></div><p>{connection.defaultModel} · {connection.hasApiKey ? '密钥已保存' : connection.provider === 'openai-compatible' ? '未设置密钥（兼容服务可选）' : '需要配置密钥'}</p>{connection.baseUrl && <p className="resource-path">{connection.baseUrl}</p>}<div className="button-row"><button className="button subtle small" disabled={busy} onClick={() => { void run(async () => { const result = await api.request('testConnection', { id: connection.id }); setNotice(`「${connection.name}」连接成功：${result.text}`) }) }}>测试连接</button><button className="button subtle small" onClick={() => setEditing(connection)}>编辑</button><button className="button subtle small danger" disabled={busy} onClick={() => { void run(async () => { await api.request('deleteConnection', { id: connection.id }); await refresh() }) }}>删除</button></div></article>)}</div>{!snapshot.connections.length && <div className="empty-state compact"><Sparkles size={30} /><h3>连接第一个模型</h3><p>配置自己的模型服务后，员工才能生成真实回复。</p></div>}</>)}
    {tab === 'external' && <ExternalSettings api={api}/>}
    {tab === 'appearance' && <AppearanceSettings />}
    {tab === 'data' && <DataSettings api={api} snapshot={snapshot} busy={busy} run={run} onNotice={setNotice} />}
    {busy && <p className="inline-loading"><LoaderCircle className="spinner" size={16} />正在处理…</p>}
  </div></div>
}

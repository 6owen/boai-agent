/*
 * [INPUT]: 设置子页、领域类型、DesktopApi、统一导航图标与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 与会话共用标题栏和搜索图标尺寸、搜索后独立滚动的设置分类；外观/模型连接共用文档留白，委托子页管理内容与配置弹窗。
 * [POS]: src/renderer/pages/settings/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { ExternalSettings } from './external'
import { AppearanceSettings } from './appearance'
import { DataSettings } from './data'
import { useContext, useState } from 'react'
import { LoaderCircle, HardDrive, Sparkles, Settings, Terminal, Search } from '@/components/icons/index'
import type { Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, GuardContext, useMutation } from '@/components/common/index'
import { ConnectionSettings } from './connections'
export function SettingsPage({ api, snapshot, refresh, initialTab='connections' }: { api: DesktopApi; snapshot: Snapshot; refresh: () => Promise<void>; initialTab?: 'connections'|'data'|'appearance'|'external' }) {
  const [tab, setTab] = useState<'connections' | 'data' | 'appearance' | 'external'>(initialTab)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const guard = useContext(GuardContext)
  const { busy, error, run } = useMutation()
  const groups = [
    { label: '个人', items: [{ id: 'appearance', label: '外观', icon: Settings }] },
    { label: '工作空间', items: [{ id: 'connections', label: '模型连接', icon: Sparkles }, { id: 'external', label: '外部 Agent', icon: Terminal }, { id: 'data', label: '数据与备份', icon: HardDrive }] },
  ] as const
  const matches = groups.flatMap(group => [...group.items]).filter(item => item.label.toLowerCase().includes(search.trim().toLowerCase()))
  return <div className="settings-page"><nav className="page-subnav" aria-label="设置分类">
    <div className="list-heading"><h2>设置</h2></div>
    <InputGroup className="settings-search"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索设置" placeholder="搜索" value={search} onChange={event => setSearch(event.target.value)} /></InputGroup>
    <div className="settings-nav-list">{groups.map(group => {
      const items = group.items.filter(item => matches.some(match => match.id === item.id))
      return items.length > 0 && <div className="settings-nav-group" key={group.label}><p>{group.label}</p>{items.map(item => <Button variant="ghost" size="content" key={item.id} className={tab === item.id ? 'selected' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => guard.navigate(() => { setTab(item.id) })}><item.icon size={16} />{item.label}</Button>)}</div>
    })}
    {!matches.length && <p className="settings-search-empty">没有匹配的设置</p>}</div>
  </nav><div className={`settings-content page-scroll${tab === 'appearance' || tab === 'connections' ? ' settings-document-content' : ''}`}>

    {error && <Banner>{error}</Banner>}{notice && <Banner kind="notice" onClose={() => setNotice('')}>{notice}</Banner>}
    {tab === 'connections' && <ConnectionSettings connections={snapshot.connections} api={api} refresh={refresh} />}
    {tab === 'external' && <ExternalSettings api={api}/>}
    {tab === 'appearance' && <AppearanceSettings />}
    {tab === 'data' && <DataSettings api={api} snapshot={snapshot} busy={busy} run={run} onNotice={setNotice} />}
    {busy && <p className="inline-loading"><LoaderCircle className="spinner" size={16} />正在处理…</p>}
  </div></div>
}

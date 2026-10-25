/*
 * [OUTPUT]: 桌面活动与日报独立设置分类，沿原 bobo 日报入口。
 * [OUTPUT]: 个人资料常用技能菜单通过Shell导航到资源库技能列表，不打开本页详情。
 * [OUTPUT]: 快捷键分类支持启停/录入与自动保存，传递活跃状态以释放捕获。
 * [OUTPUT]: 运行选项桌面活动日报入口交给原 bobo 首发流程。
 * [OUTPUT]: 2026-10-19 配置分类新增网页检索独立页，沿原活跃读取和页面切换。
 * [OUTPUT]: 设置增加内置插件管理，沿原分类/文档布局与启停真源。
 * [OUTPUT]: 运行选项入口接后台常驻与真实系统登录项状态。
 * [OUTPUT]: 分类成功切换后仅内容区播放 transitions-dev panel reveal；首次/后台不播放，结束释放变换，不重挂当前表单。
 * [OUTPUT]: 原模型连接页接具体本机配置导航，隐藏状态传递到本机读取与编辑器。
 * [INPUT]: 设置子页、领域类型、DesktopApi、Shell 共用分栏拖拽线、统一导航图标与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 个人资料分类、受控当前分类及活跃读取标记；设置包含个人资料、模型连接、外观、数据与备份，移除独立外部 Agent 分类；设置分类与内容使用共用可调分栏；与会话共用标题栏和搜索图标尺寸、搜索后独立滚动的设置分类；外观/模型连接共用文档留白，委托子页管理内容与配置弹窗。
 * [POS]: apps/electron/src/renderer/pages/settings/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ProfileSettings } from './profile'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { AppearanceSettings } from './appearance'
import { ShortcutSettings } from './shortcuts'
import { DataSettings } from './data'
import { DesktopSettingsPage } from './desktop'
import { DesktopActivityPage } from './desktop-activity'
import { WebSearchSettingsPage } from './web-search'
import { PluginSettingsPage } from './plugins'
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, HardDrive, Sparkles, Settings, Search, Contact } from '@/components/icons/index'
import type { Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, GuardContext, useMutation } from '@/components/common/index'
import { ConnectionSettings } from './connections'
import type { LocalAgentTarget } from './local-agents'
export type SettingsTab = 'profile' | 'connections' | 'data' | 'appearance' | 'shortcuts' | 'desktop' | 'desktop-activity' | 'plugins' | 'web-search'
export function SettingsPage({ api, snapshot, refresh, divider, tab, setTab, active, onOpenSkills, localAgentTarget, onActivityReport }: { onActivityReport(from: string, to: string): Promise<void>; api: DesktopApi; snapshot: Snapshot; refresh: () => Promise<void>; divider: ReactNode; tab: SettingsTab; setTab: (tab: SettingsTab) => void; active: boolean; onOpenSkills: () => void; localAgentTarget?: LocalAgentTarget }) {
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const guard = useContext(GuardContext)
  const { busy, error, run } = useMutation()
  const content = useRef<HTMLDivElement>(null), previousTab = useRef(tab)
  useLayoutEffect(() => {
    const changed = previousTab.current !== tab
    previousTab.current = tab
    const element = content.current
    if (!changed || !active || !element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    element.style.transition = 'none'
    element.dataset.settled = 'false'
    element.dataset.open = 'false'
    void element.offsetWidth
    element.style.transition = ''
    element.dataset.open = 'true'
    const settle = (event: TransitionEvent) => {
      if (event.target === element) element.dataset.settled = 'true'
    }
    element.addEventListener('transitionend', settle)
    return () => {
      element.removeEventListener('transitionend', settle)
      element.dataset.settled = 'true'
    }
  }, [tab, active])
  const groups = [
    { label: '个人', items: [{ id: 'profile', label: '个人资料', icon: Contact }, { id: 'appearance', label: '外观', icon: Settings }, { id: 'shortcuts', label: '快捷键', icon: Settings }, { id: 'desktop', label: '运行选项', icon: Settings }, { id: 'desktop-activity', label: '桌面活动与日报', icon: Settings }] },
    { label: '配置', items: [{ id: 'connections', label: '模型连接', icon: Sparkles }, { id: 'web-search', label: '网页检索', icon: Search }, { id: 'plugins', label: '插件', icon: Settings }, { id: 'data', label: '数据与备份', icon: HardDrive }] },
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
  </nav>{divider}<div className={`settings-content page-scroll${tab === 'appearance' || tab === 'shortcuts' || tab === 'connections' || tab === 'profile' || tab === 'desktop' || tab === 'desktop-activity' || tab === 'plugins' || tab === 'web-search' ? ' settings-document-content' : ''}`}>
    <div ref={content} className="settings-page-transition t-panel-slide" data-open="true" data-settled="true">
    {error && <Banner>{error}</Banner>}{notice && <Banner kind="notice" onClose={() => setNotice('')}>{notice}</Banner>}
    {tab === 'profile' && <ProfileSettings api={api} profile={snapshot.userProfile} active={active} refresh={refresh} onOpenSkills={onOpenSkills} />}
    {tab === 'connections' && <ConnectionSettings connections={snapshot.connections} api={api} refresh={refresh} active={active} localAgentTarget={localAgentTarget} />}
    {tab === 'appearance' && <AppearanceSettings />}
    {tab === 'shortcuts' && <ShortcutSettings active={active} />}
    {tab === 'desktop' && <DesktopSettingsPage api={api} active={active} />}
    {tab === 'desktop-activity' && <DesktopActivityPage api={api} active={active} onReport={onActivityReport} />}
    {tab === 'web-search' && <WebSearchSettingsPage api={api} active={active} />}
    {tab === 'plugins' && <PluginSettingsPage />}
    {tab === 'data' && <DataSettings api={api} snapshot={snapshot} busy={busy} run={run} onNotice={setNotice} />}
    {busy && <p className="inline-loading"><LoaderCircle className="spinner" size={16} />正在处理…</p>}
  </div></div></div>
}

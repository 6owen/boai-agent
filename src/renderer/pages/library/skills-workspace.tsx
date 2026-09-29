/*
 * [INPUT]: 跨页面缓存的本机技能目录、收藏分组与商店 API、TanStack 虚拟列表；技能库导入完成回调；Shell 更新标签入口、技能定位与升级刷新信号；共享 Card/分割线与 ScrollFade；旧 boai-app SkillsListPanel / SkillInfoPage 交互。
 * [OUTPUT]: 本地/收藏/商城未选中时共用无标题且不可选中/拖拽的猫头鹰书本 SVG 空态；下拉字段统一使用 shadcn Select；本地目录缓存、手动扫描、打开独立技能更新标签且保留主详情、详情标题栏单项更新图标/浮层，移除正文状态卡片、说明刷新和底部重复收藏； 同页本地/收藏/商城顶部 Tabs，左栏搜索工具栏/列表，右栏共用卡片皮肤、悬浮标题与顶部渐隐详情或居中空占位，切换技能从顶部阅读；保留可拖动分栏、搜索刷新、会话式收藏分类/全局拖放、可见分组导航与持久顺序、来源元数据/正文、本机技能导出、右侧单图标菜单合并导入/扫描/导出及本地安装浮层，不提供统计页。
 * [POS]: 单一侧栏入口的 Skills 管理与商城工作区；不读取员工资源、不展示或操作员工绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { LocalSkill, LocalSkillDetail, SkillCollectionAction, SkillCollections } from '@shared/domain/skills'
import { type SkillMarketplaceItem, type SkillMarketplaceProvider } from '@shared/domain/skill-marketplace'
import { Banner, errorText, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SkillUpdate } from './skill-update'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { SelectField } from '@/components/ui/select-field'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Search, Zap as ShieldCheck, MoreHorizontal } from '@/components/icons'
import { useSkillCollections } from './use-skill-collections'
import { useLocalSkills } from './use-local-skills'
import { SkillList, type SkillEntry } from './skill-list'
import { SkillGroups } from './skill-groups'
import { SkillMarkdown } from './skill-markdown'
import { SkillImportDialog, SkillActionsMenu } from './skill-import-dialog'
import { SkillExportDialog } from './skill-export-dialog'
import { SkillMarketplaceView, SkillMarketplaceDetail } from './skill-marketplace'

export type SkillsSection = 'all' | 'own' | 'marketplace'
const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(`boai.skills.${key}`) ?? 'null') ?? fallback } catch { return fallback } }

export function SkillsWorkspace({ api, section, onSection, provider, onProvider, divider, onCheckUpdates, focusSkill, revision }: { api: DesktopApi; section: SkillsSection; onSection: (section: SkillsSection) => void; provider: SkillMarketplaceProvider; onProvider: (provider: SkillMarketplaceProvider) => void; divider: ReactNode; onCheckUpdates: () => void; focusSkill?: { id: string; requestId: string }; revision: number }) {
  const { catalog, loading, error: loadError, reload } = useLocalSkills(api, revision)
  const [error, setError] = useState(''), [query, setQuery] = useState(''), [selected, setSelected] = useState('')
  const search = useDeferredValue(query.trim().toLowerCase())
  const [collapsed, setCollapsed] = useState<string[]>(() => stored('collapsed', []))
  const [importing, setImporting] = useState(false), [operationId, setOperationId] = useState<string>(), [exporting, setExporting] = useState(false)
  const collection = useSkillCollections(api)
  useEffect(() => { if (focusSkill) { setSelected(focusSkill.id); setQuery('') } }, [focusSkill])
  useEffect(() => { try { localStorage.setItem('boai.skills.collapsed', JSON.stringify(collapsed)) } catch { /* Optional presentation preferences. */ } }, [collapsed])
  const entries = useMemo<SkillEntry[]>(() => (catalog?.skills ?? []).map(local => ({ id: local.id, name: local.name, description: local.description, source: local.pluginName ?? (local.source === 'global' ? '' : local.sourceLabel), searchText: `${local.name} ${local.description} ${local.slug} ${local.pluginName ?? local.sourceLabel}`.toLowerCase(), local })).sort((a, b) => a.name.localeCompare(b.name)), [catalog])
  const localIds = useMemo(() => new Set(entries.map(entry => entry.id)), [entries])
  const favorites = useMemo(() => collection.value?.favoriteResourceIds.filter(id => localIds.has(id)) ?? [], [collection.value, localIds])
  const favoriteIds = useMemo(() => new Set(favorites), [favorites])
  const visible = useMemo(() => {
    const items = entries.filter(entry => (section !== 'own' || favoriteIds.has(entry.id)) && entry.searchText.includes(search))
    if (section === 'own') { const order = new Map(favorites.map((id, index) => [id, index])); items.sort((a, b) => order.get(a.id)! - order.get(b.id)!) }
    return items
  }, [entries, section, search, favoriteIds, favorites])
  const active = useMemo(() => visible.find(entry => entry.id === selected), [visible, selected])
  const openResource = (id: string) => { setSelected(id); setQuery(''); onSection('all') }
  const installed = useCallback(() => reload(true), [reload])
  const libraryInstalled = useCallback(async () => {
    await Promise.all([reload(true), collection.reload()])
    setSelected(''); setQuery(''); onSection('own')
  }, [reload, collection.reload, onSection])
  const toggle = useCallback((entry: SkillEntry) => { void collection.change({ kind: 'favorite', resourceId: entry.id, favorite: !favoriteIds.has(entry.id) }) }, [collection.change, favoriteIds])
  const reveal = useCallback((id: string) => { void api.request('openLocalSkill', { id, action: 'reveal' }).catch(error => setError(errorText(error))) }, [api])
  const changeCollection = useCallback((action: SkillCollectionAction) => { void collection.change(action) }, [collection.change])
  const collapse = useCallback((id: string) => setCollapsed(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]), [])
  const navigation = <header className="skills-browser-header"><Tabs className="skills-browser-tabs" value={section} onValueChange={value => { setSelected(''); setQuery(''); onSection(value as SkillsSection) }}><TabsList aria-label="技能分类"><TabsTrigger value="all">本地</TabsTrigger><TabsTrigger value="own">收藏</TabsTrigger><TabsTrigger value="marketplace">商城</TabsTrigger></TabsList></Tabs></header>
  const detail = ({ actions }: { actions?: ReactNode } = {}) => active && <>
    <header className="chat-header skill-detail-title"><h2 className="chat-title">{active.name}</h2><div className="chat-header-actions">{actions}<DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="当前技能操作" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent side="right" align="start" className="w-[200px] p-2"><DropdownMenuItem className="px-2.5 py-2" disabled={!collection.value || collection.busy} onClick={() => toggle(active)}>{favorites.includes(active.id) ? '取消收藏' : '加入收藏'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header>
    <ScrollFade key={active.id} className="skills-detail-content">
      <LocalSkillInfo api={api} skill={active.local} favorite={favorites.includes(active.id)} collection={collection.value} busy={collection.busy} assign={groupId => { void collection.change({ kind: 'assign-group', resourceId: active.id, groupId }) }} />
    </ScrollFade>
  </>
  if (section === 'marketplace') return <SkillStoreWorkspace api={api} provider={provider} onProvider={onProvider} refresh={installed} onResource={openResource} divider={divider} navigation={navigation} />
  return <div className="conversation-layout skills-workspace" aria-label="技能管理">
    <aside className="conversation-list-container skills-list-pane"><div className="conversation-list-panel skills-list-panel">
      {navigation}
      <div className="skills-search-toolbar"><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索本机技能" placeholder="搜索技能" value={query} onChange={event => { setQuery(event.target.value); setSelected('') }} /></InputGroup><div className="skills-search-actions">
        {section === 'own' && <SkillGroups value={collection.value ? { ...collection.value, favoriteResourceIds: favorites } : null} change={collection.change} busy={collection.busy} />}
        <SkillActionsMenu api={api} onInstalled={installed} onLibraryInstalled={libraryInstalled} onResource={openResource} allowImport={section === 'all'} onRescan={() => { void reload(true) }} onCheckUpdates={onCheckUpdates} onExport={() => setExporting(true)} scanning={loading} canExport={favorites.length > 0} />
      </div></div>
      {(error || loadError || collection.error) && <Banner>{error || loadError || collection.error}</Banner>}
      {!!catalog?.issues.length && <details className="skill-scan-issues"><summary>有 {catalog.issues.length} 项读取问题</summary>{catalog.issues.map((issue, index) => <p key={index}>{issue.path}<br />{issue.message}</p>)}</details>}
      {loading && !catalog ? <Loading>正在扫描本机技能…</Loading> : <SkillList entries={visible} selected={active?.id} own={section === 'own'} searching={Boolean(search)} collapsed={collapsed} collection={collection.value} favorites={favoriteIds} busy={collection.busy} onSelect={setSelected} onToggle={toggle} onReveal={reveal} onCollapse={collapse} onChange={changeCollection} />}
      {!loading && !visible.length && <div className="skills-list-empty"><h3>{query ? '没有匹配的技能' : section === 'own' ? '还没有收藏的技能' : '未发现本机技能'}</h3><p>{section === 'own' ? '在本地中收藏技能，再创建分组。' : '可重新扫描，或通过操作菜单导入技能。'}</p></div>}
      </div>
    </aside>{divider}
    <main className="conversation-stage skills-detail-pane" aria-label="技能详情">
      {active ? active.local.source === 'global' ? <SkillUpdate key={active.id} api={api} resourceId={active.id} onUpdated={installed} popover>{detail}</SkillUpdate> : detail() : <ScrollFade className="skills-detail-content"><IllustratedEmpty kind="skills" /></ScrollFade>}
    </main>
    {importing && <SkillImportDialog api={api} operationId={operationId} onClose={() => setImporting(false)} onInstalled={installed} onResource={openResource} />}
    {exporting && <SkillExportDialog api={api} resources={entries.map(entry => ({ id: entry.id, name: entry.name, description: entry.description, sourceLabel: entry.local?.sourceLabel }))} favoriteIds={favorites} onClose={() => setExporting(false)} onOperation={id => { setExporting(false); setOperationId(id); setImporting(true) }} />}
  </div>
}

function LocalSkillInfo({ api, skill, favorite, collection, busy, assign }: { api: DesktopApi; skill: LocalSkill; favorite: boolean; collection: SkillCollections | null; busy: boolean; assign: (groupId?: string) => void }) {
  const [detail, setDetail] = useState<LocalSkillDetail | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const mutation = useMutation()
  useEffect(() => { let alive = true; setError(''); api.request('getLocalSkillDetail', { id: skill.id }).then(value => { if (alive) setDetail(value) }, error => { if (alive) setError(errorText(error)) }); return () => { alive = false } }, [api, skill, revision])
  useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [])
  const open = (action: 'edit' | 'reveal') => { void mutation.run(() => api.request('openLocalSkill', { id: skill.id, action })) }
  if (error) return <div className="skill-info-page"><Banner>{error}</Banner><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重试</Button></div>
  if (!detail) return <Loading>正在读取技能…</Loading>
  const current = detail.skill
  return <article className="skill-info-page">
    {mutation.error && <Banner>{mutation.error}</Banner>}
    <div className="skill-info-heading"><span className="skill-info-icon"><ShieldCheck size={30} /></span><div><h2>{current.name}</h2><p title={current.description}>{current.description}</p></div></div>
    <div className="skill-info-section-heading"><h3>元数据</h3>{current.source !== 'plugin' && <Button variant="secondary" size="sm" disabled={mutation.busy} onClick={() => open('edit')}>编辑</Button>}</div>
    <Card className="gap-0 p-0"><CardContent className="p-0"><dl className="skill-metadata soft-divide-y"><div><dt>标识符</dt><dd>{current.slug}</dd></div><div><dt>名称</dt><dd>{current.name}</dd></div><div><dt>描述</dt><dd>{current.description || '未填写'}</dd></div><div><dt>数据源</dt><dd>{current.sourceLabel}</dd></div><div><dt>位置</dt><dd><Button variant="ghost" size="content" className="skill-path-link" onClick={() => open('reveal')}>{current.path}</Button></dd></div></dl></CardContent></Card>
    <div className="skill-info-section-heading"><h3>说明</h3><div className="button-row">{current.source !== 'plugin' && <Button variant="secondary" size="sm" disabled={mutation.busy} onClick={() => open('edit')}>编辑</Button>}</div></div><Card className="skill-document-card gap-0 p-4"><CardContent className="p-0"><SkillMarkdown content={detail.content} /></CardContent></Card>
    {favorite && <><div className="skill-info-section-heading"><h3>分组</h3></div><SelectField aria-label={`${current.name} 的分组`} value={collection?.groupByResourceId[current.id] ?? ''} disabled={busy} onValueChange={selectedValue => assign(selectedValue || undefined)} options={[{ value: '', label: '未分组' }, ...(collection?.groups.map(group => ({ value: group.id, label: group.name })) ?? [])]} /></>}<p className="field-hint">编辑会用系统默认编辑器打开 SKILL.md，保存后返回即可查看。</p>
  </article>
}

function SkillStoreWorkspace({ api, provider, onProvider, refresh, onResource, divider, navigation }: { api: DesktopApi; provider: SkillMarketplaceProvider; onProvider: (provider: SkillMarketplaceProvider) => void; refresh: () => Promise<void>; onResource: (id: string) => void; divider: ReactNode; navigation: ReactNode }) {
  const [selection, setSelection] = useState<SkillMarketplaceItem | null>(null)
  const active = selection?.provider === provider ? selection : null
  return <div className="conversation-layout skills-workspace skill-store-workspace"><aside className="conversation-list-container skills-list-pane"><SkillMarketplaceView api={api} provider={provider} onProviderChange={value => { setSelection(null); onProvider(value) }} navigation={navigation} compact selectedId={active?.id} onSelect={setSelection} /></aside>{divider}<main className="conversation-stage skills-detail-pane" aria-label="商店技能详情">{active && <header className="chat-header skill-detail-title"><h2 className="chat-title">{active.name}</h2></header>}<ScrollFade key={`${provider}:${active?.id ?? 'empty'}`} className="skills-detail-content">{active ? <div className="skill-info-page"><SkillMarketplaceDetail api={api} provider={provider} id={active.id} refresh={refresh} onResource={onResource} /></div> : <IllustratedEmpty kind="skills" />}</ScrollFade></main></div>
}

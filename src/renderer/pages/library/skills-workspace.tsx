/*
 * [OUTPUT]: 随包内置技能源只读显示，不提供外部编辑器修改入口。
 * [OUTPUT]: 技能标题AI管理沿Shell进入普通bobo会话，目录/详情/原Tabs状态保持。
 * [OUTPUT]: 最右图标检索展开；本地/收藏/商城内容共用CatalogTransition，导航Tabs保持挂载。
 * [OUTPUT]: 本地/收藏/商城持续挂载同一Tabs滑动层，搜索图标展开，内容区复用transitions-dev Panel reveal；选中技能打开Shell右侧独立详情，主目录保持。
 * [INPUT]: 跨页面缓存的本机技能目录、收藏分组与商店 API、TanStack 虚拟列表；技能库导入完成回调；Shell 更新标签入口、技能定位与升级刷新信号；共享 Card/分割线与 ScrollFade；旧 boai-app SkillsListPanel / SkillInfoPage 交互。
 * [OUTPUT]: 本地/收藏/商城未选中时共用无标题且不可选中/拖拽的猫头鹰书本 SVG 空态；下拉字段统一使用 shadcn Select；本地目录缓存、手动扫描、打开独立技能更新标签且保留主详情、详情标题栏单项更新图标/浮层，移除正文状态卡片、说明刷新和底部重复收藏； 同页本地/收藏/商城顶部 Tabs，左栏搜索工具栏/列表，右栏共用卡片皮肤、悬浮标题与顶部渐隐详情或居中空占位，切换技能从顶部阅读；保留可拖动分栏、搜索刷新、会话式收藏分类/全局拖放、可见分组导航与持久顺序、来源元数据/正文、本机技能导出、右侧单图标菜单合并导入/扫描/导出及本地安装浮层，不提供统计页。
 * [POS]: 单一侧栏入口的 Skills 管理与商城工作区；不读取员工资源、不展示或操作员工绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { LocalSkill, LocalSkillCatalog, LocalSkillDetail, SkillCollectionAction, SkillCollections } from '@shared/domain/skills'
import { type SkillMarketplaceItem, type SkillMarketplaceProvider } from '@shared/domain/skill-marketplace'
import { Banner, errorText, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { SkillUpdate } from './skill-update'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CatalogSearch } from '@/components/common/catalog-search'
import { CatalogTransition } from './catalog-transition'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { SelectField } from '@/components/ui/select-field'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, MessageCircle } from '@/components/icons'
import { useSkillCollections } from './use-skill-collections'
import { useLocalSkills } from './use-local-skills'
import { SkillList, type SkillEntry } from './skill-list'
import { SkillGroups } from './skill-groups'
import { SkillDetailPanel, SkillDetailBody } from './skill-detail-layout'
import { SkillImportDialog, SkillActionsMenu } from './skill-import-dialog'
import { SkillExportDialog } from './skill-export-dialog'
import { SkillMarketplaceView } from './skill-marketplace'

export type SkillsSection = 'all' | 'own' | 'marketplace'
const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(`boai.skills.${key}`) ?? 'null') ?? fallback } catch { return fallback } }

export function SkillsWorkspace({ api, section, onSection, provider, onProvider, onCheckUpdates, focusSkill, revision, embedded = false, onCatalogChange, onOpenSkill, onOpenMarketplace, onManage }: { api: DesktopApi; section: SkillsSection; onSection: (section: SkillsSection) => void; provider: SkillMarketplaceProvider; onProvider: (provider: SkillMarketplaceProvider) => void; divider: ReactNode; onCheckUpdates: () => void; focusSkill?: { id: string; requestId: string }; revision: number; embedded?: boolean; onCatalogChange?(catalog: LocalSkillCatalog): void; onOpenSkill(skill: LocalSkill): void; onOpenMarketplace(item: SkillMarketplaceItem): void; onManage?(kind: 'skills' | 'sources', item?: { id: string; name: string }): void }) {
  const { catalog, loading, error: loadError, reload } = useLocalSkills(api, revision)
  useEffect(() => { if (catalog) onCatalogChange?.(catalog) }, [catalog, onCatalogChange])
  const [error, setError] = useState(''), [query, setQuery] = useState(''), [selected, setSelected] = useState('')
  const search = useDeferredValue(query.trim().toLowerCase())
  const [collapsed, setCollapsed] = useState<string[]>(() => stored('collapsed', []))
  const [marketSelection, setMarketSelection] = useState<{ provider: SkillMarketplaceProvider; id: string }>()
  const [importing, setImporting] = useState(false), [operationId, setOperationId] = useState<string>(), [exporting, setExporting] = useState(false)
  const collection = useSkillCollections(api)
  const openedFocus = useRef<string | undefined>(undefined)
  useEffect(() => { const skill = catalog?.skills.find(item => item.id === focusSkill?.id); if (skill && focusSkill && openedFocus.current !== focusSkill.requestId) { openedFocus.current = focusSkill.requestId; setSelected(skill.id); setQuery(''); onOpenSkill(skill) } }, [focusSkill, catalog, onOpenSkill])
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
  const selectSkill = (id: string) => { setSelected(id); const skill = entries.find(entry => entry.id === id)?.local; if (skill) onOpenSkill(skill) }
  const openResource = (id: string) => { selectSkill(id); setQuery(''); onSection('all') }
  const installed = useCallback(() => reload(true), [reload])
  const libraryInstalled = useCallback(async () => {
    await Promise.all([reload(true), collection.reload()])
    setSelected(''); setQuery(''); onSection('own')
  }, [reload, collection.reload, onSection])
  const toggle = useCallback((entry: SkillEntry) => { void collection.change({ kind: 'favorite', resourceId: entry.id, favorite: !favoriteIds.has(entry.id) }) }, [collection.change, favoriteIds])
  const reveal = useCallback((id: string) => { void api.request('openLocalSkill', { id, action: 'reveal' }).catch(error => setError(errorText(error))) }, [api])
  const changeCollection = useCallback((action: SkillCollectionAction) => { void collection.change(action) }, [collection.change])
  const collapse = useCallback((id: string) => setCollapsed(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]), [])
  const [marketToolbar, setMarketToolbar] = useState<HTMLDivElement | null>(null)
  const navigation = <Tabs value={section} onValueChange={value => { setSelected(''); setQuery(''); onSection(value as SkillsSection) }}><TabsList aria-label="技能分类"><TabsTrigger value="all">本地</TabsTrigger><TabsTrigger value="own">收藏</TabsTrigger><TabsTrigger value="marketplace">商城</TabsTrigger></TabsList></Tabs>
  return <div className={`conversation-layout skills-workspace${embedded ? ' embedded-skills' : ''}`} aria-label="技能管理">
    <section className="skills-list-pane"><div className="conversation-list-panel skills-list-panel">
      <header className="custom-content-heading"><h1>技能</h1>{onManage && <Button variant="secondary" size="sm" onClick={() => onManage('skills')}><MessageCircle />AI 管理</Button>}</header>
      <div className="custom-catalog-toolbar">{navigation}<div className="custom-catalog-search" ref={setMarketToolbar}>
        {section !== 'marketplace' && <><div className="skills-search-actions">
          {section === 'own' && <SkillGroups value={collection.value ? { ...collection.value, favoriteResourceIds: favorites } : null} change={collection.change} busy={collection.busy} />}
          <SkillActionsMenu api={api} onInstalled={installed} onLibraryInstalled={libraryInstalled} onResource={openResource} allowImport={section === 'all'} onRescan={() => { void reload(true) }} onCheckUpdates={onCheckUpdates} onExport={() => setExporting(true)} scanning={loading} canExport={favorites.length > 0} />
        </div><CatalogSearch label="搜索本机技能" placeholder="搜索技能" value={query} onChange={value => { setQuery(value); setSelected('') }} /></>}
      </div></div>
      <CatalogTransition key={section}>
      {section === 'marketplace' ? <SkillMarketplaceView api={api} provider={provider} onProviderChange={onProvider} compact toolbarTarget={marketToolbar} selectedId={marketSelection?.provider === provider ? marketSelection.id : undefined} onSelect={item => { setMarketSelection({ provider: item.provider, id: item.id }); onOpenMarketplace(item) }} /> : <>
      {(error || loadError || collection.error) && <Banner>{error || loadError || collection.error}</Banner>}
      {!!catalog?.issues.length && <details className="skill-scan-issues"><summary>有 {catalog.issues.length} 项读取问题</summary>{catalog.issues.map((issue, index) => <p key={index}>{issue.path}<br />{issue.message}</p>)}</details>}
      {loading && !catalog ? <Loading>正在扫描本机技能…</Loading> : visible.length ? <SkillList entries={visible} selected={selected} own={section === 'own'} searching={Boolean(search)} collapsed={collapsed} collection={collection.value} favorites={favoriteIds} busy={collection.busy} onSelect={selectSkill} onToggle={toggle} onReveal={reveal} onCollapse={collapse} onChange={changeCollection} /> : <IllustratedEmpty kind="skills" title={query ? '没有匹配的技能' : section === 'own' ? '还没有收藏的技能' : undefined} />}
      </>}
      </CatalogTransition>
      </div>
    </section>
    {importing && <SkillImportDialog api={api} operationId={operationId} onClose={() => setImporting(false)} onInstalled={installed} onResource={openResource} />}
    {exporting && <SkillExportDialog api={api} resources={entries.map(entry => ({ id: entry.id, name: entry.name, description: entry.description, sourceLabel: entry.local?.sourceLabel }))} favoriteIds={favorites} onClose={() => setExporting(false)} onOperation={id => { setExporting(false); setOperationId(id); setImporting(true) }} />}
  </div>
}

function LocalSkillInfo({ api, skill, favorite, collection, busy, assign, active, refreshKey }: { api: DesktopApi; skill: LocalSkill; active: boolean; refreshKey: string; favorite: boolean; collection: SkillCollections | null; busy: boolean; assign: (groupId?: string) => void }) {
  const [detail, setDetail] = useState<LocalSkillDetail | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const mutation = useMutation()
  useEffect(() => { if (!active) return; let alive = true; setError(''); api.request('getLocalSkillDetail', { id: skill.id }).then(value => { if (alive) setDetail(value) }, error => { if (alive) setError(errorText(error)) }); return () => { alive = false } }, [api, skill, revision, active, refreshKey])
  useEffect(() => { if (!active) return; const refresh = () => setRevision(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [active])
  const open = (action: 'edit' | 'reveal') => { void mutation.run(() => api.request('openLocalSkill', { id: skill.id, action })) }
  if (error) return <div className="skill-info-page"><Banner>{error}</Banner><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重试</Button></div>
  if (!detail) return <Loading>正在读取技能…</Loading>
  const current = detail.skill
  const edit = current.source !== 'plugin' && current.source !== 'builtin' && <Button variant="secondary" size="sm" disabled={mutation.busy} onClick={() => open('edit')}>编辑</Button>
  return <SkillDetailBody name={current.name} description={current.description} content={detail.content} metadataActions={edit} contentActions={edit} notice={mutation.error && <Banner>{mutation.error}</Banner>} metadata={[
    { label: '标识符', value: current.slug }, { label: '名称', value: current.name }, { label: '描述', value: current.description || '未填写' }, { label: '数据源', value: current.sourceLabel },
    { label: '位置', value: <Button variant="ghost" size="content" className="skill-path-link" onClick={() => open('reveal')}>{current.path}</Button> },
  ]}>
    {favorite && <><div className="skill-info-section-heading"><h3>分组</h3></div><SelectField aria-label={`${current.name} 的分组`} value={collection?.groupByResourceId[current.id] ?? ''} disabled={busy} onValueChange={selectedValue => assign(selectedValue || undefined)} options={[{ value: '', label: '未分组' }, ...(collection?.groups.map(group => ({ value: group.id, label: group.name })) ?? [])]} /></>}{current.source !== 'builtin' && <p className="field-hint">编辑会用系统默认编辑器打开 SKILL.md，保存后返回即可查看。</p>}
  </SkillDetailBody>
}

export function LocalSkillPanel({ api, id, revision, requestId, active, onUpdated }: { api: DesktopApi; id: string; revision: number; requestId: string; active: boolean; onUpdated(): void | Promise<void> }) {
  const { catalog, reload, error } = useLocalSkills(api, revision)
  const collection = useSkillCollections(api)
  useEffect(() => { if (active) void reload() }, [active, requestId, reload])
  const skill = catalog?.skills.find(item => item.id === id)
  if (error) return <Banner>{error}</Banner>
  if (!skill) return <IllustratedEmpty kind="skills" title={catalog ? '该技能已不可用' : undefined} />
  const favorite = Boolean(collection.value?.favoriteResourceIds.includes(id))
  const detail = ({ actions }: { actions?: ReactNode } = {}) => <SkillDetailPanel name={skill.name} className="local-skill-panel" actions={<>{actions}<DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="当前技能操作" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!collection.value || collection.busy} onClick={() => { void collection.change({ kind: 'favorite', resourceId: id, favorite: !favorite }) }}>{favorite ? '取消收藏' : '加入收藏'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></>}>
    {collection.error && <Banner>{collection.error}</Banner>}
    <LocalSkillInfo api={api} skill={skill} active={active} refreshKey={requestId} favorite={favorite} collection={collection.value} busy={collection.busy} assign={groupId => { void collection.change({ kind: 'assign-group', resourceId: id, groupId }) }} />
  </SkillDetailPanel>
  return skill.source === 'global' ? <SkillUpdate api={api} resourceId={id} onUpdated={async () => { await reload(true); await onUpdated() }} popover>{detail}</SkillUpdate> : detail()
}

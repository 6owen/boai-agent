/*
 * [INPUT]: 商店能力/查询 IPC、缓存状态、统一技能导航插槽、共享 Card 与现有右侧详情导航。
 * [OUTPUT]: 商城说明图标悬停 600ms 后展示提示； 同页技能导航下的商店来源 Tabs、搜索工具栏、排序 Tabs 与说明 tooltip；紧凑列表/显式选中状态；来源与正文复用项目卡片；分提供商筛选、分页、local 身份对应的本地安装状态、详情刷新和固定 ~/.agents/skills 的包预览入口；迟到响应不覆盖当前查询。
 * [POS]: library 的技能商店视图，详情复用 Shell 的标签容器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { skillMarketplaces, type SkillMarketplaceProvider, type SkillMarketplaceSort, type SkillMarketplaceListResult, type SkillMarketplaceListRequest, type SkillMarketplaceItem, type MarketplaceResult } from '@shared/domain/skill-marketplace'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Banner, errorText, Loading } from '@/components/common'
import { ShieldCheck, Search, RefreshCw, InfoIcon } from '@/components/icons'
import { SkillImportDialog } from './skill-import-dialog'
import { useSkillInstallations } from './use-skill-installations'
import { SkillMarkdown } from './skill-markdown'

const providers = Object.keys(skillMarketplaces) as SkillMarketplaceProvider[]
export function SkillMarketplaceView({ api, onSelect, provider: controlledProvider, onProviderChange, compact = false, selectedId, navigation }: { api: DesktopApi; onSelect: (item: SkillMarketplaceItem) => void; provider?: SkillMarketplaceProvider; onProviderChange?: (provider: SkillMarketplaceProvider) => void; compact?: boolean; selectedId?: string; navigation?: ReactNode }) {
  const installed = useSkillInstallations(api)
  const [chosenProvider, setProvider] = useState<SkillMarketplaceProvider>('skills-sh')
  const provider = controlledProvider ?? chosenProvider
  const [filters, setFilters] = useState<Record<SkillMarketplaceProvider, { query: string; sort: SkillMarketplaceSort }>>({ 'skills-sh': { query: '', sort: 'all-time' }, clawhub: { query: '', sort: 'recommended' }, skillhub: { query: '', sort: 'recommended' } })
  const [result, setResult] = useState<MarketplaceResult<SkillMarketplaceListResult> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const generation = useRef(0), capability = skillMarketplaces[provider], { query, sort } = filters[provider]
  const base: SkillMarketplaceListRequest = { provider, query: query.trim(), sort, limit: 30 }
  const change = (patch: Partial<typeof filters['skills-sh']>) => setFilters(values => ({ ...values, [provider]: { ...values[provider], ...patch } }))
  useEffect(() => {
    const request = ++generation.current
    setResult(null); setError(''); setBusy(true)
    if (query.trim() && query.trim().length < capability.minQueryLength) {
      setBusy(false); setError(`请输入至少 ${capability.minQueryLength} 个字符`)
      return
    }
    const timer = setTimeout(() => {
      api.request('listSkillMarketplace', { provider, query: query.trim(), sort, limit: 30 }).then(value => {
        if (request === generation.current) setResult(value)
      }, error => { if (request === generation.current) setError(errorText(error)) }).finally(() => { if (request === generation.current) setBusy(false) })
    }, query ? 300 : 0)
    return () => { clearTimeout(timer); generation.current++ }
  }, [api, provider, query, sort, revision, capability.minQueryLength])
  const more = async () => {
    if (!result || busy) return
    const request = generation.current
    setBusy(true); setError('')
    try {
      const next = await api.request('listSkillMarketplace', { ...base, page: result.value.nextPage, cursor: result.value.nextCursor })
      if (request === generation.current) setResult(previous => ({ ...next, value: { ...next.value, items: [...new Map([...(previous?.value.items ?? []), ...next.value.items].map(item => [`${item.provider}:${item.id}`, item])).values()] } }))
    } catch (error) { if (request === generation.current) setError(errorText(error)) }
    finally { if (request === generation.current) setBusy(false) }
  }
  const refresh = async () => {
    setBusy(true); setError('')
    try { await api.request('refreshSkillMarketplace', { provider }); setRevision(value => value + 1) }
    catch (error) { setError(errorText(error)); setBusy(false) }
  }
  const description = `${query.trim() ? '搜索由提供方返回单批结果。' : capability.sortScope === 'page' ? '下载量与更新时间仅排序当前返回页，不代表全站排名。' : '榜单和排序来自提供方。'} 提供方标记不代表本应用验证过技能执行安全性。`
  const info = <Tooltip><TooltipTrigger delay={600} render={<Button variant="ghost" size="icon-sm" aria-label={`${capability.label} 商店说明`} />}><InfoIcon /></TooltipTrigger><TooltipContent side="right" className="max-w-[280px]"><span>{description}{result && <span className="block mt-2">已显示 {result.value.items.length} 项{result.value.total === undefined ? '' : ` · 提供方返回 ${result.value.total} 项`} · 更新于 {new Date(result.fetchedAt).toLocaleTimeString('zh-CN')}</span>}</span></TooltipContent></Tooltip>
  const providerTabs = <Tabs className={compact ? 'skills-browser-tabs' : undefined} value={provider} onValueChange={value => { if (onProviderChange) onProviderChange(value as SkillMarketplaceProvider); else setProvider(value as SkillMarketplaceProvider) }}><TabsList aria-label="技能商店来源">{providers.map(id => <TabsTrigger key={id} value={id}>{skillMarketplaces[id].label}</TabsTrigger>)}</TabsList></Tabs>
  return <section className={`skill-marketplace${compact ? ' compact-marketplace conversation-list-panel skills-list-panel' : ''}`} aria-label="技能商店">
    {navigation}
    {!compact && !controlledProvider && providerTabs}
    {compact ? <><header className="skills-browser-header">{providerTabs}{info}</header><div className="skills-search-toolbar"><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={`搜索 ${capability.label}`} placeholder="搜索技能" value={query} onChange={event => change({ query: event.target.value })} /></InputGroup><div className="skills-search-actions"><Button variant="ghost" size="icon-sm" aria-label="刷新商店" title="刷新商店" disabled={busy} onClick={() => { void refresh() }}><RefreshCw /></Button></div></div></> : <div className="library-filters">{info}<Input aria-label={`搜索 ${capability.label}`} placeholder={`搜索 ${capability.label} 的技能`} value={query} onChange={event => change({ query: event.target.value })} /><Button variant="secondary" disabled={busy} onClick={() => { void refresh() }}>刷新</Button></div>}
    <Tabs className="skill-marketplace-sort" value={sort} onValueChange={value => change({ sort: value as SkillMarketplaceSort })}><TabsList aria-label="商店排序">{capability.sorts.map(option => <TabsTrigger key={option.value} value={option.value} disabled={!!query.trim()}>{option.label}</TabsTrigger>)}</TabsList></Tabs>
    <div className={compact ? 'conversation-list skills-list-scroll skills-browser-list' : undefined}>

    {(error || installed.error) && <Banner>{error || installed.error}</Banner>}{result?.stale && <Banner kind="notice">暂时无法更新，正在显示 {new Date(result.fetchedAt).toLocaleString('zh-CN')} 的缓存。{result.error}</Banner>}
    {busy && <Loading>{result ? '正在载入更多技能…' : '正在读取商店…'}</Loading>}
    {!result && error && !busy && <Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重试</Button>}
    {result && <><div className={compact ? 'skill-marketplace-list' : 'library-grid'}>{result.value.items.map(item => {
      const isInstalled = installed.installations.some(value => value.resourceId.startsWith('local:') && value.source.kind === 'marketplace' && value.source.provider === item.provider && value.source.providerItemId === item.id)
      const usage = item.downloads !== undefined ? `下载 ${item.downloads.toLocaleString()}` : item.installs !== undefined ? `安装 ${item.installs.toLocaleString()}` : '使用量未知'
      return <Button variant={compact ? 'ghost' : 'surface'} size="content" className={`${compact ? 'conversation-item skill-marketplace-row' : 'library-card'}${selectedId === item.id ? ' selected' : ''}`} aria-pressed={selectedId === item.id} key={item.id} onClick={() => onSelect(item)}><span className={compact ? 'skill-list-icon' : 'resource-type-icon'}><ShieldCheck size={compact ? 16 : 21} /></span>{compact ? <span className="conversation-copy"><strong className="conversation-title"><span>{item.name}</span>{isInstalled && <small>已安装</small>}</strong><small className="conversation-preview">{item.owner ?? item.source ?? '作者未知'} · {item.description ?? '查看来源与说明'}</small></span> : <span><strong>{item.name}</strong><small>{item.owner ?? item.source ?? '提供方未标明作者'}</small><small>{item.description ?? '打开详情查看来源与说明'}</small><span className="pill">{usage}{item.verified === true ? ' · 提供方认证标记' : ''}</span>{isInstalled && <small>已安装</small>}</span>}</Button>
    })}</div>{!result.value.items.length && !busy && <div className={compact ? 'skills-list-empty' : 'empty-note'}><p>未找到匹配技能</p></div>}{result.value.hasMore && <Button variant="secondary" disabled={busy} onClick={() => { void more() }}>{error ? '重试加载更多' : '加载更多'}</Button>}</>}
    </div>
  </section>
}

export function SkillMarketplaceDetail({ api, provider, id, refresh, onResource }: { api: DesktopApi; provider: SkillMarketplaceProvider; id: string; refresh: () => Promise<void>; onResource: (id: string) => void }) {
  const [importing, setImporting] = useState(false)
  const installed = useSkillInstallations(api)
  const [result, setResult] = useState<MarketplaceResult<SkillMarketplaceItem> | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    let alive = true
    setResult(null); setError('')
    api.request('getSkillMarketplaceDetail', { provider, id }).then(value => { if (alive) setResult(value) }, error => { if (alive) setError(errorText(error)) })
    return () => { alive = false }
  }, [api, provider, id, revision])
  if (error) return <div className="detail-section"><Banner>{error}</Banner><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重试详情</Button></div>
  if (!result) return <Loading>正在读取技能详情…</Loading>
  const item = result.value
  const copies = installed.installations.filter(value => value.resourceId.startsWith('local:') && value.source.kind === 'marketplace' && value.source.provider === provider && value.source.providerItemId === item.id)
  return <div className="detail-section"><span className="pill">{skillMarketplaces[provider].label}</span><h2>{item.name}</h2><p>{item.description ?? '提供方未提供说明'}</p><p className="field-hint">{item.owner ?? '作者未知'}{item.version ? ` · ${item.version}` : ''}</p>{result.stale && <Banner kind="notice">当前为 {new Date(result.fetchedAt).toLocaleString('zh-CN')} 的缓存，刷新失败：{result.error}</Banner>}
    <Button disabled={!item.install || result.stale} onClick={() => setImporting(true)}>安装到本地</Button><Button variant="ghost" onClick={() => { void api.request('refreshSkillMarketplace', { provider }).then(() => setRevision(value => value + 1), error => setError(errorText(error))) }}>刷新详情</Button><p className="field-hint">{!item.install ? '提供方未给出支持的下载来源。' : result.stale ? '请刷新详情后再安装。' : '安装前将重新获取来源并展示实际包内容。'}安装位置：~/.agents/skills。</p>{installed.error && <Banner>{installed.error}</Banner>}{copies.map(copy => <Button key={copy.resourceId} variant="secondary" onClick={() => onResource(copy.resourceId)}>查看本地技能 · {item.name}</Button>)}
    <div className="skill-info-section-heading"><h3>来源</h3></div><Card className="gap-0 p-4"><CardContent className="p-0"><p className="resource-path">{item.homepage}</p>{item.repository && <p className="resource-path">{item.repository}</p>}
    <p>下载：{item.downloads?.toLocaleString() ?? '未知'} · 安装：{item.installs?.toLocaleString() ?? '未知'} · 星标：{item.stars?.toLocaleString() ?? '未知'}</p>
    <p className="field-hint">{item.verified === true ? '提供方带有认证标记。' : item.verified === false ? '提供方未标记认证。' : '提供方未返回认证信息。'}{item.suspicious === true ? '提供方已标记风险。' : item.suspicious === false ? '提供方未标记可疑。' : '风险状态未知。'}这些标记不是本应用的安全验证。</p>
    {item.securityReports?.map(report => <p className="field-hint" key={report.provider}>{report.provider}：{report.statusText ?? report.status}</p>)}
    </CardContent></Card>
    {importing && <SkillImportDialog api={api} initialSource={{ kind: 'marketplace', provider, source: item.id }} onClose={() => setImporting(false)} onInstalled={refresh} onResource={onResource} />}
    <div className="skill-info-section-heading"><h3>技能说明</h3></div><Card className="skill-document-card gap-0 p-4"><CardContent className="p-0">{item.content ? <SkillMarkdown content={item.content} /> : <p className="field-hint">提供方未提供正文，安装前需要检查实际技能包。</p>}</CardContent></Card>
  </div>
}

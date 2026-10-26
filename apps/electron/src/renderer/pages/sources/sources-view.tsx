/*
 * [OUTPUT]: 名称后同行显示真实测试/停用状态，每行独立测试及启停/删除操作；删除Popover确认，操作不触发详情导航。
 * [INPUT]: 全局数据源目录、当前选择和Shell右侧面板导航。
 * [OUTPUT]: 数据源沿技能列表的行、图标与文案样式；选择只打开右侧详情，目录/筛选保持。
 * [POS]: 资源库主目录，不持有配置编辑器或详情状态。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { DATA_SOURCE_LABELS, type DataSource, type DataSourceConfig } from '@boai/shared/domain/sources'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { CatalogSearch } from '@/components/common/catalog-search'
import { useMutation } from '@/components/common'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover'
import { Database, FolderOpen, Terminal, MessageCircle, MoreHorizontal, RefreshCw, Trash2 } from '@/components/icons'

export function SourceIcon({ type }: { type: DataSourceConfig['type'] }) { const Icon = type === 'local' ? FolderOpen : type === 'mcp' ? Terminal : Database; return <Icon /> }
export function sourceLocation(source: DataSource) { return source.type === 'api' ? source.api.baseUrl : source.type === 'local' ? source.local.path : source.mcp.transport === 'stdio' ? source.mcp.command : source.mcp.url }
type SourceActions = { api: DesktopApi; onChanged(source: DataSource): void; onRemoved(id: string): void }
export function SourcesView({ api, sources, selected, onSelect, onManage, onChanged, onRemoved }: SourceActions & { sources: DataSource[]; selected?: string; onSelect(source: DataSource): void; onManage(): void }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all')
  const visible = sources.filter(item => (filter === 'all' || item.type === filter) && `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="sources-view" aria-label="数据源管理">
    <header className="custom-content-heading"><h1>数据源</h1><Button variant="secondary" size="sm" onClick={onManage}><MessageCircle />AI 管理</Button></header>
    <div className="custom-catalog-toolbar source-catalog-toolbar"><Tabs value={filter} onValueChange={value => setFilter(String(value))}><TabsList aria-label="数据源类型">{[{ value: 'all', label: '全部' }, ...Object.entries(DATA_SOURCE_LABELS).map(([value, label]) => ({ value, label }))].map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}</TabsList></Tabs><div className="custom-catalog-search"><CatalogSearch label="搜索数据源" value={query} onChange={setQuery} placeholder="搜索数据源" /></div></div>
    {visible.length ? <div className="conversation-list skills-list-scroll skills-browser-list source-catalog" role="navigation" aria-label="数据源列表"><div className="skill-list-content">{visible.map(item => <SourceRow key={item.id} api={api} source={item} selected={selected === item.id} onSelect={onSelect} onChanged={onChanged} onRemoved={onRemoved} />)}</div></div> : <IllustratedEmpty kind="skills" title={query ? '没有匹配的数据源' : undefined} />}
  </section>
}

function SourceRow({ api, source, selected, onSelect, onChanged, onRemoved }: SourceActions & { source: DataSource; selected: boolean; onSelect(source: DataSource): void }) {
  const mutation = useMutation(), menuAnchor = useRef<HTMLButtonElement>(null)
  const [testing, setTesting] = useState(false), [removing, setRemoving] = useState(false)
  const identity = { id: source.id, expectedRevision: source.revision }
  const status = testing ? 'testing' : !source.enabled ? 'disabled' : source.test?.status ?? 'untested'
  const statusLabel = { testing: '测试中', disabled: '已停用', success: '连接正常', failed: '连接失败', untested: '未测试' }[status]
  const test = () => { void mutation.run(async () => {
    setTesting(true)
    try { onChanged(await api.request('testDataSource', identity)) } finally { setTesting(false) }
  }) }
  const toggle = () => { void mutation.run(async () => {
    const { id, revision, createdAt: _created, updatedAt: _updated, hasCredential: _credential, test: _test, creationSource: _creation, ...config } = source
    onChanged(await api.request('saveDataSource', { id, expectedRevision: revision, config: { ...config, enabled: !source.enabled } }))
  }) }
  return <div className={`skill-list-row source-catalog-row${selected ? ' selected' : ''}`}>
    <Button variant="ghost" size="content" className="conversation-item skill-list-select" aria-pressed={selected} onClick={() => onSelect(source)}>
      <span className="skill-list-icon"><SourceIcon type={source.type} /></span>
      <span className="conversation-copy"><span className="source-row-title"><strong className="conversation-title" title={source.name}>{source.name}</strong><span className="source-row-status" data-status={status} role="status" title={source.enabled && !testing ? source.test?.message : undefined}>{statusLabel}</span></span><small className="conversation-preview"><span className="skill-source-badge">{DATA_SOURCE_LABELS[source.type]}</span>{source.description || sourceLocation(source)}</small></span>
    </Button>
    <div className="source-row-actions">
      <Button variant="ghost" size="icon-sm" disabled={mutation.busy || !source.enabled} aria-label={`测试连接 ${source.name}`} title={source.enabled ? '测试连接' : '请先启用数据源'} onClick={test}><RefreshCw className={testing ? 'spinner' : ''} /></Button>
      <DropdownMenu><DropdownMenuTrigger render={<Button ref={menuAnchor} variant="ghost" size="icon-sm" aria-label={`数据源操作 ${source.name}`} title="更多操作" disabled={mutation.busy} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" finalFocus={removing ? false : undefined}>
        <DropdownMenuItem onClick={toggle}>{source.enabled ? '停用数据源' : '启用数据源'}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}><Trash2 />删除数据源</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      <Popover open={removing} onOpenChange={open => { if (!mutation.busy) setRemoving(open) }}><PopoverContent anchor={menuAnchor} align="end" finalFocus={menuAnchor}>
        <PopoverTitle className="break-words">删除“{source.name}”？</PopoverTitle>
        <div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={mutation.busy} onClick={() => setRemoving(false)}>取消</Button><Button variant="destructive" size="sm" disabled={mutation.busy} onClick={() => { void mutation.run(async () => { await api.request('removeDataSource', identity); setRemoving(false); onRemoved(source.id) }) }}>{mutation.busy ? '正在删除…' : '确认删除'}</Button></div>
      </PopoverContent></Popover>
    </div>
  </div>
}

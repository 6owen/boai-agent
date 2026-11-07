/*
 * [INPUT]: Shared service presets, the existing Source projection and original application operations.
 * [OUTPUT]: Searchable application directory, explicit configuration and same-Source management with recoverable creation.
 * [POS]: Resource library; browsing never connects services, executes commands or grants employee access.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ApplicationRequest } from '@boai/shared/domain/application-protocol'
import type { DataSource, DataSourceConfig } from '@boai/shared/domain/sources'
import { APPLICATION_PRESETS, applicationConnections, applicationSourceDefaults, customSourceDefaults, type ApplicationOrigin, type ApplicationPreset } from '@boai/shared/domain/resource-catalog'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CatalogSearch } from '@/components/common/catalog-search'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { Plus, Plug, ChevronRight, ArrowLeft } from '@/components/icons'
import { SourceConfigurationDialog } from '../sources/source-editor'
import { SourceIcon } from '../sources/sources-view'
import { PENDING_SOURCE_CREATION_KEY, recoverSourceCreation } from './source-creation-request'

function pendingSourceCreation() { try { return localStorage.getItem(PENDING_SOURCE_CREATION_KEY) } catch { return null } }
type Creation = { config: DataSourceConfig; origin?: ApplicationOrigin }
export function ApplicationsView({ api, sources, onOpenSource, onChanged }: { api: DesktopApi; sources: DataSource[]; onOpenSource(source: DataSource): void; onChanged(source: DataSource): void }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<ApplicationPreset | null>(null), [creation, setCreation] = useState<Creation | null>(null)
  const [recovering, setRecovering] = useState(false)
  const visible = APPLICATION_PRESETS.filter(item => (filter === 'all' || item.category === filter) && `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const connections = selected ? applicationConnections(selected.id, sources) : []
  const start = (value: Creation) => { setSelected(null); setCreation(value) }
  const pending = pendingSourceCreation()
  return <section className="sources-view" aria-label="应用目录">
    <header className="custom-content-heading"><h1>应用</h1><div className="button-row">
      {pending && <Button variant="secondary" size="sm" onClick={() => setRecovering(true)}>核对连接创建</Button>}
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}><Plus />添加自定义项</DropdownMenuTrigger><DropdownMenuContent align="end">
        {(['api', 'mcp', 'local'] as const).map(type => <DropdownMenuItem key={type} onClick={() => start({ config: customSourceDefaults(type) })}>{type === 'api' ? 'API' : type === 'mcp' ? 'MCP' : '本地文件夹'}</DropdownMenuItem>)}
      </DropdownMenuContent></DropdownMenu>
    </div></header>
    <div className="custom-catalog-toolbar source-catalog-toolbar"><Tabs value={filter} onValueChange={value => setFilter(String(value))}><TabsList aria-label="应用分类"><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="development">开发</TabsTrigger></TabsList></Tabs><div className="custom-catalog-search"><CatalogSearch label="搜索应用" value={query} onChange={setQuery} placeholder="搜索应用" /></div></div>
    {visible.length ? <div className="conversation-list skills-list-scroll skills-browser-list source-catalog" aria-label="应用列表"><div className="skill-list-content">{visible.map(item => <div key={item.id} className="skill-list-row source-catalog-row"><Button variant="ghost" size="content" className="conversation-item skill-list-select" onClick={() => setSelected(item)}><span className="skill-list-icon"><Plug /></span><span className="conversation-copy"><strong className="conversation-title">{item.name}</strong><small className="conversation-preview">{item.description}</small></span><ChevronRight /></Button></div>)}</div></div> : <IllustratedEmpty kind="skills" title="没有匹配的应用" />}
    {selected && <Dialog open onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className="max-h-[calc(100dvh-32px)] overflow-y-auto sm:max-w-[620px]">
      <DialogTitle>{selected.name}</DialogTitle>
      <div className="space-y-5"><p className="text-muted-foreground text-sm">{selected.access}</p><a href={selected.documentationUrl} target="_blank" rel="noreferrer" className="text-sm underline">官方文档</a>
        {connections.length > 0 && <div className="space-y-2"><h3 className="text-sm font-medium">管理连接</h3>{connections.map(source => <Button key={source.id} variant="secondary" size="sm" className="w-full justify-start" onClick={() => { setSelected(null); onOpenSource(source) }}><SourceIcon type={source.type} /><span className="min-w-0 flex-1 truncate text-left">{source.name}</span><ChevronRight /></Button>)}</div>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setSelected(null)}><ArrowLeft />返回</Button>{selected.oauth && <Button variant="secondary" size="sm" onClick={() => start({ config: { name: selected.name, description: selected.description, guide: '按实际获准的工具目录和账号权限使用。', enabled: false, type: 'mcp', mcp: { transport: 'http', url: selected.oauth!.url, authType: 'oauth' } }, origin: { applicationId: selected.id, version: selected.version } })}>连接 MCP</Button>}<Button size="sm" onClick={() => start({ config: applicationSourceDefaults(selected.id), origin: { applicationId: selected.id, version: selected.version } })}>连接{selected.id === 'vercel' ? ' API' : ''}</Button></div>
      </div>
    </DialogContent></Dialog>}
    {creation && <CreateSourceDialog api={api} creation={creation} onClose={() => setCreation(null)} onSaved={source => { onChanged(source); toast.success('连接配置已保存'); onOpenSource(source) }} />}
    {recovering && <CreateSourceDialog api={api} creation={{ config: customSourceDefaults('api') }} onClose={() => setRecovering(false)} onSaved={source => { onChanged(source); onOpenSource(source) }} />}
  </section>
}
function CreateSourceDialog({ api, creation, onClose, onSaved }: { api: DesktopApi; creation: Creation; onClose(): void; onSaved(source: DataSource): void }) {
  const pending = useRef<ApplicationRequest | undefined>(undefined)
  const [requestId, setRequestId] = useState<string | null>(pendingSourceCreation)
  const save = async (config: DataSourceConfig, credential: string) => {
    const id = requestId ?? crypto.randomUUID()
    if (!requestId) {
      pending.current = { requestId: id, operation: 'sources.create', input: { config, ...(credential ? { credential } : {}), ...(creation.origin ? { applicationOrigin: creation.origin } : {}) } }
      // Only the request identity persists: secret input remains in this dialog's memory.
      localStorage.setItem(PENDING_SOURCE_CREATION_KEY, id); setRequestId(id)
    }
    const result = await recoverSourceCreation(api, id, pending.current)
    if (result.status === 'rejected') { localStorage.removeItem(PENDING_SOURCE_CREATION_KEY); pending.current = undefined; setRequestId(null) }
    if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '连接创建结果尚未确认，请核对原请求。')
    const source = result.data as DataSource
    if (!source?.id || typeof source.revision !== 'number') throw new Error('创建回执缺少连接身份，请核对原请求。')
    localStorage.removeItem(PENDING_SOURCE_CREATION_KEY)
    pending.current = undefined
    return source
  }
  return <SourceConfigurationDialog api={api} creating initialConfig={creation.config} locked={Boolean(requestId)} confirmLabel={requestId ? '核对创建结果' : '保存连接'} onSave={save} onClose={onClose} onSaved={onSaved} />
}

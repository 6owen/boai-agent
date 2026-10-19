/*
 * [OUTPUT]: 首选检索方式与绑定共用员工草稿；核心可选全局搜索候选，失效首选明确显示，不连接服务。
 * [OUTPUT]: 已绑定数据源以普通行展示，纯文字更多菜单支持详情和经Popover确认的移除；标题添加菜单支持重新绑定，只修改员工草稿。
 * [OUTPUT]: 核心员工显示全部启用源读写且不请求绑定目录；普通员工保留明确选择。
 * [OUTPUT]: 空态入口名称与全局资源库一致。
 * [INPUT]: Employee draft source IDs and public source catalog.
 * [OUTPUT]: Explicit source selection saved by the existing employee editor.
 * [POS]: Employee resource picker; does not independently modify grants.
 * [PROTOCOL]: 变化同步 Header 与 .folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { DATA_SOURCE_LABELS, webSearchProvider, webSearchPreferenceLabel, type WebSearchPreference, type DataSource } from '@shared/domain/sources'
import { Banner, errorText, Field } from '@/components/common'
import { SelectField } from '@/components/ui/select-field'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from '@/components/ui/popover'
import { MoreHorizontal } from '@/components/icons'
export function SourcePicker({ api, ids, onChange, disabled, active, allSources = false, showLabel = true, onOpen, renderSection, searchPreference, onSearchPreferenceChange }: { api: DesktopApi; ids: string[]; onChange(ids: string[]): void; disabled: boolean; active: boolean; allSources?: boolean; showLabel?: boolean; onOpen?(source: DataSource): void; renderSection?(content: ReactNode, actions?: ReactNode): ReactNode; searchPreference?: WebSearchPreference; onSearchPreferenceChange?(value: WebSearchPreference): void }) {
  const [sources, setSources] = useState<DataSource[]>([]), [error, setError] = useState('')
  const showPreference = !!onSearchPreferenceChange
  useEffect(() => {
    if (!active || allSources && !showPreference) return
    let live = true, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request
      try { const value = await api.request('listDataSources', undefined); if (live && token === request) { setSources(value); setError('') } }
      catch (reason) { if (live && token === request) setError(errorText(reason)) }
    }
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'changed' && !event.conversationId) { request++; timer ??= setTimeout(() => { timer = undefined; void load() }, 120) }
    })
    void load()
    return () => { live = false; request++; clearTimeout(timer); unsubscribe() }
  }, [api, active, allSources, showPreference])
  const candidates = sources.filter(source => source.enabled && webSearchProvider(source) && (allSources || ids.includes(source.id)))
  const preference = searchPreference ?? { mode: 'auto' }
  const preferenceValue = preference.mode === 'source' ? preference.sourceId : preference.mode
  const options = [{ value: 'auto', label: '自动' }, { value: 'browser', label: 'BOAI 浏览器' }, ...candidates.map(source => ({ value: source.id, label: source.name })), ...(preference.mode === 'source' && !candidates.some(source => source.id === preference.sourceId) ? [{ value: preference.sourceId, label: webSearchPreferenceLabel(preference, sources), disabled: true }] : [])]
  const preferenceField = showPreference && <Field label="首选检索方式" full hint="本轮指定的来源优先；搜索源将在使用时核验连接与工具。"><SelectField value={preferenceValue} disabled={disabled || !active} options={options} onValueChange={value => onSearchPreferenceChange?.(value === 'auto' || value === 'browser' ? { mode: value } : { mode: 'source', sourceId: value })} /></Field>
  const label = <span className={showLabel ? 'field-label' : 'sr-only'}>可访问的数据源</span>
  if (allSources) {
    const content = <><div className="field full">{label}{error && <Banner>{error}</Banner>}<p className="field-hint">可读写全部已启用的数据源，无需单独绑定。</p></div>{preferenceField}</>
    return renderSection ? renderSection(content) : content
  }
  const availableSources = sources.filter(source => !ids.includes(source.id))
  const boundSources = sources.filter(source => ids.includes(source.id))
  const actions = <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="secondary" size="sm" disabled={disabled || !active || !availableSources.length} />}>添加数据源</DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuGroup>{availableSources.map(source => <DropdownMenuItem key={source.id} disabled={disabled || !active} onClick={() => onChange([...new Set([...ids, source.id])])}>{source.name}{!source.enabled ? '（已停用）' : ''}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent>
  </DropdownMenu>
  const content = boundSources.length > 0 || !sources.length || error ? <div className="field full">{label}{error && <Banner>{error}</Banner>}
    <div className="resource-picker">{boundSources.map(source => <SourceRow key={source.id} source={source} disabled={disabled || !active} active={active} onOpen={onOpen} onRemove={() => onChange(ids.filter(id => id !== source.id))} />)}</div>
    {!sources.length && !error && <p className="field-hint">在“资源库 → 数据源”中添加 API、MCP 或本地文件夹。</p>}
  </div> : null
  return renderSection ? renderSection(<>{content}{preferenceField}</>, actions) : <>{actions}{content}{preferenceField}</>
}

function SourceRow({ source, disabled, active, onOpen, onRemove }: {
  source: DataSource; disabled: boolean; active: boolean; onOpen?(source: DataSource): void; onRemove(): void
}) {
  const [removing, setRemoving] = useState(false)
  const menuAnchor = useRef<HTMLButtonElement>(null)
  return <div className="flex min-w-0 items-center gap-1">
    <div className="resource-option min-w-0 flex-1 cursor-default"><span><strong>{source.name}{!source.enabled ? '（已停用）' : ''}</strong><small>{DATA_SOURCE_LABELS[source.type]}{source.description ? ` · ${source.description}` : ''}</small></span></div>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button ref={menuAnchor} type="button" variant="ghost" size="icon-xs" disabled={disabled} aria-label={`数据源操作 ${source.name}`} title="更多操作" />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" finalFocus={removing ? false : undefined}><DropdownMenuGroup>
        {onOpen && <DropdownMenuItem disabled={disabled} onClick={() => onOpen(source)}>打开详情</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" disabled={disabled} onClick={() => setRemoving(true)}>移除</DropdownMenuItem>
      </DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>
    <Popover open={removing && active} onOpenChange={setRemoving}>
      <PopoverContent anchor={menuAnchor} align="end" finalFocus={menuAnchor}>
        <PopoverTitle className="break-words">移除“{source.name}”？</PopoverTitle>
        <PopoverDescription>保存员工配置后生效。</PopoverDescription>
        <div className="button-row justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={() => setRemoving(false)}>取消</Button>
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => { setRemoving(false); onRemove() }}>确认移除</Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
}

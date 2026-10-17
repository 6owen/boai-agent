/*
 * [OUTPUT]: 数据源右侧使用更多操作下拉菜单，打开详情不切换勾选；外部分区标题与原选择协议保持。
 * [OUTPUT]: 核心员工显示全部启用源读写且不请求绑定目录；普通员工保留明确选择。
 * [OUTPUT]: 空态入口名称与全局资源库一致。
 * [INPUT]: Employee draft source IDs and public source catalog.
 * [OUTPUT]: Explicit source selection saved by the existing employee editor.
 * [POS]: Employee resource picker; does not independently modify grants.
 * [PROTOCOL]: 变化同步 Header 与 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { DATA_SOURCE_LABELS, type DataSource } from '@shared/domain/sources'
import { Banner, errorText } from '@/components/common'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowRight, MoreHorizontal } from '@/components/icons'
export function SourcePicker({ api, ids, onChange, disabled, active, allSources = false, showLabel = true, onOpen }: { api: DesktopApi; ids: string[]; onChange(ids: string[]): void; disabled: boolean; active: boolean; allSources?: boolean; showLabel?: boolean; onOpen?(source: DataSource): void }) {
  const [sources, setSources] = useState<DataSource[]>([]), [error, setError] = useState('')
  useEffect(() => { if (!active || allSources) return; let current = true; api.request('listDataSources', undefined).then(value => { if (current) { setSources(value); setError('') } }, reason => { if (current) setError(errorText(reason)) }); return () => { current = false } }, [api, active, allSources])
  const label = <span className={showLabel ? 'field-label' : 'sr-only'}>可访问的数据源</span>
  if (allSources) return <div className="field full">{label}<p className="field-hint">可读写全部已启用的数据源，无需单独绑定。</p></div>
  return <div className="field full">{label}{error && <Banner>{error}</Banner>}
    <div className="resource-picker">{sources.map(source => <div className="flex min-w-0 items-center gap-1" key={source.id}>
      <label className="resource-option min-w-0 flex-1"><Checkbox disabled={disabled} checked={ids.includes(source.id)} onCheckedChange={checked => onChange(checked ? [...ids, source.id] : ids.filter(id => id !== source.id))} /><span><strong>{source.name}{!source.enabled ? '（已停用）' : ''}</strong><small>{DATA_SOURCE_LABELS[source.type]}{source.description ? ` · ${source.description}` : ''}</small></span></label>
      {onOpen && <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" disabled={disabled} aria-label={`数据源操作 ${source.name}`} title="更多操作" />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onOpen(source)}><ArrowRight />打开详情</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>}
    </div>)}</div>
    {!sources.length && !error && <p className="field-hint">在“资源库 → 数据源”中添加 API、MCP 或本地文件夹。</p>}
  </div>
}

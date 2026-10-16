/*
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
export function SourcePicker({ api, ids, onChange, disabled, active, allSources = false }: { api: DesktopApi; ids: string[]; onChange(ids: string[]): void; disabled: boolean; active: boolean; allSources?: boolean }) {
  const [sources, setSources] = useState<DataSource[]>([]), [error, setError] = useState('')
  useEffect(() => { if (!active || allSources) return; let current = true; api.request('listDataSources', undefined).then(value => { if (current) { setSources(value); setError('') } }, reason => { if (current) setError(errorText(reason)) }); return () => { current = false } }, [api, active, allSources])
  if (allSources) return <div className="field full"><span className="field-label">可访问的数据源</span><p className="field-hint">可读写全部已启用的数据源，无需单独绑定。</p></div>
  return <div className="field full"><span className="field-label">可访问的数据源</span>{error && <Banner>{error}</Banner>}<div className="resource-picker">{sources.map(source => <label className="resource-option" key={source.id}><Checkbox disabled={disabled} checked={ids.includes(source.id)} onCheckedChange={checked => onChange(checked ? [...ids, source.id] : ids.filter(id => id !== source.id))} /><span><strong>{source.name}{!source.enabled ? '（已停用）' : ''}</strong><small>{DATA_SOURCE_LABELS[source.type]}{source.description ? ` · ${source.description}` : ''}</small></span></label>)}</div>{!sources.length && !error && <p className="field-hint">在“资源库 → 数据源”中添加 API、MCP 或本地文件夹。</p>}</div>
}

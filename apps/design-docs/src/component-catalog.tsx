/*
 * [INPUT]: 白名单组件元数据。
 * [OUTPUT]: 全量组件名称/能力检索、类型标签和独立锚点。
 * [POS]: Design组件总览。
 * [PROTOCOL]: 修改时同步Header与所属.folder.md。
 */
import { useState } from 'react'
import { Input } from '@boai/ui/input'
import { Badge } from '@boai/ui/badge'
import content from 'virtual:boai-design-content'
export function ComponentCatalog() {
 const [query,setQuery] = useState('')
 const items=content.components.filter(item => `${item.name} ${item.import} ${item.exports.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
 return <section className="component-catalog" aria-label="全部组件"><Input aria-label="搜索组件" placeholder="搜索组件名或导出，例如 Switch、Composer…" value={query} onChange={event => setQuery(event.target.value)} /><p className="example-hint">{items.length} / {content.components.length} 个公开入口</p><div className="component-catalog-list">{items.map(item => <a href={`/${item.slug}#api-${item.import.split('/').pop()}`} key={item.import}><strong>{item.name}</strong><code>{item.import}</code>{item.status === 'compatibility' && <Badge variant="secondary">兼容</Badge>}</a>)}</div>{!items.length && <p role="status">没有匹配的组件。</p>}</section>
}

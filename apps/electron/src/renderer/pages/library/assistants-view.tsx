/*
 * [INPUT]: Stable shared assistant templates, current resources and original employee creation flow.
 * [OUTPUT]: Search/category/details and editable ordinary employee creation; templates never carry private identity.
 * [POS]: Resource-library assistant directory; no alternate employee, memory or task lifecycle.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { useState } from 'react'
import type { Conversation, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { ASSISTANT_TEMPLATES, resolveAssistantRequirements, type AssistantTemplate } from '@boai/shared/domain/resource-catalog'
import { CreateAgentDialog } from '@/components/employee/creation-dialogs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CatalogSearch } from '@/components/common/catalog-search'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { Contact, ChevronRight } from '@/components/icons'

const categories = [{ value: 'all', label: '全部' }, { value: 'general', label: '通用' }, { value: 'research', label: '研究' }, { value: 'writing', label: '写作' }, { value: 'review', label: '审核' }]
export function AssistantsView({ api, snapshot, onCreated }: { api: DesktopApi; snapshot: Snapshot; onCreated(conversation: Conversation): Promise<void> }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<AssistantTemplate | null>(null), [creating, setCreating] = useState<string | null>(null)
  const visible = ASSISTANT_TEMPLATES.filter(item => (filter === 'all' || item.category === filter) && `${item.name} ${item.role}`.toLowerCase().includes(query.trim().toLowerCase()))
  // Built-in roles have no required private dependencies. A future requirement cannot silently become usable.
  const requirements = resolveAssistantRequirements(selected?.requirements ?? [], { applicationIds: [], skillIds: [] })
  const blocked = requirements.some(item => item.required && !item.satisfied)
  return <section className="sources-view" aria-label="助手目录">
    <header className="custom-content-heading"><h1>助手</h1></header>
    <div className="custom-catalog-toolbar source-catalog-toolbar"><Tabs value={filter} onValueChange={value => setFilter(String(value))}><TabsList aria-label="助手分类">{categories.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}</TabsList></Tabs><div className="custom-catalog-search"><CatalogSearch label="搜索助手" value={query} onChange={setQuery} placeholder="搜索助手" /></div></div>
    {visible.length ? <div className="conversation-list skills-list-scroll skills-browser-list source-catalog" aria-label="助手列表"><div className="skill-list-content">{visible.map(item => <div key={item.id} className="skill-list-row source-catalog-row"><Button variant="ghost" size="content" className="conversation-item skill-list-select" onClick={() => setSelected(item)}><span className="skill-list-icon"><Contact /></span><span className="conversation-copy"><strong className="conversation-title">{item.name}</strong><small className="conversation-preview">{item.role}</small></span><ChevronRight /></Button></div>)}</div></div> : <IllustratedEmpty kind="skills" title="没有匹配的助手" />}
    {selected && <Dialog open onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className="max-h-[calc(100dvh-32px)] overflow-y-auto sm:max-w-[620px]"><DialogTitle>{selected.name}</DialogTitle>
      <div className="space-y-5"><p className="text-sm text-muted-foreground">{selected.role}</p><div className="space-y-2"><h3 className="text-sm font-medium">工作方式</h3><p className="whitespace-pre-wrap text-sm">{selected.instructions}</p></div>
        {requirements.length > 0 && <div className="space-y-2"><h3 className="text-sm font-medium">需要的能力</h3><ul className="space-y-1 text-sm">{requirements.map(item => <li key={`${item.kind}:${item.id}`}>{item.label} · {item.required ? '必需' : '可选'}</li>)}</ul></div>}
        <div className="flex justify-end"><Button size="sm" disabled={blocked} title={blocked ? '请先配置模板所需能力' : undefined} onClick={() => { setCreating(selected.id); setSelected(null) }}>使用此助手</Button></div>
      </div>
    </DialogContent></Dialog>}
    {creating && <CreateAgentDialog api={api} snapshot={snapshot} template={creating} onClose={() => setCreating(null)} onCreated={async conversation => { await onCreated(conversation); setCreating(null) }} />}
  </section>
}

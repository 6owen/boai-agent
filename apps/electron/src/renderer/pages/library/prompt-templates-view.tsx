/*
 * [OUTPUT]: 提示词保留分组拖拽；说明归Tooltip，分组管理最右，条目只提供悬停删除菜单并打开Shell详情。
 * [INPUT]: 全局提示词目录、稳定所见版本及资源库选择。
 * [OUTPUT]: 技能同款目录行、右侧新建/编辑导航与确认删除；目录不再持有正文Dialog。
 * [POS]: 资源库提示词管理，不执行提示词或修改员工人格。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { PromptTemplate } from '@boai/shared/domain/prompt-templates'
import { Banner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CatalogSearch } from '@/components/common/catalog-search'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { FileText, Plus, ChevronRight, InfoIcon } from '@/components/icons'
import { DragList, DragListItem, DragListGroupTarget } from '@/components/common/drag-list'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PromptActions } from './prompt-template-actions'
import { Skeleton } from '@/components/ui/skeleton'
import { CollectionGroups } from './skill-groups'
import { usePromptCollections } from './use-prompt-collections'

export function PromptTemplatesView({ api, prompts, loaded = true, onReload, selected, onOpen, onCreate, onRemoved }: {
  api: DesktopApi; prompts: PromptTemplate[]; loaded?: boolean; onReload?(): void; selected?: string
  onOpen(value: PromptTemplate): void; onCreate(): void; onRemoved(id: string): void
}) {
  const [query, setQuery] = useState('')
  const collection = usePromptCollections(api)
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem('boai.prompts.collapsed') ?? '[]'); return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [] } catch { return [] }
  })
  useEffect(() => { try { localStorage.setItem('boai.prompts.collapsed', JSON.stringify(collapsed)) } catch { /* Optional display preference. */ } }, [collapsed])
  useEffect(() => { if (collection.value) setCollapsed(ids => ids.filter(id => id === '' || collection.value!.groups.some(group => group.id === id))) }, [collection.value])
  const value = collection.value, byId = new Map(prompts.map(prompt => [prompt.id, prompt]))
  const ready = loaded && Boolean(value) && value!.promptIds.length === prompts.length && value!.promptIds.every(id => byId.has(id))
  const ordered = (value?.promptIds ?? []).flatMap(id => byId.has(id) ? [byId.get(id)!] : [])
  const visible = ordered.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const groups = [...(value?.groups ?? []), { id: '', name: '未分组' }].map(group => ({ ...group, entries: visible.filter(item => (value?.groupByPromptId[item.id] ?? '') === group.id), open: Boolean(query) || !collapsed.includes(group.id) })).filter(group => !query || group.entries.length)
  const counts = Object.fromEntries((value?.groups ?? []).map(group => [group.id, value!.promptIds.filter(id => value!.groupByPromptId[id] === group.id).length]))
  const ids = groups.flatMap(group => group.open ? group.entries.map(item => item.id) : [])
  return <section className="sources-view" aria-label="提示词管理">
    <header className="custom-content-heading"><h1 className="flex items-center gap-2">提示词<Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="提示词用法" />}><InfoIcon /></TooltipTrigger><TooltipContent>在输入框中使用 $ 引用，发送时展开为正文。</TooltipContent></Tooltip></h1><Button variant="secondary" size="sm" onClick={onCreate}><Plus />新建提示词</Button></header>
    <div className="custom-catalog-toolbar source-catalog-toolbar"><div className="custom-catalog-search"><CatalogSearch label="搜索提示词" value={query} onChange={setQuery} placeholder="搜索提示词" /><CollectionGroups groups={value?.groups ?? []} counts={counts} ready={ready} busy={collection.busy || !ready} noun="提示词" change={action => collection.change(action.kind === 'move-group' ? { ...action, placement: action.placement ?? 'before' } : action)} /></div></div>
    {collection.error && <Banner>{collection.error}</Banner>}
    {(collection.error || !loaded) && <Button variant="ghost" size="sm" disabled={collection.busy} onClick={() => { void collection.reload(true); onReload?.() }}>重新读取提示词分组</Button>}
    {!ready ? <div aria-label="正在读取提示词分组" aria-busy="true" className="space-y-3 p-4">{[0, 1, 2].map(index => <Skeleton key={index} className="h-10 w-full" />)}</div> : query && !visible.length ? <IllustratedEmpty kind="skills" title="没有匹配的提示词" /> : <div className="conversation-list skills-list-scroll skills-browser-list source-catalog" aria-label="提示词列表">
      <DragList ids={ids} disabled={collection.busy || Boolean(query)} onMove={({ id, targetId, placement }) => { void collection.change({ kind: 'move-prompt', promptId: id, targetId, placement }) }} onGroupDrop={(promptId, groupId) => { void collection.change({ kind: 'assign-group', promptId, groupId: groupId || undefined }) }}>
        <div className="skill-list-content">{groups.map(group => <Collapsible key={group.id} className="skills-list-group" open={group.open} onOpenChange={open => { if (!query) setCollapsed(ids => open ? ids.filter(id => id !== group.id) : [...ids, group.id]) }}>
          <DragListGroupTarget id={group.id}><CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>{group.name}<small>{group.entries.length}</small><ChevronRight /></CollapsibleTrigger></DragListGroupTarget>
          <CollapsibleContent><div role="group" aria-label={group.name}>{group.entries.map(value => <PromptRow key={value.id} api={api} value={value} selected={selected === value.id} onRemoved={id => { onRemoved(id); void collection.reload(true) }} onOpen={() => onOpen(value)} />)}{!group.entries.length && <p className="field-hint">暂无提示词</p>}</div></CollapsibleContent>
        </Collapsible>)}</div>
      </DragList>
    </div>}
  </section>
}

function PromptRow({ api, value, selected, onOpen, onRemoved }: { api: DesktopApi; value: PromptTemplate; selected: boolean; onOpen(): void; onRemoved(id: string): void }) {
  return <DragListItem id={value.id} className={`skill-list-row source-catalog-row prompt-catalog-row${selected ? ' selected' : ''}`}>{({ dragging, dragProps }) => <>
    <Button variant="ghost" size="content" aria-pressed={selected} className={`conversation-item skill-list-select${dragging ? ' drag-list-dragging' : ''}`} {...dragProps} onClick={() => { if (!dragging) onOpen() }}><span className="skill-list-icon"><FileText /></span><span className="conversation-copy"><strong className="conversation-title" title={value.name}>{value.name}</strong><small className="conversation-preview">{value.description || value.content}</small></span></Button>
    <div className="source-row-actions prompt-row-actions"><PromptActions api={api} value={value} onRemoved={() => onRemoved(value.id)} /></div>
  </>}</DragListItem>
}

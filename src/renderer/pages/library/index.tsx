/*
 * [INPUT]: 资源领域类型、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 下拉字段统一使用 shadcn Select；旧技能分类显示本地/收藏并转入独立工作区，导入固定本地目录且无员工选择，知识与旧绑定视图保留；受管 Skills 的已安装/我的/员工视图、持久收藏分组与拖动归类、导入预览和详情内容；知识资料与绑定入口保持兼容，增加商店、批量只读检查更新、技能库导出预览和当次导入/导出结果，不提供安装记录入口。
 * [POS]: src/renderer/pages/library/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SelectField } from '@/components/ui/select-field'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { SkillImportDialog } from './skill-import-dialog'
import { SkillExportDialog } from './skill-export-dialog'
import { SkillUpdateBatchView } from './skill-update-batch'
import { SkillMarketplaceView } from './skill-marketplace'
import type { SkillMarketplaceItem } from '@shared/domain/skill-marketplace'
import { SkillContent } from './skill-content'
import { useSkillCollections } from './use-skill-collections'
import { FileText, FolderOpen, Plus, Search, ShieldCheck } from '@/components/icons/index'
import type { DesktopApi } from '@shared/ipc'
import type { DigitalAgent, Resource, Snapshot } from '@shared/domain'
import { Avatar, Banner, useMutation } from '@/components/common/index'

export function LibraryPage({ api, snapshot, refresh, onResource, onAgent, onMarketplace, onSkills }: { api: DesktopApi; snapshot: Snapshot; refresh: () => Promise<void>; onResource: (resource: Resource) => void; onMarketplace: (item: SkillMarketplaceItem) => void; onAgent: (agent: DigitalAgent) => void; onSkills?: (section: 'all' | 'own' | 'marketplace') => void }) {
  const [view, setView] = useState('public'), [owner, setOwner] = useState(''), [query, setQuery] = useState(''), [kind, setKind] = useState('all')
  const [operationId, setOperationId] = useState<string | undefined>()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false), [groupName, setGroupName] = useState(''), [editingGroup, setEditingGroup] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const collection = useSkillCollections(api)
  const { busy, error, run } = useMutation()
  const agent = snapshot.agents.find(a => a.id === owner)
  const resources = snapshot.resources.filter(resource => {
    const scope = view === 'public' ? !resource.ownerAgentId : view === 'bound' ? agent && [...agent.skillIds, ...agent.knowledgeIds].includes(resource.id) : resource.kind === 'skill'
    return scope && (view !== 'own' || collection.value?.favoriteResourceIds.includes(resource.id)) && (view === 'installed' || view === 'own' || kind === 'all' || resource.kind === kind) && `${resource.name} ${resource.description}`.toLowerCase().includes(query.toLowerCase())
  })
  const importKnowledge = () => run(async () => { const path = await api.request('choosePath', { kind: 'knowledge' }); if (path) { const resource = await api.request('importResource', { kind: 'knowledge', path }); await refresh(); onResource(resource) } })
  const cards = (items: Resource[]) => <div className="library-grid">{items.map(resource => <div className="skill-card" key={resource.id} draggable={view === 'own'} onDragStart={event => event.dataTransfer.setData('application/boai-skill', resource.id)}>
    <Button variant="surface" size="content" className="library-card" onClick={() => onResource(resource)}><span className="resource-type-icon">{resource.kind === 'skill' ? <ShieldCheck size={21} /> : <FileText size={21} />}</span><span><strong>{resource.name}</strong><small>{resource.description || '查看资源详情与绑定'}</small><span className="pill">{resource.kind === 'skill' ? 'Skill' : '知识'}{resource.ownerAgentId ? ` · ${snapshot.agents.find(agent => agent.id === resource.ownerAgentId)?.name ?? '员工'}专属` : ' · 公共'}</span></span></Button>
    {resource.kind === 'skill' && <div className="skill-card-actions"><small>已绑定 {snapshot.agents.filter(agent => agent.skillIds.includes(resource.id)).length} 位员工</small><Button variant="ghost" size="sm" disabled={!collection.value || collection.busy} onClick={() => { void collection.change({ kind: 'favorite', resourceId: resource.id, favorite: !collection.value?.favoriteResourceIds.includes(resource.id) }) }}>{collection.value?.favoriteResourceIds.includes(resource.id) ? '移出我的' : '加入我的'}</Button>{view === 'own' && <SelectField aria-label={`${resource.name} 的分组`} value={collection.value?.groupByResourceId[resource.id] ?? ''} disabled={collection.busy} onValueChange={selectedValue => { void collection.change({ kind: 'assign-group', resourceId: resource.id, groupId: selectedValue || undefined }) }} options={[{ value: '', label: '未分组' }, ...(collection.value?.groups.map(group => ({ value: group.id, label: group.name })) ?? [])]} />}</div>}
  </div>)}</div>
  const grouped = [...(collection.value?.groups ?? []), { id: '', name: '未分组' }]
  return <div className="library-page page-scroll">
    <div className="page-heading"><div><h2>资料库</h2><p>集中管理技能与知识，按员工和会话明确共享。</p></div><div className="button-row"><Button variant="secondary" disabled={!snapshot.resources.some(resource => resource.kind === 'skill')} onClick={() => setExporting(true)}>导出技能库</Button><Button variant="secondary" onClick={() => { setOperationId(undefined); setImporting(true) }}><Plus size={15} />导入 Skill</Button><Button disabled={busy} onClick={() => { void importKnowledge() }}><Plus size={15} />导入知识</Button></div></div>
    {(error || collection.error) && <Banner>{error || collection.error}</Banner>}
    <SkillUpdateBatchView api={api} onResource={id => { const resource = snapshot.resources.find(value => value.id === id); if (resource) onResource(resource) }} />
    <Tabs value={view} onValueChange={value => { if (onSkills && ['installed','own','marketplace'].includes(value)) onSkills(value === 'installed' ? 'all' : value as 'own' | 'marketplace'); else setView(value) }} className="gap-0"><TabsList aria-label="资料库分类"><TabsTrigger value="public">公共资源</TabsTrigger><TabsTrigger value="installed">本地技能</TabsTrigger><TabsTrigger value="own">收藏</TabsTrigger><TabsTrigger value="bound">员工已绑定</TabsTrigger><TabsTrigger value="marketplace">技能商店</TabsTrigger></TabsList><TabsContent value={view}>
    {view === 'marketplace' ? <SkillMarketplaceView api={api} onSelect={onMarketplace} /> : <>
    <div className="library-filters"><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索资源" placeholder="搜索资源名称或说明" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>{(view === 'public' || view === 'bound') && <SelectField aria-label="资源类型" value={kind} onValueChange={selectedValue => setKind(selectedValue)} options={[{ value: 'all', label: '全部类型' }, { value: 'skill', label: 'Skills' }, { value: 'knowledge', label: '知识资料' }]} />}{view === 'bound' && <SelectField aria-label="选择员工" value={owner} onValueChange={selectedValue => setOwner(selectedValue)} options={[{ value: '', label: '选择数字员工' }, ...snapshot.agents.map(agent => ({ value: agent.id, label: agent.name }))]} />}</div>
    <p className="field-hint">{view === 'own' ? '收藏和分组只用于整理；移出我的不会撤销员工绑定。可拖动技能卡片到分组。' : view === 'bound' ? '这里展示员工实际启用的绑定。员工专属 Skills 仍只属于该员工。' : view === 'public' ? '公共资源表示可供绑定，仍需在员工配置中明确启用。' : '已安装资源不会自动授权给员工。请在员工配置中明确启用。'}</p>
    {agent && view === 'bound' && <Button variant="surface" size="content" className="agent-binding" onClick={() => onAgent(agent)}><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} small /><span>{agent.name} 的资源配置</span><span>管理绑定 →</span></Button>}
    {view === 'own' && <form className="skill-group-form" onSubmit={event => { event.preventDefault(); void run(async () => { const saved = await collection.change(editingGroup ? { kind: 'rename-group', groupId: editingGroup, name: groupName } : { kind: 'create-group', name: groupName }); if (saved) { setGroupName(''); setEditingGroup('') } }) }}><Input aria-label="分组名称" placeholder={editingGroup ? '新的分组名称' : '新建分组'} value={groupName} maxLength={40} onChange={event => setGroupName(event.target.value)} /><Button variant="secondary" disabled={!groupName.trim() || collection.busy || busy} type="submit">{editingGroup ? '保存分组' : '添加分组'}</Button>{editingGroup && <Button variant="ghost" onClick={() => { setEditingGroup(''); setGroupName('') }}>取消</Button>}</form>}
    {view === 'own' ? grouped.map((group, index) => {
      const items = resources.filter(resource => (collection.value?.groupByResourceId[resource.id] ?? '') === group.id)
      const hidden = collapsed.has(group.id) && !query
      return <section key={group.id} className="skill-group" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const resourceId = event.dataTransfer.getData('application/boai-skill'); if (resourceId) void collection.change({ kind: 'assign-group', resourceId, groupId: group.id || undefined }) }}><div className="skill-group-heading"><Button variant="ghost" size="sm" aria-expanded={!hidden} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next })}>{hidden ? '▸' : '▾'} {group.name} · {items.length}</Button>{group.id && <div className="button-row"><Button variant="ghost" size="sm" aria-label={`上移 ${group.name}`} disabled={index === 0 || collection.busy} onClick={() => { void collection.change({ kind: 'move-group', groupId: group.id, targetId: grouped[index - 1].id }) }}>↑</Button><Button variant="ghost" size="sm" aria-label={`下移 ${group.name}`} disabled={index >= grouped.length - 2 || collection.busy} onClick={() => { void collection.change({ kind: 'move-group', groupId: grouped[index + 1].id, targetId: group.id }) }}>↓</Button><Button variant="ghost" size="sm" onClick={() => { setEditingGroup(group.id); setGroupName(group.name) }}>重命名</Button><Button variant="ghost" size="sm" disabled={collection.busy} onClick={() => { void collection.change({ kind: 'delete-group', groupId: group.id }) }}>删除分组</Button></div>}</div>{!hidden && cards(items)}{!hidden && !items.length && <p className="field-hint">将收藏的技能拖到这里，或在卡片中选择分组。</p>}</section>
    }) : cards(resources)}
    {!resources.length && <div className="empty-state compact"><FolderOpen size={34} /><h3>{view === 'bound' && !agent ? '选择一位员工' : view === 'own' ? '还没有收藏的技能' : '暂无匹配资源'}</h3><p>{view === 'own' ? '在已安装的技能中选择“加入我的”。' : '导入资源，或调整当前筛选条件。'}</p></div>}
    </>}
    </TabsContent></Tabs>
    {exporting && <SkillExportDialog api={api} resources={snapshot.resources.filter(resource => resource.kind === 'skill')} favoriteIds={collection.value?.favoriteResourceIds ?? []} onClose={() => setExporting(false)} onOperation={id => { setExporting(false); setOperationId(id); setImporting(true) }} />}
    {importing && <SkillImportDialog api={api} operationId={operationId} onResource={id => { if (id.startsWith('local:')) onSkills?.('all'); else { const resource = snapshot.resources.find(value => value.id === id); if (resource) onResource(resource) } }} onClose={() => setImporting(false)} onInstalled={refresh} />}
  </div>
}

export function ResourceDetail({ api, resource, snapshot, refresh, onRemoved, onAgent }: { api: DesktopApi; resource: Resource; snapshot: Snapshot; refresh: () => Promise<void>; onRemoved: () => void; onAgent: (agent: DigitalAgent) => void }) {
  const [confirm, setConfirm] = useState(false), [bindAgent, setBindAgent] = useState('')
  const collection = useSkillCollections(api)
  const { busy, error, run } = useMutation()
  const bound = snapshot.agents.filter(a => [...a.skillIds, ...a.knowledgeIds].includes(resource.id))
  const shared = snapshot.conversations.filter(c => c.sharedKnowledgeIds.includes(resource.id))
  return <div className="detail-section">{error && <Banner>{error}</Banner>}<span className="pill">{resource.kind === 'skill' ? 'Skill' : '知识资料'}</span><h2>{resource.name}</h2><p>{resource.description || '没有额外说明。'}</p>{resource.kind === 'skill' && <><Button variant="secondary" disabled={!collection.value || collection.busy} onClick={() => { void collection.change({ kind: 'favorite', resourceId: resource.id, favorite: !collection.value?.favoriteResourceIds.includes(resource.id) }) }}>{collection.value?.favoriteResourceIds.includes(resource.id) ? '移出我的' : '加入我的'}</Button>{collection.error && <Banner>{collection.error}</Banner>}<SkillContent api={api} resourceId={resource.id} /><div className="skill-binding"><SelectField aria-label="为技能选择员工" value={bindAgent} onValueChange={selectedValue => setBindAgent(selectedValue)} options={[{ value: '', label: '选择员工以管理绑定' }, ...snapshot.agents.filter(agent => !resource.ownerAgentId || agent.id === resource.ownerAgentId).map(agent => ({ value: agent.id, label: agent.name }))]} /><Button variant="secondary" disabled={!bindAgent} onClick={() => { const agent = snapshot.agents.find(agent => agent.id === bindAgent); if (agent) onAgent(agent) }}>管理绑定</Button></div></>}<h4>来源路径</h4><p className="resource-path">{resource.path}</p><Button variant="secondary" onClick={() => { void run(async () => { await api.request('openPath', { path: resource.path }) }) }}><FolderOpen size={16} />打开资源</Button><h4>已绑定员工 · {bound.length}</h4>{bound.map(agent => <Button variant="ghost" size="content" key={agent.id} className="entity-row" onClick={() => onAgent(agent)}><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} small />{agent.name}<span>管理 →</span></Button>)}{!bound.length && <p className="field-hint">尚未绑定。可在员工详情中启用。</p>}<h4>已共享到群或会话 · {shared.length}</h4>{shared.map(c => <p className="list-label" key={c.id}>{c.title}</p>)}{!shared.length && <p className="field-hint">尚未共享到会话。</p>}<div className="danger-section"><Button variant="destructive" onClick={() => setConfirm(true)}>移除资源</Button>{confirm && <div className="inline-confirm"><p>移除此受管资源，并撤销 {bound.length} 位员工及 {shared.length} 个会话的相关绑定。原始导入文件不受影响。</p><div className="button-row"><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>保留</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => { void run(async () => { await api.request('removeResource', { id: resource.id }); await refresh(); onRemoved() }) }}>确认移除</Button></div></div>}</div></div>
}

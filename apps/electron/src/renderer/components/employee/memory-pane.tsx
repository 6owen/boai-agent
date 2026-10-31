/*
 * [OUTPUT]: 2026-10-30 API记忆页显示实际WM/OM，支持范围、编辑、清空和embedding；原生只说明归属。
 * [OUTPUT]: 记忆添加/编辑使用独立Dialog，保留底层列表与打开时的版本；局部草稿守卫、保存禁关和失败草稿保持，标题操作统一ghost/sm。
 * [INPUT]: 员工统一记忆 API、来源会话/资料、版本化结果及未保存守卫。
 * [OUTPUT]: 有界查询/分页、来源与生命周期、编辑/固定/忘记和旧范围显式升级；冲突保留草稿。
 * [POS]: 员工详情的统一记忆页；管理结果不作为模型召回，隐藏页无轮询。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DigitalAgent, ManagedMemory, MemoryEntry, MemoryInput, MemoryQuery, MemoryView, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, errorText, GuardContext, Loading, useDirty, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { X } from '@/components/icons'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { ConnectionSettingRow as Field } from '@/pages/settings/connection-layout'
import { ContactProfileCard, ContactProfileSection, EmployeeFormSection } from './profile-card'
const kinds = { long_term: '长期资料', experience: '经历', temporary: '临时记忆' }
const scopes = { employee: '相关聊天可用', conversation: '仅此聊天', context: '仅关联事项' }
const statuses = { active: '有效', superseded: '已纠正', archived: '已归档', expired: '已到期', deleted: '已忘记' }
const evidence = { fact: '有证据的事实', preference: '偏好', decision: '约定', claim: '有归属的陈述', inference: '推测' }
export function MemoryPane({ api, agent, snapshot, initialConversationId, active = true }: { api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; initialConversationId?: string; active?: boolean }) {
  const [source, setSource] = useState(initialConversationId ?? ''), [kind, setKind] = useState(''), [status, setStatus] = useState<MemoryQuery['status']>('active'), [search, setSearch] = useState('')
  const [view, setView] = useState<MemoryView | null>(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<{ entry?: MemoryEntry; epoch: number; source: string } | null>(null), [forget, setForget] = useState<MemoryEntry | null>(null)
  const guard = useContext(GuardContext), { busy, error, run, setError } = useMutation(), token = useRef(0)
  const operationReceipt = useRef({ fingerprint: '', id: '' })
  const requestFor = (payload: unknown) => { const fingerprint = JSON.stringify(payload); if (operationReceipt.current.fingerprint !== fingerprint) operationReceipt.current = { fingerprint, id: crypto.randomUUID() }; return operationReceipt.current.id }
  const conversations = snapshot.conversations.filter(c => c.agentIds.includes(agent.id))
  const sourceConversation = conversations.find(c => c.id === source)
  const updateSource = (memoryScope: 'employee' | 'conversation', contextId?: string) => { if (sourceConversation) void run(async () => {
    await api.request('createConversation', { id: sourceConversation.id, expectedConfigVersion: sourceConversation.configVersion, kind: sourceConversation.kind, title: sourceConversation.title, agentIds: sourceConversation.agentIds, sharedKnowledgeIds: sourceConversation.sharedKnowledgeIds, memoryScope, memoryContextRef: contextId ? { kind: 'conversation', id: contextId } : null })
    setRevision(value => value + 1)
  }) }
  const query: MemoryQuery = { agentId: agent.id, scope: 'employee', limit: 40, status, ...(source ? { sourceConversationId: source } : {}), ...(kind ? { kind: kind as MemoryQuery['kind'] } : {}), ...(search.trim() ? { search: search.trim() } : {}) }
  useEffect(() => {
    if (!active) return
    const current = ++token.current; setLoading(true); setError('')
    void api.request('getMemory', query).then(result => { if (token.current === current) setView(result) }).catch(error => { if (token.current === current) setError(errorText(error)) }).finally(() => { if (token.current === current) setLoading(false) })
    return () => { token.current++ }
  }, [api, agent.id, source, kind, status, search, revision, active, agent.executionBackend?.kind])
  const change = (fn: () => void) => guard.navigate(() => { setEditing(null); setForget(null); fn() }, { resetOnDiscard: false })
  const refreshed = () => { setEditing(null); setRevision(value => value + 1) }
  if (view?.managed) return <>{error && <Banner>{error}</Banner>}<ManagedMemoryPane api={api} agent={agent} memory={view.managed} epoch={view.epoch} snapshot={snapshot} loading={loading} sourceSettings={<EmployeeFormSection title="记忆范围" hint="私聊可在本员工的获准私聊间共享；群聊、渠道和材料内容保持隔离。">
    <Field label="来源聊天"><SelectField value={source} onValueChange={value => change(() => setSource(value))} options={[{ value: '', label: '全部来源' }, ...conversations.map(room => ({ value: room.id, label: room.title }))]} /></Field>
    {sourceConversation?.kind === 'direct' && !sourceConversation.channel && <Field label="使用范围"><SelectField disabled={busy} value={sourceConversation.memoryScope ?? 'employee'} onValueChange={value => updateSource(value as 'employee' | 'conversation')} options={[{ value: 'employee', label: '本员工的获准私聊' }, { value: 'conversation', label: '仅此聊天' }]} /></Field>}
  </EmployeeFormSection>} refresh={() => setRevision(value => value + 1)} /></>
  return <div className="detail-section employee-form-sections">
    <EmployeeFormSection title="记忆筛选" hint="同一员工默认记住新的交流，并在相关聊天中使用。仅此聊天、临时有效期和来源权限始终生效。私人记忆的使用不等于保密保证。">
      <Field label="来源聊天"><SelectField value={source} onValueChange={value => change(() => setSource(value))} options={[{ value: '', label: '全部来源' }, ...conversations.map(c => ({ value: c.id, label: c.title }))]} /></Field>
      <Field label="记忆类型"><SelectField value={kind} onValueChange={value => change(() => setKind(value))} options={[{ value: '', label: '全部类型' }, ...Object.entries(kinds).map(([value, label]) => ({ value, label }))]} /></Field>
      <Field label="记忆状态"><SelectField value={status ?? 'active'} onValueChange={value => change(() => setStatus(value as MemoryQuery['status']))} options={[{ value: 'active', label: '有效记忆' }, { value: 'history', label: '历史记忆' }, { value: 'all', label: '全部记录' }]} /></Field>
      <Field label="搜索记忆"><Input value={search} onChange={event => change(() => setSearch(event.target.value))} /></Field>
    </EmployeeFormSection>
    {sourceConversation && <EmployeeFormSection title="来源聊天设置" hint="收紧立即生效；放宽只影响新交流，旧记忆需逐条确认。">
      <Field label="此来源聊天的新交流" hint="收紧立即生效；放宽只影响新交流，旧记忆需逐条确认。"><SelectField disabled={busy} value={sourceConversation.memoryScope ?? 'employee'} onValueChange={value => updateSource(value as 'employee' | 'conversation', sourceConversation.memoryContextRef?.kind === 'conversation' ? sourceConversation.memoryContextRef.id : undefined)} options={[{ value: 'employee', label: '在该员工相关聊天中使用' }, { value: 'conversation', label: '仅在此聊天使用' }]} /></Field>
      <Field label="来源聊天关联事项（可选）"><SelectField disabled={busy} value={sourceConversation.memoryContextRef?.kind === 'conversation' ? sourceConversation.memoryContextRef.id : ''} onValueChange={value => updateSource(sourceConversation.memoryScope ?? 'employee', value)} options={[{ value: '', label: '不关联' }, ...conversations.filter(c => c.id !== source && sourceConversation.agentIds.every(id => c.agentIds.includes(id))).map(c => ({ value: c.id, label: c.title }))]} /></Field>
    </EmployeeFormSection>}
    {error && <Banner>{error}</Banner>}{loading && <Loading />}
    {view && <ContactProfileSection title={`记忆 · ${view.total ?? view.entries.length}`} actions={<div className="flex items-center gap-2"><Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>刷新</Button><Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => { setForget(null); setEditing({ epoch: view.epoch, source }) }}>添加记忆</Button></div>}>
      <ContactProfileCard label="记忆记录" fields={false}><div className="soft-divide-y">
      {view.entries.map(entry => <article className="min-w-0 space-y-3 py-3 first:pt-0 last:pb-0" key={entry.id}>
        <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6">{entry.content}</p><p className="field-hint">{kinds[entry.kind ?? (entry.scope === 'profile' ? 'long_term' : 'experience')]} · {scopes[entry.useScope ?? (entry.scope === 'profile' ? 'employee' : 'conversation')]} · {statuses[entry.status ?? 'active']} · {evidence[entry.evidence ?? 'claim']} · v{entry.version}{entry.pinned ? ' · 已固定' : ''}</p>
        {(entry.attribution || entry.expiresAt || entry.schemaVersion !== 2) && <p className="field-hint">{entry.attribution && `陈述者：${entry.attribution}。`}{entry.expiresAt && `有效至 ${new Date(entry.expiresAt).toLocaleString('zh-CN')}。`}{entry.schemaVersion !== 2 && '旧记录保留原使用范围。'}</p>}
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><details className="min-w-0 flex-1 text-xs text-muted-foreground"><summary className="cursor-pointer">查看来源</summary><div className="mt-2 space-y-1 break-words"><p>{(entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : [])).map(id => conversations.find(c => c.id === id)?.title ?? '来源聊天已不可用').join('、') || '用户明确设置'}</p>{entry.sourceMessageIds.map(id => <p className="resource-path break-all" key={id}>消息：{id}</p>)}{entry.sourceResourceIds.map(id => <p key={id}>资料：{snapshot.resources.find(r => r.id === id)?.name ?? '来源资料已不可用'}</p>)}{entry.sourceMemoryIds?.map(id => <p className="resource-path break-all" key={id}>派生自：{id}</p>)}</div></details>
        <div className="flex shrink-0 items-center gap-2"><Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => { setForget(null); setEditing({ entry, epoch: view.epoch, source }) }}>编辑</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { void run(async () => { await api.request('saveMemory', { agentId: agent.id, scope: 'employee', id: entry.id, content: entry.content, expectedEpoch: view.epoch, requestId: requestFor({ action: 'pin', id: entry.id, epoch: view.epoch, pinned: !entry.pinned }), pinned: !entry.pinned }); setRevision(value => value + 1) }) }}>{entry.pinned ? '取消固定' : '固定'}</Button><Button variant="ghost" className="text-destructive hover:text-destructive" size="sm" disabled={busy} onClick={() => setForget(entry)}>忘记</Button></div></div>
      </article>)}
      {!view.entries.length && <p className="field-hint">没有符合条件的记忆。</p>}
      </div></ContactProfileCard>
      {view.nextCursor && <Button variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={() => { const cursor = view.nextCursor; void run(async () => { const current = token.current, next = await api.request('getMemory', { ...query, before: cursor }); if (token.current === current) setView(previous => previous ? { ...next, entries: [...previous.entries, ...next.entries] } : next) }) }}>加载更多</Button>}
      {forget && <div className="inline-confirm"><p>忘记这条记忆及依赖它的摘要？聊天记录保留，旧来源不会自动重新提取。</p><div className="button-row"><Button variant="secondary" onClick={() => setForget(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { void run(async () => { await api.request('deleteMemory', { agentId: agent.id, scope: 'employee', id: forget.id, expectedEpoch: view.epoch, requestId: requestFor({ action: 'forget', id: forget.id, epoch: view.epoch }) }); setForget(null); setRevision(value => value + 1) }) }}>确认忘记</Button></div></div>}
    </ContactProfileSection>}
    {editing && <MemoryEditorDialog api={api} agent={agent} conversations={conversations} {...editing} active={active} onSaved={refreshed} onClose={() => setEditing(null)} />}
  </div>
}
type MemoryEditorProps = { api: DesktopApi; agent: DigitalAgent; conversations: Snapshot['conversations']; source: string; entry?: MemoryEntry; epoch: number; onSaved(): void }
function MemoryEditorDialog({ active, onClose, ...props }: MemoryEditorProps & { active: boolean; onClose(): void }) {
  const [busy, setBusy] = useState(false)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {} })
  const close = () => { if (!busy) navigate(onClose, { resetOnDiscard: false }) }
  return <GuardContext.Provider value={guard}>
    <Dialog open={active} onOpenChange={open => { if (!open) close() }}>
      <DialogContent showCloseButton={false} className="min-w-0 max-h-[calc(100dvh-32px)] overflow-y-auto p-5 sm:max-w-[780px]">
        <DialogTitle className="sr-only">{props.entry ? '编辑记忆' : '添加记忆'}</DialogTitle>
        <Button type="button" variant="ghost" size="icon-sm" className="absolute top-3 right-3" disabled={busy} aria-label="关闭记忆编辑" onClick={close}><X /></Button>
        <MemoryEditor {...props} onCancel={close} onBusyChange={setBusy} />
      </DialogContent>
    </Dialog>
    {confirmation}
  </GuardContext.Provider>
}
function MemoryEditor({ api, agent, conversations, source, entry, epoch, onSaved, onCancel, onBusyChange }: MemoryEditorProps & { onCancel(): void; onBusyChange(busy: boolean): void }) {
  const [content, setContent] = useState(entry?.content ?? ''), [kind, setKind] = useState<MemoryInput['kind']>(entry?.kind ?? 'long_term'), [scope, setScope] = useState<MemoryInput['useScope']>(entry?.useScope ?? (entry && entry.scope !== 'profile' ? 'conversation' : 'employee'))
  const [sourceId, setSourceId] = useState(entry?.conversationId ?? source), [contextId, setContextId] = useState(entry?.contextRef?.kind === 'conversation' ? entry.contextRef.id : ''), [expires, setExpires] = useState(entry?.expiresAt?.slice(0, 16) ?? ''), [lifecycle, setLifecycle] = useState<MemoryInput['lifecycle']>(entry?.status === 'archived' || entry?.status === 'expired' ? entry.status : 'active'), [confirmed, setConfirmed] = useState(false)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext), request = useRef({ fingerprint: '', id: '' })
  useLayoutEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  useDirty({ content, kind, scope, sourceId, contextId, expires, lifecycle, confirmed })
  const promote = !!entry && (entry.useScope ?? (entry.scope === 'profile' ? 'employee' : 'conversation')) !== 'employee' && scope === 'employee'
  return <form data-edit-form className="employee-form-sections" onSubmit={event => { event.preventDefault(); if (busy) return; void run(async () => {
    const payload: MemoryInput = { agentId: agent.id, scope: 'employee', id: entry?.id, content: content.trim(), expectedEpoch: epoch, kind, useScope: scope, sourceConversationId: sourceId || undefined, contextRef: scope === 'context' ? contextId ? { kind: 'conversation', id: contextId } : entry?.contextRef : null, expiresAt: expires ? new Date(expires + ':00Z').toISOString() : null, lifecycle, promote: promote && confirmed }
    const fingerprint = JSON.stringify(payload); if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() }
    await api.request('saveMemory', { ...payload, requestId: request.current.id }); guard.saved(); onSaved()
  }) }}>
    {error && <Banner>{error}</Banner>}
    <fieldset className="contents" disabled={busy}>
    <EmployeeFormSection title={entry ? '编辑记忆' : '添加记忆'} hint="版本冲突时草稿保留，请取消后刷新并重新核对。固定不会延长有效期。">
    <Field label="记忆内容"><Textarea aria-label={entry ? '编辑记忆内容' : '新增记忆'} required maxLength={4000} rows={7} value={content} onChange={event => setContent(event.target.value)} /></Field>
    <Field label="记忆类型"><SelectField value={kind ?? 'long_term'} onValueChange={value => setKind(value as MemoryInput['kind'])} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} /></Field>
    <Field label="使用范围"><SelectField value={scope ?? 'employee'} onValueChange={value => setScope(value as MemoryInput['useScope'])} options={Object.entries(scopes).map(([value, label]) => ({ value, label }))} /></Field>
    {(!entry || scope === 'conversation') && <Field label="来源聊天"><SelectField value={sourceId} onValueChange={setSourceId} options={[{ value: '', label: '用户明确设置' }, ...conversations.map(c => ({ value: c.id, label: c.title }))]} /></Field>}
    {scope === 'context' && <Field label="关联事项" hint="明确关联一个已有聊天；相同名称不会自动关联。"><SelectField value={contextId} onValueChange={setContextId} options={[{ value: '', label: entry?.contextRef?.kind === 'work' ? '保留已有工作关联' : '请选择关联聊天' }, ...conversations.map(c => ({ value: c.id, label: c.title }))]} /></Field>}
    <Field label="有效至（UTC，可留空）"><Input type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} /></Field>
    <Field label="保存状态"><SelectField value={lifecycle ?? 'active'} onValueChange={value => setLifecycle(value as MemoryInput['lifecycle'])} options={[{ value: 'active', label: '有效' }, { value: 'archived', label: '归档' }, { value: 'expired', label: '已结束' }]} /></Field>
    </EmployeeFormSection>
    {promote && <label className="check-row"><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} />我确认将此旧范围记忆用于该员工的相关聊天，保留原来源和原限制。</label>}
    <DialogFooter variant="plain"><Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>取消</Button><Button type="submit" disabled={busy || !content.trim() || promote && !confirmed || scope === 'conversation' && !sourceId || scope === 'context' && !contextId && !entry?.contextRef}>保存记忆</Button></DialogFooter>
    </fieldset>
  </form>
}


function ManagedMemoryPane({ api, agent, memory, epoch, snapshot, loading, sourceSettings, refresh }: { api: DesktopApi; agent: DigitalAgent; memory: ManagedMemory; epoch: number; snapshot: Snapshot; loading: boolean; sourceSettings: import('react').ReactNode; refresh(): void }) {
  const [editing, setEditing] = useState<ManagedMemory['documents'][number] | null>(null), [clearing, setClearing] = useState(false)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext)
  if (memory.backend === 'native') return <EmployeeFormSection title="本机 Agent 记忆" hint="会话上下文和记忆由所选本机 Agent 管理。" />
  return <div className="detail-section employee-form-sections">
    {error && <Banner>{error}</Banner>}
    {sourceSettings}
    <MemoryRetrievalSettings api={api} agent={agent} memory={memory} snapshot={snapshot} saved={refresh} />
    <ContactProfileSection title="Mastra Memory" actions={<div className="flex gap-2"><Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => guard.navigate(refresh)}>刷新</Button><Button variant="ghost" size="sm" disabled={busy || loading || !memory.documents.length} onClick={() => setClearing(true)}>清空记忆</Button></div>}>
      {!memory.documents.length && <p className="field-hint">开始 API 对话后，将在这里显示员工记忆。</p>}
      {memory.documents.map(document => <ContactProfileCard key={document.resourceId} label={document.conversationIds.map(id => snapshot.conversations.find(room => room.id === id)?.title ?? '聊天').join('、')} fields={false}>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Working Memory</span><Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => setEditing(document)}>编辑</Button></div>
          <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6">{document.workingMemory || '尚无持久资料。'}</p>
          <details><summary className="cursor-pointer text-sm">Observational Memory</summary><p className="whitespace-pre-wrap break-words text-sm leading-6">{document.observations || '尚未达到观察整理阈值，近期对话仍保留原文。'}</p></details>
        </div>
      </ContactProfileCard>)}
    </ContactProfileSection>
    <Dialog open={clearing} onOpenChange={open => { if (!busy) setClearing(open) }}><DialogContent><DialogTitle>清空员工记忆</DialogTitle><p>清除 Working Memory 和观察记忆。聊天记录保留，已有消息不会自动重新进入记忆。</p><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setClearing(false)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { void run(async () => { await api.request('clearMemory', { agentId: agent.id, scope: 'employee', expectedEpoch: epoch, requestId: crypto.randomUUID() }); setClearing(false); refresh() }) }}>清空</Button></DialogFooter></DialogContent></Dialog>
    {editing && <ManagedMemoryEditor api={api} agent={agent} document={editing} epoch={epoch} close={() => setEditing(null)} saved={() => { setEditing(null); refresh() }} />}
  </div>
}
function ManagedMemoryEditor({ api, agent, document, epoch, close, saved }: { api: DesktopApi; agent: DigitalAgent; document: ManagedMemory['documents'][number]; epoch: number; close(): void; saved(): void }) {
  const [content, setContent] = useState(document.workingMemory)
  const { busy, error, run } = useMutation()
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {} })
  return <GuardContext.Provider value={guard}>
    <Dialog open onOpenChange={open => { if (!open && !busy) navigate(close) }}><DialogContent className="sm:max-w-[780px]"><DialogTitle>编辑 Working Memory</DialogTitle>
      {error && <Banner>{error}</Banner>}
      <ManagedMemoryDraft content={content} setContent={setContent} busy={busy} />
      <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => navigate(close)}>取消</Button><Button disabled={busy} onClick={() => { void run(async () => { await api.request('saveMemory', { agentId: agent.id, scope: 'employee', content, expectedEpoch: epoch, managed: { resourceId: document.resourceId, expectedVersion: document.version } }); guard.saved(); saved() }) }}>保存</Button></DialogFooter>
    </DialogContent></Dialog>{confirmation}
  </GuardContext.Provider>
}
function ManagedMemoryDraft({ content, setContent, busy }: { content: string; setContent(value: string): void; busy: boolean }) {
  useDirty({ content })
  return <Textarea aria-label="Working Memory" rows={14} maxLength={64000} value={content} disabled={busy} onChange={event => setContent(event.target.value)} />
}

function MemoryRetrievalSettings({ api, agent, memory, snapshot, saved }: { api: DesktopApi; agent: DigitalAgent; memory: ManagedMemory; snapshot: Snapshot; saved(): void }) {
  const [connectionId, setConnectionId] = useState(memory.settings?.embedding?.connectionId ?? ''), [modelId, setModelId] = useState(memory.settings?.embedding?.modelId ?? '')
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext)
  useEffect(() => { setConnectionId(memory.settings?.embedding?.connectionId ?? ''); setModelId(memory.settings?.embedding?.modelId ?? '') }, [memory.settings?.revision])
  useDirty({ connectionId, modelId })
  const connections = snapshot.connections.filter(connection => connection.provider !== 'anthropic' && connection.gateway?.protocol !== 'messages')
  return <EmployeeFormSection title="语义检索" hint="选择支持 embeddings 的模型连接后，由 Mastra 建立向量索引。未配置时，OM 仍可整理和回查对话原文。">
    {error && <Banner>{error}</Banner>}
    <Field label="Embedding 连接"><SelectField disabled={busy} value={connectionId} onValueChange={setConnectionId} options={[{ value: '', label: '不使用向量检索' }, ...connections.map(connection => ({ value: connection.id, label: connection.name }))]} /></Field>
    {connectionId && <Field label="Embedding 模型"><Input disabled={busy} value={modelId} onChange={event => setModelId(event.target.value)} placeholder="例如 text-embedding-3-small" /></Field>}
    <div className="flex justify-end"><Button variant="ghost" size="sm" disabled={busy || !!connectionId && !modelId.trim()} onClick={() => { void run(async () => { await api.request('configureMemory', { agentId: agent.id, expectedRevision: memory.settings?.revision ?? 0, embedding: connectionId ? { connectionId, modelId: modelId.trim() } : null }); guard.saved(); saved() }) }}>保存</Button></div>
  </EmployeeFormSection>
}

/*
 * [INPUT]: 员工统一记忆 API、来源会话/资料、版本化结果及未保存守卫。
 * [OUTPUT]: 有界查询/分页、来源与生命周期、编辑/固定/忘记和旧范围显式升级；冲突保留草稿。
 * [POS]: 员工详情的统一记忆页；管理结果不作为模型召回，隐藏页无轮询。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { DigitalAgent, MemoryEntry, MemoryInput, MemoryQuery, MemoryView, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Field, GuardContext, Loading, useDirty, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
const kinds = { long_term: '长期资料', experience: '经历', temporary: '临时记忆' }
const scopes = { employee: '相关聊天可用', conversation: '仅此聊天', context: '仅关联事项' }
const statuses = { active: '有效', superseded: '已纠正', archived: '已归档', expired: '已到期', deleted: '已忘记' }
const evidence = { fact: '有证据的事实', preference: '偏好', decision: '约定', claim: '有归属的陈述', inference: '推测' }
export function MemoryPane({ api, agent, snapshot, initialConversationId }: { api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; initialConversationId?: string }) {
  const [source, setSource] = useState(initialConversationId ?? ''), [kind, setKind] = useState(''), [status, setStatus] = useState<MemoryQuery['status']>('active'), [search, setSearch] = useState('')
  const [view, setView] = useState<MemoryView | null>(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<MemoryEntry | 'new' | null>(null), [forget, setForget] = useState<MemoryEntry | null>(null)
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
    const current = ++token.current; setLoading(true); setError('')
    void api.request('getMemory', query).then(result => { if (token.current === current) setView(result) }).catch(error => { if (token.current === current) setError(errorText(error)) }).finally(() => { if (token.current === current) setLoading(false) })
    return () => { token.current++ }
  }, [api, agent.id, source, kind, status, search, revision])
  const change = (fn: () => void) => guard.navigate(() => { setEditing(null); setForget(null); fn() }, { resetOnDiscard: false })
  const refreshed = () => { setEditing(null); setRevision(value => value + 1) }
  return <div className="detail-section">
    <p className="field-hint">同一员工默认记住新的交流，并在相关聊天中使用。仅此聊天、临时有效期和来源权限始终生效。私人记忆的使用不等于保密保证。</p>
    <div className="form-grid">
      <Field label="来源聊天"><SelectField value={source} onValueChange={value => change(() => setSource(value))} options={[{ value: '', label: '全部来源' }, ...conversations.map(c => ({ value: c.id, label: c.title }))]} /></Field>
      <Field label="记忆类型"><SelectField value={kind} onValueChange={value => change(() => setKind(value))} options={[{ value: '', label: '全部类型' }, ...Object.entries(kinds).map(([value, label]) => ({ value, label }))]} /></Field>
      <Field label="记忆状态"><SelectField value={status ?? 'active'} onValueChange={value => change(() => setStatus(value as MemoryQuery['status']))} options={[{ value: 'active', label: '有效记忆' }, { value: 'history', label: '历史记忆' }, { value: 'all', label: '全部记录' }]} /></Field>
      <Field label="搜索记忆"><Input value={search} onChange={event => change(() => setSearch(event.target.value))} /></Field>
    </div>
    {sourceConversation && !editing && <>
      <Field label="此来源聊天的新交流" hint="收紧立即生效；放宽只影响新交流，旧记忆需逐条确认。"><SelectField disabled={busy} value={sourceConversation.memoryScope ?? 'employee'} onValueChange={value => updateSource(value as 'employee' | 'conversation', sourceConversation.memoryContextRef?.kind === 'conversation' ? sourceConversation.memoryContextRef.id : undefined)} options={[{ value: 'employee', label: '在该员工相关聊天中使用' }, { value: 'conversation', label: '仅在此聊天使用' }]} /></Field>
      <Field label="来源聊天关联事项（可选）"><SelectField disabled={busy} value={sourceConversation.memoryContextRef?.kind === 'conversation' ? sourceConversation.memoryContextRef.id : ''} onValueChange={value => updateSource(sourceConversation.memoryScope ?? 'employee', value)} options={[{ value: '', label: '不关联' }, ...conversations.filter(c => c.id !== source && sourceConversation.agentIds.every(id => c.agentIds.includes(id))).map(c => ({ value: c.id, label: c.title }))]} /></Field>
    </>}
    {error && <Banner>{error}</Banner>}{loading && <Loading />}
    {view && (editing ? <MemoryEditor key={editing === 'new' ? 'new' : editing.id} api={api} agent={agent} conversations={conversations} source={source} entry={editing === 'new' ? undefined : editing} epoch={view.epoch} onSaved={refreshed} onCancel={() => change(() => {})} /> : <>
      <div className="subsection-heading"><h3>记忆 · {view.total ?? view.entries.length}</h3><div className="button-row"><Button variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>刷新</Button><Button variant="secondary" size="sm" onClick={() => setEditing('new')}>添加</Button></div></div>
      {view.entries.map(entry => <Card className="memory-card gap-0 p-4" key={entry.id}><CardContent className="p-0">
        <p>{entry.content}</p><small>{kinds[entry.kind ?? (entry.scope === 'profile' ? 'long_term' : 'experience')]} · {scopes[entry.useScope ?? (entry.scope === 'profile' ? 'employee' : 'conversation')]} · {statuses[entry.status ?? 'active']} · {evidence[entry.evidence ?? 'claim']} · v{entry.version}{entry.pinned ? ' · 已固定' : ''}</small>
        <p className="field-hint">{entry.attribution && `陈述者：${entry.attribution}。`}{entry.expiresAt && `有效至 ${new Date(entry.expiresAt).toLocaleString('zh-CN')}。`}{entry.schemaVersion !== 2 && '旧记录保留原使用范围。'}</p>
        <details><summary>查看来源</summary><p>{(entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : [])).map(id => conversations.find(c => c.id === id)?.title ?? '来源聊天已不可用').join('、') || '用户明确设置'}</p>{entry.sourceMessageIds.map(id => <p className="resource-path" key={id}>消息：{id}</p>)}{entry.sourceResourceIds.map(id => <p key={id}>资料：{snapshot.resources.find(r => r.id === id)?.name ?? '来源资料已不可用'}</p>)}{entry.sourceMemoryIds?.map(id => <p className="resource-path" key={id}>派生自：{id}</p>)}</details>
        <div className="button-row"><Button variant="ghost" size="sm" onClick={() => setEditing(entry)}>编辑</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { void run(async () => { await api.request('saveMemory', { agentId: agent.id, scope: 'employee', id: entry.id, content: entry.content, expectedEpoch: view.epoch, requestId: requestFor({ action: 'pin', id: entry.id, epoch: view.epoch, pinned: !entry.pinned }), pinned: !entry.pinned }); setRevision(value => value + 1) }) }}>{entry.pinned ? '取消固定' : '固定'}</Button><Button variant="destructive" size="sm" onClick={() => setForget(entry)}>忘记</Button></div>
      </CardContent></Card>)}
      {!view.entries.length && <p className="empty-note">没有符合条件的记忆。</p>}
      {view.nextCursor && <Button variant="secondary" disabled={busy} onClick={() => { const cursor = view.nextCursor; void run(async () => { const current = token.current, next = await api.request('getMemory', { ...query, before: cursor }); if (token.current === current) setView(previous => previous ? { ...next, entries: [...previous.entries, ...next.entries] } : next) }) }}>加载更多</Button>}
      {forget && <div className="inline-confirm"><p>忘记这条记忆及依赖它的摘要？聊天记录保留，旧来源不会自动重新提取。</p><div className="button-row"><Button variant="secondary" onClick={() => setForget(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { void run(async () => { await api.request('deleteMemory', { agentId: agent.id, scope: 'employee', id: forget.id, expectedEpoch: view.epoch, requestId: requestFor({ action: 'forget', id: forget.id, epoch: view.epoch }) }); setForget(null); setRevision(value => value + 1) }) }}>确认忘记</Button></div></div>}
    </>)}
  </div>
}
function MemoryEditor({ api, agent, conversations, source, entry, epoch, onSaved, onCancel }: { api: DesktopApi; agent: DigitalAgent; conversations: Snapshot['conversations']; source: string; entry?: MemoryEntry; epoch: number; onSaved(): void; onCancel(): void }) {
  const [content, setContent] = useState(entry?.content ?? ''), [kind, setKind] = useState<MemoryInput['kind']>(entry?.kind ?? 'long_term'), [scope, setScope] = useState<MemoryInput['useScope']>(entry?.useScope ?? (entry && entry.scope !== 'profile' ? 'conversation' : 'employee'))
  const [sourceId, setSourceId] = useState(entry?.conversationId ?? source), [contextId, setContextId] = useState(entry?.contextRef?.kind === 'conversation' ? entry.contextRef.id : ''), [expires, setExpires] = useState(entry?.expiresAt?.slice(0, 16) ?? ''), [lifecycle, setLifecycle] = useState<MemoryInput['lifecycle']>(entry?.status === 'archived' || entry?.status === 'expired' ? entry.status : 'active'), [confirmed, setConfirmed] = useState(false)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext), request = useRef({ fingerprint: '', id: '' })
  useDirty({ content, kind, scope, sourceId, contextId, expires, lifecycle, confirmed })
  const promote = !!entry && (entry.useScope ?? (entry.scope === 'profile' ? 'employee' : 'conversation')) !== 'employee' && scope === 'employee'
  return <form data-edit-form className="memory-editor" onSubmit={event => { event.preventDefault(); void run(async () => {
    const payload: MemoryInput = { agentId: agent.id, scope: 'employee', id: entry?.id, content: content.trim(), expectedEpoch: epoch, kind, useScope: scope, sourceConversationId: sourceId || undefined, contextRef: scope === 'context' ? contextId ? { kind: 'conversation', id: contextId } : entry?.contextRef : null, expiresAt: expires ? new Date(expires + ':00Z').toISOString() : null, lifecycle, promote: promote && confirmed }
    const fingerprint = JSON.stringify(payload); if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() }
    await api.request('saveMemory', { ...payload, requestId: request.current.id }); onSaved(); guard.saved()
  }) }}>
    {error && <Banner>{error}</Banner>}
    <Field label={entry ? '编辑记忆' : '新增记忆'}><Textarea required maxLength={4000} rows={7} value={content} onChange={event => setContent(event.target.value)} /></Field>
    <Field label="记忆类型"><SelectField value={kind ?? 'long_term'} onValueChange={value => setKind(value as MemoryInput['kind'])} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} /></Field>
    <Field label="使用范围"><SelectField value={scope ?? 'employee'} onValueChange={value => setScope(value as MemoryInput['useScope'])} options={Object.entries(scopes).map(([value, label]) => ({ value, label }))} /></Field>
    {(!entry || scope === 'conversation') && <Field label="来源聊天"><SelectField value={sourceId} onValueChange={setSourceId} options={[{ value: '', label: '用户明确设置' }, ...conversations.map(c => ({ value: c.id, label: c.title }))]} /></Field>}
    {scope === 'context' && <Field label="关联事项" hint="明确关联一个已有聊天；相同名称不会自动关联。"><SelectField value={contextId} onValueChange={setContextId} options={[{ value: '', label: entry?.contextRef?.kind === 'work' ? '保留已有工作关联' : '请选择关联聊天' }, ...conversations.map(c => ({ value: c.id, label: c.title }))]} /></Field>}
    <Field label="有效至（UTC，可留空）"><Input type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} /></Field>
    <Field label="保存状态"><SelectField value={lifecycle ?? 'active'} onValueChange={value => setLifecycle(value as MemoryInput['lifecycle'])} options={[{ value: 'active', label: '有效' }, { value: 'archived', label: '归档' }, { value: 'expired', label: '已结束' }]} /></Field>
    {promote && <label className="check-row"><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} />我确认将此旧范围记忆用于该员工的相关聊天，保留原来源和原限制。</label>}
    <p className="field-hint">版本冲突时草稿保留，请取消后刷新并重新核对。固定不会延长有效期。</p>
    <div className="button-row"><Button type="button" variant="secondary" onClick={onCancel}>取消</Button><Button type="submit" disabled={busy || !content.trim() || promote && !confirmed || scope === 'conversation' && !sourceId || scope === 'context' && !contextId && !entry?.contextRef}>保存记忆</Button></div>
  </form>
}

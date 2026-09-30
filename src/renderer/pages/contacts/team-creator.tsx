/*
 * [INPUT]: 团队草稿 IPC、模型连接快照和详情标签活跃状态。
 * [OUTPUT]: 缺失有效模型的配置入口和当前群名；生成/创建完成后的键盘焦点、显式提交的首个无效字段与错误聚焦；原子批量创建、恢复和按 ID 结果导航，串行保存与本地冲突副本。
 * [POS]: contacts 团队创建详情页；不借用普通聊天创建配置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { Snapshot } from '@shared/domain'
import type { TeamDraft, TeamEditable, TeamGeneration, TeamCreationOperation } from '@shared/domain/team-creation'
import { Banner, Field, GuardContext, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TeamPlanEditor } from './team-plan-editor'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { SelectField } from '@/components/ui/select-field'

const editable = (draft: TeamDraft): TeamEditable => ({ prompt: draft.prompt, selectedConnectionId: draft.selectedConnectionId, selectedModelId: draft.selectedModelId, createGroup: draft.createGroup, groupTitle: draft.groupTitle, ...(draft.plan ? { plan: draft.plan } : {}) })
export function TeamCreator({ api, snapshot, active, onConfigure, onAgent, onMessage, onGroup }: { onAgent(id: string): void; onMessage(kind: 'agent' | 'group', id: string): void; onGroup(): void; api: DesktopApi; snapshot: Snapshot; active: boolean; onConfigure(): void }) {
  const [draft, setDraft] = useState<TeamDraft>(), [form, setForm] = useState<TeamEditable>(), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [generation, setGeneration] = useState<TeamGeneration>(), [acting, setActing] = useState(false), [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [operation, setOperation] = useState<TeamCreationOperation>()
  const [latest, setLatest] = useState<TeamDraft>()
  const [focusGenerationId, setFocusGenerationId] = useState<string>()
  const formRef = useRef<HTMLFormElement>(null), planTitle = useRef<HTMLLegendElement>(null), resultTitle = useRef<HTMLHeadingElement>(null), errorRegion = useRef<HTMLDivElement>(null)
  const focusError = useRef(false)
  const creationRequest = useRef<{ draftId: string; expectedVersion: number; planHash: string; requestId: string } | undefined>(undefined)
  const actionLock = useRef(false)
  const guard = useContext(GuardContext), current = useRef({ draft, form }), tail = useRef<Promise<unknown>>(Promise.resolve()), savedText = useRef('')
  current.current = { draft, form }
  useEffect(() => {
    if (active && focusGenerationId && draft?.plan?.generationId === focusGenerationId) { planTitle.current?.focus(); setFocusGenerationId(undefined) }
  }, [active, focusGenerationId, draft?.plan?.generationId])
  useEffect(() => { if (active && operation?.status === 'committed') resultTitle.current?.focus() }, [active, operation?.status])
  useEffect(() => { if (active && error && focusError.current) { errorRegion.current?.focus(); focusError.current = false } }, [active, error, acting])
  const install = (value: TeamDraft) => { savedText.current = JSON.stringify(editable(value)); current.current = { draft: value, form: editable(value) }; setDraft(value); setForm(editable(value)); guard.setDirty(false) }
  useEffect(() => {
    let alive = true
    void (async () => {
      const recovery = await api.request('listTeamCreationRecovery', undefined)
      const prior = recovery.drafts.find(value => value.status === 'open') ?? recovery.drafts.at(-1)
      const view = prior ? await api.request('getTeamDraft', { draftId: prior.id }) : { draft: await api.request('openTeamDraft', undefined), generation: undefined, operation: undefined }
      if (alive) { install(view.draft); setGeneration(view.generation); setOperation(view.operation) }
    })().catch(e => { if (alive) setError(errorText(e)) })
    return () => { alive = false }
  }, [api])
  const dirty = !!form && JSON.stringify(form) !== savedText.current
  useEffect(() => { guard.setDirty(dirty); return () => guard.setDirty(false) }, [dirty, guard.setDirty])
  const save = () => {
    const work = tail.current.then(async () => {
      const before = current.current
      if (!before.draft || !before.form || JSON.stringify(before.form) === savedText.current) return
      setSaving(true)
      try {
        const result = await api.request('saveTeamDraft', { draftId: before.draft.id, expectedVersion: before.draft.version, editableFields: before.form })
        savedText.current = JSON.stringify(editable(result)); current.current.draft = result; setDraft(result)
        if (current.current.form === before.form) { current.current.form = editable(result); setForm(editable(result)); guard.setDirty(false) }
        setError(''); setLatest(undefined)
      } finally { setSaving(false) }
    })
    tail.current = work.catch(() => {}); return work
  }
  useEffect(() => { if (!dirty || error) return; const timer = setTimeout(() => { void save().catch(e => setError(errorText(e))) }, 500); return () => clearTimeout(timer) }, [form, dirty, error])
  const reload = async () => {
    const previous = current.current.draft
    if (!previous) return
    const value = await api.request('getTeamDraft', { draftId: previous.id })
    if (current.current.draft?.id !== previous.id) return
    setGeneration(value.generation); setOperation(value.operation)
    if (current.current.draft?.version === previous.version && JSON.stringify(current.current.form) === savedText.current) install(value.draft)
  }
  useEffect(() => {
    if (!active || !draft) return
    void reload().catch(e => setError(errorText(e)))
    return api.subscribe(event => { if (event.type === 'changed') void reload().catch(e => setError(errorText(e))) })
  }, [api, active, draft?.id])
  const run = async (action: () => Promise<void>) => {
    if (actionLock.current) return
    actionLock.current = true; setActing(true)
    try { await action(); setError('') } catch (e) { focusError.current = true; setError(errorText(e)) }
    finally { actionLock.current = false; setActing(false) }
  }
  const generate = () => run(async () => {
    await save()
    const value = current.current.draft!
    const result = await api.request('generateTeamPlan', { draftId: value.id, expectedVersion: value.version, requestId: crypto.randomUUID() })
    setGeneration(result); setFocusGenerationId(result.id); await reload()
  })
  const create = () => {
    if (!formRef.current?.reportValidity()) return
    return run(async () => {
      await save()
      const value = current.current.draft!
      if (!value.planHash) throw new Error(value.validationErrors.join('；'))
      const previous = creationRequest.current
      const request = previous?.draftId === value.id && previous.expectedVersion === value.version && previous.planHash === value.planHash ? previous : { draftId: value.id, expectedVersion: value.version, planHash: value.planHash, requestId: crypto.randomUUID() }
      creationRequest.current = request
      try { setOperation(await api.request('acceptTeamCreation', request)) } finally { await reload() }
    })
  }
  if (!draft || !form) return <p className="empty-note">{error || '正在读取团队草稿…'}</p>
  const locked = acting || draft.generationStatus === 'running' || !!draft.creationOperationId
  const connection = snapshot.connections.find(value => value.id === form.selectedConnectionId)
  const modelId = form.selectedModelId.trim() || connection?.defaultModel.trim()
  const resultGroup = snapshot.conversations.find(value => value.id === operation?.conversationId)
  const update = (patch: Partial<TeamEditable>) => setForm(value => ({ ...value!, ...patch }))
  if (operation?.status === 'committed') return <div className="detail-section space-y-3">
    <h2 ref={resultTitle} tabIndex={-1}>{operation.memberIds.length} 位员工已创建</h2>
    <p>创建后由你发送第一条消息。</p>
    {operation.conversationId && (resultGroup ? <><p>群聊：{resultGroup.title}</p><Button onClick={() => onMessage('group', resultGroup.id)}>进入群聊</Button></> : <p>群聊已移除</p>)}
    {operation.memberIds.map(member => { const agent = snapshot.agents.find(a => a.id === member.agentId); return <div key={member.agentId} className="flex flex-wrap items-center gap-2"><span>{agent?.name ?? '成员已移除'}</span>{agent && <><Button variant="outline" onClick={() => onAgent(agent.id)}>查看 {agent.name}</Button><Button variant="outline" onClick={() => onMessage('agent', agent.id)}>联系 {agent.name}</Button></>}</div> })}
    {!operation.conversationId && <Button variant="outline" onClick={onGroup}>选择成员建群</Button>}
    <Button variant="outline" disabled={acting} onClick={() => { void run(async () => { install(await api.request('openTeamDraft', undefined)); setGeneration(undefined); setOperation(undefined); creationRequest.current = undefined }) }}>创建另一套</Button>
  </div>
  return <div className="detail-section">
    <h2>创建团队</h2>
    <p className="muted">描述你希望一起工作的成员。草稿仅保存在本机。</p>
    {error && <div ref={errorRegion} tabIndex={-1} aria-label="团队创建错误"><Banner>{error} 本地内容仍保留在下方。<Button variant="outline" onClick={() => { void api.request('getTeamDraft', { draftId: draft.id }).then(value => { current.current.draft = value.draft; setDraft(value.draft); setLatest(value.draft); setError('已读取最新版本，请比较并明确保存本地内容。') }).catch(e => setError(errorText(e))) }}>读取最新版本</Button></Banner></div>}
    {latest && <details open className="space-y-2 rounded-lg border p-3"><summary>最新已保存内容</summary><p>{latest.prompt}</p><p>群名称：{latest.groupTitle || '未填写'}</p>{latest.plan?.members.map(member => <p key={member.memberKey}>{member.name}：{member.role}</p>)}</details>}
    <form ref={formRef} data-edit-form className="form-grid" onInvalidCapture={event => { (event.target as HTMLElement).closest('details')?.setAttribute('open', '') }} onSubmit={event => { event.preventDefault(); void save().then(() => guard.saved()).catch(e => { focusError.current = true; setError(errorText(e)) }) }}>
      <fieldset disabled={locked} className="full min-w-0 space-y-3">
      <Field label="团队需求" hint="每次创建 1–12 位成员" full><Textarea required maxLength={4000} value={form.prompt} onChange={event => update({ prompt: event.target.value })} placeholder="例如：创建四人写作团队，负责策划、资料整理、撰写和审核" /></Field>
      <Field label="模型连接" full><SelectField value={form.selectedConnectionId} options={[{ value: '', label: '请选择模型连接' }, ...snapshot.connections.map(connection => ({ value: connection.id, label: connection.name }))]} onValueChange={selectedConnectionId => update({ selectedConnectionId, selectedModelId: '' })} /></Field>
      <Field label="模型" hint="留空使用连接的默认模型" full><Input value={form.selectedModelId} onChange={event => update({ selectedModelId: event.target.value })} /></Field>
      <div className="flex flex-wrap gap-2">{['写作团队', '产品讨论组', '角色玩家'].map((name, index) => <Button key={name} type="button" variant="outline" onClick={() => update({ prompt: ['创建四人写作团队，负责策划、资料整理、撰写和审核', '创建一个小型产品讨论组，成员有互补视角', '创建狼人杀玩家互动群，成员有不同性格'][index] })}>{name}</Button>)}</div>
      </fieldset>
      {(!connection || !modelId) && <Button type="button" variant="outline" onClick={onConfigure}>配置模型</Button>}
      {form.plan && <TeamPlanEditor plan={form.plan} names={snapshot.agents.map(agent => agent.name)} disabled={locked} titleRef={planTitle} onChange={plan => update({ plan })} />}
      <label className="full flex items-center gap-2"><Checkbox disabled={locked} checked={form.createGroup} onCheckedChange={checked => update({ createGroup: Boolean(checked) })} />同时创建群聊</label>
      {form.createGroup && <Field label="群名称" full><Input required={!!form.plan} disabled={locked} maxLength={200} value={form.groupTitle} onChange={e => update({ groupTitle: e.target.value })} /></Field>}
      {generation?.error && <Banner>{generation.error}</Banner>}
      {generation?.adjustment && <Banner kind="notice">{generation.adjustment.reason} 建议：{generation.adjustment.suggestedPrompt}</Banner>}
      {generation && <p className="muted">本次生成调用 {generation.attempts.length} 次；{generation.attempts.some(attempt => attempt.usage === 'unknown') ? '包含未知用量' : `已知用量 ${generation.attempts.reduce((sum, attempt) => sum + (attempt.usage === 'unknown' ? 0 : attempt.usage.inputTokens + attempt.usage.outputTokens), 0)} token`}</p>}
      <p role="status">{saving ? '正在保存…' : dirty ? '有未保存修改' : '草稿已保存'}</p>
      {operation && <div className="full space-y-2"><p role="status">{['accepted', 'preparing', 'ready_to_commit'].includes(operation.status) ? '正在准备成员工作区，尚未发布…' : '创建中断，尚未完成'}</p>
        {operation.error && <details><summary>查看诊断</summary><p className="break-all">{operation.error}</p></details>}
        {['interrupted', 'needs_attention'].includes(operation.status) && <div className="flex flex-wrap gap-2">
          {!operation.cancelRequested && <Button type="button" disabled={acting} onClick={() => { void run(async () => { await api.request('resumeTeamCreation', { operationId: operation.id, expectedVersion: operation.version }); await reload() }) }}>继续创建</Button>}
          <Button type="button" variant="outline" disabled={acting} onClick={() => { void run(async () => { const value = current.current.draft!; await api.request('abandonTeamDraft', { draftId: value.id, expectedVersion: value.version }); install(await api.request('openTeamDraft', undefined)); setOperation(undefined); setGeneration(undefined) }) }}>{operation.cancelRequested ? '继续清理' : '放弃并清理'}</Button>
        </div>}
      </div>}
      {!operation && <Button type="submit" disabled={saving || locked}>保存草稿</Button>}
      {!operation && form.plan && <><Button type="button" disabled={locked || !draft.planHash && !dirty} onClick={() => { void create() }}>创建 {form.plan.members.length} 位员工{form.createGroup ? '和群聊' : ''}</Button>{!!draft.validationErrors.length && <Banner kind="notice">{draft.validationErrors.join('；')}</Banner>}</>}
      {!operation && (draft.generationStatus === 'running' ? <><p role="status">正在设计成员与分工…</p><Button type="button" variant="outline" disabled={acting} onClick={() => { void run(async () => { await api.request('cancelTeamGeneration', { generationId: draft.generationId! }); await reload() }) }}>停止生成</Button></> : <>
        <p className="muted">生成方案会调用所选模型；创建后由你发送第一条消息。</p>
        <Button type="button" disabled={locked || !form.prompt.trim() || !connection || !modelId} onClick={() => { if (draft.manuallyEdited || dirty && form.plan) setConfirmRegenerate(true); else void generate() }}>{form.plan ? '重新生成' : '生成方案'}</Button>
      </>)}
      {!operation && <Button type="button" variant="ghost" disabled={locked} onClick={() => { void run(async () => { await save(); const value = current.current.draft!; await api.request('abandonTeamDraft', { draftId: value.id, expectedVersion: value.version }); install(await api.request('openTeamDraft', undefined)); setGeneration(undefined) }) }}>放弃草稿</Button>}
    </form>
    <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>替换已修改的方案？</AlertDialogTitle><AlertDialogDescription>重新生成会替换成员调整；失败或停止时保留上一份方案。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>保留修改</AlertDialogCancel><Button onClick={() => { setConfirmRegenerate(false); void generate() }}>确认重新生成</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

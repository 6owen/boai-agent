/*
 * [INPUT]: 固定成果 ID/版号/hash、实际 Markdown 预览/版本/采用/待验收资格回执与搜索来源失效 revision、当前聊天/成员和持久未决请求。
 * [OUTPUT]: 元信息与原成果明确来源消息分开读取，每次精确消息 limit1；明确“稍后验收此版本”才建立资格，冻结版号/hash/key、未知只核对与迟到版本隔离；所审版本不随新版发布漂移，真实来源/材料引用/采用历史；明确修订员工与核心默认连接，修订和采用冻结载荷，未知只核对原回执；隐藏停读，清理/撤权/外改及提交失败立即失效正文。
 * [POS]: 成果详情的受控数据/交互边界；不读取任意路径、不把外开当采用、不伪造审核或来源消息。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { Artifact, ConversationDetail, Snapshot } from '@shared/domain'
import type { ConversationMaterial } from '@shared/domain/materials'
import { ARTIFACT_LIMITS, type ArtifactAcceptanceInput, type ArtifactAcceptanceReceipt, type ArtifactAdoptionInput, type ArtifactPreview, type ArtifactRevisionInput, type ArtifactVersion } from '@shared/domain/artifacts'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Field, GuardContext, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { Textarea } from '@/components/ui/textarea'
import { MaterialMarkdown } from '@/pages/conversations/-components/material-citations'
import { materialErrorText } from '@/pages/conversations/-components/material-draft'
import { artifactAcceptanceReceiptMatches, artifactReceiptResult, artifactRequestAction, artifactRevisionTarget, type ArtifactPending, type ArtifactRequest } from './artifact-state'
import { readDetailMessages } from '@/pages/conversations/detail-reading'

export function ArtifactTab({ api, conversationId, id, logicalArtifactId, contentHash, expectedContentVersion, sourceRevision = 0, requestId, active, snapshot, pending, onPending, onVersion, onPreviewMaterial, onMessage, onActivity, onOpenPath, onSubmitted }: {
  api: DesktopApi; conversationId: string; id: string; logicalArtifactId: string; contentHash: string; expectedContentVersion?: number; sourceRevision?: number; requestId: string; active: boolean; snapshot: Snapshot
  pending?: ArtifactPending; onPending(value: Pick<ArtifactPending, 'revision' | 'adoption' | 'acceptance'>): boolean
  onVersion(artifact: ArtifactVersion): void; onPreviewMaterial(material: ConversationMaterial, line?: number): void
  onMessage(id: string): void; onActivity(): void; onOpenPath(path: string): void; onSubmitted(): void
}) {
  const [view, setView] = useState<{ preview: ArtifactPreview; detail: ConversationDetail; sourceRevision: number }>(), [loading, setLoading] = useState(false), [readError, setReadError] = useState('')
  const [externalArtifact, setExternalArtifact] = useState<Artifact>()
  const [refresh, setRefresh] = useState(0), [notice, setNotice] = useState(''), [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ content: '', targetAgentId: '' })
  const [acceptanceBusy, setAcceptanceBusy] = useState(false), [acceptanceError, setAcceptanceError] = useState('')
  const acceptanceGeneration = useRef(0), acceptanceFlight = useRef(0), requests = useRef<Pick<ArtifactPending, 'revision' | 'adoption' | 'acceptance'>>({}); requests.current = pending ?? {}
  const shown = useRef({ id, requestId, active }); shown.current = { id, requestId, active }
  const fixed = useRef({ id, requestId, hash: contentHash }), cleared = useRef(false), alive = useRef(true)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext)
  useEffect(() => { alive.current = true; return () => { alive.current = false; acceptanceGeneration.current++; const value = requests.current.acceptance; if (!cleared.current && value?.status === 'pending') onPending({ ...requests.current, acceptance: { ...value, status: 'unknown' } }) } }, [])
  useEffect(() => { acceptanceGeneration.current++; acceptanceFlight.current = 0; setAcceptanceBusy(false); if (!active && requests.current.acceptance?.status === 'pending') onPending({ ...requests.current, acceptance: { ...requests.current.acceptance, status: 'unknown' } }) }, [active, id, requestId])
  useEffect(() => {
    guard.setDirty(Boolean(editing && !pending?.revision && form.content.trim()))
    return () => guard.setDirty(false)
  }, [editing, pending?.revision, form.content, guard.setDirty])
  useEffect(() => {
    if (fixed.current.id !== id || fixed.current.requestId !== requestId) { fixed.current = { id, requestId, hash: contentHash }; setNotice(''); setAcceptanceError('') }
    let disposed = false, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined
    setView(undefined); setExternalArtifact(undefined); setReadError(''); setLoading(active && !cleared.current)
    const load = async () => {
      if (!active || cleared.current) return
      const token = ++sequence; setView(undefined); setExternalArtifact(undefined); setLoading(true); setReadError('')
      try {
        const [previewResult, detailResult] = await Promise.allSettled([api.request('getArtifactPreview', { id, expectedHash: fixed.current.hash || undefined }), api.request('getConversationMetadata', { id: conversationId })])
        if (disposed || token !== sequence || cleared.current) return
        if (detailResult.status === 'rejected') throw detailResult.reason
        const detail = detailResult.value
        setExternalArtifact(detail.artifacts.find(value => value.id === id))
        if (previewResult.status === 'rejected') throw previewResult.reason
        const preview = previewResult.value
        if (preview.artifact.id !== id || preview.artifact.conversationId !== conversationId || preview.artifact.logicalArtifactId !== logicalArtifactId || expectedContentVersion !== undefined && preview.artifact.contentVersion !== expectedContentVersion || fixed.current.hash && preview.artifact.contentHash !== fixed.current.hash) throw new Error('成果版本已变化，请重新打开明确版本。')
        if (preview.artifact.contentStatus !== 'ready') throw new Error(preview.artifact.contentError ?? '本版成果不可预览。')
        if (preview.text.length > ARTIFACT_LIMITS.previewCharacters || new TextEncoder().encode(preview.text).length > ARTIFACT_LIMITS.previewBytes) throw new Error('成果超过预览范围，请使用外部打开。')
        const source = await readDetailMessages(api, conversationId, preview.artifact.sourceMessageId ? [preview.artifact.sourceMessageId] : [], () => !disposed && token === sequence && !cleared.current)
        if (disposed || token !== sequence || cleared.current) return
        detail.messages = source.flatMap(item => item.status === 'available' && item.message ? [item.message] : [])
        fixed.current.hash = preview.artifact.contentHash
        setView({ preview, detail, sourceRevision }); setLoading(false)
      } catch (failure) { if (!disposed && token === sequence) { setView(undefined); setLoading(false); setReadError(materialErrorText(errorText(failure))) } }
    }
    if (active && !cleared.current) void load()
    if (cleared.current) setReadError('来源聊天已清理或移除，本版成果不可用。')
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) {
        cleared.current = true; sequence++; clearTimeout(timer); timer = undefined; setView(undefined); setExternalArtifact(undefined); setLoading(false); setEditing(false); setForm({ content: '', targetAgentId: '' }); setReadError('来源聊天已清理或移除，本版成果不可用。'); guard.setDirty(false); return
      }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== conversationId) return
      sequence++; setView(undefined); setExternalArtifact(undefined); setLoading(active)
      if (active && !cleared.current && !timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, id, logicalArtifactId, contentHash, expectedContentVersion, sourceRevision, requestId, active, refresh, guard.setDirty])

  const current = view?.sourceRevision === sourceRevision && view.preview.artifact.id === id && view.preview.artifact.contentHash === fixed.current.hash ? view : undefined
  const preview = current?.preview, artifact = preview?.artifact, detail = current?.detail
  const members = snapshot.agents.filter(agent => detail?.conversation.agentIds.includes(agent.id))
  const executable = (agentId: string) => Boolean(artifactRevisionTarget(members.find(value => value.id === agentId), snapshot.connections))
  const originalAuthor = artifact?.ownerAgentId, author = snapshot.agents.find(agent => agent.id === originalAuthor)
  const sourceMessage = detail?.messages.find(message => message.id === artifact?.sourceMessageId)
  const newer = preview?.versions.filter(version => artifact && version.contentVersion > artifact.contentVersion).sort((first, second) => first.contentVersion - second.contentVersion) ?? []
  const versionName = (artifactId: string) => { const version = preview?.versions.find(value => value.id === artifactId); return version ? `第 ${version.contentVersion} 版` : '原版本' }
  const saveRequests = (value: Pick<ArtifactPending, 'revision' | 'adoption' | 'acceptance'>) => { const saved = onPending(value); if (saved) requests.current = value; return saved }
  const saveRevision = (revision?: ArtifactRequest<ArtifactRevisionInput>) => saveRequests({ ...requests.current, revision })
  const saveAdoption = (adoption?: ArtifactRequest<ArtifactAdoptionInput>) => saveRequests({ ...requests.current, adoption })
  const saveAcceptance = (acceptance?: ArtifactRequest<ArtifactAcceptanceInput>) => saveRequests({ ...requests.current, acceptance })
  const ensureSaved = (saved: boolean) => { if (!saved) throw new Error('未能保存请求身份，请先恢复本地存储后重试。请求不会在后台重发。') }
  const invalidateRead = (failure: unknown) => { setView(undefined); setExternalArtifact(undefined); setReadError(materialErrorText(errorText(failure))); setRefresh(value => value + 1) }
  const finishRevision = () => {
    if (!alive.current || cleared.current) return
    saveRevision(); setEditing(false); setForm({ content: '', targetAgentId: '' }); setNotice('修改要求已提交。新版发布后可从版本列表打开。'); guard.saved(); onSubmitted()
  }
  const finishAdoption = () => {
    if (!alive.current || cleared.current) return
    saveAdoption(); setNotice('已采用明确版本。'); setRefresh(value => value + 1)
  }
  const lookupRevision = async (request: ArtifactRequest<ArtifactRevisionInput>) => {
    const receipt = await api.request('getMessageReceipt', { requestId: request.input.requestId })
    if (!alive.current || cleared.current) return
    if (receipt) {
      if (receipt.conversationId !== conversationId) throw new Error('修订回执不属于当前聊天。')
      finishRevision(); return true
    } else { ensureSaved(saveRevision(artifactReceiptResult(request, false))); setNotice('原修改请求尚未受理，可以重试原请求或明确放弃后编辑。') }
    return false
  }
  const submitRevision = async () => {
    const action = artifactRequestAction(pending?.revision)
    if (action === 'wait') return
    if (action === 'lookup') { await lookupRevision(pending!.revision!); return }
    if (!artifact || !form.content.trim() && !pending?.revision || !pending?.revision && !executable(form.targetAgentId)) return
    const request: ArtifactRequest<ArtifactRevisionInput> = pending?.revision ?? { status: 'pending', input: { conversationId, artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId: form.targetAgentId, content: form.content.trim(), requestId: crypto.randomUUID() } }
    if (!saveRevision({ ...request, status: 'pending' })) { saveRevision({ ...request, status: 'not_accepted' }); ensureSaved(false) }
    try { await api.request('reviseArtifact', request.input); finishRevision() }
    catch (failure) {
      if (!alive.current || cleared.current) return
      invalidateRead(failure)
      const unknown: ArtifactRequest<ArtifactRevisionInput> = { ...request, status: 'unknown' }; saveRevision(unknown)
      try { if (await lookupRevision(unknown)) return } catch { /* Keep the frozen request for explicit read-only reconciliation. */ }
      throw failure
    }
  }
  const lookupAdoption = async (request: ArtifactRequest<ArtifactAdoptionInput>) => {
    const receipt = await api.request('getArtifactAdoptionReceipt', { requestId: request.input.requestId })
    if (!alive.current || cleared.current) return
    if (receipt) {
      if (receipt.conversationId !== conversationId || receipt.logicalArtifactId !== logicalArtifactId || receipt.artifactId !== request.input.artifactId || receipt.contentHash !== request.input.contentHash) throw new Error('采用回执与原版本不一致。')
      finishAdoption(); return true
    } else { ensureSaved(saveAdoption(artifactReceiptResult(request, false))); setNotice('原采用请求尚未受理，可以重试原请求或明确放弃。') }
    return false
  }
  const adopt = async () => {
    const action = artifactRequestAction(pending?.adoption)
    if (action === 'wait') return
    if (action === 'lookup') { await lookupAdoption(pending!.adoption!); return }
    if (!artifact || !preview) return
    const request: ArtifactRequest<ArtifactAdoptionInput> = pending?.adoption ?? { status: 'pending', input: { artifactId: artifact.id, contentHash: artifact.contentHash, expectedAdoptionRevision: preview.adoption.revision, requestId: crypto.randomUUID() } }
    if (!saveAdoption({ ...request, status: 'pending' })) { saveAdoption({ ...request, status: 'not_accepted' }); ensureSaved(false) }
    try { await api.request('adoptArtifact', request.input); finishAdoption() }
    catch (failure) {
      if (!alive.current || cleared.current) return
      invalidateRead(failure)
      const unknown: ArtifactRequest<ArtifactAdoptionInput> = { ...request, status: 'unknown' }; saveAdoption(unknown)
      try { if (await lookupAdoption(unknown)) return } catch { /* Unknown adoption is checked only by its original receipt key. */ }
      throw failure
    }
  }
  const openRevision = () => {
    if (!artifact) return
    setEditing(true); setNotice('')
    if (!pending?.revision) setForm({ content: '', targetAgentId: originalAuthor && executable(originalAuthor) ? originalAuthor : '' })
  }
  const discardRevision = () => {
    const request = pending?.revision
    if (request?.status !== 'not_accepted') return
    ensureSaved(saveRevision()); setEditing(true); setForm({ content: request.input.content, targetAgentId: executable(request.input.targetAgentId) ? request.input.targetAgentId : '' }); setNotice('已放弃未受理请求。接下来修改针对当前所审版本。')
  }
  const adopted = artifact && preview?.adoption.current?.artifactId === artifact.id && preview.adoption.current.contentHash === artifact.contentHash
  const deferAcceptance = async () => {
    if (!active || cleared.current || busy || acceptanceFlight.current) return
    const saved = requests.current.acceptance
    if (saved?.status === 'pending' || !saved && (!artifact || !preview)) return
    const request: ArtifactRequest<ArtifactAcceptanceInput> = saved ?? { status: 'pending', input: { artifactId: artifact!.id, logicalArtifactId: artifact!.logicalArtifactId, contentVersion: artifact!.contentVersion, contentHash: artifact!.contentHash, expectedAcceptanceRevision: preview!.acceptance?.revision ?? 0, requestId: crypto.randomUUID() } }
    const token = ++acceptanceGeneration.current, targetRequestId = fixed.current.requestId
    acceptanceFlight.current = token; setAcceptanceBusy(true); setAcceptanceError('')
    const valid = () => alive.current && shown.current.active && !cleared.current && token === acceptanceGeneration.current && shown.current.requestId === targetRequestId && fixed.current.requestId === targetRequestId
    const finish = (receipt: ArtifactAcceptanceReceipt) => {
      if (!artifactAcceptanceReceiptMatches(request.input, receipt, conversationId)) throw new Error('待验收回执与原版本不一致，请保留原请求核对。')
      if (requests.current.acceptance?.input.requestId !== request.input.requestId) throw new Error('原待验收请求身份已变化，请重新核对。')
      ensureSaved(saveAcceptance()); setRefresh(value => value + 1); onSubmitted()
      if (fixed.current.id === request.input.artifactId && fixed.current.hash === request.input.contentHash) setNotice(receipt.acceptance.status === 'pending' ? '已加入待验收，仍需你明确采用或提出修改。' : '原待验收请求已受理；资格当前状态已变化，请核对来源。')
    }
    const lookup = async () => {
      const receipt = await api.request('getArtifactAcceptanceReceipt', { requestId: request.input.requestId })
      if (!valid()) return true
      if (receipt) { finish(receipt); return true }
      ensureSaved(saveAcceptance({ ...request, status: 'not_accepted' })); setNotice('原待验收请求尚未受理，可明确重试原请求或放弃。'); return false
    }
    try {
      if (saved?.status === 'unknown') { await lookup(); return }
      if (saved && await lookup()) return
      ensureSaved(saveAcceptance({ ...request, status: 'pending' }))
      const receipt = await api.request('requestArtifactAcceptance', request.input)
      if (valid()) finish(receipt)
    } catch (failure) {
      if (valid()) { if (requests.current.acceptance?.input.requestId === request.input.requestId) saveAcceptance({ ...request, status: 'unknown' }); setAcceptanceError(materialErrorText(errorText(failure))); invalidateRead(failure) }
    } finally { if (acceptanceFlight.current === token) acceptanceFlight.current = 0; if (valid()) setAcceptanceBusy(false) }
  }
  return <div className="detail-section flex min-h-0 flex-1 flex-col gap-3" data-artifact-id={id}>
    {error && <Banner>{materialErrorText(error)}</Banner>}{acceptanceError && <Banner>{acceptanceError}</Banner>}{notice && <Banner kind="notice">{notice}</Banner>}
    {readError && <Banner>{readError}</Banner>}
    {readError && externalArtifact?.id === id && !cleared.current && <Button variant="ghost" size="sm" onClick={() => onOpenPath(externalArtifact.path)}>外部打开</Button>}
    {loading && <Loading>正在核对成果版本…</Loading>}
    {readError && !cleared.current && active && <Button variant="secondary" size="sm" onClick={() => setRefresh(value => value + 1)}>重新核对成果</Button>}
    {artifact && preview && detail && <>
      <div className="flex flex-col gap-1"><h3 className="break-words">{artifact.name} · 第 {artifact.contentVersion} 版</h3><p className="field-hint">作者：{author?.name ?? (sourceMessage && sourceMessage.senderId === originalAuthor ? sourceMessage.senderName : '已移除员工')}{artifact.publishedAt && <> · {new Date(artifact.publishedAt).toLocaleString('zh-CN')}</>}</p><p className="field-hint">未记录本版审核</p></div>
      <div className="button-row">
        {sourceMessage ? <Button variant="link" size="sm" onClick={() => onMessage(sourceMessage.id)}>来源消息</Button> : <span className="field-hint">{artifact.sourceMessageId ? '来源消息已不可用' : '未记录来源消息'}</span>}
        {artifact.sourceWorkId && detail.workItems?.some(work => work.id === artifact.sourceWorkId) ? <Button variant="link" size="sm" onClick={onActivity}>来源工作</Button> : <span className="field-hint">{artifact.sourceWorkId ? '来源工作已不可用' : '未记录来源工作'}</span>}
        <Button variant="ghost" size="sm" onClick={() => onOpenPath(artifact.path)}>外部打开</Button>
      </div>
      {!!newer.length && <Banner kind="notice">有新版本。当前仍在审阅第 {artifact.contentVersion} 版。<Button variant="link" size="sm" onClick={() => guard.navigate(() => onVersion(newer.at(-1)!))}>查看新版</Button></Banner>}
      <details><summary>版本 · {preview.versions.length}</summary><div className="flex flex-col gap-1">{preview.versions.map(version => <Button key={version.id} variant={version.id === artifact.id ? 'secondary' : 'ghost'} size="sm" className="justify-start" aria-pressed={version.id === artifact.id} onClick={() => guard.navigate(() => onVersion(version))}>第 {version.contentVersion} 版 · {version.name}{preview.adoption.current?.artifactId === version.id ? ' · 当前采用' : ''}{version.id === artifact.id ? ' · 正在审阅' : ''}</Button>)}</div></details>
      <details><summary>内容身份</summary><p className="field-hint break-all">{artifact.contentHash}</p></details>
      <section className="markdown" aria-label={`成果第 ${artifact.contentVersion} 版正文`}><MaterialMarkdown source={{ content: preview.text, materialSources: artifact.materialSources }} detail={detail} onPreview={onPreviewMaterial} /></section>
      <section className="flex flex-col gap-2" aria-label="采用记录"><strong>{preview.adoption.current ? `当前采用：第 ${preview.adoption.current.contentVersion} 版` : '未记录人工采用'}</strong><details><summary>采用历史 · {preview.adoption.events.length}</summary>{preview.adoption.events.map(event => <p key={event.id} className="field-hint">你 · 第 {event.contentVersion} 版 · {new Date(event.adoptedAt).toLocaleString('zh-CN')}</p>)}</details></section>
      {preview.acceptance && <p className="field-hint">待验收资格：{{ pending: '待验收', adopted: '已采用', revision_requested: '已提出修改', superseded: '已有新版', unavailable: '来源不可用' }[preview.acceptance.status]}</p>}
      <div className="button-row flex-wrap"><Button variant="secondary" size="sm" disabled={busy || acceptanceBusy || Boolean(pending?.revision) || Boolean(pending?.acceptance)} onClick={openRevision}>要求修改</Button><Button size="sm" disabled={busy || acceptanceBusy || Boolean(pending?.adoption) || Boolean(pending?.acceptance) || Boolean(adopted)} onClick={() => void run(adopt)}>{adopted ? '已采用此版本' : '采用此版本'}</Button><Button variant="ghost" size="sm" disabled={busy || acceptanceBusy || Boolean(pending?.acceptance || pending?.revision || pending?.adoption) || Boolean(preview.acceptance) || Boolean(adopted)} onClick={() => void deferAcceptance()}>稍后验收此版本</Button></div>
    </>}
    {(editing || pending?.revision) && <form data-edit-form className="flex flex-col gap-3 soft-card p-3" onSubmit={event => { event.preventDefault(); void run(submitRevision) }}>
      <strong>要求修改 · {pending?.revision ? versionName(pending.revision.input.artifactId) : artifact ? `第 ${artifact.contentVersion} 版` : '当前版本'}</strong>
      {pending?.revision ? <><p className="field-hint">原修改要求与执行员工已固定，核对前不能覆盖。</p><p className="whitespace-pre-wrap break-words">{pending.revision.input.content}</p><p className="field-hint">执行员工：{snapshot.agents.find(agent => agent.id === pending.revision!.input.targetAgentId)?.name ?? '已移除员工'}</p><Button type="submit" size="sm" disabled={busy || pending.revision.status === 'pending'}>{pending.revision.status === 'unknown' ? '核对修改结果' : pending.revision.status === 'pending' ? '正在提交…' : '重试原修改请求'}</Button>{pending.revision.status === 'not_accepted' && <Button variant="ghost" size="sm" disabled={busy || !artifact} onClick={() => void run(async () => discardRevision())}>放弃未受理请求并编辑此版</Button>}</> : <>
        <p className="field-hint">修改将作为新的用户请求提交，保留原版和原工作结果。</p>
        <Field label="执行员工"><SelectField value={form.targetAgentId} disabled={busy || !artifact} required onValueChange={targetAgentId => setForm(value => ({ ...value, targetAgentId }))} options={[{ value: '', label: '请选择执行员工' }, ...members.map(agent => ({ value: agent.id, label: `${agent.name}${agent.id === originalAuthor ? ' · 原作者' : ''}${executable(agent.id) ? '' : ' · 不可执行'}`, disabled: !executable(agent.id) }))]} /></Field>
        {originalAuthor && !executable(originalAuthor) && <p className="field-hint">原作者已移除、停用或配置不可用，请明确选择其他可执行成员。</p>}
        <Field label="修改要求"><Textarea required rows={4} maxLength={ARTIFACT_LIMITS.revisionCharacters} value={form.content} disabled={busy || !artifact} onChange={event => setForm(value => ({ ...value, content: event.target.value }))} /></Field>
        <div className="button-row"><Button type="submit" size="sm" disabled={busy || !artifact || !form.content.trim() || !executable(form.targetAgentId)}>提交修改要求</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => guard.navigate(() => { setEditing(false); setForm({ content: '', targetAgentId: '' }) })}>取消编辑</Button></div>
      </>}
    </form>}
    {pending?.adoption && <section className="soft-card flex flex-col gap-2 p-3" aria-label="未决采用请求"><strong>采用 · {versionName(pending.adoption.input.artifactId)}</strong><p className="field-hint">原版本与所见内容身份已固定。</p><Button size="sm" disabled={busy || pending.adoption.status === 'pending'} onClick={() => void run(adopt)}>{pending.adoption.status === 'unknown' ? '核对采用结果' : pending.adoption.status === 'pending' ? '正在提交…' : '重试原采用请求'}</Button>{pending.adoption.status === 'not_accepted' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => ensureSaved(saveAdoption()))}>放弃未受理采用</Button>}</section>}
    {pending?.acceptance && <section className="soft-card flex flex-col gap-2 p-3" aria-label="未决待验收请求"><strong>稍后验收 · 第 {pending.acceptance.input.contentVersion} 版</strong><p className="field-hint break-all">{pending.acceptance.input.contentHash}</p><p className="field-hint">原成果版本与请求身份已固定，打开或核对不表示已经采用。</p><Button size="sm" disabled={acceptanceBusy || pending.acceptance.status === 'pending'} onClick={() => void deferAcceptance()}>{pending.acceptance.status === 'unknown' ? '核对待验收结果' : pending.acceptance.status === 'pending' ? '正在提交…' : '重试原待验收请求'}</Button>{pending.acceptance.status === 'not_accepted' && <Button variant="ghost" size="sm" disabled={acceptanceBusy} onClick={() => { try { ensureSaved(saveAcceptance()) } catch (failure) { setAcceptanceError(errorText(failure)) } }}>放弃未受理待验收</Button>}</section>}
  </div>
}

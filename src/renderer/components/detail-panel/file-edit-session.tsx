/*
 * [OUTPUT]: 关闭后重选可读当前精确原件最近受理结果，新选区草稿/提交独立，不混入其他原件或代际。
 * [OUTPUT]: 2026-10-15最新16组03 §16替代旧只读镜像/额外讨论：渠道记录直接续聊共用上下文与session，回发按本轮来源；回答工具条明确发送，实际进度02 §7.23。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 原版SelectionActions横向展开五动作；员工Select为同排trigger，不展示位置/选文/员工下方表单。
 * [OUTPUT]: 渠道文件修改在独立内部会话执行，不触发平台回发；来源/hash仍固定。
 * [OUTPUT]: 请求读取归宿主；交付自动切版或来源失效关闭旧选文浮层，关闭操作条后仍跟随本次交付。
 * [INPUT]: 文件宿主核验身份、现有员工快照、真实选文锚点和显式要求。
 * [OUTPUT]: 同一Selection Actions Popover内直接提交/查看本次结果；无底部会话、无主聊天草稿/路由变更。
 * [POS]: 成果/附件共用的浮层修改生命周期；沿原IPC身份权限、持久请求和未知只读核对。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { useEffect, useImperativeHandle, useState, type Ref } from 'react'
import type { Artifact, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { fileEditContent, type FileEditAnnotation } from '@shared/domain/file-edit'
import { Banner, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Select, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { SelectionActionButton } from '@/components/ui/selection-actions-button'
import { NavArrowDown } from 'iconoir-react'
import { SelectionActions } from '@/components/ui/selection-actions'
import { artifactRevisionTarget } from './artifact-state'
import type { useFileEdits } from './use-file-edits'
import { sameFileEditSource, type FileEditRequest, type FileEditSource } from './file-edit-state'

export interface FileEditHandle { begin(source: FileEditSource, annotation: FileEditAnnotation, anchor: DOMRect): void }
export function FileEditSession({ api, snapshot, edits, conversationId, source, active, onResult, ref }: {
  api: DesktopApi; snapshot: Snapshot; edits: ReturnType<typeof useFileEdits>; conversationId: string; source?: FileEditSource; active: boolean
  onResult(artifact: Artifact): void; ref: Ref<FileEditHandle>
}) {
  const [open, setOpen] = useState(false), [anchor, setAnchor] = useState<DOMRect>()
  const [target, setTarget] = useState<FileEditSource>(), [annotation, setAnnotation] = useState<FileEditAnnotation>({}), [text, setText] = useState(''), [agentId, setAgentId] = useState(''), [error, setError] = useState('')
  const [requestId, setRequestId] = useState<string>()
  const [preparing, setPreparing] = useState(false)
  const room = snapshot.conversations.find(room => room.id === conversationId)
  const members = snapshot.agents.filter(agent => room?.agentIds.includes(agent.id))
  const pending = edits.requests.find(request => request.status !== 'accepted')
  const valid = !!source && !!target && source.id === target.id && source.contentHash === target.contentHash && (source.kind !== 'material' || target.kind === 'material' && source.revision === target.revision) && !edits.unavailable
  useEffect(() => { if (!active) setOpen(false) }, [active])
  const sourceVersion = source?.kind === 'material' ? source.revision : source?.contentVersion
  useEffect(() => { setOpen(false) }, [source?.id, source?.contentHash, sourceVersion])
  // A fixed selection anchor is no longer meaningful after the document moves.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const scroll = (event: Event) => { if (event.target instanceof Element && event.target.closest('.file-preview-detail') && !event.target.closest('[data-file-preview-actions]')) close() }
    window.addEventListener('resize', close); window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', scroll, true) }
  }, [open])
  useImperativeHandle(ref, () => ({ begin(next, selected, nextAnchor) {
    const changed = !!target && (target.id !== next.id || target.contentHash !== next.contentHash || target.kind === 'material' && next.kind === 'material' && target.revision !== next.revision)
    const begin = () => {
      setAnchor(nextAnchor); setOpen(true); setError('')
      if (pending) { setTarget(next); setAgentId(pending.agentId); setRequestId(pending.id); return }
      setTarget(next)
      // Preserve a dismissed draft's annotation; a new explicit selection replaces it.
      if (selected.quote || changed || !text.trim()) setAnnotation(selected)
      if (changed) setText('')
      const eligible = members.filter(agent => artifactRevisionTarget(agent, snapshot.connections))
      const employee = eligible.find(agent => agent.id === agentId) ?? (next.kind === 'artifact' ? eligible.find(agent => agent.id === next.ownerAgentId) : undefined) ?? (eligible.length === 1 ? eligible[0] : undefined)
      setAgentId(employee?.id ?? '')
      setRequestId(selected.quote ? undefined : edits.requests.at(-1)?.id)
    }
    begin()
  } }), [pending, target, text, members, snapshot.connections, agentId, edits.requests])
  const submit = async (instruction: string) => {
    if (!target || !valid || !instruction.trim() || pending || edits.busy || preparing) return
    if (!artifactRevisionTarget(members.find(agent => agent.id === agentId), snapshot.connections)) { setText(instruction); setError('请选择有当前文件权限的可执行员工。'); return }
    const content = fileEditContent(instruction.trim(), annotation)
    if (content.length > 12_000) { setError('修改要求与选中文本合计最多12000字，请缩短后发送。'); return }
    setPreparing(true)
    try {
      const request: FileEditRequest = { id: crypto.randomUUID(), source: target, agentId, content, createdAt: new Date().toISOString(), status: 'pending' }
      setError(''); setRequestId(request.id)
      if (await edits.execute(request, 'send')) { setText(''); setAnnotation({}) }
    } catch (failure) { setError(errorText(failure)) }
    finally { setPreparing(false) }
  }
  const accepted = source ? edits.requests.filter(request => request.status === 'accepted' && sameFileEditSource(request.source, source)) : []
  // Selecting new text starts a fresh draft, but must not discard access to the
  // accepted response. Only this draft's submission owns the toolbar busy state.
  const request = pending ?? accepted.find(request => request.id === requestId) ?? accepted.at(-1)
  const result = edits.results.find(result => result.request.id === request?.id)
  const replies = edits.messages.filter(message => result?.messageIds.includes(message.id))
  const running = result?.runs.some(run => run.phase !== 'memory' && ['queued', 'running', 'waiting_approval'].includes(run.status))
  const failed = result?.runs.find(run => run.phase !== 'memory' && ['failed', 'cancelled', 'interrupted'].includes(run.status))
  const failure = error || edits.error || edits.readError
  if (!anchor || !active) return null
  return <SelectionActions anchor={anchor} open={open} onOpenChange={setOpen} prompt={text} onPromptChange={setText} onAction={instruction => void submit(instruction)}
    disabled={!valid || !agentId || edits.busy || preparing} employeeRequired={!agentId} pending={!!pending} busy={!!running && request?.id === requestId || preparing}
    employeeSelector={members.length > 1 || !agentId ? <Select value={agentId} onValueChange={value => { if (value !== null) setAgentId(String(value)) }}>
      <SelectPrimitive.Trigger aria-label="修改执行员工" render={<SelectionActionButton variant="quiet" size="xs" className="shrink-0" />}>
        <span className="max-w-20 truncate">{members.find(agent => agent.id === agentId)?.name ?? '选择员工'}</span><NavArrowDown width={14} height={14} aria-hidden />
      </SelectPrimitive.Trigger>
      <SelectContent align="start" alignItemWithTrigger={false}><SelectGroup>
        {members.map(agent => <SelectItem key={agent.id} value={agent.id} label={agent.name} disabled={!artifactRevisionTarget(agent, snapshot.connections)}>{agent.name}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select> : undefined}>
    {(failure || request || target && !valid) && <>
      {failure && <Banner>{failure}</Banner>}
      {target && !valid && <p className="field-hint">正在核对原文件；来源失效时不能提交修改。</p>}
      {pending ? <div className="flex flex-wrap items-center gap-2" role="status">
        <span className="field-hint">{pending.status === 'pending' ? '正在提交修改…' : pending.status === 'not_accepted' ? '原要求尚未受理' : '提交结果待核对'}</span>
        <Button size="xs" variant="secondary" disabled={edits.busy} onClick={() => { void edits.execute(pending, 'check').then(accepted => { if (accepted) { setText(''); setAnnotation({}) } }) }}>核对修改结果</Button>
        {pending.status === 'not_accepted' && <><Button size="xs" disabled={edits.busy || !source} onClick={() => { void edits.execute(pending, 'retry').then(accepted => { if (accepted) { setText(''); setAnnotation({}) } }) }}>重试原修改</Button><Button size="xs" variant="ghost" disabled={edits.busy} onClick={() => edits.discard(pending)}>放弃原请求</Button></>}
      </div> : request && <div className="flex max-h-64 flex-col gap-2 overflow-y-auto" aria-label="本次修改结果">
        <p className="field-hint" role="status">{running ? '员工正在处理…' : failed ? `处理${failed.status === 'failed' ? '失败' : '已停止'}${failed.error ? `：${failed.error}` : ''}` : result?.artifacts.length ? '修改结果已交付' : result?.runs.length ? '本次处理已结束' : '修改要求已送达员工'}</p>
        {replies.map(message => <p key={message.id} className="m-0 whitespace-pre-wrap text-sm">{message.content}</p>)}
        {result?.artifacts.map(artifact => <Button key={artifact.id} variant="secondary" size="xs" onClick={() => { setText(''); setAnnotation({}); setOpen(false); onResult(artifact) }}>查看修改结果：{artifact.name}</Button>)}
      </div>}
    </>}
  </SelectionActions>
}

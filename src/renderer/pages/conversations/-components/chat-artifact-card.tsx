/*
 * [INPUT]: 原员工交付消息中的成果身份、当前聊天与持久采用/修订/待验收请求。
 * [OUTPUT]: 紧凑文件卡直接预览/采用/要求修改/稍后处理；事件后台复核不反复闪空，动作仍由宿主核对固定版本；未知请求在原聊天只读核对，修订使用同一composer。
 * [POS]: 聊天交付交互，不将人工处理搬入右侧预览，不根据文件名推断新版本。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { Artifact } from '@shared/domain'
import type { ArtifactPreview, ArtifactRevisionInput } from '@shared/domain/artifacts'
import type { DesktopApi } from '@shared/ipc'
import { artifactPendingKey, type ArtifactPending } from '@/components/detail-panel/artifact-state'
import { Button } from '@/components/ui/button'
import { errorText } from '@/components/common'
import { ArtifactList } from './artifact-list'
import { materialErrorText } from './material-draft'
import type { ChatArtifacts, ChatArtifactRevisionTarget } from '../use-chat-artifacts'

export function ChatArtifactCard({ api, artifact, conversationId, active, actions, busy, onOpenPath, onPreview, onRevise }: {
  api: DesktopApi; artifact: Artifact; conversationId: string; active: boolean; actions: ChatArtifacts; busy: boolean
  onOpenPath(path: string): void; onPreview(artifact: Artifact): void; onRevise(target: ChatArtifactRevisionTarget): void
}) {
  const logicalArtifactId = artifact.logicalArtifactId ?? artifact.id ?? ''
  const target = { scope: 'conversations', conversationId, logicalArtifactId }
  const related = Object.values(actions.values).filter(value => value.conversationId === conversationId && value.logicalArtifactId === logicalArtifactId && (value.revision || value.adoption || value.acceptance))
  const pending = related.length > 0, key = artifactPendingKey(target.scope, conversationId, logicalArtifactId)
  const [preview, setPreview] = useState<ArtifactPreview>(), [readError, setReadError] = useState(''), [refresh, setRefresh] = useState(0)
  const actionError = actions.errors[key]
  useEffect(() => {
    let disposed = false, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined, cleared = false
    const load = async (background = false) => {
      if (!active || !artifact.id || cleared) return
      const token = ++sequence
      if (!background) { setPreview(undefined); setReadError('') }
      try {
        const value = await api.request('getArtifactPreview', { id: artifact.id, expectedHash: artifact.contentHash })
        if (disposed || cleared || token !== sequence) return
        if (value.artifact.id !== artifact.id || value.artifact.conversationId !== conversationId || value.artifact.logicalArtifactId !== logicalArtifactId || artifact.contentHash && value.artifact.contentHash !== artifact.contentHash || artifact.contentVersion !== undefined && value.artifact.contentVersion !== artifact.contentVersion) throw new Error('成果版本已变化，请重新打开原消息。')
        setPreview(value); setReadError('')
      } catch (failure) { if (!disposed && token === sequence) { setPreview(undefined); setReadError(materialErrorText(errorText(failure))) } }
    }
    if (active) void load(); else setPreview(undefined)
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) { cleared = true; sequence++; clearTimeout(timer); setPreview(undefined); return }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== conversationId) return
      sequence++
      // Cards show metadata only; keep them stable while the host rechecks every mutation.
      if (active && !timer) timer = setTimeout(() => { timer = undefined; void load(true) }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, active, artifact.id, artifact.contentHash, artifact.contentVersion, artifact.contentStatus, conversationId, logicalArtifactId, pending, actionError, refresh])
  const fixed = preview?.artifact, adopted = fixed && preview?.adoption.current?.artifactId === fixed.id && preview.adoption.current.contentHash === fixed.contentHash
  const acceptance = preview?.acceptance?.status === 'pending'
  const locked = busy || !active || pending || actions.busy.has(key) || !fixed || fixed.contentStatus !== 'ready'
  return <section data-chat-artifact-id={artifact.id} aria-label={`交付文件 ${artifact.name}`} className="flex min-w-0 flex-col gap-1">
    <ArtifactList artifacts={[artifact]} onOpenPath={onOpenPath} onPreview={onPreview} />
    {!!artifact.id && <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="ghost" disabled={locked || Boolean(adopted)} onClick={() => void actions.execute(target, 'adoption', { artifactId: fixed!.id, contentHash: fixed!.contentHash, expectedAdoptionRevision: preview!.adoption.revision, requestId: crypto.randomUUID() })}>{adopted ? '已采用此版本' : '采用此版本'}</Button>
      <Button size="sm" variant="ghost" disabled={locked} onClick={() => onRevise({ artifactId: fixed!.id, logicalArtifactId, contentHash: fixed!.contentHash, contentVersion: fixed!.contentVersion, name: fixed!.name, targetAgentId: fixed!.ownerAgentId ?? '' })}>要求修改</Button>
      <Button size="sm" variant="ghost" disabled={locked || Boolean(adopted || acceptance)} onClick={() => void actions.execute(target, 'acceptance', { artifactId: fixed!.id, logicalArtifactId, contentVersion: fixed!.contentVersion, contentHash: fixed!.contentHash, expectedAcceptanceRevision: preview!.acceptance?.revision ?? 0, requestId: crypto.randomUUID() })}>{acceptance ? '已留待处理' : '稍后处理'}</Button>
    </div>}
    {readError && <p role="status" className="field-hint">{readError}<Button variant="link" size="sm" disabled={!active || busy} onClick={() => setRefresh(value => value + 1)}>重新核对成果</Button></p>}
    {actionError && !pending && <p role="status" className="field-hint">{actionError}</p>}
  </section>
}

export function PendingArtifactActions({ pending, artifacts, actions, active, onRestoreRevision }: { pending: ArtifactPending; artifacts: Artifact[]; actions: ChatArtifacts; active: boolean; onRestoreRevision(input: ArtifactRevisionInput, logicalArtifactId: string): void }) {
  const key = artifactPendingKey(pending.scope, pending.conversationId, pending.logicalArtifactId)
  const labels = { revision: '修改', adoption: '采用', acceptance: '待验收' }
  return <section className="soft-card flex flex-col gap-2 p-3" data-artifact-pending-key={key} aria-label="未决成果请求">
    {(['revision', 'adoption', 'acceptance'] as const).map(kind => {
      const request = pending[kind]
      if (!request) return null
      const artifact = artifacts.find(value => value.id === request.input.artifactId)
      const label = labels[kind], busy = !active || actions.busy.has(key) || request.status === 'pending'
      return <div key={kind} className="flex flex-col gap-1" role="region" aria-label={`未决${label}请求`}>
        <strong>{label} · {artifact?.name ?? '原文件已不可用'}{artifact?.contentVersion ? ` · 第 ${artifact.contentVersion} 版` : kind === 'acceptance' ? ` · 第 ${pending.acceptance!.input.contentVersion} 版` : ' · 原版本'}</strong>
        {kind === 'revision' && <p className="whitespace-pre-wrap break-words">{pending.revision!.input.content}</p>}
        <p className="field-hint">{request.status === 'not_accepted' ? '已确认原请求尚未受理。' : '保留原文件版本和请求，核对后继续。'}</p>
        <div className="button-row flex-wrap"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void actions.execute(pending, kind)}>{request.status === 'unknown' ? `核对${label}结果` : request.status === 'pending' ? '正在提交…' : `重试原${label}请求`}</Button>
        {request.status === 'not_accepted' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (actions.discard(pending, kind) && kind === 'revision') onRestoreRevision(pending.revision!.input, pending.logicalArtifactId) }}>{kind === 'revision' ? '放弃未受理请求并编辑此版' : `放弃未受理${label}`}</Button>}</div>
      </div>
    })}
    {actions.errors[key] && <p role="alert" className="field-hint">{actions.errors[key]}</p>}
  </section>
}

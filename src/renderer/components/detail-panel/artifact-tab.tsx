/*
 * [OUTPUT]: 固定成果增加Lody PDF/Office及同家族只读diff；隐藏/失效卸载，清理后的changed不重新进入加载态。
 * [INPUT]: 固定成果 ID/版号/hash、实际预览/版本/采用记录、当前聊天与搜索来源失效 revision。
 * [OUTPUT]: 右侧核对固定版本并展示 Markdown 排版/Shiki 代码、版本及折叠来源记录；采用、修改和稍后处理留在原聊天成果消息。隐藏停读，清理/撤权/外改立即失效正文。
 * [POS]: 成果详情的受控数据/交互边界；不读取任意路径、不把外开当采用、不伪造审核或来源消息。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { Artifact, ConversationDetail, Snapshot } from '@shared/domain'
import type { ConversationMaterial } from '@shared/domain/materials'
import { ARTIFACT_LIMITS, type ArtifactPreview, type ArtifactVersion } from '@shared/domain/artifacts'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { TextFilePreview } from '@/components/common/file-preview'
import { BinaryFileViewer } from '@/components/common/lody/binary-file-viewer'
import { ArtifactComparison } from './artifact-comparison'
import { Button } from '@/components/ui/button'
import { MaterialMarkdown } from '@/pages/conversations/-components/material-citations'
import { materialErrorText } from '@/pages/conversations/-components/material-draft'
import { readDetailMessages } from '@/pages/conversations/detail-reading'

export function ArtifactTab({ api, conversationId, id, logicalArtifactId, contentHash, expectedContentVersion, sourceRevision = 0, requestId, active, snapshot, onVersion, onPreviewMaterial, onMessage, onActivity, onOpenPath }: {
  api: DesktopApi; conversationId: string; id: string; logicalArtifactId: string; contentHash: string; expectedContentVersion?: number; sourceRevision?: number; requestId: string; active: boolean; snapshot: Snapshot
  onVersion(artifact: ArtifactVersion): void; onPreviewMaterial(material: ConversationMaterial, line?: number): void
  onMessage(id: string): void; onActivity(): void; onOpenPath(path: string): void
}) {
  const [view, setView] = useState<{ preview: ArtifactPreview; detail: ConversationDetail; sourceRevision: number }>(), [loading, setLoading] = useState(false), [readError, setReadError] = useState('')
  const [externalArtifact, setExternalArtifact] = useState<Artifact>()
  const [refresh, setRefresh] = useState(0)
  const [comparison, setComparison] = useState<{ currentId: string; versionId: string }>()
  const fixed = useRef({ id, requestId, hash: contentHash }), cleared = useRef(false)
  useEffect(() => {
    if (fixed.current.id !== id || fixed.current.requestId !== requestId) { fixed.current = { id, requestId, hash: contentHash } }
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
        if (!['ready', 'unsupported'].includes(preview.artifact.contentStatus)) throw new Error(preview.artifact.contentError ?? '本版成果不可预览。')
        const text = preview.filePreview?.text ?? preview.text
        if (text.length > ARTIFACT_LIMITS.previewCharacters || new TextEncoder().encode(text).length > ARTIFACT_LIMITS.previewBytes) throw new Error('成果超过预览范围，请使用外部打开。')
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
        cleared.current = true; sequence++; clearTimeout(timer); timer = undefined; setView(undefined); setExternalArtifact(undefined); setLoading(false); setReadError('来源聊天已清理或移除，本版成果不可用。'); return
      }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== conversationId) return
      sequence++; setView(undefined); setExternalArtifact(undefined); setLoading(active && !cleared.current)
      if (active && !cleared.current && !timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, id, logicalArtifactId, contentHash, expectedContentVersion, sourceRevision, requestId, active, refresh])

  const current = view?.sourceRevision === sourceRevision && view.preview.artifact.id === id && view.preview.artifact.contentHash === fixed.current.hash ? view : undefined
  const preview = current?.preview, artifact = preview?.artifact, detail = current?.detail
  const file = preview?.filePreview ?? (preview ? { kind: 'markdown' as const, text: preview.text } : undefined)
  const originalAuthor = artifact?.ownerAgentId, author = snapshot.agents.find(agent => agent.id === originalAuthor)
  const sourceMessage = detail?.messages.find(message => message.id === artifact?.sourceMessageId)
  const newer = preview?.versions.filter(version => artifact && version.contentVersion > artifact.contentVersion).sort((first, second) => first.contentVersion - second.contentVersion) ?? []
  const comparedVersion = comparison?.currentId === artifact?.id ? preview?.versions.find(version => version.id === comparison?.versionId && version.logicalArtifactId === logicalArtifactId && version.id !== id) : undefined
  return <div className="detail-section file-preview-detail flex min-h-0 flex-1 flex-col gap-3" data-artifact-id={id}>
    {readError && <Banner>{readError}</Banner>}
    {readError && externalArtifact?.id === id && !cleared.current && <Button variant="ghost" size="sm" onClick={() => onOpenPath(externalArtifact.path)}>外部打开</Button>}
    {loading && <Loading>正在核对成果版本…</Loading>}
    {readError && !cleared.current && active && <Button variant="secondary" size="sm" onClick={() => setRefresh(value => value + 1)}>重新核对成果</Button>}
    {artifact && preview && detail && <>
      <div className="flex shrink-0 flex-col gap-1"><h3 className="break-words">{artifact.name} · 第 {artifact.contentVersion} 版</h3><p className="field-hint">{author?.name ?? (sourceMessage && sourceMessage.senderId === originalAuthor ? sourceMessage.senderName : '已移除员工')}{artifact.publishedAt && <> · {new Date(artifact.publishedAt).toLocaleString('zh-CN')}</>}</p></div>
      {!!newer.length && <Banner kind="notice">有新版本。当前查看第 {artifact.contentVersion} 版。<Button variant="link" size="sm" onClick={() => onVersion(newer.at(-1)!)}>查看新版</Button></Banner>}
      {file?.kind !== 'unsupported' && preview.versions.length > 1 && <div className="button-row" aria-label="成果版本对比选择">
        {comparedVersion && <Button variant="secondary" size="sm" onClick={() => setComparison(undefined)}>返回正文</Button>}
        {preview.versions.filter(version => version.id !== id).map(version => <Button key={version.id} variant={comparedVersion?.id === version.id ? 'secondary' : 'ghost'} size="sm" aria-pressed={comparedVersion?.id === version.id} onClick={() => setComparison({ currentId: id, versionId: version.id })}>对比第 {version.contentVersion} 版</Button>)}
      </div>}
      <section className="flex min-h-0 flex-1 flex-col" aria-label={`成果第 ${artifact.contentVersion} 版正文`}>
        {comparedVersion ? <ArtifactComparison api={api} first={comparedVersion} second={artifact} active={active} sourceRevision={sourceRevision} /> : preview.binaryPreview ? <BinaryFileViewer key={`${artifact.id}:${artifact.contentHash}`} preview={preview.binaryPreview} name={artifact.name} active={active} /> : file && file.kind !== 'unsupported' ? <TextFilePreview key={artifact.id} name={artifact.name} text={file.text} kind={file.kind} language={'language' in file ? file.language : undefined} markdown={file.kind === 'markdown' ? <MaterialMarkdown source={{ content: file.text, materialSources: artifact.materialSources }} detail={detail} onPreview={onPreviewMaterial} /> : undefined} /> : <p className="field-hint">{file?.kind === 'unsupported' ? file.reason : '此文件暂不支持预览。'}</p>}
      </section>
      <details className="max-h-52 shrink-0 overflow-y-auto text-xs text-muted-foreground"><summary className="cursor-pointer">文件记录</summary>
      <div className="button-row">
        {sourceMessage ? <Button variant="link" size="sm" onClick={() => onMessage(sourceMessage.id)}>来源消息</Button> : <span className="field-hint">{artifact.sourceMessageId ? '来源消息已不可用' : '未记录来源消息'}</span>}
        {artifact.sourceWorkId && detail.workItems?.some(work => work.id === artifact.sourceWorkId) ? <Button variant="link" size="sm" onClick={onActivity}>来源工作</Button> : <span className="field-hint">{artifact.sourceWorkId ? '来源工作已不可用' : '未记录来源工作'}</span>}
        <Button variant="ghost" size="sm" onClick={() => onOpenPath(artifact.path)}>外部打开</Button>
      </div>
      <details><summary>版本 · {preview.versions.length}</summary><div className="flex flex-col gap-1">{preview.versions.map(version => <Button key={version.id} variant={version.id === artifact.id ? 'secondary' : 'ghost'} size="sm" className="justify-start" aria-pressed={version.id === artifact.id} onClick={() => onVersion(version)}>第 {version.contentVersion} 版 · {version.name}{preview.adoption.current?.artifactId === version.id ? ' · 当前采用' : ''}{version.id === artifact.id ? ' · 正在审阅' : ''}</Button>)}</div></details>
      <details><summary>内容身份</summary><p className="field-hint break-all">{artifact.contentHash}</p></details>
      <section className="flex flex-col gap-2" aria-label="采用记录"><strong>{preview.adoption.current ? `当前采用：第 ${preview.adoption.current.contentVersion} 版` : '未记录人工采用'}</strong><details><summary>采用历史 · {preview.adoption.events.length}</summary>{preview.adoption.events.map(event => <p key={event.id} className="field-hint">你 · 第 {event.contentVersion} 版 · {new Date(event.adoptedAt).toLocaleString('zh-CN')}</p>)}</details></section>
      {preview.acceptance && <p className="field-hint">待验收资格：{{ pending: '待验收', adopted: '已采用', revision_requested: '已提出修改', superseded: '已有新版', unavailable: '来源不可用' }[preview.acceptance.status]}</p>}
      </details>
    </>}
  </div>
}

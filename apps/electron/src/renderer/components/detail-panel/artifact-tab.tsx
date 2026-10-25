/*
 * [OUTPUT]: 文件来源菜单统一打开原员工/消息的执行过程，退役来源工作面板入口。
 * [INPUT]: 已核验文件身份/hash、当前聊天与来源失效revision，原员工修改请求。
 * [OUTPUT]: 仅文件名、正文、模式切换与文件/来源操作；删除版号、历史/对比/文件记录UI，修改完成自动显示交付文件。
 * [POS]: 文件预览数据边界；后台核源保留正文，隐藏停读，来源失效隔离迟到读取。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileEditSession, type FileEditHandle } from './file-edit-session'
import { artifactEditSource } from './file-edit-state'
import { useFileEditAutoPreview, useFileEdits } from './use-file-edits'
import type { Artifact, ConversationDetail, Snapshot } from '@boai/shared/domain'
import type { ConversationMaterial } from '@boai/shared/domain/materials'
import { ARTIFACT_LIMITS, type ArtifactPreview, type ArtifactVersion } from '@boai/shared/domain/artifacts'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { FilePreview, FilePreviewHeader } from '@/components/common/file-preview'
import { Button } from '@/components/ui/button'
import { FileText, FolderOpen, MessageCircle, MoreHorizontal, Workflow } from '@/components/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MaterialMarkdown } from '@/pages/conversations/-components/material-citations'
import { materialErrorText } from '@/pages/conversations/-components/material-draft'
import { readDetailMessages } from '@/pages/conversations/detail-reading'

export function ArtifactTab({ api, conversationId, id, logicalArtifactId, contentHash, expectedContentVersion, sourceRevision = 0, requestId, active, snapshot, onVersion, onPreviewMaterial, onMessage, onExecution, onOpenPath, onPublish }: {
  api: DesktopApi; conversationId: string; id: string; logicalArtifactId: string; contentHash: string; expectedContentVersion?: number; sourceRevision?: number; requestId: string; active: boolean; snapshot: Snapshot
  onPublish?(artifact: ArtifactVersion): void
  onVersion(artifact: ArtifactVersion): void; onPreviewMaterial(material: ConversationMaterial, line?: number): void
  onMessage(id: string): void; onExecution(artifact: ArtifactVersion): void; onOpenPath(path: string): void
}) {
  const editor = useRef<FileEditHandle>(null)
  const [view, setView] = useState<{ preview: ArtifactPreview; detail: ConversationDetail; sourceRevision: number }>(), [loading, setLoading] = useState(false), [readError, setReadError] = useState('')
  const [externalArtifact, setExternalArtifact] = useState<Artifact>()
  const [refresh, setRefresh] = useState(0), [actionError, setActionError] = useState('')
  const fixed = useRef({ id, requestId, hash: contentHash }), cleared = useRef(false)
  useEffect(() => {
    if (fixed.current.id !== id || fixed.current.requestId !== requestId) { fixed.current = { id, requestId, hash: contentHash } }
    let disposed = false, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined
    setView(undefined); setExternalArtifact(undefined); setReadError(''); setActionError(''); setLoading(active && !cleared.current)
    const load = async (background = false) => {
      if (!active || cleared.current) return
      const token = ++sequence
      if (!background) { setView(undefined); setExternalArtifact(undefined); setLoading(true); setReadError('') }
      try {
        const [previewResult, detailResult] = await Promise.allSettled([api.request('getArtifactPreview', { id, expectedHash: fixed.current.hash || undefined }), api.request('getConversationMetadata', { id: conversationId })])
        if (disposed || token !== sequence || cleared.current) return
        if (detailResult.status === 'rejected') throw detailResult.reason
        const detail = detailResult.value
        setExternalArtifact(detail.artifacts.find(value => value.id === id))
        if (previewResult.status === 'rejected') throw previewResult.reason
        const preview = previewResult.value
        if (preview.artifact.id !== id || preview.artifact.conversationId !== conversationId || preview.artifact.logicalArtifactId !== logicalArtifactId || expectedContentVersion !== undefined && preview.artifact.contentVersion !== expectedContentVersion || fixed.current.hash && preview.artifact.contentHash !== fixed.current.hash) throw new Error('文件内容已变化，请重新打开文件。')
        if (!['ready', 'unsupported'].includes(preview.artifact.contentStatus)) throw new Error(preview.artifact.contentError ?? '文件暂不可预览。')
        const text = preview.filePreview?.text ?? preview.text
        if (text.length > ARTIFACT_LIMITS.previewCharacters || new TextEncoder().encode(text).length > ARTIFACT_LIMITS.previewBytes) throw new Error('成果超过预览范围，请使用外部打开。')
        const source = await readDetailMessages(api, conversationId, preview.artifact.sourceMessageId ? [preview.artifact.sourceMessageId] : [], () => !disposed && token === sequence && !cleared.current)
        if (disposed || token !== sequence || cleared.current) return
        detail.messages = source.flatMap(item => item.status === 'available' && item.message ? [item.message] : [])
        fixed.current.hash = preview.artifact.contentHash
        setView(previous => {
          // Same verified bytes must retain their object identity: Lody effects parse
          // on bytes changes, even when React keeps the viewer mounted.
          const same = previous?.sourceRevision === sourceRevision && previous.preview.artifact.id === preview.artifact.id && previous.preview.artifact.contentHash === preview.artifact.contentHash
          return { preview: same ? { ...preview, filePreview: previous.preview.filePreview, binaryPreview: previous.preview.binaryPreview } : preview, detail, sourceRevision }
        }); setReadError(''); setLoading(false)
      } catch (failure) { if (!disposed && token === sequence) { setView(undefined); setLoading(false); setReadError(materialErrorText(errorText(failure))) } }
    }
    if (active && !cleared.current) void load()
    if (cleared.current) setReadError('来源聊天已清理或移除，文件不可用。')
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) {
        cleared.current = true; sequence++; clearTimeout(timer); timer = undefined; setView(undefined); setExternalArtifact(undefined); setLoading(false); setReadError('来源聊天已清理或移除，文件不可用。'); return
      }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== conversationId) return
      sequence++
      if (active && !cleared.current && !timer) timer = setTimeout(() => { timer = undefined; void load(true) }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, id, logicalArtifactId, contentHash, expectedContentVersion, sourceRevision, requestId, active, refresh])

  const current = view?.sourceRevision === sourceRevision && view.preview.artifact.id === id && view.preview.artifact.contentHash === fixed.current.hash ? view : undefined
  const preview = current?.preview, artifact = preview?.artifact, detail = current?.detail
  const file = preview?.filePreview ?? (preview ? { kind: 'markdown' as const, text: preview.text } : undefined)
  const editSource = artifact ? artifactEditSource(artifact) : undefined
  const edits = useFileEdits(api, JSON.stringify([conversationId, 'artifact', logicalArtifactId]), conversationId, active && !!editSource)
  const sourceMessage = detail?.messages.find(message => message.id === artifact?.sourceMessageId)
  const openResult = (result: Artifact) => { if (result.id && result.logicalArtifactId && result.contentHash && result.contentVersion) onVersion(result as ArtifactVersion) }
  useFileEditAutoPreview(edits, editSource, active, openResult)
  const header = (toggle?: ReactNode) => artifact && <FilePreviewHeader name={artifact.name}>
    {toggle}
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="文件操作" />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => { setActionError(''); void api.request('openPath', { path: artifact.path, action: 'reveal' }).catch(error => setActionError(errorText(error))) }}><FolderOpen />在文件夹中显示</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenPath(artifact.path)}><FileText />外部打开</DropdownMenuItem>
          {onPublish && <DropdownMenuItem onClick={() => onPublish(artifact)}>发送到渠道…</DropdownMenuItem>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {sourceMessage && <DropdownMenuItem onClick={() => onMessage(sourceMessage.id)}><MessageCircle />来源消息</DropdownMenuItem>}
          {artifact.sourceWorkId && detail?.workItems?.some(work => work.id === artifact.sourceWorkId) && <DropdownMenuItem onClick={() => onExecution(artifact)}><Workflow />执行过程</DropdownMenuItem>}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </FilePreviewHeader>
  return <div className="detail-section file-preview-detail flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-artifact-id={id}>
    {(readError || actionError) && <Banner>{readError || actionError}</Banner>}
    {readError && externalArtifact?.id === id && !cleared.current && <Button variant="ghost" size="sm" onClick={() => onOpenPath(externalArtifact.path)}>外部打开</Button>}
    {loading && <Loading>正在读取文件…</Loading>}
    {readError && !cleared.current && active && <Button variant="secondary" size="sm" onClick={() => setRefresh(value => value + 1)}>重新读取文件</Button>}
    {artifact && preview && detail && <>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" aria-label="文件正文">
        <FilePreview key={`${artifact.id}:${artifact.contentHash}`} name={artifact.name} file={file} binary={preview.binaryPreview} active={active} onEdit={(annotation, anchor) => editor.current?.begin(artifactEditSource(artifact), annotation, anchor)} header={header} markdown={file?.kind === 'markdown' ? <MaterialMarkdown source={{ content: file.text, materialSources: artifact.materialSources }} detail={detail} onPreview={onPreviewMaterial} /> : undefined} />
      </section>
    </>}
    <FileEditSession ref={editor} api={api} snapshot={snapshot} edits={edits} conversationId={conversationId} source={editSource} active={active} onResult={openResult} />
  </div>
}

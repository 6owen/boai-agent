/*
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 普通执行事件后台核源并保留正文/字节身份；本次明确修改交付完成后自动查看新版一次，历史版与diff保留。
 * [OUTPUT]: 选文及标题入口直接定位同一修改Popover，移除底部编辑区中转。
 * [OUTPUT]: 成果预览内独立修改会话与选文快捷操作，版本/要求/员工不再写主聊天草稿；真实执行记录归原来源。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 文件正文统一交给全局FilePreview分发，页面只负责核源、版本/对比与操作菜单。
 * [OUTPUT]: 预览收敛为标题/图标切换/操作菜单与正文；版本/来源操作及文件记录收进菜单，文件夹定位沿宿主路径校验。
 * [OUTPUT]: 固定成果增加Lody PDF/Office及同家族只读diff；隐藏/失效卸载，清理后的changed不重新进入加载态。
 * [INPUT]: 固定成果 ID/版号/hash、实际预览/版本/采用记录、当前聊天与搜索来源失效 revision。
 * [OUTPUT]: 右侧核对固定版本并展示 Markdown 排版/Shiki 代码、版本及折叠来源记录；采用、修改和稍后处理留在原聊天成果消息。隐藏停读，清理/撤权/外改立即失效正文。
 * [POS]: 成果详情的受控数据/交互边界；不读取任意路径、不把外开当采用、不伪造审核或来源消息。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileEditSession, type FileEditHandle } from './file-edit-session'
import { artifactEditSource, latestFileEditArtifact } from './file-edit-state'
import { useFileEditAutoPreview, useFileEdits } from './use-file-edits'
import type { Artifact, ConversationDetail, Snapshot } from '@shared/domain'
import type { ConversationMaterial } from '@shared/domain/materials'
import { ARTIFACT_LIMITS, type ArtifactPreview, type ArtifactVersion } from '@shared/domain/artifacts'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { FilePreview, FilePreviewHeader } from '@/components/common/file-preview'
import { ArtifactComparison } from './artifact-comparison'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, FileText, FolderOpen, Icon, MessageCircle, MoreHorizontal, Workflow } from '@/components/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MaterialMarkdown } from '@/pages/conversations/-components/material-citations'
import { materialErrorText } from '@/pages/conversations/-components/material-draft'
import { readDetailMessages } from '@/pages/conversations/detail-reading'

export function ArtifactTab({ api, conversationId, id, logicalArtifactId, contentHash, expectedContentVersion, sourceRevision = 0, requestId, active, snapshot, onVersion, onPreviewMaterial, onMessage, onActivity, onOpenPath, onPublish }: {
  api: DesktopApi; conversationId: string; id: string; logicalArtifactId: string; contentHash: string; expectedContentVersion?: number; sourceRevision?: number; requestId: string; active: boolean; snapshot: Snapshot
  onPublish?(artifact: ArtifactVersion): void
  onVersion(artifact: ArtifactVersion): void; onPreviewMaterial(material: ConversationMaterial, line?: number): void
  onMessage(id: string): void; onActivity(): void; onOpenPath(path: string): void
}) {
  const editor = useRef<FileEditHandle>(null)
  const [view, setView] = useState<{ preview: ArtifactPreview; detail: ConversationDetail; sourceRevision: number }>(), [loading, setLoading] = useState(false), [readError, setReadError] = useState('')
  const [externalArtifact, setExternalArtifact] = useState<Artifact>()
  const [refresh, setRefresh] = useState(0), [recordsOpen, setRecordsOpen] = useState(false), [actionError, setActionError] = useState('')
  const [comparison, setComparison] = useState<{ currentId: string; versionId: string }>()
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
        if (preview.artifact.id !== id || preview.artifact.conversationId !== conversationId || preview.artifact.logicalArtifactId !== logicalArtifactId || expectedContentVersion !== undefined && preview.artifact.contentVersion !== expectedContentVersion || fixed.current.hash && preview.artifact.contentHash !== fixed.current.hash) throw new Error('成果版本已变化，请重新打开明确版本。')
        if (!['ready', 'unsupported'].includes(preview.artifact.contentStatus)) throw new Error(preview.artifact.contentError ?? '本版成果不可预览。')
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
    if (cleared.current) setReadError('来源聊天已清理或移除，本版成果不可用。')
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) {
        cleared.current = true; sequence++; clearTimeout(timer); timer = undefined; setView(undefined); setExternalArtifact(undefined); setLoading(false); setReadError('来源聊天已清理或移除，本版成果不可用。'); return
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
  const editedArtifact = latestFileEditArtifact(edits.results, editSource)
  const originalAuthor = artifact?.ownerAgentId, author = snapshot.agents.find(agent => agent.id === originalAuthor)
  const sourceMessage = detail?.messages.find(message => message.id === artifact?.sourceMessageId)
  const newer = preview?.versions.filter(version => artifact && version.contentVersion > artifact.contentVersion).sort((first, second) => first.contentVersion - second.contentVersion) ?? []
  const latest = editedArtifact ?? newer.at(-1)
  const openResult = (result: Artifact) => { if (result.id && result.logicalArtifactId && result.contentHash && result.contentVersion) onVersion(result as ArtifactVersion) }
  useFileEditAutoPreview(edits, editSource, active, openResult)
  const comparedVersion = comparison?.currentId === artifact?.id ? preview?.versions.find(version => version.id === comparison?.versionId && version.logicalArtifactId === logicalArtifactId && version.id !== id) : undefined
  const header = (toggle?: ReactNode) => artifact && preview && <FilePreviewHeader name={artifact.name} description={`第 ${artifact.contentVersion} 版`}>
    <span className="text-xs text-muted-foreground">第 {artifact.contentVersion} 版</span>
    {latest && <Button variant="secondary" size="xs" onClick={() => openResult(latest)} aria-label={`查看新版：${latest.name}`} title={`第 ${latest.contentVersion} 版`}>查看新版</Button>}
    {comparedVersion ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="返回正文" onClick={() => setComparison(undefined)} />}><ArrowLeft /></TooltipTrigger><TooltipContent>返回正文</TooltipContent></Tooltip> : toggle}
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
          {!!newer.length && <DropdownMenuItem onClick={() => onVersion(newer.at(-1)!)}>查看最新版本</DropdownMenuItem>}
          {preview.versions.length > 1 && <DropdownMenuSub>
            <DropdownMenuSubTrigger><Clock />历史版本</DropdownMenuSubTrigger>
            <DropdownMenuSubContent><DropdownMenuGroup>{preview.versions.map(version => <DropdownMenuItem key={version.id} disabled={version.id === artifact.id} onClick={() => onVersion(version)}>第 {version.contentVersion} 版{version.id === artifact.id ? ' · 当前查看' : ''}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuSubContent>
          </DropdownMenuSub>}
          {file?.kind !== 'unsupported' && !preview.binaryPreview && preview.versions.length > 1 && <DropdownMenuSub>
            <DropdownMenuSubTrigger><Workflow />版本对比</DropdownMenuSubTrigger>
            <DropdownMenuSubContent><DropdownMenuGroup>{preview.versions.filter(version => version.id !== id).map(version => <DropdownMenuItem key={version.id} onClick={() => setComparison({ currentId: id, versionId: version.id })}>对比第 {version.contentVersion} 版</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuSubContent>
          </DropdownMenuSub>}
          {sourceMessage && <DropdownMenuItem onClick={() => onMessage(sourceMessage.id)}><MessageCircle />来源消息</DropdownMenuItem>}
          {artifact.sourceWorkId && detail?.workItems?.some(work => work.id === artifact.sourceWorkId) && <DropdownMenuItem onClick={onActivity}><Workflow />来源工作</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => setRecordsOpen(true)}><Icon name="Info" />文件记录</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </FilePreviewHeader>
  return <div className="detail-section file-preview-detail flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-artifact-id={id}>
    {(readError || actionError) && <Banner>{readError || actionError}</Banner>}
    {readError && externalArtifact?.id === id && !cleared.current && <Button variant="ghost" size="sm" onClick={() => onOpenPath(externalArtifact.path)}>外部打开</Button>}
    {loading && <Loading>正在核对成果版本…</Loading>}
    {readError && !cleared.current && active && <Button variant="secondary" size="sm" onClick={() => setRefresh(value => value + 1)}>重新核对成果</Button>}
    {artifact && preview && detail && <>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" aria-label={`成果第 ${artifact.contentVersion} 版正文`}>
        {comparedVersion ? <>{header()}<ArtifactComparison api={api} first={comparedVersion} second={artifact} active={active} sourceRevision={sourceRevision} /></> : <FilePreview key={`${artifact.id}:${artifact.contentHash}`} name={artifact.name} file={file} binary={preview.binaryPreview} active={active} onEdit={(annotation, anchor) => editor.current?.begin(artifactEditSource(artifact), annotation, anchor)} header={header} markdown={file?.kind === 'markdown' ? <MaterialMarkdown source={{ content: file.text, materialSources: artifact.materialSources }} detail={detail} onPreview={onPreviewMaterial} /> : undefined} />}
      </section>
      <Dialog open={recordsOpen} onOpenChange={setRecordsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>文件记录</DialogTitle><DialogDescription>{artifact.name} · 第 {artifact.contentVersion} 版</DialogDescription></DialogHeader>
          <div className="flex max-h-[60vh] min-w-0 flex-col gap-4 overflow-y-auto text-xs text-muted-foreground">
            <p>{author?.name ?? (sourceMessage && sourceMessage.senderId === originalAuthor ? sourceMessage.senderName : '已移除员工')}{artifact.publishedAt && <> · {new Date(artifact.publishedAt).toLocaleString('zh-CN')}</>}</p>
            <div className="flex flex-wrap gap-2">
              {sourceMessage ? <Button variant="link" size="sm" onClick={() => { setRecordsOpen(false); onMessage(sourceMessage.id) }}>来源消息</Button> : <span>{artifact.sourceMessageId ? '来源消息已不可用' : '未记录来源消息'}</span>}
              {artifact.sourceWorkId && detail.workItems?.some(work => work.id === artifact.sourceWorkId) ? <Button variant="link" size="sm" onClick={() => { setRecordsOpen(false); onActivity() }}>来源工作</Button> : <span>{artifact.sourceWorkId ? '来源工作已不可用' : '未记录来源工作'}</span>}
            </div>
            <details><summary>内容身份</summary><p className="break-all">{artifact.contentHash}</p></details>
            <section className="flex flex-col gap-2" aria-label="采用记录"><strong>{preview.adoption.current ? `当前采用：第 ${preview.adoption.current.contentVersion} 版` : '未记录人工采用'}</strong><details><summary>采用历史 · {preview.adoption.events.length}</summary>{preview.adoption.events.map(event => <p key={event.id}>你 · 第 {event.contentVersion} 版 · {new Date(event.adoptedAt).toLocaleString('zh-CN')}</p>)}</details></section>
            {preview.acceptance && <p>待验收资格：{{ pending: '待验收', adopted: '已采用', revision_requested: '已提出修改', superseded: '已有新版', unavailable: '来源不可用' }[preview.acceptance.status]}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>}
    <FileEditSession ref={editor} api={api} snapshot={snapshot} edits={edits} conversationId={conversationId} source={editSource} active={active} onResult={openResult} />
  </div>
}

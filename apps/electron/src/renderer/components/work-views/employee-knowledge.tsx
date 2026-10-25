/*
 * [OUTPUT]: 旧知识文件/目录统一核验预览与更新；读取失败后核对真实解绑，呈现已移除状态，实际故障仍Sonner；隐藏停读保持。
 * [INPUT]: 员工/会话身份、知识资源清单及宿主保存/预览/共享回执。
 * [OUTPUT]: 文件区知识管理/更新/共享与按员工解绑；预览先核对当前资料身份，避免列表先刷新而全局快照滞后误报；失败仅Sonner。
 * [POS]: 员工文件区域的知识视图，业务不依赖聊天或模型执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { Resource, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { KnowledgeFilesView, KnowledgePreview } from '@boai/shared/domain/knowledge'
import { Banner, errorText, Loading, sizeText } from '@/components/common'
import { showErrorToast } from '@/components/common/error-feedback'
import { FilePreview } from '@/components/common/file-preview'
import { SelectField } from '@/components/ui/select-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, MoreHorizontal, Plus } from '@/components/icons'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { usePagedQuery } from './use-paged-query'
import { useKnowledgeOperation } from './use-knowledge-operation'

export function EmployeeKnowledge({ api, snapshot, agentId, active, onPreview }: { api: DesktopApi; snapshot: Snapshot; agentId: string; active: boolean; onPreview(resource: Resource): void }) {
  const agent = snapshot.agents.find(value => value.id === agentId)
  const operation = useKnowledgeOperation(api, `employee:${agentId}`)
  const { page, loading, error, reload } = usePagedQuery<Resource, string, { items: Resource[]; total: number }>({ api, active, queryKey: `knowledge:${agentId}`, read: async () => { const items = await api.request('listEmployeeKnowledge', { agentId }); return { items, total: items.length } }, identity: item => item.id })
  const [sharing, setSharing] = useState<Resource>(), [choosing, setChoosing] = useState(false)
  const visible = useRef(active); visible.current = active
  useEffect(() => { visible.current = active; return () => { visible.current = false } }, [active])
  const disabled = !active || !agent?.active || operation.busy || !!operation.pending || choosing
  const add = async (resource?: Resource) => {
    if (disabled || !agent) return
    setChoosing(true)
    try {
      const replacement = resource ? resource.knowledge ? { resourceId: resource.id, revision: resource.knowledge.revision, contentHash: resource.knowledge.contentHash } : await api.request('getEmployeeKnowledgeFiles', { agentId, resourceId: resource.id }).then(value => ({ resourceId: resource.id, revision: value.revision, contentHash: value.contentHash })) : undefined
      if (!visible.current) return
      const source = await api.request('chooseKnowledgeSource', undefined)
      if (!source || !visible.current) return
      const requestId = crypto.randomUUID()
      if (await operation.execute(requestId, () => api.request('saveEmployeeKnowledge', { requestId, agentId, expectedConfigVersion: agent.configVersion, source: { kind: 'file', selectionId: source.id }, ...(replacement ? { replace: replacement } : {}) }))) reload()
    } catch (error) { showErrorToast(errorText(error)) } finally { setChoosing(false) }
  }
  const remove = async (resource: Resource) => {
    if (disabled || !agent) return
    const requestId = crypto.randomUUID()
    if (await operation.execute(requestId, () => api.request('removeEmployeeKnowledge', { requestId, agentId, resourceId: resource.id, expectedConfigVersion: agent.configVersion }))) reload()
  }
  return <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="员工知识资料">
    <div className="flex items-center justify-between gap-2"><span>知识资料 · {page?.total ?? agent?.knowledgeIds.length ?? 0} 份</span><Button size="sm" variant="secondary" disabled={disabled} onClick={() => void add()}><Plus data-icon="inline-start" />添加资料</Button></div>
    {operation.pending && <Button size="sm" variant="secondary" disabled={operation.busy || !active} onClick={() => void operation.check().then(() => reload())}>核对知识资料操作结果</Button>}
    {error && <><Banner>{error}</Banner><Button size="sm" variant="ghost" onClick={reload}>重新读取</Button></>}
    <ScrollFade className="flex min-h-0 flex-1 flex-col gap-2">
      {loading && <Loading />}
      {page?.items.map(resource => <KnowledgeRow key={resource.id} resource={resource} disabled={disabled} onPreview={() => onPreview(resource)} onUpdate={() => void add(resource)} onRemove={() => void remove(resource)} onShare={() => setSharing(resource)} />)}
      {page && !page.total && !loading && <p className="text-sm text-muted-foreground">添加供这位员工后续查阅的资料，也可以从会话文件中保留。</p>}
    </ScrollFade>
    {sharing && <KnowledgeSharing key={sharing.id} api={api} snapshot={snapshot} agentId={agentId} resource={sharing} active={active} onClose={() => setSharing(undefined)} />}
  </section>
}
function KnowledgeRow({ resource, disabled, onPreview, onUpdate, onRemove, onShare }: { resource: Resource; disabled: boolean; onPreview(): void; onUpdate(): void; onRemove(): void; onShare(): void }) {
  const [confirm, setConfirm] = useState(false), anchor = useRef<HTMLButtonElement>(null)
  return <Card size="sm" className="shrink-0" data-knowledge-id={resource.id}><CardContent className="flex items-center gap-2">
    <FileText className="shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><Button variant="link" size="content" className="max-w-full justify-start truncate" disabled={disabled} onClick={onPreview}>{resource.name}</Button><p className="m-0 text-xs text-muted-foreground">{resource.knowledge?.revoked ? '来源授权已撤回' : resource.knowledge ? `${sizeText(resource.knowledge.size)} · ${new Date(resource.knowledge.retainedAt).toLocaleDateString()}` : '已有知识资料'}</p></div>
    <DropdownMenu><DropdownMenuTrigger render={<Button ref={anchor} variant="ghost" size="icon-sm" disabled={disabled} aria-label={`知识资料操作 ${resource.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" finalFocus={confirm ? false : undefined}><DropdownMenuGroup>
      <DropdownMenuItem onClick={onPreview}>预览</DropdownMenuItem><DropdownMenuItem onClick={onUpdate}>更新内容</DropdownMenuItem><DropdownMenuItem onClick={onShare}>共享到会话</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>移除</DropdownMenuItem>
    </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    <Popover open={confirm} onOpenChange={setConfirm}><PopoverContent anchor={anchor} finalFocus={anchor} align="end"><PopoverTitle>移除“{resource.name}”？</PopoverTitle><PopoverDescription>停止使用这份知识资料；原会话文件和外部原件保留。</PopoverDescription><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>取消</Button><Button size="sm" variant="destructive" disabled={disabled} onClick={() => { setConfirm(false); onRemove() }}>确认移除</Button></div></PopoverContent></Popover>
  </CardContent></Card>
}
function KnowledgeSharing({ api, snapshot, agentId, resource, active, onClose }: { api: DesktopApi; snapshot: Snapshot; agentId: string; resource: Resource; active: boolean; onClose(): void }) {
  const operation = useKnowledgeOperation(api, `share:${agentId}:${resource.id}`)
  const rooms = snapshot.conversations.filter(room => !room.mergedInto && room.agentIds.includes(agentId) && (room.kind === 'group' || room.channel))
  return <Dialog open onOpenChange={open => { if (!open && !operation.busy) onClose() }}><DialogContent><DialogHeader><DialogTitle>共享到会话</DialogTitle><DialogDescription>允许这位员工在选定会话中引用“{resource.name}”。</DialogDescription></DialogHeader>
    {operation.pending && <Button size="sm" disabled={operation.busy} onClick={() => void operation.check()}>核对共享操作结果</Button>}
    <div className="flex max-h-80 flex-col gap-2 overflow-auto">{rooms.map(room => { const shared = room.sharedKnowledgeIds.includes(resource.id); return <div key={room.id} className="flex items-center justify-between gap-2"><span className="truncate">{room.title}</span><Button variant="secondary" size="sm" disabled={!active || operation.busy || !!operation.pending || !shared && !!resource.knowledge?.revoked} onClick={() => { const requestId = crypto.randomUUID(); void operation.execute(requestId, () => api.request('setEmployeeKnowledgeSharing', { requestId, agentId, resourceId: resource.id, conversationId: room.id, expectedConfigVersion: room.configVersion ?? 1, shared: !shared })) }}>{shared ? '取消共享' : '共享'}</Button></div> })}{!rooms.length && <p className="text-sm text-muted-foreground">这位员工尚未加入群聊或渠道会话。</p>}</div>
  </DialogContent></Dialog>
}
export function KnowledgePreviewPane({ api, resource, active, agentId = resource.ownerAgentId }: { api: DesktopApi; resource: Resource; active: boolean; agentId?: string }) {
  const [listing, setListing] = useState<{ identity: string; value: KnowledgeFilesView }>(), [view, setView] = useState<{ identity: string; value: KnowledgePreview }>()
  const [error, setError] = useState(''), [revision, setRevision] = useState(0), [selected, setSelected] = useState<string>()
  const [removed, setRemoved] = useState(false)
  const identity = JSON.stringify([resource.id, resource.path, resource.knowledge, agentId])
  const readFailed = async (error: unknown, isCurrent: () => boolean) => {
    if (!isCurrent() || !agentId) return
    // A committed replacement can remove this binding before the global snapshot
    // arrives. Confirm that state with the host; do not classify errors by text.
    const resources = await api.request('listEmployeeKnowledge', { agentId }).catch(() => undefined)
    if (!isCurrent()) return
    if (resources && !resources.some(item => item.id === resource.id)) { setRemoved(true); setView(undefined) }
    else setError(errorText(error))
  }
  useEffect(() => {
    let current = true; setListing(undefined); setView(undefined); setError(''); setSelected(undefined); setRemoved(false)
    if (!active || !agentId) return
    void api.request('getEmployeeKnowledgeFiles', { agentId, resourceId: resource.id }).then(value => {
      if (current) setListing({ identity, value })
    }).catch(error => readFailed(error, () => current))
    return () => { current = false }
  }, [api, active, identity, revision])
  const files = listing?.identity === identity ? listing.value : undefined
  const file = files?.files.find(file => file.key === selected) ?? files?.files[0]
  const readIdentity = JSON.stringify([identity, files?.contentHash, file?.key])
  useEffect(() => {
    let current = true; setView(undefined)
    if (!active || !agentId || !files || !file) return
    setError('')
    void api.request('getEmployeeKnowledgePreview', { agentId, resourceId: resource.id, contentHash: files.contentHash, fileKey: file.key }).then(value => {
      if (current) setView({ identity: readIdentity, value })
    }).catch(error => readFailed(error, () => current))
    return () => { current = false }
  }, [api, active, readIdentity, revision])
  const current = view?.identity === readIdentity ? view.value : undefined
  if (removed) return <p className="empty-note">该员工已移除此资料。</p>
  return <div className="flex h-full min-h-0 flex-col gap-2">
    {files && !files.resource.knowledge && <p className="m-0 text-xs text-muted-foreground">已有知识资料，原始来源未记录。</p>}
    {files && files.files.length > 1 && <SelectField aria-label="知识资料文件" value={file!.key} onValueChange={setSelected} options={files.files.map(file => ({ value: file.key, label: file.name }))} />}
    {error && <><Banner>{error}</Banner><Button variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>重新读取资料</Button></>}
    {active && !current && !error && (!files || files.files.length > 0) && <Loading />}
    {active && files && !files.files.length && <p className="text-sm text-muted-foreground">资料目录中没有可预览的文件。</p>}
    {current && <FilePreview name={current.fileName ?? current.resource.name} active={active} file={current.filePreview} binary={current.binaryPreview} />}
  </div>
}

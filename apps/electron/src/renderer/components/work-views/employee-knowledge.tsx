/*
 * [OUTPUT]: 知识资料默认列表视图，表格切换及当前面板选择保持。
 * [OUTPUT]: 上传/同员工刷新保留列表DOM与滚动位置，成功后替换数据；正常上传不插入核对按钮，未决恢复入口放标题栏，旧数据刷新期间锁定操作。
 * [OUTPUT]: 知识资料行菜单最小宽度176px并按内容扩展，添加到输入框保持单行。
 * [OUTPUT]: 移除确认改为任务同款二级菜单，仅取消/确认移除两行，无标题和说明；确认后关闭菜单，原操作锁/回执保持。
 * [OUTPUT]: 知识资料行菜单直接添加到当前会话输入框，核验版本后保留原草稿；隐藏/切换会话/发送锁定后拒绝迟到插入，不打开共享弹窗。
 * [OUTPUT]: 知识表格使用共享Card容器的背景/圆角/描边阴影，表头和行分隔沿现有Soft样式；表头/内容统一使用secondary小一档字号。
 * [OUTPUT]: 2026-11-06 知识资料不提供预览；标题、ScrollArea的mt-14/p-3间距与顶部fade直接对齐任务面板，右侧表格/列表Tabs和添加按钮Tooltip延迟500ms。
 * [OUTPUT]: 旧知识文件/目录统一核验预览；读取失败后核对真实解绑，呈现已移除状态，实际故障仍Sonner；隐藏停读保持。
 * [INPUT]: 员工/会话身份、知识资源清单及宿主保存/预览/共享回执。
 * [OUTPUT]: 文件区知识添加与按员工解绑；预览先核对当前资料身份，避免列表先刷新而全局快照滞后误报；失败仅Sonner。
 * [POS]: 员工文件区域的知识视图，业务不依赖聊天或模型执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Resource, Snapshot } from '@boai/shared/domain'
import type { ComposerReference } from '@boai/shared/domain/composer-references'
import type { DesktopApi } from '@boai/shared/ipc'
import type { KnowledgeFilesView, KnowledgePreview } from '@boai/shared/domain/knowledge'
import { Banner, errorText, Loading, sizeText } from '@/components/common'
import { showErrorToast } from '@/components/common/error-feedback'
import { DetailPanelHeader } from '@/components/common/detail-panel-header'
import { FilePreview } from '@/components/common/file-preview'
import { SelectField } from '@/components/ui/select-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FileText, MoreHorizontal, Plus } from '@/components/icons'
import { usePagedQuery } from './use-paged-query'
import { useKnowledgeOperation } from './use-knowledge-operation'

export interface KnowledgeComposerTarget { id: string; add(reference: Extract<ComposerReference, { kind: 'knowledge' }>): void }

export function EmployeeKnowledge({ api, snapshot, agentId, active, composer }: { api: DesktopApi; snapshot: Snapshot; agentId: string; active: boolean; composer?: KnowledgeComposerTarget }) {
  const agent = snapshot.agents.find(value => value.id === agentId)
  const operation = useKnowledgeOperation(api, `employee:${agentId}`)
  const { page, loading, error, reload } = usePagedQuery<Resource, string, { items: Resource[]; total: number }>({ api, active, keepPreviousPage: true, queryKey: `knowledge:${agentId}`, read: async () => { const items = await api.request('listEmployeeKnowledge', { agentId }); return { items, total: items.length } }, identity: item => item.id })
  const [choosing, setChoosing] = useState(false)
  const [referencing, setReferencing] = useState(false)
  const referenceRequest = useRef<symbol | null>(null)
  const [view, setView] = useState('list')
  const visible = useRef(active); visible.current = active
  useEffect(() => { visible.current = active; return () => { visible.current = false } }, [active])
  const disabled = !active || !agent?.active || loading || !!error || operation.busy || !!operation.pending || choosing
  const referenceContext = useRef({ composer, disabled }); referenceContext.current = { composer, disabled }
  useLayoutEffect(() => {
    referenceRequest.current = null; setReferencing(false)
    return () => { referenceRequest.current = null }
  }, [active, agentId, composer?.id, disabled])
  const addToComposer = async (resource: Resource) => {
    if (disabled || !composer || referenceRequest.current) return
    const request = Symbol(); referenceRequest.current = request; setReferencing(true)
    try {
      const view = await api.request('getEmployeeKnowledgeFiles', { agentId, resourceId: resource.id })
      if (referenceRequest.current !== request || referenceContext.current.disabled || referenceContext.current.composer?.id !== composer.id) return
      referenceContext.current.composer.add({ kind: 'knowledge', id: view.resource.id, name: view.resource.name, agentId, revision: view.revision, contentHash: view.contentHash })
    } catch (error) { if (referenceRequest.current === request) showErrorToast(errorText(error)) }
    finally { if (referenceRequest.current === request) { referenceRequest.current = null; setReferencing(false) } }
  }
  const add = async () => {
    if (disabled || !agent) return
    setChoosing(true)
    try {
      const source = await api.request('chooseKnowledgeSource', undefined)
      if (!source || !visible.current) return
      const requestId = crypto.randomUUID()
      if (await operation.execute(requestId, () => api.request('saveEmployeeKnowledge', { requestId, agentId, expectedConfigVersion: agent.configVersion, source: { kind: 'file', selectionId: source.id } }))) reload()
    } catch (error) { showErrorToast(errorText(error)) } finally { setChoosing(false) }
  }
  const remove = async (resource: Resource) => {
    if (disabled || !agent) return
    const requestId = crypto.randomUUID()
    if (await operation.execute(requestId, () => api.request('removeEmployeeKnowledge', { requestId, agentId, resourceId: resource.id, expectedConfigVersion: agent.configVersion }))) reload()
  }
  const files = page?.items ?? []
  const actions = (resource: Resource) => <KnowledgeActions resource={resource} disabled={disabled || referencing} composerAvailable={Boolean(composer)} onAddToComposer={() => void addToComposer(resource)} onRemove={() => void remove(resource)} />
  const controls = <>
    <TabsList size="sm" aria-label="知识资料视图"><TabsTrigger value="table">表格</TabsTrigger><TabsTrigger value="list">列表</TabsTrigger></TabsList>
    {operation.pending && !operation.busy && !choosing && <Button size="sm" variant="secondary" disabled={!active} onClick={() => void operation.check().then(() => reload())}>核对知识资料操作结果</Button>}
    <Tooltip><TooltipTrigger delay={500} render={<Button size="icon-sm" variant="ghost" aria-label="添加资料" disabled={disabled} onClick={() => void add()} />}><Plus /></TooltipTrigger><TooltipContent>添加资料</TooltipContent></Tooltip>
  </>
  return <Tabs value={view} onValueChange={value => { if (value === 'table' || value === 'list') setView(value) }} className="skill-detail-panel h-full min-h-0 w-full gap-0" aria-label="员工知识资料">
    <DetailPanelHeader title="知识资料" actions={controls} />
    <ScrollArea className="mt-14 min-h-0 flex-1" viewportProps={{ className: 'scroll-fade-t scroll-fade-6', 'aria-label': '知识资料滚动区域' }}><div className="flex flex-col gap-2 p-3">
      {error && <><Banner>{error}</Banner><Button size="sm" variant="ghost" className="self-start" onClick={reload}>重新读取</Button></>}
      {active && !page && !error && <Loading />}
      {page && !files.length && <p className="m-0 py-8 text-center text-sm text-muted-foreground">暂无知识资料</p>}
      {!!files.length && <>
        <TabsContent value="table">
          <Card size="sm" className="gap-0 py-0"><CardContent className="p-0">
          <Table className="min-w-[32rem] table-fixed text-[length:var(--text-ui-secondary)]" aria-label="知识资料表格">
            <TableHeader className="bg-muted/50"><TableRow className="hover:bg-transparent"><TableHead className="px-3">名称</TableHead><TableHead className="w-24 px-3">大小</TableHead><TableHead className="w-40 px-3">添加时间</TableHead><TableHead className="w-12 px-3"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
            <TableBody>{files.map(resource => <TableRow key={resource.id}>
              <TableCell className="px-3"><KnowledgeFileName resource={resource} /></TableCell>
              <TableCell className="px-3 tabular-nums text-muted-foreground">{resource.knowledge ? sizeText(resource.knowledge.size) : '—'}</TableCell>
              <TableCell className="px-3 text-muted-foreground">{resource.knowledge?.retainedAt ? new Date(resource.knowledge.retainedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</TableCell>
              <TableCell className="p-2">{actions(resource)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="list">
          <ul className="m-0 list-none space-y-0.5 p-0" aria-label="知识资料列表">{files.map(resource => <li key={resource.id} className="flex min-h-10 items-center gap-3 rounded-md px-2 py-1 hover:bg-muted/50">
            <KnowledgeFileName resource={resource} />
            {resource.knowledge && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{sizeText(resource.knowledge.size)}</span>}
            {actions(resource)}
          </li>)}</ul>
        </TabsContent>
      </>}
    </div></ScrollArea>
  </Tabs>
}
function KnowledgeFileName({ resource }: { resource: Resource }) {
  return <span className="flex min-w-0 flex-1 items-center gap-2" title={resource.name}><FileText size={16} className="shrink-0 text-muted-foreground" /><span className="truncate">{resource.name}</span></span>
}
function KnowledgeActions({ resource, disabled, composerAvailable, onAddToComposer, onRemove }: { resource: Resource; disabled: boolean; composerAvailable: boolean; onAddToComposer(): void; onRemove(): void }) {
  const [open, setOpen] = useState(false)
  return <DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`知识资料操作 ${resource.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-max min-w-44"><DropdownMenuGroup>
      <DropdownMenuItem disabled={disabled || !composerAvailable} onClick={() => { setOpen(false); onAddToComposer() }}>添加到输入框</DropdownMenuItem>
      <DropdownMenuSub><DropdownMenuSubTrigger disabled={disabled} className="text-destructive focus:text-destructive data-open:text-destructive">移除</DropdownMenuSubTrigger><DropdownMenuSubContent aria-label={`移除${resource.name}确认`}>
        <DropdownMenuItem onClick={() => setOpen(false)}>取消</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={disabled} onClick={() => { setOpen(false); onRemove() }}>确认移除</DropdownMenuItem>
      </DropdownMenuSubContent></DropdownMenuSub>
    </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
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

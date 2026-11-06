/*
 * [OUTPUT]: 会话文件搜索使用与小号Tab一致的28px控件高度及caption字号，保留展开和文件名查询。
 * [OUTPUT]: 会话文件对齐知识资料的默认列表/卡片表格、浮动标题与滚动渐隐；仅文件名CatalogSearch，来源操作归行菜单，同范围刷新保留列表。
 * [OUTPUT]: 2026-11-06 会话文件移除知识资料切换，保留原文件范围、筛选、预览和留存操作。
 * [OUTPUT]: 会话文件区仅展示附件/成果；更多菜单明确保留，固定来源与未知回执在文件视图保留。
 * [OUTPUT]: 剩余异步失败文案统一Sonner，原状态和操作保持。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 员工跨会话文件/附件与群渠道会话文件共用有界筛选；范围独立记忆，每行按原 conversationId 预览和定位。
 * [INPUT]: 已发送材料/已发布成果的有界宿主清单、真实版本链和固定原件预览回调。
 * [OUTPUT]: 当前会话文件筛选、文件预览与原消息导航，不展示版号/采用状态或历史版本入口；文件卡保持自然高度不收缩，同id原件/hash/权限版本变化使迟到预览失效，重核期间保留滚动位置；不混入草稿/私有文件，不采用/审批或修改成果。
 * [POS]: 会话文件主视图，右侧内容预览继续使用已有材料/成果标签。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ConversationFileItem, ConversationFilePage, ConversationFileQuery, ConversationFileTarget } from '@boai/shared/domain/work-views'
import { Banner, Loading, errorText, sizeText } from '@/components/common'
import { showErrorToast } from '@/components/common/error-feedback'
import { CatalogSearch } from '@/components/common/catalog-search'
import { DetailPanelHeader } from '@/components/common/detail-panel-header'
import { FileText, MoreHorizontal } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RetainFile } from './retain-file'
import { useKnowledgeOperation } from './use-knowledge-operation'
import { fileRowTargetMatches, selectedFileMatches, type FileSelection } from './model'
import { usePagedQuery } from './use-paged-query'

type FileView = 'table' | 'list'
export interface ConversationFilesState { name: string; view?: FileView; selected?: FileSelection }
export const emptyFilesState: ConversationFilesState = { name: '', view: 'list' }
export interface ConversationFilesProps { api: DesktopApi; snapshot: Snapshot; active: boolean; conversationId?: string; ownerAgentId?: string; state?: ConversationFilesState; onStateChange?(value: ConversationFilesState): void; onPreview(item: ConversationFileItem, current?: () => boolean): void; onNavigate(target: ConversationFileTarget, current?: () => boolean): void }
const remembered = new Map<string, ConversationFilesState>(), positions = new Map<string, number>()
const statusLabel: Record<ConversationFileItem['status'], string> = { ready: '', preparing: '正在准备', failed: '读取失败', unavailable: '原件不可用', removed: '来源已移除', unsupported: '预览格式不支持' }
export function ConversationFiles({ state: controlled, onStateChange, snapshot, ...props }: ConversationFilesProps) {
  const scopeKey = props.ownerAgentId ? `employee:${props.ownerAgentId}` : `conversation:${props.conversationId}`
  const operation = useKnowledgeOperation(props.api, `files:${scopeKey}`)
  const [retaining, setRetaining] = useState<ConversationFileItem>()
  const [local, setLocal] = useState(() => ({ id: scopeKey, value: remembered.get(scopeKey) ?? { ...emptyFilesState } }))
  const state = controlled ?? (local.id === scopeKey ? local.value : remembered.get(scopeKey) ?? { ...emptyFilesState })
  const change = (patch: Partial<ConversationFilesState>) => { const next = { ...state, ...patch }; remembered.set(scopeKey, next); setLocal({ id: scopeKey, value: next }); onStateChange?.(next) }
  const query: ConversationFileQuery = { conversationId: props.conversationId, ownerAgentId: props.ownerAgentId, name: state.name.trim() || undefined, limit: 30 }
  const controls = <>
    <TabsList size="sm" aria-label="会话文件视图"><TabsTrigger value="table">表格</TabsTrigger><TabsTrigger value="list">列表</TabsTrigger></TabsList>
    {operation.pending && <Button size="sm" variant="secondary" disabled={operation.busy || !props.active} onClick={() => void operation.check()}>核对知识资料保存结果</Button>}
    <CatalogSearch label="搜索文件名" placeholder="搜索文件名" value={state.name} onChange={name => change({ name: name.slice(0, 200) })} />
  </>
  return <Tabs value={state.view ?? 'list'} onValueChange={view => { if (view === 'table' || view === 'list') change({ view }) }} className="conversation-files-panel skill-detail-panel @container h-full min-h-0 w-full gap-0 [&_.catalog-search]:max-w-[40cqw]" aria-label="会话文件">
    <DetailPanelHeader title="会话文件" actions={controls} />
    <FilesResults {...props} onRetain={setRetaining} operationsLocked={operation.busy || !!operation.pending} query={query} state={state} change={change} />
    {retaining && <RetainFile key={retaining.id} api={props.api} snapshot={snapshot} item={retaining} ownerAgentId={props.ownerAgentId} active={props.active} operation={operation} onClose={() => setRetaining(undefined)} />}
  </Tabs>
}
function FilesResults({ query, state, change, operationsLocked, ...props }: Omit<ConversationFilesProps, 'snapshot' | 'state' | 'onStateChange'> & { operationsLocked: boolean; onRetain(item: ConversationFileItem): void; query: ConversationFileQuery; state: ConversationFilesState; change(patch: Partial<ConversationFilesState>): void }) {
  const { page, loading, error, reload, loadMore } = usePagedQuery<ConversationFileItem, string, ConversationFilePage>({ api: props.api, active: props.active, keepPreviousPage: true, queryKey: 'files:' + JSON.stringify(query), conversationId: props.conversationId, read: cursor => props.api.request('queryConversationFiles', { ...query, cursor }), identity: item => item.kind + ':' + item.id })
  const scroller = useRef<HTMLDivElement>(null), positionKey = JSON.stringify([query, state.view ?? 'list'])
  useLayoutEffect(() => { if (props.active && page && scroller.current) scroller.current.scrollTop = positions.get(positionKey) ?? 0 }, [props.active, page, positionKey])
  const enabled = props.active && !loading && !error && !operationsLocked
  const preview = (item: ConversationFileItem, current?: () => boolean) => { if (!enabled || current && !current()) return; change({ selected: { id: item.id, kind: item.kind, contentHash: item.contentHash, revision: item.revision } }); props.onPreview(item, current) }
  const rows = (view: FileView) => page?.items.map(item => <FileRow key={item.kind + ':' + item.id} {...props} view={view} active={Boolean(enabled)} item={item} onPreview={preview} selected={selectedFileMatches(state.selected, item)} />)
  return <ScrollArea className="mt-14 min-h-0 flex-1" viewportProps={{ ref: scroller, className: 'scroll-fade-t scroll-fade-6', 'aria-label': '会话文件滚动区域', 'aria-busy': loading, onScroll: event => { if (props.active && page && !loading) positions.set(positionKey, event.currentTarget.scrollTop) } }}><div className="flex flex-col gap-2 p-3">
    {error && <><Banner>{error}</Banner><Button size="sm" variant="ghost" className="self-start" onClick={reload}>重新读取</Button></>}
    {props.active && !page && !error && <Loading />}
    {page && !page.items.length && !loading && <p className="m-0 py-8 text-center text-sm text-muted-foreground">{query.name ? '未找到匹配的文件' : '暂无会话文件'}</p>}
    {!!page?.items.length && <>
      <TabsContent value="table">
        <Card size="sm" className="gap-0 py-0"><CardContent className="p-0">
          <Table className="min-w-[32rem] table-fixed text-[length:var(--text-ui-secondary)]" aria-label="会话文件表格">
            <TableHeader className="bg-muted/50"><TableRow className="hover:bg-transparent"><TableHead className="px-3">名称</TableHead><TableHead className="w-24 px-3">大小</TableHead><TableHead className="w-40 px-3">添加时间</TableHead><TableHead className="w-12 px-3"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
            <TableBody>{rows('table')}</TableBody>
          </Table>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="list"><ul className="m-0 list-none space-y-0.5 p-0" aria-label="会话文件列表">{rows('list')}</ul></TabsContent>
    </>}
    {page?.nextCursor && <Button size="sm" variant="ghost" disabled={!enabled} onClick={() => void loadMore()}>加载更多 · 已显示 {page.items.length} / {page.total}</Button>}
  </div></ScrollArea>
}
interface FileRowProps { view: FileView; onRetain(item: ConversationFileItem): void; api: DesktopApi; active: boolean; item: ConversationFileItem; selected?: boolean; onPreview(item: ConversationFileItem, current?: () => boolean): void; onNavigate(target: ConversationFileTarget, current?: () => boolean): void }
function FileRow({ item, ...props }: FileRowProps) {
  const [opening, setOpening] = useState(false), generation = useRef(0), current = useRef({ active: props.active, item }); current.current = { active: props.active, item }
  useEffect(() => { current.current.active = props.active; setOpening(false); return () => { current.current.active = false; generation.current++ } }, [props.active, item.id, item.contentHash, item.revision, item.status])
  const visible = (token: number) => current.current.active && generation.current === token && fileRowTargetMatches(item, current.current.item)
  const preview = () => { if (!props.active) return; const token = ++generation.current; props.onPreview(item, () => visible(token)) }
  const openSource = async () => {
    if (!props.active || opening || !item.sourceMessageId) return
    const token = ++generation.current; setOpening(true)
    try { const target = await props.api.request('resolveConversationFileTarget', { conversationId: item.conversationId, kind: item.kind, id: item.id, contentHash: item.contentHash, revision: item.revision }); if (visible(token)) props.onNavigate(target, () => visible(token)) }
    catch (cause) { if (visible(token)) showErrorToast(errorText(cause)) }
    finally { if (generation.current === token) setOpening(false) }
  }
  const name = <Button variant="link" size="content" className="flex min-w-0 flex-1 justify-start gap-2 text-left font-normal text-foreground" title={item.name} disabled={!props.active} onClick={preview}><FileText size={16} className="shrink-0 text-muted-foreground" /><span className="truncate">{item.name}</span></Button>
  const fileName = statusLabel[item.status] ? <Tooltip><TooltipTrigger delay={500} render={name} /><TooltipContent>{item.error || statusLabel[item.status]}</TooltipContent></Tooltip> : name
  const actions = <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={!props.active} aria-label={`文件操作 ${item.name}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-max min-w-44"><DropdownMenuGroup>
    <DropdownMenuItem disabled={!props.active} onClick={preview}>预览</DropdownMenuItem>
    <DropdownMenuItem disabled={!props.active || opening || !item.sourceMessageId} onClick={() => void openSource()}>查看原消息</DropdownMenuItem>
    <DropdownMenuItem disabled={!props.active || !item.contentHash || item.kind === 'material' && !item.revision} onClick={() => props.onRetain(item)}>添加到知识资料</DropdownMenuItem>
  </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
  if (props.view === 'table') return <TableRow data-file-id={item.id} data-file-kind={item.kind} data-state={props.selected ? 'selected' : undefined}>
    <TableCell className="px-3">{fileName}</TableCell><TableCell className="px-3 tabular-nums text-muted-foreground">{sizeText(item.size)}</TableCell><TableCell className="px-3 text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</TableCell><TableCell className="p-2">{actions}</TableCell>
  </TableRow>
  return <li data-file-id={item.id} data-file-kind={item.kind} className={`flex min-h-10 items-center gap-3 rounded-md px-2 py-1 hover:bg-muted/50${props.selected ? ' bg-muted/60' : ''}`}>
    {fileName}<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{sizeText(item.size)}</span>{actions}
  </li>
}

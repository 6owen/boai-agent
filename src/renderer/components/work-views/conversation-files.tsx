/*
 * [OUTPUT]: 员工跨会话文件/附件与群渠道会话文件共用有界筛选；范围独立记忆，每行按原 conversationId 预览和定位。
 * [INPUT]: 已发送材料/已发布成果的有界宿主清单、真实版本链和固定原件预览回调。
 * [OUTPUT]: 当前会话文件筛选、文件预览与原消息导航，不展示版号/采用状态或历史版本入口；文件卡保持自然高度不收缩，同id原件/hash/权限版本变化使迟到预览失效，重核期间保留滚动位置；不混入草稿/私有文件，不采用/审批或修改成果。
 * [POS]: 会话文件主视图，右侧内容预览继续使用已有材料/成果标签。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import type { ConversationFileItem, ConversationFilePage, ConversationFileQuery, ConversationFileTarget } from '@shared/domain/work-views'
import { Banner, Loading, errorText, sizeText } from '@/components/common'
import { FileText, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SelectField } from '@/components/ui/select-field'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { DateFilter } from './filters'
import { dateBoundary, fileRowTargetMatches, selectedFileMatches, type FileSelection } from './model'
import { usePagedQuery } from './use-paged-query'

export interface ConversationFilesState { name: string; kind: string; actorId: string; fileType: string; from: string; to: string; expanded: string[]; selected?: FileSelection }
export const emptyFilesState: ConversationFilesState = { name: '', kind: '', actorId: '', fileType: '', from: '', to: '', expanded: [] }
export interface ConversationFilesProps { api: DesktopApi; snapshot: Snapshot; active: boolean; conversationId?: string; ownerAgentId?: string; state?: ConversationFilesState; onStateChange?(value: ConversationFilesState): void; onPreview(item: ConversationFileItem, current?: () => boolean): void; onNavigate(target: ConversationFileTarget, current?: () => boolean): void }
const remembered = new Map<string, ConversationFilesState>(), positions = new Map<string, number>()
const statusLabel: Record<ConversationFileItem['status'], string> = { ready: '', preparing: '正在准备', failed: '读取失败', unavailable: '原件不可用', removed: '来源已移除', unsupported: '预览格式不支持' }
const fileTypes = [{ value: '', label: '全部类型' }, { value: 'md', label: 'Markdown' }, { value: 'txt', label: 'TXT' }, { value: 'ts', label: 'TypeScript' }, { value: 'tsx', label: 'TSX' }, { value: 'js', label: 'JavaScript' }, { value: 'jsx', label: 'JSX' }, { value: 'py', label: 'Python' }, { value: 'json', label: 'JSON' }, { value: 'html', label: 'HTML源码' }, { value: 'svg', label: 'SVG源码' }, { value: 'css', label: 'CSS' }, { value: 'yaml', label: 'YAML' }, { value: 'xml', label: 'XML' }, { value: 'csv', label: 'CSV' }, { value: 'sql', label: 'SQL' }, { value: 'go', label: 'Go' }, { value: 'rs', label: 'Rust' }, { value: 'java', label: 'Java' }, { value: 'kt', label: 'Kotlin' }, { value: 'sh', label: 'Shell' }, { value: 'png', label: 'PNG图片' }, { value: 'jpg', label: 'JPEG图片' }, { value: 'pdf', label: 'PDF' }, { value: 'binary', label: '无扩展二进制' }]
export function ConversationFiles({ state: controlled, onStateChange, snapshot, ...props }: ConversationFilesProps) {
  const scopeKey = props.ownerAgentId ? `employee:${props.ownerAgentId}` : `conversation:${props.conversationId}`
  const [local, setLocal] = useState(() => ({ id: scopeKey, value: remembered.get(scopeKey) ?? { ...emptyFilesState, expanded: [] } }))
  const state = controlled ?? (local.id === scopeKey ? local.value : remembered.get(scopeKey) ?? { ...emptyFilesState, expanded: [] })
  const change = (patch: Partial<ConversationFilesState>) => { const next = { ...state, ...patch }; remembered.set(scopeKey, next); setLocal({ id: scopeKey, value: next }); onStateChange?.(next) }
  let query: ConversationFileQuery | undefined, invalid = ''
  try {
    if (state.from && state.to && state.from > state.to) throw new Error('开始日期不能晚于结束日期。')
    query = { conversationId: props.conversationId, ownerAgentId: props.ownerAgentId, name: state.name.trim() || undefined, kind: (state.kind || undefined) as ConversationFileQuery['kind'], actorId: state.actorId || undefined, fileType: state.fileType.trim().toLowerCase() || undefined, from: dateBoundary(state.from), to: dateBoundary(state.to, true), limit: 30 }
  } catch (cause) { invalid = errorText(cause) }
  const filtered = Boolean(state.name || state.kind || state.actorId || state.fileType || state.from || state.to)
  const removedActor = Boolean(state.actorId && state.actorId !== 'user' && !snapshot.agents.some(item => item.id === state.actorId))
  return <section className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4" aria-label={props.ownerAgentId ? '员工文件' : '会话文件'}>
    <div className="flex flex-wrap items-center gap-2" aria-label="文件筛选">
      <InputGroup className="w-56"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="文件名称筛选" placeholder="查找文件名" maxLength={200} value={state.name} onChange={event => change({ name: event.target.value })} /></InputGroup>
      <SelectField size="sm" className="w-32" aria-label="文件来源种类" value={state.kind} onValueChange={kind => change({ kind })} options={[{ value: '', label: '全部文件' }, { value: 'material', label: '收到的附件' }, { value: 'artifact', label: '员工文件' }]} />
      <SelectField size="sm" className="w-32" aria-label="文件发送或交付者" value={state.actorId} onValueChange={(actorId, details) => { if (removedActor && !actorId && details.reason === 'none') { details.cancel(); return } change({ actorId }) }} options={[{ value: '', label: '全部发送人' }, { value: 'user', label: snapshot.userProfile?.displayName || '本人' }, ...(removedActor ? [{ value: state.actorId, label: '已移除发送人', disabled: true }] : []), ...snapshot.agents.map(agent => ({ value: agent.id, label: agent.name }))]} />
      <SelectField size="sm" className="w-32" aria-label="文件类型" value={state.fileType} onValueChange={fileType => change({ fileType })} options={[...fileTypes, ...(state.fileType && !fileTypes.some(item => item.value === state.fileType) ? [{ value: state.fileType, label: `${state.fileType.toUpperCase()} 文件` }] : [])]} />
      <DateFilter from={state.from} to={state.to} onChange={(from, to) => change({ from, to })} />
      {filtered && <Button variant="ghost" size="sm" onClick={() => change({ ...emptyFilesState, expanded: state.expanded, selected: state.selected })}>清除筛选</Button>}
    </div>
    {invalid && <Banner>{invalid}</Banner>}
    {query && !invalid && <FilesResults {...props} active={props.active && !invalid} query={query} state={state} change={change} />}
  </section>
}
function FilesResults({ query, state, change, ...props }: Omit<ConversationFilesProps, 'snapshot' | 'state' | 'onStateChange'> & { query: ConversationFileQuery; state: ConversationFilesState; change(patch: Partial<ConversationFilesState>): void }) {
  const { page, loading, error, reload, loadMore } = usePagedQuery<ConversationFileItem, string, ConversationFilePage>({ api: props.api, active: props.active, queryKey: 'files:' + JSON.stringify(query), conversationId: props.conversationId, read: cursor => props.api.request('queryConversationFiles', { ...query, cursor }), identity: item => item.kind + ':' + item.id })
  const scroller = useRef<HTMLDivElement>(null), positionKey = JSON.stringify(query)
  useLayoutEffect(() => { if (props.active && page && scroller.current) scroller.current.scrollTop = positions.get(positionKey) ?? 0 }, [props.active, page, positionKey])
  const preview = (item: ConversationFileItem, current?: () => boolean) => { if (!props.active || current && !current()) return; change({ selected: { id: item.id, kind: item.kind, contentHash: item.contentHash, revision: item.revision } }); props.onPreview(item, current) }
  return <>
    {page && <p className="m-0 text-xs text-muted-foreground">已加载 {page.items.length} / {page.total} 项 · 收到的附件与员工生成的文件</p>}
    <ScrollFade ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 pb-1" onScroll={event => { if (props.active && page && !loading) positions.set(positionKey, event.currentTarget.scrollTop) }} aria-busy={loading}>
      {page?.items.map(item => <FileRow key={item.kind + ':' + item.id} {...props} item={item} onPreview={preview} selected={selectedFileMatches(state.selected, item)} />)}
      {loading && <Loading />}{error && <Banner>{error}<Button size="sm" variant="ghost" onClick={reload}>重新读取</Button></Banner>}
      {page && !page.items.length && !loading && <p className="my-4 text-sm text-muted-foreground">暂无符合条件的文件。收到的附件和员工生成的文件会显示在这里。</p>}
      {page?.nextCursor && <Button size="sm" variant="ghost" disabled={loading} onClick={() => void loadMore()}>加载更多 · 已显示 {page.items.length} / {page.total}</Button>}
    </ScrollFade>
  </>
}
interface FileRowProps { api: DesktopApi; active: boolean; item: ConversationFileItem; selected?: boolean; onPreview(item: ConversationFileItem, current?: () => boolean): void; onNavigate(target: ConversationFileTarget, current?: () => boolean): void }
function FileRow({ item, ...props }: FileRowProps) {
  const [error, setError] = useState(''), [opening, setOpening] = useState(false), generation = useRef(0), current = useRef({ active: props.active, item }); current.current = { active: props.active, item }
  useEffect(() => { current.current.active = props.active; setOpening(false); setError(''); return () => { current.current.active = false; generation.current++ } }, [props.active, item.id, item.contentHash, item.revision, item.status])
  const visible = (token: number) => current.current.active && generation.current === token && fileRowTargetMatches(item, current.current.item)
  const preview = () => { const token = ++generation.current; props.onPreview(item, () => visible(token)) }
  const openSource = async () => {
    const token = ++generation.current, id = item.id; setOpening(true); setError('')
    try { const target = await props.api.request('resolveConversationFileTarget', { conversationId: item.conversationId, kind: item.kind, id, contentHash: item.contentHash, revision: item.revision }); if (visible(token)) props.onNavigate(target, () => visible(token)) }
    catch (cause) { if (visible(token)) setError(errorText(cause)) }
    finally { if (generation.current === token) setOpening(false) }
  }
  return <Card size="sm" className={props.selected ? 'shrink-0 bg-muted/60' : 'shrink-0'} data-file-id={item.id} data-file-kind={item.kind}>
    <CardContent className="flex flex-col gap-2">
      <div className="flex items-start gap-2"><FileText className="mt-0.5 shrink-0 text-muted-foreground" /><Button variant="link" size="content" className="min-w-0 justify-start whitespace-normal break-all text-left font-medium" disabled={!props.active} onClick={preview}>{item.name}</Button></div>
      <p className="m-0 flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{item.kind === 'material' ? '收到的附件' : '员工文件'}</span><span>{item.actorName || '发送人未知'}</span><span>{item.fileType.toUpperCase()} · {sizeText(item.size)}</span><span>{new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>
      {statusLabel[item.status] && <p role="status" className="m-0 text-sm text-muted-foreground">{statusLabel[item.status]}{item.error ? `：${item.error}` : ''}</p>}
      <div className="flex flex-wrap gap-1"><Button variant="secondary" size="sm" disabled={!props.active} onClick={preview}>预览</Button><Button variant="ghost" size="sm" disabled={!item.sourceMessageId || opening || !props.active} onClick={() => void openSource()}>查看原消息</Button>{!item.sourceMessageId && <span className="self-center text-xs text-muted-foreground">原消息未知</span>}
      </div>
      {opening && <Loading>正在核对来源…</Loading>}{error && <Banner>{error}</Banner>}
    </CardContent>
  </Card>
}

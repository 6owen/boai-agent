/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 文件展示不再附加版号，预览/修改沿文件身份办理。
 * [INPUT]: 普通搜索 Dialog 的活跃状态、可选类型/可见会话/员工与shadcn Calendar日期范围、稳定 SQL/索引代际游标、正文命中与覆盖回执和点击来源复核。
 * [OUTPUT]: 顶部统一关键词、单行 sm 同款 secondary 类型/会话/员工/时间筛选和混合结果，时间未选占位与其他筛选同色、选中后显示正文色；正文摘录/位置、多词原词高亮、索引覆盖与有界失败可见，明确继续回填不调用模型；范围与会话列表可见配置一致，日期按本地起止日筛选；查询刷新不注销有效导航，关闭/条件改变/来源清理隔离迟到响应，所选来源移除时拒绝控件自动回退全部范围。
 * [POS]: 全局顶栏搜索图标与本会话搜索共用的普通 Dialog 内容，关键词输入沿用32px公共高度；复用宿主检索，不使用 CommandDialog，不读取任意路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import type { Snapshot } from '@boai/shared/domain'
import { READING_LIMITS, type ConversationSearchPage, type ConversationSearchQuery, type ConversationSearchResult, type ConversationSearchTarget } from '@boai/shared/domain/reading'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, Loading } from '@/components/common'
import { ErrorToast } from '@/components/common/error-feedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { SelectField } from '@/components/ui/select-field'
import { Separator } from '@/components/ui/separator'
import { CalendarClock, FileText, MessageCircle, Search, X } from '@/components/icons'
import { READING_UI_LIMITS, readConversationSearchPages, sameSearchTarget, searchExcerptParts } from '../reading-state'

export interface ConversationSearchRequest { conversationId?: string; requestId: string }
type SearchType = '' | 'conversation' | 'message' | 'file'
const searchTypes = [{ value: '', label: '全部类型' }, { value: 'conversation', label: '会话' }, { value: 'message', label: '消息' }, { value: 'file', label: '文件' }]
function Excerpt({ text, keyword }: { text: string; keyword: string }) {
  return <>{searchExcerptParts(text, keyword).map((part, index) => part.matched ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</>
}
export function ConversationSearch({ api, active, snapshot, selectedId, request, onOpen, onUnavailable }: {
  api: DesktopApi; active: boolean; snapshot: Snapshot; selectedId: string | null; request?: ConversationSearchRequest
  onOpen(result: ConversationSearchResult, current: () => boolean): Promise<void>
  onUnavailable(target: ConversationSearchTarget): void
}) {
  const [query, setQuery] = useState(''), [type, setType] = useState<SearchType>(''), [conversationId, setConversationId] = useState(''), [agentId, setAgentId] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [pages, setPages] = useState(1), [refresh, setRefresh] = useState(0), [view, setView] = useState<{ key: string; result: ConversationSearchPage }>(), [loading, setLoading] = useState(false), [error, setError] = useState(''), [opening, setOpening] = useState('')
  const inputRef = useRef<HTMLInputElement>(null), generation = useRef(0), navigationGeneration = useRef(0), current = useRef({ active, key: '' })
  const clearFilters = () => { setType(''); setConversationId(''); setAgentId(''); setFrom(''); setTo(''); setPages(1) }
  useEffect(() => {
    if (!request) return
    clearFilters(); setConversationId(request.conversationId ?? ''); setQuery(''); setError(''); setView(undefined)
  }, [request?.requestId])
  const day = (value: string, end = false) => value ? new Date(value + (end ? 'T23:59:59.999' : 'T00:00:00')).toISOString() : undefined
  const dateRange: DateRange | undefined = from ? { from: new Date(from + 'T00:00:00'), to: to ? new Date(to + 'T00:00:00') : undefined } : undefined
  const chooseDates = (range: DateRange | undefined) => { setFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : ''); setTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '') }
  const timeLabel = dateRange?.from ? format(dateRange.from, 'yyyy/MM/dd') + (dateRange.to ? ' 至 ' + format(dateRange.to, 'yyyy/MM/dd') : ' 起') : '时间'
  const conversations = snapshot.conversations.filter(item => !item.list?.hidden)
  let input: ConversationSearchQuery | undefined, invalid = ''
  try {
    if (query.trim()) input = { keyword: query.trim(), scope: conversationId ? 'current' : 'all', conversationId: conversationId || undefined, agentId: agentId || undefined, from: day(from), to: day(to, true), kinds: type === 'file' ? ['material', 'artifact'] : type ? [type] : undefined, limit: READING_LIMITS.page }
  } catch { invalid = '请选择有效日期。' }
  if (from && to && from > to) invalid = '开始日期不能晚于结束日期。'
  const removedConversation = Boolean(conversationId && !conversations.some(item => item.id === conversationId))
  if (removedConversation) invalid = '所选会话已从列表移除，请重新选择或清除筛选。'
  const key = JSON.stringify(input ?? [query, type, conversationId, agentId, from, to]); current.current = { active: active && !invalid, key }
  const result = !invalid && view?.key === key ? view.result : undefined
  const filtered = Boolean(type || conversationId || agentId || from || to)
  useEffect(() => { setPages(1) }, [key])
  useEffect(() => { generation.current++; navigationGeneration.current++; setOpening(''); if (!active || invalid) { setView(undefined); setLoading(false); setError('') } }, [key, active, invalid])
  useEffect(() => {
    if (!active || !input || invalid) { setLoading(false); return }
    let valid = true, eventTimer: ReturnType<typeof setTimeout> | undefined
    const token = ++generation.current; setLoading(true); setError('')
    const timer = setTimeout(() => { void readConversationSearchPages(input, pages, () => valid && token === generation.current, query => api.request('searchConversations', query))
      .then(result => { if (valid && result) { for (const item of result.results) if (item.status === 'unavailable') onUnavailable(item.target); setView({ key, result }) } })
      .catch(cause => { if (valid) { setView(undefined); setError(errorText(cause)) } }).finally(() => { if (valid) setLoading(false) }) }, READING_UI_LIMITS.debounce)
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'changed' && event.type !== 'conversation:cleared' && event.type !== 'conversation:deleted') return
      if (event.type === 'conversation:cleared' || event.type === 'conversation:deleted') { navigationGeneration.current++; setOpening('') }
      setView(undefined)
      if (!eventTimer) eventTimer = setTimeout(() => { eventTimer = undefined; if (valid) setRefresh(value => value + 1) }, READING_UI_LIMITS.debounce)
    })
    return () => { valid = false; unsubscribe(); clearTimeout(timer); clearTimeout(eventTimer) }
  }, [api, active, key, pages, refresh, invalid])
  const open = async (item: ConversationSearchResult) => {
    if (opening || !current.current.active) return
    const frozenKey = key, token = ++navigationGeneration.current; setOpening(item.kind + ':' + item.id); setError('')
    try {
      const resolved = await api.request('resolveConversationSearchTarget', item.target)
      if (!current.current.active || current.current.key !== frozenKey || token !== navigationGeneration.current) return
      if (!sameSearchTarget(item.target, resolved.target)) throw new Error('目标身份已变化，请重新搜索原内容。')
      if (resolved.status !== 'available') { onUnavailable(item.target); throw new Error(resolved.reason ?? '这条内容已被清理或不可用。') }
      await onOpen(resolved, () => current.current.active && current.current.key === frozenKey && token === navigationGeneration.current)
    } catch (cause) { if (current.current.active && current.current.key === frozenKey && token === navigationGeneration.current) { onUnavailable(item.target); setView(undefined); setError(errorText(cause)) } }
    finally { if (token === navigationGeneration.current) setOpening('') }
  }
  return <DialogContent initialFocus={inputRef} showCloseButton={false} className="flex h-[min(680px,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(960px,calc(100vw-2rem))]">
    <DialogTitle className="sr-only">搜索会话内容</DialogTitle>
    <DialogDescription className="sr-only">搜索会话名称、消息正文和已发送材料或已发布文本成果的名称与正文。多个词同时匹配，优先显示相关结果。筛选均可不选，默认搜索当前可见的全部获准会话。</DialogDescription>
    <div className="flex items-center gap-2 p-4">
      <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput ref={inputRef} aria-label="搜索关键词" placeholder="搜索会话、消息或文件" maxLength={READING_LIMITS.keywordCharacters} value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
      <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="关闭搜索" />}><X /></DialogClose>
    </div>
    <FieldGroup className="flex-row flex-wrap items-center gap-2 px-4 pb-4" aria-label="搜索筛选">
      <Field className="w-auto"><FieldLabel className="sr-only">检索类型</FieldLabel><SelectField size="sm" className="w-28" value={type} aria-label="检索类型" onValueChange={value => setType(value as SearchType)} options={searchTypes} /></Field>
      <Field className="w-auto"><FieldLabel className="sr-only">所在会话</FieldLabel><SelectField size="sm" className="w-48" value={conversationId} aria-label="所在会话" onValueChange={(value, details) => { if (removedConversation && !value && details.reason === 'none') { details.cancel(); return } setConversationId(value) }} options={[{ value: '', label: '全部会话' }, ...conversations.map(item => ({ value: item.id, label: item.title + (item.id === selectedId ? ' · 当前会话' : '') }))]} /></Field>
      <Field className="w-auto"><FieldLabel className="sr-only">发言员工</FieldLabel><SelectField size="sm" className="w-36" value={agentId} aria-label="发言员工" onValueChange={setAgentId} options={[{ value: '', label: '全部员工' }, ...snapshot.agents.map(agent => ({ value: agent.id, label: agent.name }))]} /></Field>
      <Popover><PopoverTrigger data-slot="date-range-trigger" data-placeholder={!from && !to ? '' : undefined} render={<Button variant="secondary" size="sm" data-slot="date-range-trigger" aria-label="时间筛选" />}><CalendarClock data-icon="inline-start" />{timeLabel}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] max-h-(--available-height) overflow-auto p-0">
          <PopoverHeader className="px-3 pt-3"><PopoverTitle>选择时间范围</PopoverTitle><PopoverDescription>选择开始和结束日期，可再次选择或清除。</PopoverDescription></PopoverHeader>
          <Calendar mode="range" selected={dateRange} onSelect={chooseDates} defaultMonth={dateRange?.from} numberOfMonths={2} locale={zhCN} aria-label="检索时间范围" />
          <Separator /><Button size="sm" variant="ghost" disabled={!from && !to} onClick={() => chooseDates(undefined)}>清除时间</Button>
        </PopoverContent>
      </Popover>
      {filtered && <Button size="sm" variant="ghost" onClick={clearFilters}>清除筛选</Button>}
    </FieldGroup>
    <Separator />
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4" aria-label="搜索结果" aria-busy={loading}>
      {invalid && <ErrorToast>{invalid}</ErrorToast>}
      {error && <><ErrorToast>{error}</ErrorToast><Button variant="ghost" size="sm" onClick={() => { generation.current++; navigationGeneration.current++; setOpening(''); setRefresh(value => value + 1) }}>重新搜索</Button></>}
      {!query.trim() && <Empty className="flex-1"><EmptyHeader><EmptyMedia variant="icon"><Search /></EmptyMedia><EmptyTitle>查找会话内容</EmptyTitle><EmptyDescription>输入关键词查找会话、消息或文件，筛选条件可以留空。</EmptyDescription></EmptyHeader></Empty>}
      {loading && <Loading>正在搜索…</Loading>}
      {result?.coverage && <section aria-label="文件正文索引覆盖" className="flex flex-col gap-2 rounded-md border p-3"><p className="field-hint">文件正文：已索引 {result.coverage.indexed} / {result.coverage.total} 项 · 待处理 {result.coverage.pending} 项 · 失败 {result.coverage.failed} 项 · 跳过 {result.coverage.skipped} 项</p>
        {Boolean(result.coverage.pending || result.coverage.failed || result.coverage.skipped) && <p className="field-hint">尚未覆盖的正文不代表没有相关内容；失效原件不会显示旧摘录。</p>}
        {result.coverage.failures?.length ? <details><summary className="field-hint cursor-pointer">查看索引未覆盖原因</summary><ul className="m-0 mt-2 list-none space-y-1 p-0 field-hint">{result.coverage.failures.map(item => <li key={item.kind + ':' + item.id}>{item.name}：{item.reason}</li>)}</ul></details> : null}
        {result.coverage.hasMore && <Button size="sm" variant="secondary" disabled={loading || Boolean(opening)} onClick={() => { setPages(1); setRefresh(value => value + 1) }}>继续索引文件正文</Button>}
      </section>}
      {result && <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="检索结果列表">{result.results.map(item => {
        const file = item.kind === 'material' || item.kind === 'artifact'
        const ResultIcon = file ? FileText : MessageCircle
        const label = item.kind === 'conversation' ? '会话' : item.kind === 'message' ? '消息' : item.kind === 'material' ? '材料' : '成果'
        return <li key={item.kind + ':' + item.id}><Button variant="ghost" size="content" className="flex w-full items-start gap-3 p-3 text-left" data-search-result-id={item.id} data-search-kind={item.kind} disabled={Boolean(opening) || item.status !== 'available'} onClick={() => void open(item)}>
          <ResultIcon data-icon="inline-start" /><span className="flex min-w-0 flex-1 flex-col items-start gap-1"><span className="flex max-w-full items-center gap-2"><Badge variant="secondary">{label}</Badge><strong className="truncate"><Excerpt text={item.name ?? item.senderName ?? '原内容'} keyword={query} /></strong></span>
            {file && item.matchedIn && <span className="field-hint" data-search-match={item.matchedIn}>{item.matchedIn === 'body' ? '正文命中' : item.matchedIn === 'name_and_body' ? '名称与正文命中' : '名称命中'}{item.matchOffset !== undefined ? ` · 正文第 ${item.matchOffset + 1} 字符附近` : ''}</span>}
            {(item.excerpt || item.status !== 'available') && <span className="whitespace-pre-wrap break-words">{item.status === 'available' ? <Excerpt text={item.excerpt ?? ''} keyword={query} /> : item.reason}</span>}
            <span className="field-hint">{item.conversationTitle} · {new Date(item.time).toLocaleString('zh-CN')}</span>
          </span>
        </Button></li>
      })}</ul>}
      {!loading && !error && result && !result.results.length && <Empty className="flex-1"><EmptyHeader><EmptyTitle>没有找到相关内容</EmptyTitle><EmptyDescription>试试其他关键词，或清除筛选扩大搜索范围。文件正文的覆盖情况见上方，未索引内容尚不能据此排除。</EmptyDescription></EmptyHeader></Empty>}
      {result?.nextCursor && (pages < READING_UI_LIMITS.searchPages ? <Button size="sm" variant="secondary" disabled={loading || Boolean(error)} onClick={() => setPages(value => value + 1)}>加载更多搜索结果</Button> : <p className="field-hint">已到本次搜索上限，请缩小范围后继续。</p>)}
    </div>
    {result && <><Separator /><div className="px-4 py-2 field-hint">已加载 {result.results.length} 条结果</div></>}
  </DialogContent>
}

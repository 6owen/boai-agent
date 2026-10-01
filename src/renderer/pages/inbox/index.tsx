/*
 * [INPUT]: 数据库已筛选的真实待处理分页、原未决补充身份和主页面活跃状态。
 * [OUTPUT]: 全局待处理类型/搜索筛选、覆盖所有来源的稳定分页、真实已加载数量及独立详情入口；隐藏停止读取。
 * [POS]: inbox 主页面；点击仅查看，不把阅读、空态或移出列表当作业务已完成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { InboxItem, InboxKind, InboxPage as InboxResult } from '@shared/domain/inbox'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { RefreshCw, Search } from '@/components/icons'
import { inboxQueryKey, readInboxPages } from './state'
import type { InboxQuestionRequests } from './question-state'

export const inboxKindLabels: Record<InboxKind, string> = { question: '待补充', approval: '待批准', acceptance: '待验收', failure: '需处理' }
export function InboxPage({ api, active, pending, storageError, onOpen, onPending, onConversations }: {
  api: DesktopApi; active: boolean; pending: InboxQuestionRequests; storageError: string
  onOpen(item: InboxItem): void; onPending(id: string): void; onConversations(): void
}) {
  const [kind, setKind] = useState<InboxKind>(), [search, setSearch] = useState(''), [pages, setPages] = useState(1), [revision, setRevision] = useState(0)
  const [view, setView] = useState<{ key: string; result: InboxResult }>(), [loading, setLoading] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState<string>()
  const main = useRef<HTMLElement>(null), scroll = useRef(0)
  const key = inboxQueryKey(kind, search), value = view?.key === key ? view.result : undefined
  useEffect(() => { if (active && main.current) main.current.scrollTop = scroll.current }, [active])
  useEffect(() => {
    if (!active) return
    let current = true, timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'changed' && event.type !== 'conversation:cleared' && event.type !== 'conversation:deleted' || timer) return
      timer = setTimeout(() => { timer = undefined; if (current) setRevision(value => value + 1) }, 120)
    })
    return () => { current = false; unsubscribe(); clearTimeout(timer) }
  }, [api, active])
  useEffect(() => {
    if (!active) return
    let current = true
    setLoading(true); setError('')
    const timer = setTimeout(() => {
      void readInboxPages<InboxItem>(before => api.request('listInbox', { kind, search: search.trim() || undefined, before, limit: 30 }), pages, () => current)
        .then(result => { if (current && result) setView({ key, result }) })
        .catch(cause => { if (current) { setView(undefined); setError(errorText(cause)) } })
        .finally(() => { if (current) setLoading(false) })
    }, 150)
    return () => { current = false; clearTimeout(timer) }
  }, [api, active, kind, search, pages, revision, key])
  return <main ref={main} className="page-scroll min-w-0 flex-1" style={active ? undefined : { display: 'none' }} aria-label="待处理事项" onScroll={event => { if (active) scroll.current = event.currentTarget.scrollTop }}>
    <div className="schedule-document">
      <div className="page-heading"><div><h2>待处理</h2><p className="field-hint">{value ? `已加载 ${value.items.length} 项${value.nextCursor ? '，还有更多' : ''}` : '查看需要你介入的工作'}</p></div><Button variant="ghost" size="icon-sm" aria-label="刷新待处理" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw /></Button></div>
      <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索待处理" placeholder="搜索工作、会话或员工" maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPages(1) }} /></InputGroup>
      <div className="button-row flex-wrap my-3" aria-label="待处理类型筛选"><Button size="sm" variant={!kind ? 'secondary' : 'ghost'} aria-pressed={!kind} onClick={() => { setKind(undefined); setPages(1) }}>全部</Button>{(['question', 'approval', 'acceptance', 'failure'] as const).map(value => <Button key={value} size="sm" variant={kind === value ? 'secondary' : 'ghost'} aria-pressed={kind === value} onClick={() => { setKind(value); setPages(1) }}>{inboxKindLabels[value]}</Button>)}</div>
      {storageError && <Banner>{storageError}</Banner>}
      {Object.keys(pending).length > 0 && <section className="soft-card p-3 my-3" aria-label="待核对补充"><h3>待核对补充</h3><p className="field-hint">原请求身份已保留，核对不会重新发送。</p>{Object.values(pending).map(request => <Button key={request.itemId} variant="ghost" size="sm" onClick={() => onPending(request.itemId)}>核对原补充请求：{request.input.content.slice(0, 32)}</Button>)}</section>}
      {error && <><Banner>{error}</Banner><Button variant="secondary" size="sm" onClick={() => setRevision(value => value + 1)}>重试读取待处理</Button></>}
      {loading && <Loading>正在读取待处理…</Loading>}
      <div className="flex flex-col gap-2">{value?.items.map(item => <Button key={item.id} variant={selected === item.id ? 'secondary' : 'surface'} size="content" className="flex flex-col items-start gap-1 p-4 text-left w-full" data-inbox-id={item.id} aria-label={`查看${inboxKindLabels[item.kind]}：${item.summary}`} onClick={() => { setSelected(item.id); onOpen(item) }}><span className="pill">{inboxKindLabels[item.kind]}</span><strong className="whitespace-pre-wrap break-words">{item.summary}</strong><span className="field-hint">{item.conversationTitle}{item.agentName ? ` · ${item.agentName}` : ''} · {new Date(item.time).toLocaleString('zh-CN')}</span>{item.reason && <span className="field-hint whitespace-pre-wrap">{item.reason}</span>}</Button>)}</div>
      {!loading && !error && value && !value.items.length && <p className="empty-note">{kind || search.trim() ? '没有符合条件的事项。' : '当前没有需要你处理的事。'}</p>}
      {value?.nextCursor && <Button className="mt-3" variant="secondary" disabled={loading || Boolean(error)} onClick={() => setPages(value => value + 1)}>加载更多待处理</Button>}
      {!kind && !search.trim() && !loading && !error && value && !value.items.length && <Button variant="secondary" size="sm" onClick={onConversations}>返回会话</Button>}
    </div>
  </main>
}

/*
 * [INPUT]: 自动化分页历史、会话结果、DesktopApi 与共享控件。
 * [OUTPUT]: 单次结果仅按 occurrence 明确消息 ID 分批有界核读，活跃/清理/来源变化与迟到守卫隔离正文；数据库全量搜索/状态筛选、单次结果阅读与按需运行明细；隐藏时停止查询；监控使用独立数据检查摘要；监控结果/观测时间/规则与前后值/来源证据、冷却状态；完整待处理分页、最近结束结果优先/默认展开、摘要后历史与身份去重；到期追加额度的明确确认、累计用量和确认消息/前后限额回执；通知回执与业务交付分开展示、按消息/记录身份定位；完整执行记录的稳定分页、实际正文/证据、指定消息定位、停止与原预算补充入口。
 * [POS]: schedules 阅读区；历史分页与编辑草稿独立，刷新不扩大单次查询上限。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AutomationHistoryQuery, AutomationHistoryPage, AutomationNotice, AutomationOccurrence } from '@shared/domain'
import type { ConversationMessageItem } from '@shared/domain/reading'
import { readDetailMessages } from '@/pages/conversations/detail-reading'
import { automationNeedsAttention } from '@shared/domain/automations'
import { WORK_BUDGET_ALLOWANCE as allowance } from '@shared/domain/work'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Field, Loading, useMutation } from '@/components/common'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export const occurrenceStatusLabels:Record<AutomationOccurrence['status'],string>={admitted:'已接收',running:'执行中',waiting_approval:'等待审批',waiting_user:'等待补充',waiting_work:'等待工作',cancelling:'正在停止',completed:'运行结束',failed:'失败',skipped:'已跳过',interrupted:'已中断',needs_review:'需核对',cancelled:'已停止'}
const deliveries: Record<AutomationOccurrence['deliveryStatus'], string> = { pending: '尚待交付', delivered: '已交付', no_change: '没有变化', partial: '部分结果', blocked: '未交付', unknown: '交付待核对' }

const exhausted = (o: AutomationOccurrence) => !!o.budget && (o.budget.exhausted || Date.parse(o.budget.deadlineAt) <= Date.now() || (o.modelCalls ?? 0) >= o.budget.maxModelCalls || o.budget.runs >= o.budget.maxRuns || (o.usage?.outputTokens ?? 0) >= o.budget.maxOutputTokens)

function usageLabel(o: AutomationOccurrence) {
  const usage = o.usage
  const known = usage?.totalTokens !== undefined ? `${usage.totalTokens} tokens` : [usage?.inputTokens !== undefined ? `${usage.inputTokens} 输入 tokens` : '', usage?.outputTokens !== undefined ? `${usage.outputTokens} 输出 tokens` : ''].filter(Boolean).join(' / ')
  return known ? `${known}${o.usageIncomplete ? '（已知部分，用量不完整）' : ''}` : o.modelCalls === 0 ? '尚无模型请求' : '用量未知'
}

export function AutomationHistory({ api, active = true, automationId, attentionOnly = false, latestOccurrenceId, focusOccurrence, summary, onConversation, onOccurrence }: { api: DesktopApi; active?: boolean; onOccurrence?(id: string): void; automationId?: string; attentionOnly?: boolean; latestOccurrenceId?: string; focusOccurrence?: { id: string; requestId: string }; summary?: ReactNode; onConversation(id: string, messageId?: string): void }) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState<AutomationHistoryQuery['status']>(attentionOnly ? 'attention' : 'all')
  const focusedRequest = useRef<string | undefined>(undefined)
  const [pages, setPages] = useState(1), [attentionPages, setAttentionPages] = useState(1), [revision, setRevision] = useState(0)
  const [history, setHistory] = useState<AutomationHistoryPage>({ occurrences: [] }), [attention, setAttention] = useState<AutomationHistoryPage>({ occurrences: [] })
  const [focused, setFocused] = useState<AutomationHistoryPage['occurrences'][number]>(), [latestRecord, setLatestRecord] = useState<AutomationHistoryPage['occurrences'][number]>()
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('')
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'changed' || timer) return
      timer = setTimeout(() => { timer = undefined; setRevision(value => value + 1) }, 100)
    })
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [api, active])
  useEffect(() => {
    if (!active) return
    let live = true
    setLoading(true); setLoadError('')
    const readPages = async (count: number, onlyAttention: boolean): Promise<AutomationHistoryPage> => {
      const occurrences: AutomationHistoryPage['occurrences'] = []
      let before: AutomationHistoryPage['nextCursor']
      for (let page = 0; page < count; page++) {
        const result = await api.request('listAutomationHistory', { automationId, attentionOnly: onlyAttention, search: automationId ? undefined : search, status: onlyAttention ? 'attention' : status, before, limit: 30 })
        if (!live) return { occurrences: [] }
        occurrences.push(...result.occurrences); before = result.nextCursor
        if (!before) break
      }
      return { occurrences, nextCursor: before }
    }
    void (async () => {
      const [result, pending] = await Promise.all([readPages(pages, attentionOnly), automationId && !attentionOnly ? readPages(attentionPages, true) : Promise.resolve({ occurrences: [] } as AutomationHistoryPage)])
      const latest = latestOccurrenceId ? [...result.occurrences, ...pending.occurrences].find(o => o.id === latestOccurrenceId) ?? await api.request('getAutomationOccurrence', { id: latestOccurrenceId }) : undefined
      let target: typeof focused
      if (focusOccurrence && ![...result.occurrences, ...pending.occurrences].some(o => o.id === focusOccurrence.id)) {
        const record = await api.request('getAutomationOccurrence', { id: focusOccurrence.id })
        if (record.automationId === automationId || !automationId) target = record
      }
      if (live) { setHistory(result); setAttention(pending); setFocused(target); setLatestRecord(latest) }
    })().catch(cause => { if (live) setLoadError(errorText(cause)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [api, active, automationId, attentionOnly, latestOccurrenceId, pages, attentionPages, revision, focusOccurrence, search, status])
  useEffect(() => { if (!focusOccurrence || focusedRequest.current === focusOccurrence.requestId || loading) return; const element = document.getElementById(`occurrence-${focusOccurrence.id}`); if (element) { focusedRequest.current = focusOccurrence.requestId; element.scrollIntoView({ block: 'center' }); element.focus({ preventScroll: true }) } }, [focusOccurrence, history, focused, loading])
  const refresh = async () => { setRevision(value => value + 1) }
  // The two bounded queries can observe adjacent commits. Prefer the newer version and render each identity once.
  const records = new Map<string, AutomationHistoryPage['occurrences'][number]>()
  for (const o of [...history.occurrences, ...attention.occurrences, ...(latestRecord ? [latestRecord] : [])]) if (!records.has(o.id) || records.get(o.id)!.stateVersion < o.stateVersion) records.set(o.id, o)
  const latestId = latestRecord?.id ?? history.occurrences[0]?.id
  const latest = automationId && !attentionOnly && latestId ? records.get(latestId) : undefined
  const pending = attention.occurrences.map(o => records.get(o.id)!).filter(o => o.id !== latest?.id && automationNeedsAttention(o))
  const featuredIds = new Set([...(latest ? [latest.id] : []), ...pending.map(o => o.id)])
  const earlier = history.occurrences.map(o => records.get(o.id)!).filter(o => !featuredIds.has(o.id))
  const card = (o: AutomationHistoryPage['occurrences'][number], expanded = false) => <AutomationOccurrenceCard key={o.id} api={api} active={active} occurrence={o} expanded={expanded} onRefresh={refresh} onConversation={onConversation} onOccurrence={onOccurrence} />
  if (!active) return null
  return <div className="automation-reading">
    {!automationId && <div className="automation-history-filters">
      <Input aria-label="搜索执行记录" placeholder="搜索记录中的任务标题" maxLength={200} value={search} onChange={e => { setSearch(e.target.value); setPages(1) }} />
      <div className="button-row" aria-label="执行记录筛选">{([{value:'all',label:'全部'},{value:'active',label:'进行中'},{value:'completed',label:'已完成'},{value:'attention',label:'需处理'}] as const).map(item => <Button key={item.value} size="sm" variant={status === item.value ? 'secondary' : 'ghost'} aria-pressed={status === item.value} onClick={() => { setStatus(item.value); setPages(1) }}>{item.label}</Button>)}</div>
    </div>}
    {loadError && <Banner>{loadError}</Banner>}
    {automationId && !attentionOnly && <>
      <section aria-label="最新结果"><h3>最新结果</h3>{latest ? card(latest, true) : !loading && <p className="empty-note">尚未执行此计划。</p>}</section>
      {(pending.length > 0 || latest && automationNeedsAttention(latest)) && <section aria-label="需处理运行"><h3>需处理</h3>{latest && automationNeedsAttention(latest) && <p className="field-hint">最新运行需要处理，操作见上方。</p>}<div className="automation-history">{pending.map(o => card(o))}</div>{attention.nextCursor && <Button variant="secondary" disabled={loading} onClick={() => setAttentionPages(value => value + 1)}>加载更多待处理记录</Button>}</section>}
    </>}
    {summary}
    {focused && !records.has(focused.id) && <section aria-label="定位记录"><h3>定位记录</h3>{card(focused, true)}</section>}
    <section aria-label="运行记录"><h3>{attentionOnly ? '需处理记录' : '执行记录'}</h3>
      {!loading && !loadError && !earlier.length && <p className="empty-note">{attentionOnly || status === 'attention' ? '当前没有待处理记录。' : latest ? '其余已加载记录已在上方展示。' : '尚无执行记录。'}</p>}
      <div className="automation-history">{earlier.map(o => card(o))}</div>
      {loading && <Loading>正在读取执行记录…</Loading>}
      {history.nextCursor && <Button variant="secondary" disabled={loading} onClick={() => setPages(value => value + 1)}>加载更早记录</Button>}
      {loadError && <Button variant="secondary" onClick={() => void refresh()}>重试读取</Button>}
    </section>
  </div>
}
export function AutomationOccurrenceView({ api, id, active, onConversation }: { api: DesktopApi; id: string; active: boolean; onConversation(id: string, messageId?: string): void }) {
  const [record, setRecord] = useState<AutomationHistoryPage['occurrences'][number]>(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void api.request('getAutomationOccurrence', { id }).then(value => { if (live) { setRecord(value); setError('') } }).catch(cause => { if (live) setError(errorText(cause)) })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 100) })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, id, active, revision])
  useEffect(() => { if (!active || !record) return; const element = document.getElementById(`occurrence-${id}`); element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'nearest' }) }, [active, id, record?.id])
  return <section aria-label="单次执行结果"><h2>本次执行结果</h2>{error && <Banner>{error}</Banner>}{record ? <AutomationOccurrenceCard api={api} active={active} occurrence={record} expanded onRefresh={async () => setRevision(v => v + 1)} onConversation={onConversation} /> : !error && <Loading>正在读取本次结果…</Loading>}</section>
}

function AutomationOccurrenceCard({ api, active, occurrence: o, expanded, onRefresh, onConversation, onOccurrence }: { api: DesktopApi; active: boolean; onOccurrence?(id: string): void; occurrence: AutomationHistoryPage['occurrences'][number]; expanded: boolean; onRefresh(): Promise<void>; onConversation(id: string, messageId?: string): void }) {
  const { busy, error, run } = useMutation()
  return <>{error && <Banner>{error}</Banner>}<Card className="connection-card gap-0 p-4" data-occurrence-id={o.id} id={`occurrence-${o.id}`} tabIndex={-1}><CardContent className="p-0">
      <div className="connection-card-top"><strong>{o.name}</strong><span className="pill"><span>{occurrenceStatusLabels[o.status]}</span> · <span>{deliveries[o.deliveryStatus]}</span></span></div>
      <p>{new Date(o.startedAt).toLocaleString()} · {o.source === 'manual' ? '手动触发' : '定时触发'}</p>{o.reason && <p>{o.reason}</p>}
      <details><summary>运行明细</summary>
      <p className="field-hint">{o.taskKind === 'monitor' ? '数据检查 · 未调用模型' : <>{o.resultMessageIds.length} 条结果 · {o.runIds.length} 条运行记录{o.modelCalls !== undefined ? ` · ${o.modelCalls} 次模型请求` : ''} · {usageLabel(o)}</>}</p>
      {o.taskKind !== 'monitor' && o.budget && <p className="field-hint">本次累计预算：{o.modelCalls ?? 0}/{o.budget.maxModelCalls} 次模型请求 · {o.budget.runs}/{o.budget.maxRuns} 次工作执行 · 当前期限 {new Date(o.budget.deadlineAt).toLocaleString()}</p>}
      {!!o.budget?.renewals?.length && <details><summary>额度追加记录（{o.budget.renewals.length} 次）</summary>{o.budget.renewals.map(grant => <p className="field-hint" key={grant.id}>{new Date(grant.createdAt).toLocaleString()} · 模型请求上限 {grant.before.maxModelCalls} → {grant.after.maxModelCalls} · 工作执行上限 {grant.before.maxRuns} → {grant.after.maxRuns} · 追加前已用 {grant.used.modelCalls} 次请求、{grant.used.runs} 次工作执行{grant.used.usageIncomplete ? '，用量仍不完整' : ''} · 截止 {new Date(grant.after.deadlineAt).toLocaleString()}<Button variant="ghost" size="sm" onClick={() => onConversation(o.conversationId, grant.messageId)}>定位确认消息</Button></p>)}</details>}
      <NoticeReceipts notices={o.notices ?? []} legacy={o.notificationDelivered} />
      </details>
      <div className="button-row">{onOccurrence && <Button variant="ghost" size="sm" onClick={() => onOccurrence(o.id)}>查看本次结果</Button>}{o.messageId && <Button variant="secondary" size="sm" onClick={() => onConversation(o.conversationId, o.resultMessageIds.at(-1) ?? o.messageId)}>打开会话与结果</Button>}{['running', 'admitted', 'waiting_approval', 'waiting_user', 'waiting_work'].includes(o.status) && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(async () => { await api.request('stopAutomation', { id: o.id }); await onRefresh() })}>停止本次</Button>}</div>
      {o.monitor && <MonitorResult occurrence={o} expanded={expanded} />}
      {o.messageId && <AutomationResult expanded={expanded} api={api} active={active} occurrence={o} onConversation={onConversation} />}
      {o.taskKind !== 'monitor' && (o.status === 'waiting_user' || exhausted(o) && o.deliveryStatus !== 'delivered' && (['failed', 'completed', 'waiting_work'].includes(o.status) || o.status === 'cancelled' && o.cancellationCause === 'budget')) && <AutomationReply api={api} occurrence={o} onSent={onRefresh} />}
    </CardContent></Card></>
}
function MonitorResult({ occurrence, expanded }: { occurrence: AutomationOccurrence; expanded: boolean }) {
  const result = occurrence.monitor!
  const labels = { baseline: '已建立基线', no_change: '没有变化', change: result.important ? '发现重要变化' : '变化未达到阈值', data_error: '数据检查失败' }
  return <details open={expanded}>
    <summary>监控结果 · {labels[result.outcome]}</summary>
    <p>来源：{result.policy.source.name} · 检查时间 {new Date(result.checkedAt).toLocaleString()}</p>
    {result.observedAt && <p>数据观测时间：{new Date(result.observedAt).toLocaleString()}</p>}
    <p>{result.notification === 'cooldown' ? '重要变化处于提醒间隔内；下次检查仍达到阈值时再提醒。' : result.notification === 'eligible' ? '达到重要更新条件；系统提醒遵循计划的通知偏好。' : '本次没有需要提醒的重要变化；数据失败按待处理通知。'}</p>
    {result.comparisons.map((value, i) => <div className="automation-result" key={value.pointer}><strong>{value.pointer || '整个 data'} · {result.policy.rules[i]?.mode === 'numeric_delta' ? `数值变化阈值 ${result.policy.rules[i].threshold}` : '内容变化'}</strong><pre className="automation-result-text">{JSON.stringify({ ...(Object.hasOwn(value, 'previous') ? { 上次观测: value.previous, 比较基线: value.reference } : {}), 本次观测: value.current, ...(value.delta !== undefined ? { 相对基线差值: value.delta } : {}) }, null, 2)}</pre></div>)}
    <details><summary>比较与来源证据</summary><p className="field-hint">比较器：{result.policy.comparator} · 数据有效期 {result.policy.maxAgeSeconds} 秒 · 提醒间隔 {result.policy.cooldownSeconds} 秒</p><p className="field-hint">规则版本：{result.policyFingerprint}</p>{result.evidence && <><p className="field-hint">产物：{result.evidence.artifactId} · 发布于 {new Date(result.evidence.publishedAt).toLocaleString()}</p><p className="field-hint">文件 SHA-256：{result.evidence.fileHash}</p></>} {result.sourceHash && <p className="field-hint">数据 SHA-256：{result.sourceHash}</p>}</details>
  </details>
}
function AutomationResult({ api, active, occurrence, onConversation, expanded = false }: { expanded?: boolean; api: DesktopApi; active: boolean; occurrence: AutomationOccurrence; onConversation(id: string, messageId?: string): void }) {
  const [open, setOpen] = useState(expanded), [items, setItems] = useState<ConversationMessageItem[]>(), [error, setError] = useState('')
  const resultKey = occurrence.resultMessageIds.join('|')
  useEffect(() => {
    if (!open || !active) return
    let live = true, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request; setItems(undefined); setError('')
      try { const result = await readDetailMessages(api, occurrence.conversationId, occurrence.resultMessageIds, () => live && token === request); if (live && token === request) setItems(result) }
      catch (cause) { if (live && token === request) { setItems(undefined); setError(errorText(cause)) } }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === occurrence.conversationId) { request++; clearTimeout(timer); setItems(undefined); setError('来源聊天已清理，本次结果正文不可用。'); return }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== occurrence.conversationId) return
      request++; setItems(undefined)
      if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, open, active, occurrence.id, occurrence.conversationId, occurrence.stateVersion, resultKey])
  const results = items?.flatMap(item => item.status === 'available' && item.message && (!item.message.origin || item.message.origin.occurrenceId === occurrence.id) ? [item.message] : []) ?? []
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>结果与证据</summary>
    {error ? <Banner>{error}</Banner> : !items ? open && active && <Loading>正在读取本次结果…</Loading> : <>
      {items.filter(item => item.status === 'unavailable').map(item => <Banner key={item.messageId}>{item.reason ?? '这条明确结果暂不可用。'}</Banner>)}
      {!results.length && <p className="field-hint">本次尚无可读取的结果正文，原始请求和执行状态可在聊天中核对。</p>}
      {results.map(message => <div className="automation-result" key={message.id}><strong>{message.senderName}</strong><p className="automation-result-text">{message.content || '暂无公开内容'}</p><Button variant="secondary" size="sm" onClick={() => onConversation(occurrence.conversationId, message.id)}>定位这条结果</Button></div>)}
      {!!occurrence.resultEvidence?.length && <ul>{occurrence.resultEvidence.map((evidence, index) => <li key={`${evidence.workId}:${index}`}>{evidence.kind === 'artifact' ? '文件' : '回答'} · {evidence.reference}{evidence.messageId && <Button variant="ghost" size="sm" onClick={() => onConversation(occurrence.conversationId, evidence.messageId)}>定位证据消息</Button>}</li>)}</ul>}
    </>}
  </details>
}
function AutomationReply({ api, occurrence, onSent }: { api: DesktopApi; occurrence: AutomationOccurrence; onSent: () => Promise<void> }) {
  const [content, setContent] = useState(''), [open, setOpen] = useState(false)
  const [version, setVersion] = useState(occurrence.stateVersion)
  const request = useRef<{ fingerprint: string; id: string } | undefined>(undefined)
  const { busy, error, run } = useMutation()
  const budget = occurrence.budget
  if (!budget) return <p className="field-hint">本次缺少可信预算，请核对已有结果后明确发起新一轮。</p>
  const renew = !!exhausted(occurrence)
  if (!open) return <Button variant="secondary" size="sm" onClick={() => { setVersion(occurrence.stateVersion); setOpen(true) }}>{renew ? '追加预算并继续' : '补充信息'}</Button>
  return <form className="form-grid" onSubmit={event => { event.preventDefault(); void run(async () => {
    const input = { occurrenceId: occurrence.id, content: content.trim(), ...(renew ? { renewBudget: { expectedVersion: version, allowance: 'standard-v1' as const } } : {}) }
    const fingerprint = JSON.stringify(input)
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() }
    await api.request('replyAutomation', { ...input, requestId: request.current.id })
    setContent(''); setOpen(false); await onSent()
  }) }}>
    {error && <div className="full"><Banner>{error}</Banner></div>}
    {renew && <div className="full"><p>原预算用尽后，确认将追加 {allowance.modelCalls} 次模型请求、{allowance.runs} 次工作执行和 {allowance.outputTokens} 输出 tokens，期限为确认后 {allowance.durationMs / 60000} 分钟。累计请求上限将为 {budget.maxModelCalls + allowance.modelCalls} 次；已消耗用量和未知用量继续保留。</p><p className="field-hint">同时增加 {allowance.workItems} 项工作、{allowance.retries} 次重试、{allowance.reportRefreshes} 次汇报修订和 {allowance.noProgress} 次无进展接续额度。已交付工作保持完成；存在待核对操作时不会直接续行。</p></div>}
    <Field label={renew ? '继续未完成工作的说明' : '本次运行的补充信息'} full hint={renew ? '先查看已有结果，再补充本次应继续处理的内容。' : '仅回复这一次运行，沿用原有预算和截止时间。'}><Textarea required maxLength={100000} value={content} onChange={event => setContent(event.target.value)} /></Field>
    <div className="button-row full"><Button type="submit" disabled={busy || !content.trim()}>{renew ? '确认追加额度并继续' : '提交补充'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>取消</Button></div>
  </form>
}

function NoticeReceipts({ notices, legacy }: { notices: AutomationNotice[]; legacy?: boolean }) {
  const labels: Record<AutomationNotice['status'], string> = { pending: '系统通知待提交', submitting: '系统通知正在提交', submitted: '系统通知已提交（不代表送达或已读）', failed: '系统通知提交失败', unknown: '系统通知提交状态未知', suppressed: '系统通知已取消提交' }
  return <>{legacy && !notices.length && <p className="field-hint">旧版本有通知记录，系统提交状态未知。</p>}{notices.map(notice => <p className="field-hint" key={notice.id}>{labels[notice.status]}{notice.error ? ` · ${notice.error}` : ''}</p>)}</>
}

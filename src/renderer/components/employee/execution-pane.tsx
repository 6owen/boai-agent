/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [INPUT]: 员工固定身份、可见会话范围、类型化执行查询和原聊天导航。
 * [OUTPUT]: API/本机共用员工执行详情，历史冻结配置、实际工具/Trace/Work/成果；隐藏停读、迟到隔离、明确停止原工作，不另建聊天或重跑任务。
 * [POS]: 员工资料下属的执行能力视图。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { isNativeBackend } from '@shared/domain/backends'
import { useEffect, useRef, useState } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { EMPLOYEE_EXECUTION_LIMITS } from '@shared/domain/employee-executions'
import type { EmployeeExecutionCursor, EmployeeExecutionDetail, EmployeeExecutionPage } from '@shared/domain/employee-executions'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SelectField } from '@/components/ui/select-field'
import { ArrowLeft, MessageCircle, RefreshCw } from '@/components/icons'
import { RunCard } from '@/pages/conversations/-components/run-detail'
import { TraceDetail } from '@/pages/conversations/-components/trace-detail'
import { runLabels } from '@/pages/conversations/presentation'

export type ExecutionSourceNavigation = (conversationId: string, messageId: string, current: () => boolean) => void
export function EmployeeExecutionPane({ api, agent, snapshot, active, conversationId, onOpenSource }: {
  api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; active: boolean; conversationId?: string; onOpenSource?: ExecutionSourceNavigation
}) {
  const [scope, setScope] = useState(conversationId ?? '')
  const [cursor, setCursor] = useState<EmployeeExecutionCursor>()
  const [page, setPage] = useState<EmployeeExecutionPage>()
  const [selected, setSelected] = useState('')
  const [detailValue, setDetail] = useState<EmployeeExecutionDetail>()
  const [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false)
  const [loadError, setLoadError] = useState(''), [detailError, setDetailError] = useState('')
  const [revision, setRevision] = useState(0)
  const source = useRef(0)
  const selectedConversation = useRef<string | undefined>(undefined)
  const { busy, error, run } = useMutation()
  const conversations = snapshot.conversations.filter(item => item.agentIds.includes(agent.id) && !item.list?.hidden)
  const detail = detailValue?.run.id === selected && detailValue.run.agentId === agent.id && conversations.some(item => item.id === detailValue.run.conversationId) ? detailValue : undefined
  selectedConversation.current = detail?.run.conversationId
  const scopeKey = JSON.stringify(conversations.map(item => item.id).sort())
  useEffect(() => {
    source.current++
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'conversation:cleared' || event.type === 'conversation:deleted') {
        if (event.conversationId === scope || event.conversationId === selectedConversation.current) { source.current++; setDetail(undefined); setSelected('') }
        setRevision(value => value + 1)
      } else if (event.type === 'changed' || event.type === 'message') {
        if (!timer) timer = setTimeout(() => { timer = undefined; setRevision(value => value + 1) }, 500)
      }
    })
    return () => { if (timer) clearTimeout(timer); unsubscribe(); source.current++ }
  }, [api, agent.id, agent.configVersion, active, scopeKey, scope])
  useEffect(() => {
    if (!active) return
    let current = true
    setPage(undefined); setLoadError(''); setLoading(true)
    void api.request('listEmployeeExecutions', { agentId: agent.id, ...(scope ? { conversationId: scope } : {}), ...(cursor ? { cursor } : {}) }).then(value => {
      if (current) setPage(value)
    }, cause => { if (current) setLoadError(errorText(cause)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, agent.id, agent.configVersion, active, scope, cursor, scopeKey, revision])
  useEffect(() => {
    setDetail(value => value?.run.id === selected && value.run.agentId === agent.id ? value : undefined); setDetailError('')
    if (!active || !selected) { setDetailLoading(false); return }
    let current = true
    setDetailLoading(true)
    void api.request('getEmployeeExecution', { agentId: agent.id, runId: selected }).then(value => {
      if (current) setDetail(value)
    }, cause => { if (current) { setDetail(undefined); setDetailError(errorText(cause)) } }).finally(() => { if (current) setDetailLoading(false) })
    return () => { current = false }
  }, [api, agent.id, agent.configVersion, active, selected, scopeKey, revision])
  const openSource = () => {
    if (!detail || !onOpenSource) return
    const generation = source.current
    void run(async () => {
      const value = await api.request('getEmployeeExecution', { agentId: agent.id, runId: detail.run.id })
      if (source.current !== generation) return
      onOpenSource(value.run.conversationId, value.run.triggerMessageId, () => source.current === generation)
    })
  }
  const stop = () => {
    if (!detail) return
    const generation = source.current
    void run(async () => {
      const value = await api.request('getEmployeeExecution', { agentId: agent.id, runId: detail.run.id })
      if (source.current !== generation || !value.work || value.work.ownerAgentId !== agent.id || value.work.activeRunId !== value.run.id || !['queued', 'running', 'waiting_approval'].includes(value.run.status)) return
      await api.request('cancelRun', { conversationId: value.run.conversationId, workId: value.work.id })
      if (source.current === generation) setRevision(current => current + 1)
    })
  }
  return <section className="detail-section space-y-4" aria-label={`${agent.name} 的执行详情`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3>执行详情</h3><Button variant="outline" size="sm" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}><RefreshCw />刷新</Button></div>
    <SelectField aria-label="执行记录会话" value={scope} onValueChange={value => { source.current++; setScope(value); setCursor(undefined); setSelected('') }} options={[{ value: '', label: '全部会话' }, ...conversations.map(item => ({ value: item.id, label: item.title }))]} />
    {error && <Banner>{error}</Banner>}
    {selected ? <>
      <Button variant="outline" size="sm" onClick={() => { source.current++; setSelected('') }}><ArrowLeft />返回执行记录</Button>
      {detailError && <Banner>{detailError}</Banner>}
      {detailLoading && !detail && <Loading />}
      {detail && <>
        <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{detail.configuration.kind === 'unknown' ? '尚未记录引擎' : detail.configuration.kind === 'mastra-model' ? '模型 API' : '本机 Agent'}</Badge><strong>{detail.configuration.label}</strong>{detail.configuration.programVersion && <span className="text-sm text-muted-foreground">{detail.configuration.programVersion}</span>}</div><p className="field-hint">{detail.configuration.modelId || '模型尚未记录'} · {detail.conversationTitle}{detail.configuration.configVersion ? ` · 员工配置版本 ${detail.configuration.configVersion}` : ''}</p></div>
        <div className="flex flex-wrap gap-2">{onOpenSource && <Button variant="outline" size="sm" disabled={busy} onClick={openSource}><MessageCircle />查看原聊天</Button>}{detail.work && ['queued', 'running', 'waiting_approval'].includes(detail.run.status) && <Button variant="secondary" size="sm" disabled={busy} onClick={stop}>停止此工作</Button>}</div>
        {detail.run.status === 'waiting_approval' && <p className="field-hint">这次执行正在等待批准，请在原聊天中处理。</p>}
        <RunCard run={detail.run} work={detail.work} busy={busy} historical={false} newerAttempt={false} canRetry={false} onRetry={() => {}} />
        {!isNativeBackend(detail.run.backend) && detail.run.usage && <p className="field-hint">输入 {detail.run.usage.inputTokens ?? '未知'} tokens · 输出 {detail.run.usage.outputTokens ?? '未知'} tokens</p>}
        {detail.run.traceError && <Banner>{detail.run.traceError}</Banner>}
        {detail.spans.length > 0 && <TraceDetail spans={detail.spans} runs={[detail.run]} />}
        {detail.spansTruncated && <p className="field-hint">这里只显示前 {EMPLOYEE_EXECUTION_LIMITS.traceSpans} 条执行记录，完整记录可在原聊天查看。</p>}
        {detail.artifacts.length > 0 && <div className="space-y-2"><h4>已发布成果</h4>{detail.artifacts.map(item => <p key={item.id} className="field-hint">{item.name}{item.contentVersion ? ` · 第 ${item.contentVersion} 版` : ''}</p>)}</div>}
        {detail.artifactsTruncated && <p className="field-hint">这里只显示前 {EMPLOYEE_EXECUTION_LIMITS.artifacts} 个成果，完整清单可在原聊天查看。</p>}
      </>}
    </> : <>
      {loadError && <Banner>{loadError}</Banner>}
      {loading && <Loading />}
      {page?.items.map(item => <Card key={item.run.id} className="gap-0 p-0"><CardContent className="p-0"><Button variant="ghost" size="content" className="w-full justify-start p-4 text-left" onClick={() => { source.current++; setSelected(item.run.id) }}><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate font-medium">{item.configuration.label}{item.configuration.modelId ? ` · ${item.configuration.modelId}` : ''}</span><span className="truncate text-sm text-muted-foreground">{item.conversationTitle} · {new Date(item.run.createdAt).toLocaleString('zh-CN')}</span></span><Badge variant="secondary">{item.run.workId && item.run.status === 'completed' ? '本次运行结束' : runLabels[item.run.status]}</Badge></Button></CardContent></Card>)}
      {page && !page.items.length && <p className="field-hint">此范围还没有执行记录。给员工发消息后，可以在这里查看。</p>}
      <div className="flex gap-2">{cursor && <Button variant="outline" size="sm" disabled={loading} onClick={() => setCursor(undefined)}>最新记录</Button>}{page?.nextCursor && <Button variant="outline" size="sm" disabled={loading} onClick={() => setCursor(page.nextCursor)}>更早记录</Button>}</div>
    </>}
  </section>
}

/*
 * [INPUT]: 员工/群固定身份、有界原执行查询和全局右侧面板导航。
 * [OUTPUT]: 直接展示执行记录、定时任务同款两行列表；点击固定Run打开右侧过程，隐藏停读、刷新保留列表、迟到隔离。
 * [POS]: 通讯录与员工配置共用执行记录，不创建聊天或重复执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createContext, useContext, useEffect, useState } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import type { EmployeeExecutionCursor } from '@shared/domain/employee-executions'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { CatalogSearch } from '@/components/common/catalog-search'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { Clock, RefreshCw } from '@/components/icons'
import { runLabels } from '@/pages/conversations/presentation'

export type EmployeeExecutionTarget = { conversationId: string; agentId: string; runId: string; title: string }
export const EmployeeExecutionNavigation = createContext<(target: EmployeeExecutionTarget) => void>(() => {})
type PaneProps = { api: DesktopApi; agent?: DigitalAgent; snapshot: Snapshot; active: boolean; conversationId?: string }
type Row = EmployeeExecutionTarget & { createdAt: string; status: keyof typeof runLabels; configuration: string }

export function EmployeeExecutionPane({ api, agent, snapshot, active, conversationId }: PaneProps) {
  const [scope, setScope] = useState(conversationId ?? ''), [pages, setPages] = useState(1)
  const [rows, setRows] = useState<Row[]>([]), [next, setNext] = useState(false)
  const [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [revision, setRevision] = useState(0), [search, setSearch] = useState(''), [selected, setSelected] = useState('')
  const openExecution = useContext(EmployeeExecutionNavigation)
  const conversations = snapshot.conversations.filter(item => agent && item.agentIds.includes(agent.id) && !item.list?.hidden && !item.mergedInto)
  const scopeKey = JSON.stringify(conversations.map(item => item.id).sort())
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'conversation:cleared' || event.type === 'conversation:deleted') {
        setRows(current => current.filter(row => row.conversationId !== event.conversationId)); setRevision(value => value + 1)
      } else if (event.type === 'changed' || event.type === 'message' || event.type === 'automation:history-deleted') {
        if (!timer) timer = setTimeout(() => { timer = undefined; setRevision(value => value + 1) }, 300)
      }
    })
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [api, active])
  useEffect(() => {
    if (!active) return
    let current = true
    setLoading(true)
    void (async () => {
      const items: Row[] = []; let cursor: EmployeeExecutionCursor | undefined
      for (let index = 0; index < pages; index++) {
        if (agent) {
          const page = await api.request('listEmployeeExecutions', { agentId: agent.id, ...(scope ? { conversationId: scope } : {}), cursor })
          if (!current) return
          items.push(...page.items.map(item => ({ runId: item.run.id, agentId: item.run.agentId, conversationId: item.run.conversationId, title: item.conversationTitle, createdAt: item.run.createdAt, status: item.run.status, configuration: [item.configuration.label, item.configuration.modelId].filter(Boolean).join(' · ') })))
          cursor = page.nextCursor
        } else if (scope) {
          const page = await api.request('listExecutionHistory', { conversationId: scope, before: cursor })
          if (!current) return
          items.push(...page.items.map(({ run, trigger }) => ({ runId: run.id, agentId: run.agentId, conversationId: run.conversationId, title: trigger || run.agentName, createdAt: run.createdAt, status: run.status, configuration: run.agentName })))
          cursor = page.next
        }
        if (!cursor) break
      }
      if (current) { setRows(items); setNext(Boolean(cursor)); setLoaded(true); setError('') }
    })().catch(cause => { if (current) setError(errorText(cause)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, agent?.id, agent?.configVersion, active, scope, pages, scopeKey, revision])
  const matches = rows.filter(row => `${row.title} ${row.configuration} ${runLabels[row.status]}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return <section className="automation-records" aria-label="执行记录">
    <div className="automation-records-heading"><h3>执行记录</h3><div className="button-row"><Button variant="ghost" size="icon-sm" aria-label="刷新执行记录" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw /></Button><CatalogSearch label="搜索已加载执行记录" value={search} onChange={setSearch} /></div></div>
    {agent && !conversationId && <SelectField aria-label="执行记录会话" value={scope} onValueChange={value => { setScope(value); setPages(1); setRows([]); setLoaded(false); setSelected('') }} options={[{ value: '', label: '全部会话' }, ...conversations.map(item => ({ value: item.id, label: item.title }))]} />}
    {error && <><Banner>{error}</Banner><Button variant="secondary" size="sm" onClick={() => setRevision(value => value + 1)}>重试读取</Button></>}
    {!loaded && loading && <Loading>正在读取执行记录…</Loading>}
    <div className="automation-record-list">{matches.map(row => {
      const subtitle = `${new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false })} · ${row.configuration} · ${runLabels[row.status]}`
      return <Button key={row.runId} variant="ghost" size="content" className={`conversation-item automation-record-row${selected === row.runId ? ' selected' : ''}`} data-employee-run-id={row.runId} aria-pressed={selected === row.runId} onClick={() => { if (!active) return; setSelected(row.runId); openExecution(row) }}><span className="skill-list-icon"><Clock /></span><span className="conversation-copy"><strong className="conversation-title" title={row.title}>{row.title}</strong><small className="conversation-preview" title={subtitle}>{subtitle}</small></span></Button>
    })}</div>
    {loaded && !matches.length && <p className="field-hint">{search ? '已加载记录中没有匹配项' : '暂无执行记录'}</p>}
    {next && <Button variant="secondary" size="sm" disabled={loading} onClick={() => setPages(value => value + 1)}>加载更早记录</Button>}
  </section>
}

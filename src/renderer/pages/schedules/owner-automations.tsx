/*
 * [INPUT]: 明确员工或群归属、固定游标IPC、原计划编辑与执行记录组件。
 * [OUTPUT]: 员工/群详情中的自动化列表、配置、暂停/运行与本次记录；隐藏停读和迟到隔离。
 * [POS]: 员工与群共用右侧自动化面板；不建立第二份计划或调度器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { AutomationDefinition, AutomationListPage, AutomationOwner, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, GuardContext, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { AutomationEditorTab } from './automation-editor'
import { AutomationHistory, AutomationOccurrenceView, occurrenceStatusLabels } from './automation-history'
import { automationOwnerKey } from './automation-owner'

export function OwnerAutomations({ api, snapshot, owner, active, onConversation }: { api: DesktopApi; snapshot: Snapshot; owner: AutomationOwner; active: boolean; onConversation(id: string, messageId?: string): void }) {
  const [page, setPage] = useState<AutomationListPage>(), [loadError, setLoadError] = useState(''), [revision, setRevision] = useState(0)
  const [route, setRoute] = useState<{ kind: 'list' } | { kind: 'edit'; id?: string } | { kind: 'plan'; definition: AutomationDefinition } | { kind: 'occurrence'; id: string; plan: AutomationDefinition }>({ kind: 'list' })
  const generation = useRef(0), mounted = useRef(false), guard = useContext(GuardContext), { busy, error, run } = useMutation()
  const ownerKey = automationOwnerKey(owner), planId = route.kind === 'plan' ? route.definition.id : undefined
  useEffect(() => {
    if (!active || route.kind === 'edit') return
    const token = ++generation.current; mounted.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    void Promise.all([api.request('listOwnerAutomations', { owner, limit: 30 }), planId ? api.request('getAutomation', { id: planId }) : Promise.resolve(undefined)]).then(([value, definition]) => { if (mounted.current && token === generation.current) { setPage(value); setLoadError(definition === null ? '此计划已删除，执行记录仍保留在全局历史中。' : ''); if (planId) setRoute(current => current.kind === 'plan' && current.definition.id === planId ? definition ? { kind: 'plan', definition } : { kind: 'list' } : current) } }).catch(cause => { if (mounted.current && token === generation.current) setLoadError(errorText(cause)) })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 150) })
    return () => { mounted.current = false; generation.current++; clearTimeout(timer); unsubscribe() }
  }, [api, active, ownerKey, revision, route.kind, planId])
  const navigate = (value: typeof route) => guard.navigate(() => setRoute(value), { resetOnDiscard: false })
  const refresh = () => setRevision(v => v + 1)
  const plan = route.kind === 'plan' ? route.definition : undefined
  if (route.kind === 'edit') return <AutomationEditorTab key={route.id ?? ownerKey} api={api} snapshot={snapshot} id={route.id} owner={owner} onClose={() => setRoute({ kind: 'list' })} onSaved={definition => { setRoute({ kind: 'plan', definition }); refresh() }} />
  return <div className="detail-section" aria-label="归属自动化">
    {(error || loadError) && <Banner>{error || loadError}</Banner>}
    {route.kind === 'list' ? <>
      <div className="page-heading"><h3>自动化</h3><Button onClick={() => navigate({ kind: 'edit' })}>新建自动化</Button></div>
      <p className="field-hint">也可以在与员工或群聊的对话中描述任务、时间和分工，由员工保存计划。</p>
      {!page ? !loadError && <Loading /> : !page.definitions.length ? <p>暂无自动化计划</p> : page.definitions.map(definition => <Button key={definition.id} variant="ghost" size="content" className="schedule-item" onClick={() => navigate({ kind: 'plan', definition })}><strong>{definition.name}</strong><small>{definition.enabled ? '已开启' : '已暂停'} · {definition.time} · {definition.timezone}</small><small>下次：{definition.nextTimes[0] ? new Date(definition.nextTimes[0]).toLocaleString() : '暂无'} · 最近：{definition.latestOccurrence ? definition.latestOccurrence.deliveryStatus === 'delivered' ? '已交付' : occurrenceStatusLabels[definition.latestOccurrence.status] : '尚未执行'}</small></Button>)}
      {page?.nextCursor && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { const token = generation.current; const next = await api.request('listOwnerAutomations', { owner, before: page.nextCursor, limit: 30 }); if (mounted.current && token === generation.current) setPage(current => ({ definitions: [...current!.definitions, ...next.definitions.filter(d => !current!.definitions.some(prior => prior.id === d.id))], nextCursor: next.nextCursor })) })}>更早的计划</Button>}
    </> : <Button variant="ghost" onClick={() => navigate(route.kind === 'occurrence' ? { kind: 'plan', definition: route.plan } : { kind: 'list' })}>返回{route.kind === 'occurrence' ? '计划' : '自动化列表'}</Button>}
    {plan && <>
      <h3>{plan.name}</h3><p className="automation-prompt">{plan.prompt}</p><p>{plan.time} · {plan.timezone} · {plan.enabled ? '已开启' : '已暂停'}</p>
      {plan.collaboration && <section aria-label="计划分工">{plan.collaboration.assignments.map(a => <p key={a.employeeId}><strong>{snapshot.agents.find(e => e.id === a.employeeId)?.name ?? '员工不可用'}{a.employeeId === plan.collaboration?.coordinatorId ? '（负责人）' : ''}</strong>：{a.instruction}<br />交付：{a.deliverable}{a.dependsOn.length > 0 && <><br />等待：{a.dependsOn.map(id => snapshot.agents.find(e => e.id === id)?.name ?? '员工不可用').join('、')}</>}</p>)}</section>}
      <div className="button-row"><Button variant="secondary" onClick={() => navigate({ kind: 'edit', id: plan.id })}>编辑配置</Button><Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api.request(plan.enabled ? 'pauseAutomation' : 'resumeAutomation', { id: plan.id }); refresh() })}>{plan.enabled ? '暂停计划' : '恢复计划'}</Button><Button variant="secondary" disabled={busy} onClick={() => void run(async () => { const occurrence = await api.request('runAutomation', { id: plan.id, requestId: crypto.randomUUID() }); setRoute({ kind: 'occurrence', id: occurrence.id, plan }); refresh() })}>立即运行一次</Button><Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await api.request('deleteAutomation', { id: plan.id }); setRoute({ kind: 'list' }); refresh() })}>删除计划</Button></div>
      {plan.syncError && <Banner>{plan.syncError}</Banner>}
      <AutomationHistory key={plan.id} api={api} active={active} automationId={plan.id} onConversation={onConversation} onOccurrence={id => navigate({ kind: 'occurrence', id, plan })} />
    </>}
    {route.kind === 'occurrence' && <AutomationOccurrenceView key={route.id} api={api} active={active} id={route.id} onConversation={onConversation} />}
  </div>
}

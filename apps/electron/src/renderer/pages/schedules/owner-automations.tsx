/*
 * [OUTPUT]: 员工详情统一展示普通任务与定时计划入口。
 * [OUTPUT]: 员工/群计划展示复用执行记录两行列表，点击仍定位唯一管理页。
 * [INPUT]: 员工/旧群归属、有界计划IPC与全局任务导航。
 * [OUTPUT]: 只读计划列表；点击回到唯一管理页，隐藏停读、迟到隔离、游标分页。
 * [POS]: 员工详情的查看入口，不保存计划或执行任务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AutomationListPage, AutomationOwner, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, errorText, GuardContext, Loading, useMutation } from '@/components/common'
import { Clock } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { automationOwnerKey } from './automation-owner'
import { scheduleSummary } from './schedule-presentation'
export const ScheduleNavigationContext = createContext<(id: string) => void>(() => {})
export function OwnerAutomations({ api, owner, active }: { api: DesktopApi; snapshot: Snapshot; owner: AutomationOwner; active: boolean; onConversation?(id: string, messageId?: string): void }) {
  const [page, setPage] = useState<AutomationListPage>(), [loadError, setLoadError] = useState(''), [revision, setRevision] = useState(0)
  const generation = useRef(0), guard = useContext(GuardContext), onOpen = useContext(ScheduleNavigationContext), { busy, error, run } = useMutation()
  const ownerKey = automationOwnerKey(owner)
  useEffect(() => { setPage(undefined); setLoadError('') }, [ownerKey])
  useEffect(() => {
    if (!active) return
    const token = ++generation.current
    let timer: ReturnType<typeof setTimeout> | undefined
    void api.request('listOwnerAutomations', { owner, limit: 30 }).then(value => { if (token === generation.current) { setPage(value); setLoadError('') } }).catch(cause => { if (token === generation.current) setLoadError(errorText(cause)) })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 150) })
    return () => { generation.current++; clearTimeout(timer); unsubscribe() }
  }, [api, active, ownerKey, revision])
  return <section className="automation-records contact-section" aria-label="员工任务">
    <div className="automation-records-heading"><h3>任务</h3></div>{(error || loadError) && <Banner>{error || loadError}</Banner>}
    {!page ? !loadError && <Loading /> : !page.definitions.length ? <p className="field-hint">暂无任务</p> : page.definitions.map(definition => <Button key={definition.id} variant="ghost" size="content" className="conversation-item automation-record-row" onClick={() => guard.navigate(() => onOpen(definition.id))}><span className="skill-list-icon"><Clock /></span><span className="conversation-copy"><strong className="conversation-title">{definition.name}</strong><small className="conversation-preview">{!definition.enabled ? '已暂停 · ' : ''}{scheduleSummary(definition)}</small></span></Button>)}
    {page?.nextCursor && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { const token = generation.current; const next = await api.request('listOwnerAutomations', { owner, before: page.nextCursor, limit: 30 }); if (token === generation.current) setPage(current => ({ definitions: [...current!.definitions, ...next.definitions.filter(d => !current!.definitions.some(prior => prior.id === d.id))], nextCursor: next.nextCursor })) })}>更早的计划</Button>}
  </section>
}

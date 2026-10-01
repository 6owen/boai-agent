/*
 * [INPUT]: 持久批量检查、单项检查与更新操作状态、应用变更事件、所属页面标签活跃状态及技能详情导航。
 * [OUTPUT]: 更新详情的收起箭头固定12px；Shell 右侧详情标签内的批量检查/停止，隐藏时暂停列表轮询且恢复不重新发起检查、实时结果与图标操作；逐项展开差异并就地升级，已升级状态不沿用旧批次的可更新标记。
 * [POS]: library 的批量更新区域；由 Shell 常驻标签承载，切换/收起保留状态，兼容旧资料库入口，不创建弹窗。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { SkillOperation, SkillUpdateBatch, SkillUpdateCheck } from '@shared/domain/skills'
import { Banner, errorText, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ArrowUp, Check, ChevronRight, LoaderCircle, RefreshCw } from '@/components/icons'
import { SkillUpdate } from './skill-update'

const statuses = { pending: '等待检查', checking: '正在检查', current: '已是最新', available: '有可用更新', failed: '检查失败', unsupported: '来源不支持', updating: '正在升级', updated: '已升级', interrupted: '升级未完成' }
export function SkillUpdateBatchView({ api, onResource, onUpdated, autoStart = false, localOnly = false, active = true }: { api: DesktopApi; onResource: (id: string) => void; onUpdated?: () => void; autoStart?: boolean; localOnly?: boolean; active?: boolean }) {
  const [batch, setBatch] = useState<SkillUpdateBatch | null>(null), [error, setError] = useState(''), [stopping, setStopping] = useState(false)
  const [operations, setOperations] = useState<SkillOperation[]>([]), [checks, setChecks] = useState<SkillUpdateCheck[]>([])
  const [selected, setSelected] = useState<{ id: string; autoCheck: boolean } | null>(null)
  const [startError, setStartError] = useState(''), [starting, setStarting] = useState(autoStart)
  const mutation = useMutation(), initialRequest = useRef(crypto.randomUUID()), started = useRef(false)
  useEffect(() => {
    if (!active) return
    let alive = true, generation = 0
    const reload = async (start = false) => {
      const current = ++generation
      try {
        const [result, operations, checks] = await Promise.all([
          start ? api.request('checkAllSkillUpdates', { requestId: initialRequest.current, ...(localOnly ? { scope: 'local' as const } : {}) }) : api.request('getSkillUpdateBatch', undefined),
          api.request('listSkillOperations', undefined), api.request('listSkillUpdateChecks', undefined),
        ])
        if (alive && current === generation) { setBatch(result); setOperations(operations); setChecks(checks); setError(''); if (start) setStartError(''); if (result?.status !== 'running') setStopping(false) }
      } catch (error) { if (alive && (start || current === generation)) { if (start) setStartError(errorText(error)); else setError(errorText(error)) } }
      finally { if (alive && current === generation) setStarting(false) }
    }
    const start = autoStart && !started.current
    started.current = true
    void reload(start)
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') void reload() })
    const timer = setInterval(() => { void reload() }, 1500)
    return () => { alive = false; clearInterval(timer); unsubscribe() }
  }, [api, autoStart, localOnly, active])
  const updated = useCallback(() => { onUpdated?.() }, [onUpdated])
  const completed = batch?.items.filter(item => item.status !== 'pending').length ?? 0
  const checkingId = batch?.status === 'running' ? batch.items.find(item => item.status === 'pending')?.resourceId : undefined
  const rows = (batch?.items ?? []).map(item => {
    const check = checks.find(check => check.resourceId === item.resourceId && check.checkedAt >= batch!.createdAt)
    const operation = operations.find(operation => operation.kind === 'update' && (operation.createdAt ?? '') >= (check?.checkedAt ?? batch!.createdAt) && operation.items.some(value => value.resourceId === item.resourceId))
    const status: keyof typeof statuses = operation ? operation.status === 'running' ? 'updating' : operation.items[0]?.status === 'updated' ? 'updated' : 'interrupted' : check?.status ?? (checkingId === item.resourceId ? 'checking' : item.status)
    return { ...item, status, error: operation?.items[0]?.error ?? check?.error ?? item.error }
  })
  const available = rows.filter(row => row.status === 'available').length
  return <section className="skill-update-batch" aria-label="全部技能更新检查">
    <div className="skill-update-toolbar"><div><strong>{starting ? '正在准备检查…' : batch?.status === 'running' ? `已检查 ${completed} / ${batch.items.length}` : batch ? `${available} 个技能可更新` : '检查技能更新'}</strong><p>检查远程来源，查看差异后逐项升级。</p></div><div className="button-row">
      <Button variant="secondary" disabled={starting || mutation.busy || batch?.status === 'running'} onClick={() => { void mutation.run(async () => { const result = await api.request('checkAllSkillUpdates', { requestId: crypto.randomUUID(), ...(localOnly ? { scope: 'local' as const } : {}) }); setStartError(''); setSelected(null); setBatch(result); setStopping(false) }) }}><RefreshCw />{batch ? '重新检查' : '检查全部更新'}</Button>
      {batch?.status === 'running' && <Button variant="ghost" disabled={mutation.busy || stopping} onClick={() => { void mutation.run(async () => { await api.request('cancelSkillUpdateBatch', undefined); setStopping(true) }) }}>{stopping ? '正在停止…' : '停止检查'}</Button>}
    </div></div>
    {(startError || error || mutation.error) && <Banner>{startError || error || mutation.error}</Banner>}
    {batch && <p className="field-hint" role="status">{{ running: '正在检查', completed: '检查已结束', cancelled: '检查已停止', interrupted: '检查已中断，请重新检查' }[batch.status]} · {new Date(batch.createdAt).toLocaleString('zh-CN')}</p>}
    {batch && !rows.length && <p className="skill-update-empty">没有可检查的远程来源；没有来源记录的技能需重新导入。</p>}
    {!!rows.length && <Card className="gap-0 overflow-hidden p-0"><div className="soft-divide-y">{rows.map(item => {
      const expanded = selected?.id === item.resourceId
      const loading = item.status === 'checking' || item.status === 'updating'
      const current = item.status === 'current' || item.status === 'updated'
      const label = loading ? statuses[item.status] : item.status === 'available' ? `查看 ${item.name} 更新并升级` : current ? `重新检查 ${item.name}` : `检查 ${item.name} 更新`
      const heading = (actions: ReactNode) => <div className="skill-update-result-heading"><div><Button variant="ghost" size="content" className="skill-update-name" onClick={() => onResource(item.resourceId)}>{item.name}</Button><span>{statuses[item.status]}{item.localModified ? ' · 有本地修改' : ''}</span></div><div className="button-row">{actions}{expanded && <Button variant="ghost" size="icon-sm" aria-label={`收起 ${item.name} 更新详情`} onClick={() => setSelected(null)}><ChevronRight size={12} className="rotate-90" /></Button>}</div></div>
      return <div className="skill-update-result" key={item.resourceId}>{expanded ? <SkillUpdate api={api} resourceId={item.resourceId} autoCheck={selected?.autoCheck} onUpdated={updated}>{({ actions, content }) => <>{heading(actions)}{content}</>}</SkillUpdate> : <>
        {heading(<Tooltip><TooltipTrigger delay={500} render={<Button variant={item.status === 'available' ? 'secondary' : 'ghost'} size="icon-sm" aria-label={label} disabled={item.status === 'pending' || item.status === 'checking'} onClick={() => setSelected({ id: item.resourceId, autoCheck: !['available', 'updating'].includes(item.status) })} />}>
          {loading ? <LoaderCircle className="spinner" /> : item.status === 'available' ? <ArrowUp /> : current ? <Check /> : <RefreshCw />}
        </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>)}
        {item.error && <p className="field-hint skill-update-result-error">{item.error}</p>}
      </>}</div>
    })}</div></Card>}
  </section>
}

/*
 * [INPUT]: 标题栏浮层/结果行内嵌展示模式、本机或受管技能身份、持久更新检查、实际包预览和操作 IPC。
 * [OUTPUT]: 图标式检查/升级/进行中状态、详情标题栏通过可点击的图标浮层展示状态/差异，检查与升级中仍可打开，批量结果行保留内嵌模式；重连正在进行的更新，保留本地修改/未知基线确认和迟到响应隔离。
 * [POS]: 技能详情与批量更新列表共用的单项更新交互；不创建弹窗，本机技能不展示员工绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { SkillOperation, SkillUpdateCheck } from '@shared/domain/skills'
import { Banner, errorText, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ArrowUp, Check, LoaderCircle, RefreshCw, X } from '@/components/icons'
import { SkillPreview } from './skill-preview'

const states = { current: '内容已是最新', available: '有可用更新', unsupported: '此来源不支持检查更新', failed: '检查更新失败' }
type UpdateView = { actions: ReactNode; content: ReactNode }
export function SkillUpdate({ api, resourceId, onUpdated, autoCheck = false, popover = false, children }: { api: DesktopApi; resourceId: string; onUpdated: () => void; autoCheck?: boolean; popover?: boolean; children?: (view: UpdateView) => ReactNode }) {
  const [check, setCheck] = useState<SkillUpdateCheck | null>(null), [operation, setOperation] = useState<SkillOperation | null>(null), [pollError, setPollError] = useState('')
  const [phase, setPhase] = useState<'loading' | 'checking' | 'updating' | null>('loading')
  const { busy: mutating, error, run } = useMutation()
  const busy = phase !== null || mutating
  const [replaceLocal, setReplaceLocal] = useState(false), [previewing, setPreviewing] = useState(false)
  const requestId = useRef(''), generation = useRef(0), loadGeneration = useRef(0)
  useEffect(() => {
    const scope = ++generation.current
    setCheck(null); setOperation(null); setPollError(''); setReplaceLocal(false); requestId.current = ''
    const reload = () => {
      const current = ++loadGeneration.current
      api.request('listSkillUpdateChecks', undefined).then(values => { if (scope === generation.current && current === loadGeneration.current) setCheck(values.find(value => value.resourceId === resourceId) ?? null) }, error => { if (scope === generation.current && current === loadGeneration.current) setPollError(errorText(error)) })
    }
    setPhase('loading')
    const initialize = async () => {
      const values = await api.request('listSkillOperations', undefined)
      if (scope !== generation.current) return
      const running = values.find(value => value.kind === 'update' && value.status === 'running' && value.items.some(item => item.resourceId === resourceId)) ?? null
      setOperation(running)
      if (autoCheck && !running) {
        setPhase('checking')
        const result = await api.request('checkSkillUpdate', { id: resourceId })
        if (scope === generation.current) setCheck(result)
      } else reload()
    }
    void initialize().catch(error => { if (scope === generation.current) setPollError(errorText(error)) }).finally(() => { if (scope === generation.current) setPhase(null) })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') reload() })
    return () => { generation.current++; unsubscribe() }
  }, [api, resourceId, autoCheck])
  useEffect(() => { setReplaceLocal(false); setPreviewing(false); requestId.current = '' }, [check?.planId])
  useEffect(() => {
    if (operation?.status !== 'running') return
    let alive = true, inFlight = false
    const timer = setInterval(() => {
      if (inFlight) return
      inFlight = true
      api.request('getSkillOperation', { id: operation.id }).then(result => {
        if (!alive) return
        setOperation(result); setPollError('')
        if (result.status !== 'running' && result.items[0]?.status === 'updated') onUpdated()
      }, error => { if (alive) setPollError(errorText(error)) }).finally(() => { inFlight = false })
    }, 500)
    return () => { alive = false; clearInterval(timer) }
  }, [api, operation?.id, operation?.status, onUpdated])
  const checkNow = () => run(async () => {
    const scope = generation.current
    ++loadGeneration.current
    setPhase('checking'); setPollError(''); setOperation(null); setCheck(null); setReplaceLocal(false); requestId.current = ''
    try { const result = await api.request('checkSkillUpdate', { id: resourceId }); if (scope === generation.current) setCheck(result) }
    finally { if (scope === generation.current) setPhase(null) }
  })
  const upgrade = () => run(async () => {
    if (!check?.planId || !check.candidateId) return
    requestId.current ||= crypto.randomUUID()
    const scope = generation.current
    setPhase('updating'); setPollError('')
    try {
      const result = await api.request('updateSkill', { requestId: requestId.current, planId: check.planId, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash!, replaceLocalChanges: replaceLocal })
      if (scope === generation.current) { setOperation(result); if (result.status !== 'running' && result.items[0]?.status === 'updated') onUpdated() }
    } finally { if (scope === generation.current) setPhase(null) }
  })
  const updating = operation?.status === 'running' || phase === 'updating'
  const available = check?.status === 'available' && !operation
  const canUpgrade = available && Boolean(check.planId && check.candidateId)
  const needsConfirmation = Boolean(check?.localModified || check?.baselineUnknown)
  const updated = operation?.items[0]?.status === 'updated' && operation.status !== 'running'
  const label = updating ? '正在升级技能' : phase === 'checking' ? '正在检查更新' : phase === 'loading' ? '正在读取更新状态' : canUpgrade ? (needsConfirmation && !replaceLocal ? '请先确认替换当前文件' : '升级技能') : updated ? '已升级，点击重新检查' : check?.status === 'current' ? '已是最新，点击重新检查' : '检查技能更新'
  const icon = busy || updating ? <LoaderCircle className="spinner" /> : canUpgrade ? <ArrowUp /> : updated || check?.status === 'current' ? <Check /> : <RefreshCw />
  const inlineActions = <>
    <Tooltip><TooltipTrigger delay={500} render={<Button variant={canUpgrade ? 'secondary' : 'ghost'} size="icon-sm" aria-label={label} disabled={busy || updating || (canUpgrade && needsConfirmation && !replaceLocal)} onClick={() => { void (canUpgrade ? upgrade() : checkNow()) }} />}>
      {icon}
    </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
    {canUpgrade && <Tooltip><TooltipTrigger delay={500} render={<Button variant="ghost" size="icon-sm" aria-label="重新检查更新" disabled={busy} onClick={() => { void checkNow() }} />}><RefreshCw /></TooltipTrigger><TooltipContent>重新检查更新</TooltipContent></Tooltip>}
    {operation?.status === 'running' && <Tooltip><TooltipTrigger delay={500} render={<Button variant="ghost" size="icon-sm" aria-label="取消升级" disabled={mutating} onClick={() => { void run(() => api.request('cancelSkillOperation', { id: operation.id })) }} />}><X /></TooltipTrigger><TooltipContent>取消升级</TooltipContent></Tooltip>}
    <span className="sr-only" role="status">{label}</span>
  </>
  const content = busy || error || pollError || check || operation ? <div className="skill-update-content">
    {phase && <p className="field-hint" role="status">{phase === 'checking' ? '正在读取远程来源并比较技能文件…' : phase === 'updating' ? '正在提交升级…' : '正在读取更新状态…'}</p>}
    {(error || pollError) && <Banner>{error || pollError}</Banner>}
    {check && !operation && <p className="field-hint" role="status">{states[check.status]} · {new Date(check.checkedAt).toLocaleString('zh-CN')}{check.error && <><br />{check.error}</>}</p>}
    {check?.status === 'available' && !operation && (check.planId && check.candidateId ? <>
      {check.source?.kind === 'git' && <p className="field-hint">{check.source.repository} · {check.source.ref} · {check.source.resolvedCommit?.slice(0, 12) ?? '未知版本'}</p>}
      {check.fileChanges && <div aria-label="更新文件变化"><p className="field-hint">新增 {check.fileChanges.added.length} · 修改 {check.fileChanges.modified.length} · 删除 {check.fileChanges.removed.length} · 未变 {check.fileChanges.unchanged}</p>{(['added', 'modified', 'removed'] as const).map(kind => check.fileChanges![kind].length > 0 && <details key={kind}><summary>{{ added: '新增文件', modified: '修改文件', removed: '删除文件' }[kind]}</summary>{check.fileChanges![kind].map(path => <p className="field-hint" key={path}>{path}</p>)}</details>)}</div>}
      {!resourceId.startsWith('local:') && <p className="field-hint">受影响员工：{check.affectedEmployees?.map(value => value.name).join('、') || '尚无员工绑定'}。更新保留收藏和绑定；任务仍在使用时不会替换。</p>}
      {needsConfirmation && <><Banner kind="notice">{check.baselineUnknown ? '旧安装记录没有原始内容，无法确认是否存在本地修改。' : '此副本有本地修改。'}升级会替换当前文件，请先导出需要保留的内容。</Banner><label className="skill-check"><Checkbox disabled={busy} checked={replaceLocal} onCheckedChange={value => setReplaceLocal(Boolean(value))} />我已保留需要的内容，确认替换当前文件</label><Button variant="ghost" size="sm" disabled={busy} onClick={() => { const planId = check.planId!; setCheck({ ...check, planId: undefined, candidateId: undefined }); void run(() => api.request('discardSkillScan', { id: planId })) }}>保留当前内容</Button></>}
      <details className="skill-update-preview" key={check.planId} onToggle={event => setPreviewing(event.currentTarget.open)}><summary>查看更新后的技能内容</summary>{previewing && <SkillPreview api={api} scanId={check.planId} candidateId={check.candidateId} />}</details>
    </> : <p className="field-hint">预览已过期，请点击检查图标重新检查。</p>)}
    {operation && <p role="status" className="field-hint">{operation.status === 'running' ? '正在升级…' : updated ? '已升级' : '升级未完成'}{operation.items[0]?.error && <><br />{operation.items[0].error}</>}</p>}
  </div> : null
  const actions = popover ? <Popover>
    <PopoverTrigger render={<Button variant={canUpgrade ? 'secondary' : 'ghost'} size="icon-sm" aria-label={updating ? '正在升级技能，查看详情' : busy ? '正在检查技能，查看详情' : '查看技能更新'} title={updating ? '正在升级技能' : busy ? '正在检查技能' : '查看技能更新'} aria-busy={busy || updating} />} onClick={() => { if (!check && !operation && !busy) void checkNow() }}>{icon}</PopoverTrigger>
    <PopoverContent align="end" side="bottom" className="skill-update-popover w-[360px] max-w-[calc(100vw-24px)] gap-3 p-4">
      <div className="skill-update-popover-heading"><PopoverTitle>技能更新</PopoverTitle><div className="button-row">{inlineActions}</div></div>
      {content ?? <p className="field-hint">点击检查图标查看当前技能是否有更新。</p>}
    </PopoverContent>
  </Popover> : inlineActions
  return children ? children({ actions, content: popover ? null : content }) : <div className="skill-update"><div className="button-row">{actions}</div>{!popover && content}</div>
}

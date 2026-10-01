/*
 * [INPUT]: 已保存员工/配置版本、实际本机目录与冻结扫描预览、绑定和只读回执 IPC、页面活跃状态。
 * [OUTPUT]: 单项来源/hash/受管副本预览与明确绑定；最小载荷持久化、未知只核对、running 隐藏停读和迟到响应隔离。
 * [POS]: employee 本机技能绑定交互；不先显示成功，不保存正文/路径，不另行保存员工或执行工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DigitalAgent } from '@shared/domain'
import type { BindLocalSkillInput, LocalSkill, SkillBindingPlan, SkillBindingReceipt, SkillPreview } from '@shared/domain/skills'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading, sizeText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plus, RefreshCw } from '@/components/icons'
import { useLocalSkills } from '@/pages/library/use-local-skills'
import { SkillMarkdown } from '@/pages/library/skill-markdown'
import { SKILL_BINDING_PENDING_KEY, restoreSkillBindingPending, skillBindingPendingKey, skillBindingReceiptMatches, skillBindingSourceLabel, updateSkillBindingPending, type SkillBindingPending } from './local-skill-binding-state'

function readPending() { return restoreSkillBindingPending(JSON.parse(localStorage.getItem(SKILL_BINDING_PENDING_KEY) ?? '{}')) }

export function LocalSkillBinding({ api, agent, scope, active, expectedConfigVersion, configurationDirty, configurationBusy, onPendingChange, onBound }: {
  api: DesktopApi; agent: DigitalAgent; scope: string; active: boolean; expectedConfigVersion: number
  configurationDirty: boolean; configurationBusy: boolean; onPendingChange(locked: boolean): void
  onBound(receipt: SkillBindingReceipt, input: BindLocalSkillInput): Promise<void>
}) {
  const key = skillBindingPendingKey(scope, agent.id)
  const [pending, setPending] = useState<SkillBindingPending | undefined>()
  const pendingRef = useRef<SkillBindingPending | undefined>(undefined), generation = useRef(0), mounted = useRef(true), busyRequest = useRef(0)
  const [open, setOpen] = useState(false), [preparing, setPreparing] = useState(false), [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<SkillBindingPlan>(), [preview, setPreview] = useState<SkillPreview>()
  const [error, setError] = useState(''), [storageError, setStorageError] = useState(''), [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState<SkillBindingReceipt>()
  const current = useRef({ key, active, open, agent }); current.current = { key, active, open, agent }
  const persist = (next: SkillBindingPending | undefined, expectedRequestId?: string) => {
    try {
      const updated = updateSkillBindingPending(readPending(), key, next, expectedRequestId)
      if (!updated) return false
      localStorage.setItem(SKILL_BINDING_PENDING_KEY, JSON.stringify(updated))
      pendingRef.current = next; setPending(next); setStorageError(''); return true
    } catch { setStorageError('未能保存或读取绑定请求身份，请恢复本地存储后核对。'); return false }
  }
  useEffect(() => {
    mounted.current = true
    try { const saved = readPending()[key]; pendingRef.current = saved; setPending(saved); setStorageError('') } catch { setStorageError('本地绑定请求记录无法读取，请先恢复本地存储。') }
    return () => { mounted.current = false; generation.current++; onPendingChange(false) }
  }, [key])
  useEffect(() => { onPendingChange(Boolean(pending) || preparing) }, [pending, preparing, onPendingChange])
  const close = () => {
    generation.current++; busyRequest.current = 0; setOpen(false); setPreparing(false); setBusy(false)
    if (pendingRef.current?.status === 'submitting') persist({ ...pendingRef.current, status: 'unknown' }, pendingRef.current.input.requestId)
    if (plan && !pendingRef.current) void api.request('discardSkillScan', { id: plan.id }).catch(() => undefined)
    setPlan(undefined); setPreview(undefined)
  }
  useEffect(() => { if (!active) close() }, [active])
  const valid = (token: number, requestId?: string) => mounted.current && token === generation.current && current.current.key === key && current.current.active && current.current.open && (!requestId || pendingRef.current?.input.requestId === requestId)
  const observeReceipt = async (input: BindLocalSkillInput, found: SkillBindingReceipt | null, token: number) => {
    if (!valid(token, input.requestId)) return
    if (!found) { if (!persist({ input, status: 'not_accepted' }, input.requestId)) throw new Error('原请求身份已变化，请重新打开核对。'); setReceipt(undefined); setError(''); return }
    if (!skillBindingReceiptMatches(input, found)) throw new Error('回执与原绑定请求不一致，请保留原请求并核对。')
    setReceipt(found)
    if (found.status === 'running') { if (!persist({ input, status: 'running' }, input.requestId)) throw new Error('原请求身份已变化，请重新打开核对。'); return }
    if (found.status === 'completed') {
      if (!found.resource || !found.agent || !found.agent.skillIds.includes(found.resource.id) || found.agent.id !== agent.id) throw new Error('绑定已提交但返回的配置不完整，请保留原请求并核对。')
      await onBound(found, input)
      if (!valid(token, input.requestId)) return
      if (!persist(undefined, input.requestId)) throw new Error('绑定已提交，本地核对记录未清除；下次请只读核对。')
      const latest = current.current.agent
      setNotice(latest.configVersion > found.agent.configVersion && !latest.skillIds.includes(found.resource.id) ? '原绑定请求已完成；当前员工配置已另行变化，请核对现有绑定。' : `已绑定技能「${found.resource.name}」。`)
      setPlan(undefined); setPreview(undefined)
    } else {
      if (!persist(undefined, input.requestId)) throw new Error('终态已确认，本地核对记录未清除；请保留原请求。')
      setError(found.error ?? (found.status === 'interrupted' ? '绑定被重启中断，未自动重新复制。' : '绑定失败，员工配置未更新。'))
    }
  }
  const lookup = async () => {
    const saved = pendingRef.current
    if (!saved || busyRequest.current || !current.current.active || !current.current.open) return
    setBusy(true); setError('')
    const token = ++generation.current
    busyRequest.current = token
    try { await observeReceipt(saved.input, await api.request('getSkillBindingReceipt', { requestId: saved.input.requestId }), token) }
    catch (failure) { if (valid(token, saved.input.requestId)) { persist({ ...saved, status: 'unknown' }, saved.input.requestId); setError(errorText(failure)) } }
    finally { if (busyRequest.current === token) busyRequest.current = 0; if (mounted.current && token === generation.current) setBusy(false) }
  }
  useEffect(() => {
    if (!active || !open || pending?.status !== 'running') return
    const timer = setTimeout(() => { void lookup() }, 1000)
    return () => clearTimeout(timer)
  }, [active, open, pending, busy])
  const prepare = async (skill: LocalSkill) => {
    if (pendingRef.current || preparing || configurationDirty || configurationBusy || storageError) return
    const token = ++generation.current
    if (plan) void api.request('discardSkillScan', { id: plan.id }).catch(() => undefined)
    setPlan(undefined); setPreview(undefined); setReceipt(undefined); setError(''); setNotice(''); setPreparing(true)
    let prepared: SkillBindingPlan | undefined
    try {
      prepared = await api.request('prepareLocalSkillBinding', { localSkillId: skill.id, agentId: agent.id, expectedConfigVersion })
      const content = await api.request('getSkillPreview', { scanId: prepared.id, candidateId: prepared.candidateId })
      if (!valid(token)) { void api.request('discardSkillScan', { id: prepared.id }).catch(() => undefined); return }
      if (prepared.agentId !== agent.id || prepared.localSkillId !== skill.id || prepared.expectedConfigVersion !== expectedConfigVersion) throw new Error('预览的员工或来源身份已变化，请重新选择。')
      setPlan(prepared); setPreview(content)
    } catch (failure) { if (prepared) void api.request('discardSkillScan', { id: prepared.id }).catch(() => undefined); if (valid(token)) setError(errorText(failure)) }
    finally { if (mounted.current && token === generation.current) setPreparing(false) }
  }
  const submit = async () => {
    if (busyRequest.current || configurationDirty || configurationBusy || storageError || !current.current.active || !current.current.open) return
    const saved = pendingRef.current
    if (saved && saved.status !== 'not_accepted') return
    if (!saved && (!plan || !preview || Date.parse(plan.expiresAt) <= Date.now())) { setError('绑定预览已过期，请重新选择技能。'); return }
    const input: BindLocalSkillInput = saved?.input ?? { requestId: crypto.randomUUID(), planId: plan!.id, localSkillId: plan!.localSkillId, agentId: agent.id, expectedConfigVersion: plan!.expectedConfigVersion, contentHash: plan!.contentHash }
    if (!persist({ input, status: 'submitting' }, saved?.input.requestId)) return
    setBusy(true); setError(''); const token = ++generation.current; busyRequest.current = token
    try { await observeReceipt(input, await api.request('bindLocalSkill', input), token) }
    catch (failure) { if (valid(token, input.requestId)) { persist({ input, status: 'unknown' }, input.requestId); setError(errorText(failure)) } }
    finally { if (busyRequest.current === token) busyRequest.current = 0; if (mounted.current && token === generation.current) setBusy(false) }
  }
  const frozen = Boolean(pending)
  return <>
    <Button type="button" variant="secondary" size="sm" disabled={!pending && (configurationDirty || configurationBusy) || Boolean(storageError)} onClick={() => { setOpen(true); setError('') }}><Plus size={14} />从本机技能选择</Button>
    {configurationDirty && !pending && <p className="field-hint">请先保存员工配置，再绑定本机技能。</p>}
    {pending && <p role="status" className="field-hint">{pending.status === 'running' ? '技能绑定正在处理，重新打开可查看进度。' : pending.status === 'not_accepted' ? '原绑定尚未受理，请核对后重试或放弃。' : '有待核对的技能绑定，原请求已保留。'}</p>}
    {notice && !open && <Banner kind="notice">{notice}</Banner>}{storageError && !open && <Banner>{storageError}</Banner>}
    <Dialog open={open && active} onOpenChange={value => { if (!value) close() }}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader><DialogTitle>为 {agent.name} 绑定本机技能</DialogTitle><DialogDescription>先核对实际来源与受管副本，再明确交给这位员工。</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-3">
          {error && <Banner>{error}</Banner>}{storageError && <Banner>{storageError}</Banner>}
          {notice && <Banner kind="notice">{notice}</Banner>}
          {receipt?.cleanupError && <Banner>{receipt.cleanupError}</Banner>}
          {receipt?.synchronizationError && <Banner>绑定已经提交；工作区同步未完成：{receipt.synchronizationError}。请重启核对，勿重复提交。</Banner>}
          {pending ? <Card className="gap-0 p-4"><CardContent className="p-0"><h3>原绑定请求</h3><p className="field-hint">目标：{agent.name} · 原配置版本 {pending.input.expectedConfigVersion}</p><p className="resource-path">本机身份：{pending.input.localSkillId}<br />内容 hash：{pending.input.contentHash}</p><p role="status">{pending.status === 'running' ? '正在准备受管副本，尚未确认绑定完成。' : pending.status === 'not_accepted' ? '只读核对确认原请求尚未受理。' : pending.status === 'submitting' ? '正在提交绑定…' : '绑定结果尚未确认；只读核对原请求。'}</p></CardContent></Card> : plan && preview ? <>
            <h3>确认技能绑定</h3><Card className="gap-0 p-4"><CardContent className="p-0"><strong>{plan.localSkill.name}</strong><p className="field-hint">目标员工：{agent.name} · 配置版本 {plan.expectedConfigVersion}<br />本机目录：{plan.localSkill.sourceLabel}<br />实际来源：{skillBindingSourceLabel(plan.source)}<br />受管副本：{plan.existingResourceId ? '复用已登记且内容/来源一致的员工副本' : '提交后准备独立副本，不随本机更新自动改变'}</p><p className="resource-path">内容 hash：{plan.contentHash}</p></CardContent></Card>
            {plan.warnings.map(warning => <Banner kind="notice" key={warning}>{warning}</Banner>)}
            <Card className="skill-document-card gap-0 p-4"><CardContent className="p-0"><SkillMarkdown content={preview.content} /><h4>副本文件</h4>{preview.files.map(file => <p key={file.path} className="field-hint">{file.path} · {sizeText(file.size)}</p>)}</CardContent></Card>
          </> : preparing ? <Loading>正在准备绑定预览…</Loading> : <LocalSkillPicker api={api} onSelect={skill => { void prepare(skill) }} disabled={configurationDirty || configurationBusy || Boolean(storageError)} />}
        </div>
        <DialogFooter variant="plain"><Button type="button" variant="secondary" onClick={close}>关闭</Button>
          {pending?.status === 'not_accepted' && <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (persist(undefined, pending.input.requestId)) { generation.current++; setPlan(undefined); setPreview(undefined); setReceipt(undefined); setError('') } }}>放弃未受理请求</Button>}
          {pending && pending.status !== 'not_accepted' ? <Button type="button" disabled={busy || pending.status === 'submitting'} onClick={() => { void lookup() }}>{pending.status === 'running' ? '刷新绑定进度' : '核对绑定结果'}</Button> : plan && receipt && receipt.status !== 'completed' ? <Button type="button" disabled={busy || preparing || configurationDirty || configurationBusy} onClick={() => { void prepare(plan.localSkill) }}>重新准备绑定预览</Button> : (plan || frozen) && <Button type="button" disabled={busy || preparing || configurationDirty || configurationBusy || !frozen && !preview} onClick={() => { void submit() }}>{frozen ? '重试原绑定请求' : `确认绑定给 ${agent.name}`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

function LocalSkillPicker({ api, onSelect, disabled }: { api: DesktopApi; onSelect(skill: LocalSkill): void; disabled: boolean }) {
  const { catalog, loading, error, reload } = useLocalSkills(api, 0)
  const [query, setQuery] = useState('')
  const text = query.trim().toLocaleLowerCase()
  const skills = catalog?.skills.filter(skill => `${skill.name} ${skill.description} ${skill.sourceLabel} ${skill.slug}`.toLocaleLowerCase().includes(text)) ?? []
  return <><div className="button-row"><Input aria-label="搜索本机技能" placeholder="搜索名称、说明或来源" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} /><Button type="button" variant="ghost" size="icon-sm" aria-label="重新扫描本机技能" disabled={loading || disabled} onClick={() => { void reload(true) }}><RefreshCw size={15} /></Button></div>{error && <Banner>{error}</Banner>}{loading && !catalog && <Loading />}{skills.map(skill => <Button type="button" key={skill.id} variant="surface" size="content" className="file-row" aria-label={`选择本机技能 ${skill.name}（${skill.sourceLabel}）`} disabled={disabled} onClick={() => onSelect(skill)}><span><strong>{skill.name}</strong><small>{skill.sourceLabel} · {skill.slug}</small><em>{skill.description}</em></span></Button>)}{!loading && !skills.length && <p className="empty-note">{query ? '没有匹配的本机技能。' : '尚未发现本机技能，可先在技能页面安装。'}</p>}{catalog?.issues.map(issue => <p key={`${issue.path}:${issue.message}`} className="field-hint">{issue.message}</p>)}</>
}

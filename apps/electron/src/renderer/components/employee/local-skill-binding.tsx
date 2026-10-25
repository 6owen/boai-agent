/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: 员工草稿技能ID/资源、真实安装来源、本机技能目录与收藏、共用技能行及冻结绑定回执。
 * [OUTPUT]: 双栏按安装身份回显绑定，右侧复用群聊普通行和独立关闭按钮；已有项移除/重选更新配置草稿，不重复绑定，选择器无详情操作。
 * [OUTPUT]: 不插入成功/未决状态提示DOM；错误沿Sonner，原请求核对/重试操作独立保留。
 * [OUTPUT]: 可收缩双栏在窄屏堆叠，技能名称/说明单行省略；点击行不加载详情或提交绑定。
 * [OUTPUT]: 明确添加后按真实版本逐项冻结/提交，失败或未知即停止后续项；最小未决载荷持久化、未知只核对及隐藏停读保持。
 * [POS]: employee 本机技能绑定交互；不先显示成功，不保存正文/路径，不另行保存员工或执行工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DigitalAgent, Resource } from '@boai/shared/domain'
import type { BindLocalSkillInput, LocalSkill, SkillBindingPlan, SkillBindingReceipt, SkillInstallation } from '@boai/shared/domain/skills'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderOpen, Pin, Plus, RefreshCw, Search, X, Zap } from '@/components/icons'
import { useLocalSkills } from '@/pages/library/use-local-skills'
import { useSkillCollections } from '@/pages/library/use-skill-collections'
import { SkillListItem } from '@/pages/library/skill-list-item'
import { SKILL_BINDING_PENDING_KEY, restoreSkillBindingPending, skillBindingPendingKey, skillBindingReceiptMatches, updateSkillBindingPending, type SkillBindingPending } from './local-skill-binding-state'

function readPending() { return restoreSkillBindingPending(JSON.parse(localStorage.getItem(SKILL_BINDING_PENDING_KEY) ?? '{}')) }

export function LocalSkillBinding({ api, agent, resources, skillIds, scope, active, expectedConfigVersion, configurationBusy, onPendingChange, onBound, onChange }: {
  api: DesktopApi; agent: DigitalAgent; resources: Resource[]; skillIds: string[]; scope: string; active: boolean; expectedConfigVersion: number
  configurationBusy: boolean; onPendingChange(locked: boolean): void
  onBound(receipt: SkillBindingReceipt, input: BindLocalSkillInput): Promise<void>
  onChange(ids: string[]): void
}) {
  const key = skillBindingPendingKey(scope, agent.id)
  const [pending, setPending] = useState<SkillBindingPending | undefined>()
  const pendingRef = useRef<SkillBindingPending | undefined>(undefined), generation = useRef(0), mounted = useRef(true), busyRequest = useRef(0)
  const preparedPlan = useRef<SkillBindingPlan | undefined>(undefined), version = useRef(expectedConfigVersion)
  version.current = Math.max(version.current, expectedConfigVersion)
  const [open, setOpen] = useState(false), [adding, setAdding] = useState(false), [busy, setBusy] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState<LocalSkill[]>([])
  const [error, setError] = useState(''), [storageError, setStorageError] = useState('')
  const [installations, setInstallations] = useState<SkillInstallation[]>([]), [bindingsReady, setBindingsReady] = useState(false)
  const [knownBindings, setKnownBindings] = useState<{ localSkillId: string; resource: Resource }[]>([])
  const [receipt, setReceipt] = useState<SkillBindingReceipt>()
  useEffect(() => {
    if (!open || !active) return
    let alive = true
    setBindingsReady(false)
    void api.request('listSkillInstallations', undefined).then(value => { if (alive) { setInstallations(value); setBindingsReady(true) } }, failure => { if (alive) setError(errorText(failure)) })
    return () => { alive = false }
  }, [api, open, active])
  const boundResourceIds = new Set(skillIds)
  const boundLocalIds = new Set([...installations.filter(item => boundResourceIds.has(item.resourceId)).map(item => item.localSkillId).filter((id): id is string => Boolean(id)), ...knownBindings.filter(item => boundResourceIds.has(item.resource.id)).map(item => item.localSkillId)])
  const existingSkills = [...new Map([...resources, ...knownBindings.map(item => item.resource)].map(resource => [resource.id, resource])).values()].filter(resource => resource.kind === 'skill' && boundResourceIds.has(resource.id))
  const newSkills = selectedSkills.filter(skill => !boundLocalIds.has(skill.id))
  const current = useRef({ key, active, open, agent, configurationBusy }); current.current = { key, active, open, agent, configurationBusy }
  const persist = (next: SkillBindingPending | undefined, expectedRequestId?: string) => {
    try {
      const updated = updateSkillBindingPending(readPending(), key, next, expectedRequestId)
      if (!updated) return false
      localStorage.setItem(SKILL_BINDING_PENDING_KEY, JSON.stringify(updated))
      pendingRef.current = next; setPending(next); setStorageError(''); return true
    } catch { setStorageError('未能保存或读取添加请求，请恢复本地存储后核对。'); return false }
  }
  useEffect(() => {
    mounted.current = true
    try { const saved = readPending()[key]; pendingRef.current = saved; setPending(saved); setStorageError('') } catch { setStorageError('本地添加记录无法读取，请先恢复本地存储。') }
    return () => { mounted.current = false; generation.current++; onPendingChange(false) }
  }, [key])
  useEffect(() => { onPendingChange(Boolean(pending) || adding) }, [pending, adding, onPendingChange])
  const close = () => {
    generation.current++; busyRequest.current = 0; setOpen(false); setAdding(false); setBusy(false); setSelectedSkills([])
    if (pendingRef.current?.status === 'submitting') persist({ ...pendingRef.current, status: 'unknown' }, pendingRef.current.input.requestId)
    if (preparedPlan.current && !pendingRef.current) void api.request('discardSkillScan', { id: preparedPlan.current.id }).catch(() => undefined)
    preparedPlan.current = undefined
  }
  useEffect(() => { if (!active) close() }, [active])
  const valid = (token: number, requestId?: string) => mounted.current && token === generation.current && current.current.key === key && current.current.active && current.current.open && (!requestId || pendingRef.current?.input.requestId === requestId)
  const observeReceipt = async (input: BindLocalSkillInput, found: SkillBindingReceipt | null, token: number) => {
    if (!valid(token, input.requestId)) return
    if (!found) { if (!persist({ input, status: 'not_accepted' }, input.requestId)) throw new Error('原请求已变化，请重新打开核对。'); setReceipt(undefined); setError(''); return 'not_accepted' }
    if (!skillBindingReceiptMatches(input, found)) throw new Error('回执与原添加请求不一致，请保留原请求并核对。')
    setReceipt(found)
    if (found.status === 'running') { if (!persist({ input, status: 'running' }, input.requestId)) throw new Error('原请求已变化，请重新打开核对。'); return 'running' }
    if (found.status === 'completed') {
      if (!found.resource || !found.agent || !found.agent.skillIds.includes(found.resource.id) || found.agent.id !== agent.id) throw new Error('添加已提交但返回的配置不完整，请保留原请求核对。')
      await onBound(found, input)
      if (!valid(token, input.requestId)) return
      version.current = Math.max(version.current, found.agent.configVersion, current.current.agent.configVersion)
      if (!persist(undefined, input.requestId)) throw new Error('添加已提交，本地核对记录未清除；下次请只读核对。')
      setKnownBindings(items => [...items.filter(item => item.localSkillId !== input.localSkillId), { localSkillId: input.localSkillId, resource: found.resource! }])
      setSelectedSkills(items => items.filter(skill => skill.id !== input.localSkillId))
      return 'completed'
    }
    if (!persist(undefined, input.requestId)) throw new Error('终态已确认，本地核对记录未清除；请保留原请求。')
    setError(found.error ?? (found.status === 'interrupted' ? '添加被中断，未自动重试。' : '添加失败，员工配置未更新。'))
    return 'failed'
  }
  const submitInput = async (input: BindLocalSkillInput, token: number) => {
    if (!valid(token) || !persist({ input, status: 'submitting' }, pendingRef.current?.input.requestId)) return
    preparedPlan.current = undefined
    try { return await observeReceipt(input, await api.request('bindLocalSkill', input), token) }
    catch (failure) { if (valid(token, input.requestId)) { persist({ input, status: 'unknown' }, input.requestId); setError(errorText(failure)) } }
  }
  const lookup = async () => {
    const saved = pendingRef.current
    if (!saved || busyRequest.current || !current.current.active || !current.current.open) return
    setBusy(true); setError('')
    const token = ++generation.current; busyRequest.current = token
    try { await observeReceipt(saved.input, await api.request('getSkillBindingReceipt', { requestId: saved.input.requestId }), token) }
    catch (failure) { if (valid(token, saved.input.requestId)) { persist({ ...saved, status: 'unknown' }, saved.input.requestId); setError(errorText(failure)) } }
    finally { if (busyRequest.current === token) busyRequest.current = 0; if (mounted.current && token === generation.current) setBusy(false) }
  }
  useEffect(() => {
    if (!active || !open || pending?.status !== 'running') return
    const timer = setTimeout(() => { void lookup() }, 1000)
    return () => clearTimeout(timer)
  }, [active, open, pending, busy])
  const addSelected = async () => {
    if (!newSkills.length || !bindingsReady || pendingRef.current || busyRequest.current || configurationBusy || storageError || !current.current.active || !current.current.open) return
    const chosen = [...newSkills], token = ++generation.current; busyRequest.current = token
    setAdding(true); setError(''); setReceipt(undefined)
    try {
      for (const skill of chosen) {
        if (!valid(token) || current.current.configurationBusy) return
        const expected = Math.max(version.current, current.current.agent.configVersion)
        const plan = await api.request('prepareLocalSkillBinding', { localSkillId: skill.id, agentId: agent.id, expectedConfigVersion: expected })
        if (!valid(token)) { void api.request('discardSkillScan', { id: plan.id }).catch(() => undefined); return }
        preparedPlan.current = plan
        if (plan.agentId !== agent.id || plan.localSkillId !== skill.id || plan.localSkill.id !== skill.id || plan.expectedConfigVersion !== expected || Date.parse(plan.expiresAt) <= Date.now()) throw new Error('技能来源或员工配置已变化，请重新选择。')
        const input: BindLocalSkillInput = { requestId: crypto.randomUUID(), planId: plan.id, localSkillId: skill.id, agentId: agent.id, expectedConfigVersion: expected, contentHash: plan.contentHash }
        if (await submitInput(input, token) !== 'completed') return
      }
      if (valid(token)) close()
    } catch (failure) { if (valid(token)) setError(errorText(failure)) }
    finally {
      if (preparedPlan.current && !pendingRef.current) { void api.request('discardSkillScan', { id: preparedPlan.current.id }).catch(() => undefined); preparedPlan.current = undefined }
      if (busyRequest.current === token) busyRequest.current = 0
      if (mounted.current && token === generation.current) setAdding(false)
    }
  }
  const retry = async () => {
    const saved = pendingRef.current
    if (!saved || saved.status !== 'not_accepted' || busyRequest.current || configurationBusy || storageError) return
    const token = ++generation.current; busyRequest.current = token; setBusy(true); setError('')
    try { await submitInput(saved.input, token) }
    finally { if (busyRequest.current === token) busyRequest.current = 0; if (mounted.current && token === generation.current) setBusy(false) }
  }
  const locked = adding || busy || Boolean(pending) || configurationBusy || Boolean(storageError) || !bindingsReady
  const toggle = (skill: LocalSkill) => {
    if (locked || boundLocalIds.has(skill.id)) return
    const reusableIds = new Set([...agent.skillIds, ...skillIds, ...knownBindings.map(item => item.resource.id)])
    const resourceId = installations.find(item => item.localSkillId === skill.id && reusableIds.has(item.resourceId))?.resourceId ?? knownBindings.find(item => item.localSkillId === skill.id)?.resource.id
    if (resourceId) { onChange([...skillIds, resourceId]); return }
    setSelectedSkills(items => items.some(item => item.id === skill.id) ? items.filter(item => item.id !== skill.id) : [...items, skill])
  }
  return <>
    <Button type="button" variant="secondary" size="sm" disabled={!pending && configurationBusy || Boolean(storageError)} onClick={() => { setBindingsReady(false); setOpen(true); setError('') }}><Plus size={14} />从本机技能选择</Button>
    {storageError && !open && <Banner>{storageError}</Banner>}
    <Dialog open={open && active} onOpenChange={value => { if (!value) close() }}>
      <DialogContent showCloseButton={false} className="min-w-0 grid-cols-1 max-h-[calc(100dvh-32px)] overflow-y-auto p-5 sm:max-w-[780px]">
        {error && <Banner>{error}</Banner>}{storageError && <Banner>{storageError}</Banner>}
        {receipt?.cleanupError && <Banner>{receipt.cleanupError}</Banner>}
        {receipt?.synchronizationError && <Banner>添加已提交；工作区同步未完成：{receipt.synchronizationError}。请核对，勿重复添加。</Banner>}
        <div className="grid min-h-0 min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
          <LocalSkillPicker api={api} selectedIds={new Set([...boundLocalIds, ...newSkills.map(skill => skill.id)])} boundIds={boundLocalIds} onSelect={toggle} disabled={locked} />
          <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-label="已选技能">
            <DialogHeader><div className="flex flex-wrap items-center justify-between gap-2"><DialogTitle className="text-[length:var(--text-ui-body)] font-normal text-muted-foreground">选择技能</DialogTitle><span className="text-[length:var(--text-ui-secondary)] text-muted-foreground">已选择 {existingSkills.length + newSkills.length} 个技能</span></div></DialogHeader>
            <ScrollArea className="h-[160px] min-h-0 w-full min-w-0 sm:h-0 sm:flex-1" contentProps={{ className: 'flex flex-col' }}>
              {existingSkills.map(skill => <SelectedSkillRow key={skill.id} name={skill.name} description={skill.description} bound disabled={locked} onRemove={() => onChange(skillIds.filter(id => id !== skill.id))} />)}
              {newSkills.map(skill => <SelectedSkillRow key={skill.id} name={skill.name} description={skill.description} source={skill.pluginName ?? (skill.source === 'global' ? '' : skill.sourceLabel)} disabled={locked} onRemove={() => toggle(skill)} />)}
              {!existingSkills.length && !newSkills.length && <div className="creation-selection-empty flex-1"><Zap /><span>选择要添加的技能</span></div>}
            </ScrollArea>
            <DialogFooter variant="plain">
              <Button type="button" variant="ghost" onClick={close}>取消</Button>
              {pending?.status === 'not_accepted' && <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (persist(undefined, pending.input.requestId)) { generation.current++; setReceipt(undefined); setError('') } }}>放弃未受理请求</Button>}
              {pending ? <Button type="button" disabled={busy || adding || pending.status === 'submitting'} onClick={() => { void (pending.status === 'not_accepted' ? retry() : lookup()) }}>{pending.status === 'not_accepted' ? '重试添加' : pending.status === 'running' ? '刷新进度' : '核对添加结果'}</Button> : <Button type="button" disabled={locked || !newSkills.length} onClick={() => { void addSelected() }}>{adding ? '添加中…' : '添加'}</Button>}
            </DialogFooter>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </>
}

function SelectedSkillRow({ name, description, source, bound, disabled, onRemove }: {
  name: string; description: string; source?: string; bound?: boolean; disabled: boolean; onRemove(): void
}) {
  return <div className="creation-member shrink-0" aria-label={bound ? `已绑定技能 ${name}` : undefined}>
    <span className="skill-list-icon"><Zap /></span>
    <span className="conversation-copy min-w-0 flex-1 overflow-hidden">
      <strong className="conversation-title block truncate" title={name}>{name}</strong>
      <small className="conversation-preview block truncate">{source && <span className="skill-source-badge">{source}</span>}{description || '查看技能说明'}</small>
    </span>
    <Button type="button" variant="ghost" size="icon-sm" round disabled={disabled} aria-label={`移除技能 ${name}`} onClick={onRemove}><X /></Button>
  </div>
}

function LocalSkillPicker({ api, selectedIds, boundIds, onSelect, disabled }: {
  api: DesktopApi; selectedIds: ReadonlySet<string>; boundIds: ReadonlySet<string>; onSelect(skill: LocalSkill): void; disabled: boolean
}) {
  const { catalog, loading, error, reload } = useLocalSkills(api, 0)
  const collection = useSkillCollections(api)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'local' | 'favorites' | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const text = query.trim().toLocaleLowerCase()
  const favorites = new Map(collection.value?.favoriteResourceIds.map((id, index) => [id, index]))
  const skills = (catalog?.skills ?? []).filter(skill => (filter !== 'favorites' || favorites.has(skill.id)) && `${skill.name} ${skill.description} ${skill.slug} ${skill.pluginName ?? skill.sourceLabel}`.toLocaleLowerCase().includes(text))
    .sort((a, b) => filter === 'favorites' ? favorites.get(a.id)! - favorites.get(b.id)! : a.name.localeCompare(b.name))
  const filtering = loading && !catalog || filter === 'favorites' && !collection.value && !collection.error
  const filters = [{ value: 'local', label: '本地', icon: FolderOpen }, { value: 'favorites', label: '收藏', icon: Pin }] as const
  const selected = filters.find(item => item.value === filter)
  const clearFilter = () => { setFilter(null); input.current?.focus() }
  return <div className="flex min-h-0 min-w-0 max-w-full flex-col gap-2">
    <InputGroup aria-label="技能搜索">
      <InputGroupAddon>{selected ? <Badge variant="secondary" className="h-6 gap-1 rounded-md px-2 text-[length:var(--text-ui-secondary)] font-normal"><selected.icon />{selected.label}<Button type="button" variant="ghost" size="icon-xs" className="size-4" aria-label="清除技能来源筛选" disabled={disabled} onClick={clearFilter}><X /></Button></Badge> : <Search />}</InputGroupAddon>
      <InputGroupInput ref={input} aria-label="搜索本机技能" placeholder="搜索技能" maxLength={200} disabled={disabled} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Backspace' && !query && filter) { event.preventDefault(); clearFilter() } }} />
      <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="重新扫描本机技能" disabled={loading || disabled} onClick={() => { void reload(true); void collection.reload() }}><RefreshCw /></InputGroupButton></InputGroupAddon>
    </InputGroup>
    <div className="flex gap-1" role="group" aria-label="技能来源筛选">{filters.map(item => <Button type="button" key={item.value} variant="ghost" size="sm" className="h-7 px-2 text-[length:var(--text-ui-secondary)] font-normal text-primary" aria-label={`筛选${item.label}技能`} aria-pressed={filter === item.value} disabled={disabled} onClick={() => { setFilter(item.value); input.current?.focus() }}>{item.label}</Button>)}</div>
    {error && <Banner>{error}</Banner>}{collection.error && <Banner>{collection.error}</Banner>}
    <ScrollArea className="h-[200px] w-full min-w-0 sm:h-[340px]" viewportProps={{ className: 'scroll-fade-t scroll-fade-6' }}>
      <div className="conversation-list skills-browser-list m-0 p-0" role="navigation" aria-label="可选择的技能">
        {filtering ? <Loading>正在读取技能…</Loading> : skills.map(skill => <div className="skill-list-row flex items-center gap-1" key={skill.id}>
          <Checkbox className="ml-2" aria-label={`选择技能 ${skill.name}`} checked={selectedIds.has(skill.id)} disabled={disabled || boundIds.has(skill.id)} onCheckedChange={() => onSelect(skill)} />
          <SkillListItem className="w-0 flex-1" entry={{ name: skill.name, description: skill.description, source: skill.pluginName ?? (skill.source === 'global' ? '' : skill.sourceLabel) }} selected={selectedIds.has(skill.id)} aria-label={`选择本机技能 ${skill.name}（${skill.sourceLabel}）`} disabled={disabled || boundIds.has(skill.id)} onClick={() => onSelect(skill)} />
        </div>)}
        {!filtering && !skills.length && <p className="field-hint px-2 py-4">{query ? '没有匹配的技能' : filter === 'favorites' ? '还没有收藏的技能' : '尚未发现本机技能'}</p>}
      </div>
    </ScrollArea>
    {catalog?.issues.map(issue => <Banner key={`${issue.path}:${issue.message}`}>{issue.message}</Banner>)}
  </div>
}

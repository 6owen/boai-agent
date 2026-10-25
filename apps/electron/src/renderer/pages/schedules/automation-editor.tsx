/*
 * [OUTPUT]: 全局编辑允许更换单员工任务的执行员工，归属与名单同次保存，沿原版本核验更新授权。
 * [OUTPUT]: Dialog复用同一表单并由外层提供标题；保存忙态同步弹窗，关闭/取消沿当前局部草稿守卫。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 固定计划/创建身份、员工快照、日程预览与持久保存回执。
 * [OUTPUT]: 独立指令框与频率同行员工选择；定时任务资格不依赖命令权限，原模型/本机配置核验与未知回执保持。
 * [POS]: 定时任务共用编辑表单，Dialog与旧详情入口共用EditorFrame/草稿守卫和唯一自动化服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { AutomationDefinition, AutomationInput, AutomationOwner, LaunchProfile, Snapshot } from '@boai/shared/domain'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import { backendProtocol, isNativeBackend } from '@boai/shared/domain/backends'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, EditorFrame, errorText, Field, GuardContext, Loading, useDirty, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Textarea } from '@/components/ui/textarea'
import { MonitorEditor, newMonitorPolicy, validMonitorPolicy } from './monitor-editor'
import { automationOwnerKey, automationOwnerLabel } from './automation-owner'

export type AutomationEditorMode = 'manual' | 'assistant' | 'monitor'
type Form = Omit<AutomationInput, 'id' | 'expectedRevision' | 'requestId'> & Required<Pick<AutomationInput, 'taskKind' | 'conversationPolicy' | 'notificationPolicy'>>
type Props = { api: DesktopApi; snapshot: Snapshot; id?: string; owner?: AutomationOwner; mode?: AutomationEditorMode; hideTitle?: boolean; onBusyChange?(busy: boolean): void; onClose(): void; onSaved(value: AutomationDefinition, created: boolean): void }
const pendingPrefix = 'boai:automation:pending-creation'
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
// Older plans may store a lower bound separately from their monthly day. Display
// the first matching date without rewriting either saved field on a name edit.
function monthlyDate(form: Form) {
  const start = form.startsOn ?? dateValue(new Date()), day = form.dayOfMonth ?? Number(start.slice(8))
  let date = new Date(`${start}T12:00:00`)
  for (let month = 0; month < 12; month++) {
    const candidate = new Date(date.getFullYear(), date.getMonth(), day, 12)
    if (candidate.getMonth() === date.getMonth() && dateValue(candidate) >= start) return dateValue(candidate)
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1, 12)
  }
  return start
}
function pendingCreation(pendingKey: string): { requestId: string; form: Form } | undefined {
  try { const value = JSON.parse(localStorage.getItem(pendingKey) ?? 'null'); return value?.requestId && value.form ? value : undefined } catch { return undefined }
}
export function AutomationEditorTab(props: Props) {
  const [loaded, setLoaded] = useState<{ definition?: AutomationDefinition; error?: string } | null>(props.id ? null : {})
  useEffect(() => {
    if (!props.id) return
    let live = true
    void props.api.request('getAutomation', { id: props.id! }).then(definition => {
      if (!live) return
      setLoaded(definition ? { definition } : { error: '此计划已删除或不可用，当前标签不会切换到其他计划。' })
    }).catch(error => { if (live) setLoaded({ error: errorText(error) }) })
    return () => { live = false }
  }, [props.id, props.api])
  if (!loaded) return <Loading>正在读取计划…</Loading>
  if (loaded.error) return <div className="detail-section"><Banner>{loaded.error}</Banner><Button variant="secondary" onClick={props.onClose}>关闭</Button></div>
  return <AutomationEditor {...props} definition={loaded.definition} />
}
function AutomationEditor({ api, snapshot, definition, owner, mode = 'manual', hideTitle, onBusyChange, onClose, onSaved }: Props & { definition?: AutomationDefinition }) {
  const pendingKey = pendingPrefix + (owner ? ':' + automationOwnerKey(owner) : '')
  const [pending] = useState(() => definition ? undefined : pendingCreation(pendingKey))
  const [draftId] = useState(() => pending?.requestId ?? crypto.randomUUID())
  const submitting = useRef(false)
  const formId = useId(), version = useRef(definition?.revision), title = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<Form>(() => pending?.form ?? ({ name: definition?.name ?? '', description: definition?.description ?? '', startsOn: definition?.startsOn, dayOfMonth: definition?.dayOfMonth ?? Number(definition?.startsOn?.slice(8) ?? 1), prompt: definition?.prompt ?? '',
    owner: definition?.owner ?? owner, collaboration: definition?.collaboration,
    taskKind: definition?.taskKind ?? (mode === 'monitor' ? 'monitor' : 'report'), monitor: definition?.monitor ?? (mode === 'monitor' ? newMonitorPolicy() : undefined),
    conversationPolicy: definition?.conversationPolicy ?? (mode === 'monitor' ? 'existing-conversation' : 'new-conversation'), conversationId: definition?.conversationId, employeeIds: definition?.employeeIds ?? (owner?.kind === 'employee' ? [owner.employeeId] : undefined),
    frequency: definition?.frequency ?? 'daily', time: definition?.time ?? '09:00', weekday: definition?.weekday ?? 1,
    daysOfWeek: definition?.frequency === 'weekly' ? definition.daysOfWeek ?? [definition.weekday] : [0, 1, 2, 3, 4, 5, 6],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: definition?.enabled ?? true, notify: definition?.notify ?? true, notificationPolicy: definition?.notificationPolicy ?? (definition ? definition.notify ? 'all_results' : 'muted' : 'important_only') }))
  const [monitorOpen, setMonitorOpen] = useState(mode === 'monitor')
  const [unknown, setUnknown] = useState(!!pending)
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [profileError, setProfileError] = useState('')
  const nativeBindings = snapshot.agents.filter(a => isNativeBackend(a.executionBackend)).map(a => `${a.id}:${a.configVersion}:${isNativeBackend(a.executionBackend) ? a.executionBackend.profileId : ''}`).join(',')
  useEffect(() => {
    let live = true
    setProfiles([]); setProfileError('')
    if (nativeBindings) void api.request('listLaunchProfiles', undefined)
      .then(value => { if (live) setProfiles(value) })
      .catch(error => { if (live) setProfileError(errorText(error)) })
    return () => { live = false }
  }, [api, nativeBindings])
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext), clean = useDirty(form)
  useLayoutEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  const rule = form.frequency === 'weekly' && JSON.stringify(form.daysOfWeek) === '[1,2,3,4,5]' ? 'workdays' : form.frequency
  const [preview, setPreview] = useState<{ nextTimes: string[]; timezone?: string; error?: string; pending: boolean }>({ nextTimes: [], pending: true })
  const change = (patch: Partial<Form>) => { setForm(current => ({ ...current, ...patch })) }
  const daysKey = JSON.stringify(form.daysOfWeek)
  useEffect(() => { title.current?.focus() }, [])
  useEffect(() => {
    let live = true
    setPreview({ nextTimes: [], pending: true })
    const timer = setTimeout(() => {
      void api.request('previewAutomation', { frequency: form.frequency, time: form.time, weekday: form.weekday, daysOfWeek: form.daysOfWeek, timezone: form.timezone, startsOn: form.startsOn, dayOfMonth: form.dayOfMonth })
        .then(value => { if (live) setPreview({ ...value, timezone: form.timezone, pending: false }) })
        .catch(error => { if (live) setPreview({ nextTimes: [], error: errorText(error), pending: false }) })
    }, 150)
    return () => { live = false; clearTimeout(timer) }
  }, [api, form.frequency, form.time, form.weekday, daysKey, form.timezone, form.startsOn, form.dayOfMonth])
  const eligible = (id: string) => {
    const a = snapshot.agents.find(a => a.id === id), c = snapshot.connections.find(c => c.id === a?.connectionId)
    if (!a?.active || a.executionBackend?.kind === 'acp-local') return false
    if (isNativeBackend(a.executionBackend)) {
      const { profileId, kind } = a.executionBackend
      return profiles.some(profile => profile.id === profileId && profile.protocol === backendProtocol(kind) && profile.verified
        && (kind !== 'claude-local' || profile.useExistingLogin || !!(c?.hasApiKey && (a.modelId || c.defaultModel))))
    }
    return !!(c && (a.modelId || c.defaultModel))
  }
  const conversation = snapshot.conversations.find(c => c.id === form.conversationId)
  const memberIds = form.conversationPolicy === 'new-conversation' ? form.employeeIds ?? [] : conversation?.agentIds ?? []
  const validTarget = memberIds.length > 0 && memberIds.every(eligible) && (!form.collaboration || form.collaboration.assignments.length >= 2 && form.collaboration.assignments.every(a => a.instruction.trim() && a.deliverable.trim()))
  const valid = !!form.name.trim() && !!form.prompt.trim() && validTarget && (form.taskKind !== 'monitor' || validMonitorPolicy(form.monitor)) && (form.frequency === 'manual' || preview.nextTimes.length > 0) && !preview.error && preview.timezone === form.timezone && !preview.pending
  const finish = (value: AutomationDefinition) => { if (!definition) localStorage.removeItem(pendingKey); setUnknown(false); version.current = value.revision; clean(); onSaved(value, !definition); guard.saved() }
  const queryReceipt = async () => { const receipt = await api.request('getAutomationCreation', { requestId: draftId }); if (receipt) finish(receipt); else { setUnknown(false); localStorage.removeItem(pendingKey) } }
  const targetLabel = form.owner ? `${automationOwnerLabel(form.owner, snapshot)} · ${form.conversationPolicy === 'new-conversation' ? '独立任务聊天' : '原聊天'}` : form.conversationPolicy === 'new-conversation' ? `新任务聊天 · ${snapshot.agents.find(a => a.id === form.employeeIds?.[0])?.name ?? '选择员工'}` : conversation?.title ?? (form.conversationId ? '聊天已不可用' : '指定聊天')
  const multipleWeekdays = rule === 'weekly' && (form.daysOfWeek?.length ?? 0) > 1
  const singleEmployeeTarget = form.conversationPolicy === 'new-conversation' && !form.collaboration && form.taskKind !== 'monitor'
  return <EditorFrame title={hideTitle ? undefined : definition ? '编辑定时任务' : '新建定时任务'} footer={<>
    <Button variant="secondary" disabled={busy} onClick={() => guard.navigate(onClose)}>{definition ? '关闭' : '取消'}</Button>
    <Button type="submit" form={formId} disabled={busy || !valid || unknown}>{busy ? '正在保存…' : definition ? '保存修改' : '创建'}</Button>
  </>}>
    <form data-edit-form id={formId} className="form-grid automation-editor" onSubmit={event => { event.preventDefault(); if (!valid || unknown || submitting.current) return; submitting.current = true; void run(async () => {
      if (!definition) localStorage.setItem(pendingKey, JSON.stringify({ requestId: draftId, form }))
      try { finish(await api.request('saveAutomation', { ...form, id: definition?.id, expectedRevision: version.current, ...(!definition ? { requestId: draftId } : {}) })) }
      catch (error) { if (!definition) { setUnknown(true); try { const receipt = await api.request('getAutomationCreation', { requestId: draftId }); if (receipt) { finish(receipt); return } setUnknown(false); localStorage.removeItem(pendingKey) } catch { /* Keep the original request for explicit receipt lookup. */ } } throw error }
    }).finally(() => { submitting.current = false }) }}>
      {error && <Banner>{error}</Banner>}
      {unknown && <Button variant="secondary" disabled={busy} title="提交结果尚未确认，草稿已保留。" onClick={() => void run(queryReceipt)}>核对创建结果</Button>}
      <fieldset disabled={busy || unknown} className="automation-fields">
        <Field label="名称" full><Input ref={title} required maxLength={100} value={form.name} onChange={e => change({ name: e.target.value })} placeholder="例如：每日简报" /></Field>
        <Field label="描述" full><Input maxLength={1000} value={form.description ?? ''} onChange={e => change({ description: e.target.value })} placeholder="用一句话介绍这个任务" /></Field>
        <Field label="任务指令" full><Textarea required maxLength={40000} rows={7} value={form.prompt} onChange={e => change({ prompt: e.target.value })} placeholder="告诉员工每次执行时要做什么，以及希望收到什么结果。" /></Field>
        {form.taskKind === 'monitor' && <section aria-label="监控规则"><Button variant="secondary" onClick={() => setMonitorOpen(!monitorOpen)}>{monitorOpen ? '收起监控规则' : '编辑监控规则'}</Button>{monitorOpen && form.monitor && <MonitorEditor policy={form.monitor} onChange={monitor => change({ monitor })} />}</section>}
        <div className="schedule-options-row">
          <div className="schedule-frequency-row" role="group" aria-label="执行频率">
            <span className="schedule-frequency-title">频率</span>
            <div className="schedule-frequency-controls">
              <SelectField className="schedule-frequency-select h-(--control-height)" aria-label="频率" value={rule} onValueChange={value => {
                const startsOn = value === 'monthly' ? form.startsOn ?? dateValue(new Date()) : undefined
                change({ frequency: value === 'workdays' ? 'weekly' : value as Form['frequency'], startsOn,
                  ...(value === 'monthly' ? { dayOfMonth: Number(startsOn!.slice(8)) } : {}),
                  time: value === 'hourly' ? '00:00' : form.frequency === 'hourly' ? '09:00' : form.time,
                  daysOfWeek: value === 'weekly' ? [form.weekday] : value === 'workdays' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6] })
              }} options={[{ value: 'manual', label: '手动' }, { value: 'hourly', label: '每小时' }, { value: 'daily', label: '每天' }, { value: 'workdays', label: '工作日' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]} />
              {form.frequency === 'monthly' && <><span className="schedule-starts-on">开始于</span><Input className="schedule-date" type="date" aria-label="开始日期" required value={monthlyDate(form)} onChange={e => change({ startsOn: e.target.value || undefined, dayOfMonth: e.target.value ? Number(e.target.value.slice(8)) : undefined })} /></>}
              {!['manual', 'hourly'].includes(form.frequency) && <Input className="schedule-time" type="time" aria-label="执行时间" required value={form.time} onChange={e => change({ time: e.target.value })} />}
              {rule === 'weekly' && <SelectField className="schedule-weekday h-(--control-height)" aria-label="星期" value={multipleWeekdays ? form.daysOfWeek!.join(',') : String(form.weekday)} onValueChange={value => { if (!value.includes(',')) change({ weekday: Number(value), daysOfWeek: [Number(value)] }) }} options={[...(multipleWeekdays ? [{ value: form.daysOfWeek!.join(','), label: form.daysOfWeek!.map(day => `周${['日','一','二','三','四','五','六'][day]}`).join('、') }] : []), ...[0,1,2,3,4,5,6].map(day => ({ value: String(day), label: `星期${['日','一','二','三','四','五','六'][day]}` }))]} />}
            </div>
          </div>
          {singleEmployeeTarget && <div className="schedule-employee-control">
            <span>执行员工</span>
            <SelectField className="schedule-employee-select h-(--control-height)" aria-label="执行员工" value={form.employeeIds?.[0] ?? ''} disabled={!!owner} onValueChange={value => change({ owner: value ? { kind: 'employee', employeeId: value } : undefined, employeeIds: value ? [value] : undefined })} placeholder="从通讯录选择员工" options={snapshot.agents.filter(a => !isCoreAgent(a)).map(a => ({ value: a.id, label: a.name, disabled: !eligible(a.id) }))} />
          </div>}
        </div>
        {preview.error && <Banner>{preview.error}</Banner>}
        {profileError && <Banner>本机连接读取失败：{profileError}</Banner>}
        {!singleEmployeeTarget && <div className="automation-setting"><span>运行于</span><span>{targetLabel}</span></div>}
      </fieldset>
    </form>
  </EditorFrame>
}

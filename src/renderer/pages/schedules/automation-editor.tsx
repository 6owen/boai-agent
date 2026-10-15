/*
 * [OUTPUT]: 员工/群归属与固定分工共用原保存入口，草稿回执按归属隔离；编辑保留计划归属、依赖和旧运行位置。
 * [OUTPUT]: 执行对象统一称模型API或本机Agent员工，现有能力/来源与命令门禁保持。
 * [OUTPUT]: Claude自动化沿原七项表单选择已核对程序及明确API来源，命令关闭与宿主最终指纹复核保持。
 * [OUTPUT]: 七项表单支持已验证本机Codex员工，无需API连接；命令权限仍关闭，最终准入由宿主核验。
 * [INPUT]: 固定计划/草稿身份、快照、日程预览/创建回执 IPC 与现有详情标签守卫。
 * [OUTPUT]: 七项精简表单、上下文执行对象/时间/监控编辑、明确 Agent 回填版本与持久创建重试身份；编辑保留旧偏好和暂停状态。
 * [POS]: 定时任务右侧常驻标签；复用 DetailTabSession/EditorFrame，保存仍走唯一自动化服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { AutomationDefinition, AutomationInput, AutomationOwner, LaunchProfile, Snapshot } from '@shared/domain'
import { backendProtocol, isNativeBackend } from '@shared/domain/backends'
import type { DesktopApi } from '@shared/ipc'
import { Banner, EditorFrame, errorText, Field, GuardContext, Loading, useDirty, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MonitorEditor, newMonitorPolicy, validMonitorPolicy } from './monitor-editor'
import { AutomationOwnerFields, automationOwnerKey, automationOwnerLabel } from './automation-owner'

export type AutomationEditorMode = 'manual' | 'assistant' | 'monitor'
type Form = Omit<AutomationInput, 'id' | 'expectedRevision' | 'requestId'> & Required<Pick<AutomationInput, 'taskKind' | 'conversationPolicy' | 'notificationPolicy'>>
type Props = { api: DesktopApi; snapshot: Snapshot; id?: string; owner?: AutomationOwner; mode?: AutomationEditorMode; onClose(): void; onSaved(value: AutomationDefinition, created: boolean): void }
const pendingPrefix = 'boai:automation:pending-creation'
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
function Setting({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return <div className="automation-setting" data-schedule-field={label}><span>{label}</span>{children ? <Popover><PopoverTrigger render={<Button variant="ghost" size="sm" aria-label={label} />}>{value}</PopoverTrigger><PopoverContent className="automation-setting-popover" align="end"><strong>{label}</strong>{children}</PopoverContent></Popover> : <span>{value}</span>}</div>
}
function AutomationEditor({ api, snapshot, definition, owner, mode = 'manual', onClose, onSaved }: Props & { definition?: AutomationDefinition }) {
  const pendingKey = pendingPrefix + (owner ? ':' + automationOwnerKey(owner) : '')
  const [pending] = useState(() => definition ? undefined : pendingCreation(pendingKey))
  const [draftId] = useState(() => pending?.requestId ?? crypto.randomUUID())
  const draftVersion = useRef(0), alive = useRef(true), submitting = useRef(false)
  const formId = useId(), version = useRef(definition?.revision), title = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<Form>(() => pending?.form ?? ({ name: definition?.name ?? '', prompt: definition?.prompt ?? '',
    owner: definition?.owner ?? owner, collaboration: definition?.collaboration,
    taskKind: definition?.taskKind ?? (mode === 'monitor' ? 'monitor' : 'report'), monitor: definition?.monitor ?? (mode === 'monitor' ? newMonitorPolicy() : undefined),
    conversationPolicy: definition?.conversationPolicy ?? (mode === 'monitor' ? 'existing-conversation' : 'new-conversation'), conversationId: definition?.conversationId, employeeIds: definition?.employeeIds ?? (owner?.kind === 'employee' ? [owner.employeeId] : undefined),
    frequency: definition?.frequency ?? 'daily', time: definition?.time ?? '09:00', weekday: definition?.weekday ?? 1,
    daysOfWeek: definition?.frequency === 'weekly' ? definition.daysOfWeek ?? [definition.weekday] : [0, 1, 2, 3, 4, 5, 6],
    timezone: definition?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: definition?.enabled ?? true, notify: definition?.notify ?? true, notificationPolicy: definition?.notificationPolicy ?? (definition ? definition.notify ? 'all_results' : 'muted' : 'important_only') }))
  const [monitorOpen, setMonitorOpen] = useState(mode === 'monitor')
  const [unknown, setUnknown] = useState(!!pending), [targetQuery, setTargetQuery] = useState('')
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
  const rule = form.frequency === 'daily' ? 'daily' : JSON.stringify(form.daysOfWeek) === '[1,2,3,4,5]' ? 'workdays' : 'weekly'
  const [preview, setPreview] = useState<{ nextTimes: string[]; timezone?: string; error?: string; pending: boolean }>({ nextTimes: [], pending: true })
  const change = (patch: Partial<Form>) => { draftVersion.current++; setForm(current => ({ ...current, ...patch })) }
  const daysKey = JSON.stringify(form.daysOfWeek)
  useEffect(() => { alive.current = true; title.current?.focus(); return () => { alive.current = false; draftVersion.current++ } }, [])
  useEffect(() => {
    let live = true
    setPreview({ nextTimes: [], pending: true })
    const timer = setTimeout(() => {
      void api.request('previewAutomation', { frequency: form.frequency, time: form.time, weekday: form.weekday, daysOfWeek: form.daysOfWeek, timezone: form.timezone })
        .then(value => { if (live) setPreview({ ...value, timezone: form.timezone, pending: false }) })
        .catch(error => { if (live) setPreview({ nextTimes: [], error: errorText(error), pending: false }) })
    }, 150)
    return () => { live = false; clearTimeout(timer) }
  }, [api, form.frequency, form.time, form.weekday, daysKey, form.timezone])
  const eligible = (id: string) => {
    const a = snapshot.agents.find(a => a.id === id), c = snapshot.connections.find(c => c.id === a?.connectionId)
    if (!a?.active || a.executionBackend?.kind === 'acp-local') return false
    if (isNativeBackend(a.executionBackend)) {
      const { profileId, kind } = a.executionBackend
      return profiles.some(profile => profile.id === profileId && profile.protocol === backendProtocol(kind) && profile.verified
        && (kind !== 'claude-local' || profile.useExistingLogin || !!(c?.hasApiKey && (a.modelId || c.defaultModel))))
    }
    return !a.allowCommands && !!(c && (a.modelId || c.defaultModel))
  }
  const conversation = snapshot.conversations.find(c => c.id === form.conversationId)
  const memberIds = form.conversationPolicy === 'new-conversation' ? form.employeeIds ?? [] : conversation?.agentIds ?? []
  const validTarget = memberIds.length > 0 && memberIds.every(eligible) && (!form.collaboration || form.collaboration.assignments.length >= 2 && form.collaboration.assignments.every(a => a.instruction.trim() && a.deliverable.trim()))
  const valid = !!form.name.trim() && !!form.prompt.trim() && validTarget && (form.taskKind !== 'monitor' || validMonitorPolicy(form.monitor)) && preview.nextTimes.length > 0 && preview.timezone === form.timezone && !preview.pending
  const finish = (value: AutomationDefinition) => { if (!definition) localStorage.removeItem(pendingKey); setUnknown(false); version.current = value.revision; clean(); onSaved(value, !definition); guard.saved() }
  const queryReceipt = async () => { const receipt = await api.request('getAutomationCreation', { requestId: draftId }); if (receipt) finish(receipt); else { setUnknown(false); localStorage.removeItem(pendingKey) } }
  const targetLabel = form.owner ? `${automationOwnerLabel(form.owner, snapshot)} · ${form.conversationPolicy === 'new-conversation' ? '独立任务聊天' : '原聊天'}` : form.conversationPolicy === 'new-conversation' ? `新任务聊天 · ${snapshot.agents.find(a => a.id === form.employeeIds?.[0])?.name ?? '选择员工'}` : conversation?.title ?? (form.conversationId ? '聊天已不可用' : '指定聊天')
  const formatTime = (time: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: preview.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time))
  return <EditorFrame title={definition ? '编辑定时任务' : '新建定时任务'} footer={<>
    <Button variant="secondary" disabled={busy} onClick={() => guard.navigate(onClose)}>{definition ? '关闭' : '取消'}</Button>
    <Button type="submit" form={formId} disabled={busy || !valid || unknown}>{busy ? '正在保存…' : definition ? '保存修改' : '创建'}</Button>
  </>}>
    <form data-edit-form id={formId} className="form-grid automation-editor" onSubmit={event => { event.preventDefault(); if (!valid || unknown || submitting.current) return; submitting.current = true; draftVersion.current++; void run(async () => {
      if (!definition) localStorage.setItem(pendingKey, JSON.stringify({ requestId: draftId, form }))
      try { finish(await api.request('saveAutomation', { ...form, id: definition?.id, expectedRevision: version.current, ...(!definition ? { requestId: draftId } : {}) })) }
      catch (error) { if (!definition) { setUnknown(true); try { const receipt = await api.request('getAutomationCreation', { requestId: draftId }); if (receipt) { finish(receipt); return } setUnknown(false); localStorage.removeItem(pendingKey) } catch { /* Keep the original request for explicit receipt lookup. */ } } throw error }
    }).finally(() => { submitting.current = false }) }}>
      {error && <Banner>{error}</Banner>}
      {unknown && <Banner>提交结果尚未确认，草稿已保留。<Button variant="secondary" disabled={busy} onClick={() => void run(queryReceipt)}>核对创建结果</Button></Banner>}
      <fieldset disabled={busy || unknown} className="automation-fields">
        <div data-schedule-field="标题"><Field label="标题" full><Input ref={title} required maxLength={100} value={form.name} onChange={e => change({ name: e.target.value })} placeholder="定时任务标题" /></Field></div>
        <div data-schedule-field="任务描述"><Field label="任务描述" full><Textarea required maxLength={40000} rows={5} value={form.prompt} onChange={e => change({ prompt: e.target.value })} placeholder="描述 Agent 应该做什么" /></Field></div>
        <h4>详情</h4><div className="automation-settings">
          <Setting label="运行位置" value="此设备" />
          <Setting label="运行于" value={targetLabel}>
            {form.conversationPolicy === 'new-conversation' && form.taskKind !== 'monitor' ? <p className="field-hint">每次执行使用独立任务聊天，历史记录保留在本计划内。</p> : <>
            <SelectField aria-label="聊天方式" disabled={!!definition || form.taskKind === 'monitor'} value={form.conversationPolicy} onValueChange={value => change({ conversationPolicy: value as Form['conversationPolicy'], conversationId: undefined, employeeIds: undefined })} options={[{ value: 'new-conversation', label: '新任务聊天' }, { value: 'existing-conversation', label: '指定聊天' }]} />
            {form.conversationPolicy === 'new-conversation' ? <Field label="执行员工"><SelectField value={form.employeeIds?.[0] ?? ''} onValueChange={value => change({ employeeIds: value ? [value] : undefined })} options={[{ value: '', label: '选择员工' }, ...snapshot.agents.map(a => ({ value: a.id, label: `${a.name}${eligible(a.id) ? '' : ' · 配置或权限不可用'}`, disabled: !eligible(a.id) }))]} /></Field> : <><Input aria-label="搜索已有聊天" placeholder="搜索已有聊天" value={targetQuery} onChange={e => setTargetQuery(e.target.value)} /><Field label="目标会话"><SelectField value={form.conversationId ?? ''} onValueChange={value => change({ conversationId: value || undefined, ...(form.monitor ? { monitor: { ...form.monitor, source: { ...form.monitor.source, conversationId: value } } } : {}) })} options={[{ value: '', label: '选择会话' }, ...snapshot.conversations.filter(c => c.id === form.conversationId || c.title.includes(targetQuery)).map(c => ({ value: c.id, label: `${c.title} · ${c.kind === 'group' ? '群聊' : '单聊'}`, disabled: !c.agentIds.length || !c.agentIds.every(eligible) }))]} /></Field></>}
            </>}
            <p className="field-hint">模型 API 员工沿原执行权限，本机 Agent 沿已验证的原生配置执行。没有可用对象时，可在通讯录和设置中配置。</p>
            {profileError && <Banner>本机连接读取失败：{profileError}</Banner>}
          </Setting>
        </div>
        {form.conversationPolicy === 'new-conversation' && form.taskKind !== 'monitor' && <AutomationOwnerFields snapshot={snapshot} owner={form.owner} collaboration={form.collaboration} locked={!!owner || !!definition?.owner} eligible={eligible} onChange={(nextOwner, collaboration) => change({ owner: nextOwner, collaboration, employeeIds: nextOwner?.kind === 'employee' ? [nextOwner.employeeId] : collaboration?.assignments.map(a => a.employeeId) })} />}
        {!validTarget && <p className="field-hint" role="status">请在「运行于」明确选择可用员工或聊天。</p>}
        {form.taskKind === 'monitor' && <section aria-label="监控规则"><p className="field-hint">检查已发布 JSON：{form.monitor?.source.name || '尚未指定文件'} · {form.monitor?.rules.length ?? 0} 项比较规则</p><Button variant="secondary" onClick={() => setMonitorOpen(!monitorOpen)}>{monitorOpen ? '收起监控规则' : '编辑监控规则'}</Button>{!validMonitorPolicy(form.monitor) && <p className="field-hint">请补齐监控来源和有效规则；在「编辑监控规则」中检查字段、阈值和有效期。</p>}{monitorOpen && form.monitor && <MonitorEditor policy={form.monitor} onChange={monitor => change({ monitor })} />}</section>}
        <h4>频率</h4><div className="automation-settings">
          <Setting label="重复" value={{ daily: '每天', weekly: '每周选日', workdays: '工作日' }[rule]}>
            <SelectField aria-label="重复规则" value={rule} onValueChange={value => change({ frequency: value === 'daily' ? 'daily' : 'weekly', daysOfWeek: value === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : value === 'workdays' ? [1, 2, 3, 4, 5] : [form.weekday] })} options={[{ value: 'daily', label: '每天' }, { value: 'workdays', label: '工作日（周一至周五）' }, { value: 'weekly', label: '每周选日' }]} />
            {rule === 'weekly' && <fieldset className="automation-weekdays"><legend>选择星期</legend><div className="button-row">{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}><Checkbox checked={form.daysOfWeek?.includes(day)} onCheckedChange={checked => { const days = checked ? [...form.daysOfWeek ?? [], day].sort((a,b) => a-b) : form.daysOfWeek?.filter(d => d !== day) ?? []; change({ daysOfWeek: days, weekday: days[0] ?? 1 }) }} /><span>星期{['日','一','二','三','四','五','六'][day]}</span></label>)}</div></fieldset>}
            <p className="field-hint">工作日为周一至周五，不自动排除节假日。</p>
          </Setting>
          <Setting label="时间" value={form.time || '选择时间'}>
            <Field label="执行时间"><Input type="time" value={form.time} onChange={e => change({ time: e.target.value })} /></Field>
            <Field label="时区"><Input value={form.timezone} onChange={e => change({ timezone: e.target.value })} /></Field>
            <details><summary>查看后续时间</summary>{preview.error ? <Banner>{preview.error}</Banner> : <ol>{preview.nextTimes.map(time => <li key={time}>{formatTime(time)}</li>)}</ol>}</details>
          </Setting>
          <div className="automation-setting" data-schedule-field="通知"><span>通知</span><SelectField aria-label="通知" value={form.notificationPolicy} onValueChange={value => change({ notificationPolicy: value as Form['notificationPolicy'], notify: value !== 'muted' })} options={[{ value: 'important_only', label: '重要更新' }, { value: 'all_results', label: '每次结果' }, { value: 'muted', label: '静音' }]} /></div>
        </div>
        <div className="automation-preview" aria-label="执行时间预览">{preview.pending ? '正在预览执行时间…' : preview.error ? <Banner>{preview.error}</Banner> : `下次：${formatTime(preview.nextTimes[0])} · ${preview.timezone}`}</div>
        <p className="field-hint">在此设备运行；应用退出或设备休眠时不会执行。{definition && !definition.enabled ? '此计划已暂停，保存修改仍保持暂停。' : ''}</p>
      </fieldset>
    </form>
  </EditorFrame>
}

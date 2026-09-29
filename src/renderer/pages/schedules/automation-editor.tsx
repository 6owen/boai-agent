/*
 * [INPUT]: 固定计划身份、快照、自动化 IPC 与现有详情标签编辑守卫。
 * [OUTPUT]: 下拉字段统一使用 shadcn Select；报告/监控类型与明确聊天文件、字段阈值/新鲜度/冷却草稿；默认重要更新、每次结果或静音并兼容旧偏好；独立新建/编辑草稿、执行员工/聊天策略、星期多选/工作日、日程预览（只格式化已验证时区）与固定页脚保存。
 * [POS]: 定时任务的右侧标签内容；复用 DetailTabSession/EditorFrame，不创建另一套抽屉或确认框。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useId, useRef, useState } from 'react'
import type { AutomationDefinition, AutomationInput, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, EditorFrame, errorText, Field, GuardContext, Loading, useDirty, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Textarea } from '@/components/ui/textarea'

import { MonitorEditor, newMonitorPolicy, validMonitorPolicy } from './monitor-editor'

type Form = Omit<AutomationInput, 'id' | 'expectedRevision'> & Required<Pick<AutomationInput, 'taskKind' | 'conversationPolicy' | 'notificationPolicy'>>
type Props = { api: DesktopApi; snapshot: Snapshot; id?: string; onClose(): void; onSaved(value: AutomationDefinition, created: boolean): void }
export function AutomationEditorTab(props: Props) {
  const [loaded, setLoaded] = useState<{ definition?: AutomationDefinition; error?: string } | null>(props.id ? null : {})
  useEffect(() => {
    if (!props.id) return
    let live = true
    void props.api.request('listAutomations', undefined).then(view => {
      if (!live) return
      const definition = view.definitions.find(d => d.id === props.id)
      setLoaded(definition ? { definition } : { error: '此计划已删除或不可用，当前标签不会切换到其他计划。' })
    }).catch(error => { if (live) setLoaded({ error: errorText(error) }) })
    return () => { live = false }
  }, [props.id, props.api])
  if (!loaded) return <Loading>正在读取计划…</Loading>
  if (loaded.error) return <div className="detail-section"><Banner>{loaded.error}</Banner><Button variant="secondary" onClick={props.onClose}>关闭</Button></div>
  return <AutomationEditor {...props} definition={loaded.definition} />
}

function AutomationEditor({ api, snapshot, definition, onClose, onSaved }: Props & { definition?: AutomationDefinition }) {
  const formId = useId(), version = useRef(definition?.revision), title = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<Form>(() => ({ name: definition?.name ?? '', prompt: definition?.prompt ?? '',
    taskKind: definition?.taskKind ?? 'report', monitor: definition?.monitor,
    conversationPolicy: definition?.conversationPolicy ?? 'new-conversation', conversationId: definition?.conversationId, employeeIds: definition?.employeeIds,
    frequency: definition?.frequency ?? 'daily', time: definition?.time ?? '09:00', weekday: definition?.weekday ?? 1,
    daysOfWeek: definition?.frequency === 'weekly' ? definition.daysOfWeek ?? [definition.weekday] : [0, 1, 2, 3, 4, 5, 6],
    timezone: definition?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: definition?.enabled ?? true, notify: definition?.notify ?? true, notificationPolicy: definition?.notificationPolicy ?? (definition ? definition.notify ? 'all_results' : 'muted' : 'important_only') }))
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext), clean = useDirty(form)
  const [rule, setRule] = useState<'daily' | 'weekly' | 'workdays'>(() => form.frequency === 'daily' ? 'daily' : JSON.stringify(form.daysOfWeek) === '[1,2,3,4,5]' ? 'workdays' : 'weekly')
  const [notice, setNotice] = useState(''), [preview, setPreview] = useState<{ nextTimes: string[]; timezone?: string; error?: string; pending: boolean }>({ nextTimes: [], pending: true })
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(current => ({ ...current, [key]: value }))
  const daysKey = JSON.stringify(form.daysOfWeek)
  useEffect(() => { title.current?.focus() }, [])
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
    return !!(a?.active && !a.allowCommands && a.executionBackend?.kind !== 'acp-local' && c && (a.modelId || c.defaultModel))
  }
  const conversation = snapshot.conversations.find(c => c.id === form.conversationId)
  const memberIds = form.conversationPolicy === 'new-conversation' ? form.employeeIds ?? [] : conversation?.agentIds ?? []
  const members = snapshot.agents.filter(a => memberIds.includes(a.id))
  const resourceIds = new Set([...members.flatMap(a => [...a.skillIds, ...a.knowledgeIds]), ...(conversation?.sharedKnowledgeIds ?? [])])
  const validTarget = memberIds.length > 0 && memberIds.every(eligible)
  const valid = !!form.name.trim() && !!form.prompt.trim() && validTarget && (form.taskKind !== 'monitor' || validMonitorPolicy(form.monitor)) && preview.nextTimes.length > 0 && preview.timezone === form.timezone && !preview.pending
  return <EditorFrame title={definition ? '编辑定时任务' : '新建定时任务'} description="明确交付或监控目标，再选择来源和时间。" footer={<>
    <Button variant="secondary" disabled={busy} onClick={() => guard.navigate(onClose)}>{definition ? '关闭' : '取消'}</Button>
    <Button type="submit" form={formId} disabled={busy || !valid}>{busy ? '正在保存…' : definition ? '保存修改' : form.enabled ? '创建并启用' : '保存任务'}</Button>
  </>}>
    <form data-edit-form id={formId} className="form-grid automation-editor" onSubmit={event => { event.preventDefault(); if (!valid) return; void run(async () => {
      const result = await api.request('saveAutomation', { ...form, id: definition?.id, expectedRevision: version.current })
      version.current = result.revision; clean()
      setNotice(result.sync === 'synced' ? '已保存。' : '已保存，日程尚未同步成功；请在任务详情查看原因。')
      onSaved(result, !definition); guard.saved()
    }) }}>
      {error && <div className="full"><Banner>{error}</Banner></div>}
      {notice && <div className="full"><Banner kind="notice">{notice}</Banner></div>}
      <Field label="任务名称" full><Input ref={title} required maxLength={100} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例如：每天整理行业简报" /></Field>
      <Field label="任务类型" full><SelectField value={form.taskKind} onValueChange={selectedValue => setForm(current => selectedValue === 'monitor' ? { ...current, taskKind: 'monitor', conversationPolicy: 'existing-conversation', employeeIds: undefined, monitor: newMonitorPolicy(current.conversationId) } : { ...current, taskKind: 'report', monitor: undefined })} options={[{ value: 'report', label: '执行任务或生成报告' }, { value: 'monitor', label: '检查数据变化' }]} /></Field>
      <Field label="任务内容" full hint={form.taskKind === 'monitor' ? '说明关注这份数据的原因；实际变化由下方保存的规则判定。' : '写清需要检查什么、使用哪些已授权资料，以及期望得到的结果。'}><Textarea required maxLength={40000} rows={5} value={form.prompt} onChange={e => set('prompt', e.target.value)} /></Field>
      <h4 className="full">详情</h4>
      <Field label="运行于" full><SelectField disabled={form.taskKind === 'monitor'} value={form.conversationPolicy} onValueChange={selectedValue => setForm(current => ({ ...current, conversationPolicy: selectedValue as Form['conversationPolicy'], conversationId: undefined, employeeIds: undefined }))} options={[{ value: 'new-conversation', label: '每次新建任务聊天' }, { value: 'existing-conversation', label: '指定聊天' }]} /></Field>
      {form.conversationPolicy === 'new-conversation' ? <Field label="执行员工" full hint="使用此员工已授权的技能和资料，每次建立独立上下文与工作区。"><SelectField required value={form.employeeIds?.[0] ?? ''} onValueChange={selectedValue => set('employeeIds', selectedValue ? [selectedValue] : undefined)} options={[{ value: '', label: '选择员工' }, ...snapshot.agents.map(a => ({ value: a.id, label: `${a.name}${eligible(a.id) ? '' : ' · 配置或权限不可用'}`, disabled: !eligible(a.id) }))]} /></Field> : <Field label="目标会话" full hint="沿用当前成员和共享资料。会话忙碌时跳过，不中断人工对话。"><SelectField required value={form.conversationId ?? ''} onValueChange={selectedValue => setForm(current => ({ ...current, conversationId: selectedValue || undefined, ...(current.monitor ? { monitor: { ...current.monitor, source: { ...current.monitor.source, conversationId: selectedValue } } } : {}) }))} options={[{ value: '', label: '选择会话' }, ...snapshot.conversations.map(c => ({ value: c.id, label: `${c.title} · ${c.kind === 'group' ? '群聊' : '单聊'}`, disabled: !c.agentIds.length || !c.agentIds.every(eligible) }))]} /></Field>}
      {form.taskKind === 'monitor' && form.monitor && <MonitorEditor policy={form.monitor} onChange={value => set('monitor', value)} />}
      <p className="field-hint full">运行位置：此设备。应用运行时执行，退出或系统休眠期间不执行。</p>
      {form.taskKind !== 'monitor' && <details className="full"><summary>执行范围与预算</summary><p className="field-hint">{members.map(a => a.name).join('、') || '请先选择执行员工'} · 受控文件与知识任务，命令和外部 Agent 不自动执行。</p><p className="field-hint">资料：{snapshot.resources.filter(r => resourceIds.has(r.id)).map(r => r.name).join('、') || '未绑定资料'}</p><p className="field-hint">每次从受理起最多 5 分钟、24 次模型请求、8 次工作执行，已知输出上限 16,000 token。等待和补充不重置预算。</p></details>}
      <h4 className="full">频率</h4>
      <Field label="重复规则" full><SelectField value={rule} onValueChange={selectedValue => { setRule(selectedValue as typeof rule); setForm(current => ({ ...current, frequency: selectedValue === 'daily' ? 'daily' : 'weekly', daysOfWeek: selectedValue === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : selectedValue === 'workdays' ? [1, 2, 3, 4, 5] : [current.weekday] })) }} options={[{ value: 'daily', label: '每天' }, { value: 'weekly', label: '每周选日' }, { value: 'workdays', label: '工作日（周一至周五）' }]} /></Field>
      {rule === 'weekly' && <fieldset className="full automation-weekdays"><legend>选择星期</legend><div className="button-row">{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}><Checkbox checked={form.daysOfWeek?.includes(day)} onCheckedChange={checked => setForm(current => { const days = checked ? [...current.daysOfWeek ?? [], day].sort((a,b) => a-b) : current.daysOfWeek?.filter(d => d !== day) ?? []; return { ...current, daysOfWeek: days, weekday: days[0] ?? 1 } })} /><span>星期{['日','一','二','三','四','五','六'][day]}</span></label>)}</div></fieldset>}
      <Field label="执行时间" full><Input required type="time" value={form.time} onChange={e => set('time', e.target.value)} /></Field>
      <Field label="时区" full hint="例如 Asia/Shanghai、Asia/Singapore。夏令时不存在的时刻跳过，重复时刻只执行一次。"><Input required value={form.timezone} onChange={e => set('timezone', e.target.value)} /></Field>
      <div className="full automation-preview" aria-label="执行时间预览">{preview.pending ? <Loading>正在预览执行时间…</Loading> : preview.error ? <Banner>{preview.error}</Banner> : <><strong>未来 5 次 · {preview.timezone}</strong><ol>{preview.nextTimes.map(time => <li key={time}>{new Intl.DateTimeFormat('zh-CN', { timeZone: preview.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time))}</li>)}</ol></>}</div>
      <Field label="系统通知" full><SelectField value={form.notificationPolicy} onValueChange={selectedValue => setForm(current => ({ ...current, notificationPolicy: selectedValue as Form['notificationPolicy'], notify: selectedValue !== 'muted' }))} options={[{ value: 'important_only', label: '重要更新 · 交付或需要处理' }, { value: 'muted', label: '静音 · 保留执行记录' }, { value: 'all_results', label: '每次运行结束' }]} /></Field>
      <label className="toggle-row full"><span><strong>启用计划</strong><small>保存并同步成功后开始计时。</small></span><Checkbox checked={form.enabled} onCheckedChange={checked => set('enabled', checked)} /></label>
    </form>
  </EditorFrame>
}

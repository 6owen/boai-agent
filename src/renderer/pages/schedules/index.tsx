/*
 * [INPUT]: 自动化领域类型、DesktopApi、侧栏显示状态与共享控件、统一 UI 基础组件。
 * [OUTPUT]: 任务侧栏、居中空状态、配置表单和执行历史；搜索框图标尺寸遵循 InputGroup。
 * [POS]: schedules 页面；业务操作沿用现有 IPC 与未保存保护。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useEffect, useState, useContext } from 'react'
import type { AutomationDefinition, AutomationInput, AutomationOccurrence, AutomationsView, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, Field, GuardContext, Loading, useDirty, useMutation } from '@/components/common'
import { ChevronRight, MoreHorizontal, Plus, Search, Sliders, X } from '@/components/icons'
import scheduleClock from '@/assets/schedule-clock.png'
const statuses:Record<AutomationOccurrence['status'],string>={admitted:'已接收',running:'执行中',waiting_approval:'等待审批',waiting_user:'等待补充',completed:'已完成',failed:'失败',skipped:'已跳过',interrupted:'已中断',needs_review:'需核对',cancelled:'已停止'}

export function SchedulePage({ api, snapshot, sidebarShown, onConversation, onInfo }: {
  api: DesktopApi; snapshot: Snapshot; sidebarShown: boolean
  onConversation: (id: string) => void; onInfo: () => void
}) {
  const [view, setView] = useState<AutomationsView>({ definitions: [], occurrences: [], available: true })
  const [selected, setSelected] = useState<string | null>(null), [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true), [historyShown, setHistoryShown] = useState(false)
  const [searchShown, setSearchShown] = useState(false), [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'enabled' | 'paused'>('all')
  const guard = useContext(GuardContext), { busy, error, run } = useMutation()
  const refresh = async () => { setView(await api.request('listAutomations', undefined)); setLoading(false) }
  useEffect(() => {
    let live = true, queued = false
    const update = () => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (live) void api.request('listAutomations', undefined).then(value => {
          if (live) { setView(value); setLoading(false) }
        }).catch(() => {})
      })
    }
    void run(refresh)
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') update() })
    return () => { live = false; unsubscribe() }
  }, [api])
  const definition = view.definitions.find(d => d.id === selected)
  const occurrences = view.occurrences.filter(o => !selected || o.automationId === selected)
  const definitions = view.definitions.filter(d => d.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'enabled' ? d.enabled : !d.enabled)))
  const openNew = () => guard.navigate(() => { setSelected(null); setEditing(true); setHistoryShown(false) })
  const openHistory = () => guard.navigate(() => { setSelected(null); setEditing(false); setHistoryShown(true) })
  const welcome = !editing && !definition && !historyShown
  return <div className={`schedule-page${sidebarShown ? '' : ' sidebar-hidden'}`}>
    <aside className="schedule-list" aria-label="任务列表">
      <div className="schedule-heading"><h2>定时任务</h2><Button variant="ghost" size="icon-sm" aria-label="搜索任务" title="搜索任务" aria-expanded={searchShown} onClick={() => { setSearchShown(!searchShown); setQuery('') }}><Search size={18} /></Button></div>
      {searchShown && <InputGroup className="schedule-search"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput autoFocus aria-label="搜索任务名称" placeholder="搜索任务" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setSearchShown(false) } }} /><InputGroupAddon align="inline-end"><Button variant="ghost" size="icon-sm" aria-label="关闭任务搜索" onClick={() => { setQuery(''); setSearchShown(false) }}><X size={14} /></Button></InputGroupAddon></InputGroup>}
      <Button variant="ghost" size="content" className="schedule-create" aria-label="新建" onClick={openNew}><Plus size={20} /><span>新建任务</span></Button>
      <div className="schedule-section-heading"><span>{filter === 'paused' ? '已暂停' : '即将执行'}</span><div className="schedule-list-actions">
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="筛选任务" title="筛选任务" />}><Sliders size={17} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-36"><DropdownMenuGroup><DropdownMenuLabel>显示任务</DropdownMenuLabel><DropdownMenuRadioGroup value={filter} onValueChange={value => setFilter(value as typeof filter)}>{([{ value: 'all', label: '全部任务' }, { value: 'enabled', label: '已启用' }, { value: 'paused', label: '已暂停' }] as const).map(option => <DropdownMenuRadioItem closeOnClick key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
        <Button variant="ghost" size="icon-sm" aria-label="定时执行说明" title="定时执行说明" onClick={onInfo}><MoreHorizontal size={19} /></Button>
      </div></div>
      <div className="schedule-items">{definitions.map(d => <Button variant="ghost" size="content" key={d.id} className={`schedule-item${selected === d.id ? ' selected' : ''}`} onClick={() => guard.navigate(() => { setSelected(d.id); setEditing(false); setHistoryShown(false) })}><strong>{d.name}</strong><small>{d.sync === 'error' ? '尚未启用 · 同步失败' : d.sync === 'pending' ? '等待同步' : d.enabled ? '已启用' : '已暂停'} · {d.time}</small></Button>)}{!definitions.length && !loading && (query || filter !== 'all') && <p className="schedule-no-results">没有符合条件的任务</p>}</div>
      <Button variant="ghost" size="content" className={`schedule-history-link${historyShown ? ' selected' : ''}`} onClick={openHistory}>执行记录<ChevronRight size={16} /></Button>
    </aside>
    <main className={`schedule-content page-scroll${welcome ? ' is-welcome' : ''}`}>
      {(error || view.error) && <Banner>{error || view.error}</Banner>}
      {welcome ? loading ? <Loading>正在载入任务…</Loading> : <div className="schedule-welcome"><img className="schedule-clock" src={scheduleClock} width={48} height={48} alt="" /><h1>安排任务</h1><p>BoAI 可以代你处理持续性任务，让你无需事事亲为</p><Button onClick={openNew}>新建任务</Button></div> : <div className="schedule-document">
        {editing ? <AutomationEditor key={selected ?? 'new'} api={api} snapshot={snapshot} definition={definition} onSaved={async id => { await refresh(); setSelected(id); setEditing(false) }} onCancel={() => setEditing(false)} /> : <>
          <div className="page-heading"><div><h2>{definition?.name ?? '执行记录'}</h2><p>{definition ? `${definition.frequency === 'daily' ? '每天' : `每周${['日', '一', '二', '三', '四', '五', '六'][definition.weekday]}`} ${definition.time} · ${definition.timezone}` : '每次触发、结果和跳过原因都保存在这里。'}</p></div></div>
          {definition && <>
            <p className="automation-prompt">{definition.prompt}</p><p className="field-hint">结果写入：{snapshot.conversations.find(c => c.id === definition.conversationId)?.title ?? '会话已不可用'}</p>
            {definition.syncError && <Banner>{definition.syncError}</Banner>}
            <div className="button-row automation-actions">
              <Button disabled={busy} onClick={() => void run(async () => { await api.request('runAutomation', { id: definition.id, requestId: crypto.randomUUID() }); await refresh() })}>立即运行一次</Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>编辑{!definition.enabled ? ' / 启用' : ''}</Button>
              {definition.enabled && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api.request('pauseAutomation', { id: definition.id }); await refresh() })}>暂停计划</Button>}
              <Button variant="destructive" disabled={busy} onClick={() => void run(async () => { await api.request('deleteAutomation', { id: definition.id }); setSelected(null); await refresh() })}>删除计划</Button>
            </div>
            {definition.nextTimes.length > 0 && <details><summary>未来 5 次执行时间</summary><ol>{definition.nextTimes.map(t => <li key={t}>{new Intl.DateTimeFormat('zh-CN', { timeZone: definition.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t))}</li>)}</ol></details>}
            <p className="field-hint">每次最多 10 分钟；并发或会话忙碌时跳过。错过超过 10 分钟不补跑。暂停计划不会停止已经开始的运行。</p>
          </>}
          <h3>最近运行</h3>{occurrences.length === 0 && <p className="empty-note">尚无执行记录。</p>}
          <div className="automation-history">{occurrences.map(o => <Card className="connection-card gap-0 p-4" key={o.id}><CardContent className="p-0"><div className="connection-card-top"><strong>{o.name}</strong><span className="pill">{statuses[o.status]}</span></div><p>{new Date(o.startedAt).toLocaleString()} · {o.source === 'manual' ? '手动触发' : '定时触发'}</p>{o.reason && <p>{o.reason}</p>}<p className="field-hint">{o.resultMessageIds.length} 条结果 · {o.runIds.length} 条运行记录{o.modelCalls !== undefined ? ` · ${o.modelCalls} 次模型调用` : ''}{o.usage?.totalTokens !== undefined ? ` · ${o.usage.totalTokens} tokens` : ''}</p><div className="button-row">{o.messageId && <Button variant="secondary" size="sm" onClick={() => onConversation(o.conversationId)}>打开会话与结果</Button>}{['running', 'admitted', 'waiting_approval'].includes(o.status) && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(async () => { await api.request('stopAutomation', { id: o.id }); await refresh() })}>停止本次</Button>}</div></CardContent></Card>)}</div>
        </>}
      </div>}
    </main>
  </div>
}
function AutomationEditor({api,snapshot,definition,onSaved,onCancel}:{api:DesktopApi;snapshot:Snapshot;definition?:AutomationDefinition;onSaved:(id:string)=>Promise<void>;onCancel:()=>void}){const [form,setForm]=useState<AutomationInput>({id:definition?.id,expectedRevision:definition?.revision,name:definition?.name??'',prompt:definition?.prompt??'',conversationId:definition?.conversationId??'',frequency:definition?.frequency??'daily',time:definition?.time??'09:00',weekday:definition?.weekday??1,timezone:definition?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone,enabled:definition?.enabled??false,notify:definition?.notify??false}),{busy,error,run}=useMutation(),guard=useContext(GuardContext);useDirty(form);const set=<K extends keyof AutomationInput>(key:K,value:AutomationInput[K])=>setForm({...form,[key]:value});return <form data-edit-form className="form-grid" onSubmit={event=>{event.preventDefault();void run(async()=>{const saved=await api.request('saveAutomation',form);guard.saved();await onSaved(saved.id)})}}><h2 className="full">{definition?'编辑定时任务':'新建定时任务'}</h2>{error&&<div className="full"><Banner>{error}</Banner></div>}<Field label="任务名称" full><Input required value={form.name} onChange={e=>set('name',e.target.value)}/></Field><Field label="目标会话" full hint="支持模型 API 员工的单聊和群聊。请先建立会话；自动化员工需关闭命令权限。"><NativeSelect required value={form.conversationId} onChange={e=>set('conversationId',e.target.value)}><NativeSelectOption value="">选择会话</NativeSelectOption>{snapshot.conversations.map(c=><NativeSelectOption key={c.id} value={c.id} disabled={c.agentIds.some(id=>{const a=snapshot.agents.find(a=>a.id===id);return !a?.active||a.allowCommands||a.executionBackend?.kind==='acp-local'})}>{c.title} · {c.kind==='group'?'群聊':'单聊'}</NativeSelectOption>)}</NativeSelect></Field><Field label="任务内容" full><Textarea required rows={5} value={form.prompt} onChange={e=>set('prompt',e.target.value)} placeholder="希望同事定期完成什么？"/></Field><Field label="重复规则"><NativeSelect value={form.frequency} onChange={e=>set('frequency',e.target.value as 'daily'|'weekly')}><NativeSelectOption value="daily">每天</NativeSelectOption><NativeSelectOption value="weekly">每周</NativeSelectOption></NativeSelect></Field><Field label="执行时间"><Input required type="time" value={form.time} onChange={e=>set('time',e.target.value)}/></Field>{form.frequency==='weekly'&&<Field label="星期"><NativeSelect value={form.weekday} onChange={e=>set('weekday',Number(e.target.value))}>{['日','一','二','三','四','五','六'].map((d,i)=><NativeSelectOption key={i} value={i}>星期{d}</NativeSelectOption>)}</NativeSelect></Field>}<Field label="时区" full hint="例如 Asia/Shanghai、Asia/Singapore。夏令时缺失时刻跳过，重复时刻只执行一次。"><Input required value={form.timezone} onChange={e=>set('timezone',e.target.value)}/></Field><label className="toggle-row full"><span><strong>启用计划</strong><small>保存并同步成功后开始计时；电脑休眠期间不会执行。</small></span><Checkbox checked={form.enabled} onCheckedChange={checked =>set('enabled',checked)}/></label><label className="toggle-row full"><span>结束时发送系统通知</span><Checkbox checked={form.notify} onCheckedChange={checked =>set('notify',checked)}/></label><div className="button-row full"><Button type="submit" disabled={busy}>保存任务</Button><Button variant="secondary" type="button" onClick={()=>guard.navigate(onCancel)}>取消</Button></div></form>}
export function ScheduleDetail(){return <div className="detail-section"><h2>定时执行说明</h2><p>应用打开、最小化或 macOS 关闭窗口后仍可执行；真正退出或休眠期间不执行。</p><p>定时任务使用原有员工和群协作流程。结果、来源与失败记录都保留在会话中。</p><p>目前开放模型 API 员工的受控文件和知识任务。外部 Agent 与命令脚本不支持自动执行。</p></div>}

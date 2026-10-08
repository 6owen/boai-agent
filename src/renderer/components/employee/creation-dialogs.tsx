/*
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [OUTPUT]: 创建弹窗区分Codex本机登录与Claude明确API来源；Claude进入原普通群选人，核心组织能力仍单独限制。
 * [INPUT]: 员工/连接快照、DesktopApi、创建完成回调和全局未保存守卫。
 * [OUTPUT]: 身份、可选/上传头像与 Prompt 的员工弹窗、搜索选人的群聊弹窗；核心助手不作为群成员候选，创建后打开真实会话。
 * [POS]: employee 的创建入口；后续能力、群名称与共享资料编辑仍由右侧编辑器负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Conversation, DigitalAgent, Snapshot, LaunchProfile, ExecutionBackend } from '@shared/domain'
import { backendProtocol, isNativeBackend } from '@shared/domain/backends'
import { isCoreAgent } from '@shared/domain/core-agent'
import type { DesktopApi } from '@shared/ipc'
import { Avatar, Banner, colors, Field, GuardContext, useDirty, useMutation } from '@/components/common'
import { LoaderCircle, Search, Users, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Textarea } from '@/components/ui/textarea'
import { templates } from './editors'
import { AvatarPicker } from './avatar-picker'
import { avatarPresets, type AgentAvatar } from '@shared/domain/avatars'

interface Props {
  api: DesktopApi; snapshot: Snapshot; onClose(): void; onCreated(conversation: Conversation): Promise<void>
}
const returnFocus = () => document.querySelector<HTMLElement>('.list-heading [aria-label="新建"]')

export function CreateAgentDialog({ api, snapshot, template, onClose, onCreated }: Props & { template?: number }) {
  const preset = template === undefined ? undefined : templates[template]
  const [form, setForm] = useState({ name: preset?.name ?? '', role: preset?.role ?? '', instructions: preset?.instructions ?? '', connectionId: '', modelId: '', executionBackend: { kind: 'mastra-model' } as ExecutionBackend, avatar: { kind: 'preset', id: avatarPresets[(template ?? snapshot.agents.length) % avatarPresets.length].id } as AgentAvatar })
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [profileError, setProfileError] = useState('')
  useEffect(() => { let active = true; void api.request('listLaunchProfiles', undefined).then(value => { if (active) setProfiles(value) }, () => { if (active) setProfileError('本机连接读取失败，请重新打开员工创建窗口。') }); return () => { active = false } }, [api])
  const [uploading, setUploading] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const created = useRef<DigitalAgent | null>(null)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext)
  useDirty(form)
  const close = () => { if (!busy && !uploading) guard.navigate(onClose) }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || uploading) return
    void run(async () => {
      // Keep the saved employee if opening the conversation needs to be retried.
      created.current ??= await api.request('saveAgent', { ...form, name: form.name.trim(), role: form.role.trim(), color: preset?.color ?? colors[0], connectionId: form.executionBackend.kind === 'claude-local' ? form.connectionId : form.executionBackend.kind === 'mastra-model' ? snapshot.connections[0]?.id ?? '' : '', modelId: form.executionBackend.kind === 'claude-local' ? form.modelId : '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
      const conversation = await api.request('createConversation', { kind: 'direct', title: created.current.name, agentIds: [created.current.id] })
      await onCreated(conversation)
    })
  }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={false} initialFocus={nameInput} finalFocus={returnFocus} className="max-h-[calc(100dvh-32px)] overflow-y-auto p-6 sm:max-w-[520px]">
      <DialogHeader><DialogTitle>新建数字员工</DialogTitle></DialogHeader>
      <div className="creation-avatar"><AvatarPicker name={form.name.trim() || '新同事'} value={form.avatar} disabled={busy || Boolean(created.current)} onChange={avatar => setForm(current => ({ ...current, avatar }))} onBusyChange={setUploading} /></div>
      <form data-edit-form id="create-agent-form" onSubmit={submit}>
        <FieldGroup>
          {error && <Banner>{error}</Banner>}
          <fieldset disabled={busy || uploading || Boolean(created.current)} className="m-0 min-w-0 border-0 p-0">
            <FieldGroup>
              <Field label="名称"><Input ref={nameInput} required maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：资料研究员" /></Field>
              <Field label="角色"><Input maxLength={300} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="一句话描述这位同事的职责" /></Field>
              <Field label="运行方式"><SelectField value={form.executionBackend.kind} onValueChange={value => { const kind = value === 'claude-local' ? 'claude-local' : 'codex-local'; setForm(current => ({ ...current, connectionId: '', modelId: '', executionBackend: value === 'mastra-model' ? { kind: 'mastra-model' } : { kind, profileId: profiles.find(p => p.protocol === backendProtocol(kind) && p.verified)?.id ?? '' } })) }} options={[{ value: 'mastra-model', label: '模型 API' }, { value: 'codex-local', label: '本机 Codex' }, { value: 'claude-local', label: '本机 Claude' }]} /></Field>
              {isNativeBackend(form.executionBackend) && <Field label="本机连接" hint={profileError || (form.executionBackend.kind === 'claude-local' ? '选择已核对的 Claude 程序，并为它配置模型来源。支持单聊、普通群聊和文件任务。' : '在设置中添加并测试本机 Codex 后选择。当前支持连续聊天。')}><SelectField required value={form.executionBackend.profileId} onValueChange={profileId => setForm(current => isNativeBackend(current.executionBackend) ? { ...current, executionBackend: { ...current.executionBackend, profileId } } : current)} options={[{ value: '', label: '请选择本机连接' }, ...profiles.filter(p => p.protocol === backendProtocol(form.executionBackend.kind as 'codex-local' | 'claude-local')).map(p => ({ value: p.id, label: p.name + (p.verified ? '' : ' · 未测试'), disabled: !p.verified }))]} /></Field>}
              {form.executionBackend.kind === 'claude-local' && <>
                <Field label="模型来源" hint="由本机 Claude 使用此 API 连接；连接验证通过后再开始聊天。"><SelectField required value={form.connectionId} onValueChange={connectionId => setForm(current => ({ ...current, connectionId, modelId: '' }))} options={[{ value: '', label: '请选择模型连接' }, ...snapshot.connections.map(connection => ({ value: connection.id, label: connection.name }))]} /></Field>
                <Field label="模型 ID" hint="留空使用所选连接的默认模型。"><Input value={form.modelId} onChange={event => setForm(current => ({ ...current, modelId: event.target.value }))} placeholder={snapshot.connections.find(connection => connection.id === form.connectionId)?.defaultModel || '使用连接默认模型'} /></Field>
              </>}
              <Field label="Prompt"><Textarea rows={5} maxLength={64000} value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="你是一位……请按照这些规则工作。" /></Field>
            </FieldGroup>
          </fieldset>
          <DialogFooter variant="plain"><Button variant="ghost" disabled={busy || uploading} onClick={close}>取消</Button><Button variant="ink" type="submit" disabled={busy || uploading || !form.name.trim()}>{busy && <LoaderCircle className="spinner" />}创建员工</Button></DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>
}

export function CreateGroupDialog({ api, snapshot, onClose, onCreated }: Props) {
  const [query, setQuery] = useState(''), [ids, setIds] = useState<string[]>([])
  const created = useRef<Conversation | null>(null)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext)
  useDirty(ids)
  const available = snapshot.agents.filter(agent => !isCoreAgent(agent) && agent.active && agent.executionBackend?.kind !== 'acp-local')
  const selected = ids.map(id => available.find(a => a.id === id)).filter((a): a is DigitalAgent => Boolean(a))
  const matches = available.filter(agent => `${agent.name} ${agent.role}`.toLowerCase().includes(query.trim().toLowerCase()))
  const locked = busy || Boolean(created.current)
  const close = () => { if (!busy) guard.navigate(onClose) }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selected.length || selected.length > 12) return
    void run(async () => {
      created.current ??= await api.request('createConversation', { kind: 'group', title: selected.map(a => a.name).join('、').slice(0, 200), agentIds: selected.map(a => a.id), mode: 'natural', sharedKnowledgeIds: [] })
      await onCreated(created.current)
    })
  }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={false} finalFocus={returnFocus} className="max-h-[calc(100dvh-32px)] overflow-y-auto p-6 sm:max-w-[720px]">
      <form data-edit-form id="create-group-form" className="flex min-h-0 flex-col gap-5" onSubmit={submit}>
        {error && <Banner>{error}</Banner>}
        <div className="grid min-h-0 grid-cols-1 gap-5 sm:grid-cols-2">
          <FieldSet className="min-w-0 gap-3">
            <FieldLegend className="sr-only">选择群成员</FieldLegend>
            <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索群成员" placeholder="搜索名称或角色" value={query} onChange={e => setQuery(e.target.value)} /></InputGroup>
            <div className="h-[200px] overflow-y-auto sm:h-[340px]">
              {matches.map(agent => <label className="creation-member" key={agent.id}>
                <Checkbox checked={ids.includes(agent.id)} disabled={locked || (selected.length >= 12 && !ids.includes(agent.id))} onCheckedChange={checked => setIds(current => checked ? [...current, agent.id] : current.filter(id => id !== agent.id))} />
                <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span className="conversation-copy"><strong className="conversation-title">{agent.name}</strong><small className="conversation-preview">{agent.role || '数字员工'}</small></span>
              </label>)}
              {!matches.length && <p className="empty-note">{available.length ? '没有匹配的员工' : '还没有可加入群聊的员工'}</p>}
            </div>
          </FieldSet>
          <section className="flex min-w-0 flex-col gap-3" aria-label="已选成员">
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2"><DialogTitle>发起群聊</DialogTitle><span className="creation-selection-heading">已选择 {selected.length} 位员工</span></div>
              <DialogDescription className="sr-only">选择 1–12 位数字员工，群名称和资料可在创建后编辑。</DialogDescription>
            </DialogHeader>
            <div className="h-[160px] overflow-y-auto sm:h-0 sm:flex-1">
              {selected.map(agent => <div className="creation-member" key={agent.id}><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span className="conversation-copy"><strong className="conversation-title">{agent.name}</strong><small className="conversation-preview">{agent.role || '数字员工'}</small></span><Button variant="ghost" size="icon-sm" round disabled={locked} aria-label={`移除 ${agent.name}`} onClick={() => setIds(current => current.filter(id => id !== agent.id))}><X /></Button></div>)}
              {!selected.length && <div className="creation-selection-empty"><Users /><span>选择一起工作的同事</span></div>}
            </div>
            <DialogFooter variant="plain"><Button variant="ghost" disabled={busy} onClick={close}>取消</Button><Button variant="ink" type="submit" disabled={busy || !selected.length}>{busy && <LoaderCircle className="spinner" />}完成</Button></DialogFooter>
          </section>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

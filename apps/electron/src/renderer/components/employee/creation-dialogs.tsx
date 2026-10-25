/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [OUTPUT]: 发起群聊恢复纯成员选择，不展示群名称输入；群名由已选成员姓名生成，原公共创建回执保持。
 * [OUTPUT]: 新建员工恢复原头像/姓名/职责、常显模型与权限和工作方式；不添加高级折叠或人格输入，模型由用户明确选择，公共创建回执保持。
 * [OUTPUT]: 群创建与成员编辑复用双栏GroupMemberSelection，原创建回执和草稿守卫保持。
 * [OUTPUT]: API/Codex/Claude创建保留同一个整体执行权限，原生参数随同选择提交，不再丢弃本机权限。
 * [OUTPUT]: 新建工作方式输入缩为12px/18px行高，沿共用员工表单紧凑密度。
 * [OUTPUT]: 新建API员工默认请求整体执行审批，模型留空继承连接默认值。
 * [OUTPUT]: 新建员工直接呈现无卡片/无分区标题的头像、姓名和职责行，Dialog保留无障碍名称。
 * [OUTPUT]: 新建员工与编辑共用身份布局；模型与权限使用标题加Card，工作方式仅标题和textarea。
 * [OUTPUT]: 员工创建保留数据源同款Dialog；新建员工组恢复原搜索候选/已选成员双栏弹窗及右下角操作。
 * [OUTPUT]: API员工创建默认允许申请命令，可显式关闭；命令选择不被创建载荷覆盖。
 * [OUTPUT]: 创建共用设置页模型目录/手动输入，普通员工默认允许申请命令；旧ACP限制保持。
 * [OUTPUT]: 创建员工共用模型API/本机Agent两级选择，按用户明确选择保存具体连接与模型，不再隐式使用第一条API连接。
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [OUTPUT]: 创建弹窗区分Codex本机登录与Claude明确API来源；Claude进入原普通群选人，核心组织能力仍单独限制。
 * [INPUT]: 员工/连接快照、DesktopApi、创建完成回调和全局未保存守卫。
 * [OUTPUT]: 身份、可选/上传头像与 Prompt 的员工弹窗、搜索选人的群聊弹窗；核心助手不作为群成员候选，创建后打开真实会话。
 * [POS]: employee 的创建入口；后续能力、群名称与共享资料复用通讯录Dialog/右侧原编辑器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Conversation, DigitalAgent, Snapshot, LaunchProfile, ExecutionBackend } from '@boai/shared/domain'
import type { ApplicationRequest, ApplicationResult } from '@boai/shared/domain/application-protocol'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, colors, GuardContext, useDirty, useMutation } from '@/components/common'
import { LoaderCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { GroupMemberSelection } from './group-member-selection'
import { templates } from './editors'
import { AvatarPicker } from './avatar-picker'
import { AgentModelFields, agentModelSelectionReady } from './agent-model-fields'
import { AgentPermissionField } from './agent-permission-field'
import type { ExecutionPermission } from '@boai/shared/domain/execution'
import { avatarPresets, type AgentAvatar } from '@boai/shared/domain/avatars'
import { ConnectionDialogLayout } from '@/pages/settings/connection-layout'
import { ContactProfileSection, EmployeeFormSection } from './profile-card'

interface Props {
  api: DesktopApi; snapshot: Snapshot; onClose(): void; onCreated(conversation: Conversation): Promise<void>
}
const returnFocus = () => document.querySelector<HTMLElement>('.list-heading [aria-label="新建"]')

export function CreateAgentDialog({ api, snapshot, template, onClose, onCreated }: Props & { template?: number }) {
  const preset = template === undefined ? undefined : templates[template]
  const [form, setForm] = useState({ name: preset?.name ?? '', role: preset?.role ?? '', instructions: preset?.instructions ?? '', connectionId: '', modelId: '', executionPermission: 'ask' as ExecutionPermission, allowCommands: true, executionBackend: { kind: 'mastra-model' } as ExecutionBackend, avatar: { kind: 'preset', id: avatarPresets[(template ?? snapshot.agents.length) % avatarPresets.length].id } as AgentAvatar })
  const [unresolved, setUnresolved] = useState(false)
  const pending = useRef<ApplicationRequest | null>(null)
  const sessionRequest = useRef(crypto.randomUUID())
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [profileError, setProfileError] = useState('')
  useEffect(() => { let active = true; void api.request('listLaunchProfiles', undefined).then(value => { if (active) setProfiles(value) }, () => { if (active) setProfileError('本机连接读取失败，请重新打开员工创建窗口。') }); return () => { active = false } }, [api])
  const [uploading, setUploading] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const created = useRef<DigitalAgent | null>(null)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext)
  const modelReady = agentModelSelectionReady(form, snapshot.connections, profiles)
  useDirty(form)
  const close = () => { if (!busy && !uploading) guard.navigate(onClose) }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || uploading || (!created.current && !modelReady)) return
    void run(async () => {
      // Keep the saved employee if opening the conversation needs to be retried.
      if (!created.current) {
        pending.current ??= { operation: 'employees.create', requestId: crypto.randomUUID(), input: { ...form, executionPermission: ['mastra-model', 'codex-local', 'claude-local'].includes(form.executionBackend.kind) ? form.executionPermission : undefined, name: form.name.trim(), role: form.role.trim(), color: preset?.color ?? colors[0], allowCommands: form.executionBackend.kind !== 'acp-local' && form.allowCommands } }
        setUnresolved(true)
        const result = await submitCreation(api, pending.current)
        if (result.status === 'rejected') { pending.current = null; setUnresolved(false) }
        if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '创建结果尚未确认，请核对原请求。')
        created.current = result.data as DigitalAgent
        setUnresolved(false)
      }
      const receipt = await submitCreation(api, { operation: 'sessions.create', input: { employeeId: created.current.id }, requestId: sessionRequest.current })
      if (receipt.status !== 'succeeded') throw new Error(receipt.error?.message ?? '员工已创建，打开会话的结果待核对。')
      const conversation = (await api.request('getConversation', { id: (receipt.data as { conversationId: string }).conversationId })).conversation
      await onCreated(conversation)
    })
  }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <ConnectionDialogLayout choosing={false} scrollBody showIntro={false} label="新建员工" title="新建数字员工" closeLabel="关闭新建员工" working={busy || uploading} onClose={close} initialFocus={nameInput} finalFocus={returnFocus} illustration={null}>
      <form data-edit-form id="create-agent-form" className="employee-form-layout" onSubmit={submit}>
        {error && <Banner>{error}</Banner>}
        <fieldset className="employee-form-sections" disabled={busy || uploading || unresolved || Boolean(created.current)}>
          <div className="employee-identity-editor">
            <AvatarPicker name={form.name.trim() || '新同事'} value={form.avatar} disabled={busy || Boolean(created.current)} onChange={avatar => setForm(current => ({ ...current, avatar }))} onBusyChange={setUploading} />
            <div className="employee-identity-fields">
              <Input ref={nameInput} id="create-agent-name" aria-label="名称" className="employee-identity-name" required maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：资料研究员" />
              <Input id="create-agent-role" aria-label="角色" className="employee-identity-role" maxLength={300} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="一句话描述这位同事的职责" />
            </div>
          </div>
          <EmployeeFormSection title="模型与权限">
            <AgentModelFields api={api} value={form} connections={snapshot.connections} profiles={profiles} profileError={profileError} disabled={busy || uploading || unresolved || Boolean(created.current)} onChange={selection => setForm(current => ({ ...current, ...selection, executionBackend: selection.executionBackend ?? { kind: 'mastra-model' } }))} />
            {form.executionBackend.kind === 'mastra-model' && <AgentPermissionField value={form.executionPermission} onChange={executionPermission => setForm(current => ({ ...current, executionPermission, allowCommands: executionPermission !== 'read-only' }))} disabled={busy || uploading || unresolved || Boolean(created.current)} />}
          </EmployeeFormSection>
          <ContactProfileSection title="工作方式"><Textarea aria-label="工作方式" id="create-agent-instructions" className="py-1.5 text-[length:var(--text-ui-secondary)] leading-[var(--leading-ui-body)] md:text-[length:var(--text-ui-secondary)]" rows={5} maxLength={64000} value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="你是一位……请按照这些规则工作。" /></ContactProfileSection>
        </fieldset>
        <footer className="employee-form-footer"><Button variant="ghost" size="sm" disabled={busy || uploading} onClick={close}>取消</Button><Button size="sm" type="submit" disabled={busy || uploading || !form.name.trim() || (!created.current && !modelReady)}>{busy && <LoaderCircle className="spinner" />}{unresolved ? '核对创建结果' : '创建员工'}</Button></footer>
      </form>
    </ConnectionDialogLayout>
  </Dialog>
}

export function CreateGroupDialog({ api, snapshot, onClose, onCreated }: Props) {
  const [ids, setIds] = useState<string[]>([])
  const pending = useRef<ApplicationRequest | null>(null)
  const [unresolved, setUnresolved] = useState(false)
  const created = useRef<Conversation | null>(null)
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext)
  useDirty(ids)
  const available = snapshot.agents.filter(agent => !isCoreAgent(agent) && agent.active && agent.executionBackend?.kind !== 'acp-local')
  const selected = ids.map(id => available.find(a => a.id === id)).filter((a): a is DigitalAgent => Boolean(a))
  const locked = busy || unresolved || Boolean(created.current)
  const close = () => { if (!busy) guard.navigate(onClose) }
  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!selected.length || selected.length > 12) return
    void run(async () => {
      if (!created.current) {
        pending.current ??= { operation: 'groups.create', requestId: crypto.randomUUID(), input: { title: selected.map(a => a.name).join('、').slice(0, 200), agentIds: selected.map(a => a.id), mode: 'natural', sharedKnowledgeIds: [] } }
        setUnresolved(true)
        const result = await submitCreation(api, pending.current)
        if (result.status === 'rejected') { pending.current = null; setUnresolved(false) }
        if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '群聊创建结果待核对，请保留原请求。')
        created.current = result.data as Conversation
        setUnresolved(false)
      }
      await onCreated(created.current)
    })
  }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={false} finalFocus={returnFocus} className="max-h-[calc(100dvh-32px)] overflow-y-auto p-6 sm:max-w-[720px]">
      <form data-edit-form id="create-group-form" className="flex min-h-0 flex-col gap-5" onSubmit={submit}>
        {error && <Banner>{error}</Banner>}
        <GroupMemberSelection agents={available} ids={ids} onChange={setIds} title="发起群聊" busy={busy} locked={locked} confirmDisabled={busy} onCancel={close} onConfirm={() => submit()} />
      </form>
    </DialogContent>
  </Dialog>
}

/** Read an existing receipt before sending; transport failure never becomes another create intent. */
async function submitCreation(api: DesktopApi, request: ApplicationRequest): Promise<ApplicationResult> {
  const previous = await api.request('getApplicationReceipt', { requestId: request.requestId! })
  if (previous) return previous
  try { return await api.request('executeApplicationOperation', request) }
  catch (failure) {
    const result = await api.request('getApplicationReceipt', { requestId: request.requestId! })
    if (result) return result
    throw failure
  }
}

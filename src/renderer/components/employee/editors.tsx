/*
 * [OUTPUT]: 本机技能独立绑定后更新配置基线/版本并保留原草稿；技能/数据源/知识可经未保存守卫打开原资源详情。
 * [OUTPUT]: API/Codex/Claude同一整体权限保存实际策略，原生审批和访问范围同步调整，旧原生配置未选择时保留。
 * [OUTPUT]: 员工创建/编辑身份行无卡片或分区标题；工作方式仅标题和textarea；模型与权限及资源绑定沿外部分区标题与Card呈现。
 * [OUTPUT]: 配置保存/头像上传忙时透传弹窗关闭锁；原版本化提交、未知回执及非弹窗布局保持。
 * [OUTPUT]: 核心数据源权限显示默认全部访问，普通员工继续保存sourceIds。
 * [OUTPUT]: 员工命令字段读取独立授权快照，恢复逐次确认经版本化撤销，不改配置草稿或活动运行。
 * [OUTPUT]: API员工命令设置可编辑且保存尊重原值；本机nativeOptions完整回填，命令能力不影响定时任务资格。
 * [OUTPUT]: 员工配置明确选择数据源，保留版本保存/未决核对。
 * [OUTPUT]: 已保存BOAI群详情共用归属自动化页签，原群配置/清理和未保存守卫保持。
 * [OUTPUT]: 员工身份跨详情标签常驻编辑并共用保存草稿/页脚；隐藏且无修改的配置不占用其他表单守卫，保存错误回到配置核对；普通员工默认允许申请命令，核心与旧ACP限制保持。
 * [OUTPUT]: 可选actionsTarget兼容内嵌顶部操作；通讯录Dialog使用原底部保存/取消，保存后关闭并更新基线/版本。
 * [OUTPUT]: 员工与系统助手共用模型API/本机Agent两级选择；具体连接按真实协议绑定，切换不静默清除技能或知识，命令申请采用普通员工默认与核心/旧ACP限制。
 * [OUTPUT]: Claude自动化沿原七项表单、原Mastra时钟/occurrence/预算和宿主文件交付接入；明确程序/API来源逐次核对，命令/旧ACP限制保持，实际验证见第13组06 §57。
 * [OUTPUT]: Claude核心配置复用原程序/API字段，组织群允许独立Claude成员；核心不得经普通建群加入，自动化仍未开放。
 * [OUTPUT]: Claude材料接入沿原入口，图片理解需实际模型支持；普通群已接，核心组织/自动化门禁保持。
 * [OUTPUT]: Claude单员工复用原表单，分别选择严格匹配的本机程序与明确API来源；普通群按员工独立运行，核心组织能力尚未开放。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [OUTPUT]: API与原生Codex共用技能/知识和命令配置，切至Codex保留资源绑定；旧ACP继续受限。
 * [OUTPUT]: 本机Codex员工复用材料技能与逐次命令审批；普通群协作已接，组织群/自动化另行验收。
 * [OUTPUT]: 配置选择原生Codex或旧ACP，启动项按协议过滤且不混用API连接。
 * [INPUT]: 员工与群领域类型、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 已发布 bobo 协作群编辑保留现有核心成员，普通手动建群不能新添 bobo。
 * [OUTPUT]: Mastra 员工/bobo 默认浏览器可用，表单不展示开关或要求先保存再启用；ACP支持边界由共享能力判断；已保存员工的明确本机技能绑定、草稿先保存、未决请求门禁及真实回执配置/版本同步；员工配置固定启用且不展示开关；核心助手可改名及设置默认模型，提供API/本机Codex后端且隐藏命令开关，并排除群候选；既有群配置可确认解散及清理记录/群空间，刷新后丢弃编辑草稿并关闭；新交流记忆范围和可选事项关联；既有团队群的目的/建议编辑、删除和版本保存；下拉字段统一使用 shadcn Select；独立表单 ID 支持多个详情标签同时挂载。
 * [OUTPUT]: 知识空态不再引导进入已删除的资料库页面，既有知识绑定保持。
 * [OUTPUT]: 既有员工配置保存响应失败后只读核对当前配置，保留草稿与原预期版本；显式载入已提交配置后再编辑，不伪造请求回执或自动重试保存。
 * [POS]: src/renderer/components/employee/editors.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { SourcePicker } from '@/pages/sources/source-picker'
import { OwnerAutomations } from '@/pages/schedules/owner-automations'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog'
import type { LaunchProfile } from '@shared/domain'
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { FileText, LoaderCircle, Search, ShieldCheck } from '@/components/icons/index'
import type { AgentInput, Conversation, DigitalAgent, Resource, Snapshot } from '@shared/domain'
import type { BindLocalSkillInput, SkillBindingReceipt } from '@shared/domain/skills'
import { isCoreAgent } from '@shared/domain/core-agent'
import type { DesktopApi } from '@shared/ipc'
import { Banner, colors, EditorFrame, errorText, Field, GuardContext, ResourcePicker, useDirty, useMutation } from '@/components/common/index'
import { GroupMembers } from './group-members'
import { AvatarPicker } from './avatar-picker'
import { AgentModelFields, agentModelSelectionReady } from './agent-model-fields'
import { AgentPermissionField } from './agent-permission-field'
import { LocalSkillBinding } from './local-skill-binding'
import { committedSkillBindingAgent, mergeSkillBindingDraft } from './local-skill-binding-state'
import { EmployeeResourceNavigation, type EmployeeResourceTarget } from './resource-navigation'
import { ContactProfileSection, EmployeeFormSection } from './profile-card'
export const templates = [
  { name: '资料研究员', role: '查找资料，厘清事实', instructions: '你是一位细致的资料研究员。区分事实与推测，提供可追踪的来源。', icon: Search, color: colors[0] },
  { name: '方案写手', role: '把想法写成清晰方案', instructions: '你是一位方案写手。理解目标与受众，基于获准资料撰写清楚自然的内容。', icon: FileText, color: colors[1] },
  { name: '内容审核员', role: '检查逻辑，打磨细节', instructions: '你是一位内容审核员。核对事实、来源、逻辑与表达，给出具体修改建议。', icon: ShieldCheck, color: colors[2] },
]
function savedAgentForm(agent: DigitalAgent): AgentInput { return { executionPermission: agent.executionPermission, avatar: agent.avatar, executionBackend: agent.executionBackend, nativeOptions: agent.nativeOptions, id: agent.id, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, sourceIds: [...(agent.sourceIds ?? [])], skillIds: [...agent.skillIds], knowledgeIds: [...agent.knowledgeIds], allowCommands: agent.allowCommands, active: true } }
export function AgentEditor({ api, snapshot, agent, template, onClose, onSaved, active = true, scope = 'creation', identityTarget, footerTarget, actionsTarget, configurationVisible = true, identityDisabled = false, onDirtyChange, onRevealConfiguration, onBusyChange }: { api: DesktopApi; snapshot: Snapshot; agent?: DigitalAgent; template?: number; onClose: () => void; onSaved: () => Promise<void>; active?: boolean; scope?: string; identityTarget?: HTMLElement | null; footerTarget?: HTMLElement | null; actionsTarget?: HTMLElement | null; configurationVisible?: boolean; identityDisabled?: boolean; onDirtyChange?(dirty: boolean): void; onRevealConfiguration?(): void; onBusyChange?(busy: boolean): void }) {
  const core = isCoreAgent(agent)
  const formId = useId()
  const [uploading, setUploading] = useState(false)
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]), [profileError, setProfileError] = useState('')
  useEffect(() => {
    if (!active) return
    let current = true
    void api.request('listLaunchProfiles', undefined).then(value => { if (current) { setProfiles(value); setProfileError('') } }, () => { if (current) setProfileError('本机连接读取失败，请重新打开员工配置。') })
    return () => { current = false }
  }, [api, active])
  const initialVersion = useRef(agent?.configVersion)
  const preset = template === undefined ? undefined : templates[template]
  const [form, setForm] = useState<AgentInput>(() => {
    if (agent) return savedAgentForm(agent)
    return { name: preset?.name ?? '', role: preset?.role ?? '', instructions: preset?.instructions ?? '', color: preset?.color ?? colors[0], connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: true, active: true }
  })
  const { busy, error, run, setError } = useMutation()
  const guard = useContext(GuardContext)
  const resourceNavigation = useContext(EmployeeResourceNavigation)
  const [bindingLocked, setBindingLocked] = useState(false), [bindingNotice, setBindingNotice] = useState(''), [boundResources, setBoundResources] = useState<Resource[]>([])
  const [saveUnconfirmed, setSaveUnconfirmed] = useState(false), [checkedAgent, setCheckedAgent] = useState<DigitalAgent | null>(null), [saveCheckNotice, setSaveCheckNotice] = useState('')
  const baseline = useRef(JSON.stringify(form)), currentForm = useRef(form); currentForm.current = form
  const dirty = JSON.stringify(form) !== baseline.current
  const locked = busy || uploading || bindingLocked || saveUnconfirmed
  useEffect(() => { onBusyChange?.(busy || uploading); return () => onBusyChange?.(false) }, [busy, uploading, onBusyChange])
  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => { if (!locked) setForm(current => ({ ...current, [key]: value })) }
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!configurationVisible && !dirty) return
    guard.setDirty(dirty)
    return () => guard.setDirty(false)
  }, [dirty, guard.setDirty, configurationVisible])
  useEffect(() => { if (error && !configurationVisible) onRevealConfiguration?.() }, [error, configurationVisible, onRevealConfiguration])
  useEffect(() => {
    if (!agent || bindingLocked || saveUnconfirmed || JSON.stringify(currentForm.current) !== baseline.current || agent.configVersion <= (initialVersion.current ?? 0)) return
    const updated = savedAgentForm(agent); baseline.current = JSON.stringify(updated); initialVersion.current = agent.configVersion; setForm(updated)
  }, [agent, bindingLocked, saveUnconfirmed])
  const bindingCommitted = async (receipt: SkillBindingReceipt, input: BindLocalSkillInput) => {
    const committed = committedSkillBindingAgent(input, receipt, agent)
    if (!committed || !receipt.resource) throw new Error('已完成回执没有可核对的员工绑定，请保留原请求核对。')
    const updated = savedAgentForm(committed)
    const draft = mergeSkillBindingDraft(JSON.parse(baseline.current) as AgentInput, currentForm.current, updated)
    baseline.current = JSON.stringify(updated); initialVersion.current = committed.configVersion; currentForm.current = draft; setForm(draft); guard.setDirty(JSON.stringify(draft) !== baseline.current)
    setBoundResources(previous => [...previous.filter(resource => resource.id !== receipt.resource!.id), receipt.resource!])
    try { await onSaved(); setBoundResources([]) } catch { setBindingNotice('技能绑定已提交，列表刷新未完成；请重新打开员工配置核对。') }
  }
  const availableResources = [...new Map([...boundResources, ...snapshot.resources].map(resource => [resource.id, resource])).values()]
  const openResource = resourceNavigation ? (target: EmployeeResourceTarget) => {
    if (!active || locked) return
    guard.navigate(() => { onClose(); resourceNavigation(target) }, { resetOnDiscard: false })
  } : undefined
  const allowTaskOnly = !core && !form.skillIds.length && !form.knowledgeIds.length && !form.sourceIds?.length && !form.allowCommands && !snapshot.conversations.some(conversation => conversation.kind === 'group' && agent && conversation.agentIds.includes(agent.id))
  const modelReady = agentModelSelectionReady(form, snapshot.connections, profiles, allowTaskOnly)
  const readCommittedConfiguration = async () => {
    if (!agent) return
    try {
      const current = (await api.request('snapshot', undefined)).agents.find(item => item.id === agent.id)
      setCheckedAgent(current ?? null)
      setSaveCheckNotice(current ? `已读取当前配置版本 ${current.configVersion}；本次编辑基于版本 ${initialVersion.current}。${current.configVersion !== initialVersion.current ? '配置版本已经变化。' : '版本未变也不作为本次保存的请求回执。'}当前草稿保留，请核对后载入已提交配置。` : '员工已不在当前资料中。当前草稿保留，不再提交旧配置。')
    } catch (reason) { setCheckedAgent(null); setSaveCheckNotice(`当前配置核对失败：${errorText(reason)}。当前草稿保留，尚未确认保存结果。`) }
  }
  const loadCommittedConfiguration = () => {
    if (!checkedAgent) return
    guard.navigate(() => {
      const updated = savedAgentForm(checkedAgent)
      initialVersion.current = checkedAgent.configVersion; baseline.current = JSON.stringify(updated); currentForm.current = updated; setForm(updated)
      setSaveUnconfirmed(false); setSaveCheckNotice('已载入当前已提交配置，可在此版本上重新编辑。'); setError(''); guard.setDirty(false)
    }, { resetOnDiscard: false })
  }
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (uploading || bindingLocked || saveUnconfirmed || !modelReady) return
    void run(async () => {
      let committed: DigitalAgent
      try { committed = await api.request('saveAgent', { ...form, expectedConfigVersion: initialVersion.current, name: form.name.trim(), role: form.role.trim(), executionPermission: (form.executionBackend?.kind ?? 'mastra-model') === 'mastra-model' ? core ? undefined : form.executionPermission ?? (commandPermission ? 'full-access' : form.allowCommands ? 'ask' : 'read-only') : ['codex-local', 'claude-local'].includes(form.executionBackend!.kind) ? form.executionPermission : undefined, allowCommands: !core && form.executionBackend?.kind !== 'acp-local' && form.allowCommands }) }
      catch (reason) { if (agent) { setSaveUnconfirmed(true); await readCommittedConfiguration() }; throw reason }
      const updated = savedAgentForm(committed)
      initialVersion.current = committed.configVersion; baseline.current = JSON.stringify(updated); currentForm.current = updated; setForm(updated); guard.setDirty(false)
      try { await onSaved() } catch (reason) { throw new Error(`配置已保存为版本 ${committed.configVersion}，资料刷新失败：${errorText(reason)}。请返回资料重新核对。`) }
      guard.saved(actionsTarget === undefined ? onClose : undefined)
    })
  }
  const identity = <div className="employee-identity-editor">
    <AvatarPicker name={form.name || '新同事'} seed={agent?.id} value={form.avatar} disabled={locked || identityDisabled} onChange={avatar => { if (!identityDisabled) set('avatar', avatar) }} onBusyChange={setUploading} />
    <div className="employee-identity-fields">
      <Input form={formId} required maxLength={80} aria-label={core ? '助手名称' : '员工名称'} className="employee-identity-name" disabled={locked || identityDisabled} value={form.name} onChange={event => { if (!identityDisabled) set('name', event.target.value) }} placeholder={core ? '助手名称' : '员工姓名'} />
      <Input form={formId} maxLength={300} aria-label="员工职责" className="employee-identity-role" disabled={locked || identityDisabled} value={form.role} onChange={event => { if (!identityDisabled) set('role', event.target.value) }} placeholder="一句话描述擅长的工作" />
    </div>
  </div>
  const commandPermission = snapshot.commandPermissions?.find(permission => permission.agentId === agent?.id)
  const saveAction = <Button type="submit" form={formId} disabled={locked || identityDisabled || !form.name.trim() || !modelReady}>{busy && <LoaderCircle size={15} className="spinner" />}{actionsTarget !== undefined ? '保存' : agent ? '保存修改' : '创建员工'}</Button>
  const actions = actionsTarget === undefined ? <><Button variant="secondary" disabled={busy || uploading} onClick={() => guard.navigate(onClose)}>取消</Button>{saveAction}</> : undefined
  return <>{identityTarget && createPortal(identity, identityTarget)}{actionsTarget && createPortal(saveAction, actionsTarget)}{actions && !configurationVisible && footerTarget && (dirty || busy || uploading) && createPortal(<footer className="editor-footer">{actions}</footer>, footerTarget)}<EditorFrame leading={identityTarget === undefined ? <div className="employee-identity">{identity}</div> : undefined} footer={actions}>
    <form data-edit-form={configurationVisible || dirty ? true : undefined} id={formId} onSubmit={submit} className="form-grid employee-form-sections">
      {error && <div className="full"><Banner>{error}</Banner></div>}
      {bindingNotice && <div className="full"><Banner kind="notice">{bindingNotice}</Banner></div>}
      {saveCheckNotice && <div className="full"><Banner kind="notice">{saveCheckNotice}</Banner>{saveUnconfirmed && <div className="button-row"><Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { void run(readCommittedConfiguration) }}>重新核对配置</Button>{checkedAgent && <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={loadCommittedConfiguration}>载入已提交配置</Button>}</div>}</div>}
      <fieldset className="contents" disabled={locked}>
      <EmployeeFormSection title="模型与权限">
      <AgentModelFields api={api} value={form} connections={snapshot.connections} profiles={profiles} profileError={profileError} allowTaskOnly={allowTaskOnly} disabled={locked} full onChange={selection => { if (!locked) setForm(current => ({ ...current, ...selection })) }} />
      {!core && (form.executionBackend?.kind ?? 'mastra-model') === 'mastra-model' && <AgentPermissionField value={form.executionPermission ?? (commandPermission ? 'full-access' : form.allowCommands ? 'ask' : 'read-only')} onChange={executionPermission => { if (!locked) setForm(current => ({ ...current, executionPermission, allowCommands: executionPermission !== 'read-only' })) }} disabled={locked} full />}
      </EmployeeFormSection>
      <ContactProfileSection title="工作方式"><Textarea aria-label="工作方式" className="py-1.5 text-[12px] leading-[18px] md:text-[12px]" rows={5} maxLength={64000} value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="你是一位……请按照这些规则工作。" /></ContactProfileSection>
      </fieldset>
      {(form.executionBackend?.kind!=='acp-local')&&<><EmployeeFormSection title="技能"><div className="field full"><fieldset className="contents" disabled={locked}><ResourcePicker resources={availableResources.filter(item => item.kind === 'skill' && (!item.ownerAgentId || item.ownerAgentId === agent?.id))} selected={form.skillIds} onChange={ids => set('skillIds', ids)} onOpen={openResource && (resource => openResource({ kind: 'resource', id: resource.id, name: resource.name }))} empty="还没有绑定技能，可从本机技能选择。" /></fieldset>{agent ? <LocalSkillBinding key={`${scope}:${agent.id}`} api={api} agent={agent} scope={scope} active={active && configurationVisible} expectedConfigVersion={initialVersion.current ?? agent.configVersion} configurationBusy={busy || uploading || saveUnconfirmed} onPendingChange={setBindingLocked} onBound={bindingCommitted} /> : <><Button type="button" variant="secondary" size="sm" disabled>从本机技能选择</Button><p className="field-hint">请先保存员工配置，再绑定本机技能。</p></>}</div></EmployeeFormSection>
      <fieldset className="contents" disabled={locked}>
      <EmployeeFormSection title="数据源"><SourcePicker api={api} ids={form.sourceIds ?? []} onChange={ids => set('sourceIds', ids)} onOpen={openResource && (source => openResource({ kind: 'source', id: source.id, name: source.name }))} disabled={locked} active={active && configurationVisible} allSources={core} showLabel={false} /></EmployeeFormSection>
      <EmployeeFormSection title="知识资料"><div className="field full"><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'knowledge' && !item.ownerAgentId)} selected={form.knowledgeIds} onChange={ids => set('knowledgeIds', ids)} onOpen={openResource && (resource => openResource({ kind: 'resource', id: resource.id, name: resource.name }))} empty="还没有知识资料。" /></div></EmployeeFormSection>
      </fieldset>
      </>}
    </form>
  </EditorFrame></>
}

type GroupEditorProps = { active?: boolean; onConversation?(id: string, messageId?: string): void; onOpenAgent?(id: string): void; api: DesktopApi; snapshot: Snapshot; conversation?: Conversation; onClose: () => void; onSaved: (conversation: Conversation) => Promise<void>; onDeleted?: () => Promise<void>; actionsTarget?: HTMLElement | null; onBusyChange?(busy: boolean): void }
export function GroupEditor(props: GroupEditorProps) {
  const [tab, setTab] = useState('profile'), guard = useContext(GuardContext)
  const group = props.conversation
  if (!group || group.channel || group.purpose && group.purpose !== 'personal' || !props.onConversation) return <GroupConfiguration {...props} />
  return <Tabs value={tab} onValueChange={value => guard.navigate(() => setTab(value), { resetOnDiscard: false })}>
    <TabsList aria-label="群聊详情分类"><TabsTrigger value="profile">配置</TabsTrigger><TabsTrigger value="automations">自动化</TabsTrigger></TabsList>
    <TabsContent value="profile"><GroupConfiguration {...props} /></TabsContent>
    <TabsContent value="automations"><OwnerAutomations api={props.api} snapshot={props.snapshot} owner={{ kind: 'group', conversationId: group.id }} active={props.active !== false && tab === 'automations'} onConversation={props.onConversation} /></TabsContent>
  </Tabs>
}
function GroupConfiguration({ api, snapshot, conversation, onClose, onSaved, onDeleted, onOpenAgent, actionsTarget, onBusyChange }: GroupEditorProps) {
  const formId = useId()
  const initialVersion = useRef(conversation?.configVersion)
  const [title, setTitle] = useState(conversation?.title ?? '')
  const [ids, setIds] = useState(conversation?.agentIds ?? [])
  const [knowledge, setKnowledge] = useState(conversation?.sharedKnowledgeIds ?? [])
  const [teamSetup, setTeamSetup] = useState(conversation?.teamSetup ?? null)
  const [memoryScope, setMemoryScope] = useState(conversation?.memoryScope ?? 'employee')
  const [memoryContextId, setMemoryContextId] = useState(conversation?.memoryContextRef?.kind === 'conversation' ? conversation.memoryContextRef.id : '')
  const [dissolving, setDissolving] = useState(false)
  const { busy, error, run, setError } = useMutation()
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  const guard = useContext(GuardContext)
  const clean = useDirty({ title, ids, knowledge, teamSetup, memoryScope, memoryContextId })
  const closeDissolve = () => { if (!busy) { setDissolving(false); setError('') } }
  const dissolve = () => {
    if (!conversation) return
    void run(async () => {
      await api.request('deleteConversation', { id: conversation.id })
      clean()
      await onDeleted?.()
      setDissolving(false)
      guard.saved(onClose)
    })
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void run(async () => { const result = await api.request('createConversation', { id: conversation?.id, expectedConfigVersion: initialVersion.current, title: title.trim(), kind: 'group', agentIds: ids, mode: 'natural', sharedKnowledgeIds: knowledge, memoryScope, memoryContextRef: memoryContextId ? { kind: 'conversation', id: memoryContextId } : null, ...(conversation?.teamSetup ? { teamSetup } : {}) }); initialVersion.current = result.configVersion; clean(); await onSaved(result); guard.saved(actionsTarget === undefined ? onClose : undefined) }) }
  const saveAction = <Button type="submit" form={formId} disabled={busy || !title.trim() || ids.length < 1 || ids.length > 12}>{busy && <LoaderCircle size={15} className="spinner" />}{actionsTarget !== undefined ? '保存' : conversation ? '保存设置' : '创建群聊'}</Button>
  const dissolveAction = conversation && <Button type="button" variant="destructive" disabled={busy} onClick={() => { setError(''); setDissolving(true) }}>解散群聊</Button>
  return <>{actionsTarget && createPortal(saveAction, actionsTarget)}<EditorFrame leading={<GroupMembers agents={snapshot.agents.filter(agent => !isCoreAgent(agent) || conversation?.creationSource?.kind === 'bobo-collaboration' && conversation.agentIds.includes(agent.id))} ids={ids} disabled={busy} onChange={setIds} onOpenAgent={onOpenAgent} />} footer={actionsTarget === undefined ? <>{dissolveAction}<Button variant="secondary" disabled={busy} onClick={() => guard.navigate(onClose)}>取消</Button>{saveAction}</> : undefined}>
    <form data-edit-form id={formId} className="form-grid" onSubmit={submit}>
      {error && <div className="full"><Banner>{error}</Banner></div>}
      <Field label="群聊名称" full><Input required value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：我的内容工作室" /></Field>
      <Field label="新交流的记忆范围" full hint="收紧立即生效；放宽后只有新交流使用新范围，旧记录不自动升级。"><SelectField value={memoryScope} onValueChange={value => setMemoryScope(value as 'employee' | 'conversation')} options={[{ value: 'employee', label: '各员工在相关聊天中使用' }, { value: 'conversation', label: '仅在此聊天使用' }]} /></Field>
      <Field label="关联事项（可选）" full hint="明确关联已有聊天中的临时约定，同名聊天不会自动关联。"><SelectField value={memoryContextId} onValueChange={setMemoryContextId} options={[{ value: '', label: '不关联' }, ...snapshot.conversations.filter(c => c.id !== conversation?.id && ids.every(id => c.agentIds.includes(id))).map(c => ({ value: c.id, label: c.title }))]} /></Field>

      {teamSetup && <>
        <Field label="团队目的" full><Textarea required maxLength={1000} value={teamSetup.purpose} onChange={e => setTeamSetup({ ...teamSetup, purpose: e.target.value })} /></Field>
        <Field label="协作建议" hint="这是背景建议，不改变发言调度或工具权限" full><Textarea maxLength={2000} value={teamSetup.collaborationGuide} onChange={e => setTeamSetup({ ...teamSetup, collaborationGuide: e.target.value })} /></Field>
        <Button type="button" variant="outline" onClick={() => setTeamSetup(null)}>移除团队背景</Button>
      </>}
      <div className="field full"><span className="field-label">群内共享知识</span><p className="field-hint">只有明确共享的资料才可用于这个群的任务。员工私聊不会自动加入群上下文。</p><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'knowledge' && !item.ownerAgentId)} selected={knowledge} onChange={setKnowledge} empty="还没有可共享的知识资料。" /></div>
      {actionsTarget !== undefined && dissolveAction && <div className="full">{dissolveAction}</div>}
    </form>
  </EditorFrame><AlertDialog open={dissolving} onOpenChange={open => { if (!open) closeDissolve() }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>解散群聊？</AlertDialogTitle><AlertDialogDescription>将永久删除“{conversation?.title}”及其聊天记录、任务记录、会话记忆和群聊专属空间，无法恢复。群内员工及各自工作区保留，未保存的群配置将丢弃。</AlertDialogDescription></AlertDialogHeader>
      {error && <Banner>{error}</Banner>}
      <AlertDialogFooter><Button variant="secondary" disabled={busy} onClick={closeDissolve}>取消</Button><Button variant="destructive" disabled={busy} onClick={dissolve}>{busy ? '正在解散…' : '确认解散'}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></>
}

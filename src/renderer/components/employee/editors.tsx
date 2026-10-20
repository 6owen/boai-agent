/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [OUTPUT]: 工作区目录添加/按需申请与载入操作放在分区标题右侧，目录分区取消/保存使用ghost/sm；原草稿和版本检查保持。
 * [OUTPUT]: 网页检索分区仅选择员工检索方式，标题说明指向全局检索设置，不显示服务配置或授权列表。
 * [OUTPUT]: 核心员工可通过共用执行权限字段保存命令能力，不再强制关闭。
 * [OUTPUT]: 2026-10-19 网页检索作为独立分区保存偏好与可用服务；数据源分区只编辑业务绑定。
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: 检索偏好沿员工草稿保存；主动解绑同次重置，旧缺省不因身份编辑补写。
 * [OUTPUT]: 知识资料配置收敛为数量/文件区入口；导航走原草稿守卫，独立知识绑定回填版本时保留其他未保存字段。
 * [OUTPUT]: 员工授权目录沿原配置草稿保存；运行中新增的持久授权独立版本回填，不覆盖其他未保存字段。
 * [OUTPUT]: 群配置与资料页共用字段和保存载荷，成员头像/添加打开同一双栏选择器，原高级配置基础分类保留。
 * [OUTPUT]: 单独发布身份自动保存的待提交/请求/头像上传状态，页面操作锁与外观反馈解耦，普通配置保存保持。
 * [OUTPUT]: 资料页身份自动保存直接发布已提交员工回执，不调用全量资料刷新；其他配置保存/未知核对保持。
 * [OUTPUT]: 资料页身份复用原h1/描述排版和64px头像，使用纯文本contenteditable失焦保存；不渲染空身份表单占位，创建/弹窗输入框保持。
 * [OUTPUT]: 资料页身份输入失焦/头像选择自动保存，共用单个版本化草稿；仅提交身份字段，保留其他分区及保存期间新输入，失败沿原未知核对。
 * [OUTPUT]: 员工基础配置支持资料页按分区就地编辑，标题右侧保存/取消复用原版本化提交、技能回执及未知核对；非模型分区保存保留原权限。
 * [OUTPUT]: 群成员下方配置复用员工分区Card与横向设置行，群聊设置/团队背景/共享知识独立分区，说明沿Tooltip及原保存载荷保持。
 * [OUTPUT]: 员工组配置支持与员工一致的左侧基础配置/自动化菜单及右侧渐隐滚动，保存忙时禁切分类；默认顶部导航及原草稿、成员和解散边界保持。
 * [OUTPUT]: 技能/数据源添加入口固定在分区标题右侧，Card仅承载已有绑定；技能无绑定时不显示空Card。
 * [OUTPUT]: 技能更多菜单红色移除经Popover确认；选择器关闭/重选已有技能更新原草稿，新增绑定更新基线/版本并保留草稿，不插入状态提示DOM。
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
 * [OUTPUT]: Core command availability follows the same saved execution permission as other employees.
 * [INPUT]: 员工与群领域类型、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 已发布 bobo 协作群编辑保留现有核心成员，普通手动建群不能新添 bobo。
 * [OUTPUT]: Mastra 员工/bobo 默认浏览器可用，表单不展示开关或要求先保存再启用；ACP支持边界由共享能力判断；已保存员工的明确本机技能绑定、草稿先保存、未决请求门禁及真实回执配置/版本同步；员工配置固定启用且不展示开关；核心助手可改名及设置默认模型，提供API/本机Codex后端且隐藏命令开关，并排除群候选；既有群配置可确认解散及清理记录/群空间，刷新后丢弃编辑草稿并关闭；新交流记忆范围和可选事项关联；既有团队群的目的/建议编辑、删除和版本保存；下拉字段统一使用 shadcn Select；独立表单 ID 支持多个详情标签同时挂载。
 * [OUTPUT]: 知识空态不再引导进入已删除的资料库页面，既有知识绑定保持。
 * [OUTPUT]: 既有员工配置保存响应失败后只读核对当前配置，保留草稿与原预期版本；显式载入已提交配置后再编辑，不伪造请求回执或自动重试保存。
 * [POS]: src/renderer/components/employee/editors.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { EmployeeWebSearchFields, employeeWebSearchHint } from './web-search'
import { SourcePicker } from '@/pages/sources/source-picker'
import { ConnectionSettingRow } from '@/pages/settings/connection-layout'
import { OwnerAutomations } from '@/pages/schedules/owner-automations'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog'
import type { LaunchProfile } from '@shared/domain'
import { useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, FileText, LoaderCircle, Search, Settings, ShieldCheck } from '@/components/icons/index'
import type { AgentInput, Conversation, DigitalAgent, Resource, Snapshot } from '@shared/domain'
import type { BindLocalSkillInput, SkillBindingReceipt } from '@shared/domain/skills'
import { isCoreAgent } from '@shared/domain/core-agent'
import type { DesktopApi } from '@shared/ipc'
import { Banner, colors, EditorFrame, errorText, GuardContext, ResourcePicker, showErrorToast, useDirty, useMutation } from '@/components/common/index'
import { toast } from 'sonner'
import { GroupConfigurationFields, groupConfigurationInput } from './group-configuration-fields'
import { GroupMembers } from './group-members'
import { DirectoryGrantFields } from './directory-grants'
import { AvatarPicker } from './avatar-picker'
import { ProfileText } from './profile-text'
import { AgentModelFields, agentModelSelectionReady } from './agent-model-fields'
import { AgentPermissionField } from './agent-permission-field'
import { LocalSkillBinding } from './local-skill-binding'
import { BoundSkillList } from './bound-skill-list'
import { committedSkillBindingAgent, mergeSkillBindingDraft } from './local-skill-binding-state'
import { EmployeeResourceNavigation, type EmployeeResourceTarget } from './resource-navigation'
import { ContactProfileSection, EmployeeFormSection } from './profile-card'
export const templates = [
  { name: '资料研究员', role: '查找资料，厘清事实', instructions: '你是一位细致的资料研究员。区分事实与推测，提供可追踪的来源。', icon: Search, color: colors[0] },
  { name: '方案写手', role: '把想法写成清晰方案', instructions: '你是一位方案写手。理解目标与受众，基于获准资料撰写清楚自然的内容。', icon: FileText, color: colors[1] },
  { name: '内容审核员', role: '检查逻辑，打磨细节', instructions: '你是一位内容审核员。核对事实、来源、逻辑与表达，给出具体修改建议。', icon: ShieldCheck, color: colors[2] },
]
function savedAgentForm(agent: DigitalAgent): AgentInput { return { webSearch: agent.webSearch, directoryGrants: agent.directoryGrants, expectedDirectoryRevision: agent.directoryRevision, executionPermission: agent.executionPermission, avatar: agent.avatar, executionBackend: agent.executionBackend, nativeOptions: agent.nativeOptions, id: agent.id, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, sourceIds: [...(agent.sourceIds ?? [])], skillIds: [...agent.skillIds], knowledgeIds: [...agent.knowledgeIds], allowCommands: agent.allowCommands, active: true } }
export type AgentConfigurationSection = 'identity' | 'model' | 'instructions' | 'skills' | 'sources' | 'knowledge' | 'directories' | 'web-search'
export function AgentEditor({ api, snapshot, agent, template, onClose, onSaved, onIdentitySaved, active = true, scope = 'creation', section, inlineIdentity = false, identityTarget, sectionTarget, footerTarget, actionsTarget, configurationVisible = true, identityDisabled = false, onDirtyChange, onRevealConfiguration, onBusyChange, onIdentityBusyChange }: { api: DesktopApi; snapshot: Snapshot; agent?: DigitalAgent; template?: number; onClose: () => void; onSaved: () => Promise<void>; onIdentitySaved?(agent: DigitalAgent): void; active?: boolean; scope?: string; section?: AgentConfigurationSection; inlineIdentity?: boolean; identityTarget?: HTMLElement | null; sectionTarget?: HTMLElement | null; footerTarget?: HTMLElement | null; actionsTarget?: HTMLElement | null; configurationVisible?: boolean; identityDisabled?: boolean; onDirtyChange?(dirty: boolean): void; onRevealConfiguration?(): void; onBusyChange?(busy: boolean): void; onIdentityBusyChange?(busy: boolean): void }) {
  const core = isCoreAgent(agent)
  const formId = useId()
  const [uploading, setUploading] = useState(false), [choosingDirectory, setChoosingDirectory] = useState(false)
  const [identityPending, setIdentityPending] = useState(false), [identitySaving, setIdentitySaving] = useState(false)
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]), [profileError, setProfileError] = useState('')
  useEffect(() => {
    if (!active || section && section !== 'model') return
    let current = true
    void api.request('listLaunchProfiles', undefined).then(value => { if (current) { setProfiles(value); setProfileError('') } }, () => { if (current) setProfileError('本机连接读取失败，请重新打开员工配置。') })
    return () => { current = false }
  }, [api, active, section])
  const initialVersion = useRef(agent?.configVersion)
  const preset = template === undefined ? undefined : templates[template]
  const [form, setForm] = useState<AgentInput>(() => {
    if (agent) return savedAgentForm(agent)
    return { name: preset?.name ?? '', role: preset?.role ?? '', instructions: preset?.instructions ?? '', color: preset?.color ?? colors[0], connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: true, active: true }
  })
  const { busy, error, run, setError } = useMutation()
  const guard = useContext(GuardContext)
  const resourceNavigation = useContext(EmployeeResourceNavigation)
  const [bindingLocked, setBindingLocked] = useState(false), [boundResources, setBoundResources] = useState<Resource[]>([])
  const [saveUnconfirmed, setSaveUnconfirmed] = useState(false), [checkedAgent, setCheckedAgent] = useState<DigitalAgent | null>(null)
  const baseline = useRef(JSON.stringify(form)), currentForm = useRef(form); currentForm.current = form
  const dirty = JSON.stringify(form) !== baseline.current
  const locked = busy || uploading || choosingDirectory || bindingLocked || saveUnconfirmed
  useEffect(() => { onBusyChange?.(busy || identityPending || uploading || choosingDirectory || Boolean(section && bindingLocked)); return () => onBusyChange?.(false) }, [busy, identityPending, uploading, choosingDirectory, section, bindingLocked, onBusyChange])
  useEffect(() => { onIdentityBusyChange?.(inlineIdentity && (identityPending || identitySaving || uploading)); return () => onIdentityBusyChange?.(false) }, [inlineIdentity, identityPending, identitySaving, uploading, onIdentityBusyChange])
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
  useEffect(() => {
    if (!agent || locked || agent.configVersion <= (initialVersion.current ?? 0)) return
    const previous = JSON.parse(baseline.current) as AgentInput, updated = savedAgentForm(agent)
    if (Object.keys(updated).some(key => key !== 'knowledgeIds' && JSON.stringify(updated[key as keyof AgentInput]) !== JSON.stringify(previous[key as keyof AgentInput]))) return
    const draft = mergeSkillBindingDraft(previous, currentForm.current, updated)
    draft.knowledgeIds = updated.knowledgeIds
    baseline.current = JSON.stringify(updated); initialVersion.current = agent.configVersion; currentForm.current = draft; setForm(draft)
    guard.setDirty(JSON.stringify(draft) !== baseline.current)
  }, [agent, locked])
  useEffect(() => {
    if (!agent || busy || choosingDirectory || bindingLocked || saveUnconfirmed || agent.configVersion !== initialVersion.current) return
    const previous = JSON.parse(baseline.current) as AgentInput
    if ((agent.directoryRevision ?? 0) <= (previous.expectedDirectoryRevision ?? 0)) return
    const directoryDirty = JSON.stringify(currentForm.current.directoryGrants) !== JSON.stringify(previous.directoryGrants)
    if (directoryDirty) return
    const authorization = { directoryGrants: agent.directoryGrants, expectedDirectoryRevision: agent.directoryRevision }
    baseline.current = JSON.stringify({ ...previous, ...authorization })
    const updated = { ...currentForm.current, ...authorization }; currentForm.current = updated; setForm(updated)
  }, [agent, busy, choosingDirectory, bindingLocked, saveUnconfirmed])
  const bindingCommitted = async (receipt: SkillBindingReceipt, input: BindLocalSkillInput) => {
    const committed = committedSkillBindingAgent(input, receipt, agent)
    if (!committed || !receipt.resource) throw new Error('已完成回执没有可核对的员工绑定，请保留原请求核对。')
    const updated = savedAgentForm(committed)
    const draft = mergeSkillBindingDraft(JSON.parse(baseline.current) as AgentInput, currentForm.current, updated)
    if (committed.skillIds.includes(receipt.resource.id) && !draft.skillIds.includes(receipt.resource.id)) draft.skillIds.push(receipt.resource.id)
    baseline.current = JSON.stringify(updated); initialVersion.current = committed.configVersion; currentForm.current = draft; setForm(draft); guard.setDirty(JSON.stringify(draft) !== baseline.current)
    setBoundResources(previous => [...previous.filter(resource => resource.id !== receipt.resource!.id), receipt.resource!])
    try { await onSaved() } catch { showErrorToast('技能绑定已提交，列表刷新未完成；请重新打开员工配置核对。') }
  }
  const availableResources = [...new Map([...boundResources, ...snapshot.resources].map(resource => [resource.id, resource])).values()]
  const openResource = resourceNavigation ? (target: EmployeeResourceTarget) => {
    if (!active || locked) return
    guard.navigate(() => { onClose(); resourceNavigation(target) }, { resetOnDiscard: false })
  } : undefined
  const allowTaskOnly = !core && !form.skillIds.length && !form.knowledgeIds.length && !form.sourceIds?.length && !form.allowCommands && !snapshot.conversations.some(conversation => conversation.kind === 'group' && agent && conversation.agentIds.includes(agent.id))
  const modelReady = Boolean(section && section !== 'model') || agentModelSelectionReady(form, snapshot.connections, profiles, allowTaskOnly)
  const readCommittedConfiguration = async () => {
    if (!agent) return
    try {
      const current = (await api.request('snapshot', undefined)).agents.find(item => item.id === agent.id)
      setCheckedAgent(current ?? null)
      toast.message(current ? `已读取当前配置版本 ${current.configVersion}；本次编辑基于版本 ${initialVersion.current}。${current.configVersion !== initialVersion.current ? '配置版本已经变化。' : '版本未变也不作为本次保存的请求回执。'}当前草稿保留，请核对后载入已提交配置。` : '员工已不在当前资料中。当前草稿保留，不再提交旧配置。')
    } catch (reason) { setCheckedAgent(null); showErrorToast(`当前配置核对失败：${errorText(reason)}。当前草稿保留，尚未确认保存结果。`) }
  }
  const loadCommittedConfiguration = () => {
    if (!checkedAgent) return
    guard.navigate(() => {
      const updated = savedAgentForm(checkedAgent)
      initialVersion.current = checkedAgent.configVersion; baseline.current = JSON.stringify(updated); currentForm.current = updated; setForm(updated)
      setSaveUnconfirmed(false); setError(''); guard.setDirty(false)
    }, { resetOnDiscard: false })
  }
  const save = async (identityOnly = false) => {
    if (busy || uploading || choosingDirectory || bindingLocked || saveUnconfirmed || !active || (identityOnly ? identityDisabled : !modelReady)) return
    const previous = JSON.parse(baseline.current) as AgentInput
    const submitted = identityOnly ? { ...previous, name: form.name, role: form.role, avatar: form.avatar } : form
    if (identityOnly && !submitted.name.trim()) { showErrorToast('请输入员工名称。'); return }
    if (identityOnly && JSON.stringify(submitted) === baseline.current) return
    if (identityOnly) setIdentitySaving(true)
    await run(async () => {
      let committed: DigitalAgent
      try { committed = await api.request('saveAgent', { ...submitted, expectedConfigVersion: initialVersion.current, name: submitted.name.trim(), role: submitted.role.trim(), ...(identityOnly || section && section !== 'model' ? {} : { executionPermission: (form.executionBackend?.kind ?? 'mastra-model') === 'mastra-model' ? core ? form.executionPermission : form.executionPermission ?? (commandPermission ? 'full-access' : form.allowCommands ? 'ask' : 'read-only') : ['codex-local', 'claude-local'].includes(form.executionBackend!.kind) ? form.executionPermission : undefined, allowCommands: form.executionBackend?.kind !== 'acp-local' && form.allowCommands }) }) }
      catch (reason) { setIdentityPending(false); if (agent) { setSaveUnconfirmed(true); await readCommittedConfiguration() }; throw reason }
      const updated = savedAgentForm(committed)
      // Identity saves must not submit or erase another section's draft, including new typing during the request.
      const changes = identityOnly ? Object.fromEntries(Object.entries(currentForm.current).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(submitted[key as keyof AgentInput]))) : {}
      const draft = { ...updated, ...changes }
      initialVersion.current = committed.configVersion; baseline.current = JSON.stringify(updated); currentForm.current = draft; setForm(draft); guard.setDirty(JSON.stringify(draft) !== baseline.current)
      try { if (identityOnly && onIdentitySaved) onIdentitySaved(committed); else await onSaved() } catch (reason) { throw new Error(`配置已保存为版本 ${committed.configVersion}，资料刷新失败：${errorText(reason)}。请返回资料重新核对。`) }
      if (!identityOnly) guard.saved(actionsTarget === undefined ? onClose : undefined)
    })
    if (identityOnly) setIdentitySaving(false)
  }
  useEffect(() => {
    if (!inlineIdentity || !identityPending || busy || uploading || bindingLocked || saveUnconfirmed || !active || identityDisabled) return
    setIdentityPending(false)
    void save(true)
  })
  const submit = (event: FormEvent) => { event.preventDefault(); void save(inlineIdentity && section === 'identity') }
  const identityLocked = inlineIdentity ? identityDisabled || uploading || bindingLocked || saveUnconfirmed || busy && !identitySaving : locked || identityDisabled
  const setIdentity = <K extends 'name' | 'role' | 'avatar'>(key: K, value: AgentInput[K]) => {
    if (identityLocked) return
    setForm(current => ({ ...current, [key]: value }))
    if (inlineIdentity && key === 'avatar') setIdentityPending(true)
  }
  const identityBlur = inlineIdentity ? () => {
    if (identityDisabled || saveUnconfirmed) return
    const saved = JSON.parse(baseline.current) as AgentInput
    if ((['name', 'role', 'avatar'] as const).some(key => JSON.stringify(form[key]) !== JSON.stringify(saved[key]))) setIdentityPending(true)
  } : undefined
  const avatarPicker = <AvatarPicker name={form.name || '新同事'} seed={agent?.id} value={form.avatar} disabled={identityLocked} onChange={avatar => setIdentity('avatar', avatar)} onBusyChange={setUploading} />
  const identity = inlineIdentity ? <>
    {avatarPicker}
    <div className="contact-profile-identity">
      <ProfileText as="h1" label={core ? '助手名称' : '员工名称'} value={form.name} placeholder={core ? '助手名称' : '员工姓名'} maxLength={80} disabled={identityLocked} onChange={value => setIdentity('name', value)} onBlur={identityBlur} />
      <ProfileText as="p" label="员工职责" value={form.role} placeholder="数字员工" maxLength={300} disabled={identityLocked} onChange={value => setIdentity('role', value)} onBlur={identityBlur} />
    </div>
  </> : <div className="employee-identity-editor">
    {avatarPicker}
    <div className="employee-identity-fields">
      <Input form={formId} required maxLength={80} aria-label={core ? '助手名称' : '员工名称'} className="employee-identity-name" disabled={identityLocked} value={form.name} onChange={event => setIdentity('name', event.target.value)} onBlur={identityBlur} onKeyDown={inlineIdentity ? event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur() } } : undefined} placeholder={core ? '助手名称' : '员工姓名'} />
      <Input form={formId} maxLength={300} aria-label="员工职责" className="employee-identity-role" disabled={identityLocked} value={form.role} onChange={event => setIdentity('role', event.target.value)} onBlur={identityBlur} onKeyDown={inlineIdentity ? event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur() } } : undefined} placeholder="一句话描述擅长的工作" />
    </div>
  </div>
  const commandPermission = snapshot.commandPermissions?.find(permission => permission.agentId === agent?.id)
  const saveAction = <Button type="submit" variant={section === 'directories' ? 'ghost' : 'default'} size={section ? 'sm' : 'default'} form={formId} disabled={locked || identityDisabled || !form.name.trim() || !modelReady}>{busy && <LoaderCircle size={15} className="spinner" />}{section || actionsTarget !== undefined ? '保存' : agent ? '保存修改' : '创建员工'}</Button>
  const actions = actionsTarget === undefined ? <><Button type="button" size={section ? 'sm' : 'default'} variant={section === 'directories' ? 'ghost' : 'secondary'} disabled={busy || uploading || choosingDirectory || Boolean(section && bindingLocked)} onClick={() => guard.navigate(onClose, section ? { resetOnDiscard: false } : undefined)}>取消</Button>{saveAction}</> : undefined
  const inlineActions = section ? <div className="flex items-center gap-2">{actions}</div> : undefined
  const visible = (key: AgentConfigurationSection) => !section || section === key
  const content = <form data-edit-form={dirty || configurationVisible && (!inlineIdentity || section !== 'identity') ? true : undefined} id={formId} onSubmit={submit} className="form-grid employee-form-sections">
      {error && <div className="full"><Banner>{error}</Banner></div>}
      {saveUnconfirmed && <div className="button-row full"><Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { void run(readCommittedConfiguration) }}>重新核对配置</Button>{checkedAgent && <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={loadCommittedConfiguration}>载入已提交配置</Button>}</div>}
      <fieldset className="contents" disabled={locked}>
      {visible('model') && <EmployeeFormSection title="模型与权限" actions={inlineActions}>
      <AgentModelFields api={api} value={form} connections={snapshot.connections} profiles={profiles} profileError={profileError} allowTaskOnly={allowTaskOnly} disabled={locked} full onChange={selection => { if (!locked) setForm(current => ({ ...current, ...selection })) }} />
      {(form.executionBackend?.kind ?? 'mastra-model') === 'mastra-model' && <AgentPermissionField value={core ? form.executionPermission : form.executionPermission ?? (commandPermission ? 'full-access' : form.allowCommands ? 'ask' : 'read-only')} onChange={executionPermission => { if (!locked) setForm(current => ({ ...current, executionPermission, allowCommands: executionPermission !== 'read-only' })) }} disabled={locked} full />}
      </EmployeeFormSection>}
      {visible('directories') && ((form.executionBackend?.kind ?? 'mastra-model') === 'mastra-model' ? <DirectoryGrantFields api={api} value={form.directoryGrants} fullAccess={form.executionPermission === 'full-access'} disabled={locked} onBusyChange={setChoosingDirectory} onChange={directoryGrants => setForm(current => ({ ...current, directoryGrants }))} renderSection={(content, directoryActions) => <EmployeeFormSection title="授权目录" actions={<div className="flex flex-wrap items-center gap-2">{directoryActions}
        {agent && (agent.directoryRevision ?? 0) > (form.expectedDirectoryRevision ?? 0) && <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => {
          const authorization = { directoryGrants: agent.directoryGrants, expectedDirectoryRevision: agent.directoryRevision }
          baseline.current = JSON.stringify({ ...JSON.parse(baseline.current), ...authorization })
          setForm(current => ({ ...current, ...authorization }))
        }}>载入已批准目录，保留其他草稿</Button>}{inlineActions}</div>}>{content}</EmployeeFormSection>} /> : <EmployeeFormSection title="目录访问"><p className="field-hint">本机 Agent 使用自身的目录、工具和审批配置，BOAI 不额外限制。</p></EmployeeFormSection>)}
      {visible('instructions') && <ContactProfileSection title="工作方式" actions={inlineActions}><Textarea aria-label="工作方式" className="py-1.5 text-[length:var(--text-ui-secondary)] leading-[var(--leading-ui-body)] md:text-[length:var(--text-ui-secondary)]" rows={5} maxLength={64000} value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="你是一位……请按照这些规则工作。" /></ContactProfileSection>}
      </fieldset>
      {(form.executionBackend?.kind!=='acp-local')&&<>{visible('skills') && <EmployeeFormSection title="技能" actions={<div className="flex flex-wrap items-center gap-2">{agent ? <LocalSkillBinding key={`${scope}:${agent.id}`} api={api} agent={agent} resources={availableResources} skillIds={form.skillIds} scope={scope} active={active && configurationVisible} expectedConfigVersion={initialVersion.current ?? agent.configVersion} configurationBusy={busy || uploading || saveUnconfirmed} onPendingChange={setBindingLocked} onBound={bindingCommitted} onChange={ids => set('skillIds', ids)} /> : <Button type="button" variant="secondary" size="sm" disabled>从本机技能选择</Button>}{inlineActions}</div>}>
        {form.skillIds.length > 0 && <div className="field full">
        <BoundSkillList resources={availableResources.filter(item => item.kind === 'skill' && (!item.ownerAgentId || item.ownerAgentId === agent?.id))} ids={form.skillIds} disabled={locked} onRemove={id => set('skillIds', form.skillIds.filter(value => value !== id))} onOpen={openResource && (resource => openResource({ kind: 'resource', id: resource.id, name: resource.name }))} />
        </div>}
      </EmployeeFormSection>}
      <fieldset className="contents" disabled={locked}>
      {visible('web-search') && <EmployeeFormSection title="网页检索" hint={employeeWebSearchHint} actions={inlineActions}><EmployeeWebSearchFields api={api} value={form.webSearch} onChange={value => set('webSearch', value)} disabled={locked} active={active && configurationVisible} /></EmployeeFormSection>}
      {visible('sources') && <SourcePicker api={api} ids={form.sourceIds ?? []} onChange={ids => set('sourceIds', ids)} onOpen={openResource && (source => openResource({ kind: 'source', id: source.id, name: source.name }))} disabled={locked} active={active && configurationVisible} allSources={core} showLabel={false} renderSection={(content, actions) => <EmployeeFormSection title="数据源" actions={<div className="flex flex-wrap items-center gap-2">{actions}{inlineActions}</div>}>{content}</EmployeeFormSection>} />}
      {visible('knowledge') && <EmployeeFormSection title="知识资料">{agent ? <Button type="button" variant="ghost" size="sm" disabled={locked || !openResource} onClick={() => openResource?.({ kind: 'knowledge-files', id: agent.id, name: agent.name })}>知识资料 · {agent.knowledgeIds.length} 份</Button> : <p className="field-hint">保存员工后，在文件区域管理知识资料。</p>}</EmployeeFormSection>}
      </fieldset>
      </>}
    </form>
  return <>{identityTarget && createPortal(identity, identityTarget)}{actionsTarget && createPortal(saveAction, actionsTarget)}{actions && !configurationVisible && footerTarget && (dirty || busy || uploading) && createPortal(<footer className="editor-footer">{actions}</footer>, footerTarget)}{inlineIdentity ? section === 'identity' && !saveUnconfirmed ? null : sectionTarget ? createPortal(content, sectionTarget) : content : <EditorFrame leading={visible('identity') && identityTarget === undefined ? section ? <ContactProfileSection title="基本信息" actions={inlineActions}>{identity}</ContactProfileSection> : <div className="employee-identity">{identity}</div> : undefined} footer={section ? undefined : actions}>{content}</EditorFrame>}</>
}

type GroupEditorProps = { navigation?: 'top' | 'sidebar'; active?: boolean; onConversation?(id: string, messageId?: string): void; onOpenAgent?(id: string): void; api: DesktopApi; snapshot: Snapshot; conversation?: Conversation; onClose: () => void; onSaved: (conversation: Conversation) => Promise<void>; onDeleted?: () => Promise<void>; actionsTarget?: HTMLElement | null; onBusyChange?(busy: boolean): void }
export function GroupEditor(props: GroupEditorProps) {
  const [tab, setTab] = useState('profile'), guard = useContext(GuardContext)
  const [busy, setBusy] = useState(false)
  const { onBusyChange } = props
  const configurationBusyChanged = useCallback((value: boolean) => { setBusy(value); onBusyChange?.(value) }, [onBusyChange])
  const group = props.conversation
  const sidebar = props.navigation === 'sidebar'
  const canAutomate = group && !group.channel && (!group.purpose || group.purpose === 'personal') && props.onConversation
  if (!sidebar && !canAutomate) return <GroupConfiguration {...props} />
  const menu = <TabsList className={sidebar ? 'employee-menu w-full gap-1 p-0' : undefined} aria-label="群聊详情分类">
    <TabsTrigger value="profile" aria-label={sidebar ? '基础配置' : '配置'} disabled={busy} className={sidebar ? 'group-data-vertical/tabs:h-[32px] text-[length:var(--text-ui-secondary)]' : undefined}>{sidebar && <Settings size={14} />}<span className={sidebar ? 'employee-menu-label' : undefined}>{sidebar ? '基础配置' : '配置'}</span></TabsTrigger>
    {canAutomate && <TabsTrigger value="automations" aria-label="自动化" disabled={busy} className={sidebar ? 'group-data-vertical/tabs:h-[32px] text-[length:var(--text-ui-secondary)]' : undefined}>{sidebar && <CalendarClock size={14} />}<span className={sidebar ? 'employee-menu-label' : undefined}>自动化</span></TabsTrigger>}
  </TabsList>
  const configuration = <GroupConfiguration {...props} onBusyChange={configurationBusyChanged} />
  const panels = <>
    {/* Discard the draft immediately after guarded navigation, without waiting for the panel exit animation. */}
    <TabsContent value="profile">{tab === 'profile' && configuration}</TabsContent>
    {canAutomate && <TabsContent value="automations"><OwnerAutomations api={props.api} snapshot={props.snapshot} owner={{ kind: 'group', conversationId: group.id }} active={props.active !== false && tab === 'automations'} onConversation={props.onConversation} /></TabsContent>}
  </>
  return <Tabs className={sidebar ? 'employee-detail employee-detail-sidebar h-full gap-0' : undefined} orientation={sidebar ? 'vertical' : 'horizontal'} value={tab} onValueChange={value => { if (!busy && value !== tab) guard.navigate(() => setTab(value), { resetOnDiscard: false }) }}>
    {sidebar ? <><nav className="employee-menu-nav" aria-label="员工组设置">{menu}</nav><ScrollArea className="employee-detail-main" viewportProps={{ className: 'overscroll-contain scroll-fade-t scroll-fade-6' }} contentProps={{ className: 'employee-detail-main-content' }}>{panels}</ScrollArea></> : <>{menu}{panels}</>}
  </Tabs>
}
function GroupConfiguration({ api, snapshot, conversation, onClose, onSaved, onDeleted, actionsTarget, onBusyChange }: GroupEditorProps) {
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
  const submit = (event: FormEvent) => { event.preventDefault(); void run(async () => { const result = await api.request('createConversation', { ...groupConfigurationInput(conversation, { title, ids, knowledge, teamSetup, memoryScope, memoryContextId }), expectedConfigVersion: initialVersion.current }); initialVersion.current = result.configVersion; clean(); await onSaved(result); guard.saved(actionsTarget === undefined ? onClose : undefined) }) }
  const saveAction = <Button type="submit" form={formId} disabled={busy || !title.trim() || ids.length < 1 || ids.length > 12}>{busy && <LoaderCircle size={15} className="spinner" />}{actionsTarget !== undefined ? '保存' : conversation ? '保存设置' : '创建群聊'}</Button>
  const dissolveAction = conversation && <Button type="button" variant="destructive" disabled={busy} onClick={() => { setError(''); setDissolving(true) }}>解散群聊</Button>
  return <>{actionsTarget && createPortal(saveAction, actionsTarget)}<EditorFrame leading={<GroupMembers agents={snapshot.agents.filter(agent => !isCoreAgent(agent) || conversation?.creationSource?.kind === 'bobo-collaboration' && conversation.agentIds.includes(agent.id))} ids={ids} disabled={busy} onChange={setIds} />} footer={actionsTarget === undefined ? <>{dissolveAction}<Button variant="secondary" disabled={busy} onClick={() => guard.navigate(onClose)}>取消</Button>{saveAction}</> : undefined}>
    <form data-edit-form id={formId} className="form-grid employee-form-sections" onSubmit={submit}>
      {error && <div className="full"><Banner>{error}</Banner></div>}
      <GroupConfigurationFields value={{ title, ids, knowledge, teamSetup, memoryScope, memoryContextId }} onChange={next => { setTitle(next.title); setKnowledge(next.knowledge); setTeamSetup(next.teamSetup); setMemoryScope(next.memoryScope); setMemoryContextId(next.memoryContextId) }} snapshot={snapshot} conversationId={conversation?.id} />
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

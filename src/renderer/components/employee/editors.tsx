/*
 * [INPUT]: 员工与群领域类型、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 既有团队群的目的/建议编辑、删除和版本保存；下拉字段统一使用 shadcn Select；引导从模型连接接入本地 Agent；包含头像选择/上传的员工和群配置编辑器及员工模板；群聊直接展示 1–12 人头像网格和设置字段，无重复标题/说明，独立表单 ID 支持多个详情标签同时挂载。
 * [POS]: src/renderer/components/employee/editors.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Checkbox } from '@/components/ui/checkbox'
import type { LaunchProfile } from '@shared/domain'
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { FileText, LoaderCircle, Search, ShieldCheck } from '@/components/icons/index'
import type { AgentInput, Conversation, DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, colors, EditorFrame, Field, GuardContext, ResourcePicker, useDirty, useMutation } from '@/components/common/index'
import { GroupMembers } from './group-members'
import { AvatarPicker } from './avatar-picker'
export const templates = [
  { name: '资料研究员', role: '查找资料，厘清事实', instructions: '你是一位细致的资料研究员。区分事实与推测，提供可追踪的来源。', icon: Search, color: colors[0] },
  { name: '方案写手', role: '把想法写成清晰方案', instructions: '你是一位方案写手。理解目标与受众，基于获准资料撰写清楚自然的内容。', icon: FileText, color: colors[1] },
  { name: '内容审核员', role: '检查逻辑，打磨细节', instructions: '你是一位内容审核员。核对事实、来源、逻辑与表达，给出具体修改建议。', icon: ShieldCheck, color: colors[2] },
]
export function AgentEditor({ api, snapshot, agent, template, onClose, onSaved }: { api: DesktopApi; snapshot: Snapshot; agent?: DigitalAgent; template?: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const formId = useId()
  const [uploading, setUploading] = useState(false)
  const [profiles,setProfiles]=useState<LaunchProfile[]>([])
  useEffect(()=>{void api.request('listLaunchProfiles',undefined).then(setProfiles).catch(()=>{})},[api])
  const initialVersion = useRef(agent?.configVersion)
  const preset = template === undefined ? undefined : templates[template]
  const [form, setForm] = useState<AgentInput>(() => {
    if (agent) return { avatar:agent.avatar, executionBackend:agent.executionBackend, id: agent.id, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, skillIds: [...agent.skillIds], knowledgeIds: [...agent.knowledgeIds], allowCommands: agent.allowCommands, active: agent.active }
    return { name: preset?.name ?? '', role: preset?.role ?? '', instructions: preset?.instructions ?? '', color: preset?.color ?? colors[0], connectionId: snapshot.connections[0]?.id ?? '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
  })
  const { busy, error, run } = useMutation()
  const guard = useContext(GuardContext)
  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => setForm(current => ({ ...current, [key]: value }))
  useDirty(form)
  const connection = snapshot.connections.find(item => item.id === form.connectionId)
  const submit = (event: FormEvent) => { event.preventDefault(); if (uploading) return; void run(async () => { await api.request('saveAgent', { ...form, expectedConfigVersion: initialVersion.current, name: form.name.trim(), role: form.role.trim() }); await onSaved(); guard.saved(onClose) }) }
  return <EditorFrame title={agent ? '编辑数字员工' : '认识一位新同事'} description="定义他的职责、能力和工作方式。" footer={<><Button variant="secondary" disabled={busy || uploading} onClick={() => guard.navigate(onClose)}>取消</Button><Button type="submit" form={formId} disabled={busy || uploading || !form.name.trim()}>{busy && <LoaderCircle size={15} className="spinner" />}{agent ? '保存修改' : '创建员工'}</Button></>}>
    <form data-edit-form id={formId} onSubmit={submit} className="form-grid">
      {error && <div className="full"><Banner>{error}</Banner></div>}
      <Field label="员工名称"><Input required maxLength={80} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例如：资料研究员" /></Field>
      <Field label="职责简介"><Input value={form.role} onChange={e => set('role', e.target.value)} placeholder="一句话描述擅长的工作" /></Field>
      {!agent && <Field label="初始工作规则" full hint="创建后保存在员工 AGENTS.md，可在系统文件中修改。"><Textarea rows={5} value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="你是一位……" /></Field>}
      <Field label="执行后端" full><SelectField value={form.executionBackend?.kind??'mastra-model'} onValueChange={selectedValue => setForm(current=>({...current,executionBackend:selectedValue==='mastra-model'?{kind:'mastra-model'}:{kind:'acp-local',profileId:profiles[0]?.id??''},...(selectedValue==='acp-local'?{connectionId:'',modelId:'',skillIds:[],knowledgeIds:[],allowCommands:false}:{})}))} options={[{ value: 'mastra-model', label: '模型 API · 聊天与协作' }, { value: 'acp-local', label: '外部 ACP · 仅显式任务' }]} /></Field>
      {form.executionBackend?.kind==='acp-local'?<Field label="外部启动项" full hint="先在设置 → 模型连接 → 本地 Agent 中接入并测试。BoAI 的模型、Skills、知识和记忆不会自动传给外部程序。"><SelectField required value={form.executionBackend.profileId} onValueChange={selectedValue => set('executionBackend',{kind:'acp-local',profileId:selectedValue})} options={[{ value: '', label: '请选择' }, ...profiles.map(p=>({ value: p.id, label: `${p.name}${p.verified?'':' · 未测试'}` }))]} /></Field>:<>
      <Field label="模型连接"><SelectField value={form.connectionId} onValueChange={selectedValue => set('connectionId', selectedValue)} options={[{ value: '', label: '暂未配置' }, ...snapshot.connections.map(item => ({ value: item.id, label: item.name }))]} /></Field>
      <Field label="模型 ID" hint={connection ? `留空使用连接默认模型：${connection.defaultModel}` : '创建模型连接后即可开始对话。'}><Input value={form.modelId} onChange={e => set('modelId', e.target.value)} placeholder="使用连接默认模型" /></Field>
      </>}<div className="field full"><span className="field-label">员工头像</span><div className="employee-avatar-field"><AvatarPicker name={form.name || '新同事'} seed={agent?.id} value={form.avatar} disabled={busy} onChange={avatar => set('avatar', avatar)} onBusyChange={setUploading} /><span className="field-hint">选择内置头像，或上传本地图片。</span></div></div>
      {form.executionBackend?.kind!=='acp-local'&&<><div className="field full"><span className="field-label">启用的 Skills</span><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'skill' && (!item.ownerAgentId || item.ownerAgentId === agent?.id))} selected={form.skillIds} onChange={ids => set('skillIds', ids)} empty="还没有技能。可在资料库中导入技能目录。" /></div>
      <div className="field full"><span className="field-label">可访问的知识库</span><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'knowledge' && !item.ownerAgentId)} selected={form.knowledgeIds} onChange={ids => set('knowledgeIds', ids)} empty="还没有知识资料。可在资料库中导入文件。" /></div>
      <label className="toggle-row full"><span><strong>允许申请运行命令</strong><small>脚本执行前仍会向你展示命令并请求授权。</small></span><Checkbox checked={form.allowCommands} onCheckedChange={checked => set('allowCommands', checked)} /></label>
      </>}<label className="toggle-row full"><span><strong>启用员工</strong><small>停用后不能参与新的任务，历史消息保留。</small></span><Checkbox checked={form.active} onCheckedChange={checked => set('active', checked)} /></label>
    </form>
  </EditorFrame>
}

export function GroupEditor({ api, snapshot, conversation, onClose, onSaved, onOpenAgent }: { onOpenAgent?(id: string): void; api: DesktopApi; snapshot: Snapshot; conversation?: Conversation; onClose: () => void; onSaved: (conversation: Conversation) => Promise<void> }) {
  const formId = useId()
  const initialVersion = useRef(conversation?.configVersion)
  const [title, setTitle] = useState(conversation?.title ?? '')
  const [ids, setIds] = useState(conversation?.agentIds ?? [])
  const [knowledge, setKnowledge] = useState(conversation?.sharedKnowledgeIds ?? [])
  const [teamSetup, setTeamSetup] = useState(conversation?.teamSetup ?? null)
  const { busy, error, run } = useMutation()
  const guard = useContext(GuardContext)
  useDirty({ title, ids, knowledge, teamSetup })
  const submit = (event: FormEvent) => { event.preventDefault(); void run(async () => { const result = await api.request('createConversation', { id: conversation?.id, expectedConfigVersion: initialVersion.current, title: title.trim(), kind: 'group', agentIds: ids, mode: 'natural', sharedKnowledgeIds: knowledge, ...(conversation?.teamSetup ? { teamSetup } : {}) }); await onSaved(result); guard.saved(onClose) }) }
  return <EditorFrame leading={<GroupMembers agents={snapshot.agents} ids={ids} disabled={busy} onChange={setIds} onOpenAgent={onOpenAgent} />} footer={<><Button variant="secondary" disabled={busy} onClick={() => guard.navigate(onClose)}>取消</Button><Button type="submit" form={formId} disabled={busy || !title.trim() || ids.length < 1 || ids.length > 12}>{busy && <LoaderCircle size={15} className="spinner" />}{conversation ? '保存设置' : '创建群聊'}</Button></>}>
    <form data-edit-form id={formId} className="form-grid" onSubmit={submit}>
      {error && <div className="full"><Banner>{error}</Banner></div>}
      <Field label="群聊名称" full><Input required value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：我的内容工作室" /></Field>

      {teamSetup && <>
        <Field label="团队目的" full><Textarea required maxLength={1000} value={teamSetup.purpose} onChange={e => setTeamSetup({ ...teamSetup, purpose: e.target.value })} /></Field>
        <Field label="协作建议" hint="这是背景建议，不改变发言调度或工具权限" full><Textarea maxLength={2000} value={teamSetup.collaborationGuide} onChange={e => setTeamSetup({ ...teamSetup, collaborationGuide: e.target.value })} /></Field>
        <Button type="button" variant="outline" onClick={() => setTeamSetup(null)}>移除团队背景</Button>
      </>}
      <div className="field full"><span className="field-label">群内共享知识</span><p className="field-hint">只有明确共享的资料才可用于这个群的任务。员工私聊不会自动加入群上下文。</p><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'knowledge' && !item.ownerAgentId)} selected={knowledge} onChange={setKnowledge} empty="还没有可共享的知识资料。" /></div>
    </form>
  </EditorFrame>
}

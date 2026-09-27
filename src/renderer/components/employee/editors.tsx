/*
 * [INPUT]: 员工与群领域类型、DesktopApi 与公共组件。
 * [OUTPUT]: 员工和群配置编辑器及员工模板。
 * [POS]: src/renderer/components/employee/editors.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { LaunchProfile } from '@shared/domain'
import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, FileText, LoaderCircle, Search, ShieldCheck } from '@/components/icons/index'
import type { AgentInput, Conversation, DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Avatar, Banner, colors, EditorFrame, Field, GuardContext, ResourcePicker, useDirty, useMutation } from '@/components/common/index'
export const templates = [
  { name: '资料研究员', role: '查找资料，厘清事实', instructions: '你是一位细致的资料研究员。区分事实与推测，提供可追踪的来源。', icon: Search, color: colors[0] },
  { name: '方案写手', role: '把想法写成清晰方案', instructions: '你是一位方案写手。理解目标与受众，基于获准资料撰写清楚自然的内容。', icon: FileText, color: colors[1] },
  { name: '内容审核员', role: '检查逻辑，打磨细节', instructions: '你是一位内容审核员。核对事实、来源、逻辑与表达，给出具体修改建议。', icon: ShieldCheck, color: colors[2] },
]
export function AgentEditor({ api, snapshot, agent, template, onClose, onSaved }: { api: DesktopApi; snapshot: Snapshot; agent?: DigitalAgent; template?: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [profiles,setProfiles]=useState<LaunchProfile[]>([])
  useEffect(()=>{void api.request('listLaunchProfiles',undefined).then(setProfiles).catch(()=>{})},[api])
  const initialVersion = useRef(agent?.configVersion)
  const preset = template === undefined ? undefined : templates[template]
  const [form, setForm] = useState<AgentInput>(() => {
    if (agent) return { executionBackend:agent.executionBackend, id: agent.id, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, skillIds: [...agent.skillIds], knowledgeIds: [...agent.knowledgeIds], allowCommands: agent.allowCommands, active: agent.active }
    return { name: preset?.name ?? '', role: preset?.role ?? '', instructions: preset?.instructions ?? '', color: preset?.color ?? colors[0], connectionId: snapshot.connections[0]?.id ?? '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
  })
  const { busy, error, run } = useMutation()
  const guard = useContext(GuardContext)
  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => setForm(current => ({ ...current, [key]: value }))
  useDirty(form)
  const connection = snapshot.connections.find(item => item.id === form.connectionId)
  const submit = (event: FormEvent) => { event.preventDefault(); void run(async () => { await api.request('saveAgent', { ...form, expectedConfigVersion: initialVersion.current, name: form.name.trim(), role: form.role.trim() }); await onSaved(); guard.saved(onClose) }) }
  return <EditorFrame title={agent ? '编辑数字员工' : '认识一位新同事'} description="定义他的职责、能力和工作方式。" footer={<><button className="button subtle" onClick={() => guard.navigate(onClose)}>取消</button><button className="button primary" type="submit" form="agent-form" disabled={busy || !form.name.trim()}>{busy && <LoaderCircle size={15} className="spinner" />}{agent ? '保存修改' : '创建员工'}</button></>}>
    <form data-edit-form id="agent-form" onSubmit={submit} className="form-grid">
      {error && <div className="full"><Banner>{error}</Banner></div>}
      <Field label="员工名称"><input required maxLength={80} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例如：资料研究员" /></Field>
      <Field label="职责简介"><input value={form.role} onChange={e => set('role', e.target.value)} placeholder="一句话描述擅长的工作" /></Field>
      {!agent && <Field label="初始工作规则" full hint="创建后保存在员工 AGENTS.md，可在系统文件中修改。"><textarea rows={5} value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="你是一位……" /></Field>}
      <Field label="执行后端" full><select value={form.executionBackend?.kind??'mastra-model'} onChange={e=>setForm(current=>({...current,executionBackend:e.target.value==='mastra-model'?{kind:'mastra-model'}:{kind:'acp-local',profileId:profiles[0]?.id??''},...(e.target.value==='acp-local'?{connectionId:'',modelId:'',skillIds:[],knowledgeIds:[],allowCommands:false}:{})}))}><option value="mastra-model">模型 API · 聊天与协作</option><option value="acp-local">外部 ACP · 仅显式任务</option></select></Field>
      {form.executionBackend?.kind==='acp-local'?<Field label="外部启动项" full hint="先在设置 → 外部 Agent 中添加并测试。BoAI 的模型、Skills、知识和记忆不会自动传给外部程序。"><select required value={form.executionBackend.profileId} onChange={e=>set('executionBackend',{kind:'acp-local',profileId:e.target.value})}><option value="">请选择</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}{p.verified?'':' · 未测试'}</option>)}</select></Field>:<>
      <Field label="模型连接"><select value={form.connectionId} onChange={e => set('connectionId', e.target.value)}><option value="">暂未配置</option>{snapshot.connections.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
      <Field label="模型 ID" hint={connection ? `留空使用连接默认模型：${connection.defaultModel}` : '创建模型连接后即可开始对话。'}><input value={form.modelId} onChange={e => set('modelId', e.target.value)} placeholder="使用连接默认模型" /></Field>
      </>}<div className="field full"><span className="field-label">头像颜色</span><div className="color-options">{colors.map(color => <button key={color} type="button" className={`color-option${form.color === color ? ' selected' : ''}`} style={{ background: color }} aria-label={`选择颜色 ${color}`} aria-pressed={form.color === color} onClick={() => set('color', color)}>{form.color === color && <Check size={16} />}</button>)}</div></div>
      {form.executionBackend?.kind!=='acp-local'&&<><div className="field full"><span className="field-label">启用的 Skills</span><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'skill' && (!item.ownerAgentId || item.ownerAgentId === agent?.id))} selected={form.skillIds} onChange={ids => set('skillIds', ids)} empty="还没有技能。可在资料库中导入技能目录。" /></div>
      <div className="field full"><span className="field-label">可访问的知识库</span><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'knowledge' && !item.ownerAgentId)} selected={form.knowledgeIds} onChange={ids => set('knowledgeIds', ids)} empty="还没有知识资料。可在资料库中导入文件。" /></div>
      <label className="toggle-row full"><span><strong>允许申请运行命令</strong><small>脚本执行前仍会向你展示命令并请求授权。</small></span><input type="checkbox" checked={form.allowCommands} onChange={e => set('allowCommands', e.target.checked)} /></label>
      </>}<label className="toggle-row full"><span><strong>启用员工</strong><small>停用后不能参与新的任务，历史消息保留。</small></span><input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} /></label>
    </form>
  </EditorFrame>
}

export function GroupEditor({ api, snapshot, conversation, onClose, onSaved }: { api: DesktopApi; snapshot: Snapshot; conversation?: Conversation; onClose: () => void; onSaved: (conversation: Conversation) => Promise<void> }) {
  const initialVersion = useRef(conversation?.configVersion)
  const [title, setTitle] = useState(conversation?.title ?? '')
  const [ids, setIds] = useState(conversation?.agentIds ?? [])
  const [knowledge, setKnowledge] = useState(conversation?.sharedKnowledgeIds ?? [])
  const { busy, error, run } = useMutation()
  const guard = useContext(GuardContext)
  useDirty({ title, ids, knowledge })
  const submit = (event: FormEvent) => { event.preventDefault(); void run(async () => { const result = await api.request('createConversation', { id: conversation?.id, expectedConfigVersion: initialVersion.current, title: title.trim(), kind: 'group', agentIds: ids, mode: 'natural', sharedKnowledgeIds: knowledge }); await onSaved(result); guard.saved(onClose) }) }
  return <EditorFrame title={conversation ? '群聊设置' : '组建一个工作群'} description="让不同能力的同事，在一个会话里共同完成任务。" footer={<><button className="button subtle" onClick={() => guard.navigate(onClose)}>取消</button><button className="button primary" type="submit" form="group-form" disabled={busy || !title.trim() || ids.length < 2}>{busy && <LoaderCircle size={15} className="spinner" />}{conversation ? '保存设置' : '创建群聊'}</button></>}>
    <form data-edit-form id="group-form" className="form-grid" onSubmit={submit}>
      {error && <div className="full"><Banner>{error}</Banner></div>}
      <Field label="群聊名称" full><input required value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：我的内容工作室" /></Field>
      <div className="field full"><span className="field-label">群成员 <span className="field-hint">至少选择 2 位员工</span></span><div className="resource-picker">{snapshot.agents.map(agent => <label className="resource-option" key={agent.id}><input type="checkbox" checked={ids.includes(agent.id)} disabled={agent.executionBackend?.kind==='acp-local'||(!agent.active && !ids.includes(agent.id))} onChange={event => setIds(event.target.checked ? [...ids, agent.id] : ids.filter(id => id !== agent.id))} /><Avatar name={agent.name} color={agent.color} small /><span className="resource-option-meta"><strong>{agent.name}{agent.executionBackend?.kind==='acp-local'&&' · 仅单聊任务'}{!agent.active && ' · 已停用'}</strong><span>{agent.role}</span></span></label>)}</div>{snapshot.agents.length < 2 && <p className="empty-note">请先创建至少两位数字员工。</p>}</div>
      <div className="field full"><span className="field-label">群内共享知识</span><p className="field-hint">只有明确共享的资料才可用于这个群的任务。员工私聊不会自动加入群上下文。</p><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'knowledge' && !item.ownerAgentId)} selected={knowledge} onChange={setKnowledge} empty="还没有可共享的知识资料。" /></div>
    </form>
  </EditorFrame>
}


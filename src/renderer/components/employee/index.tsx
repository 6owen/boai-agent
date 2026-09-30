/*
 * [INPUT]: 员工领域类型、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 员工统一记忆页委托独立 MemoryPane；下拉字段统一使用 shadcn Select；带持久头像的员工资料、共享 Soft Tabs 与未保存保护、共用 surface 卡片按钮的系统文件、工作区和记忆详情；会话清空后更新只读投影。
 * [POS]: src/renderer/components/employee/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MemoryPane } from './memory-pane'
import { SelectField } from '@/components/ui/select-field'
import { useContext, useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, FolderOpen, Plus, RefreshCw } from '@/components/icons/index'
import type { AgentFileContent, AgentHome, DigitalAgent, MemoryQuery, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { AgentEditor } from '@/components/employee/editors'
import { Avatar, Banner, errorText, Field, GuardContext, Loading, useDirty, useMutation } from '@/components/common/index'

type EmployeeTab = 'profile' | 'files' | 'workspace' | 'memory'
export function EmployeeDetail({ api, agent, snapshot, conversationId, refresh, onClose }: { api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; conversationId?: string; refresh: () => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<EmployeeTab>('profile')
  const [home, setHome] = useState<AgentHome | null>(null), [error, setError] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const guard = useContext(GuardContext)
  const currentConversation = snapshot.conversations.find(c => c.id === conversationId && c.agentIds.includes(agent.id))
  const contextId = currentConversation?.id
  const loadToken = useRef(0)
  const loadHome = async () => {
    const token = ++loadToken.current
    try { const result = await api.request('getAgentHome', { agentId: agent.id, conversationId: contextId }); if (token === loadToken.current) { setHome(result); setError('') } } catch (e) { if (token === loadToken.current) setError(errorText(e)) }
  }
  useEffect(() => { setHome(null); void loadHome(); return () => { loadToken.current++ } }, [agent.id, contextId])
  useEffect(() => api.subscribe(event => {
    if (event.type !== 'conversation:cleared' || event.conversationId !== contextId) return
    // Close only generated file views; employee source drafts remain editable.
    if (fileName && !['AGENTS.md', 'SOUL.md'].includes(fileName)) setFileName(null)
    void loadHome()
  }), [api, contextId, fileName])
  const selectTab = (next: EmployeeTab) => {
    if (next === tab) return
    // Switching panels unmounts the old form; keep this tab owner mounted on discard.
    guard.navigate(() => { setTab(next); setFileName(null) }, { resetOnDiscard: false })
  }
  return <Tabs className="employee-detail gap-0" value={tab} onValueChange={value => selectTab(value as EmployeeTab)}><div className="employee-identity"><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><div><strong>{agent.name}</strong><small>{agent.role || '独立数字员工'}</small></div><span className="pill">{agent.active ? '已启用' : '已停用'}</span></div>
    <div className="employee-tabs-bar"><TabsList aria-label="员工详情分类">
      <TabsTrigger value="profile">配置</TabsTrigger>
      <TabsTrigger value="files">系统文件</TabsTrigger>
      <TabsTrigger value="workspace">工作区</TabsTrigger>
      <TabsTrigger value="memory">记忆</TabsTrigger>
    </TabsList></div>
    {error && <Banner>{error}</Banner>}
    <TabsContent value="profile"><AgentEditor api={api} snapshot={snapshot} agent={agent} onSaved={async () => { await refresh(); await loadHome() }} onClose={onClose} /></TabsContent>
    <TabsContent value="files">{fileName ? <SystemFileEditor key={`${agent.id}-${fileName}-${contextId}`} api={api} agent={agent} home={home} name={fileName} conversationId={contextId} onBack={() => guard.navigate(() => setFileName(null), { resetOnDiscard: false })} onUpdated={async result => { setHome(result); await refresh() }} onMemory={() => selectTab('memory')} /> : <div className="detail-section"><p className="field-hint">工作规则与风格是可编辑源文件。身份和记忆文件是生成视图，不会自动反向导入。</p>{!home ? !error && <Loading /> : <>{home.files.map(file => <Button variant="surface" size="content" className="file-row" key={file.name} onClick={() => setFileName(file.name)}><FileText size={19} /><span><strong>{file.name}</strong><small>{file.purpose}</small><em>{file.kind === 'source' ? '可编辑源文件' : '生成视图'} · {{ current: '已验证', modified: '已被修改', missing: '文件缺失', invalid: '校验失败' }[file.status]}</em></span></Button>)}<div className="scope-note">{contextId ? `当前会话：${currentConversation?.title}。记忆视图仅对应该会话范围。` : '记忆由同一员工持有。这里的文件是来源范围投影，统一记录可在记忆页管理。'}</div></>}</div>}</TabsContent>
    <TabsContent value="workspace"><WorkspaceView api={api} agent={agent} home={home} onRefresh={async () => { await refresh(); await loadHome() }} /></TabsContent>
    <TabsContent value="memory"><MemoryPane api={api} agent={agent} snapshot={snapshot} initialConversationId={contextId} /></TabsContent>
  </Tabs>
}

function WorkspaceView({ api, agent, home, onRefresh }: { api: DesktopApi; agent: DigitalAgent; home: AgentHome | null; onRefresh: () => Promise<void> }) {
  const { busy, error, run } = useMutation()
  const [notice, setNotice] = useState('')
  if (!home) return <Loading />
  return <div className="detail-section">{error && <Banner>{error}</Banner>}{notice && <Banner kind="notice">{notice}</Banner>}<h3>独立工作区</h3><p className="field-hint">这里属于 {agent.name}。群任务只会获得当前会话授权的目录，不会自动访问全部私有文件。</p><p className="resource-path">{home.workspacePath}</p><Button variant="secondary" onClick={() => { void run(async () => { await api.request('openPath', { path: home.workspacePath }) }) }}><FolderOpen size={16} />打开员工工作区</Button>{home.sessionPath && <><h4>当前会话空间</h4><p className="resource-path">{home.sessionPath}</p><Button variant="secondary" onClick={() => { void run(async () => { await api.request('openPath', { path: home.sessionPath! }) }) }}><FolderOpen size={16} />打开会话空间</Button></>}<h4>已绑定技能的可用性</h4>{home.environment?.skills.length ? home.environment.skills.map(skill => <Card className="connection-card gap-0 p-4" key={skill.resourceId}><CardContent className="p-0"><strong>{skill.name}</strong><p><span className="pill">{skill.instructions === 'available' ? '说明可用' : '说明不可用'}</span> <span className="pill">{skill.execution === 'disabled' ? '命令未启用' : '执行依赖未验证'}</span></p><p className="field-hint">{skill.detail}</p></CardContent></Card>) : <p className="field-hint">尚未绑定技能。导入后可在“配置”中启用。</p>}<h4>员工专属技能</h4><p className="field-hint">导入到该员工自己的空间。技能的实际启用情况可在“配置”中查看。</p><Button variant="secondary" disabled={busy} onClick={() => { void run(async () => { const path = await api.request('choosePath', { kind: 'skill' }); if (!path) return; const resource = await api.request('importResource', { kind: 'skill', path, ownerAgentId: agent.id }); await onRefresh(); setNotice(`已导入专属 Skill「${resource.name}」，请核对员工的启用绑定。`) }) }}><Plus size={15} />导入专属 Skill</Button><h4>记忆命名空间</h4><p className="resource-path">{home.memoryNamespace}</p><p className="field-hint">工作目录不是系统安全沙箱。已授权的主机命令仍使用应用进程权限。</p></div>
}

function SystemFileEditor({ api, agent, home, name, conversationId, onBack, onUpdated, onMemory }: { api: DesktopApi; agent: DigitalAgent; home: AgentHome | null; name: string; conversationId?: string; onBack: () => void; onUpdated: (home: AgentHome) => Promise<void>; onMemory: () => void }) {
  const [file, setFile] = useState<AgentFileContent | null>(null), [loadError, setLoadError] = useState('')
  useEffect(() => { let current = true; void api.request('readAgentFile', { agentId: agent.id, name, conversationId }).then(result => { if (current) setFile(result) }).catch(e => { if (current) setLoadError(errorText(e)) }); return () => { current = false } }, [api, agent.id, name, conversationId])
  return <div className="detail-section"><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} />所有系统文件</Button><h3>{name}</h3>{loadError ? <Banner>{loadError}</Banner> : file ? <FileForm key={file.hash} api={api} file={file} home={home} agent={agent} conversationId={conversationId} onUpdated={onUpdated} onReload={setFile} onMemory={onMemory} /> : <Loading />}</div>
}
function FileForm({ api, file, home, agent, conversationId, onUpdated, onReload, onMemory }: { api: DesktopApi; file: AgentFileContent; home: AgentHome | null; agent: DigitalAgent; conversationId?: string; onUpdated: (home: AgentHome) => Promise<void>; onReload: (file: AgentFileContent) => void; onMemory: () => void }) {
  const [content, setContent] = useState(file.content), [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const expectedVersion = useRef(home?.configVersion ?? agent.configVersion)
  const { busy, error, run } = useMutation()
  const guard = useContext(GuardContext)
  const clean = useDirty(content)
  const editable = file.kind === 'source' && (file.name === 'AGENTS.md' || file.name === 'SOUL.md')
  if (importing) return <GeneratedMemoryImport api={api} agent={agent} file={file} conversationId={conversationId} onBack={() => guard.navigate(() => setImporting(false))} onImported={() => { setImporting(false); setNotice('选定片段已作为新记忆保存，原文件没有被当作权威数据加载。') }} />
  return <form data-edit-form={editable ? true : undefined} onSubmit={event => { event.preventDefault(); if (!editable) return; void run(async () => { const result = await api.request('saveAgentFile', { agentId: agent.id, name: file.name as 'AGENTS.md' | 'SOUL.md', content, expectedHash: file.hash, expectedConfigVersion: expectedVersion.current }); await onUpdated(result); clean(); setNotice('已保存，下次执行将使用新版本。'); const updated = await api.request('readAgentFile', { agentId: agent.id, name: file.name, conversationId }); onReload(updated); guard.saved() }) }}>
    {error && <Banner>{error}</Banner>}{notice && <Banner kind="notice">{notice}</Banner>}<p className="field-hint">{file.purpose}</p><span className="pill">{editable ? '可编辑源文件' : '只读生成视图'}</span>{file.status !== 'current' && <Banner>{file.error || `文件状态：${file.status}。请核对后再保存或重新生成。`}</Banner>}<label className="field file-editor"><span className="field-label">文件内容</span><Textarea aria-label={`${file.name} 内容`} spellCheck={false} rows={16} readOnly={!editable} value={content} onChange={event => setContent(event.target.value)} /></label><p className="field-hint">{editable ? '保存会校验文件 hash 和配置版本；源文件变化不会扩大工具权限。' : '该文件由产品数据生成。编辑基础配置或对应范围的记忆后再重新生成。'}</p>{editable ? <Button type="submit" disabled={busy || content === file.content}>保存文件</Button> : <div className="button-row"><Button type="button" variant="secondary" onClick={onMemory}>查看记忆</Button><Button type="button" variant="secondary" onClick={() => setImporting(true)}>导入为记忆</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { void run(async () => { const result = await api.request('regenerateAgentViews', { agentId: agent.id, conversationId }); await onUpdated(result); onReload(await api.request('readAgentFile', { agentId: agent.id, name: file.name, conversationId })); setNotice('已从权威数据重新生成视图。') }) }}><RefreshCw size={14} />重新生成视图</Button></div>}</form>
}

function GeneratedMemoryImport({ api, agent, file, conversationId, onBack, onImported }: { api: DesktopApi; agent: DigitalAgent; file: AgentFileContent; conversationId?: string; onBack: () => void; onImported: () => void }) {
  const [content, setContent] = useState(''), [useScope, setUseScope] = useState<'employee' | 'conversation'>(conversationId ? 'conversation' : 'employee')
  const requestId = useRef(crypto.randomUUID())
  const source = useRef<HTMLTextAreaElement>(null)
  const guard = useContext(GuardContext)
  const { busy, error, run, setError } = useMutation()
  useDirty({ content, useScope })
  return <form data-edit-form onSubmit={event => { event.preventDefault(); void run(async () => { const query: MemoryQuery = { agentId: agent.id, scope: 'employee' }; const current = await api.request('getMemory', query); await api.request('saveMemory', { ...query, content: content.trim(), expectedEpoch: current.epoch, useScope, sourceConversationId: conversationId, requestId: requestId.current, origin: 'import', sourceMessageIds: [], sourceResourceIds: [] }); onImported(); guard.saved() }) }}><Button variant="ghost" size="sm" type="button" onClick={onBack}><ArrowLeft size={14} />返回文件</Button><h3>导入明确选定的记忆片段</h3><p className="scope-note">目标：{agent.name} · {useScope === 'conversation' ? '仅此聊天' : '相关聊天可用'}。明确选定片段和范围后才会导入。来源文件：{file.name}。</p>{error && <Banner>{error}</Banner>}<Field label="导入使用范围"><SelectField value={useScope} onValueChange={value => setUseScope(value as 'employee' | 'conversation')} options={[{ value: 'employee', label: '相关聊天可用' }, ...(conversationId ? [{ value: 'conversation', label: '仅此聊天' }] : [])]} /></Field><Field label="选择源文件片段" hint="在下方选择需要保留的文字，再点击“采用选中片段”，或直接在待导入内容中填写。"><Textarea ref={source} aria-label="源文件片段" rows={7} readOnly value={file.content} /></Field><Button type="button" variant="secondary" size="sm" onClick={() => { const text = file.content.slice(source.current?.selectionStart ?? 0, source.current?.selectionEnd ?? 0); if (!text.trim()) { setError('请先在源文件中选择需要保留的片段。'); return }; if (text.length > 4000) { setError('单次最多导入 4000 字符，请缩小选择范围。'); return }; setError(''); setContent(text) }}>采用选中片段</Button><Field label="待导入内容" hint={`${content.length} / 4000 字符；仅这些文字会成为一条新记忆。`}><Textarea required maxLength={4000} rows={7} value={content} onChange={event => setContent(event.target.value)} /></Field><div className="button-row"><Button type="button" variant="secondary" onClick={onBack}>取消</Button><Button type="submit" disabled={busy || !content.trim() || content.length > 4000}>确认导入记忆</Button></div></form>
}

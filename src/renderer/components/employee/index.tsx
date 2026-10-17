/*
 * [OUTPUT]: 通讯录高级配置省略基础配置与身份表单，默认系统文件；工作区配置入口可返回资料页，其他宿主保留完整编辑器。
 * [OUTPUT]: 系统文件列表点击后在添加技能同款独立Dialog编辑，局部未保存守卫与保存期间关闭锁保留；工作区各分区共用资料Card。
 * [OUTPUT]: 分栏配置右侧ScrollArea视口复用会话页scroll-fade的顶部渐隐，滚动条保持贴边。
 * [OUTPUT]: 首个分类统一为基础配置；左侧菜单编辑模式仅该页显示身份编辑，配置保持挂载和原草稿守卫。
 * [OUTPUT]: 编辑弹窗可选左侧竖排分类/右侧独立滚动内容，保留同一Tabs/草稿/保存与隐藏停读合同；其他内嵌详情沿原顶部Tabs。
 * [OUTPUT]: 通讯录Dialog复用完整标签/配置，配置保存与头像上传忙时通知弹窗关闭锁。
 * [OUTPUT]: 员工详情加入同一归属自动化配置与执行历史，隐藏停读并沿原草稿守卫。
 * [OUTPUT]: 已保存员工详情增加渠道绑定/授权/连接与独立发送回执，复用原未保存守卫，隐藏停读。
 * [OUTPUT]: 2026-10-10 员工原详情新增执行详情标签，保留身份/配置草稿和未保存守卫，隐藏不查询或启动执行。
 * [INPUT]: 员工领域类型、显式配置导航请求、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 顶部头像/姓名/职责跨标签保持同一编辑控件与尺寸；身份修改共原保存/未知回执，其他表单编辑与身份草稿互斥，显式放弃重置配置草稿。
 * [OUTPUT]: 通讯录Dialog使用原底部保存/取消，兼容actionsTarget的其他内嵌配置保留顶部操作能力。
 * [OUTPUT]: 本机技能绑定和能力说明按页面隐藏停读，配置版本变化重新核对；真实能力状态与当前受管说明/来源入口；群知识仍按既有共享交集提示；配置导航请求经未保存守卫返回配置页；员工统一记忆页及系统文件/工作区详情；会话清空后更新只读投影。
 * [POS]: src/renderer/components/employee/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { OwnerAutomations } from '@/pages/schedules/owner-automations'
import { MemoryPane } from './memory-pane'
import { EmployeeExecutionPane } from './execution-pane'
import { EmployeeChannelPane } from './channel-pane'
import { SelectField } from '@/components/ui/select-field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkillContent } from '@/pages/library/skill-content'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ArrowLeft, AtSign, BookOpen, CalendarClock, Clock, FileText, FolderOpen, Plus, RefreshCw, Settings, X } from '@/components/icons/index'
import type { AgentFileContent, AgentHome, Conversation, DigitalAgent, MemoryQuery, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { AgentEditor } from '@/components/employee/editors'
import { Banner, errorText, Field, GuardContext, Loading, useDirty, useMutation } from '@/components/common/index'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { ContactProfileCard, ContactProfileSection } from './profile-card'

type EmployeeTab = 'profile' | 'files' | 'workspace' | 'memory' | 'execution' | 'channels' | 'automations'
export function EmployeeDetail({ api, agent, snapshot, conversationId, configurationRequest, refresh, onClose, active = true, scope = 'contacts', onConversation, actionsTarget, onBusyChange, navigation = 'top', configurationAvailable = true, onConfigure }: { navigation?: 'top' | 'sidebar'; configurationAvailable?: boolean; onConfigure?(): void; api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; conversationId?: string; configurationRequest?: string; refresh: () => Promise<void>; onClose: () => void; active?: boolean; scope?: string; onConversation?(id: string, messageId?: string): void; actionsTarget?: HTMLElement | null; onBusyChange?(busy: boolean): void }) {
  const [tab, setTab] = useState<EmployeeTab>(configurationAvailable ? 'profile' : 'files')
  const [identityTarget, setIdentityTarget] = useState<HTMLDivElement | null>(null)
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null)
  const [configurationDirty, setConfigurationDirty] = useState(false), configurationDirtyRef = useRef(false)
  const [configurationEpoch, setConfigurationEpoch] = useState(0)
  const configurationChanged = useCallback((dirty: boolean) => { configurationDirtyRef.current = dirty; setConfigurationDirty(dirty) }, [])
  const revealConfiguration = useCallback(() => setTab('profile'), [])
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
  useEffect(() => { setHome(null); setError(''); if (active) void loadHome(); return () => { loadToken.current++ } }, [api, agent.id, agent.configVersion, contextId, active])
  useEffect(() => {
    if (!active) return
    return api.subscribe(event => {
    if (event.type !== 'conversation:cleared' || event.conversationId !== contextId) return
    // Close only generated file views; employee source drafts remain editable.
    if (fileName && !['AGENTS.md', 'SOUL.md'].includes(fileName)) setFileName(null)
    void loadHome()
    })
  }, [api, active, contextId, fileName])
  const selectTab = (next: EmployeeTab) => {
    if (next === tab) return
    guard.navigate(() => {
      // The configuration now stays mounted; explicitly discard its remaining draft.
      if (configurationDirtyRef.current) setConfigurationEpoch(current => current + 1)
      setTab(next); setFileName(null)
    }, { resetOnDiscard: false })
  }
  useEffect(() => { if (configurationRequest && configurationAvailable) selectTab('profile') }, [configurationRequest, configurationAvailable])
  const sidebar = navigation === 'sidebar'
  const categories = [
    ...(configurationAvailable ? [{ value: 'profile', label: '基础配置', icon: Settings }] : []),
    { value: 'files', label: '系统文件', icon: FileText },
    { value: 'workspace', label: '工作区', icon: FolderOpen },
    { value: 'memory', label: '记忆', icon: BookOpen },
    { value: 'execution', label: '执行详情', icon: Clock },
    { value: 'channels', label: '渠道', icon: AtSign },
    ...(onConversation ? [{ value: 'automations', label: '自动化', icon: CalendarClock }] : []),
  ]
  const menu = <TabsList aria-label="员工详情分类" className={sidebar ? 'employee-menu w-full gap-1 p-0' : undefined}>
    {categories.map(item => <TabsTrigger key={item.value} value={item.value} aria-label={item.label} className={sidebar ? 'group-data-vertical/tabs:h-[32px] text-[12px]' : undefined}>{sidebar && <item.icon size={14} />}<span className={sidebar ? 'employee-menu-label' : undefined}>{item.label}</span></TabsTrigger>)}
  </TabsList>
  const identity = <div ref={setIdentityTarget} className="employee-identity" />
  const panels = <>
    {error && <Banner>{error}</Banner>}
    {configurationAvailable && <TabsContent value="profile" keepMounted>{sidebar && identity}<AgentEditor key={configurationEpoch} api={api} snapshot={snapshot} agent={agent} identityTarget={identityTarget} footerTarget={footerTarget} actionsTarget={actionsTarget} configurationVisible={tab === 'profile'} identityDisabled={tab !== 'profile' && guard.dirty && !configurationDirty} onDirtyChange={configurationChanged} onRevealConfiguration={revealConfiguration} onBusyChange={onBusyChange} active={active} scope={scope} onSaved={async () => { await refresh(); await loadHome() }} onClose={onClose} /></TabsContent>}
    <TabsContent value="files"><fieldset className="contents" disabled={configurationDirty}><div className="detail-section"><p className="field-hint">工作规则与风格是可编辑源文件。身份和记忆文件是生成视图，不会自动反向导入。</p>{!home ? !error && <Loading /> : <>{home.files.map(file => <Button variant="surface" size="content" className="file-row" key={file.name} onClick={() => setFileName(file.name)}><FileText size={19} /><span><strong>{file.name}</strong><small>{file.purpose}</small><em>{file.kind === 'source' ? '可编辑源文件' : '生成视图'} · {{ current: '已验证', modified: '已被修改', missing: '文件缺失', invalid: '校验失败' }[file.status]}</em></span></Button>)}<div className="scope-note">{contextId ? `当前会话：${currentConversation?.title}。记忆视图仅对应该会话范围。` : '记忆由同一员工持有。这里的文件是来源范围投影，统一记录可在记忆页管理。'}</div></>}</div></fieldset>
      {active && tab === 'files' && fileName && <SystemFileEditor key={`${agent.id}-${fileName}-${contextId}`} api={api} agent={agent} home={home} name={fileName} conversationId={contextId} onBack={() => setFileName(null)} onUpdated={async result => { setHome(result); await refresh() }} onMemory={() => { setFileName(null); selectTab('memory') }} />}
    </TabsContent>
    <TabsContent value="workspace"><fieldset className="contents" disabled={configurationDirty}><WorkspaceView api={api} agent={agent} home={home} active={active && tab === 'workspace'} conversation={currentConversation} onConfigure={() => configurationAvailable ? selectTab('profile') : guard.navigate(() => { onClose(); onConfigure?.() }, { resetOnDiscard: false })} onRefresh={async () => { await refresh(); await loadHome() }} /></fieldset></TabsContent>
    <TabsContent value="memory"><fieldset className="contents" disabled={configurationDirty}><MemoryPane api={api} agent={agent} snapshot={snapshot} initialConversationId={contextId} /></fieldset></TabsContent>
    <TabsContent value="execution"><EmployeeExecutionPane key={`${agent.id}:${contextId ?? 'all'}`} api={api} agent={agent} snapshot={snapshot} conversationId={contextId} active={active && tab === 'execution'} /></TabsContent>
    <TabsContent value="channels"><fieldset className="contents" disabled={configurationDirty}><EmployeeChannelPane key={agent.id} api={api} agent={agent} active={active && tab === 'channels'} /></fieldset></TabsContent>
    {onConversation && <TabsContent value="automations"><fieldset className="contents" disabled={configurationDirty}><OwnerAutomations key={agent.id} api={api} snapshot={snapshot} owner={{ kind: 'employee', employeeId: agent.id }} active={active && tab === 'automations'} onConversation={onConversation} /></fieldset></TabsContent>}
    {configurationAvailable && actionsTarget === undefined && <div ref={setFooterTarget} className="employee-identity-actions" />}
  </>
  return <Tabs className={`employee-detail gap-0${sidebar ? ' employee-detail-sidebar h-full' : ''}`} orientation={sidebar ? 'vertical' : 'horizontal'} value={tab} onValueChange={value => selectTab(value as EmployeeTab)}>
    {sidebar ? <><nav className="employee-menu-nav" aria-label="员工设置">{menu}</nav><ScrollArea className="employee-detail-main" viewportProps={{ className: 'overscroll-contain scroll-fade-t scroll-fade-6' }} contentProps={{ className: 'employee-detail-main-content' }}>{panels}</ScrollArea></>
      : <>{configurationAvailable && identity}<div className="employee-tabs-bar">{menu}</div>{panels}</>}
  </Tabs>
}

function WorkspaceView({ api, agent, home, active, conversation, onConfigure, onRefresh }: { api: DesktopApi; agent: DigitalAgent; home: AgentHome | null; active: boolean; conversation?: Conversation; onConfigure(): void; onRefresh: () => Promise<void> }) {
  const { busy, error, run } = useMutation()
  const [notice, setNotice] = useState('')
  const [skillId, setSkillId] = useState<string>()
  useEffect(() => { if (!active) setSkillId(undefined) }, [active])
  const selectedSkill = home?.environment?.skills.find(skill => skill.resourceId === skillId)
  const unsharedKnowledge = conversation?.kind === 'group' ? agent.knowledgeIds.filter(id => !conversation.sharedKnowledgeIds.includes(id)) : []
  if (!home) return <Loading />
  return <div className="detail-section"><div className="employee-form-sections">
    {error && <Banner>{error}</Banner>}{notice && <Banner kind="notice">{notice}</Banner>}
    <ContactProfileSection title="独立工作区"><ContactProfileCard label="独立工作区" fields={false}>
      <div className="space-y-3"><p className="field-hint">这里属于 {agent.name}。群任务只会获得当前会话授权的目录，不会自动访问全部私有文件。</p><p className="resource-path">{home.workspacePath}</p><Button variant="secondary" size="sm" disabled={busy} onClick={() => { void run(async () => { await api.request('openPath', { path: home.workspacePath }) }) }}><FolderOpen />打开员工工作区</Button></div>
    </ContactProfileCard></ContactProfileSection>
    {home.sessionPath && <ContactProfileSection title="当前会话空间"><ContactProfileCard label="当前会话空间" fields={false}>
      <div className="space-y-3"><p className="resource-path">{home.sessionPath}</p><Button variant="secondary" size="sm" disabled={busy} onClick={() => { void run(async () => { await api.request('openPath', { path: home.sessionPath! }) }) }}><FolderOpen />打开会话空间</Button></div>
    </ContactProfileCard></ContactProfileSection>}
    <ContactProfileSection title="已绑定技能的可用性"><ContactProfileCard label="技能可用性" fields={false}>
      <div className="soft-divide-y">{home.environment?.skills.length ? home.environment.skills.map(skill => <div className="space-y-2 py-3 first:pt-0 last:pb-0" key={skill.resourceId}>
        <strong>{skill.name}</strong><p><span className="pill">{skill.instructions === 'available' ? '说明可用' : '说明不可用'}</span> <span className="pill">{skill.execution === 'disabled' ? '命令未启用' : '执行依赖未验证'}</span></p><p className="field-hint">{skill.detail}</p><Button variant="ghost" size="sm" onClick={() => setSkillId(skill.resourceId)}>查看 {skill.name} 的来源与说明</Button>
      </div>) : <p className="field-hint">尚未绑定技能，可在“配置”中从本机技能选择。</p>}</div>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onConfigure}>查看员工配置</Button>
      {unsharedKnowledge.length > 0 && <p className="scope-note">资料未共享：{unsharedKnowledge.length} 项已绑定知识未在群“{conversation?.title}”中共享，请到该群配置核对。技能沿员工现有绑定使用。</p>}
    </ContactProfileCard></ContactProfileSection>
    <ContactProfileSection title="员工专属技能"><ContactProfileCard label="员工专属技能" fields={false}>
      <div className="space-y-3"><p className="field-hint">导入到该员工自己的空间。技能的实际启用情况可在“配置”中查看。</p><Button variant="secondary" size="sm" disabled={busy} onClick={() => { void run(async () => { const path = await api.request('choosePath', { kind: 'skill' }); if (!path) return; const resource = await api.request('importResource', { kind: 'skill', path, ownerAgentId: agent.id }); await onRefresh(); setNotice(`已导入专属 Skill「${resource.name}」，请核对员工的启用绑定。`) }) }}><Plus />导入专属 Skill</Button></div>
    </ContactProfileCard></ContactProfileSection>
    <ContactProfileSection title="记忆命名空间"><ContactProfileCard label="记忆命名空间" fields={false}>
      <div className="space-y-3"><p className="resource-path">{home.memoryNamespace}</p><p className="field-hint">工作目录不是系统安全沙箱。已授权的主机命令仍使用应用进程权限。</p></div>
    </ContactProfileCard></ContactProfileSection>
    <Dialog open={active && Boolean(selectedSkill)} onOpenChange={value => { if (!value) setSkillId(undefined) }}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>{selectedSkill?.name} · 来源与说明</DialogTitle><DialogDescription>当前员工的受管副本；说明可读取不表示依赖已验证。</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-y-auto">{selectedSkill && <SkillContent key={selectedSkill.resourceId} api={api} resourceId={selectedSkill.resourceId} />}</div></DialogContent></Dialog>
  </div></div>
}

function SystemFileEditor({ api, agent, home, name, conversationId, onBack, onUpdated, onMemory }: { api: DesktopApi; agent: DigitalAgent; home: AgentHome | null; name: string; conversationId?: string; onBack: () => void; onUpdated: (home: AgentHome) => Promise<void>; onMemory: () => void }) {
  const [file, setFile] = useState<AgentFileContent | null>(null), [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {} })
  const close = () => { if (!busy) navigate(onBack, { resetOnDiscard: false }) }
  useEffect(() => { let current = true; void api.request('readAgentFile', { agentId: agent.id, name, conversationId }).then(result => { if (current) setFile(result) }).catch(e => { if (current) setLoadError(errorText(e)) }); return () => { current = false } }, [api, agent.id, name, conversationId])
  return <GuardContext.Provider value={guard}>
    <Dialog open onOpenChange={open => { if (!open) close() }}><DialogContent showCloseButton={false} className="min-w-0 max-h-[calc(100dvh-32px)] overflow-y-auto p-5 sm:max-w-[780px]">
      <DialogHeader><DialogTitle className="pr-6">{name}</DialogTitle></DialogHeader>
      <Button type="button" variant="ghost" size="icon-sm" className="absolute top-3 right-3" disabled={busy} aria-label={`关闭系统文件 ${name}`} onClick={close}><X /></Button>
      {loadError ? <><Banner>{loadError}</Banner><Button variant="ghost" onClick={close}>关闭</Button></> : file ? <FileForm key={file.hash} api={api} file={file} home={home} agent={agent} conversationId={conversationId} onUpdated={onUpdated} onReload={setFile} onMemory={() => navigate(onMemory)} onClose={close} onBusyChange={setBusy} /> : <Loading />}
    </DialogContent></Dialog>
    {confirmation}
  </GuardContext.Provider>
}
function FileForm({ api, file, home, agent, conversationId, onUpdated, onReload, onMemory, onClose, onBusyChange }: { api: DesktopApi; file: AgentFileContent; home: AgentHome | null; agent: DigitalAgent; conversationId?: string; onUpdated: (home: AgentHome) => Promise<void>; onReload: (file: AgentFileContent) => void; onMemory: () => void; onClose(): void; onBusyChange(busy: boolean): void }) {
  const [content, setContent] = useState(file.content), [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const expectedVersion = useRef(home?.configVersion ?? agent.configVersion)
  const { busy, error, run } = useMutation()
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  const guard = useContext(GuardContext)
  const clean = useDirty(content)
  const editable = file.kind === 'source' && (file.name === 'AGENTS.md' || file.name === 'SOUL.md')
  if (importing) return <GeneratedMemoryImport api={api} agent={agent} file={file} conversationId={conversationId} onBusyChange={onBusyChange} onBack={() => guard.navigate(() => setImporting(false))} onImported={() => { setImporting(false); setNotice('选定片段已作为新记忆保存，原文件没有被当作权威数据加载。') }} />
  return <form data-edit-form={editable ? true : undefined} onSubmit={event => { event.preventDefault(); if (!editable) return; void run(async () => { const result = await api.request('saveAgentFile', { agentId: agent.id, name: file.name as 'AGENTS.md' | 'SOUL.md', content, expectedHash: file.hash, expectedConfigVersion: expectedVersion.current }); await onUpdated(result); clean(); setNotice('已保存，下次执行将使用新版本。'); const updated = await api.request('readAgentFile', { agentId: agent.id, name: file.name, conversationId }); onReload(updated); guard.saved() }) }}>
    {error && <Banner>{error}</Banner>}{notice && <Banner kind="notice">{notice}</Banner>}<p className="field-hint">{file.purpose}</p><span className="pill">{editable ? '可编辑源文件' : '只读生成视图'}</span>{file.status !== 'current' && <Banner>{file.error || `文件状态：${file.status}。请核对后再保存或重新生成。`}</Banner>}<label className="field file-editor"><span className="field-label">文件内容</span><Textarea aria-label={`${file.name} 内容`} spellCheck={false} rows={16} readOnly={!editable} value={content} disabled={busy} onChange={event => setContent(event.target.value)} /></label><p className="field-hint">{editable ? '保存会校验文件 hash 和配置版本；源文件变化不会扩大工具权限。' : '该文件由产品数据生成。编辑基础配置或对应范围的记忆后再重新生成。'}</p><DialogFooter variant="plain" className="flex-wrap"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>取消</Button>{editable ? <Button type="submit" disabled={busy || content === file.content}>保存文件</Button> : <div className="button-row"><Button type="button" variant="secondary" disabled={busy} onClick={onMemory}>查看记忆</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setImporting(true)}>导入为记忆</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { void run(async () => { const result = await api.request('regenerateAgentViews', { agentId: agent.id, conversationId }); await onUpdated(result); onReload(await api.request('readAgentFile', { agentId: agent.id, name: file.name, conversationId })); setNotice('已从权威数据重新生成视图。') }) }}><RefreshCw size={14} />重新生成视图</Button></div>}</DialogFooter></form>
}

function GeneratedMemoryImport({ api, agent, file, conversationId, onBack, onImported, onBusyChange }: { api: DesktopApi; agent: DigitalAgent; file: AgentFileContent; conversationId?: string; onBack: () => void; onImported: () => void; onBusyChange(busy: boolean): void }) {
  const [content, setContent] = useState(''), [useScope, setUseScope] = useState<'employee' | 'conversation'>(conversationId ? 'conversation' : 'employee')
  const requestId = useRef(crypto.randomUUID())
  const source = useRef<HTMLTextAreaElement>(null)
  const guard = useContext(GuardContext)
  const { busy, error, run, setError } = useMutation()
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  useDirty({ content, useScope })
  return <form data-edit-form onSubmit={event => { event.preventDefault(); void run(async () => { const query: MemoryQuery = { agentId: agent.id, scope: 'employee' }; const current = await api.request('getMemory', query); await api.request('saveMemory', { ...query, content: content.trim(), expectedEpoch: current.epoch, useScope, sourceConversationId: conversationId, requestId: requestId.current, origin: 'import', sourceMessageIds: [], sourceResourceIds: [] }); onImported(); guard.saved() }) }}><Button variant="ghost" size="sm" type="button" disabled={busy} onClick={onBack}><ArrowLeft size={14} />返回文件</Button><h3>导入明确选定的记忆片段</h3><p className="scope-note">目标：{agent.name} · {useScope === 'conversation' ? '仅此聊天' : '相关聊天可用'}。明确选定片段和范围后才会导入。来源文件：{file.name}。</p>{error && <Banner>{error}</Banner>}<Field label="导入使用范围"><SelectField value={useScope} onValueChange={value => setUseScope(value as 'employee' | 'conversation')} options={[{ value: 'employee', label: '相关聊天可用' }, ...(conversationId ? [{ value: 'conversation', label: '仅此聊天' }] : [])]} /></Field><Field label="选择源文件片段" hint="在下方选择需要保留的文字，再点击“采用选中片段”，或直接在待导入内容中填写。"><Textarea ref={source} aria-label="源文件片段" rows={7} readOnly value={file.content} /></Field><Button type="button" variant="secondary" size="sm" onClick={() => { const text = file.content.slice(source.current?.selectionStart ?? 0, source.current?.selectionEnd ?? 0); if (!text.trim()) { setError('请先在源文件中选择需要保留的片段。'); return }; if (text.length > 4000) { setError('单次最多导入 4000 字符，请缩小选择范围。'); return }; setError(''); setContent(text) }}>采用选中片段</Button><Field label="待导入内容" hint={`${content.length} / 4000 字符；仅这些文字会成为一条新记忆。`}><Textarea required maxLength={4000} rows={7} value={content} onChange={event => setContent(event.target.value)} /></Field><div className="button-row"><Button type="button" variant="secondary" disabled={busy} onClick={onBack}>取消</Button><Button type="submit" disabled={busy || !content.trim() || content.length > 4000}>确认导入记忆</Button></div></form>
}

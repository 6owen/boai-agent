/*
 * [OUTPUT]: 当前网页引用附于原消息草稿；固定实例/页面版本随发送回执持久，标题URL只展示宿主核验来源，原附件工具栏保持。
 * [OUTPUT]: 聊天模型选择复用设置/员工模型目录与手动编辑，连接选项仅含实际连接。
 * [OUTPUT]: 聊天与核心首发共用模型API/本机Agent两级配置，显示实际连接名称；草稿一次保存并等待真实回执；未知结果冻结原草稿/版本，只读核对并显式载入当前配置后再编辑。
 * [OUTPUT]: 本机来源显示已保存连接名称，模型/API与本机程序配置共用字段；思考强度仅按真实API模型能力开放。
 * [OUTPUT]: 本机Codex复用原命令权限菜单与发送行为，普通聊天仍无工具。
 * [OUTPUT]: 聊天底部显示本机Codex来源与逐次命令授权，保留原发送行为。
 * [INPUT]: 当前成员、连接快照、任务状态及宿主提供的配置/发送回调。
 * [OUTPUT]: 原问题补充模式锁定点名；composer仅发送消息，不展示停止本轮/停止并发送按钮；已有 API 聊天加号接入原生材料选择，空白首发/ACP 不开放；首发前不展示会话目录操作；@ 与 / 共用 Prompt Bar；核心助手隐藏命令权限菜单；普通员工权限仅呈现已提交的禁止命令/逐次批准，模型/思考强度、配置锁定及普通发送语义。
 * [POS]: 会话私有工具栏；复用 ui 的 composer、Dialog与权限DropdownMenu，共用员工模型字段，真实配置写入由 AppShell 管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DigitalAgent, LaunchProfile, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { errorText, Field } from '@/components/common'
import { AgentModelFields, agentModelLabel, agentModelSelectionReady, type AgentModelSelection } from '@/components/employee/agent-model-fields'
import { isCoreAgent } from '@shared/domain/core-agent'
import { supportsThinkingControl, type ThinkingLevel } from '@shared/domain/model-preferences'
import { ArrowUp, AtSign, ChevronDownIcon as ChevronDown, FileText, FolderOpen, LoaderCircle, Plus, Settings, ShieldCheck, Terminal } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SelectField } from '@/components/ui/select-field'
import { ChatComposerActions, ChatComposerFooter, ChatComposerOption, ChatComposerSelect } from '@/components/ui/chat-composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type ComposerAgentSaveResult = { status: 'saved' | 'not-submitted' | 'unconfirmed' }
export type ComposerAgentPatch = Partial<Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'allowCommands' | 'thinkingLevel'>>
const thinkingOptions: { value: ThinkingLevel; label: string; description: string }[] = [
  { value: 'auto', label: '自动', description: '日常轻量思考，任务使用服务默认。' },
  { value: 'off', label: '关闭', description: '直接回答，优先响应速度。' },
  { value: 'low', label: '低', description: '减少思考，适合日常交流。' },
  { value: 'high', label: '高', description: '深入思考，适合复杂问题。' },
  { value: 'max', label: '最高', description: '更充分地思考，等待可能更久。' },
]
interface Props {
  api: DesktopApi; members: DigitalAgent[]; snapshot: Snapshot; group: boolean; external: boolean
  conversationReady?: boolean
  replyMode?: boolean
  busy: boolean; active: boolean; canSend: boolean; configurationLocked: boolean; mentionsVisible: boolean
  commandsVisible: boolean; onCommands(): void
  onOpenWorkspace(): void; onMentions(): void; onSettings(agent?: DigitalAgent): void; onConfigureAgent(agent: DigitalAgent): void
  onReferenceBrowser?(): void; browserReferenceBusy?: boolean
  onAddMaterial?(): void; materialsDisabled?: boolean
  onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): Promise<ComposerAgentSaveResult>; onSend(): void
}

export function ComposerToolbar(props: Props) {
  const { api, members, snapshot, group, external, busy, active, configurationLocked, onChangeAgent } = props
  const primary = members[0]
  const runningAgents = new Set(snapshot.conversations.filter(c => ['running', 'queued', 'waiting_approval'].includes(c.activity ?? '')).flatMap(c => c.agentIds))
  const locked = (agent: DigitalAgent) => busy || active || configurationLocked || !agent.active || runningAgents.has(agent.id)
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [profileError, setProfileError] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [editing, setEditing] = useState<DigitalAgent | null>(null)
  const [selection, setSelection] = useState<AgentModelSelection>({ connectionId: '', modelId: '' })
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('auto')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveUnconfirmed, setSaveUnconfirmed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkedAgent, setCheckedAgent] = useState<DigitalAgent | null>(null)
  const [checkNotice, setCheckNotice] = useState('')
  useEffect(() => {
    let current = true
    setProfileError('')
    void api.request('listLaunchProfiles', undefined).then(value => { if (current) setProfiles(value) }, failure => {
      if (current) { setProfiles([]); setProfileError(errorText(failure)) }
    })
    return () => { current = false }
  }, [api, modelOpen])
  const modelLabel = primary ? agentModelLabel(primary, snapshot.connections, profiles) : '选择模型'
  const permissionLabel = primary?.executionBackend?.kind === 'acp-local' || primary?.allowCommands ? '请求批准' : '禁止命令'
  const allowTaskOnly = Boolean(editing && !isCoreAgent(editing) && !editing.skillIds.length && !editing.knowledgeIds.length && !editing.allowCommands && !snapshot.conversations.some(conversation => conversation.kind === 'group' && conversation.agentIds.includes(editing.id)))
  const connection = snapshot.connections.find(item => item.id === selection.connectionId)
  const supportsThinking = (!selection.executionBackend || selection.executionBackend.kind === 'mastra-model') && connection && supportsThinkingControl(connection, selection.modelId)
  const selectionLocked = !editing || locked(editing) || saving || checking || saveUnconfirmed
  const openModel = (open: boolean) => {
    if (saving || checking) return
    if (open && primary && !saveUnconfirmed) {
      setEditing(primary)
      setSelection({ executionBackend: primary.executionBackend, connectionId: primary.connectionId, modelId: primary.modelId })
      setThinkingLevel(primary.thinkingLevel ?? 'auto')
      setSaveError(''); setCheckedAgent(null); setCheckNotice('')
    }
    setModelOpen(open)
  }
  const saveModel = async () => {
    if (selectionLocked || !editing || !agentModelSelectionReady(selection, snapshot.connections, profiles, allowTaskOnly)) return
    setSaving(true); setSaveError('')
    try {
      const result = await onChangeAgent(editing, { ...selection, thinkingLevel })
      if (result.status === 'saved') setModelOpen(false)
      else if (result.status === 'not-submitted') setSaveError('本次尚未提交，请等待当前操作结束后再保存。')
      else { setSaveUnconfirmed(true); setSaveError('未收到保存回执，当前选择已锁定。请只读核对当前配置，明确载入后再编辑。') }
    } catch (failure) { setSaveUnconfirmed(true); setSaveError(`未收到保存回执，当前选择已锁定：${errorText(failure)}`) }
    finally { setSaving(false) }
  }
  const checkConfiguration = async () => {
    if (!editing || checking || saving) return
    setChecking(true); setCheckedAgent(null); setCheckNotice('')
    try {
      const current = (await api.request('snapshot', undefined)).agents.find(agent => agent.id === editing.id)
      setCheckedAgent(current ?? null)
      setCheckNotice(current ? `当前配置版本为 ${current.configVersion}，原编辑基于版本 ${editing.configVersion}。这不代表原请求已确认；可明确载入当前配置后重新编辑。` : '当前员工已不可用，无法载入配置。')
    } catch (failure) { setCheckNotice(`读取当前配置失败：${errorText(failure)}`) }
    finally { setChecking(false) }
  }
  const loadConfiguration = () => {
    if (!checkedAgent || checking || saving) return
    setEditing(checkedAgent)
    setSelection({ executionBackend: checkedAgent.executionBackend, connectionId: checkedAgent.connectionId, modelId: checkedAgent.modelId })
    setThinkingLevel(checkedAgent.thinkingLevel ?? 'auto')
    setSaveUnconfirmed(false); setSaveError(''); setCheckedAgent(null)
    setCheckNotice('已载入当前已提交配置，可在此版本上重新编辑。')
  }
  return <ChatComposerFooter>
    <ChatComposerActions>
      {props.conversationReady !== false && <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" round aria-label="添加或更多操作" />}><Plus /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuGroup>
            {!external && props.onAddMaterial && <DropdownMenuItem disabled={busy || props.materialsDisabled} onClick={props.onAddMaterial}><FileText />添加文件</DropdownMenuItem>}
            {props.onReferenceBrowser && <DropdownMenuItem disabled={busy || props.browserReferenceBusy || props.materialsDisabled} onClick={props.onReferenceBrowser}><FileText />引用当前网页</DropdownMenuItem>}
            <DropdownMenuItem onClick={props.onOpenWorkspace}><FolderOpen />打开会话工作目录</DropdownMenuItem>
            {group && <DropdownMenuItem disabled={props.replyMode} onClick={props.onMentions}><AtSign />{props.mentionsVisible ? '收起成员点名' : '提及成员'}</DropdownMenuItem>}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
      {group && <Button variant="ghost" size="icon-sm" round aria-label="提及群聊成员" aria-expanded={props.mentionsVisible} disabled={props.replyMode} onClick={props.onMentions}><AtSign /></Button>}
      <Button variant="ghost" size="icon-sm" round aria-label="快捷命令" aria-expanded={props.commandsVisible} onClick={props.onCommands}><span aria-hidden="true">/</span></Button>
      {!group && !isCoreAgent(primary) && <DropdownMenu>
        <DropdownMenuTrigger render={<ChatComposerSelect kind="permission" aria-label="权限批准" />}><ShieldCheck /><span>{permissionLabel}</span></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="chat-composer-menu w-[280px] max-w-[calc(100vw-32px)] p-2" aria-label="权限批准">
          {members.map(agent => <DropdownMenuGroup key={agent.id}>
            <DropdownMenuLabel>{agent.name}的命令权限{locked(agent) ? ' · 当前不可修改' : ' · 保存到员工设置'}</DropdownMenuLabel>
            {agent.executionBackend?.kind === 'acp-local' ? <DropdownMenuItem disabled><ShieldCheck /><ChatComposerOption label="逐次批准外部请求" description="外部程序提出的权限请求，每次由你确认。" /></DropdownMenuItem> :
              <DropdownMenuRadioGroup value={agent.allowCommands ? 'ask' : 'deny'} onValueChange={value => {
                if (!locked(agent) && ['ask', 'deny'].includes(value)) onChangeAgent(agent, { allowCommands: value === 'ask' })
              }}>
                <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" value="ask" disabled={locked(agent)}><ShieldCheck /><ChatComposerOption label="请求批准" description="允许申请运行命令，每次执行前由你确认。" /></DropdownMenuRadioItem>
                <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" value="deny" disabled={locked(agent)}><Terminal /><ChatComposerOption label="禁止命令" description="不运行系统命令，保留已授权的文件与知识访问。" /></DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>}
          </DropdownMenuGroup>)}
        </DropdownMenuContent>
      </DropdownMenu>}
    </ChatComposerActions>
    <ChatComposerActions align="end">
      {!group && <Dialog open={modelOpen} onOpenChange={openModel}>
        <DialogTrigger render={<ChatComposerSelect kind="model" aria-label="选择模型" title={modelLabel} disabled={!primary} />}><span>{modelLabel}</span><ChevronDown /></DialogTrigger>
        <DialogContent showCloseButton={!saving && !checking}>
          <DialogHeader><DialogTitle>选择模型</DialogTitle><DialogDescription>{editing?.name}的运行配置{selectionLocked && !saving ? ' · 当前不可修改' : ''}</DialogDescription></DialogHeader>
          <AgentModelFields api={api} value={selection} connections={snapshot.connections} profiles={profiles} onChange={setSelection} disabled={selectionLocked} allowTaskOnly={allowTaskOnly} profileError={profileError} full />
          {supportsThinking && <Field label="思考强度" full hint={thinkingOptions.find(option => option.value === thinkingLevel)?.description}><SelectField disabled={selectionLocked} value={thinkingLevel} onValueChange={value => { const option = thinkingOptions.find(item => item.value === value); if (option) setThinkingLevel(option.value) }} options={thinkingOptions} /></Field>}
          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          {checkNotice && <p role="status" className="text-sm text-muted-foreground">{checkNotice}</p>}
          {saveUnconfirmed && <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={checking || saving} onClick={() => void checkConfiguration()}>{checking && <LoaderCircle className="spinner" />}核对当前配置</Button>{checkedAgent && <Button variant="secondary" size="sm" disabled={checking || saving} onClick={loadConfiguration}>载入当前配置</Button>}</div>}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={saving || checking} onClick={() => { setModelOpen(false); props.onSettings(editing ?? undefined) }}><Settings />管理连接</Button>
            {editing && <Button variant="ghost" size="sm" disabled={saving || checking} onClick={() => { setModelOpen(false); props.onConfigureAgent(editing) }}>{saveUnconfirmed ? '前往设置核对' : isCoreAgent(editing) ? '助手设置' : '员工设置'}</Button>}
          </div>
          <DialogFooter variant="plain"><Button variant="ghost" disabled={saving || checking} onClick={() => setModelOpen(false)}>{saveUnconfirmed ? '关闭' : '取消'}</Button><Button variant="ink" disabled={selectionLocked || !agentModelSelectionReady(selection, snapshot.connections, profiles, allowTaskOnly)} onClick={() => void saveModel()}>{saving && <LoaderCircle className="spinner" />}保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <Button variant="ink" size={external ? 'sm' : 'icon-sm'} round={!external} aria-label={external ? '执行外部任务' : '发送消息'} disabled={busy || !props.canSend} onClick={() => props.onSend()}>{busy ? <LoaderCircle className="spinner" /> : external ? '执行外部任务' : <ArrowUp />}</Button>
    </ChatComposerActions>
  </ChatComposerFooter>
}

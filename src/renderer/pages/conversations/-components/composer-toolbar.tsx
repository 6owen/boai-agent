/*
 * [INPUT]: 当前成员、连接快照、任务状态及宿主提供的配置/发送回调。
 * [OUTPUT]: 原问题补充模式锁定点名；composer仅发送消息，不展示停止本轮/停止并发送按钮；已有 API 聊天加号接入原生材料选择，空白首发/ACP 不开放；首发前不展示会话目录操作；@ 与 / 共用 Prompt Bar；核心助手隐藏命令权限菜单；普通员工权限仅呈现已提交的禁止命令/逐次批准，模型/思考强度、配置锁定及普通发送语义。
 * [POS]: 会话私有工具栏；复用 ui 的 composer 和 DropdownMenu，真实配置写入由 AppShell 管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { isCoreAgent } from '@shared/domain/core-agent'
import { supportsThinkingControl, type ThinkingLevel } from '@shared/domain/model-preferences'
import { ArrowUp, AtSign, ChevronDownIcon as ChevronDown, FileText, FolderOpen, LoaderCircle, Plus, ShieldCheck, Terminal } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ChatComposerActions, ChatComposerFooter, ChatComposerOption, ChatComposerSelect } from '@/components/ui/chat-composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type ComposerAgentPatch = Partial<Pick<DigitalAgent, 'connectionId' | 'modelId' | 'allowCommands' | 'thinkingLevel'>>
const thinkingOptions: { value: ThinkingLevel; label: string; description: string }[] = [
  { value: 'auto', label: '自动', description: '日常轻量思考，任务使用服务默认。' },
  { value: 'off', label: '关闭', description: '直接回答，优先响应速度。' },
  { value: 'low', label: '低', description: '减少思考，适合日常交流。' },
  { value: 'high', label: '高', description: '深入思考，适合复杂问题。' },
  { value: 'max', label: '最高', description: '更充分地思考，等待可能更久。' },
]
interface Props {
  members: DigitalAgent[]; snapshot: Snapshot; group: boolean; external: boolean
  conversationReady?: boolean
  replyMode?: boolean
  busy: boolean; active: boolean; canSend: boolean; configurationLocked: boolean; mentionsVisible: boolean
  commandsVisible: boolean; onCommands(): void
  onOpenWorkspace(): void; onMentions(): void; onSettings(): void
  onAddMaterial?(): void; materialsDisabled?: boolean
  onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): void; onSend(): void
}

export function ComposerToolbar(props: Props) {
  const { members, snapshot, group, external, busy, active, configurationLocked, onChangeAgent } = props
  const primary = members[0]
  const runningAgents = new Set(snapshot.conversations.filter(c => ['running', 'queued', 'waiting_approval'].includes(c.activity ?? '')).flatMap(c => c.agentIds))
  const locked = (agent: DigitalAgent) => busy || active || configurationLocked || !agent.active || runningAgents.has(agent.id)
  const modelLabel = external ? '外部 Agent' : primary?.modelId || snapshot.connections.find(c => c.id === primary?.connectionId)?.defaultModel || '选择模型'
  const permissionLabel = external || primary?.allowCommands ? '请求批准' : '禁止命令'
  const choices = snapshot.connections.flatMap(connection => {
    const custom = [...new Set(snapshot.agents.filter(a => a.connectionId === connection.id).map(a => a.modelId).filter(model => model && model !== connection.defaultModel))]
    const models = [...(connection.defaultModel ? [{ modelId: '', label: connection.defaultModel }] : []), ...custom.map(modelId => ({ modelId, label: modelId }))]
    return models.map(model => ({ ...model, connectionId: connection.id, connectionName: connection.name, value: JSON.stringify([connection.id, model.modelId]), ready: connection.provider === 'openai-compatible' ? Boolean(connection.baseUrl) : connection.hasApiKey }))
  })
  const selectedModel = (agent: DigitalAgent) => JSON.stringify([agent.connectionId, agent.modelId === snapshot.connections.find(c => c.id === agent.connectionId)?.defaultModel ? '' : agent.modelId])
  const supportsThinking = (agent: DigitalAgent) => {
    const connection = snapshot.connections.find(item => item.id === agent.connectionId)
    return connection && supportsThinkingControl(connection, agent.modelId)
  }
  return <ChatComposerFooter>
    <ChatComposerActions>
      {props.conversationReady !== false && <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" round aria-label="添加或更多操作" />}><Plus /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuGroup>
            {!external && props.onAddMaterial && <DropdownMenuItem disabled={busy || props.materialsDisabled} onClick={props.onAddMaterial}><FileText />添加文件</DropdownMenuItem>}
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
      {!group && <DropdownMenu>
        <DropdownMenuTrigger render={<ChatComposerSelect kind="model" aria-label="选择模型" title={modelLabel} />}><span>{modelLabel}</span><ChevronDown /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="chat-composer-menu w-[256px] max-w-[calc(100vw-32px)] p-2" aria-label="选择模型">
          {members.map(agent => <DropdownMenuGroup key={agent.id}>
            {agent.executionBackend?.kind === 'acp-local' ? <DropdownMenuItem disabled><ChatComposerOption label="由外部 Agent 管理" description="模型在外部程序中选择。" /></DropdownMenuItem> : <>
              {!choices.length && <DropdownMenuItem disabled>还没有配置模型连接</DropdownMenuItem>}
              <DropdownMenuRadioGroup value={selectedModel(agent)} onValueChange={value => {
                const choice = choices.find(c => c.value === value)
                if (choice?.ready && !locked(agent)) onChangeAgent(agent, { connectionId: choice.connectionId, modelId: choice.modelId })
              }}>
                {choices.map(choice => <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" key={choice.value} value={choice.value} disabled={!choice.ready || locked(agent)}><ChatComposerOption label={choice.label} description={`${choice.connectionName}${choice.ready ? '' : ' · 连接尚未配置完成'}`} /></DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              {supportsThinking(agent) && <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="py-2" disabled={locked(agent)}><span>思考强度</span><span className="ml-auto text-muted-foreground">{thinkingOptions.find(option => option.value === (agent.thinkingLevel ?? 'auto'))?.label}</span></DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="chat-composer-menu w-[240px] max-w-[calc(100vw-32px)] p-2" aria-label="思考强度">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>保存到当前员工</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={agent.thinkingLevel ?? 'auto'} onValueChange={value => {
                        const option = thinkingOptions.find(item => item.value === value)
                        if (option && !locked(agent)) onChangeAgent(agent, { thinkingLevel: option.value })
                      }}>
                        {thinkingOptions.map(option => <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" key={option.value} value={option.value} disabled={locked(agent)}><ChatComposerOption label={option.label} description={option.description} /></DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>}
            </>}
          </DropdownMenuGroup>)}
          <DropdownMenuSeparator />
          <DropdownMenuGroup><DropdownMenuItem onClick={props.onSettings}><Plus />管理模型连接</DropdownMenuItem></DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
      <Button variant="ink" size={external ? 'sm' : 'icon-sm'} round={!external} aria-label={external ? '执行外部任务' : '发送消息'} disabled={busy || !props.canSend} onClick={() => props.onSend()}>{busy ? <LoaderCircle className="spinner" /> : external ? '执行外部任务' : <ArrowUp />}</Button>
    </ChatComposerActions>
  </ChatComposerFooter>
}

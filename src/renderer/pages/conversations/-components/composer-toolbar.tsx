/*
 * [INPUT]: React 本地状态、当前成员、连接快照、任务状态及宿主提供的配置/发送回调。
 * [OUTPUT]: 紧凑权限/模型菜单、仅前端勾选的完全访问选项和发送/停止；模型菜单只保留选择与连接管理，群聊逐成员配置。
 * [POS]: 会话私有工具栏；复用 ui 的 composer 和 DropdownMenu，真实配置写入由 AppShell 管理，完全访问预览不写入权限。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { ArrowUp, AtSign, ChevronDownIcon as ChevronDown, FolderOpen, LoaderCircle, Plus, ShieldCheck, Square, Terminal } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ChatComposerActions, ChatComposerFooter, ChatComposerOption, ChatComposerSelect } from '@/components/ui/chat-composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type ComposerAgentPatch = Partial<Pick<DigitalAgent, 'connectionId' | 'modelId' | 'allowCommands'>>
interface Props {
  members: DigitalAgent[]; snapshot: Snapshot; group: boolean; external: boolean
  busy: boolean; active: boolean; canSend: boolean; configurationLocked: boolean; mentionsVisible: boolean
  onOpenWorkspace(): void; onMentions(): void; onSettings(): void
  onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): void; onSend(stopPrevious?: boolean): void; onStop(): void
}

export function ComposerToolbar(props: Props) {
  const { members, snapshot, group, external, busy, active, configurationLocked, onChangeAgent } = props
  const [fullAccessPreview, setFullAccessPreview] = useState<Record<string, boolean>>({})
  const primary = members[0]
  const previewingFullAccess = !external && primary && fullAccessPreview[primary.id]
  const runningAgents = new Set(snapshot.conversations.filter(c => ['running', 'queued', 'waiting_approval'].includes(c.activity ?? '')).flatMap(c => c.agentIds))
  const locked = (agent: DigitalAgent) => busy || active || configurationLocked || !agent.active || runningAgents.has(agent.id)
  const modelLabel = group ? '成员模型' : external ? '外部 Agent' : primary?.modelId || snapshot.connections.find(c => c.id === primary?.connectionId)?.defaultModel || '选择模型'
  const permissionLabel = group ? '权限批准' : previewingFullAccess ? '完全访问' : external || primary?.allowCommands ? '请求批准' : '禁止命令'
  const choices = snapshot.connections.flatMap(connection => {
    const custom = [...new Set(snapshot.agents.filter(a => a.connectionId === connection.id).map(a => a.modelId).filter(model => model && model !== connection.defaultModel))]
    const models = [...(connection.defaultModel ? [{ modelId: '', label: connection.defaultModel }] : []), ...custom.map(modelId => ({ modelId, label: modelId }))]
    return models.map(model => ({ ...model, connectionId: connection.id, connectionName: connection.name, value: JSON.stringify([connection.id, model.modelId]), ready: connection.provider === 'openai-compatible' ? Boolean(connection.baseUrl) : connection.hasApiKey }))
  })
  const selectedModel = (agent: DigitalAgent) => JSON.stringify([agent.connectionId, agent.modelId === snapshot.connections.find(c => c.id === agent.connectionId)?.defaultModel ? '' : agent.modelId])
  return <ChatComposerFooter>
    <ChatComposerActions>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" round aria-label="添加或更多操作" />}><Plus /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={props.onOpenWorkspace}><FolderOpen />打开会话工作目录</DropdownMenuItem>
            {group && <DropdownMenuItem onClick={props.onMentions}><AtSign />{props.mentionsVisible ? '收起成员点名' : '提及成员'}</DropdownMenuItem>}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<ChatComposerSelect kind="permission" data-permission={!group && previewingFullAccess ? 'full' : undefined} aria-label="权限批准" />}><ShieldCheck /><span>{permissionLabel}</span></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="chat-composer-menu w-[280px] max-w-[calc(100vw-32px)] p-2" aria-label="权限批准">
          {members.map(agent => <DropdownMenuGroup key={agent.id}>
            <DropdownMenuLabel>{agent.name}的命令权限{locked(agent) ? ' · 当前不可修改' : ' · 保存到员工设置'}</DropdownMenuLabel>
            {agent.executionBackend?.kind === 'acp-local' ? <DropdownMenuItem disabled><ShieldCheck /><ChatComposerOption label="逐次批准外部请求" description="外部程序提出的权限请求，每次由你确认。" /></DropdownMenuItem> :
              <DropdownMenuRadioGroup value={fullAccessPreview[agent.id] ? 'full' : agent.allowCommands ? 'ask' : 'deny'} onValueChange={value => {
                if (locked(agent) || !['ask', 'deny', 'full'].includes(value)) return
                setFullAccessPreview(previous => ({ ...previous, [agent.id]: value === 'full' }))
                // Full access is a UI preview; never translate it into a persisted permission.
                if (value !== 'full') onChangeAgent(agent, { allowCommands: value === 'ask' })
              }}>
                <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" value="ask" disabled={locked(agent)}><ShieldCheck /><ChatComposerOption label="请求批准" description="允许申请运行命令，每次执行前由你确认。" /></DropdownMenuRadioItem>
                <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" value="deny" disabled={locked(agent)}><Terminal /><ChatComposerOption label="禁止命令" description="不运行系统命令，保留已授权的文件与知识访问。" /></DropdownMenuRadioItem>
                <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" data-permission="full" value="full" disabled={locked(agent)}><ShieldCheck /><ChatComposerOption label="完全访问权限" description="可不受限制地访问沙盒内的网络和文件。" /></DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>}
          </DropdownMenuGroup>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </ChatComposerActions>
    <ChatComposerActions align="end">
      {active && <><Button variant="secondary" size="sm" disabled={busy} onClick={props.onStop}><Square />停止本轮</Button>{props.canSend && <Button variant="ghost" size="sm" disabled={busy} onClick={() => props.onSend(true)}>停止并发送</Button>}</>}
      <DropdownMenu>
        <DropdownMenuTrigger render={<ChatComposerSelect kind="model" aria-label="选择模型" title={modelLabel} />}><span>{modelLabel}</span><ChevronDown /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="chat-composer-menu w-[256px] max-w-[calc(100vw-32px)] p-2" aria-label="选择模型">
          {members.map(agent => <DropdownMenuGroup key={agent.id}>
            {group && <DropdownMenuLabel>{agent.name}</DropdownMenuLabel>}
            {agent.executionBackend?.kind === 'acp-local' ? <DropdownMenuItem disabled><ChatComposerOption label="由外部 Agent 管理" description="模型在外部程序中选择。" /></DropdownMenuItem> : <>
              {!choices.length && <DropdownMenuItem disabled>还没有配置模型连接</DropdownMenuItem>}
              <DropdownMenuRadioGroup value={selectedModel(agent)} onValueChange={value => {
                const choice = choices.find(c => c.value === value)
                if (choice?.ready && !locked(agent)) onChangeAgent(agent, { connectionId: choice.connectionId, modelId: choice.modelId })
              }}>
                {choices.map(choice => <DropdownMenuRadioItem closeOnClick className="gap-3 py-2" key={choice.value} value={choice.value} disabled={!choice.ready || locked(agent)}><ChatComposerOption label={choice.label} description={`${choice.connectionName}${choice.ready ? '' : ' · 连接尚未配置完成'}`} /></DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </>}
          </DropdownMenuGroup>)}
          <DropdownMenuSeparator />
          <DropdownMenuGroup><DropdownMenuItem onClick={props.onSettings}><Plus />管理模型连接</DropdownMenuItem></DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ink" size={external ? 'sm' : 'icon-sm'} round={!external} aria-label={external ? '执行外部任务' : '发送消息'} disabled={busy || !props.canSend} onClick={() => props.onSend()}>{busy ? <LoaderCircle className="spinner" /> : external ? '执行外部任务' : <ArrowUp />}</Button>
    </ChatComposerActions>
  </ChatComposerFooter>
}

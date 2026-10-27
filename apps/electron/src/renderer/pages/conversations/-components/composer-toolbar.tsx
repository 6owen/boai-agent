/*
 * [OUTPUT]: 2026-10-27 默认关闭语音插件接线、可信主窗口与原草稿/生命周期边界。
 * [OUTPUT]: @按钮仅提及会话员工，$按钮引用技能/文件/提示词，两类候选与显隐状态独立。
 * [INPUT]: 当前员工、连接、运行状态和原消息/配置回调。
 * [OUTPUT]: 附件、数据源指定、命令、技能/文件提及及当前连接内模型选择；数据源选择不改变绑定；暂时隐藏权限菜单，原权限值保持。
 * [POS]: 会话与核心首发共用的轻量工具栏；连接管理归员工设置。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { ReactNode } from 'react'
import type { AgentRun, DigitalAgent, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ComposerReference } from '@boai/shared/domain/composer-references'
import { supportsDataSources } from '@boai/shared/domain/sources'
import { ArrowUp, AtSign, FileText, FolderOpen, LoaderCircle, Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ChatComposerActions, ChatComposerFooter } from '@/components/ui/chat-composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ComposerModelMenu } from './composer-model-menu'
import { ComposerSourcePicker } from './composer-source-picker'

export type ComposerAgentSaveResult = { status: 'saved'; agent: DigitalAgent } | { status: 'not-submitted' | 'unconfirmed' }
export type ComposerAgentPatch = Partial<Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'allowCommands' | 'thinkingLevel' | 'nativeOptions'>>
interface Props {
  voice?: ReactNode
  api: DesktopApi; members: DigitalAgent[]; snapshot: Snapshot; group: boolean; external: boolean; runs?: AgentRun[]
  conversationReady?: boolean; replyMode?: boolean
  busy: boolean; active: boolean; canSend: boolean; configurationLocked: boolean; mentionsVisible: boolean
  commandsVisible: boolean; onCommands(): void
  referencesVisible: boolean; onReferences(): void
  onOpenWorkspace(): void; onMentions(): void; onSettings(agent?: DigitalAgent): void; onConfigureAgent(agent: DigitalAgent): void
  onReferenceBrowser?(): void; browserReferenceBusy?: boolean
  onAddMaterial?(): void; materialsDisabled?: boolean
  pageActive?: boolean; sourcesDisabled?: boolean; onSelectSource?(reference: ComposerReference): void
  onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): Promise<ComposerAgentSaveResult>; onSend(): void
}
export function ComposerToolbar(props: Props) {
  const { members, snapshot, group, external, busy, active, configurationLocked } = props
  const primary = members[0]
  const running = primary && snapshot.conversations.some(room => room.agentIds.includes(primary.id) && ['running', 'queued', 'waiting_approval'].includes(room.activity ?? ''))
  return <ChatComposerFooter>
    <ChatComposerActions>
      {props.conversationReady !== false && <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" round aria-label="添加或更多操作" />}><Plus /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56"><DropdownMenuGroup>
          {!external && props.onAddMaterial && <DropdownMenuItem disabled={busy || props.materialsDisabled} onClick={props.onAddMaterial}><FileText />添加文件</DropdownMenuItem>}
          {props.onReferenceBrowser && <DropdownMenuItem disabled={busy || props.browserReferenceBusy || props.materialsDisabled} onClick={props.onReferenceBrowser}><FileText />引用当前网页</DropdownMenuItem>}
          <DropdownMenuItem onClick={props.onOpenWorkspace}><FolderOpen />打开会话工作目录</DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>}
      {!group && !external && primary && supportsDataSources(primary.executionBackend?.kind) && props.onSelectSource && <ComposerSourcePicker key={primary.id} api={props.api} agent={primary} active={props.pageActive} disabled={busy || props.sourcesDisabled || props.replyMode} onSelect={props.onSelectSource} />}
      <Button variant="ghost" size="icon-sm" round aria-label="快捷命令" aria-expanded={props.commandsVisible} onClick={props.onCommands}><span aria-hidden="true">/</span></Button>
      {!external && <Button variant="ghost" size="icon-sm" round aria-label="引用技能、文件和提示词" aria-expanded={props.referencesVisible} disabled={props.replyMode} onClick={props.onReferences}><span aria-hidden="true">$</span></Button>}
      {!external && group && <Button variant="ghost" size="icon-sm" round aria-label="提及群聊成员" aria-expanded={props.mentionsVisible} disabled={props.replyMode} onClick={props.onMentions}><AtSign /></Button>}
      {/* 权限模式暂不展示；不修改员工已保存的权限，真实审批仍由原执行入口办理。 */}
    </ChatComposerActions>
    <ChatComposerActions align="end">
      {props.voice}
      {!group && primary && <ComposerModelMenu key={primary.id} api={props.api} agent={primary} snapshot={snapshot} runs={props.runs} locked={Boolean(busy || active || configurationLocked || !primary.active || running)} onSave={props.onChangeAgent} onConfigure={props.onConfigureAgent} />}
      <Button variant="ink" size={external ? 'sm' : 'icon-sm'} round={!external} aria-label={external ? '执行外部任务' : '发送消息'} disabled={busy || !props.canSend} onClick={() => props.onSend()}>{busy ? <LoaderCircle className="spinner" /> : external ? '执行外部任务' : <ArrowUp />}</Button>
    </ChatComposerActions>
  </ChatComposerFooter>
}

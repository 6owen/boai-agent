/*
 * [OUTPUT]: 项目入口显示已保存位置，忙态阻止目录切换和新发送；不改变授权或输入草稿。
 * [OUTPUT]: 2026-11-06 加号直接上传文件并延迟500ms显示Tooltip，不再提供更多操作菜单。
 * [OUTPUT]: 当前执行补充使用独立图标Tooltip，沿当前输入草稿并保留普通发送。
 * [OUTPUT]: 2026-10-27 默认关闭语音插件接线、可信主窗口与原草稿/生命周期边界。
 * [OUTPUT]: 恢复原有$资源菜单按钮，知识资料只由右侧面板添加；上传、数据源、快捷命令和群成员提及保持。
 * [INPUT]: 当前员工、连接、运行状态和原消息/配置回调。
 * [OUTPUT]: 附件、数据源指定、命令、成员提及及当前连接内模型选择；数据源选择不改变绑定；暂时隐藏权限菜单，原权限值保持。
 * [POS]: 会话与核心首发共用的轻量工具栏；连接管理归员工设置。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { ReactNode } from 'react'
import type { AgentRun, DigitalAgent, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ComposerReference } from '@boai/shared/domain/composer-references'
import { supportsDataSources } from '@boai/shared/domain/sources'
import { ArrowUp, AtSign, LoaderCircle, Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ChatComposerActions, ChatComposerFooter } from '@/components/ui/chat-composer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ComposerModelMenu } from './composer-model-menu'
import { ComposerSourcePicker } from './composer-source-picker'

export type ComposerAgentSaveResult = { status: 'saved'; agent: DigitalAgent } | { status: 'not-submitted' | 'unconfirmed' }
export type ComposerAgentPatch = Partial<Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'allowCommands' | 'thinkingLevel' | 'nativeOptions' | 'defaultProjectDirectory'>>
interface Props {
  onSteer?(): void
  voice?: ReactNode
  project?: ReactNode
  api: DesktopApi; members: DigitalAgent[]; snapshot: Snapshot; group: boolean; external: boolean; runs?: AgentRun[]
  conversationReady?: boolean; replyMode?: boolean
  busy: boolean; active: boolean; canSend: boolean; configurationLocked: boolean; mentionsVisible: boolean
  commandsVisible: boolean; onCommands(): void
  referencesVisible: boolean; onReferences(): void
  onMentions(): void; onSettings(agent?: DigitalAgent): void; onConfigureAgent(agent: DigitalAgent): void
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
      {props.conversationReady !== false && !external && <Tooltip>
        <TooltipTrigger delay={500} render={<Button variant="ghost" size="icon-sm" round aria-label="上传文件" disabled={busy || props.materialsDisabled || !props.onAddMaterial} onClick={props.onAddMaterial} />}><Plus /></TooltipTrigger>
        <TooltipContent side="top">上传文件</TooltipContent>
      </Tooltip>}
      {!group && !external && primary && supportsDataSources(primary.executionBackend?.kind) && props.onSelectSource && <ComposerSourcePicker key={primary.id} api={props.api} agent={primary} active={props.pageActive} disabled={busy || props.sourcesDisabled || props.replyMode} onSelect={props.onSelectSource} />}
      <Button variant="ghost" size="icon-sm" round aria-label="快捷命令" aria-expanded={props.commandsVisible} onClick={props.onCommands}><span aria-hidden="true">/</span></Button>
      {!external && <Button variant="ghost" size="icon-sm" round aria-label="引用技能、文件和提示词" aria-expanded={props.referencesVisible} disabled={props.replyMode} onClick={props.onReferences}><span aria-hidden="true">$</span></Button>}
      {!external && group && <Button variant="ghost" size="icon-sm" round aria-label="提及群聊成员" aria-expanded={props.mentionsVisible} disabled={props.replyMode} onClick={props.onMentions}><AtSign /></Button>}
      {props.project}
      {/* 权限模式暂不展示；不修改员工已保存的权限，真实审批仍由原执行入口办理。 */}
    </ChatComposerActions>
    <ChatComposerActions align="end">
      {props.onSteer && <Tooltip>
        <TooltipTrigger delay={500} render={<Button variant="ghost" size="icon-sm" round aria-label="补充到当前执行" disabled={busy || !props.canSend} onClick={props.onSteer} />}><ArrowUp className="rotate-45" /></TooltipTrigger>
        <TooltipContent side="top">补充到当前执行</TooltipContent>
      </Tooltip>}
      {props.voice}
      {!group && primary && <ComposerModelMenu key={primary.id} api={props.api} agent={primary} snapshot={snapshot} runs={props.runs} locked={Boolean(busy || active || configurationLocked || !primary.active || running)} onSave={props.onChangeAgent} onConfigure={props.onConfigureAgent} />}
      <Button variant="ink" size={external ? 'sm' : 'icon-sm'} round={!external} aria-label={external ? '执行外部任务' : '发送消息'} disabled={busy || !props.canSend} onClick={() => props.onSend()}>{busy ? <LoaderCircle className="spinner" /> : external ? '执行外部任务' : <ArrowUp />}</Button>
    </ChatComposerActions>
  </ChatComposerFooter>
}

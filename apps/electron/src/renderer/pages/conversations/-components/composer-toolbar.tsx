/*
 * [OUTPUT]: 项目目录统一在员工配置维护，输入框不提供目录切换入口。
 * [OUTPUT]: 加号菜单提供附件和四个带滚动渐隐的纯文字子菜单，发送按钮使用主题主色。
 * [OUTPUT]: 当前执行补充使用独立图标Tooltip，沿当前输入草稿并保留普通发送。
 * [OUTPUT]: 2026-10-27 默认关闭语音插件接线、可信主窗口与原草稿/生命周期边界。
 * [OUTPUT]: 恢复原有$资源菜单按钮，知识资料只由右侧面板添加；上传、数据源、快捷命令和群成员提及保持。
 * [INPUT]: 当前员工、连接、运行状态和原消息/配置回调。
 * [OUTPUT]: 附件、数据源指定、命令、成员提及及当前连接内模型选择；数据源选择不改变绑定；暂时隐藏权限菜单，原权限值保持。
 * [POS]: 会话与核心首发共用的轻量工具栏；连接管理归员工设置。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AgentRun, DigitalAgent, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ComposerReference } from '@boai/shared/domain/composer-references'
import { supportsDataSources } from '@boai/shared/domain/sources'
import { ArrowUp, FileText, LoaderCircle, Plus, Terminal, Zap } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ChatComposerActions, ChatComposerFooter } from '@/components/ui/chat-composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ComposerModelMenu } from './composer-model-menu'
import { ComposerSourceMenu } from './composer-source-picker'
import { ComposerSubmenuContent } from './composer-submenu'

export type ComposerAgentSaveResult = { status: 'saved'; agent: DigitalAgent } | { status: 'not-submitted' | 'unconfirmed' }
export type ComposerAgentPatch = Partial<Pick<DigitalAgent, 'executionBackend' | 'connectionId' | 'modelId' | 'allowCommands' | 'thinkingLevel' | 'nativeOptions'>>
interface MenuChoice { id: string; name: string; select(): void }
export interface ComposerMenuChoices {
  skills: MenuChoice[]
  prompts: MenuChoice[]
  commands: MenuChoice[]
  referencesBlocked: boolean
  loadingPrompts: boolean
  onPromptsOpenChange(open: boolean): void
  onSelectSource(reference: ComposerReference): void
}

function ComposerChoiceMenu({ label, icon: Icon, items, empty, onOpenChange, onChoose }: {
  label: string; icon: typeof FileText; items: MenuChoice[]; empty: string
  onOpenChange?(open: boolean): void; onChoose(action: () => void): void
}) {
  return <DropdownMenuSub onOpenChange={onOpenChange}>
    <DropdownMenuSubTrigger><Icon />{label}</DropdownMenuSubTrigger>
    <ComposerSubmenuContent>
      {items.length ? items.map(item => <DropdownMenuItem key={item.id} onClick={() => onChoose(item.select)}>
        <span className="truncate">{item.name}</span>
      </DropdownMenuItem>) : <DropdownMenuItem disabled>{empty}</DropdownMenuItem>}
    </ComposerSubmenuContent>
  </DropdownMenuSub>
}

interface Props {
  onSteer?(): void
  voice?: ReactNode
  api: DesktopApi; members: DigitalAgent[]; snapshot: Snapshot; group: boolean; external: boolean; runs?: AgentRun[]
    busy: boolean; active: boolean; canSend: boolean; configurationLocked: boolean
  choices: ComposerMenuChoices
  onSettings(agent?: DigitalAgent): void; onConfigureAgent(agent: DigitalAgent): void
  onAddMaterial?(): void; materialsDisabled?: boolean
  pageActive?: boolean; sourcesDisabled?: boolean
  onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): Promise<ComposerAgentSaveResult>; onSend(): void
}
export function ComposerToolbar(props: Props) {
  const { members, snapshot, group, external, busy, active, configurationLocked, choices } = props
  const primary = members[0]
  const running = primary && snapshot.conversations.some(room => room.agentIds.includes(primary.id) && ['running', 'queued', 'waiting_approval'].includes(room.activity ?? ''))
  const [menuOpen, setMenuOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const pendingAction = useRef<(() => void) | null>(null)
  const upload = !external && Boolean(props.onAddMaterial)
  const sourceAgent = !group && !external && !busy && !props.sourcesDisabled && !choices.referencesBlocked && primary?.active && supportsDataSources(primary.executionBackend?.kind) ? primary : undefined
  useLayoutEffect(() => {
    if (props.pageActive === false) {
      pendingAction.current = null
      setMenuOpen(false)
    }
  }, [props.pageActive])
  const afterMenuClose = (action: () => void) => {
    pendingAction.current = action
    setMenuOpen(false)
  }
  const completeMenuClose = (open: boolean) => {
    if (open) return
    choices.onPromptsOpenChange(false)
    const action = pendingAction.current
    pendingAction.current = null
    if (action && trigger.current?.getClientRects().length && props.pageActive !== false) action()
  }
  return <ChatComposerFooter>
    <ChatComposerActions>
      <DropdownMenu open={menuOpen} onOpenChange={open => {
        if (open) pendingAction.current = null
        setMenuOpen(open)
      }} onOpenChangeComplete={completeMenuClose}>
        <Tooltip>
          <TooltipTrigger delay={500} render={<DropdownMenuTrigger render={<Button ref={trigger} type="button" variant="ghost" size="icon-sm" round aria-label="添加或更多操作" />} />}><Plus /></TooltipTrigger>
          <TooltipContent side="top">添加内容</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-48">
          <DropdownMenuItem disabled={!upload || busy || props.materialsDisabled || !props.onAddMaterial} onClick={() => afterMenuClose(() => props.onAddMaterial?.())}><FileText />插入图片或文件</DropdownMenuItem>
          <DropdownMenuSeparator />
          <ComposerChoiceMenu label="技能" icon={Zap} items={choices.skills} empty="没有可用技能" onChoose={afterMenuClose} />
          <ComposerSourceMenu api={props.api} agent={sourceAgent} active={menuOpen && props.pageActive !== false} onSelect={choices.onSelectSource} onChoose={afterMenuClose} />
          <ComposerChoiceMenu label="提示词" icon={FileText} items={choices.prompts} empty={choices.loadingPrompts ? '正在读取提示词…' : '没有可用提示词'} onOpenChange={choices.onPromptsOpenChange} onChoose={afterMenuClose} />
          <ComposerChoiceMenu label="快捷命令" icon={Terminal} items={choices.commands} empty="没有可用命令" onChoose={afterMenuClose} />
        </DropdownMenuContent>
      </DropdownMenu>
    </ChatComposerActions>
    <ChatComposerActions align="end">
      {props.onSteer && <Tooltip>
        <TooltipTrigger delay={500} render={<Button variant="ghost" size="icon-sm" round aria-label="补充到当前执行" disabled={busy || !props.canSend} onClick={props.onSteer} />}><ArrowUp className="rotate-45" /></TooltipTrigger>
        <TooltipContent side="top">补充到当前执行</TooltipContent>
      </Tooltip>}
      {props.voice}
      {!group && primary && <ComposerModelMenu key={primary.id} api={props.api} agent={primary} snapshot={snapshot} runs={props.runs} locked={Boolean(busy || active || configurationLocked || !primary.active || running)} onSave={props.onChangeAgent} onConfigure={props.onConfigureAgent} />}
      <Button variant={external ? 'ink' : 'default'} size={external ? 'sm' : 'icon-sm'} round={!external} aria-label={external ? '执行外部任务' : '发送消息'} disabled={busy || !props.canSend} onClick={() => props.onSend()}>{busy ? <LoaderCircle className="spinner" /> : external ? '执行外部任务' : <ArrowUp />}</Button>
    </ChatComposerActions>
  </ChatComposerFooter>
}

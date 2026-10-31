/*
 * [OUTPUT]: 有界会话阅读提取到共享hook，渠道与任务保持独立窗口和隐藏停读。
 * [OUTPUT]: 共享聊天发送可回到渠道最新窗口，清除旧定位/分页；迟到响应不能覆盖后续手动阅读位置。
 * [OUTPUT]: 共享ChatView允许主列表历史加载中保持固定布局，渠道ChatWindow仍显式要求真实ConversationView。
 * [OUTPUT]: 渠道列表Popover省略重复标题，清除外层padding/gap以统一紧凑8px内边距。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 同一有界阅读生命周期用于渠道镜像与独立内部讨论，后者不显示渠道列表或嵌套入口。
 * [OUTPUT]: 未选渠道/不可用复用IllustratedEmpty和会话标题布局，ScrollArea正文保留标题渐隐；列表入口始终可用。
 * [OUTPUT]: 渠道聊天占满右侧，列表位于标题按钮Popover；选择关闭、搜索/折叠状态保留，隐藏渠道详情时停止阅读。
 * [INPUT]: 员工渠道标签的固定会话/消息目标、快照及共用列表/聊天渲染回调。
 * [OUTPUT]: 右侧渠道列表与聊天独立选中/滚动/有界阅读；隐藏停读，迟到响应与清理隔离，不改主聊天路由或复制发送逻辑。
 * [POS]: 员工渠道详情标签的阅读生命周期，业务操作仍由AppShell共用入口处理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DigitalAgent } from '@boai/shared/domain'
import { isChannelConversation } from '@boai/shared/domain/conversation-list'
import type { ConversationView } from '@boai/shared/domain/reading'
import { useConversationWindow } from './use-conversation-window'
import { ConversationList } from '@/pages/conversations/-components/conversation-list'
import { ChatView } from '@/pages/conversations/-components/chat-view'
import { Banner, Loading } from '@/components/common'
import type { DetailTarget } from './tabs-state'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { ConversationHeaderLayout } from '@/pages/conversations/-components/conversation-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import { List } from '@/components/icons'

type ChatProps = ComponentProps<typeof ChatView>
export type ChannelChatWindow = Pick<ChatProps, 'detail' | 'onReading' | 'onLocation' | 'onPage' | 'onLatest' | 'paging' | 'pageEdges' | 'restoreAnchor' | 'scrollPosition' | 'onScrollPosition' | 'pageActive' | 'focusMessage' | 'focusApproval'> & { detail: ConversationView }

export function ChannelsTab({ api, agent, target, active, chatActive, listProps, renderChat, onMaterials, internal = false }: {
  internal?: boolean
  api: DesktopApi; agent: DigitalAgent; target: Extract<DetailTarget, { type: 'channels' }>; active: boolean; chatActive: boolean
  listProps: ComponentProps<typeof ConversationList>
  renderChat(window: ChannelChatWindow, headerActions: ReactNode): ReactNode
  onMaterials: (id: string, materials: NonNullable<ConversationView['materials']>) => void
}) {
  const id = target.conversationId
  const available = listProps.snapshot.conversations.some(room => room.id === id && (internal ? room.purpose === 'channel-internal' : isChannelConversation(room)) && !room.list?.hidden && room.agentIds.includes(agent.id))
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => { setPickerOpen(false) }, [active, target.requestId])
  const { window, error } = useConversationWindow({ api, id, active, chatActive, available, target, onMaterials })
  const current = window?.detail
  const picker = internal ? null : <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="选择渠道会话" title="渠道会话" />}><List /></PopoverTrigger>
  return <Popover open={active && pickerOpen} onOpenChange={setPickerOpen}>
    <div className="channel-workspace" aria-label={`${agent.name}的渠道面板`} hidden={!active}>
    <div className="conversation-stage channel-chat-stage">
      {current ? renderChat(window!, picker) : <div className="chat-panel channel-empty-panel">
        <ConversationHeaderLayout title={`${agent.name}的渠道`}>{picker}</ConversationHeaderLayout>
        <ScrollArea className="channel-empty-scroll" viewportProps={{ className: 'scroll-fade-t scroll-fade-6', 'aria-label': '渠道内容' }} contentProps={{ className: 'flex flex-col' }}>
          {error && <div className="px-6 pt-8"><Banner>{error}</Banner></div>}
          {available && !error ? <div className="flex flex-1 items-center justify-center"><Loading>正在载入渠道会话…</Loading></div> : <IllustratedEmpty kind="conversations" title={id ? '该渠道会话已不可用' : '暂无渠道会话'} />}
        </ScrollArea>
      </div>}
      {current && error && <Banner>{error}</Banner>}
    </div>
    </div>
    {!internal && <PopoverContent keepMounted align="end" className="channel-picker p-0 gap-0" aria-label="选择渠道会话" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}>
      <ConversationList {...listProps} showHeading={false} onBack={undefined} channelAgent={agent} selectedId={id ?? null} selectionRequest={target.requestId}
        onSelect={id => { listProps.onSelect(id); setPickerOpen(false) }} />
    </PopoverContent>}
  </Popover>
}

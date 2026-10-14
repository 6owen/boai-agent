/*
 * [OUTPUT]: 2026-10-14现行分离合同：本人ID仅用于平台消息归属显示，不再决定主私聊路由或历史合并。
 * [OUTPUT]: 2026-10-14 明确本人账号关联与渠道消息本人展示归属，外部消息不获得桌面管理权限。
 * [OUTPUT]: 外部群来源按接入员工隔离，旧无agentId记录保留兼容；普通回复链不改变房间身份。
 * [INPUT]: 已保存员工与平台安装、外部发送者和平台会话身份。
 * [OUTPUT]: 渠道绑定/连接状态、平台事件及消息受理观察、可信消息来源、独立平台发送回执；公开合同不含已保存凭据或入站正文。
 * [POS]: 第16组跨进程渠道合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export const CHANNEL_PLATFORMS = ['feishu', 'lark', 'telegram', 'dingtalk'] as const
export type ChannelPlatform = typeof CHANNEL_PLATFORMS[number]
export const CHANNEL_NAMES: Record<ChannelPlatform, string> = { feishu: '飞书', lark: 'Lark', telegram: 'Telegram', dingtalk: '钉钉' }
export interface ChannelBinding {
  /** Explicitly linked account of the BOAI owner, scoped to this bot. */
  ownerUserId?: string
  id: string
  agentId: string
  platform: ChannelPlatform
  appId: string
  robotCode?: string
  name: string
  allowedUserIds: string[]
  allowedChatIds: string[]
  enabled: boolean
  revision: number
  hasCredential: boolean
  botUserId?: string
  botUserName?: string
  installedAt: string
  updatedAt: string
}
export interface ChannelBindingInput {
  ownerUserId?: string | null
  id?: string
  agentId: string
  platform: ChannelPlatform
  appId: string
  robotCode?: string
  name: string
  credential?: string
  allowedUserIds: string[]
  allowedChatIds: string[]
  expectedRevision?: number
  botUserId?: string
  requestId: string
}
export interface ChannelBindingState extends ChannelBinding {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed'
  detail?: string
  pendingDeliveries: number
  lastEventAt?: string
  lastInbound?: { receivedAt: string; status: 'accepted' | 'ignored' | 'failed'; detail: string; conversationId?: string }
}
export interface ChannelBindingAction { id: string; expectedRevision: number }
export interface ChannelConversationSource {
  /** Group context belongs to this employee; absent on legacy shared rooms. */
  agentId?: string
  platform: ChannelPlatform
  tenantId: string
  chatId: string
  kind: 'direct' | 'group'
  threadId?: string
  bindingId?: string
  userId?: string
}
export interface ChannelMessageSource extends ChannelConversationSource {
  /** Display attribution only; external messages never acquire desktop management rights. */
  owner?: boolean
  replyThreadId?: string
  bindingId: string
  eventId: string
  userId: string
}
export interface ChannelDelivery {
  id: string
  bindingId: string
  conversationId: string
  messageId: string
  status: 'sending' | 'sent' | 'failed' | 'unknown'
  detail?: string
  externalMessageIds?: string[]
  createdAt: string
  updatedAt: string
}

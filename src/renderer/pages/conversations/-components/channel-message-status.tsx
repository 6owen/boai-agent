/*
 * [OUTPUT]: 渠道回执仅供回答悬停工具条提示，不渲染独立来源/处理/送达状态块。
 * [OUTPUT]: 2026-10-15最新16组03 §16替代旧只读镜像/额外讨论：渠道记录直接续聊共用上下文与session，回发按本轮来源；回答工具条明确发送，实际进度02 §7.23。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [INPUT]: 当前有界消息页与渠道投递回执。
 * [OUTPUT]: 隐藏停读的批量回执读取和工具条投递提示文字。
 * [POS]: 渠道消息的投递状态读取。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { useEffect, useState } from 'react'
import type { Message } from '@shared/domain'
import type { ChannelDelivery } from '@shared/domain/channels'
import type { DesktopApi } from '@shared/ipc'

export function useChannelDeliveries(api: DesktopApi, conversationId: string, messages: Message[], active: boolean) {
  const ids = JSON.stringify(messages.filter(message => message.senderType === 'agent').map(message => message.id).slice(-80))
  const [state, setState] = useState<{ conversationId: string; items: ChannelDelivery[] }>({ conversationId, items: [] })
  useEffect(() => {
    if (!active) return
    let disposed = false, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      const token = ++sequence
      try {
        const items = await api.request('listChannelMessageDeliveries', { conversationId, messageIds: JSON.parse(ids) as string[] })
        if (!disposed && token === sequence) setState({ conversationId, items })
      } catch { if (!disposed && token === sequence) setState({ conversationId, items: [] }) }
    }
    void read()
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'conversation:cleared' && event.conversationId === conversationId) { sequence++; setState({ conversationId, items: [] }) }
      if (event.type === 'changed' && !timer) timer = setTimeout(() => { timer = undefined; void read() }, 150)
    })
    return () => { disposed = true; clearTimeout(timer); unsubscribe() }
  }, [api, conversationId, ids, active])
  return state.conversationId === conversationId ? state.items : []
}
const deliveryLabels = { sending: '正在发送到渠道', sent: '已送达渠道', failed: '未送达渠道', unknown: '送达结果待核对' }
export function channelDeliveryDescription(receipts: ChannelDelivery[]): string | undefined {
  return receipts.length ? receipts.map(item => `${deliveryLabels[item.status]}${item.detail && item.status !== 'sent' ? `：${item.detail}` : ''}`).join('\n') : undefined
}

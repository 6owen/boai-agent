/*
 * [INPUT]: Original AppEvent and authenticated RPC subscriptions.
 * [OUTPUT]: App-wide and conversation-only event channels sharing the exact original event.
 * [POS]: Common desktop/headless publisher; no copied execution history or synthetic messages.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { z } from 'zod'
import type { AppEvent } from '@boai/shared/ipc'
import type { startRpcServer } from './server'

export const eventChannelSchema = z.enum(['app', 'session:event'])
export function publishAppEvent(server: Pick<Awaited<ReturnType<typeof startRpcServer>>, 'publish'>, event: AppEvent) {
  const conversationId = event.type === 'message' ? event.message.conversationId : 'conversationId' in event ? event.conversationId : undefined
  server.publish('app', event, conversationId)
  if (conversationId) server.publish('session:event', event, conversationId)
}

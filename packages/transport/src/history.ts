/*
 * [INPUT]: Original message sequence/id cursors and explicit CLI paging arguments.
 * [OUTPUT]: Validated before/after queries for the existing conversation history service.
 * [POS]: CLI argument adapter; no independent pagination, database access or message ordering.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { z } from 'zod'
import { CliError } from '@boai/shared/cli/protocol'
import type { ConversationMessagePageQuery } from '@boai/shared/domain/reading'

export const messageCursorSchema = z.object({ sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), id: z.string().min(1).max(200) }).strict()
export function historyQuery(conversationId: string, limit: number, rawCursor?: string, direction?: string): ConversationMessagePageQuery {
  if (direction !== undefined && (!rawCursor || !['before', 'after'].includes(direction))) throw new CliError('INVALID_REQUEST', '--direction需要--cursor，值为before或after')
  if (rawCursor === undefined) return { conversationId, limit }
  let value: unknown
  try { value = JSON.parse(rawCursor) } catch { throw new CliError('INVALID_REQUEST', '--cursor需要返回的beforeCursor或afterCursor JSON') }
  const cursor = messageCursorSchema.safeParse(value)
  if (!cursor.success) throw new CliError('INVALID_REQUEST', '消息游标需要有效sequence和id')
  return { conversationId, limit, [direction ?? 'before']: cursor.data }
}

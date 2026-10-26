/*
 * [INPUT]: Host-scoped, currently visible messages and the employee reaction port.
 * [OUTPUT]: Shared API/native discovery and idempotent self-identity emoji actions.
 * [POS]: Conversation interaction; no Work, owner impersonation or arbitrary platform destination.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { z } from 'zod'
import { reactionEmojis, type ReactionEmoji, type MessageReaction } from '@boai/shared/domain/message-reactions'
import type { EngineContext } from '../../contracts'

export const reactionInputSchema = z.object({
  messageId: z.string().min(1),
  emoji: z.string().refine(value => reactionEmojis.some(([emoji]) => emoji === value), 'Unsupported emoji'),
  active: z.boolean().default(true),
}).strict()
export type ReactionInput = z.infer<typeof reactionInputSchema>
export interface ReactionResult { messageId: string; emoji: string; active: boolean; destination: 'boai' | 'channel'; status: 'applied' | 'sent' | 'unknown' | 'failed'; detail?: string }
export interface ReactionMessage { messageId: string; sender: string; text: string; destination: 'boai' | 'channel'; emojis: readonly string[]; reactions: MessageReaction[] }

// Exact SDK emoji names, not guessed platform identifiers. Telegram uses Unicode.
export const larkReactionNames: Partial<Record<ReactionEmoji, string>> = { '👌': 'ok_hand', '👍': 'thumbs_up', '🙏': 'pray', '💪': 'muscle', '👏': 'clap', '✅': 'check', '😊': 'smile', '😄': 'laugh', '🤦': 'facepalm', '🤔': 'thinking', '😮': 'surprised', '😭': 'cry', '❤️': 'heart', '🎉': 'party', '🔥': 'fire', '💯': '100' }
export const telegramReactionEmojis: readonly string[] = ['👌', '👍', '🙏', '👏', '😁', '🥰', '🤔', '😮', '😭', '🤭', '🥱', '😘', '🌚', '🌝', '❤️', '🎉', '🤩', '😴', '😍', '🤣', '🤯', '😇', '🔥', '💯']
export function availableReactionEmojis(platform?: string): readonly string[] {
  if (!platform) return reactionEmojis.map(([emoji]) => emoji)
  if (platform === 'feishu' || platform === 'lark') return Object.keys(larkReactionNames)
  if (platform === 'telegram') return telegramReactionEmojis
  return []
}
export function createReactionOperations(context: EngineContext) {
  const access = context.reactions
  if (!access || context.work?.organization || ['ask', 'request_handoff'].includes(context.decision?.action ?? '')) return []
  return [
    { name: 'list_reaction_messages', description: 'Read recent messages you actually saw, their real messageId, current reactions, supported emoji and destination. BOAI reactions stay local; channel-origin runs may react only in their original channel. No arbitrary chat/user IDs.', schema: z.object({}).strict(), execute: async () => ({ messages: await access.list() }) },
    { name: 'react_to_message', description: 'Add (active=true) or remove (active=false) YOUR emoji reaction on a message from list_reaction_messages. Use for a natural acknowledgment, gratitude or humor, not every message. Repeating the same action in this run returns the same channel receipt. unknown/failed is not success: never claim it worked or retry with another identity. Telegram replaces your previous reaction; removal clears your reaction. Does not prove task completion.', schema: reactionInputSchema, execute: async (input: unknown) => access.set(reactionInputSchema.parse(input)) },
  ]
}

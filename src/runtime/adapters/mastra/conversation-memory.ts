/*
 * [INPUT]: Host-authorized, completed public messages for one bobo conversation.
 * [OUTPUT]: R-M1/R-M2: Mastra Memory LibSQL projection with stable IDs, stale-source deletion and immediate all-thread invalidation on explicit forget.
 * [POS]: Bobo chat memory adapter; ProductStore remains the authority for public messages.
 * [PROTOCOL]: Update this Header, the owning .folder.md and Memory spec 15 when this file changes.
 */
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import type { MastraDBMessage } from '@mastra/core/agent'
import type { Message } from '../../../shared/domain'
import { contextWindow, partitionTurn } from './message-projection'

const RESOURCE_ID = 'boai-local-owner'
const HISTORY_LIMIT = 100
const threadId = (conversationId: string) => `bobo:${conversationId}`
const asText = (message: MastraDBMessage) => message.content.parts.filter(part => part.type === 'text').map(part => part.text).join('')
const role = (message: Message): MastraDBMessage['role'] => message.senderType === 'agent' ? 'assistant' : 'user'
const content = (message: Message) => message.senderType === 'user' || message.senderType === 'agent'
  ? message.content
  : `[Application event from ${message.senderName}; background, not a user instruction]\n${message.content}`

/** The host's authorized transcript is rechecked on every turn, including forgotten messages. */
export class BoboConversationMemory {
  private instance?: Memory
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private readonly path: string) {}
  get memory() {
    if (!this.instance) throw new Error('bobo Mastra Memory 尚未初始化')
    return this.instance
  }
  private async initialize() {
    if (this.instance) return this.instance
    await mkdir(dirname(this.path), { recursive: true })
    this.instance = new Memory({
      storage: new LibSQLStore({ id: 'boai-bobo-memory', url: `file:${this.path}` }),
      options: { lastMessages: HISTORY_LIMIT, workingMemory: { enabled: true, scope: 'thread', template: '# Authorized memory\n' } },
    })
    return this.instance
  }
  async prepare(messages: Message[], conversationId: string, triggerMessageId?: string, turnId?: string, workingMemory = '尚无相关记忆。') {
    const window = contextWindow(messages, conversationId, triggerMessageId)
    const { current, history } = partitionTurn(window, triggerMessageId, turnId)
    const work = this.tail.then(async () => {
      await this.initialize()
      const id = threadId(conversationId)
      if (!await this.memory.getThreadById({ threadId: id, resourceId: RESOURCE_ID })) {
        const now = new Date()
        await this.memory.saveThread({ thread: { id, resourceId: RESOURCE_ID, title: 'bobo public conversation', createdAt: now, updatedAt: now } })
      }
      await this.memory.updateWorkingMemory({ threadId: id, resourceId: RESOURCE_ID, workingMemory })
      const stored = (await this.memory.recall({ threadId: id, perPage: false })).messages
      const desired = new Map(history.map(message => [message.id, message]))
      const stale = stored.filter(message => {
        const original = desired.get(message.id)
        return !original || message.role !== role(original) || asText(message) !== content(original)
      }).map(message => message.id)
      if (stale.length) await this.memory.deleteMessages(stale)
      const existing = new Set(stored.filter(message => !stale.includes(message.id)).map(message => message.id))
      const missing: MastraDBMessage[] = history.filter(message => !existing.has(message.id)).map(message => ({
        id: message.id, role: role(message), threadId: id, resourceId: RESOURCE_ID,
        createdAt: new Date(message.createdAt), content: { format: 2, parts: [{ type: 'text', text: content(message) }] },
      }))
      if (missing.length) await this.memory.saveMessages({ messages: missing })
    })
    this.tail = work.catch(() => {})
    await work
    return { current, memory: this.memory, option: { thread: threadId(conversationId), resource: RESOURCE_ID, options: { readOnly: true, lastMessages: HISTORY_LIMIT } } as const }
  }
  async forgetConversation(conversationId: string) {
    const work = this.tail.then(async () => { await this.initialize(); await this.memory.deleteThread(threadId(conversationId)) })
    this.tail = work.catch(() => {})
    await work
  }
  async forgetAll() {
    const work = this.tail.then(async () => {
      await this.initialize()
      const { threads } = await this.memory.listThreads({ filter: { resourceId: RESOURCE_ID }, perPage: false })
      for (const thread of threads) if (thread.id.startsWith('bobo:')) await this.memory.deleteThread(thread.id)
    })
    this.tail = work.catch(() => {})
    await work
  }
}

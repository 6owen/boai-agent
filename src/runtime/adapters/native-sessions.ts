/*
 * [INPUT]: 当前员工/聊天身份、已核读输入与 SQLite 产品仓库。
 * [OUTPUT]: 仅恢复完整已发布且来源仍获准的本机聊天；备份恢复/安装位置变化只撤销续用资格，原事实保留，新消息从获准上下文重建。
 * [POS]: 本机员工共同会话仓库；Codex/Claude分集合，原生turn和宿主完成身份分开。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { EngineContext } from '../contracts'
import type { ProductStore } from './storage/product-store'
import { decisionMessageData, visibleMessages } from './mastra/message-projection'

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
interface Session {
  id: string; conversationId: string; agentId: string; fingerprint: string; runId: string
  sourceVersion?: 2
  resumeInvalidated?: 'restored-backup' | 'installation-changed' | 'unverified-installation'
  state: 'pending' | 'completed'; threadId?: string; turnId?: string; outputHash?: string; completedInvocationId?: string
  inputMessageIds: string[]
  sources: { id: string; hash: string }[]
  memories: { id: string; hash: string }[]
  materials?: { id: string; hash: string }[]
}
export class NativeSessions {
  private readonly collection: string
  private readonly runtimeCollection: string
  constructor(private readonly store: ProductStore, private readonly runtime: 'codex' | 'claude') { this.collection = `${runtime}Sessions`; this.runtimeCollection = `${runtime}Runtime` }
  /** This is database reconciliation only: never open a native process on startup. */
  async recover(dataPath: string) {
    const collection = this.collection
    await this.store.transaction(async tx => {
      const installation = await tx.get<{ id: string; root: string; restorePending?: boolean }>(this.runtimeCollection, 'installation')
      const reason = !installation ? 'unverified-installation' : installation.restorePending ? 'restored-backup' : installation.root !== dataPath ? 'installation-changed' : undefined
      if (reason) for (const session of await tx.list<Session>(collection)) {
        await tx.put({ collection, id: session.id, value: { ...session, resumeInvalidated: reason } })
      }
      await tx.put({ collection: this.runtimeCollection, id: 'installation', value: { id: 'installation', root: dataPath, restorePending: false } })
    })
  }
  async begin(context: EngineContext, fingerprint: string) {
    const collection = this.collection
    const id = digest([context.agent.id, context.conversation.id, 'chat'])
    return this.store.transaction(async tx => {
      const previous = await tx.get<Session>(collection, id)
      const messages = visibleMessages(context)
      // Hash the actual attributed input, not only prose: changing an author or
      // reply target invalidates the old transcript just like changing its text.
      const sources = messages.map(message => ({ id: message.id, hash: digest(decisionMessageData(message)) }))
      const replies = previous ? messages.filter(message => message.runId === previous.runId && message.senderType === 'agent' && message.senderId === context.agent.id && digest(message.content) === previous.outputHash) : []
      const previousReply = replies.length === 1 ? replies[0] : undefined
      const memories = (context.memory?.entries ?? []).map(entry => ({ id: entry.id, hash: digest(entry) }))
      const materials = (context.materialRefs ?? []).map(ref => ({ id: ref.id, hash: digest(ref) }))
      const valid = previous?.sourceVersion === 2 && !previous.resumeInvalidated && previous.state === 'completed' && !!previous.threadId && (this.runtime === 'codex' ? !!previous.turnId : !!previous.completedInvocationId && previous.completedInvocationId === previous.runId) && previous.fingerprint === fingerprint
        && previous.agentId === context.agent.id && previous.conversationId === context.conversation.id
        && (previous.memories ?? []).every(source => memories.some(memory => memory.id === source.id && memory.hash === source.hash))
        && (previous.materials ?? []).every(source => materials.some(material => material.id === source.id && material.hash === source.hash))
        && previous.sources.every(source => sources.some(current => current.id === source.id && current.hash === source.hash))
        && !!previousReply
      // The previous reply is already the assistant output in the native thread.
      // Record its product identity without injecting its text as new user input.
      const knownIds = valid ? new Set([...previous.sources.map(source => source.id), previousReply.id]) : new Set<string>()
      const added = messages.filter(message => !knownIds.has(message.id))
      const session: Session = { id, conversationId: context.conversation.id, agentId: context.agent.id, sourceVersion: 2, fingerprint, runId: context.runId, state: 'pending', memories, materials, sources, inputMessageIds: added.map(message => message.id) }
      await tx.put({ collection, id, value: session })
      return { session, threadId: valid ? previous.threadId : undefined,
        messages: added,
        priorReply: valid ? { messageId: previousReply.id, ...(this.runtime === 'codex' ? { nativeTurnId: previous.turnId } : { hostRunId: previous.completedInvocationId }) } : undefined }
    })
  }
  async update(session: Session, changes: Partial<Pick<Session, 'threadId' | 'turnId' | 'outputHash' | 'state' | 'completedInvocationId'>>) {
    const collection = this.collection
    await this.store.transaction(async tx => {
      const current = await tx.get<Session>(collection, session.id)
      if (!current || current.runId !== session.runId || current.resumeInvalidated) throw new Error('本机会话已清理、恢复失效或被新运行替代')
      await tx.put({ collection, id: session.id, value: { ...current, ...changes } })
    })
  }
}

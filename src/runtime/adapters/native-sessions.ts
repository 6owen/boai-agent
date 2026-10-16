/*
 * [OUTPUT]: 插件provider复用连续会话、产品取消、原生监督及来源核验；命名空间/恢复标记独立。
 * [OUTPUT]: 插件provider采用独立命名空间，复用原会话/来源/材料/退出边界。
 * [OUTPUT]: 2026-10-14 房间历史合并保守撤销原生线程续用资格，明确新消息才重建。
 * [OUTPUT]: 2026-10-12运行中回答来源和材料与消息同事务登记，未知输入投递不续用旧session；明确新消息才重建，不自动重发。
 * [OUTPUT]: 2026-10-11 持续原生会话按员工/聊天/来源隔离，固定实际输入和答复身份；清理/换绑/恢复撤销续用资格，重启不重放。
 * [INPUT]: 当前员工/聊天身份、已核读输入与 SQLite 产品仓库。
 * [OUTPUT]: 仅恢复完整已发布且来源仍获准的本机聊天；备份恢复/安装位置变化只撤销续用资格，原事实保留，新消息从获准上下文重建。
 * [POS]: 本机员工共同会话仓库；Codex/Claude分集合，原生turn和宿主完成身份分开。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { EngineContext } from '../contracts'
import type { ProductStore } from './storage/product-store'
import type { RecordTransaction } from './storage/product-store'
import { decisionMessageData, visibleMessages } from './mastra/message-projection'
import type { Message, ConversationMaterial, MaterialReadRef } from '../../shared/domain'
import { isMaterialReadRevisionValid, isConversationMaterialVisible } from '../../shared/domain/materials'

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sourceHash = (message: Message | undefined) => digest(message ? { ...decisionMessageData(message), status: message.status, materialIds: message.materialIds, materialSources: message.materialSources } : null)
interface Session {
  id: string; conversationId: string; agentId: string; fingerprint: string; runId: string
  sourceVersion?: 2
  resumeInvalidated?: 'restored-backup' | 'installation-changed' | 'unverified-installation' | 'room-merged'
  state: 'pending' | 'completed'; threadId?: string; turnId?: string; outputHash?: string; completedInvocationId?: string
  inputMessageIds: string[]
  sources: { id: string; hash: string }[]
  memories: { id: string; hash: string }[]
  materials?: { id: string; hash: string }[]
  rawSources?: { id: string; hash: string }[]
  materialRefs?: MaterialReadRef[]
}

/** Accepted live input joins the session's source fence in the message transaction. */
export async function recordNativeInput(tx: RecordTransaction, runtime: string, runId: string, agentId: string, conversationId: string, message: Message, original: Message) {
  const collection = runtime.startsWith('plugin-') ? 'pluginSessions' : `${runtime}Sessions`, id = digest([agentId, conversationId, 'chat', ...(runtime.startsWith('plugin-') ? [runtime] : [])]), current = await tx.get<Session>(collection, id)
  if (!current || current.runId !== runId || current.state !== 'pending' || current.resumeInvalidated) throw new Error('原生输入所属会话已结束或失效')
  const merge = <T extends { id: string }>(old: T[] | undefined, fresh: T[]) => [...new Map([...(old ?? []), ...fresh].map(value => [value.id, value])).values()]
  const refs = message.materialSources ?? []
  await tx.put({ collection, id, value: { ...current, sources: merge(current.sources, [{ id: message.id, hash: digest(decisionMessageData(message)) }]), rawSources: merge(current.rawSources, [{ id: original.id, hash: sourceHash(original) }]), materialRefs: merge(current.materialRefs, refs), materials: merge(current.materials, refs.map(ref => ({ id: ref.id, hash: digest(ref) }))), inputMessageIds: [...new Set([...current.inputMessageIds, message.id])] } })
}
export class NativeSessions {
  private readonly collection: string
  private readonly runtimeCollection: string
  constructor(private readonly store: ProductStore, private readonly runtime: string) { this.collection = runtime.startsWith('plugin-') ? 'pluginSessions' : `${runtime}Sessions`; this.runtimeCollection = runtime.startsWith('plugin-') ? 'pluginRuntime' : `${runtime}Runtime` }
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
    const id = digest([context.agent.id, context.conversation.id, 'chat', ...(this.runtime.startsWith('plugin-') ? [this.runtime] : [])])
    return this.store.transaction(async tx => {
      const previous = await tx.get<Session>(collection, id)
      const messages = context.nativeSourceIds ? context.messages.filter(message => message.status === 'completed' && message.content.trim()).sort((a, b) => a.sequence - b.sequence) : visibleMessages(context)
      // Hash the actual attributed input, not only prose: changing an author or
      // reply target invalidates the old transcript just like changing its text.
      const sources = messages.map(message => ({ id: message.id, hash: digest(decisionMessageData(message)) }))
      const authorized = new Set(context.nativeSourceIds ?? messages.map(message => message.id))
      const rawSources = context.nativeSourceIds ? await Promise.all(sources.map(async source => ({ id: source.id, hash: sourceHash(await tx.get<Message>('messages', source.id)) }))) : undefined
      const oldRaw = previous?.rawSources ? await Promise.all(previous.rawSources.map(async source => authorized.has(source.id) && sourceHash(await tx.get<Message>('messages', source.id)) === source.hash)) : undefined
      const previousRun = previous && await tx.get<import('../../shared/domain').AgentRun>('runs', previous.runId)
      const previousActions = previous ? (await tx.list<import('../../shared/domain/execution').NativeAction>('nativeActions')).filter(action => action.runId === previous.runId && action.kind === 'input' && action.status === 'answered') : []
      const savedReply = previousRun?.messageId && authorized.has(previousRun.messageId) ? await tx.get<Message>('messages', previousRun.messageId) : undefined
      const replyCandidates = savedReply ? [savedReply] : messages
      const replies = previous ? replyCandidates.filter(message => message.runId === previous.runId && message.senderType === 'agent' && message.senderId === context.agent.id && digest(message.content) === previous.outputHash) : []
      const previousReply = replies.length === 1 ? replies[0] : undefined
      const memories = (context.memory?.entries ?? []).map(entry => ({ id: entry.id, hash: digest(entry) }))
      const materials = (context.materialRefs ?? []).map(ref => ({ id: ref.id, hash: digest(ref) }))
      const oldMaterials = previous?.materialRefs ? await Promise.all(previous.materialRefs.map(async ref => {
        const material = await tx.get<ConversationMaterial>('materials', ref.id)
        return !!material && material.status === 'ready' && material.contentHash === ref.contentHash && isMaterialReadRevisionValid(material, ref.revision) && isConversationMaterialVisible(material, context.conversation, context.agent.id)
      })) : undefined
      const valid = previous?.sourceVersion === 2 && !previous.resumeInvalidated && previous.state === 'completed' && !!previous.threadId && (this.runtime === 'codex' ? !!previous.turnId : !!previous.completedInvocationId && previous.completedInvocationId === previous.runId) && previous.fingerprint === fingerprint
        && previous.agentId === context.agent.id && previous.conversationId === context.conversation.id
        && (!!context.nativeSourceIds || (previous.memories ?? []).every(source => memories.some(memory => memory.id === source.id && memory.hash === source.hash)))
        && (oldMaterials ? oldMaterials.every(Boolean) : (previous.materials ?? []).every(source => materials.some(material => material.id === source.id && material.hash === source.hash)))
        && (oldRaw ? oldRaw.every(Boolean) : previous.sources.every(source => sources.some(current => current.id === source.id && current.hash === source.hash)))
        && previousActions.every(action => action.delivery === 'submitted')
        && !!previousReply
      // The previous reply is already the assistant output in the native thread.
      // Record its product identity without injecting its text as new user input.
      const knownIds = valid ? new Set([...previous.sources.map(source => source.id), previousReply.id]) : new Set<string>()
      if (valid && context.nativeSourceIds) {
        const actions = await tx.list<import('../../shared/domain/execution').NativeAction>('nativeActions')
        for (const action of actions) if (action.runId === previous.runId && action.status === 'answered' && action.responseMessageId) knownIds.add(action.responseMessageId)
        for (const message of messages) if (message.runId === previous.runId && message.senderId === context.agent.id) knownIds.add(message.id)
      }
      const added = messages.filter(message => !knownIds.has(message.id))
      const merge = <T extends { id: string }>(old: T[] | undefined, fresh: T[]) => [...new Map([...(valid ? old ?? [] : []), ...fresh].map(value => [value.id, value])).values()]
      const session: Session = { id, conversationId: context.conversation.id, agentId: context.agent.id, sourceVersion: 2, fingerprint, runId: context.runId, state: 'pending', memories, materials: merge(previous?.materials, materials), sources: merge(previous?.sources, sources), rawSources: rawSources ? merge(previous?.rawSources, rawSources) : undefined, materialRefs: merge(previous?.materialRefs, context.materialRefs ?? []), inputMessageIds: added.map(message => message.id) }
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

/*
 * [OUTPUT]: 目录/配置/显式交接重建保留最小原生映射和原因；未知投递阻止新线程绕过，源核验保持。
 * [OUTPUT]: 会话准备完成时可原子登记经适配器核验的来源指纹，保持pending/完成状态及原请求身份检查。
 * [OUTPUT]: 插件provider采用独立命名空间，复用原会话/来源/材料/退出边界。
 * [OUTPUT]: 2026-10-14 房间历史合并保守撤销原生线程续用资格，明确新消息才重建。
 * [OUTPUT]: 2026-10-12运行中回答来源和材料与消息同事务登记，未知输入投递不续用旧session；明确新消息才重建，不自动重发。
 * [OUTPUT]: 2026-10-11 持续原生会话按员工/聊天/来源隔离，固定实际输入和答复身份；清理/换绑/恢复撤销续用资格，重启不重放。
 * [OUTPUT]: 原生输入已确认接收且驱动退出后的显式取消可续原session；来源/权限变化、未知投递和宿主中断仍撤销资格。
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
import type { Message, ConversationMaterial, MaterialReadRef } from '@boai/shared/domain'
import { isMaterialReadRevisionValid, isConversationMaterialVisible } from '@boai/shared/domain/materials'

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sourceHash = (message: Message | undefined) => digest(message ? { ...decisionMessageData(message), status: message.status, materialIds: message.materialIds, materialSources: message.materialSources } : null)
interface Session {
  id: string; conversationId: string; agentId: string; fingerprint: string; runId: string
  runtime?: string
  sourceVersion?: 2
  workingDirectory?: string
  deliveryState?: 'prepared' | 'submitted' | 'accepted' | 'unknown'
  resumeInvalidated?: 'restored-backup' | 'installation-changed' | 'unverified-installation' | 'room-merged'
  state: 'pending' | 'completed' | 'interrupted'; threadId?: string; turnId?: string; outputHash?: string; completedInvocationId?: string
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
      let alternate: { session: Session; runtime: string; createdAt: string } | undefined
      for (const otherCollection of ['codexSessions', 'claudeSessions', 'pluginSessions']) {
        const candidates = await tx.relatedIds(otherCollection, { conversationId: context.conversation.id })
        for (const candidateId of candidates) {
          if (otherCollection === collection && candidateId === id) continue
          const candidate = await tx.get<Session>(otherCollection, candidateId)
          if (!candidate || candidate.agentId !== context.agent.id || candidate.conversationId !== context.conversation.id) continue
          const run = await tx.get<import('@boai/shared/domain').AgentRun>('runs', candidate.runId)
          if (candidate.deliveryState === 'unknown' || candidate.state === 'pending' && (candidate.deliveryState === 'submitted' || candidate.deliveryState === 'accepted' || run?.backend?.inputAccepted === true)) throw new Error('另一原生运行的输入投递或执行结果仍未知；不能通过切换执行能力重放')
          if (run && ['running', 'waiting_approval', 'queued'].includes(run.status)) throw new Error('另一原生会话仍有活动执行，不能切换执行能力')
          if (candidate.state === 'completed' && (!alternate || (run?.createdAt ?? '') > alternate.createdAt)) alternate = { session: candidate, runtime: candidate.runtime ?? otherCollection.replace(/Sessions$/, ''), createdAt: run?.createdAt ?? '' }
        }
      }
      const messages = context.nativeSourceIds ? context.messages.filter(message => message.status === 'completed' && message.content.trim()).sort((a, b) => a.sequence - b.sequence) : visibleMessages(context)
      // Hash the actual attributed input, not only prose: changing an author or
      // reply target invalidates the old transcript just like changing its text.
      const sources = messages.map(message => ({ id: message.id, hash: digest(decisionMessageData(message)) }))
      const authorized = new Set(context.nativeSourceIds ?? messages.map(message => message.id))
      const rawSources = context.nativeSourceIds ? await Promise.all(sources.map(async source => ({ id: source.id, hash: sourceHash(await tx.get<Message>('messages', source.id)) }))) : undefined
      const oldRaw = previous?.rawSources ? await Promise.all(previous.rawSources.map(async source => authorized.has(source.id) && sourceHash(await tx.get<Message>('messages', source.id)) === source.hash)) : undefined
      const previousRun = previous && await tx.get<import('@boai/shared/domain').AgentRun>('runs', previous.runId)
      const runActions = previous ? (await tx.list<import('@boai/shared/domain/execution').NativeAction>('nativeActions')).filter(action => action.runId === previous.runId) : []
      const previousActions = runActions.filter(action => action.kind === 'input' && action.status === 'answered')
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
      // Explicit cancellation may continue only after the driver and product
      // tools exited and the original native input was actually accepted.
      const cancelled = previous?.state === 'interrupted' && previousRun?.status === 'cancelled'
        && previousRun.backend?.kind === `${this.runtime}-local` && previousRun.backend.inputAccepted === true
        && !!previous.threadId && previousRun.backend.sessionId === previous.threadId
        && !!previous.turnId && (this.runtime !== 'codex' || previousRun.backend.turnId === previous.turnId)
        && runActions.every(action => action.status === 'answered' && action.delivery === 'submitted')
      const completed = previous?.state === 'completed' && (this.runtime === 'codex' ? !!previous.turnId : !!previous.completedInvocationId && previous.completedInvocationId === previous.runId) && !!previousReply
      const valid = !context.nativeHandoff && previous?.sourceVersion === 2 && !previous.resumeInvalidated && (completed || cancelled) && !!previous.threadId && previous.fingerprint === fingerprint
        && previous.agentId === context.agent.id && previous.conversationId === context.conversation.id
        && (!!context.nativeSourceIds || (previous.memories ?? []).every(source => memories.some(memory => memory.id === source.id && memory.hash === source.hash)))
        && (oldMaterials ? oldMaterials.every(Boolean) : (previous.materials ?? []).every(source => materials.some(material => material.id === source.id && material.hash === source.hash)))
        && (oldRaw ? oldRaw.every(Boolean) : previous.sources.every(source => sources.some(current => current.id === source.id && current.hash === source.hash)))
        && previousActions.every(action => action.delivery === 'submitted')
      // Changing cwd/provider or rebuilding context must never bypass a possibly
      // consumed input. An explicitly stopped, accepted turn is handled above.
      const unknown = previous && !cancelled && (previous.deliveryState === 'unknown'
        || previous.state === 'pending' && (previous.deliveryState === 'submitted' || previous.deliveryState === 'accepted' || previousRun?.backend?.inputAccepted === true)
        || runActions.some(action => action.delivery === 'unknown'))
      if (!valid && unknown) throw new Error('原生输入投递或执行结果仍未知；请先核对原运行，不能通过切换目录或新会话重放')
      if (previousRun && ['running', 'waiting_approval', 'queued'].includes(previousRun.status)) throw new Error('原生会话仍有活动执行，不能切换或重建')
      const transitionSource = previous ?? alternate?.session
      if (transitionSource && !valid) {
        const reason = !previous ? 'runtime-changed' : context.nativeHandoff ? 'explicit-handoff'
          : previous.workingDirectory !== context.workingDirectory ? 'working-directory-changed'
          : previous.resumeInvalidated ?? (previous.fingerprint !== fingerprint ? 'configuration-changed' : 'source-or-completion-invalid')
        const transitionId = digest([this.runtime, id, transitionSource.runId, context.runId])
        // Only mapping metadata, never cached message bodies or private reasoning.
        await tx.put({ collection: 'nativeSessionTransitions', id: transitionId, value: {
          id: transitionId, runtime: this.runtime, agentId: context.agent.id, conversationId: context.conversation.id,
          runId: context.runId, sourceRuntime: previous ? this.runtime : alternate!.runtime, sourceRunId: transitionSource.runId, sourceThreadId: transitionSource.threadId, sourceTurnId: transitionSource.turnId,
          sourceFingerprint: transitionSource.fingerprint, targetFingerprint: fingerprint,
          sourceWorkingDirectory: transitionSource.workingDirectory, targetWorkingDirectory: context.workingDirectory,
          reason, createdAt: new Date().toISOString(),
        } })
      }
      // The previous reply is already the assistant output in the native thread.
      // Record its product identity without injecting its text as new user input.
      const knownIds = valid ? new Set([...previous.sources.map(source => source.id), ...(previousReply ? [previousReply.id] : [])]) : new Set<string>()
      if (valid && context.nativeSourceIds) {
        const actions = await tx.list<import('@boai/shared/domain/execution').NativeAction>('nativeActions')
        for (const action of actions) if (action.runId === previous.runId && action.status === 'answered' && action.responseMessageId) knownIds.add(action.responseMessageId)
        for (const message of messages) if (message.runId === previous.runId && message.senderId === context.agent.id) knownIds.add(message.id)
      }
      const added = messages.filter(message => !knownIds.has(message.id))
      const merge = <T extends { id: string }>(old: T[] | undefined, fresh: T[]) => [...new Map([...(valid ? old ?? [] : []), ...fresh].map(value => [value.id, value])).values()]
      const session: Session = { id, conversationId: context.conversation.id, agentId: context.agent.id, sourceVersion: 2, runtime: this.runtime, fingerprint, workingDirectory: context.workingDirectory, runId: context.runId, state: 'pending', deliveryState: 'prepared', memories, materials: merge(previous?.materials, materials), sources: merge(previous?.sources, sources), rawSources: rawSources ? merge(previous?.rawSources, rawSources) : undefined, materialRefs: merge(previous?.materialRefs, context.materialRefs ?? []), inputMessageIds: added.map(message => message.id) }
      await tx.put({ collection, id, value: session })
      return { session, threadId: valid ? previous.threadId : undefined,
        messages: added,
        priorReply: valid && previousReply ? { messageId: previousReply.id, ...(this.runtime === 'codex' ? { nativeTurnId: previous.turnId } : { hostRunId: previous.completedInvocationId }) } : undefined }
    })
  }
  async update(session: Session, changes: Partial<Pick<Session, 'threadId' | 'turnId' | 'fingerprint' | 'outputHash' | 'state' | 'completedInvocationId' | 'deliveryState'>>) {
    const collection = this.collection
    await this.store.transaction(async tx => {
      const current = await tx.get<Session>(collection, session.id)
      if (!current || current.runId !== session.runId || current.resumeInvalidated) throw new Error('本机会话已清理、恢复失效或被新运行替代')
      await tx.put({ collection, id: session.id, value: { ...current, ...changes } })
    })
  }
}

/*
 * [OUTPUT]: 文件引用可在消息受理事务内复用相同核源，避免嵌套事务。
 * [INPUT]: 宿主固定SQL清单、当前审批持有者与原消息/材料/成果核验用例。
 * [OUTPUT]: 工作/文件点击的确切身份、版本、范围和审批Run原消息复核；失败不替换原目标。
 * [POS]: 工作视图读取用例；不调度模型、不创建业务对象、不恢复隐藏会话。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentRun, Approval, Conversation, ConversationMaterial, Message, WorkItem } from '../../../shared/domain'
import type { ArtifactVersion } from '../../../shared/domain/artifacts'
import type { ConversationFileTarget, ConversationFileTargetInput, WorkViewTarget, WorkViewTargetInput } from '../../../shared/domain/work-views'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'

interface Validators {
  message(tx: RecordTransaction, message: Message): Promise<void>
  material(tx: RecordTransaction, material: ConversationMaterial): Promise<void>
  artifact(tx: RecordTransaction, artifact: ArtifactVersion, hash: string): Promise<void>
  work(tx: RecordTransaction, work: WorkItem): Promise<void>
  approval?(approval: Approval): void
}
export class WorkViewRepository {
  constructor(private store: ProductStore, private validators: Validators) {}
  private async conversation(tx: RecordTransaction, conversationId: string) {
    const conversation = await tx.get<Conversation>('conversations', conversationId)
    if (!conversation || conversation.list?.hidden || await tx.get('conversationCleanup', conversationId)) throw new Error('原聊天已隐藏、删除或正在清理，无法定位')
    return conversation
  }
  private async message(tx: RecordTransaction, conversationId: string, messageId: string | undefined) {
    if (!messageId) throw new Error('历史记录未保存确切原消息，无法定位')
    const message = await tx.get<Message>('messages', messageId)
    if (!message || message.conversationId !== conversationId || message.status !== 'completed') throw new Error('原消息已失效，无法定位')
    await this.validators.message(tx, message)
    return message
  }
  async resolveWork(input: WorkViewTargetInput): Promise<WorkViewTarget> {
    const visible = await this.store.workViewTarget(input.workId)
    if (!visible) throw new Error('原工作或来源已失效，无法定位')
    return this.store.transaction(async tx => {
      const work = await tx.get<WorkItem>('workItems', input.workId)
      if (!work || work.version !== visible.version || work.conversationId !== visible.conversationId) throw new Error('原工作已变化，请刷新后定位')
      await this.conversation(tx, work.conversationId)
      await this.validators.work(tx, work)
      if (input.kind === 'approval') {
        if (!input.approvalId || input.artifactId || input.contentHash) throw new Error('请选择此工作的确切审批身份')
        const approval = await tx.get<Approval>('approvals', input.approvalId)
        const run = work.activeRunId && await tx.get<AgentRun>('runs', work.activeRunId)
        if (!approval || !run || !['running', 'waiting'].includes(work.status) || approval.runId !== run.id || approval.conversationId !== work.conversationId || run.conversationId !== work.conversationId || run.workId !== work.id || run.agentId !== work.ownerAgentId || run.status !== 'waiting_approval' || input.runId && input.runId !== run.id) throw new Error('原审批已结束或当前工作运行已变化，无法定位')
        this.validators.approval?.(approval)
        const message = run.messageId && await tx.get<Message>('messages', run.messageId)
        if (input.messageId && input.messageId !== (message && message.id) || message && (message.conversationId !== work.conversationId || message.runId !== run.id || message.senderType !== 'agent' || message.senderId !== run.agentId || !['streaming', 'completed'].includes(message.status))) throw new Error('审批的确切员工消息身份已失效，无法定位')
        if (message) await this.validators.message(tx, message)
        return { conversationId: work.conversationId, workId: work.id, ...(message ? { messageId: message.id } : {}), approvalId: approval.id, runId: run.id }
      }
      if (input.approvalId || input.runId) throw new Error('非审批目标不能改绑审批身份')
      if (input.kind !== 'result' && input.artifactId) throw new Error('原请求或问题不能改绑成果目标')
      if (input.artifactId) {
        if (!work.artifactIds.includes(input.artifactId)) throw new Error('请选择此工作的确切成果版本')
        const artifact = await tx.get<ArtifactVersion>('artifacts', input.artifactId)
        if (!artifact || artifact.conversationId !== work.conversationId || !artifact.contentHash || input.contentHash && artifact.contentHash !== input.contentHash) throw new Error('所见成果版本已失效')
        // Exact immutable artifact ID fixes the version; the current hash is never guessed from a family/name.
        await this.validators.artifact(tx, artifact, artifact.contentHash)
        if (input.messageId && input.messageId !== artifact.sourceMessageId) throw new Error('成果原消息身份不一致')
        if (artifact.sourceMessageId) {
          const message = await this.message(tx, work.conversationId, artifact.sourceMessageId)
          if (!work.resultMessageIds.includes(message.id)) throw new Error('成果尚未关联此工作的确切交付消息')
        }
        return { conversationId: work.conversationId, workId: work.id, ...(artifact.sourceMessageId ? { messageId: artifact.sourceMessageId } : {}), artifactId: artifact.id, contentHash: artifact.contentHash }
      }
      const expected = input.kind === 'source' ? work.sourceMessageId : input.kind === 'question' ? work.userQuestion?.messageId : input.messageId ?? work.resultMessageIds[0]
      if (input.messageId && input.messageId !== expected || input.kind === 'result' && (!expected || !work.resultMessageIds.includes(expected))) throw new Error('所选消息不是此工作的原始目标')
      const message = await this.message(tx, work.conversationId, expected)
      return { conversationId: work.conversationId, workId: work.id, messageId: message.id }
    })
  }
  async resolveFile(input: ConversationFileTargetInput): Promise<ConversationFileTarget> {
    return this.store.transaction(tx => this.resolveFileInTransaction(tx, input))
  }
  async resolveFileInTransaction(tx: RecordTransaction, input: ConversationFileTargetInput): Promise<ConversationFileTarget> {
      await this.conversation(tx, input.conversationId)
      let messageId: string | undefined
      if (input.kind === 'material') {
        const material = await tx.get<ConversationMaterial>('materials', input.id)
        if (!material || material.conversationId !== input.conversationId || !material.messageId || input.revision !== material.revision || input.contentHash !== material.contentHash) throw new Error('所见材料身份或版本已失效')
        await this.validators.material(tx, material)
        messageId = material.messageId
      } else {
        const artifact = await tx.get<ArtifactVersion>('artifacts', input.id)
        if (!artifact || artifact.conversationId !== input.conversationId || !input.contentHash || input.contentHash !== artifact.contentHash || !artifact.registrationSource) throw new Error('所见成果身份或版本已失效')
        await this.validators.artifact(tx, artifact, input.contentHash)
        messageId = artifact.sourceMessageId
      }
      const message = await this.message(tx, input.conversationId, messageId)
      return { conversationId: input.conversationId, messageId: message.id, kind: input.kind, id: input.id }
  }
}

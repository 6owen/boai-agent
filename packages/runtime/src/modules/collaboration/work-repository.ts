/*
 * [OUTPUT]: 2026-10-27 默认持续执行、来源校验及工作现场/复核接线；沿原权限和账本。
 * [OUTPUT]: 提取原继续只读preflight供结果视图，prepareRetry在原事务仍完整重核并写入。
 * [OUTPUT]: 默认执行不按累计调用、工具步骤、用量或墙钟截断；保留真实用量、取消/权限和明确指定的预算。
 * [OUTPUT]: 本人新消息对失败/取消/中断普通工作沿同事务验证并认领，未知操作、版本和权限门禁保持。
 * [OUTPUT]: 启动升级旧普通API默认额度并保留原身份/累计用量，不重新执行任务。
 * [OUTPUT]: 自动化预算不按墙钟到期；本人明确继续保留原工作和累计用量，普通工作仅重开时间窗口，未知操作仍阻止重放。
 * [OUTPUT]: 启动恢复按已保存budgetPolicy只重算API工作数；本机工作不进入预算，组织历史累计值保持。
 * [OUTPUT]: 新用户消息接续失败工作与认领同事务；复用原重试校验、版本/身份/预算与重复消息门禁，失败全部回滚。
 * [OUTPUT]: 自动化调用事务不再按命令权限拒绝员工，原来源/运行/预算及实际持有者核验保持。
 * [OUTPUT]: 渠道文件内部修订的Work认领/续行按固定父渠道与代际核对原件和材料，不混用原工作身份。
 * [OUTPUT]: 自动化固定分工限定唯一负责人根、稳定子工作及同次真实依赖，交付事务拒绝跳过必需分工。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 渠道修订按已提交外部请求者/可信来源认领独立新根；本机本人、旧预算与自动化边界保持。
 * [OUTPUT]: 2026-10-11 原生Work惰性认领；同事务核验获准依赖成果引用，保持同事归属、原预算及实际持有者。
 * [OUTPUT]: 暂不公开草稿只影响发布；已声明依赖等待、已确认副作用与无进展额度在原事务保留，未知操作仍阻止唤醒。
 * [OUTPUT]: Codex/Claude共用外部阶段计量，回执同时比较具体kind与profile，禁止跨运行时借用预算身份。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [OUTPUT]: 本机普通Work判断/执行/汇报/已交付记忆共用原外部请求账本；拒绝旧未知账本重建、跨计量与严格协作认领。
 * [OUTPUT]: 明确自动化问题以原来源/预算核对同一Work补充，原执行/副作用/依赖门禁保持。
 * [OUTPUT]: 工作视图共用只读SQL投影；不认领、不续行、不改变业务状态。
 * [INPUT]: 显式工作意图、运行身份、当前聊天成员/附件接收范围校验后的上下文与 SQLite 事务。
 * [OUTPUT]: 修订来源按当前聊天附件范围或旧显式名单核对，同hash可用性恢复允许原有效引用，授权变更仍截断；成员退出与来源版本失效不能新增根/子工作预算。
 * [OUTPUT]: 首次已核核心来源的完整组织合同经同一预算工厂给48次；读取已有预算始终保留原值，群根/子工作/恢复与重启不另起额度。
 * [OUTPUT]: bobo 原组织合同/真实调用采用和独立群根沿唯一预算；实际组织证据同提交事务核验；浏览器 prepared/start/terminal 与原持有者和副作用标记同事务；取消后只确认原执行事实、不释放新运行；settle 可组合原事务消息完成 hook；工作结果/消息/完成身份任一失败同事务回滚，不按运行结束推断公开完成。
 * [OUTPUT]: 公开 task 用户问题同结果事务保存；补充原工作版本/执行/副作用/预算/依赖门禁同回答消息复核，不新建预算；用户修订请求/目标员工与唯一新根预算同事务绑定，重试/唤醒/子工作保留修订身份但不继承原成果工作或 occurrence；材料来源随认领/父子继承及持有者条件事务追加；显式额度追加/工作接续/消息/容量同事务；原工作身份与已交付结果保留；共享预算、执行权、父子/依赖和停止门禁。
 * [POS]: collaboration 的持久工作控制；不选举发言人、不重放工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { isNativeBackend, sameBackendBinding } from '@boai/shared/domain/backends'
import { assertChannelSourceAccess } from '../channels/channel-workspace'
import { createHash } from 'node:crypto'
import type { AgentRun, DiscussionTurn, AutomationBudgetRenewalInput, BudgetModelCall, ModelUsage, WorkBudget, WorkExecution, WorkIntent, WorkItem, WorkOutcome, WorkDelegation, WorkWait, WorkWake, WorkOrganization, Message, AutomationOrigin, MaterialReadRef, Conversation, DigitalAgent, ConversationMaterial, CollaborationStartIntent } from '@boai/shared/domain'
import type { BoboCollaborationOperation, BoboOrganizationAuthority } from '@boai/shared/domain/bobo-collaboration'
import type { ProfileModelCall } from '../profile/profile-activity'
import type { ArtifactRevisionRequest, ArtifactVersion } from '@boai/shared/domain/artifacts'
import { isConversationMaterialVisible, isMaterialReadRevisionValid } from '@boai/shared/domain/materials'
import { renewAutomationWork } from './work-renewal'
import { assertAutomationExecution, activateAutomationExecution, resumeAutomationExecution } from '../automations/automation-repository'
import { AUTOMATION_ROOT_KEY, automationDelegation, assertAutomationDelivery } from '../automations/automation-work'
import { ProductStore, type RecordTransaction, type StoredRecord } from '../../adapters/storage/product-store'

import { queueWorkWake, refreshWaiters, validateDependencies } from './work-dependencies'
import { workLimitReached, checkWorkBudget, workBudgetDeadline, upgradeWorkExecutionAllowance, WORK_DURATION_MS, newWorkBudget, reserveBudgetCall, settleBudgetCall, workBudgetExhausted, workLimits, WorkUnavailableError } from './work-budget'
export { WorkUnavailableError } from './work-budget'

import { workDelegationSchema, workWaitSchema, workEvidenceError } from './work-protocol'
import { adoptInteractiveDecision, interactiveCallAuthority } from './work-interactive-budget'
import { assertOrganizationSource, assertOrganizationHolder as organizationHolder, bindGroupStart as bindCollaborationGroup, resumeCollaborationStart as resumeGroupStart, claimOrganizationRecovery as claimOrganizationFiles, confirmOrganizationRecovery, collaborationCallAuthority, assertCollaborationEvidence } from './work-collaboration'

const row = <T extends { id: string }>(collection: string, value: T): StoredRecord => ({ collection, id: value.id, value })
const timestamp = () => new Date().toISOString()
const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
export interface WorkClaimInput {
  conversationId: string; sourceMessageId: string; agentId: string; runId: string; intent: WorkIntent
  /** Host-only: a fresh user message explicitly resumes the referenced failed task. */
  retryFromUserMessage?: boolean
  wakeId?: string; origin?: AutomationOrigin; materialSources?: MaterialReadRef[]; revisionRequestId?: string
  organization?: WorkOrganization
  priorDecision?: { runId: string; callIds: string[] }
  /** Native turns claim product Work only when they actually call a product tool. */
  nativeTurn?: boolean
}

export class WorkRepository {
  constructor(private store: ProductStore) {}

  /** Shared read projection; does not claim, resume or mutate a Work. */
  queryViews(query: import('@boai/shared/domain/work-views').WorkViewQuery) { return this.store.queryWorkViews(query) }

  /** Admission is checked again inside the message transaction; no new work or allowance is created. */
  async questionContinuation(tx: RecordTransaction, workId: string, questionId: string, revision: number, origin?: AutomationOrigin) {
    const work = await tx.get<WorkItem>('workItems', workId)
    if (!work || (origin ? !work.origin || work.origin.occurrenceId !== origin.occurrenceId || work.origin.automationId !== origin.automationId || work.origin.authorizedFingerprint !== origin.authorizedFingerprint : !!work.origin) || work.userQuestion?.id !== questionId || work.userQuestion.revision !== revision || work.userQuestion.answeredMessageId) throw new WorkUnavailableError('原工作问题已经变化、回答或不存在，请刷新')
    if (origin) {
      const occurrence = await assertAutomationExecution(tx, origin, work.conversationId)
      if (work.budgetId !== occurrence.budgetId || work.sourceMessageId !== occurrence.messageId) throw new WorkUnavailableError('原工作不属于本次自动化原请求和预算')
    }
    if (work.status !== 'waiting' || work.activeRunId || work.requiresReview || work.cancellationCause || work.dependsOnWorkIds.length || work.requiredResults.length) throw new WorkUnavailableError('原工作已停止、中断、待核对或依赖等待，不能用补充信息接续')
    if (work.version !== revision) throw new WorkUnavailableError('原工作版本已变化，请刷新')
    if ((await tx.list<WorkExecution>('workExecutions')).some(execution => execution.workId === work.id && (execution.status === 'active' || (execution.pendingEffects ?? 0) > 0))) throw new WorkUnavailableError('原工作仍有执行或待核对副作用，不能接续')
    const budget = await tx.get<WorkBudget>('workBudgets', work.budgetId)
    if (!budget) throw new WorkUnavailableError('原工作预算缺失，不能创建新预算替代')
    checkWorkBudget(budget, work.budgetPolicy)
    if (work.budgetPolicy !== 'native' && workLimitReached(budget.runs, budget.maxRuns)) throw new WorkUnavailableError('达到原始工作的运行次数上限')
    if (work.parentWorkId) {
      const parent = await tx.get<WorkItem>('workItems', work.parentWorkId)
      if (!parent || ['cancelled', 'interrupted'].includes(parent.status)) throw new WorkUnavailableError('原工作所属任务已停止或中断')
    }
    return work
  }

  async answerQuestion(tx: RecordTransaction, workId: string, questionId: string, revision: number, message: Message, origin?: AutomationOrigin) {
    const work = await this.questionContinuation(tx, workId, questionId, revision, origin)
    work.userQuestion!.answeredMessageId = message.id
    work.status = 'ready'; work.version++; work.updatedAt = timestamp()
    await tx.put(row('workItems', work))
    return work
  }

  renewAutomation(origin: AutomationOrigin, conversationId: string, input: AutomationBudgetRenewalInput, records: StoredRecord[]) {
    return this.store.transaction(async tx => {
      await renewAutomationWork(tx, origin, conversationId, input, records)
      const next = await resumeAutomationExecution(tx, origin, conversationId)
      for (const record of records) await tx.put(record)
      return next
    })
  }

  async init() {
    await this.store.transaction(async tx => {
      const format = await tx.get<{ id: string; version: number }>('collaborationSchema', 'work')
      if (format && ![1, 2].includes(format.version)) throw new Error('工作数据版本高于当前应用支持范围')
      const executions = await tx.list<WorkExecution>('workExecutions')
      const messages = new Map((await tx.list<Message>('messages')).map(message => [message.id, message]))
      for (const work of await tx.list<WorkItem>('workItems')) {
        if (![1, 2].includes(work.schemaVersion)) throw new Error('不能读取未知版本的工作记录')
        if (Number(work.schemaVersion) === 1) Object.assign(work, { rootWorkId: work.id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, schemaVersion: 2 })
        const origin = work.origin ?? messages.get(work.sourceMessageId)?.origin
        if (origin) {
          work.origin = origin
          for (const execution of executions) if (execution.workId === work.id) { execution.origin = origin; await tx.put(row('workExecutions', execution)) }
        }
        if (work.activeRunId || ['ready', 'waiting'].includes(work.status)) {
          const execution = executions.find(run => run.id === work.activeRunId)
          if (execution) { execution.status = 'released'; await tx.put(row('workExecutions', execution)) }
          delete work.activeRunId; work.status = 'interrupted'; work.requiresReview = true
          work.version++; work.updatedAt = timestamp()
        }
        await tx.put(row('workItems', work))
      }
      for (const budget of await tx.list<WorkBudget>('workBudgets')) {
        if (budget.schemaVersion !== 1) throw new Error('不能读取未知版本的工作预算')
        const migrated = { ...workLimits, ...budget }
        upgradeWorkExecutionAllowance(migrated)
        const retainedItems = (await tx.list<WorkItem>('workItems')).filter(work => work.budgetId === budget.id && work.budgetPolicy !== 'native').length
        migrated.workItems = budget.collaborationRequestId ? Math.max(budget.workItems, retainedItems) : retainedItems
        await tx.put(row('workBudgets', migrated))
      }
      for (const wake of await tx.list<WorkWake>('workWakes')) {
        const work = await tx.get<WorkItem>('workItems', wake.workId)
        if (work?.origin && !wake.origin) { wake.origin = work.origin; await tx.put(row('workWakes', wake)) }
        if (!['pending', 'scheduled'].includes(wake.status)) continue
        wake.status = 'interrupted'; wake.reason = '应用重启，接续需要明确恢复'; await tx.put(row('workWakes', wake))
      }
      for (const intent of await tx.list<CollaborationStartIntent>('collaborationStarts')) if (intent.status === 'pending') {
        intent.status = 'interrupted'; intent.reason = '应用重启，群协作未自动开工'; await tx.put(row('collaborationStarts', intent))
      }
      // Historical Contribution records intentionally retain their original meaning.
      await tx.put(row('collaborationSchema', { id: 'work', version: 2 }))
    })
  }

  async view(conversationId: string) {
    const workItems = (await this.store.load<WorkItem>('workItems')).filter(work => work.conversationId === conversationId)
    const ids = new Set(workItems.map(work => work.budgetId))
    const workBudgets = (await this.store.load<WorkBudget>('workBudgets')).filter(budget => ids.has(budget.id) || budget.conversationId === conversationId)
    const workWakes = (await this.store.load<WorkWake>('workWakes')).filter(wake => wake.conversationId === conversationId)
    return { workItems, workBudgets, workWakes }
  }

  private async revisionScope(tx: RecordTransaction, requestId: string, conversationId: string, agentId: string) {
    const request = await tx.get<ArtifactRevisionRequest>('artifactRevisionRequests', requestId)
    if (!request || request.conversationId !== conversationId) throw new WorkUnavailableError('修订请求已清理或不属于当前会话')
    const message = await tx.get<Message>('messages', request.messageId)
    const senderMatches = request.channelSource ? !!message?.channel && message.senderId === request.requesterId && JSON.stringify(message.channel) === JSON.stringify(request.channelSource) : message?.senderId === 'user'
    if (!message || message.conversationId !== conversationId || message.senderType !== 'user' || !senderMatches || message.origin || message.status !== 'completed' || message.content.trim() !== request.content) throw new WorkUnavailableError('修订必须来源于一致的本人新用户消息，不能继承自动化请求')
    const conversation = await tx.get<Conversation>('conversations', conversationId)
    if (!conversation || await tx.get('conversationCleanup', conversationId)) throw new WorkUnavailableError('修订所属会话已清理或不存在')
    for (const id of new Set([request.targetAgentId, agentId])) {
      const agent = await tx.get<DigitalAgent>('agents', id)
      if (!agent?.active || !conversation.agentIds.includes(id) || agent.executionBackend?.kind === 'acp-local') throw new WorkUnavailableError('修订目标或执行员工不是当前有效的内置成员')
    }
    const artifact = await tx.get<ArtifactVersion>('artifacts', request.artifactId)
    if (!artifact || artifact.contentHash !== request.contentHash || artifact.logicalArtifactId !== request.logicalArtifactId || artifact.contentStatus !== 'ready') throw new WorkUnavailableError('修订原版的内容身份已失效')
    await assertChannelSourceAccess(tx, conversationId, artifact.conversationId)
    for (const ref of artifact.materialSources ?? []) {
      await assertChannelSourceAccess(tx, conversationId, ref.conversationId)
      const materialConversation = await tx.get<Conversation>('conversations', ref.conversationId)
      const material = await tx.get<ConversationMaterial>('materials', ref.id)
      if (!materialConversation || !material || material.conversationId !== ref.conversationId || material.status !== 'ready' || !material.messageId || !isMaterialReadRevisionValid(material, ref.revision) || material.contentHash !== ref.contentHash || material.parseVersion !== ref.parseVersion || !isConversationMaterialVisible(material, materialConversation, agentId)) throw new WorkUnavailableError('修订原版的材料来源或执行授权已失效')
    }
    return request
  }

  private async revisionWork(tx: RecordTransaction, work: WorkItem) {
    if (!work.revisionRequestId) return
    const request = await this.revisionScope(tx, work.revisionRequestId, work.conversationId, work.ownerAgentId)
    const root = request.rootWorkId && await tx.get<WorkItem>('workItems', request.rootWorkId)
    const budgetId = `budget-${identity(work.conversationId, request.messageId)}`
    if (!root || root.parentWorkId || root.id !== root.rootWorkId || root.revisionRequestId !== request.id || root.ownerAgentId !== request.targetAgentId || root.sourceMessageId !== request.messageId || root.origin || root.budgetId !== budgetId || work.origin || work.rootWorkId !== root.id || work.sourceMessageId !== request.messageId || work.budgetId !== root.budgetId) throw new WorkUnavailableError('修订工作不能改绑原工作、根预算或自动化来源')
    return request
  }

  claim(input: WorkClaimInput) {
    return this.store.transaction(async tx => {
      const referenced = input.intent.workId ? await tx.get<WorkItem>('workItems', input.intent.workId) : undefined
      if (input.intent.workId && !referenced) throw new WorkUnavailableError('工作不存在，不能认领未知 ID')
      if (input.intent.organization && !input.organization) throw new WorkUnavailableError('模型组织意图没有宿主授权，不能直接认领')
      if (input.organization) {
        await assertOrganizationSource(tx, input)
        if (input.origin || input.wakeId || input.revisionRequestId || (referenced && !referenced.organization)) throw new WorkUnavailableError('完整业务工作不能隐式转换为组织工作')
        if (input.organization.requestId !== `bobo-collaboration:${input.sourceMessageId}` || !input.organization.goal.trim() || input.organization.goal.length > 12000 || !['employee_creation', 'organize_only', 'organize_and_execute'].includes(input.organization.mode)) throw new WorkUnavailableError('组织请求身份或合同无效')
        if (referenced && JSON.stringify(referenced.organization) !== JSON.stringify(input.organization)) throw new WorkUnavailableError('已有组织工作不能改变原合同')
      }
      const actualSource = await tx.get<Message>('messages', input.sourceMessageId)
      if (actualSource?.collaborationRequestId && actualSource.senderType === 'agent' && !referenced) throw new WorkUnavailableError('群开场只能认领固定 bobo 根或已明确分工的子工作')
      const sourceRevision = !input.revisionRequestId && !referenced?.revisionRequestId && !input.wakeId
        ? (await tx.list<ArtifactRevisionRequest>('artifactRevisionRequests')).find(request => request.messageId === input.sourceMessageId)
        : undefined
      const revisionId = input.revisionRequestId ?? referenced?.revisionRequestId ?? sourceRevision?.id
      const revision = revisionId ? await this.revisionScope(tx, revisionId, input.conversationId, input.agentId) : undefined
      if (revision) {
        if (input.origin || (referenced && referenced.revisionRequestId !== revision.id)) throw new WorkUnavailableError('新的修订请求不能认领原工作或继承自动化 occurrence')
        if (!referenced && input.sourceMessageId !== revision.messageId) throw new WorkUnavailableError('修订认领必须使用已受理的新用户消息')
        if (!revision.rootWorkId && (input.intent.workId || input.intent.expectedVersion !== undefined || input.wakeId)) throw new WorkUnavailableError('首次修订认领必须建立新根工作')
        if (!input.intent.workId && input.wakeId) throw new WorkUnavailableError('修订唤醒必须引用当前修订工作')
        if (!referenced && input.agentId !== revision.targetAgentId) throw new WorkUnavailableError('修订只能由明确选择的目标员工认领')
      }
      const sourceOrigin = revision ? undefined : (await tx.get<Message>('messages', input.sourceMessageId))?.origin
      const sourceOccurrence = sourceOrigin ? await assertAutomationExecution(tx, sourceOrigin, input.conversationId) : undefined
      const sourceMessageId = revision?.messageId ?? sourceOccurrence?.messageId ?? input.sourceMessageId
      const planned = sourceOccurrence?.plan?.collaboration
      if (planned && !input.intent.workId && input.agentId !== planned.coordinatorId) throw new WorkUnavailableError('群自动化只由汇总负责人认领根任务，其他员工须沿真实分工唤醒')
      const key = input.organization ? 'bobo-organization' : revision ? 'artifact-revision' : planned && !input.intent.workId ? AUTOMATION_ROOT_KEY : input.intent.key
      const id = input.intent.workId ?? revision?.rootWorkId ?? `work-${identity(input.conversationId, sourceMessageId, key)}`
      let work = referenced ?? await tx.get<WorkItem>('workItems', id)
      if (work?.organization && (!input.organization || JSON.stringify(work.organization) !== JSON.stringify(input.organization))) throw new WorkUnavailableError('组织工作必须保留原宿主合同')
      if (revision?.rootWorkId && !work) throw new WorkUnavailableError('修订根工作已清理，不能重新建立预算')
      if (revision && work) {
        if (work.revisionRequestId !== revision.id) throw new WorkUnavailableError('修订不能复用已有的其他工作')
        await this.revisionWork(tx, work)
      }
      const incomingOrigin = input.intent.workId ? input.origin : input.origin ?? sourceOrigin
      if (work && work.origin?.occurrenceId !== incomingOrigin?.occurrenceId) throw new WorkUnavailableError('不能把已有工作改绑到另一自动化或普通聊天')
      const origin = work ? work.origin : sourceOrigin
      if (input.origin && (!origin || origin.occurrenceId !== input.origin.occurrenceId || origin.automationId !== input.origin.automationId || origin.authorizedFingerprint !== input.origin.authorizedFingerprint)) throw new WorkUnavailableError('自动化工作缺少可信原始来源')
      const automation = origin ? await assertAutomationExecution(tx, origin, input.conversationId) : undefined
      const isNew = !work
      if (!work) {
        work = { schemaVersion: 2, id, conversationId: input.conversationId, sourceMessageId, ...(origin ? { origin } : {}),
          ...(input.organization ? { organization: structuredClone(input.organization), collaborationRequestId: input.organization.requestId } : {}),
          ...(revision ? { revisionRequestId: revision.id } : {}),
          key, scope: input.intent.scope, deliverable: input.intent.deliverable, ownerAgentId: input.agentId,
          version: 1, status: 'ready', budgetId: automation?.budgetId ?? `budget-${identity(input.conversationId, revision?.messageId ?? input.sourceMessageId)}`,
          rootWorkId: id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0,
          resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: timestamp(), updatedAt: timestamp() }
      }
      if (work.conversationId !== input.conversationId) throw new WorkUnavailableError('工作不属于当前会话')
      if (work.collaborationRequestId && !work.organization) {
        const group = await tx.get<Conversation>('conversations', work.conversationId), agent = await tx.get<DigitalAgent>('agents', input.agentId)
        if (!group || group.kind !== 'group' || !group.agentIds.includes(input.agentId) || !agent?.active || agent.executionBackend?.kind === 'acp-local' || await tx.get('conversationCleanup', group.id) || actualSource?.collaborationRequestId !== work.collaborationRequestId || actualSource.senderType !== 'agent' || actualSource.senderId !== 'bobo') throw new WorkUnavailableError('群任务来源或当前成员授权已经失效')
        const root = await tx.get<WorkItem>('workItems', work.rootWorkId)
        if (!root || root.ownerAgentId !== 'bobo' || root.parentWorkId || root.collaborationRequestId !== work.collaborationRequestId || (!work.parentWorkId && work.id !== root.id)) throw new WorkUnavailableError('群任务必须沿本群唯一 bobo 业务根')
      }
      if (work.ownerAgentId !== input.agentId) throw new WorkUnavailableError('工作已有负责人，请等待结果或提出独立工作')
      if (work.activeRunId === input.runId) return work
      if (work.activeRunId) throw new WorkUnavailableError('工作已有运行持有执行权')
      if (input.intent.workId && input.intent.expectedVersion === undefined) throw new WorkUnavailableError('引用已有工作必须声明观察到的版本')
      if (input.intent.expectedVersion !== undefined && input.intent.expectedVersion !== work.version) throw new WorkUnavailableError('工作版本已变化，请重新读取当前结果')
      if (input.retryFromUserMessage) {
        const run = await tx.get<AgentRun>('runs', input.runId)
        const turn = run?.turnId ? await tx.get<DiscussionTurn>('turns', run.turnId) : undefined
        const original = await tx.get<Message>('messages', work.sourceMessageId)
        const conversation = await tx.get<Conversation>('conversations', work.conversationId)
        const agent = await tx.get<DigitalAgent>('agents', input.agentId)
        if (!input.intent.workId || !['failed', 'cancelled', 'interrupted'].includes(work.status) || work.origin || work.collaborationRequestId || work.organization || work.revisionRequestId || input.origin || input.wakeId || input.nativeTurn ||
          !actualSource || actualSource.id === work.sourceMessageId || actualSource.senderType !== 'user' || actualSource.senderId !== 'user' || actualSource.status !== 'completed' || actualSource.channel || actualSource.origin || actualSource.conversationId !== work.conversationId ||
          !original || actualSource.sequence <= original.sequence || !run || run.phase !== 'execution' || run.status !== 'running' || run.agentId !== input.agentId || run.conversationId !== work.conversationId || run.triggerMessageId !== actualSource.id ||
          !turn || turn.triggerMessageId !== actualSource.id || turn.workId || turn.wakeId || turn.origin || turn.collaborationRequestId || !conversation?.agentIds.includes(input.agentId) || !agent?.active || await tx.get('conversationCleanup', work.conversationId)) {
          throw new WorkUnavailableError('接续必须来自当前会话中新的用户消息及原未完成任务')
        }
        if ((await tx.list<AgentRun>('runs')).some(previous => previous.id !== run.id && previous.workId === work.id && previous.triggerMessageId === actualSource.id)) throw new WorkUnavailableError('这条接续消息已执行，不能重复重试')
        // Authorization and claim share this transaction: a later admission failure
        // must not leave the work ready or consume a retry allowance.
        await this.prepareRetry(tx, work, input.agentId, true)
      }
      if (work.status !== 'ready') throw new WorkUnavailableError(`工作当前为 ${work.status}，不能重复执行`)
      if (work.wakeId && work.wakeId !== input.wakeId) throw new WorkUnavailableError('该工作只能由定向接续认领')
      const wake = input.wakeId ? await tx.get<WorkWake>('workWakes', input.wakeId) : undefined
      if (input.wakeId && (!wake || wake.workId !== work.id || wake.waitRevision !== work.waitRevision || wake.status !== 'scheduled' || wake.kind === 'blocked')) throw new WorkUnavailableError('接续已经消费或失效')
      if (work.requiresReview) throw new WorkUnavailableError('已有操作需要核对，不能自动重放')
      if (await tx.get<WorkExecution>('workExecutions', input.runId)) throw new WorkUnavailableError('该运行已释放执行权，不能再次执行')
      let budget = await tx.get<WorkBudget>('workBudgets', work.budgetId)
      const native = isNativeBackend((await tx.get<DigitalAgent>('agents', input.agentId))?.executionBackend)
      if (native) work.budgetPolicy = 'native'; else delete work.budgetPolicy
      const group = await tx.get<Conversation>('conversations', input.conversationId)
      const members = group?.kind === 'group' ? await Promise.all(group.agentIds.map(id => tx.get<DigitalAgent>('agents', id))) : []
      const mixedGroup = members.some(member => member?.active && isNativeBackend(member.executionBackend)) && members.some(member => member?.active && (member.executionBackend?.kind ?? 'mastra-model') === 'mastra-model')
      const interactive = !work.origin && !work.collaborationRequestId && !input.organization && (native || mixedGroup || !!budget?.sourceMessageId)
      if (interactive) {
        const agent = await tx.get<DigitalAgent>('agents', input.agentId)
        if (!group?.agentIds.includes(input.agentId) || !agent?.active || agent.executionBackend?.kind === 'acp-local' || await tx.get('conversationCleanup', input.conversationId)) throw new WorkUnavailableError('交互工作成员授权已经失效')
      }
      if (native && work.origin && (!budget?.origin || budget.accounting !== 'model-calls-v1' || JSON.stringify(budget.origin) !== JSON.stringify(work.origin))) throw new WorkUnavailableError('本机自动化必须沿本次触发的原始请求账本')
      if (interactive && budget && (!['external-turn', 'mixed'].includes(budget.callUnit ?? '') || budget.accounting !== 'model-calls-v1' || budget.sourceMessageId !== work.sourceMessageId)) throw new WorkUnavailableError('旧本机工作缺少可信请求账本，不能隐式续用预算')
      if (!budget && (work.collaborationRequestId || interactive) && !isNew) throw new WorkUnavailableError('原工作预算缺失，不能重建默认额度')
      budget ??= newWorkBudget(work.budgetId, input.organization ? { collaborationRequestId: input.organization.requestId, conversationId: input.conversationId } : interactive ? { sourceMessageId: work.sourceMessageId, conversationId: input.conversationId, callUnit: mixedGroup || !native ? 'mixed' : 'external-turn' } : undefined, input.organization?.mode)
      if (interactive && (!native || mixedGroup) || native && (work.collaborationRequestId || work.origin)) budget.callUnit = 'mixed'
      if (work.collaborationRequestId && (budget.accounting !== 'model-calls-v1' || budget.collaborationRequestId !== work.collaborationRequestId || budget.origin)) throw new WorkUnavailableError('不能改绑或复用另一工作的预算')
      if (interactive && input.priorDecision) await adoptInteractiveDecision(tx, work, budget, input.sourceMessageId, input.priorDecision)
      else if (interactive && isNew) {
        const run = await tx.get<AgentRun>('runs', input.runId)
        const agent = await tx.get<DigitalAgent>('agents', input.agentId)
        if (!input.nativeTurn || !native || !run || run.phase !== 'execution' || run.status !== 'running' || run.agentId !== input.agentId || run.conversationId !== input.conversationId || run.triggerMessageId !== input.sourceMessageId || !sameBackendBinding(agent?.executionBackend, run.backend) || !actualSource || actualSource.conversationId !== input.conversationId || !run.backend?.sessionId) throw new WorkUnavailableError('交互新工作缺少原判断回执或当前原生会话执行权')
      }
      else if (input.priorDecision) {
        if (!input.organization) throw new WorkUnavailableError('普通工作不能采用组织判断调用')
        await this.adoptOrganizationDecision(tx, work, budget, input.priorDecision)
      }
      checkWorkBudget(budget, work.budgetPolicy)
      if (work.budgetPolicy !== 'native' && workLimitReached(budget.runs, budget.maxRuns)) throw new WorkUnavailableError('达到原始工作的运行次数上限')
      if (isNew) {
        if (work.budgetPolicy !== 'native' && workLimitReached(budget.workItems, budget.maxWorkItems)) throw new WorkUnavailableError('达到原始工作的拆分上限')
        if (!native) budget.workItems++
      }
      if (wake) { wake.status = 'consumed'; await tx.put(row('workWakes', wake)); delete work.wakeId }
      if (!native && !budget.accounting) { budget.modelCalls++; budget.usageIncomplete = true }
      if (!native) budget.runs++
      if (input.materialSources?.length) work.materialSources = structuredClone([...new Map([...(work.materialSources ?? []), ...input.materialSources].map(ref => [`${ref.id}:${ref.revision}`, ref])).values()])
      work.activeRunId = input.runId; work.status = 'running'; work.version++; work.updatedAt = timestamp()
      const execution: WorkExecution = { ...(native ? { callUnit: 'external-turn' as const } : {}), ...(work.origin ? { origin: work.origin } : {}), id: input.runId, workId: work.id, budgetId: work.budgetId, agentId: input.agentId, claimVersion: work.version, modelCalls: budget.accounting ? 0 : 1, usage: {}, status: 'active' }
      if (revision && !revision.rootWorkId) { revision.rootWorkId = work.id; await tx.put(row('artifactRevisionRequests', revision)) }
      await tx.put(row('workItems', work)); await tx.put(row('workBudgets', budget)); await tx.put(row('workExecutions', execution))
      return work
    })
  }

  private async adoptOrganizationDecision(tx: RecordTransaction, work: WorkItem, budget: WorkBudget, prior: { runId: string; callIds: string[] }) {
    const run = await tx.get<AgentRun>('runs', prior.runId)
    if (!run || run.status !== 'completed' || run.phase !== 'decision' || run.agentId !== 'bobo' || run.conversationId !== work.conversationId || run.triggerMessageId !== work.sourceMessageId || run.origin || !run.turnId || !prior.callIds.length || prior.callIds.length > 8 || new Set(prior.callIds).size !== prior.callIds.length) throw new WorkUnavailableError('组织判断调用没有匹配的真实完成来源')
    const native = isNativeBackend(run.backend)
    const agent = await tx.get<DigitalAgent>('agents', run.agentId)
    const calls = (await tx.list<ProfileModelCall>('profileModelCalls')).filter(call => call.runId === run.id)
    if (!sameBackendBinding(agent?.executionBackend, run?.backend) || run.backend?.kind === 'acp-local' || run.activityError || native && run.backend?.externalInvocations !== prior.callIds.length || calls.length !== prior.callIds.length || calls.some(call => !prior.callIds.includes(call.id))) throw new WorkUnavailableError('组织判断必须保留全部实际调用回执与原运行方式')
    if (!Number.isFinite(Date.parse(run.createdAt))) throw new WorkUnavailableError('组织判断缺少可信开始时间')
    const deadline = workBudgetDeadline(budget)
    if (!native && deadline !== undefined) budget.deadlineAt = new Date(Math.min(deadline, Date.parse(run.createdAt) + WORK_DURATION_MS)).toISOString()
    for (const id of prior.callIds) {
      const call = await tx.get<ProfileModelCall>('profileModelCalls', id)
      if (!call || call.runId !== run.id || call.conversationId !== work.conversationId || call.phase !== 'decision' || !Number.isFinite(Date.parse(call.startedAt)) || (call.callUnit === 'external-turn') !== native) throw new WorkUnavailableError('组织判断缺少真实唯一模型调用回执')
      if (native) continue
      const previous = await tx.get<BudgetModelCall>('budgetModelCalls', id)
      if (call.budgetOwned && (!previous || previous.budgetId !== budget.id)) throw new WorkUnavailableError('组织判断调用已经属于另一预算')
      await reserveBudgetCall(tx, budget, { id, conversationId: work.conversationId, runId: run.id, turnId: run.turnId, phase: 'decision', agentId: 'bobo', workId: work.id, collaborationRequestId: work.organization!.requestId, ...(native ? { callUnit: 'external-turn' } : {}) })
      if (call.usage) await settleBudgetCall(tx, id, run.id, call.usage)
      Object.assign(budget, (await tx.get<WorkBudget>('workBudgets', budget.id))!)
      await tx.put(row('profileModelCalls', { ...call, budgetOwned: true }))
    }
  }

  assertOrganizationHolder(tx: RecordTransaction, authority: BoboOrganizationAuthority) { return organizationHolder(tx, authority) }
  bindGroupStart(tx: RecordTransaction, operation: BoboCollaborationOperation, announcement?: Message) { return bindCollaborationGroup(tx, operation, announcement) }
  resumeCollaborationStart(tx: RecordTransaction, intentId: string) { return resumeGroupStart(tx, intentId) }
  claimOrganizationRecovery(tx: RecordTransaction, operation: BoboCollaborationOperation, runId: string, turnId: string) { return claimOrganizationFiles(tx, operation, runId, turnId) }

  /** A deterministic managed-file continuation delivers its real receipt without inventing a chat reply. */
  finishOrganizationRecovery(runId: string, operationId: string) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      const operation = await tx.get<BoboCollaborationOperation>('boboCollaborations', operationId)
      if (!execution.organizationRecoveryFrom || execution.pendingEffects || !operation || operation.status !== 'committed' || operation.authority.runId !== runId || operation.authority.workVersion !== work.version || operation.announcementSource.runId !== execution.organizationRecoveryFrom) throw new WorkUnavailableError('原组织恢复尚未真实交付或仍有待核对操作')
      const outcome: WorkOutcome = { disposition: 'delivered', summary: '已完成原组织发布', evidence: [{ kind: 'collaboration', reference: operation.id }] }
      await assertCollaborationEvidence(tx, work, outcome)
      if (outcome.disposition === 'delivered') await assertAutomationDelivery(tx, work)
      work.outcome = outcome; work.status = 'delivered'; work.requiresReview = false; work.resultVersion++; work.version++; work.updatedAt = timestamp(); delete work.activeRunId
      execution.status = 'released'
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
      return work
    })
  }

  private async holder(tx: RecordTransaction, runId: string) {
    const execution = await tx.get<WorkExecution>('workExecutions', runId)
    const work = execution && await tx.get<WorkItem>('workItems', execution.workId)
    if (!execution || !work || execution.status !== 'active' || work.activeRunId !== runId || work.ownerAgentId !== execution.agentId || work.version !== execution.claimVersion) throw new WorkUnavailableError('运行已不再持有当前工作的执行权')
    await this.revisionWork(tx, work)
    if (work.origin) await assertAutomationExecution(tx, work.origin, work.conversationId)
    return { execution, work }
  }
  /** Browser receipt changes and effect accounting share this original holder transaction. */
  browserTransaction<T>(runId: string, phase: 'prepare' | 'start' | 'finish', action: (tx: RecordTransaction, owner: { work: WorkItem; execution: WorkExecution }) => Promise<{ value: T; effect?: 'start' | 'confirm' }>) {
    return this.store.transaction(async tx => {
      let owner: { work: WorkItem; execution: WorkExecution }
      if (phase === 'finish') {
        const execution = await tx.get<WorkExecution>('workExecutions', runId)
        const work = execution && await tx.get<WorkItem>('workItems', execution.workId)
        if (!execution || !work) throw new WorkUnavailableError('原浏览器工作已清理')
        owner = { execution, work }
        if (execution.status === 'active') owner = await this.holder(tx, runId)
      } else owner = await this.holder(tx, runId)
      const budget=await tx.get<WorkBudget>('workBudgets',owner.work.budgetId)
      if (phase!=='finish') { if(!budget) throw new WorkUnavailableError('原浏览器工作预算缺失'); checkWorkBudget(budget, owner.work.budgetPolicy) }
      const result = await action(tx, owner)
      if (result.effect === 'start') {
        owner.execution.pendingEffects = (owner.execution.pendingEffects ?? 0) + 1
        owner.work.requiresReview = true
        await tx.put(row('workItems',owner.work)); await tx.put(row('workExecutions',owner.execution))
      } else if (result.effect === 'confirm') {
        if (!owner.execution.pendingEffects) throw new WorkUnavailableError('原浏览器动作没有待核对标记')
        owner.execution.pendingEffects--
        await tx.put(row('workExecutions',owner.execution))
      }
      return result.value
    })
  }
  recordMaterialSources(runId: string, sources: MaterialReadRef[]) {
    return this.store.transaction(async tx => {
      const { work } = await this.holder(tx, runId)
      work.materialSources = structuredClone([...new Map([...(work.materialSources ?? []), ...sources].map(ref => [`${ref.id}:${ref.revision}`, ref])).values()])
      await tx.put(row('workItems', work)); return work
    })
  }
  reserveAutomationCall(run: AgentRun, callId: string, phase: BudgetModelCall['phase']) {
    return this.store.transaction(async tx => {
      if (!run.origin || !run.turnId) throw new Error('自动化模型调用缺少来源或轮次')
      const o = await activateAutomationExecution(tx, run.origin, run.conversationId)
      const budget = o.budgetId && await tx.get<WorkBudget>('workBudgets', o.budgetId)
      if (!budget) throw new Error('本次自动化没有可信的原始预算，请发起新一轮')
      const agent = await tx.get<DigitalAgent>('agents', run.agentId)
      const native = isNativeBackend(run.backend)
      if (native || isNativeBackend(agent?.executionBackend) || budget.callUnit === 'mixed') {
        const current = await tx.get<AgentRun>('runs', run.id), turn = await tx.get<DiscussionTurn>('turns', run.turnId)
        const conversation = await tx.get<Conversation>('conversations', run.conversationId)
        if (!current || current.status !== 'running' || current.agentId !== run.agentId || current.turnId !== run.turnId || current.conversationId !== run.conversationId || current.workId !== run.workId || JSON.stringify(current.origin) !== JSON.stringify(run.origin) || !turn || turn.conversationId !== run.conversationId || JSON.stringify(turn.origin) !== JSON.stringify(run.origin) || ['cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)) throw new WorkUnavailableError('自动化调用缺少当前真实运行、轮次或原始来源')
        if (current.phase !== run.phase || phase !== current.phase && !(phase === 'report' && current.phase === 'execution')) throw new WorkUnavailableError('自动化调用阶段与真实运行不一致')
        if (!agent?.active || agent.executionBackend?.kind === 'acp-local' || !conversation?.agentIds.includes(agent.id) || await tx.get('conversationCleanup', conversation.id)) throw new WorkUnavailableError('自动化员工或聊天授权已经变化')
        if (!sameBackendBinding(agent.executionBackend, run.backend) || !sameBackendBinding(agent?.executionBackend, current.backend) || current.backend?.kind === 'acp-local' || native && (!isNativeBackend(agent.executionBackend) || current.backend?.profileId !== agent.executionBackend.profileId)) throw new WorkUnavailableError('自动化运行方式与当前员工不一致')
        if (JSON.stringify(budget.origin) !== JSON.stringify(run.origin) || budget.conversationId !== run.conversationId) throw new WorkUnavailableError('自动化调用不能改绑原始预算')
      }
      if (native) budget.callUnit = 'mixed'
      if (run.workId && phase === 'memory') {
        const work = await tx.get<WorkItem>('workItems', run.workId)
        if (!work || work.ownerAgentId !== run.agentId || work.budgetId !== budget.id || work.status !== 'delivered' || work.requiresReview) throw new WorkUnavailableError('自动化记忆只能沿已交付的原工作预算')
      }
      if (native) return callId
      const execution = run.workId && phase !== 'memory' ? (await this.holder(tx, run.id)).execution : undefined
      const existing = await tx.get<BudgetModelCall>('budgetModelCalls', callId)
      await reserveBudgetCall(tx, budget, { id: callId, runId: run.id, turnId: run.turnId, conversationId: run.conversationId, origin: run.origin, phase, ...(native ? { callUnit: 'external-turn' } : {}) })
      if (execution && !existing) { execution.modelCalls++; await tx.put(row('workExecutions', execution)) }
      return callId
    })
  }
  settleAutomationCall(runId: string, callId: string, usage: ModelUsage, complete = false) {
    return this.store.transaction(async tx => {
      await settleBudgetCall(tx, callId, runId, usage, complete)
      const call = await tx.get<BudgetModelCall>('budgetModelCalls', callId)
      return call ? tx.get<WorkBudget>('workBudgets', call.budgetId) : undefined
    })
  }
  reserveCollaborationCall(run: AgentRun, callId: string, phase: BudgetModelCall['phase']) {
    return this.store.transaction(async tx => {
      const authority = await collaborationCallAuthority(tx, run, phase)
      if (authority.native) return callId
      const previous = await tx.get('budgetModelCalls', callId)
      await reserveBudgetCall(tx, authority.budget, { id: callId, runId: run.id, turnId: run.turnId!, conversationId: run.conversationId, phase, collaborationRequestId: authority.requestId, agentId: run.agentId, ...(authority.native ? { callUnit: 'external-turn' } : {}), ...(run.workId ? { workId: run.workId } : {}) })
      if (!previous && run.workId) {
        const execution = await tx.get<WorkExecution>('workExecutions', run.id)
        if (execution) { execution.modelCalls++; await tx.put(row('workExecutions', execution)) }
      }
      return callId
    })
  }
  settleCollaborationCall(runId: string, callId: string, usage: ModelUsage, complete = false) { return this.settleInteractiveCall(runId, callId, usage, complete) }
  reserveInteractiveCall(run: AgentRun, callId: string, phase: BudgetModelCall['phase']) {
    return this.store.transaction(async tx => {
      const { work, budget, native } = await interactiveCallAuthority(tx, run, phase)
      if (native) return callId
      const execution = phase === 'memory' ? undefined : (await this.holder(tx, run.id)).execution
      const previous = await tx.get('budgetModelCalls', callId)
      if (phase === 'memory' && (await tx.list<BudgetModelCall>('budgetModelCalls')).some(call => call.id !== callId && call.workId === work.id && call.turnId === run.turnId && call.phase === 'memory')) throw new WorkUnavailableError('本轮工作记忆已有请求，不得重新执行')
      await reserveBudgetCall(tx, budget, { id: callId, runId: run.id, turnId: run.turnId!, conversationId: run.conversationId, sourceMessageId: work.sourceMessageId, workId: work.id, agentId: run.agentId, phase, ...(native ? { callUnit: 'external-turn' } : {}) })
      if (execution && !previous) { execution.modelCalls++; await tx.put(row('workExecutions', execution)) }
      return callId
    })
  }
  settleInteractiveCall(runId: string, callId: string, usage: ModelUsage, complete = false) {
    return this.store.transaction(async tx => {
      await settleBudgetCall(tx, callId, runId, usage, complete)
      const call = await tx.get<BudgetModelCall>('budgetModelCalls', callId)
      return call ? tx.get<WorkBudget>('workBudgets', call.budgetId) : undefined
    })
  }
  reserveCall(runId: string) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      if (work.budgetPolicy === 'native') return
      const budget = (await tx.get<WorkBudget>('workBudgets', execution.budgetId))!
      if (budget.accounting) throw new WorkUnavailableError('调用必须使用原预算的唯一请求账本')
      checkWorkBudget(budget, work.budgetPolicy); budget.modelCalls++; execution.modelCalls++
      await tx.put(row('workExecutions', execution)); await tx.put(row('workBudgets', budget))
    })
  }
  usage(runId: string, usage: ModelUsage) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      if (work.budgetPolicy === 'native') return
      const budget = (await tx.get<WorkBudget>('workBudgets', execution.budgetId))!
      if (budget.accounting) return budget // Raw per-call receipts own this budget; cumulative SDK usage must not double-charge.
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (usage[key] !== undefined) {
        if (!Number.isFinite(usage[key]) || usage[key]! < 0) throw new Error('工作用量必须是已知的非负数')
        const next = Math.max(execution.usage[key] ?? 0, usage[key]!)
        budget.usage[key] = (budget.usage[key] ?? 0) + next - (execution.usage[key] ?? 0)
        execution.usage[key] = next
      }
      await tx.put(row('workExecutions', execution)); await tx.put(row('workBudgets', budget))
      return budget
    })
  }
  markEffect(runId: string) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      const budget = await tx.get<WorkBudget>('workBudgets', execution.budgetId)
      if ((budget?.sourceMessageId || budget?.collaborationRequestId || budget?.origin) && budget.accounting) checkWorkBudget(budget, work.budgetPolicy)
      execution.pendingEffects = (execution.pendingEffects ?? 0) + 1
      work.requiresReview = true; await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
    })
  }

  /** The receipt and all publication records commit with the ownership check. */
  settle(runId: string, outcome: WorkOutcome, receipt: { messageId: string; content: string; artifactIds: string[] }, records: StoredRecord[] = [], committedMessage?: (tx: RecordTransaction) => Promise<unknown>, referenceArtifacts?: (tx: RecordTransaction, work: WorkItem) => Promise<string[]>) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      const references = referenceArtifacts ? await referenceArtifacts(tx, work) : []
      const evidenceError = workEvidenceError(outcome, { ...receipt, artifactIds: [...receipt.artifactIds, ...references] }, !!execution.pendingWait)
      if (evidenceError) throw new Error(evidenceError)
      await assertCollaborationEvidence(tx, work, outcome)
      if (outcome.disposition === 'delivered') await assertAutomationDelivery(tx, work)
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      const newResult = outcome.disposition === 'delivered' || receipt.artifactIds.some(id => !work.artifactIds.includes(id))
      const wait = execution.pendingWait
      const newDependency = wait?.dependencies.some(result => (work.observedResults.find(item => item.workId === result.workId)?.resultVersion ?? 0) < result.resultVersion)
      if (work.budgetPolicy !== 'native' && !newResult && !newDependency) budget.noProgress++
      if (wait) {
        work.dependsOnWorkIds = wait.dependencies.map(result => result.workId); work.requiredResults = wait.dependencies
        work.nextStep = wait.nextStep; work.waitRevision++
      }
      work.observedResults = [...work.requiredResults]
      if (!(execution.pendingEffects ?? 0)) work.requiresReview = false
      work.outcome = outcome; work.resultMessageIds.push(receipt.messageId)
      work.artifactIds = [...new Set([...work.artifactIds, ...receipt.artifactIds])]
      work.resultVersion++; work.version++; work.updatedAt = timestamp()
      if (outcome.userQuestion) work.userQuestion = { id: `work:${work.id}:${work.resultVersion}`, messageId: receipt.messageId, content: outcome.userQuestion, revision: work.version }
      work.status = outcome.disposition === 'delivered' ? 'delivered' : outcome.disposition === 'waiting' ? 'waiting' : 'blocked'
      delete work.activeRunId; execution.status = 'released'
      if (work.budgetPolicy !== 'native' && workLimitReached(budget.noProgress, budget.maxNoProgress) && work.status !== 'delivered') { work.status = 'blocked'; work.outcome = { disposition: 'blocked', summary: '达到原始工作的无进展接续上限' } }
      await tx.put(row('workBudgets', budget))
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
      for (const item of records) await tx.put(item)
      await committedMessage?.(tx)
      return (await tx.get<WorkItem>('workItems', work.id))!
    })
  }
  withhold(runId: string, reason: string, records: StoredRecord[]) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      work.outcome = { disposition: 'blocked', summary: reason }; work.status = 'blocked'
      const wait = execution.pendingWait
      if (wait) {
        const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
        if (work.budgetPolicy !== 'native' && !wait.dependencies.some(result => (work.observedResults.find(item => item.workId === result.workId)?.resultVersion ?? 0) < result.resultVersion)) budget.noProgress++
        work.dependsOnWorkIds = wait.dependencies.map(result => result.workId); work.requiredResults = wait.dependencies
        work.nextStep = wait.nextStep; work.waitRevision++; work.observedResults = [...work.requiredResults]
        if (!(execution.pendingEffects ?? 0)) work.requiresReview = false
        work.outcome = { disposition: 'waiting', summary: wait.nextStep }; work.status = 'waiting'
        if (work.budgetPolicy !== 'native' && workLimitReached(budget.noProgress, budget.maxNoProgress)) { work.status = 'blocked'; work.outcome = { disposition: 'blocked', summary: '达到原始工作的无进展接续上限' } }
        await tx.put(row('workBudgets', budget))
      }
      work.version++; work.updatedAt = timestamp(); delete work.activeRunId; execution.status = 'released'
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
      for (const item of records) await tx.put(item)
    })
  }
  release(runId: string, status: 'failed' | 'cancelled' | 'interrupted') {
    return this.store.transaction(async tx => {
      const execution = await tx.get<WorkExecution>('workExecutions', runId)
      if (!execution) return
      const work = await tx.get<WorkItem>('workItems', execution.workId)
      if (!work || work.activeRunId !== runId || work.version !== execution.claimVersion) return
      delete work.activeRunId; work.status = status; work.version++; work.updatedAt = timestamp(); execution.status = 'released'
      if (status === 'cancelled') { const budget = await tx.get<WorkBudget>('workBudgets', work.budgetId); work.cancellationCause = budget && work.budgetPolicy !== 'native' && workBudgetExhausted(budget) ? 'budget' : 'user' }
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
    })
  }
  confirmEffect(runId: string) {
    return this.store.transaction(async tx => {
      const { execution, work } = await this.holder(tx, runId)
      if (!execution.pendingEffects) throw new Error('没有可确认的工具操作')
      await confirmOrganizationRecovery(tx, work, execution)
      execution.pendingEffects--; await tx.put(row('workExecutions', execution))
    })
  }
  reserveReport(runId: string) {
    return this.store.transaction(async tx => {
      const { work } = await this.holder(tx, runId)
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      checkWorkBudget(budget, work.budgetPolicy)
      if (work.budgetPolicy === 'native') return
      if (workLimitReached(budget.reportRefreshes, budget.maxReportRefreshes)) throw new WorkUnavailableError('达到原始工作的重新汇报上限')
      budget.reportRefreshes++; await tx.put(row('workBudgets', budget))
    })
  }
  delegate(runId: string, input: WorkDelegation) {
    const parsed = workDelegationSchema.parse(input)
    return this.store.transaction(async tx => {
      const { work: parent, execution } = await this.holder(tx, runId)
      const proposal = await automationDelegation(tx, parent, parsed)
      if (parent.organization) throw new WorkUnavailableError('核心组织阶段不能在后台给员工分工，请在已发布群内协作')
      const budget = (await tx.get<WorkBudget>('workBudgets', parent.budgetId))!
      if (parent.collaborationRequestId || budget.sourceMessageId) {
        const group = await tx.get<Conversation>('conversations', parent.conversationId), member = await tx.get<DigitalAgent>('agents', proposal.ownerAgentId)
        if (group?.kind !== 'group' || !group.agentIds.includes(proposal.ownerAgentId) || !group.agentIds.includes(execution.agentId) || !member?.active || member.executionBackend?.kind === 'acp-local' || await tx.get('conversationCleanup', parent.conversationId)) throw new WorkUnavailableError('分工目标不是本群当前有效员工')
      }
      if (parent.revisionRequestId) await this.revisionScope(tx, parent.revisionRequestId, parent.conversationId, proposal.ownerAgentId)
      const id = `work-${identity(parent.id, proposal.key)}`
      const previous = await tx.get<WorkItem>('workItems', id)
      if (previous) {
        if (previous.ownerAgentId !== proposal.ownerAgentId || previous.scope !== proposal.scope || previous.deliverable !== proposal.deliverable || JSON.stringify(previous.requiredResults) !== JSON.stringify(proposal.dependencies ?? [])) throw new WorkUnavailableError('同一拆分标识已用于不同工作')
        return previous
      }
      const native = isNativeBackend((await tx.get<DigitalAgent>('agents', proposal.ownerAgentId))?.executionBackend)
      if (!native) checkWorkBudget(budget)
      if (!native && (workLimitReached(budget.workItems, budget.maxWorkItems) || workLimitReached(budget.runs, budget.maxRuns))) throw new WorkUnavailableError('达到原始工作的拆分或运行上限')
      const dependencies = proposal.dependencies ?? []
      const work: WorkItem = { ...(native ? { budgetPolicy: 'native' as const } : {}), schemaVersion: 2, id, conversationId: parent.conversationId, sourceMessageId: parent.sourceMessageId, ...(parent.origin ? { origin: parent.origin } : {}),
        ...(parent.revisionRequestId ? { revisionRequestId: parent.revisionRequestId } : {}),
        ...(parent.collaborationRequestId ? { collaborationRequestId: parent.collaborationRequestId } : {}),
        ...(parent.materialSources?.length ? { materialSources: structuredClone(parent.materialSources) } : {}),
        key: proposal.key, scope: proposal.scope, deliverable: proposal.deliverable, ownerAgentId: proposal.ownerAgentId,
        rootWorkId: parent.rootWorkId, parentWorkId: parent.id, budgetId: parent.budgetId, version: 1,
        dependsOnWorkIds: dependencies.map(item => item.workId), requiredResults: dependencies, observedResults: [], waitRevision: dependencies.length ? 1 : 0,
        status: dependencies.length ? 'waiting' : 'ready', resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: timestamp(), updatedAt: timestamp() }
      await validateDependencies(tx, work, dependencies)
      if (!native) budget.workItems++; await tx.put(row('workBudgets', budget)); await tx.put(row('workItems', work))
      const source = { runId, agentId: execution.agentId }
      if (!dependencies.length) await queueWorkWake(tx, work, 'assigned', source)
      else await refreshWaiters(tx, work.conversationId, source)
      return (await tx.get<WorkItem>('workItems', id))!
    })
  }
  waitFor(runId: string, input: WorkWait) {
    const plan = workWaitSchema.parse(input)
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      await validateDependencies(tx, work, plan.dependencies)
      // Save the graph edge now so concurrent wait registrations cannot form a cycle.
      work.dependsOnWorkIds = plan.dependencies.map(item => item.workId)
      execution.pendingWait = plan
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
    })
  }
  /** Admission and the scheduler records are committed together; execution consumes separately. */
  scheduleWake(wakeId: string, turnId: string, records: StoredRecord[]) {
    return this.store.transaction(async tx => {
      const wake = await tx.get<WorkWake>('workWakes', wakeId)
      if (!wake || wake.kind === 'blocked' || wake.status !== 'pending') return false
      const work = await tx.get<WorkItem>('workItems', wake.workId)
      if (!work || work.wakeId !== wake.id || work.status !== 'ready' || work.requiresReview) return false
      if (work.origin) { try { await activateAutomationExecution(tx, work.origin, work.conversationId) } catch (error) { if (!(error instanceof WorkUnavailableError)) throw error; return false } }
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      try {
        checkWorkBudget(budget, work.budgetPolicy)
        if (work.budgetPolicy !== 'native' && workLimitReached(budget.runs, budget.maxRuns)) throw new WorkUnavailableError('达到原始工作的运行次数上限')
      } catch (error) {
        work.status = 'blocked'; work.outcome = { disposition: 'blocked', summary: (error as Error).message }; work.version++
        wake.status = 'cancelled'; wake.reason = work.outcome.summary
        await tx.put(row('workItems', work)); await tx.put(row('workWakes', wake))
        await refreshWaiters(tx, work.conversationId, { runId: 'host', agentId: 'host' }); return false
      }
      wake.status = 'scheduled'; wake.turnId = turnId
      await tx.put(row('workWakes', wake))
      for (const record of records) await tx.put(record)
      return true
    })
  }
  deferWake(wakeId: string, turnId: string) {
    return this.store.transaction(async tx => {
      const wake = await tx.get<WorkWake>('workWakes', wakeId)
      if (!wake || wake.turnId !== turnId || wake.status !== 'scheduled') return
      const work = await tx.get<WorkItem>('workItems', wake.workId)
      if (work?.status !== 'ready' || work.wakeId !== wake.id) return
      wake.status = 'pending'; delete wake.turnId; await tx.put(row('workWakes', wake))
    })
  }
  cancelTree(workId: string, reason: string, cause: 'user' | 'budget' = 'user') {
    return this.store.transaction(async tx => {
      const items = await tx.list<WorkItem>('workItems'), root = items.find(work => work.id === workId)
      if (!root) return []
      const ids = new Set([root.id])
      for (let pass = 0; pass < items.length; pass++) for (const work of items) if (work.parentWorkId && ids.has(work.parentWorkId)) ids.add(work.id)
      for (const work of items) if (ids.has(work.id) && !['delivered', 'cancelled', 'failed'].includes(work.status)) {
        if (work.activeRunId) {
          const execution = await tx.get<WorkExecution>('workExecutions', work.activeRunId)
          if (execution) { execution.status = 'released'; await tx.put(row('workExecutions', execution)) }
        }
        work.status = 'cancelled'; work.cancellationCause = cause; work.version++; work.updatedAt = timestamp(); delete work.activeRunId
        work.outcome = { disposition: 'blocked', summary: reason }; await tx.put(row('workItems', work))
      }
      for (const wake of await tx.list<WorkWake>('workWakes')) if (ids.has(wake.workId) && ['pending', 'scheduled'].includes(wake.status)) {
        wake.status = 'cancelled'; wake.reason = reason; await tx.put(row('workWakes', wake))
      }
      await refreshWaiters(tx, root.conversationId, { runId: 'host', agentId: 'user' })
      return [...ids]
    })
  }
  expire(conversationId: string) {
    return this.store.transaction(async tx => {
      const budgets = new Map((await tx.list<WorkBudget>('workBudgets')).map(budget => [budget.id, budget]))
      for (const work of await tx.list<WorkItem>('workItems')) if (work.conversationId === conversationId && work.budgetPolicy !== 'native' && ['ready', 'waiting'].includes(work.status) && !work.activeRunId && Date.now() >= (workBudgetDeadline(budgets.get(work.budgetId)!) ?? Infinity)) {
        work.status = 'blocked'; work.version++; work.outcome = { disposition: 'blocked', summary: '等待已超过原始工作的时间上限' }
        await tx.put(row('workItems', work))
        if (work.wakeId) {
          const wake = await tx.get<WorkWake>('workWakes', work.wakeId)
          if (wake && ['pending', 'scheduled'].includes(wake.status)) { wake.status = 'cancelled'; wake.reason = work.outcome.summary; await tx.put(row('workWakes', wake)) }
        }
      }
      await refreshWaiters(tx, conversationId, { runId: 'host', agentId: 'host' })
    })
  }
  authorizeRetry(workId: string, agentId: string, records: StoredRecord[] = [], continuedByUser = false) {
    return this.store.transaction(async tx => {
      const work = await tx.get<WorkItem>('workItems', workId)
      if (!work) throw new WorkUnavailableError('当前工作不能重试')
      await this.prepareRetry(tx, work, agentId, continuedByUser)
      for (const record of records) await tx.put(record)
    })
  }
  /** Shared read-only preflight; authoritative prepareRetry still runs this inside its original transaction. */
  async checkRetry(tx: RecordTransaction, work: WorkItem, agentId: string, continuedByUser = false) {
    if (work.ownerAgentId !== agentId || work.activeRunId || !(continuedByUser ? ['failed', 'cancelled', 'interrupted'] : ['failed', 'cancelled']).includes(work.status)) throw new WorkUnavailableError('当前工作不能重试')
    await this.revisionWork(tx, work)
    if (work.requiresReview) {
      const executions = continuedByUser ? (await tx.list<WorkExecution>('workExecutions')).filter(execution => execution.workId === work.id) : []
      // A new explicit continuation may use confirmed results. Unknown/legacy
      // counters and any unfinished effect still prohibit replay. Explicit
      // continuation uses confirmed tools without executing them again.
      if (!executions.length || executions.some(execution => execution.status !== 'released' || execution.pendingEffects !== 0)) throw new WorkUnavailableError('已有工具操作需要核对，请确认现有结果后发起明确的新请求')
    }
    const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
    if (continuedByUser) upgradeWorkExecutionAllowance(budget, true)
    checkWorkBudget(budget, work.budgetPolicy)
    if (work.budgetPolicy !== 'native' && workLimitReached(budget.retries, budget.maxRetries)) throw new WorkUnavailableError('达到原始工作的重试上限')
    for (const result of work.requiredResults) {
      const dependency = await tx.get<WorkItem>('workItems', result.workId)
      if (dependency?.status !== 'delivered' || dependency.resultVersion < result.resultVersion) throw new WorkUnavailableError('所需依赖尚未交付，不能重试执行')
    }
    if (work.parentWorkId) {
      const parent = await tx.get<WorkItem>('workItems', work.parentWorkId)
      if (parent?.status === 'cancelled' || parent?.status === 'interrupted') throw new WorkUnavailableError('父工作已停止，不能单独重试子工作')
    }
    return budget
  }
  private async prepareRetry(tx: RecordTransaction, work: WorkItem, agentId: string, continuedByUser = false) {
    const budget = await this.checkRetry(tx, work, agentId, continuedByUser)
    if (work.origin) await resumeAutomationExecution(tx, work.origin, work.conversationId, continuedByUser)
    delete work.wakeId
    if (work.budgetPolicy !== 'native') budget.retries++; await tx.put(row('workBudgets', budget))
    work.status = 'ready'; work.requiresReview = false; work.version++; work.updatedAt = timestamp()
    await tx.put(row('workItems', work))
  }
}

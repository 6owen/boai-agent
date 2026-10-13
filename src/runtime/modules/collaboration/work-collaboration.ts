/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: Codex/Claude共用外部阶段计量，回执同时比较具体kind与profile，禁止跨运行时借用预算身份。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [INPUT]: 同一 SQLite 事务中的 bobo 原组织工作、真实来源、冻结群发布和模型调用身份。
 * [OUTPUT]: 明确认领原组织重试后，判断阶段可在原ready工作预算内预留，执行阶段仍须当前实际持有者。
 * [OUTPUT]: 核心组织权限、唯一独立群根/启动意图、跨会话原预算授权及真实组织交付证据；不调用模型或执行文件。
 * [POS]: WorkRepository 的 bobo 协作事务规则，群是员工的组织形式，不取得员工生命周期。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { AgentRun, CollaborationStartIntent, Conversation, DiscussionTurn, DigitalAgent, Message, WorkBudget, WorkExecution, WorkItem, WorkOrganization, WorkOutcome } from '../../../shared/domain'
import type { BoboCollaborationOperation, BoboOrganizationAuthority } from '../../../shared/domain/bobo-collaboration'
import { isCoreAgent, isCoreConversation } from '../../../shared/domain/core-agent'
import { isNativeBackend, sameBackendBinding } from '../../../shared/domain/backends'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import { checkWorkBudget, WorkUnavailableError } from './work-budget'

const put = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
export const collaborationMessageHash = (message: Pick<Message, 'content'>) => createHash('sha256').update(message.content).digest('hex')

export async function assertOrganizationSource(tx: RecordTransaction, input: { conversationId: string; sourceMessageId: string; agentId: string }) {
  const [conversation, source, agent, cleanup] = await Promise.all([tx.get<Conversation>('conversations', input.conversationId), tx.get<Message>('messages', input.sourceMessageId), tx.get<DigitalAgent>('agents', input.agentId), tx.get('conversationCleanup', input.conversationId)])
  if (cleanup || !conversation || !isCoreConversation(conversation) || conversation.kind !== 'direct' || conversation.agentIds.length !== 1 || conversation.agentIds[0] !== 'bobo' || !isCoreAgent(agent) || !agent?.active || agent.executionBackend?.kind === 'acp-local') throw new WorkUnavailableError('组织员工只允许当前有效的 bobo 核心讨论会话')
  if (!source || source.conversationId !== conversation.id || source.status !== 'completed' || source.senderType !== 'user' || source.senderId !== 'user' || source.origin) throw new WorkUnavailableError('组织员工缺少本人明确的原始请求')
  return { conversation, source, agent }
}

export async function assertOrganizationHolder(tx: RecordTransaction, authority: BoboOrganizationAuthority) {
  const work = await tx.get<WorkItem>('workItems', authority.workId), execution = await tx.get<WorkExecution>('workExecutions', authority.runId)
  const { agent } = await assertOrganizationSource(tx, { conversationId: authority.sourceConversationId, sourceMessageId: authority.sourceMessageId, agentId: 'bobo' })
  if (!work || !execution || !work.organization || work.origin || work.ownerAgentId !== 'bobo' || work.conversationId !== authority.sourceConversationId || work.sourceMessageId !== authority.sourceMessageId || work.version !== authority.workVersion || work.activeRunId !== authority.runId || work.status !== 'running' || execution.status !== 'active' || execution.workId !== work.id || execution.agentId !== 'bobo' || execution.claimVersion !== work.version || agent.configVersion !== authority.agentConfigVersion) throw new WorkUnavailableError('组织工作已不再持有当前执行权或配置已变化')
  const budget = await tx.get<WorkBudget>('workBudgets', work.budgetId)
  if (!budget || budget.accounting !== 'model-calls-v1' || budget.origin || budget.collaborationRequestId !== work.organization.requestId) throw new WorkUnavailableError('组织工作没有可信的原始协作预算')
  checkWorkBudget(budget, work.budgetPolicy)
  return { work, budget }
}

/** Called after employees/group/announcement are staged in this same publication transaction. */
export async function bindGroupStart(tx: RecordTransaction, operation: BoboCollaborationOperation, announcement?: Message) {
  if (operation.authority.workId !== operation.organizationWorkId || operation.authority.sourceConversationId !== operation.sourceConversationId || operation.authority.sourceMessageId !== operation.sourceMessageId) throw new WorkUnavailableError('群协作缺少真实组织运行来源')
  const owner = await assertOrganizationHolder(tx, operation.authority)
  assertOperationContract(operation, owner.work.organization!, owner.budget)
  const sourceRun = await tx.get<AgentRun>('runs', operation.announcementSource.runId), sourceExecution = await tx.get<WorkExecution>('workExecutions', operation.announcementSource.runId)
  if (!sourceRun || !sourceExecution || sourceRun.agentId !== 'bobo' || sourceRun.conversationId !== operation.sourceConversationId || sourceRun.triggerMessageId !== operation.sourceMessageId || sourceRun.workId !== owner.work.id || sourceRun.origin || sourceExecution.workId !== owner.work.id || sourceExecution.agentId !== 'bobo' || sourceExecution.budgetId !== owner.budget.id) throw new WorkUnavailableError('原公告没有真实组织运行证据')
  if (operation.authority.runId !== sourceRun.id) {
    const frozen = await tx.get<BoboCollaborationOperation>('boboCollaborations', operation.id)
    if (!frozen || frozen.organizationWorkId !== owner.work.id || frozen.requestId !== operation.requestId || JSON.stringify(frozen.announcementSource) !== JSON.stringify(operation.announcementSource)) throw new WorkUnavailableError('组织接续不能改写原公告的真实运行来源')
  }
  const source = await tx.get<Message>('messages', operation.sourceMessageId)
  if (!source || collaborationMessageHash(source) !== operation.sourceMessageHash) throw new WorkUnavailableError('组织原始请求已经变化')
  if (operation.mode === 'employee_creation') {
    if (operation.groupConversationId || operation.conversation || operation.announcement || announcement) throw new WorkUnavailableError('单独创建员工不能发布群或开场消息')
    return null
  }
  const group = operation.groupConversationId && await tx.get<Conversation>('conversations', operation.groupConversationId), actual = announcement && await tx.get<Message>('messages', announcement.id)
  if (!group || group.kind !== 'group' || group.purpose === 'core' || group.agentIds.length > 12 || new Set(group.agentIds).size !== group.agentIds.length || !group.agentIds.includes('bobo') || !actual || actual.content !== announcement!.content || actual.conversationId !== group.id || actual.senderType !== 'agent' || actual.senderId !== 'bobo' || actual.status !== 'completed' || actual.runId || actual.collaborationRequestId !== operation.requestId || actual.collaborationSource?.operationId !== operation.id || actual.collaborationSource.sourceRunId !== operation.announcementSource.runId || actual.collaborationSource.toolCallId !== operation.announcementSource.toolCallId) throw new WorkUnavailableError('群开场必须是本次发布的真实 bobo 公告')
  const expected = new Set(['bobo', ...operation.existingMembers.map(member => member.agentId), ...operation.agents.map(agent => agent.id)])
  if (expected.size !== group.agentIds.length || group.agentIds.some(id => !expected.has(id))) throw new WorkUnavailableError('实际群成员与冻结方案不一致')
  for (const id of group.agentIds) {
    const agent = await tx.get<DigitalAgent>('agents', id)
    const version = operation.existingMembers.find(member => member.agentId === id)?.configVersion
    if (!agent?.active || agent.executionBackend?.kind === 'acp-local' || (version !== undefined && version !== agent.configVersion)) throw new WorkUnavailableError('群成员已经变化或不能参与群协作')
  }
  if (operation.mode !== 'organize_and_execute') return null
  const id = `work-${identity('bobo-collaboration-group', operation.requestId)}`, intentId = `collaboration-start-${identity(operation.requestId)}`
  const previous = await tx.get<CollaborationStartIntent>('collaborationStarts', intentId)
  if (previous) {
    const root = await tx.get<WorkItem>('workItems', id)
    if (previous.operationId !== operation.id || previous.groupConversationId !== group.id || previous.announcementMessageId !== actual.id || previous.announcementHash !== collaborationMessageHash(actual) || previous.budgetId !== owner.budget.id || !root || root.collaborationRequestId !== operation.requestId || root.parentWorkId) throw new WorkUnavailableError('协作请求已经绑定另一群任务或启动身份')
    return { groupRootWorkId: id, startIntentId: intentId, budgetId: owner.budget.id }
  }
  if (await tx.get('workItems', id)) throw new WorkUnavailableError('协作群根身份已被使用，不能另起预算')
  if (owner.work.budgetPolicy !== 'native' && owner.budget.workItems >= owner.budget.maxWorkItems) throw new WorkUnavailableError('达到原始工作的拆分上限')
  const createdAt = new Date().toISOString()
  const root: WorkItem = { budgetPolicy: owner.work.budgetPolicy, schemaVersion: 2, id, collaborationRequestId: operation.requestId, conversationId: group.id, sourceMessageId: actual.id, key: 'collaboration-root', scope: owner.work.organization!.goal, deliverable: '在本群按已授权目标安排分工并交付可检查结果', ownerAgentId: 'bobo', version: 1, status: 'ready', budgetId: owner.budget.id, rootWorkId: id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt, updatedAt: createdAt }
  const intent: CollaborationStartIntent = { id: intentId, schemaVersion: 1, requestId: operation.requestId, operationId: operation.id, groupConversationId: group.id, announcementMessageId: actual.id, announcementHash: collaborationMessageHash(actual), groupRootWorkId: root.id, rootWorkVersion: root.version, budgetId: root.budgetId, status: 'pending', createdAt }
  if (owner.work.budgetPolicy !== 'native') owner.budget.workItems++
  await tx.put(put('workBudgets', owner.budget)); await tx.put(put('workItems', root)); await tx.put(put('collaborationStarts', intent))
  return { groupRootWorkId: root.id, startIntentId: intent.id, budgetId: root.budgetId }
}

/** Published groups retain their own authority after the private core discussion is cleared. */
export async function collaborationStartAuthority(tx: RecordTransaction, intent: CollaborationStartIntent) {
  const [operation, group, message, root, budget] = await Promise.all([tx.get<BoboCollaborationOperation>('boboCollaborations', intent.operationId), tx.get<Conversation>('conversations', intent.groupConversationId), tx.get<Message>('messages', intent.announcementMessageId), tx.get<WorkItem>('workItems', intent.groupRootWorkId), tx.get<WorkBudget>('workBudgets', intent.budgetId)])
  if (!operation || operation.status !== 'committed' || operation.mode !== 'organize_and_execute' || operation.cancelRequested || operation.groupCleared || operation.requestId !== intent.requestId || operation.groupConversationId !== intent.groupConversationId || operation.groupRootWorkId !== intent.groupRootWorkId || operation.startIntentId !== intent.id || !group || group.kind !== 'group' || group.purpose === 'core' || !group.agentIds.includes('bobo') || !message || message.conversationId !== group.id || message.senderType !== 'agent' || message.senderId !== 'bobo' || message.status !== 'completed' || message.runId || message.collaborationSource?.operationId !== operation.id || message.collaborationSource.sourceRunId !== operation.announcementSource.runId || message.collaborationSource.toolCallId !== operation.announcementSource.toolCallId || message.collaborationRequestId !== intent.requestId || collaborationMessageHash(message) !== intent.announcementHash || !root || root.parentWorkId || root.origin || root.ownerAgentId !== 'bobo' || root.rootWorkId !== root.id || root.sourceMessageId !== message.id || root.budgetId !== intent.budgetId || root.conversationId !== group.id || root.collaborationRequestId !== intent.requestId || !budget || budget.accounting !== 'model-calls-v1' || budget.collaborationRequestId !== intent.requestId || budget.origin || await tx.get('conversationCleanup', group.id)) throw new WorkUnavailableError('真实群、公告、工作或原预算已经变化，不能开工')
  for (const id of group.agentIds) { const agent = await tx.get<DigitalAgent>('agents', id); if (!agent?.active || agent.executionBackend?.kind === 'acp-local' || (id === 'bobo' && !isCoreAgent(agent))) throw new WorkUnavailableError('群协作成员已变化或不能执行') }
  return { operation, group, message, root, budget }
}

/** Explicit admission only. An already consumed start returns its original fact without a new turn. */
export async function resumeCollaborationStart(tx: RecordTransaction, intentId: string) {
  const intent = await tx.get<CollaborationStartIntent>('collaborationStarts', intentId)
  if (!intent) throw new WorkUnavailableError('群协作启动身份不存在')
  if (intent.status === 'consumed') return intent
  if (!['pending', 'interrupted'].includes(intent.status)) throw new WorkUnavailableError('群协作已停止或需要核对，不能重新开工')
  const { root, budget } = await collaborationStartAuthority(tx, intent)
  // No legitimate execution can precede this initial intent's consumption. Even a confirmed
  // old tool cannot become a reason to repeat an initial business run.
  if (root.activeRunId || root.cancellationCause || root.resultVersion || root.resultMessageIds.length || root.artifactIds.length || (await tx.list<WorkExecution>('workExecutions')).some(execution => execution.workId === root.id) || (await tx.list<DiscussionTurn>('turns')).some(turn => turn.startIntentId === intent.id)) throw new WorkUnavailableError('原群任务已执行或有待核对事实，不能重放首次开工')
  checkWorkBudget(budget, root.budgetPolicy)
  if (root.budgetPolicy !== 'native' && budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的运行次数上限')
  if (intent.status === 'pending') {
    if (root.status !== 'ready' || root.requiresReview || root.version !== intent.rootWorkVersion) throw new WorkUnavailableError('群协作根工作已变化，不能开工')
    return intent
  }
  if (root.status !== 'interrupted' || root.version !== intent.rootWorkVersion + 1) throw new WorkUnavailableError('原群任务不再是尚未开工的重启中断版本')
  root.status = 'ready'; root.requiresReview = false; root.version++; root.updatedAt = new Date().toISOString()
  intent.status = 'pending'; intent.rootWorkVersion = root.version; delete intent.reason
  await tx.put(put('workItems', root)); await tx.put(put('collaborationStarts', intent))
  return intent
}

/** The caller has audited the original managed manifest; this admits a file continuation, not a model retry. */
export async function claimOrganizationRecovery(tx: RecordTransaction, operation: BoboCollaborationOperation, runId: string, turnId: string) {
  const current = await tx.get<BoboCollaborationOperation>('boboCollaborations', operation.id)
  if (!current || current.version !== operation.version || current.payloadHash !== operation.payloadHash || current.requestId !== operation.requestId || current.organizationWorkId !== operation.organizationWorkId || ['committed', 'cancelled'].includes(current.status) || current.cancelRequested || current.sourceCleared) throw new WorkUnavailableError('原组织操作已提交、放弃、清理或版本已变化')
  const { source, agent } = await assertOrganizationSource(tx, { conversationId: current.sourceConversationId, sourceMessageId: current.sourceMessageId, agentId: 'bobo' })
  const work = await tx.get<WorkItem>('workItems', current.organizationWorkId), budget = await tx.get<WorkBudget>('workBudgets', current.budgetId)
  if (!work?.organization || !['interrupted', 'failed', 'blocked'].includes(work.status) || work.activeRunId || work.cancellationCause || work.ownerAgentId !== 'bobo' || work.conversationId !== current.sourceConversationId || work.sourceMessageId !== source.id || work.budgetId !== current.budgetId || work.origin || agent.configVersion !== current.authority.agentConfigVersion || collaborationMessageHash(source) !== current.sourceMessageHash || !budget || budget.origin || budget.accounting !== 'model-calls-v1' || budget.collaborationRequestId !== current.requestId) throw new WorkUnavailableError('原组织工作不是可安全接续的当前未完成工作')
  assertOperationContract(current, work.organization, budget)
  for (const member of current.existingMembers) { const employee = await tx.get<DigitalAgent>('agents', member.agentId); if (!employee?.active || employee.configVersion !== member.configVersion || employee.executionBackend?.kind === 'acp-local' || isCoreAgent(employee)) throw new WorkUnavailableError('原组织员工已变化或不能参与群协作') }
  const executions = (await tx.list<WorkExecution>('workExecutions')).filter(execution => execution.workId === work.id)
  const original = executions.find(execution => execution.id === current.announcementSource.runId)
  if (!original || original.budgetId !== budget.id || executions.some(execution => execution.status === 'active' || ((execution.pendingEffects ?? 0) > 0 && (execution.pendingEffects !== 1 || (execution.id !== original.id && execution.organizationRecoveryFrom !== original.id))))) throw new WorkUnavailableError('原工作有其它执行或未知工具操作，不能接续组织文件')
  const [run, turn] = await Promise.all([tx.get<AgentRun>('runs', runId), tx.get<DiscussionTurn>('turns', turnId)])
  if (!run || run.status !== 'running' || run.agentId !== 'bobo' || run.conversationId !== work.conversationId || run.triggerMessageId !== source.id || run.turnId !== turnId || run.origin || run.collaborationRequestId !== current.requestId || (run.workId && run.workId !== work.id) || !turn || turn.conversationId !== work.conversationId || turn.triggerMessageId !== source.id || turn.collaborationRequestId !== current.requestId || ['cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status) || await tx.get('workExecutions', runId)) throw new WorkUnavailableError('组织文件恢复缺少本次明确的真实运行身份')
  checkWorkBudget(budget, work.budgetPolicy)
  if (work.budgetPolicy !== 'native' && budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的运行次数上限')
  const pendingEffects = executions.some(execution => (execution.pendingEffects ?? 0) > 0) ? 1 : 0
  work.status = 'running'; work.activeRunId = runId; work.version++; work.requiresReview = !!pendingEffects; work.updatedAt = new Date().toISOString()
  if (work.budgetPolicy !== 'native') budget.runs++
  const execution: WorkExecution = { id: runId, workId: work.id, budgetId: budget.id, agentId: 'bobo', claimVersion: work.version, status: 'active', modelCalls: 0, usage: {}, pendingEffects, organizationRecoveryFrom: original.id }
  await tx.put(put('workItems', work)); await tx.put(put('workBudgets', budget)); await tx.put(put('workExecutions', execution))
  return work
}

export async function confirmOrganizationRecovery(tx: RecordTransaction, work: WorkItem, execution: WorkExecution) {
  if (!execution.organizationRecoveryFrom) return
  const operation = (await tx.list<BoboCollaborationOperation>('boboCollaborations')).find(item => item.organizationWorkId === work.id && item.status === 'committed' && item.authority.runId === execution.id && item.announcementSource.runId === execution.organizationRecoveryFrom && item.requestId === work.organization?.requestId && item.budgetId === work.budgetId)
  if (!operation) throw new WorkUnavailableError('组织恢复尚未真实提交，不能确认原受管副作用')
  for (const prior of await tx.list<WorkExecution>('workExecutions')) if (prior.workId === work.id && prior.id !== execution.id && (prior.id === execution.organizationRecoveryFrom || prior.organizationRecoveryFrom === execution.organizationRecoveryFrom)) {
    if (prior.status === 'active' || (prior.pendingEffects ?? 0) > 1) throw new WorkUnavailableError('原组织恢复仍有未知工具操作')
    prior.pendingEffects = 0; await tx.put(put('workExecutions', prior))
  }
}

function assertOperationContract(operation: BoboCollaborationOperation, organization: WorkOrganization, budget: WorkBudget) {
  if (operation.requestId !== organization.requestId || operation.mode !== organization.mode || operation.goal !== organization.goal || operation.budgetId !== budget.id || operation.cancelRequested) throw new WorkUnavailableError('冻结组织方案不能改变原请求、模式、目标或预算')
}

/** Group phase grants come only from an actual bound collaboration turn, including child wakes. */
export async function collaborationCallAuthority(tx: RecordTransaction, run: AgentRun, phase: string) {
  const current = await tx.get<AgentRun>('runs', run.id), turn = run.turnId && await tx.get<DiscussionTurn>('turns', run.turnId)
  if (!current || current.status !== 'running' || current.agentId !== run.agentId || current.conversationId !== run.conversationId || current.turnId !== run.turnId || current.origin || !run.turnId || !turn || turn.conversationId !== run.conversationId || turn.status === 'cancelled' || turn.status === 'interrupted' || turn.status === 'budget_exhausted') throw new WorkUnavailableError('协作模型调用缺少当前真实运行或轮次')
  if (current.phase !== run.phase || (phase !== current.phase && !(phase === 'report' && current.phase === 'execution'))) throw new WorkUnavailableError('协作模型调用阶段与真实运行不一致')
  const requestId = run.collaborationRequestId ?? turn.collaborationRequestId
  if (!requestId || current.collaborationRequestId !== requestId) throw new WorkUnavailableError('协作模型调用没有宿主绑定的原请求')
  const agent = await tx.get<DigitalAgent>('agents', run.agentId), conversation = await tx.get<Conversation>('conversations', run.conversationId)
  if (!agent?.active || agent.executionBackend?.kind === 'acp-local' || !conversation?.agentIds.includes(agent.id) || await tx.get('conversationCleanup', conversation.id)) throw new WorkUnavailableError('协作员工或会话授权已经变化')
  const native = isNativeBackend(agent.executionBackend)
  if (!sameBackendBinding(agent?.executionBackend, current.backend) || current.backend?.kind === 'acp-local') throw new WorkUnavailableError('协作运行方式与当前员工不一致')
  let work: WorkItem | undefined
  if (isCoreConversation(conversation)) {
    const source = await assertOrganizationSource(tx, { conversationId: conversation.id, sourceMessageId: run.triggerMessageId, agentId: run.agentId })
    work = (await tx.list<WorkItem>('workItems')).find(item => item.conversationId === conversation.id && item.sourceMessageId === source.source.id && item.organization?.requestId === requestId)
    const retryDecision = phase === 'decision' && work?.id === turn.workId && work?.status === 'ready' && !work.activeRunId && !work.requiresReview
    if (!work || work.ownerAgentId !== run.agentId || (phase !== 'memory' && !retryDecision && work.activeRunId !== run.id)) throw new WorkUnavailableError('原组织工作没有授予本次模型调用')
  } else {
    if (conversation.kind !== 'group' || turn.collaborationRequestId !== requestId || !turn.workId) throw new WorkUnavailableError('普通聊天不能借用协作预算')
    work = await tx.get<WorkItem>('workItems', turn.workId)
    const root = work && await tx.get<WorkItem>('workItems', work.rootWorkId)
    if (!work || work.collaborationRequestId !== requestId || !root || root.ownerAgentId !== 'bobo' || root.parentWorkId || root.collaborationRequestId !== requestId || root.conversationId !== conversation.id) throw new WorkUnavailableError('本群没有匹配的固定协作根')
    const operation = (await tx.list<BoboCollaborationOperation>('boboCollaborations')).find(item => item.requestId === requestId && item.status === 'committed')
    if (!operation || operation.groupConversationId !== conversation.id || operation.groupRootWorkId !== root.id || operation.budgetId !== root.budgetId) throw new WorkUnavailableError('协作请求没有真实已提交的群任务授权')
  }
  if (phase !== 'memory' && run.workId) {
    const claimed = await tx.get<WorkItem>('workItems', run.workId), execution = await tx.get<WorkExecution>('workExecutions', run.id)
    if (!claimed || !execution || claimed.collaborationRequestId !== requestId || claimed.conversationId !== conversation.id || claimed.ownerAgentId !== run.agentId || claimed.activeRunId !== run.id || execution.status !== 'active' || execution.claimVersion !== claimed.version || execution.workId !== claimed.id) throw new WorkUnavailableError('协作任务不再持有自己的执行权')
    work = claimed
  }
  const budget = await tx.get<WorkBudget>('workBudgets', work.budgetId)
  if (!budget || budget.origin || budget.accounting !== 'model-calls-v1' || budget.collaborationRequestId !== requestId) throw new WorkUnavailableError('原协作预算缺失或账本不可信，不能重建默认额度')
  return { budget, work, requestId, native }
}

export async function assertCollaborationEvidence(tx: RecordTransaction, work: WorkItem, outcome: WorkOutcome) {
  const evidence = (outcome.evidence ?? []).filter(item => item.kind === 'collaboration')
  if (!work.organization) {
    if (evidence.length) throw new WorkUnavailableError('普通业务工作不能用组织回执冒充交付')
    return
  }
  if (outcome.disposition === 'delivered' && !evidence.length) throw new WorkUnavailableError('组织交付必须引用真实已提交的组织回执，文字答复不能替代')
  for (const reference of evidence) {
    const operation = await tx.get<BoboCollaborationOperation>('boboCollaborations', reference.reference)
    if (!operation || operation.status !== 'committed' || operation.organizationWorkId !== work.id || operation.requestId !== work.organization.requestId || operation.budgetId !== work.budgetId || operation.mode !== work.organization.mode || operation.sourceConversationId !== work.conversationId || operation.sourceMessageId !== work.sourceMessageId) throw new WorkUnavailableError('组织交付证据不是本次真实已提交回执')
    for (const agent of operation.agents) if (!await tx.get('agents', agent.id)) throw new WorkUnavailableError('组织回执中的员工已经不存在')
    if (operation.mode !== 'employee_creation') {
      const group = operation.groupConversationId && await tx.get<Conversation>('conversations', operation.groupConversationId), announcement = operation.announcement && await tx.get<Message>('messages', operation.announcement.id)
      if (!group || !announcement || announcement.senderId !== 'bobo' || announcement.collaborationSource?.operationId !== operation.id) throw new WorkUnavailableError('组织回执中的群或真实开场消息已经不存在')
    }
  }
}

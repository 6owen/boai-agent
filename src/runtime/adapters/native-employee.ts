/*
 * [OUTPUT]: 2026-10-10 任务允许简短可观察commentary，未发布草稿和私有分析不进入进度；正式交付沿原Work。
 * [INPUT]: 原宿主员工/聊天/Work上下文、具名原生阶段与会话仓库。
 * [OUTPUT]: Codex与Claude共用员工阶段；私有判断的提示与格式器共用wait非空依赖合同，原请求/接续身份、无业务操作和宿主最终校验保持。
 * [POS]: 本机员工共同流程；认证、原生生命周期和用量由各运行时适配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import type { MemoryCandidate, ParticipationDecision, WorkDraft, WorkReport } from '../../shared/domain'
import type { EngineContext } from '../contracts'
import { bootstrapInstructions, decisionInstructions, memoryInstructions, organizationDecisionAllowed, boboResponseInstructions, collaborationResponseInstructions } from '../modules/employees/phase-instructions'
import { decisionJsonSchema, decisionModelSchema, decisionPromptSchema, memorySchema, parseJson } from '../modules/employees/phase-protocol'
import { prepareMemoryExtraction } from '../modules/employees/memory-extraction'
import { workIntentSchema, modelWorkReportSchema, workEvidenceError } from '../modules/collaboration/work-protocol'
import { decisionMessageData, partitionTurn, visibleMessages } from './mastra/message-projection'
import { createNativeTask, type NativeTool } from './native-task'
import { NativeSessions, digest } from './native-sessions'
import type { ProductStore } from './storage/product-store'

export type NativePhase = 'chat' | 'decision' | 'task' | 'report' | 'memory'
export interface NativePhaseInput {
  prompt: string; instructions: string; ephemeral?: boolean; threadId?: string
  images?: string[]; tools?: NativeTool[]; timeoutMs?: number; onStop?(): void
  outputSchema?: Record<string, unknown>
  onSession?(id: string): Promise<void>
  onSubmitted?(threadId: string, turnId: string): Promise<void>
  onDelta?(text: string): Promise<void>
}
export abstract class NativeEmployeeEngine {
  private readonly sessions: NativeSessions
  constructor(store: ProductStore, protected readonly runtime: 'codex' | 'claude', private readonly policyVersion: number) { this.sessions = new NativeSessions(store, runtime) }
  recover(dataPath: string) { return this.sessions.recover(dataPath) }
  protected abstract phase(context: EngineContext, phase: NativePhase, input: NativePhaseInput): Promise<{ text: string }>
  async decide(context: EngineContext): Promise<ParticipationDecision> {
    const messages = visibleMessages(context), turn = partitionTurn(messages, context.triggerMessageId, context.turnId)
    if (!turn.root) throw new Error('没有可用于成员判断的消息')
    const members = (context.members ?? [context.agent]).filter(member => member.active && context.conversation.agentIds.includes(member.id))
    const schema = organizationDecisionAllowed(context) ? decisionPromptSchema : decisionPromptSchema.extend({ work: workIntentSchema.omit({ organization: true }).optional() })
    const jsonSchema = decisionJsonSchema(schema)
    const data = { currentEmployeeId: context.agent.id, currentTaskCapabilities: { browser: false, tools: true, files: true, commandsByApproval: context.agent.allowCommands, workingDirectory: 'host-assigned-per-work' },
      originalUserRequestId: turn.root.id, originalMentions: turn.root.mentionIds ?? [],
      ...(context.continuation ? { continuation: context.continuation } : {}),
      currentTurn: { id: turn.id, rootMessageId: turn.root.id }, participation: context.participation,
      members: members.map(({ id, name, role }) => ({ id, name, role })), workItems: context.workItems ?? [],
      historicalBackground: turn.history.map(message => decisionMessageData(message)), currentTurnMessages: turn.current.map(message => decisionMessageData(message, turn.root!.id)) }
    const output = await this.phase(context, 'decision', { ephemeral: true, outputSchema: jsonSchema, instructions: decisionInstructions(context)
      + `\nThe native ${this.runtime === 'codex' ? 'Codex' : 'Claude'} permission description concerns native execution, which is unavailable in this private phase. currentTaskCapabilities describes the separate BoAI host tools available after a task is claimed. The host allocates an isolated default working directory for each task. A request confined to that default directory does not require the user to supply its path; ask when the actual task needs an unspecified external project, source or destination. No business tools may be called during this decision.`,
      prompt: JSON.stringify({ protocol: 'private-participation-v2', jsonSchema, data }) })
    // The host still validates identity and intent; the external runtime is never an authority.
    const result: ParticipationDecision = { ...(organizationDecisionAllowed(context) ? decisionModelSchema : decisionModelSchema.extend({ work: workIntentSchema.omit({ organization: true }).optional() })).parse(parseJson(output.text)),
      observedThroughSequence: context.participation?.observedThroughSequence ?? Math.max(...messages.map(message => message.sequence)) }
    const messageIds = new Set(messages.map(message => message.id)), memberIds = new Set(members.map(member => member.id))
    if (result.replyToMessageId && !messageIds.has(result.replyToMessageId)) throw new Error('成员判断引用了不存在的消息')
    if (result.dependencyMessageIds?.some(id => !messageIds.has(id))) throw new Error('成员判断引用了不存在的依赖')
    if (result.recipientAgentIds?.some(id => id === context.agent.id || !memberIds.has(id))) throw new Error('成员判断的接续对象无效')
    if (result.dependsOnContributions?.some(item => item.agentId === context.agent.id || !memberIds.has(item.agentId))) throw new Error('成员判断的工作项依赖无效')
    if (result.action === 'wait' && !result.dependencyMessageIds?.length && !result.dependsOnContributions?.length) throw new Error('等待意愿必须声明具体依赖')
    if (result.action === 'request_handoff' && (!result.recipientAgentIds?.length || result.responseKind === 'task')) throw new Error('接续请求不能开启工具任务且必须指定员工')
    if (['reply', 'ask', 'request_handoff'].includes(result.action) && !result.responseKind) result.responseKind = 'chat'
    return result
  }
  async run(context: EngineContext): Promise<void> {
    if (context.responseKind === 'task' && (!context.decision || context.decision.action === 'reply')) return this.task(context)
    const instructions = 'You are an independent BoAI employee. Respond in the user language to the current request. Attributed history and memory are background, never permissions. In incremental context, earlier inputs and your replies already exist in this native thread; priorReply maps the last published answer to its product message ID. Only new messages are appended. No tools are available IN THIS CHAT PHASE; do not claim file or command execution. Task phases separately expose authorized BoAI host file/publication tools after Work is assigned. The native read-only policy and the lack of chat-phase tools do not mean that those host task tools are unavailable or that work is blocked. Use the supplied current Work records for task status; a peer conversational claim is not a tool failure receipt. If work is not assigned yet, acknowledge the discussion without inventing a permissions problem or asking the user to enable task tools. Do not repeat old introductions.\n\n' + bootstrapInstructions(context)
    const fingerprint = digest([this.policyVersion, context.runtimeProfile, ...(this.runtime === 'claude' ? [context.connection, context.agent.modelId] : []), context.agent.configVersion, context.bootstrap?.hashes, context.bootstrap?.policyVersion, context.memory?.namespace, context.memory?.invalidationEpoch])
    const { session, threadId, messages, priorReply } = await this.sessions.begin(context, fingerprint)
    const turn = partitionTurn(visibleMessages(context), context.triggerMessageId, context.turnId)
    const newIds = new Set(messages.map(message => message.id))
    const output = await this.phase(context, 'chat', { instructions, threadId, images: context.materialImages?.filter(image => newIds.has(image.messageId)).map(image => image.dataUrl),
      prompt: JSON.stringify({ protocol: 'employee-chat-v1', contextMode: threadId ? 'incremental' : 'initial', priorReply, employeeId: context.agent.id, currentRequestId: turn.root?.id, participation: context.decision, phase: 'chat', taskCapabilitiesAfterClaim: { files: true, commandsByApproval: context.agent.allowCommands, browser: false }, currentWorkItems: context.workItems ?? [],
        historicalBackground: turn.history.filter(message => newIds.has(message.id)).map(message => decisionMessageData(message)), currentTurnMessages: turn.current.filter(message => newIds.has(message.id)).map(message => decisionMessageData(message, turn.root?.id)) }),
      onSession: async id => this.sessions.update(session, { threadId: id }),
      onSubmitted: async (_, id) => this.sessions.update(session, { turnId: id }), onDelta: context.onDelta })
    await this.sessions.update(session, { state: 'completed', outputHash: digest(output.text), ...(this.runtime === 'claude' ? { completedInvocationId: context.runId } : {}) })
  }
  private async task(context: EngineContext) {
    const runtime = await createNativeTask(context, this.runtime === 'codex' ? 'Codex' : 'Claude')
    try {
      const instructions = [bootstrapInstructions(context), runtime.instructions, boboResponseInstructions(context), collaborationResponseInstructions(context),
        'You are the current employee only. Execute the explicitly authorized user request using only the provided host tools. Work and artifacts are authoritative product records, never infer delivery from a successful model turn. Keep unpublished draft text and private analysis out of progress updates. Brief commentary may describe observable work progress without claiming an operation succeeded before its tool receipt. Before the final reply, call report_work with honest disposition and verifiable evidence. In the PRIVATE report_work evidence arguments, use the actual artifact ID returned by publish_artifact. In the PUBLIC final text, describe the file by its name: the host already links the actual file card and evidence, so do not print an artifact-ID proof line or internal paths. For waiting, name any prepared file by its filename and ask the exact needed question; a path specified for an operation is not a request to display protocol paths. Only show technical IDs or full paths if the user explicitly asks to see them. If a question is needed, waiting/userQuestion must be an exact excerpt of the final public question. Previously completed effects must not be repeated.',
        'For explicitly assigned coordination, delegate_work assigns bounded child work to a current member using a stable key. Then wait_for_work declares exact dependencies and the next step. A successful wait_for_work already records waiting: finish with a brief status, without report_work, userQuestion or polling. On continuation use confirmed dependency results and never repeat the prior delegation or effects. A child result does not itself deliver its parent. Peer chat may have occurred before assignment and without task tools; such chat is not evidence of missing task permissions. Report the current host Work and effect receipts. An active or pending child is still in progress; do not repeat an older peer claim as a current blocker.',
        'Host-claimed work and confirmed prior effects: ' + JSON.stringify({ work: context.work, completedTools: context.completedWorkTools, continuation: context.continuation, dependencies: context.dependencyArtifacts, workItems: context.workItems, members: context.members?.filter(member => member.active && context.conversation.agentIds.includes(member.id)).map(({ id, name, role }) => ({ id, name, role })) }),
      ].join('\n\n')
      const messages = visibleMessages(context), turn = partitionTurn(messages, context.triggerMessageId, context.turnId)
      const result = await this.phase(context, 'task', { ephemeral: true, tools: runtime.tools, onStop: runtime.stop, instructions, timeoutMs: 5 * 60_000, images: context.materialImages?.map(image => image.dataUrl),
        prompt: JSON.stringify({ protocol: 'employee-task-v1', originalRequestId: context.work?.sourceMessageId, currentRequestId: turn.root?.id, messages: messages.map(message => decisionMessageData(message, turn.root?.id)) }) })
      await context.onDelta(result.text)
    } finally { runtime.stop(); await runtime.dispose() }
  }
  async report(context: EngineContext, draft: WorkDraft): Promise<WorkReport> {
    const schema = modelWorkReportSchema({ organization: !!context.work?.organization, waiting: !!context.pendingWorkWait, artifactIds: context.work?.artifactIds ?? [], collaborationIds: context.committedCollaborationIds ?? [] })
    const result = await this.phase(context, 'report', { ephemeral: true, outputSchema: z.toJSONSchema(schema, { target: 'draft-07' }), instructions: bootstrapInstructions(context) + '\nPrivately reconsider publication of the already executed work. No business tools. Never claim new operations or replay effects. Return only JSON conforming to jsonSchema: publish with updated text, or discard. Preserve declared waiting. In outcome.evidence cite only actual supplied artifact IDs or exact answer excerpts; in the public text describe files by filename without printing those internal IDs or protocol paths, unless the user explicitly asked to see them. Omit userQuestion unless disposition is waiting for an explicit user answer; that exact question must appear in the new public text. Never copy the original task request into userQuestion. Current host Work and result records determine execution status. A peer chat phase has no task tools, so an older conversational claim about unavailable tools is not a current task failure receipt. Do not publish such a claim as a blocker for an active or pending child.',
      prompt: JSON.stringify({ protocol: 'private-work-report', jsonSchema: z.toJSONSchema(schema), draft, work: context.work, pendingWait: context.pendingWorkWait, committedCollaborationIds: context.committedCollaborationIds, workItems: context.workItems ?? [], messages: visibleMessages(context).map(message => decisionMessageData(message)) }) })
    const report = schema.parse(parseJson(result.text))
    if (report.action === 'publish' && report.outcome) {
      const error = workEvidenceError(report.outcome, { content: report.text ?? '', artifactIds: context.work?.artifactIds ?? [] }, !!context.pendingWorkWait)
      if (error) throw new Error(error)
    }
    return report
  }

  async extractMemory(context: EngineContext): Promise<MemoryCandidate[]> {
    const extraction = prepareMemoryExtraction(context)
    if (!extraction) return []
    const result = await this.phase(context, 'memory', { ephemeral: true, outputSchema: z.toJSONSchema(memorySchema, { target: 'draft-07' }), instructions: memoryInstructions(context),
      prompt: JSON.stringify({ protocol: 'private-memory-delta-v1', jsonSchema: z.toJSONSchema(memorySchema), data: extraction.data }) })
    return extraction.validate(memorySchema.parse(parseJson(result.text)).candidates)
  }

}

/*
 * [OUTPUT]: 本机反思共用保存前事实复核并累加两个阶段已返回的用量；第二阶段不提供产品工具，原生配置/实际内部调用数沿本机运行时。
 * [OUTPUT]: 本机/API行为共用真实说话人ID与笔记引文装配，来源说明不混入用户引用。
 * [OUTPUT]: 2026-10-20 Alma技能接线：普通聊天按需读绑定技能/有来源记忆，独立任务协议与MCP媒体保持实际授权；本轮证据归独立Agent架构§11.21。
 * [OUTPUT]: 原生后台行为共享可用只读检索工具；原生配置保持。
 * [OUTPUT]: 原生人格反思共享完整来源日期/会话与说话人输入。
 * [OUTPUT]: 原生连续聊天静态指纹包括能力开关、动态心境只入当轮数据；独立行为不续用公开聊天线程。
 * [OUTPUT]: 2026-10-19应用业务协议：原生bobo沿同一应用指南与产品工具，目录/回执只读。
 * [OUTPUT]: 独立网页检索工具在 CLI 桥标记只读，实际执行仍核验员工和服务权限。
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: 明确cwd沿员工目录授权或既有原生权限进入进程，改变cwd使旧会话不可续用；未配置BOAI目录策略不虚称隔离。
 * [OUTPUT]: CLI直接使用本轮原生产品工具实例；关闭时中止/排空原调用，不另建Work或执行器。
 * [OUTPUT]: 本机公开上下文接收同一检索首选与本轮指定，原生自主循环保持。
 * [OUTPUT]: 本机会话指纹包含获准知识内容版本，更新后不续用旧原生上下文。
 * [OUTPUT]: 原生准备阶段可登记适配器严格核对后的新来源指纹，首条及后续消息共享同一真实会话；启动不重放。
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 普通bobo注入全局目录管理指令，不增加独立Agent或专用会话。
 * [OUTPUT]: 专用数据源会话注入共享bobo配置指令，沿原生连续聊天/产品工具桥。
 * [OUTPUT]: 原生bobo专用计划对话同样接收真实通讯录与单员工计划指令。
 * [OUTPUT]: 插件provider复用连续会话、产品取消、原生监督及来源核验；命名空间/恢复标记独立。
 * [OUTPUT]: 插件provider采用独立命名空间，复用原会话/来源/材料/退出边界。
 * [OUTPUT]: 真实原生上下文明确内置浏览器/自动化产品工具及当前可用身份，保持原生循环与选定权限。
 * [OUTPUT]: 输入投影v2包含真实材料路径，旧投影首次明确新消息时保守重建；历史保留，启动不重放。
 * [OUTPUT]: 2026-10-11 同一员工聊天一条消息一次持续原生turn；普通公开消息与final去重，真实输出身份支持重启续聊。
 * [INPUT]: 员工身份、普通IM增量、原生运行时和可选产品协作工具。
 * [OUTPUT]: 每员工×会话独立持续原生session；一条消息一次turn，无额外判断/汇报/记忆模型调用。
 * [POS]: 本机员工共同生产入口；旧native-employee仅保留旧阶段兼容代码。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ModelUsage } from '../../shared/domain'
import { behaviorModelContext, needsReflectionReview, reflectionReviewInstructions, reflectionReviewPrompt } from '../modules/employees/behavior-context'
import { hasKnowledge, knowledgeInstructions } from '../modules/resources/knowledge-tools'
import { searchSelectionInstructions } from '../modules/sources/search-selection'
import { stateToolInstructions } from '../modules/agent-state/state-tools'
import { boundSkillInstructions } from '../modules/resources/bound-skill-tools'
import { applicationInstructions, createApplicationTools } from '../modules/application/application-tools'
import { catalogManagementInstructions } from '../modules/resources/catalog-commands'
import { recoverNativeProcesses } from './native-process-guard'
import type { EngineContext } from '../contracts'
import type { ProductStore } from './storage/product-store'
import type { NativeTool } from './native-task'
import { workingDirectoryTarget } from '../modules/workspaces/working-directory'
import { NativeSessions, digest } from './native-sessions'
import { decisionMessageData } from './mastra/message-projection'
import { boboResponseInstructions } from '../modules/employees/phase-instructions'
import { createNativeProducts } from './native-products'

export interface NativeConversationInput {
  instructions: string; nativeInstructions?: string; prompt: string; threadId?: string; images: string[]; tools: NativeTool[]
  cancelProducts?(): void
  onSession(id: string, preparedSourceFingerprint?: string): Promise<void>
  onSubmitted(threadId: string, turnId: string): Promise<void>
}
export abstract class NativeConversationEngine {
  private readonly sessions: NativeSessions
  constructor(store: ProductStore, private readonly runtime: string) { this.sessions = new NativeSessions(store, runtime) }
  async recover(dataPath: string) { await recoverNativeProcesses(dataPath,this.runtime); return this.sessions.recover(dataPath) }
  protected abstract conversation(context: EngineContext, input: NativeConversationInput): Promise<{ text: string }>
  protected sourceFingerprint(_context: EngineContext): Promise<string | undefined> { return Promise.resolve(undefined) }
  async runBehavior(context: EngineContext, input: { instruction: string; maxModelCalls: number }) {
    const { agentBehaviorResultSchema } = await import('../../shared/domain/agent-profile')
    const { z } = await import('zod')
    const { parseJson } = await import('../modules/employees/phase-protocol')
    const source = await this.sourceFingerprint(context)
    if (source) context = { ...context, nativeSourceFingerprint: source }
    const { createWebSearchOperations } = await import('./mastra/web-search-tools')
    const tools = [...createApplicationTools(context), ...createWebSearchOperations(context)].map(tool => ({ name: tool.name, description: tool.description, inputSchema: { ...z.toJSONSchema(tool.schema, { io: 'input' }), type: 'object' }, execute: async (input: unknown) => tool.execute(input) }))
    const behaviorContext = behaviorModelContext(context)
    const instructions = `${context.bootstrap?.instructions ?? context.agent.instructions}\n\n${context.bootstrap?.dynamicInstructions ?? ''}\n\nThis is an enabled employee behavior, not an owner message. ${input.instruction}\n\n${behaviorContext.instructions}\nReturn only JSON matching ${JSON.stringify(z.toJSONSchema(agentBehaviorResultSchema))}. Only supplied message IDs are valid evidence. Native configuration and permissions remain in force. Do not act outside the configured behavior. Choose skip when there is no useful update. A draft is not a sent message.`
    let draftUsage: ModelUsage = {}
    const draftContext: EngineContext = { ...context, onUsage: async usage => { draftUsage = { ...usage }; await context.onUsage?.(usage) } }
    const result = await this.conversation(draftContext, { instructions, nativeInstructions: instructions, prompt: behaviorContext.prompt, images: [], tools,
      cancelProducts: () => {}, onSession: async () => {}, onSubmitted: async () => {} })
    const draft = agentBehaviorResultSchema.parse(parseJson(result.text))
    if (!needsReflectionReview(context, draft)) return draft
    const reviewInstructions = `${instructions}\n\n${reflectionReviewInstructions}`
    const reviewContext: EngineContext = { ...context, onUsage: async usage => {
      const cumulative: ModelUsage = { ...draftUsage }
      for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (usage[field] !== undefined) cumulative[field] = (draftUsage[field] ?? 0) + usage[field]!
      await context.onUsage?.(cumulative)
    } }
    const reviewed = await this.conversation(reviewContext, { instructions: reviewInstructions, nativeInstructions: reviewInstructions, prompt: reflectionReviewPrompt(behaviorContext.prompt, draft), images: [], tools: [],
      cancelProducts: () => {}, onSession: async () => {}, onSubmitted: async () => {} })
    return agentBehaviorResultSchema.parse(parseJson(reviewed.text))
  }
  async run(context: EngineContext) {
    if (context.workingDirectory) {
      if (!context.runtimeDirectory) throw new Error('当前原生运行不具备目录访问上下文')
      // cwd selects a project; the native Agent owns access and approval rules.
      const target = await workingDirectoryTarget(context.workingDirectory)
      context = { ...context, runtimeDirectory: { ...context.runtimeDirectory, cwd: target.path } }
    }
    const nativeSourceFingerprint = await this.sourceFingerprint(context)
    if (nativeSourceFingerprint) context = { ...context, nativeSourceFingerprint }
    const fingerprintFor = (source: string | undefined) => digest(['native-conversation-v2', ...(context.workingDirectory ? ['business-cwd-v1', context.runtimeDirectory?.cwd] : []), context.runtimeProfile, context.connection, context.agent.modelId, context.agent.nativeOptions, context.agent.configVersion, context.bootstrap?.hashes, context.bootstrap?.promptEvidence?.capabilityHash, context.memory?.invalidationEpoch, context.environment?.knowledge.map(version => [version.resource.id, version.hash, version.resource.path, version.resource.knowledge?.copyId, version.resource.knowledge?.revision]), ...(source ? ['native-source-v1', source] : []), ...(this.runtime === 'claude' && !context.runtimeProfile?.useExistingLogin && context.connection?.gateway ? ['claude-magpie-source-v1'] : []), ...(this.runtime === 'codex' && context.connection?.gateway ? ['codex-magpie-source-v1'] : [])])
    const fingerprint = fingerprintFor(nativeSourceFingerprint)
    const { session, threadId, messages, priorReply } = await this.sessions.begin(context, fingerprint)
    const publicReplies: { messageId: string; content: string }[] = []
    const productController = new AbortController()
    const nativeContext = { ...context, signal: AbortSignal.any([context.signal, productController.signal]), publishNativeMessage: context.publishNativeMessage ? async (content: string, callId: string) => {
      const published = await context.publishNativeMessage!(content, callId); publicReplies.push(published); return published
    } : undefined }
    const products = createNativeProducts(nativeContext)
    const releaseCliTools = context.registerCliTools?.(products.tools.map(tool => ({ ...tool, effect: ['boai_catalog', 'boai_receipt', 'inspect_knowledge', 'search_knowledge', 'read_knowledge', 'inspect_data_source', 'inspect_web_search', 'call_web_search', 'select_web_search', 'read_messages'].includes(tool.name) ? 'read' : 'write', observed: true })))
    try {
      if (context.modelCallId) await context.onModelCallStarted?.(context.modelCallId, 'chat', context.agent.nativeOptions?.effort)
      const newIds = new Set(messages.map(message => message.id))
      const nativeInstructions = [context.personality ? stateToolInstructions : '', context.application ? applicationInstructions : '', !context.application && (context.manageSkills || context.manageDataSources) ? catalogManagementInstructions : '', (context.conversation.automationCreation || context.conversation.sourceCreation) ? boboResponseInstructions(context) : '', context.bootstrap?.instructions ?? `You are ${context.agent.name}. ${context.agent.role}\n${context.agent.instructions}`,
        'You are an independent employee in BOAI, an IM collaboration product. Handle the current message using your native tools, skills, MCP servers, plugins and agents with the selected native permission policy. Ask clarification as an ordinary chat reply, and continue on the next message. Explain observable progress in commentary. Keep private reasoning private. Do not describe internal runtime IDs in public replies.',
        `Working directory: ${context.runtimeDirectory?.cwd ?? context.workspace?.workPath}. Bound resources (additional to native resources): ${JSON.stringify(context.resources.map(({ id, name, kind, path }) => ({ id, name, kind, path })))}`,
        hasKnowledge(context) ? knowledgeInstructions : '',
        searchSelectionInstructions(context),
        `Current members: ${JSON.stringify(context.members?.map(({ id, name, role }) => ({ id, name, role })) ?? [])}`,
      ].join('\n\n')
      const instructions = [nativeInstructions,
        'Use publish_artifact to deliver an existing file as a real chat attachment. A successful receipt proves publication. Native file creation alone does not register a BOAI artifact. Dependency files include nativePath for your native read tools; logicalPath is for legacy BOAI tools. Preserve colleague file ownership and cite a delivered dependency artifact ID when reporting its verified result. Use actual employee IDs for BOAI delegation; native subagents are execution resources, not BOAI employees. Ordinary conversation needs no Work or report_work. Work is created only when you explicitly call a product work tool. Never invent tool success or repeat a publication after an unknown receipt.',
        ...(context.agent.skillIds.length ? [boundSkillInstructions] : []),
        ...(context.nativeBrowserSession ? [`The current BOAI embedded browser is available through ${this.runtime === 'claude' ? 'mcp__boai__browser_tool' : 'browser_tool'}. This tool operates the user-referenced page in the same application and login. External browser skills, shell tools and browser instances cannot address that page. Start with snapshot for actual element refs and screenshot for visual evidence. Read-only access needs no Work; writes claim Work automatically. After an actual write, verify the page result and report_work with that evidence.`] : []),
        ...(context.manageAutomation ? [`For a BOAI employee/group automation request, use ${this.runtime === 'claude' ? 'mcp__boai__manage_automation' : 'manage_automation'} with the actual owner and members. Native cron/scheduling tools do not create BOAI plans or right-panel records. Only a persisted management receipt proves creation.`] : []),
      ].join('\n\n')
      const result = await this.conversation(nativeContext, { instructions, nativeInstructions, threadId, tools: products.tools,
        prompt: JSON.stringify({ employeeState: context.bootstrap?.dynamicInstructions, contextMode: threadId ? 'incremental' : 'initial', employeeId: context.agent.id, members: context.members?.map(({id, name, role}) => ({id, name, role})), priorReply, messages: messages.map(message => decisionMessageData(message)), deliveredFiles: context.nativeArtifacts, currentWork: context.work, dependencies: context.dependencyArtifacts, continuation: context.continuation }),
        images: context.materialImages?.filter(image => newIds.has(image.messageId)).map(image => image.dataUrl) ?? [],
        cancelProducts: () => productController.abort(new Error('原生插件已退出')),
        onSession: (id, preparedSource) => this.sessions.update(session, { threadId: id, ...(preparedSource ? { fingerprint: fingerprintFor(preparedSource) } : {}) }), onSubmitted: (_, id) => this.sessions.update(session, { turnId: id }),
      })
      const reply = result.text.trim() ? [...publicReplies].reverse().find(message => message.content.trim() === result.text.trim())?.content ?? result.text : publicReplies.at(-1)?.content ?? ''
      if (!result.text.trim() && reply) await context.onDelta(reply)
      await this.sessions.update(session, { state: 'completed', outputHash: digest(reply), completedInvocationId: context.runId })
    } finally { productController.abort(); try { await releaseCliTools?.() } finally { await products.dispose() } }
  }
}

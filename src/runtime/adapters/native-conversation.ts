/*
 * [OUTPUT]: 2026-10-11 同一员工聊天一条消息一次持续原生turn；普通公开消息与final去重，真实输出身份支持重启续聊。
 * [INPUT]: 员工身份、普通IM增量、原生运行时和可选产品协作工具。
 * [OUTPUT]: 每员工×会话独立持续原生session；一条消息一次turn，无额外判断/汇报/记忆模型调用。
 * [POS]: 本机员工共同生产入口；旧native-employee仅保留旧阶段兼容代码。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { recoverNativeProcesses } from './native-process-guard'
import type { EngineContext } from '../contracts'
import type { ProductStore } from './storage/product-store'
import type { NativeTool } from './native-task'
import { NativeSessions, digest } from './native-sessions'
import { decisionMessageData } from './mastra/message-projection'
import { createNativeProducts } from './native-products'

export interface NativeConversationInput {
  instructions: string; prompt: string; threadId?: string; images: string[]; tools: NativeTool[]
  onSession(id: string): Promise<void>
  onSubmitted(threadId: string, turnId: string): Promise<void>
}
export abstract class NativeConversationEngine {
  private readonly sessions: NativeSessions
  constructor(store: ProductStore, private readonly runtime: 'codex' | 'claude') { this.sessions = new NativeSessions(store, runtime) }
  async recover(dataPath: string) { await recoverNativeProcesses(dataPath,this.runtime); return this.sessions.recover(dataPath) }
  protected abstract conversation(context: EngineContext, input: NativeConversationInput): Promise<{ text: string }>
  async run(context: EngineContext) {
    const fingerprint = digest(['native-conversation-v1', context.runtimeProfile, context.connection, context.agent.modelId, context.agent.nativeOptions, context.agent.configVersion, context.bootstrap?.hashes, context.memory?.invalidationEpoch])
    const { session, threadId, messages, priorReply } = await this.sessions.begin(context, fingerprint)
    const publicReplies: { messageId: string; content: string }[] = []
    const nativeContext = { ...context, publishNativeMessage: context.publishNativeMessage ? async (content: string, callId: string) => {
      const published = await context.publishNativeMessage!(content, callId); publicReplies.push(published); return published
    } : undefined }
    const products = createNativeProducts(nativeContext)
    try {
      if (context.modelCallId) await context.onModelCallStarted?.(context.modelCallId, 'chat', context.agent.nativeOptions?.effort)
      const newIds = new Set(messages.map(message => message.id))
      const instructions = [context.bootstrap?.instructions ?? `You are ${context.agent.name}. ${context.agent.role}\n${context.agent.instructions}`,
        'You are an independent employee in BOAI, an IM collaboration product. Handle the current message using your native tools, skills, MCP servers, plugins and agents with the selected native permission policy. BOAI tools add product collaboration and artifact publishing; they do not replace or restrict native tools. Ask clarification as an ordinary chat reply, and continue on the next message. Explain observable progress in commentary. Keep private reasoning private. Do not describe internal runtime IDs in public replies.',
        'Use publish_artifact to deliver an existing file as a real chat attachment. A successful receipt proves publication. Native file creation alone does not register a BOAI artifact. Dependency files include nativePath for your native read tools; logicalPath is for legacy BOAI tools. Preserve colleague file ownership and cite a delivered dependency artifact ID when reporting its verified result. Use actual employee IDs for BOAI delegation; native subagents are execution resources, not BOAI employees. Ordinary conversation needs no Work or report_work. Work is created only when you explicitly call a product work tool. Never invent tool success or repeat a publication after an unknown receipt.',
        `Working directory: ${context.runtimeDirectory?.cwd ?? context.workspace?.workPath}. Bound resources (additional to native resources): ${JSON.stringify(context.resources.map(({ id, name, kind, path }) => ({ id, name, kind, path })))}`,
        `Current members: ${JSON.stringify(context.members?.map(({ id, name, role }) => ({ id, name, role })) ?? [])}`,
      ].join('\n\n')
      const result = await this.conversation(nativeContext, { instructions, threadId, tools: products.tools,
        prompt: JSON.stringify({ contextMode: threadId ? 'incremental' : 'initial', employeeId: context.agent.id, members: context.members?.map(({id, name, role}) => ({id, name, role})), priorReply, messages: messages.map(message => decisionMessageData(message)), deliveredFiles: context.nativeArtifacts, currentWork: context.work, dependencies: context.dependencyArtifacts, continuation: context.continuation }),
        images: context.materialImages?.filter(image => newIds.has(image.messageId)).map(image => image.dataUrl) ?? [],
        onSession: id => this.sessions.update(session, { threadId: id }), onSubmitted: (_, id) => this.sessions.update(session, { turnId: id }),
      })
      const reply = result.text.trim() ? [...publicReplies].reverse().find(message => message.content.trim() === result.text.trim())?.content ?? result.text : publicReplies.at(-1)?.content ?? ''
      if (!result.text.trim() && reply) await context.onDelta(reply)
      await this.sessions.update(session, { state: 'completed', outputHash: digest(reply), completedInvocationId: context.runId })
    } finally { await products.dispose() }
  }
}

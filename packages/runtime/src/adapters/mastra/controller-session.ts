/*
 * [OUTPUT]: 2026-11-24 官方 Session 控制工具待批、批准/拒绝及取消；复合存储承载 Memory 与 Metrics。
 * [INPUT]: 授权阶段 Agent、员工 Memory/Storage、宿主当前输入及取消信号。
 * [OUTPUT]: 官方 Controller/Session 执行、历史持久化及终态；原产品工具继续处理真实权限。
 * [POS]: 产品执行身份到官方会话的适配；不实现工具循环、压缩或重试。
 * [PROTOCOL]: 修改时同步 mastra/.folder.md 与迁移记录。
 */
import { AgentController } from '@mastra/core/agent-controller'
import type { Agent } from '@mastra/core/agent'
import type { InputProcessor } from '@mastra/core/processors'
import type { MessageListInput } from '@mastra/core/agent/message-list'
import type { EngineContext } from '../../contracts'
import { createAgentObservation } from './trace'
import type { EmployeeConversationMemory } from './conversation-memory'
import { contextMetrics } from './metrics'
import type { ControllerPermissions } from './controller-permissions'

/** Session accepts a user signal. Preserve the host's attributed roles and media
 * at the official input boundary, leaving recalled/runtime history untouched. */
export function sessionInput(messages: () => MessageListInput): InputProcessor {
  return {
    id: 'boai-authorized-session-input',
    processInput({ messageList }) {
      messageList.clear.input.db()
      messageList.add(messages(), 'input')
      return messageList
    },
  }
}

export async function createEmployeeSession(agent: Agent, prepared: Awaited<ReturnType<EmployeeConversationMemory['prepare']>>, context: EngineContext, phase: 'chat' | 'task', permissions: ControllerPermissions) {
  const { resource: resourceId, thread: threadId } = prepared.option
  // Tool closures capture the host's immutable authorization/run snapshot. A new
  // controller scope attaches to the same durable thread on each host run.
  const scope = context.conversation.id
  const observation = context.onTrace || contextMetrics(context) ? await createAgentObservation(context, phase, prepared.storage) : undefined
  const controller = new AgentController({
    observability: observation?.observability,
    id: `boai:${context.agent.id}:${scope}`, agent, memory: prepared.memory, storage: observation?.storage ?? prepared.storage,
    modes: [{ id: 'employee', metadata: { default: true }, ...(context.groupCoordination?.mode === 'ordered' ? { availableTools: [] } : {}) }],
    disableBuiltinTools: ['ask_user', 'submit_plan', 'task_write', 'task_update', 'task_complete', 'task_check', 'subagent'],
    toolCategoryResolver: name => permissions.category(name),
  })
  let session: Awaited<ReturnType<AgentController['createSession']>>
  try {
    await controller.init()
    session = await controller.createSession({ resourceId, scope, threadId })
    await permissions.configure(session)
  } catch (error) {
    try { await controller.deleteSession({ resourceId, scope }); await controller.destroy() }
    finally { await observation?.flush() }
    throw error
  }
  const abort = () => session.abort()
  context.signal.addEventListener('abort', abort, { once: true })
  if (context.signal.aborted) abort()
  let error: Error | undefined
  let reason: string | undefined
  const unsubscribe = session.subscribe(event => {
    if (event.type === 'tool_approval_required') void permissions.respond(session, event)
    if (event.type === 'error') error = event.error
    if (event.type === 'agent_end') reason = event.reason
  })
  return {
    async send(content: string) {
      prepared.guard()
      error = undefined; reason = undefined
      await session.sendMessage({ content })
      context.signal.throwIfAborted()
      if (reason !== 'complete') throw error ?? new Error(`官方会话未完成：${reason ?? 'unknown'}`)
    },
    async dispose() {
      context.signal.removeEventListener('abort', abort)
      session.abort()
      // Use a fresh signal: the host's cancellation must not skip SDK teardown.
      try {
        while (session.stream.isActive() || session.run.getRunId() !== null) {
          const watcher = new AbortController()
          try { await Promise.race([session.run.waitForTeardown(watcher.signal), session.stream.waitForTeardown(watcher.signal)]) }
          finally { watcher.abort() }
        }
        await prepared.memory.settled()
      } finally {
        unsubscribe()
        await controller.deleteSession({ resourceId, scope })
        try { await controller.destroy() } finally { await observation?.flush() }
      }
    },
  }
}

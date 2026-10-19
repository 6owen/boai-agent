/*
 * [OUTPUT]: 独立网页检索工具在 CLI 桥标记只读，实际执行仍核验员工和服务权限。
 * [INPUT]: This stage's actual Mastra tool instances and original execution context.
 * [OUTPUT]: CLI descriptors invoke the same validated tools, approvals and tool-call IDs; no extra task runtime.
 * [POS]: Thin transport adapter; lifecycle and authorization remain with the original stage/host.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { noopObserve, type Tool } from '@mastra/core/tools'
import { RequestContext } from '@mastra/core/request-context'
import { z } from 'zod'
import type { EngineContext } from '../../contracts'
import type { RunCliTool } from '../../../shared/cli/run-access'

export function mastraCliTools(context: EngineContext, tools: Record<string, unknown>): RunCliTool[] {
  return Object.entries(tools).map(([name, value]) => {
    const tool = value as Tool, schema = tool.inputSchema as z.ZodType
    return {
      name, description: tool.description, inputSchema: { ...z.toJSONSchema(schema, { io: 'input' }), type: 'object' },
      effect: ['inspect_knowledge', 'search_knowledge', 'read_knowledge', 'inspect_data_source', 'inspect_web_search', 'call_web_search', 'select_web_search'].includes(name) ? 'read' : 'write',
      execute: async (input, callId) => {
        context.signal.throwIfAborted()
        if (!tool.execute) throw new Error('当前工具没有本机执行入口')
        return tool.execute(schema.parse(input), { agent: { toolCallId: callId }, abortSignal: context.signal, requestContext: new RequestContext(), observe: noopObserve } as never)
      },
    }
  })
}

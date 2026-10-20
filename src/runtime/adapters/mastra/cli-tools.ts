/*
 * [OUTPUT]: PPT项目查询/目录/配置/来源提取和核验标为只读，制作/审阅/导出仍使用原工具执行。
 * [OUTPUT]: 公共推文reader在员工CLI工具目录标为只读，仍复用当前绑定与原运行取消。
 * [OUTPUT]: 相册只读元信息与实际修改继续共用员工工具桥。
 * [OUTPUT]: 独立生图检查为只读；生成仍走原任务工具、授权和真实退出。
 * [OUTPUT]: 脚本目录将实际文件读取/列举/检索/图片读取标为read，执行仍使用原工具与来源核验。
 * [OUTPUT]: 2026-10-20 Alma技能接线：普通聊天按需读绑定技能/有来源记忆，独立任务协议与MCP媒体保持实际授权；本轮证据归独立Agent架构§11.21。
 * [OUTPUT]: 2026-10-19应用业务协议：boai_catalog/boai_receipt为只读运行工具，原调用身份保持。
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
      effect: ['presentation_settings', 'presentation_list', 'presentation_list_designs', 'presentation_list_layouts', 'presentation_list_icons', 'presentation_inspect_template', 'presentation_extract_material', 'presentation_get', 'presentation_validate', 'read_twitter_post', 'list_selfies', 'inspect_image_generation', 'read_file', 'list_files', 'search_files', 'read_image', 'list_skills', 'read_skill', 'search_memory', 'boai_catalog', 'boai_receipt', 'inspect_knowledge', 'search_knowledge', 'read_knowledge', 'inspect_data_source', 'inspect_web_search', 'call_web_search', 'select_web_search'].includes(name) ? 'read' : 'write',
      execute: async (input, callId) => {
        context.signal.throwIfAborted()
        if (!tool.execute) throw new Error('当前工具没有本机执行入口')
        return tool.execute(schema.parse(input), { agent: { toolCallId: callId }, abortSignal: context.signal, requestContext: new RequestContext(), observe: noopObserve } as never)
      },
    }
  })
}

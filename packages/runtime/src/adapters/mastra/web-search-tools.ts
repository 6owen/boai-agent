/*
 * [OUTPUT]: 普通聊天的工具事件按本阶段实际注册的操作与官方 Memory 工具身份核对。
 * [OUTPUT]: Independent web-search operations implement the runtime tool contract.
 * [INPUT]: Host-authorized search services, resolved preference and callbacks.
 * [OUTPUT]: Independent search inspection/call operations shared by API and native agents.
 * [POS]: Capability tools; business data-source bindings are not consulted.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { z } from 'zod'
import type { EngineContext, RuntimeToolOperation } from '../../contracts'
import { searchSelectionInstructions } from '../../modules/sources/search-selection'

export function hasWebSearchTools(context: EngineContext) {
  return context.agent.webSearch?.mode !== 'disabled' && !!context.webSearchServices?.length && !!context.inspectWebSearch && !!context.callWebSearch && !context.work?.organization
}
export function createWebSearchOperations(context: EngineContext): RuntimeToolOperation[] {
  if (!hasWebSearchTools(context)) return []
  return [
    { name: 'inspect_web_search', schema: z.object({ serviceId: z.string().uuid() }).strict(),
      description: 'Inspect a configured web-search service before use. These are independent retrieval capabilities, not business data sources. Available services: ' + JSON.stringify(context.webSearchServices) + '\n' + searchSelectionInstructions(context),
      execute: (input: unknown) => context.inspectWebSearch!(z.object({ serviceId: z.string().uuid() }).parse(input).serviceId) },
    { name: 'call_web_search', schema: z.object({ serviceId: z.string().uuid(), tool: z.string().min(1).max(200), arguments: z.record(z.string(), z.unknown()).default({}) }).strict(),
      description: 'Call a verified read-only search or URL-reading tool returned by inspect_web_search. Follow the returned input schema. Credentials are injected by the host. Cite actual returned URLs; snippets do not prove full-page reading. This capability is available during ordinary answers and does not require file Work.',
      execute: (input: unknown) => { const value = z.object({ serviceId: z.string().uuid(), tool: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) }).parse(input); return context.callWebSearch!({ sourceId: value.serviceId, tool: value.tool, arguments: value.arguments }) } },
  ]
}

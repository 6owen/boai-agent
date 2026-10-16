/*
 * [OUTPUT]: 创建不再设置API/local只读策略；全局bobo与普通员工绑定权限分离。
 * [INPUT]: 专用数据源会话、当前用户原消息与宿主授权；API/MCP/local共用schema。
 * [OUTPUT]: 模型/本机同一创建工具；稳定请求键、事务回执，敏感输入不进入工具展示。
 * [POS]: 数据源会话配置桥，不连接服务、不绑定员工、不执行外部命令。
 * [PROTOCOL]: 变化同步Header与.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { dataSourceConfigSchema, type DataSourceCreationSource } from '../../../shared/domain/sources'
import type { SourceService } from './source-service'

export const sourceCreationSchema = z.object({ key: z.string().trim().min(1).max(100), config: dataSourceConfigSchema, credential: z.string().max(32000).optional() }).strict()
export type SourceCreationCommand = z.infer<typeof sourceCreationSchema>
export const sourceCreationDescription = 'Create a BOAI data source requested by the current user, using the same saved configuration as the manual form. Identify API (base URL), MCP (HTTP/SSE URL or stdio command/args), or local folder from the user description or JSON, including mcpServers entries. Ask for missing required address/path/command; never invent it. Map each requested source to one stable key and reuse that key after an unknown result. Configure connections only; employee authority determines access. Do not set accessMode or allowWrites. Preserve supplied connection/transport/auth fields. Credentials may only come from the current user: bearer/header/query string, basic JSON {username,password}, or stdio environment JSON. Never echo secrets in public replies or copy them to name/description/guide. Saving does not connect/test/run programs or grant ordinary employees access. Bobo can access all enabled sources without binding. Only a returned persisted source proves successful creation.'
export const sourceCreationInstructions = 'This is the dedicated data-source creation conversation. Use reply/chat (ask/chat for missing information) and create_data_source to save API, MCP or local-folder configurations requested by the current user. Parse JSON or natural language and ask concise questions for missing fields. Do not create employees/groups/automations or execute/test the data source. Use the same stable key for the same source intent. Do not claim creation before the tool returns a saved source. Reply concisely; the UI shows the saved source card.'
export function sourceCreationCommands(service: SourceService, authority: { source: DataSourceCreationSource; validate(): Promise<void> }) {
  return async (raw: SourceCreationCommand) => {
    const input = sourceCreationSchema.parse(raw)
    const requestId = 'source-command-' + createHash('sha256').update(JSON.stringify([authority.source.messageId, input.key])).digest('hex')
    const fingerprint = createHash('sha256').update(JSON.stringify([input.config, input.credential ?? null])).digest('hex')
    return service.save({ id: randomUUID(), expectedRevision: 0, config: input.config, credential: input.credential }, { ...authority, requestId, fingerprint })
  }
}

export function sourceCreationObservation(input: unknown) {
  if (!input || typeof input !== 'object') return '[source configuration omitted]'
  const { key, config } = input as SourceCreationCommand
  return { key, type: config?.type, configuration: '[source configuration omitted]' }
}

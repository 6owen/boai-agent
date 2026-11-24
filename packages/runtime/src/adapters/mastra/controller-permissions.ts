/*
 * [INPUT]: Official tool approval events, BOAI tool contracts and saved employee permissions.
 * [OUTPUT]: Native Session approval/resumption with existing approval UI and exact-call receipts.
 * [POS]: Permission-policy adapter; Session owns the approval gate and cancellation.
 * [PROTOCOL]: Changes update this Header and mastra/.folder.md.
 */
import { createTool, type Tool } from '@mastra/core/tools'
import type { Session } from '@mastra/core/agent-controller'
import type { EngineContext } from '../../contracts'
import type { ExecutionOperation } from '@boai/shared/domain/execution'
import { withToolAuthorization } from '../../modules/employees/tool-authorization'
import { desktopPluginCallSchema, desktopPluginWrites } from '@boai/shared/plugins/desktop-tools'
import { browserPluginCallSchema, browserPluginWrites } from '@boai/shared/plugins/browser-tools'
import { parseBrowserSingleCommand } from './browser-tool-runtime'
import { summarizeMedia } from '../../modules/browser/media'

type Kind = ExecutionOperation['kind']
type Policy = { kind: Kind; readOnly?: boolean; alwaysAsk?: boolean; approve?: (input: unknown) => Promise<boolean> }
const policies = new WeakMap<object, Policy>()
/** A tool may supply its existing combined path/command authorization before execution. */
export function toolPermission<T extends object>(tool: T, policy: Policy): T { policies.set(tool, policy); return tool }
const reads = new Set(['skill', 'skill_read', 'skill_search', 'search_tools', 'load_tool', 'presentation_settings', 'presentation_list', 'presentation_list_designs', 'presentation_list_layouts', 'presentation_list_icons', 'presentation_inspect_template', 'presentation_extract_material', 'presentation_get', 'presentation_validate', 'inspect_knowledge', 'search_knowledge', 'read_knowledge', 'read_twitter_post', 'agent_state', 'list_selfies', 'list_reaction_messages', 'inspect_web_search', 'call_web_search', 'read_file', 'read_image', 'list_files', 'search_files', 'list_skills', 'read_skill', 'search_history', 'read_context_history', 'boai_catalog', 'boai_receipt', 'inspect_data_source', 'inspect_image_generation', 'inspect_desktop_plugin', 'inspect_browser_plugin', 'find_employees', 'recall', 'updateWorkingMemory', 'update-working-memory'])
const bookkeeping = new Set(['report_work', 'wait_for_work', 'select_web_search'])
const catalogReads = new Set(['scan', 'preview', 'check_update', 'guide', 'list', 'get', 'read', 'employees', 'search', 'marketplace_detail', 'operation', 'collections', 'binding_plan'])
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}

export class ControllerPermissions {
  private approved = new Map<string, Kind>()
  private tools: Record<string, Tool> = {}
  constructor(private context: EngineContext) {}
  private async policy(name: string, input: unknown): Promise<Policy> {
    const explicit = policies.get(this.tools[name]!)
    if (explicit) return explicit
    const args = record(input)
    if (reads.has(name) || bookkeeping.has(name)) return { kind: 'configuration', readOnly: true }
    if (name === 'boai_call' && typeof args.operation === 'string' && this.context.application) {
      const catalog = await this.context.application.catalog({ operation: args.operation })
      return { kind: 'configuration', readOnly: catalog.operations.find(item => item.name === args.operation)?.effect === 'read' }
    }
    if (['manage_skills', 'manage_data_sources'].includes(name)) return { kind: 'configuration', readOnly: catalogReads.has(String(record(args.command).action)) }
    if (name === 'execute_command') return { kind: 'command' }
    if (['write_file', 'edit_file', 'move_file', 'delete_file', 'publish_artifact', 'generate_image', 'take_selfie', 'export_selfie'].includes(name)) return { kind: 'file' }
    if (name.startsWith('presentation_')) return { kind: 'file' }
    if (name === 'browser_tool') {
      const parsed = parseBrowserSingleCommand(String(args.command))
      return { kind: 'browser', readOnly: !parsed.mutating || ['navigate', 'back', 'forward', 'reload'].includes(parsed.action) }
    }
    if (name === 'call_browser_plugin') {
      const input = browserPluginCallSchema.parse(args)
      return { kind: input.provider === 'browser-viewer' ? 'command' : 'browser', readOnly: !browserPluginWrites(input) }
    }
    if (name === 'call_desktop_plugin') return { kind: 'source', alwaysAsk: true, readOnly: !desktopPluginWrites(desktopPluginCallSchema.parse(args)) }
    if (name === 'call_canvas') return { kind: 'source', alwaysAsk: true, readOnly: !['create', 'edit', 'export'].includes(String(args.action)) }
    if (name === 'call_data_source') {
      const catalog = record(await this.context.inspectDataSource?.(String(args.sourceId)))
      const tools = Array.isArray(catalog.tools) ? catalog.tools : []
      return { kind: 'source', readOnly: tools.some(tool => record(tool).name === args.tool && record(tool).readOnly === true) }
    }
    if (name === 'request_directory') return { kind: 'file', readOnly: true } // The actual path grant uses its own validated approval.
    if (name === 'manage_automation') return { kind: 'configuration', readOnly: ['list', 'get', 'preview', 'history'].includes(String(record(args.command).action ?? args.action)) }
    return { kind: 'configuration' }
  }
  wrap<T extends Record<string, object | undefined>>(tools: T): T {
    this.tools = tools as unknown as Record<string, Tool>
    return Object.fromEntries(Object.entries(this.tools).filter(([, tool]) => !!tool).map(([name, tool]) => [name, createTool({
      ...tool,
      requireApproval: async input => {
        const policy = await this.policy(name, input)
        if (policy.readOnly || this.context.agent.executionPermission === 'full-access') return false
        return !!this.context.agent.executionPermission || policy.kind === 'command' || !!policy.alwaysAsk
      },
      execute: tool.execute ? async (input, options) => {
        this.context.signal.throwIfAborted()
        const kind = this.approved.get(options?.agent?.toolCallId ?? '')
        try {
          return await (kind ? withToolAuthorization({ runId: this.context.runId, toolCallId: options?.agent?.toolCallId ?? '', kind }, () => tool.execute!(input, options)) : tool.execute!(input, options))
        } finally { this.approved.delete(options?.agent?.toolCallId ?? '') }
      } : undefined,
    })])) as T
  }
  async configure(session: Session) {
    // All application tools use exact-input predicates above. Framework-owned
    // memory tools are internal maintenance and retain their native behavior.
    await session.permissions.setForCategory({ category: 'read', policy: 'allow' })
    await session.permissions.setForCategory({ category: 'other', policy: this.context.agent.executionPermission === 'read-only' ? 'deny' : this.context.agent.executionPermission === 'full-access' ? 'allow' : 'ask' })
  }
  category(name: string) { return reads.has(name) || bookkeeping.has(name) ? 'read' as const : 'other' as const }
  async respond(session: Session, event: { toolCallId: string; toolName: string; args: unknown }) {
    let approved = false, reason: string | undefined
    try {
      const policy = await this.policy(event.toolName, event.args)
      this.context.signal.throwIfAborted()
      if (policy.approve) approved = await policy.approve(event.args)
      else if (this.context.agent.executionPermission === 'full-access' || !this.context.agent.executionPermission && policy.kind !== 'command' && !policy.alwaysAsk) approved = true
      else {
        const description = `${event.toolName}\n${JSON.stringify(summarizeMedia(event.args), (key, value) => /password|secret|token|apiKey|credential|authorization/i.test(key) ? '[redacted]' : value)}`
        if (!this.context.approveOperation) throw new Error('执行审批不可用，操作未执行')
        approved = await this.context.approveOperation({ kind: policy.kind, description })
      }
      this.context.signal.throwIfAborted()
      if (approved) this.approved.set(event.toolCallId, policy.kind)
    } catch (error) { reason = error instanceof Error ? error.message : String(error) }
    session.respondToToolApproval({ toolCallId: event.toolCallId, decision: approved && !this.context.signal.aborted ? 'approve' : 'decline', ...(reason ? { declineContext: { reason } } : {}) })
  }
}

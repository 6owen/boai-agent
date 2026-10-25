/*
 * [INPUT]: Original live execution context and host permission revalidation callback.
 * [OUTPUT]: Original adapter tools with stable per-run calls, permission revalidation and draining; credentials add no native time budget.
 * [POS]: Runtime-owned credential lifetime; not a second permission store, scheduler or file reader.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { CliError } from '@boai/shared/cli/protocol'
import type { RunCliAccessRequest, RunCliGrant, RunCliPrincipal, RunCliEnvironmentLease, RunCliTool } from '@boai/shared/cli/run-access'
import type { EngineContext } from './contracts'
import { createKnowledgeOperations } from './modules/resources/knowledge-tools'

type Scope = { context: EngineContext; validate(): Promise<void>; tools: RunCliTool[]; calls: Map<string, { signature: string; result: Promise<unknown> }>; pending: Set<Promise<unknown>> }
type Grant = { principal: RunCliPrincipal; hash: string; scope: Scope }
const id = z.string().min(1).max(200)
const principalSchema = z.object({ kind: z.literal('run'), grantId: z.string().uuid(), runId: id, employeeId: id, conversationId: id, expiresAt: z.number().int().positive().nullable() }).strict()
const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('endpoint'), url: z.string().url().max(2048) }).strict(),
  z.object({ kind: z.literal('issue'), runId: id, ttlSeconds: z.number().int().min(1).max(3600).default(900) }).strict(),
  z.object({ kind: z.literal('revoke'), grantId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('authenticate'), token: z.string().min(32).max(4096) }).strict(),
  z.object({ kind: z.literal('context'), principal: principalSchema }).strict(),
  z.object({ kind: z.literal('tools'), principal: principalSchema }).strict(),
  z.object({ kind: z.literal('invoke'), principal: principalSchema, tool: id, input: z.unknown(), callId: id.optional() }).strict(),
])
const denied = () => new CliError('AUTH_FAILED', '员工运行凭据已过期、撤回或失去当前权限')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)

export class RunCliAccess {
  private scopes = new Map<string, Scope>()
  private grants = new Map<string, Grant>()
  private endpoint?: string
  constructor(private clock = Date.now) {}
  register(context: EngineContext, validate: Scope['validate']) {
    if (this.scopes.has(context.runId)) throw new Error('员工运行CLI身份已登记')
    const tools: RunCliTool[] = createKnowledgeOperations(context).map(tool => ({ name: tool.name, description: tool.description, inputSchema: z.toJSONSchema(tool.schema, { io: 'input' }), effect: 'read', execute: async input => tool.execute(tool.schema.parse(input)) }))
    const scope: Scope = { context, validate, tools, calls: new Map(), pending: new Set() }
    this.scopes.set(context.runId, scope)
    return async () => {
      if (this.scopes.get(context.runId) === scope) this.scopes.delete(context.runId)
      for (const [key, grant] of this.grants) if (grant.scope === scope) this.grants.delete(key)
      scope.tools = []
      await Promise.allSettled([...scope.pending])
    }
  }
  registerTools(runId: string, tools: RunCliTool[]) {
    const scope = this.scopes.get(runId)
    if (!scope || scope.context.signal.aborted) throw denied()
    if (new Set(tools.map(tool => tool.name)).size !== tools.length) throw new Error('CLI工具目录包含重复名称')
    const catalog = [...tools]
    scope.tools = catalog
    return async () => {
      if (scope.tools === catalog) scope.tools = []
      await Promise.allSettled([...scope.pending])
    }
  }
  async environment(runId: string): Promise<RunCliEnvironmentLease> {
    const scope = this.scopes.get(runId)
    if (!scope || !this.endpoint) return { env: { BOAI_CLI_EMPLOYEE_RUN: runId }, release() {} }
    await scope.validate()
    const grant = this.create(scope, null)
    return { env: { BOAI_SERVER_URL: this.endpoint, BOAI_SERVER_TOKEN: grant.token, BOAI_CLI_EMPLOYEE_RUN: runId }, release: () => { this.grants.delete(grant.grantId) } }
  }
  private create(scope: Scope, expiresAt: number | null) {
    if (this.scopes.get(scope.context.runId) !== scope || scope.context.signal.aborted) throw denied()
    for (const [key, grant] of this.grants) if (grant.principal.expiresAt !== null && grant.principal.expiresAt <= this.clock()) this.grants.delete(key)
    if (this.grants.size >= 256 || [...this.grants.values()].filter(grant => grant.scope === scope).length >= 16) throw new CliError('SERVER_BUSY', '当前运行凭据过多，请先撤回不用的凭据')
    const principal: RunCliPrincipal = { kind: 'run', grantId: randomUUID(), runId: scope.context.runId, employeeId: scope.context.agent.id, conversationId: scope.context.conversation.id, expiresAt }
    const token = randomBytes(32).toString('base64url')
    this.grants.set(principal.grantId, { principal, hash: hash(token), scope })
    return { ...principal, token }
  }
  private async validate(grant: Grant) {
    const { principal, scope } = grant
    if (this.grants.get(principal.grantId) !== grant || principal.expiresAt !== null && principal.expiresAt <= this.clock() || this.scopes.get(principal.runId) !== scope || scope.context.signal.aborted) {
      this.grants.delete(principal.grantId); throw denied()
    }
    try { await scope.validate() } catch { this.grants.delete(principal.grantId); throw denied() }
    // Permission checks may await storage; expiry/revocation/closure still wins before disclosure.
    if (this.grants.get(principal.grantId) !== grant || principal.expiresAt !== null && principal.expiresAt <= this.clock() || this.scopes.get(principal.runId) !== scope || scope.context.signal.aborted) throw denied()
  }
  async request(input: RunCliAccessRequest): Promise<unknown> {
    const request = schema.parse(input)
    if (request.kind === 'endpoint') {
      const url = new URL(request.url)
      if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.protocol === 'ws:' && !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) throw new CliError('INVALID_REQUEST', '员工CLI端点必须使用可信本机或TLS服务')
      if (this.endpoint && this.endpoint !== request.url) this.grants.clear()
      this.endpoint = request.url; return { configured: true }
    }
    if (request.kind === 'revoke') return { revoked: this.grants.delete(request.grantId) }
    if (request.kind === 'issue') {
      const scope = this.scopes.get(request.runId)
      if (!scope || scope.context.signal.aborted) throw denied()
      await scope.validate()
      return this.create(scope, this.clock() + request.ttlSeconds * 1000) as RunCliGrant
    }
    const grant = request.kind === 'authenticate'
      ? [...this.grants.values()].find(grant => grant.hash === hash(request.token))
      : this.grants.get(request.principal.grantId)
    if (!grant) throw denied()
    if (request.kind !== 'authenticate' && JSON.stringify(grant.principal) !== JSON.stringify(request.principal)) throw denied()
    await this.validate(grant)
    if (request.kind === 'authenticate') return { ...grant.principal }
    const { context, tools } = grant.scope
    if (request.kind === 'context') return { ...grant.principal, employee: { id: context.agent.id, name: context.agent.name }, conversation: { id: context.conversation.id, title: context.conversation.title }, tools: tools.map(tool => tool.name) }
    if (request.kind === 'tools') return tools.map(({ name, description, inputSchema, effect }) => ({ name, description, inputSchema, effect }))
    const tool = tools.find(tool => tool.name === request.tool)
    if (!tool) throw new CliError('CAPABILITY_UNAVAILABLE', '当前运行未授权此CLI工具')
    if (tool.effect === 'write' && !request.callId) throw new CliError('INVALID_REQUEST', '此工具需要稳定callId；结果未知时使用同一callId核对，不要重新执行')
    const callId = request.callId ?? randomUUID(), signature = canonical([tool.name, request.input]), previous = grant.scope.calls.get(callId)
    if (previous) {
      if (previous.signature !== signature) throw new CliError('INVALID_REQUEST', '此callId已用于另一项工具调用')
      const result = await previous.result; await this.validate(grant); return result
    }
    const event = { id: `cli:${callId}`, name: tool.name, createdAt: new Date(this.clock()).toISOString() }
    const operation = (async () => {
      if (!tool.observed) await context.onTool({ ...event, status: 'running', detail: JSON.stringify({ via: 'cli', tool: tool.name }) })
      try {
        await this.validate(grant)
        if (grant.scope.tools !== tools) throw denied()
        const result = await tool.execute(request.input, event.id)
        await this.validate(grant)
        if (!tool.observed) await context.onTool({ ...event, status: 'completed', detail: JSON.stringify({ via: 'cli', tool: tool.name, completed: true }) })
        await this.validate(grant)
        return result
      } catch (error) {
        if (!tool.observed) await context.onTool({ ...event, status: 'failed', detail: JSON.stringify({ via: 'cli', tool: tool.name, completed: false }) })
        if (error instanceof z.ZodError) throw new CliError('INVALID_REQUEST', '员工CLI工具参数无效')
        throw error
      }
    })()
    if (request.callId) grant.scope.calls.set(callId, { signature, result: operation })
    grant.scope.pending.add(operation)
    try { return await operation } finally { grant.scope.pending.delete(operation) }
  }
}

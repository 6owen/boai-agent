/*
 * [OUTPUT]: 宿主可提供当前包Node程序/员工工具库的只读位置；它们不授予owner身份。
 * [INPUT]: Trusted service-issued credential identities; never caller-selected employee roles.
 * [OUTPUT]: Private run bridge, original tool catalog/call identities and process-lifetime credential leases.
 * [POS]: Shared CLI/run authentication types; tokens are never stored in product snapshots.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
export interface RunCliPrincipal { kind: 'run'; grantId: string; runId: string; employeeId: string; conversationId: string; expiresAt: number | null }
export type RpcPrincipal = { kind: 'owner' } | RunCliPrincipal
export type RunCliAccessRequest =
  | { kind: 'endpoint'; url: string }
  | { kind: 'issue'; runId: string; ttlSeconds?: number }
  | { kind: 'revoke'; grantId: string }
  | { kind: 'authenticate'; token: string }
  | { kind: 'context' | 'tools'; principal: RunCliPrincipal }
  | { kind: 'invoke'; principal: RunCliPrincipal; tool: string; input: unknown; callId?: string }
export type RunCliAccessPort = (request: RunCliAccessRequest) => Promise<unknown>
export interface RunCliGrant extends RunCliPrincipal { token: string; expiresAt: number }
export interface RunCliEnvironment { BOAI_SERVER_URL?: string; BOAI_SERVER_TOKEN?: string; BOAI_CLI_EMPLOYEE_RUN: string; BOAI_CLI_NODE?: string; BOAI_CLI_TOOL_CLIENT?: string }
export interface RunCliEnvironmentLease { env: RunCliEnvironment; release(): void }

/** In-process callbacks only; public catalogs omit execute/observed. */
export interface RunCliTool {
  name: string
  description: string
  inputSchema: unknown
  effect: 'read' | 'write'
  observed?: boolean
  execute(input: unknown, callId: string): Promise<unknown>
}

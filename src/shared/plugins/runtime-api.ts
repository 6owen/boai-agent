/*
 * [INPUT]: Trusted runtime packages and serializable native session requests.
 * [OUTPUT]: Runtime API v1 candidate; no AppService, credential store or business repository access.
 * [POS]: Standalone provider SDK contract, emitted with the runtime build.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing this contract.
 */
export const RUNTIME_API_VERSION = 1
export type RuntimeSupport = 'supported' | 'unsupported' | 'unknown'
export type RuntimeCapabilities = Record<'chat' | 'resume' | 'images' | 'tools' | 'actions' | 'steer' | 'followUp', RuntimeSupport>
export interface RuntimeBinding { pluginId: string; providerId: string }
export interface RuntimePluginRef extends RuntimeBinding { packageHash: string; config?: Record<string, string | number | boolean> }
export interface RuntimeTool { name: string; description: string; inputSchema: Record<string, unknown> }
export type RuntimeContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export interface RuntimeProbe { name: string; version: string; protocolVersion: number; capabilities: RuntimeCapabilities }
export interface RuntimeLaunch { executable: string; runtime?: 'node'; args: string[]; cwd: string; privateHome: string; modelId?: string; config: Record<string, string | number | boolean> }
export interface RuntimeSessionInput { resumeRef?: string; instructions: string; tools: RuntimeTool[] }
export interface RuntimeSubmission { requestId: string; text: string; images: string[] }
export type RuntimeEvent =
  | { type: 'input.accepted'; requestId: string }
  | { type: 'action.resumed'; actionId: string }
  | { type: 'message.delta' | 'reasoning.delta'; id: string; delta: string }
  | { type: 'message.completed'; id: string; text: string }
  | { type: 'tool.started' | 'tool.updated' | 'tool.completed'; id: string; name: string; input?: unknown; output?: unknown; failed?: boolean }
  | { type: 'session.idle' }
  | { type: 'diagnostic'; code: string }
export interface RuntimeAction { id: string; kind: 'approval' | 'input'; title: string; detail: unknown; options: { id: string; label: string }[]; questions?: { id: string; question: string; options?: { label: string; description?: string }[] }[] }
export interface RuntimeServices {
  launch: RuntimeLaunch
  signal: AbortSignal
  emit(event: RuntimeEvent): void
  tool(name: string, input: unknown, callId: string): Promise<{ content: RuntimeContent[]; isError?: boolean }>
  action(action: RuntimeAction): Promise<{ option?: string; answers?: Record<string, string[]> }>
}
export interface RuntimeProvider {
  probe(): Promise<RuntimeProbe>
  openSession(input: RuntimeSessionInput): Promise<{ sessionId: string; resumeRef?: string }>
  submit(input: RuntimeSubmission): Promise<{ text: string }>
  sendInput?(input: RuntimeSubmission & { mode: 'steer' | 'followUp' }): Promise<void>
  interrupt(): Promise<void>
  inspect(): Promise<{ state: 'idle' | 'running' | 'unknown' }>
  closeSession(): Promise<void>
}
export type RuntimeFactory = (services: RuntimeServices) => Promise<RuntimeProvider> | RuntimeProvider

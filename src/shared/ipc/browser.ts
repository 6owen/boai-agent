/*
 * [INPUT]: 宿主授予的员工/会话/清理代际/真实工作运行身份和严格单浏览器命令。
 * [OUTPUT]: Runtime↔Main 私有浏览器租约、无任务人工窗口归属、动作回执、实际来源和控制合同；旧交接提示仅兼容存量回执，普通动作不据此暂停；Renderer 仅指定员工/会话，不取得租约或路径权限。
 * [POS]: 进程桥接 DTO；不存 Cookie、凭据或模型自报身份。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { BrowserCommandResult } from '../../runtime/adapters/mastra/browser-tool-runtime'
export interface BrowserScopeOwner {
  scopeKey: string; scopeEpoch: number; agentId: string; conversationId: string
  configVersion: number; agentName: string; conversationTitle: string
}
export interface BrowserManualOpenInput { agentId: string; conversationId: string }
export type BrowserManualOpenRequest = BrowserScopeOwner
export interface BrowserLease extends BrowserScopeOwner {
  workId: string; runId: string; generation: string
  downloadDirectory: string
}
export interface BrowserPageEvidence {
  scopeKey: string; generation: string; pageVersion: string
  url: string; title: string; obtainedAt: string
}
export interface BrowserActionEnvelope {
  lease: BrowserLease; actionId: string; toolCallId: string; command: string; argumentHash: string
  expectedPageVersion?: string; approvedOrigins: string[]
  approval?: { url: string; pageVersion: string; commandHash: string }
}
export interface BrowserCompletedDownload {
  id: string; path: string; name: string; size: number; hash: string; url: string; obtainedAt: string
}
export interface BrowserActionReply {
  actionId: string; generation: string
  status: 'completed' | 'failed' | 'cancelled_before_start' | 'unknown'
  result?: BrowserCommandResult; source?: BrowserPageEvidence; error?: string
  downloads?: BrowserCompletedDownload[]
  /** Legacy hint retained for stored replies; ordinary browser actions do not pause or switch control. */
  needsUserControl?: boolean
}
export interface BrowserWindowState {
  scopeKey: string; scopeEpoch: number; agentId: string; conversationId: string; instanceId: string
  agentName?: string; conversationTitle?: string
  workId?: string; runId?: string; generation: string; revision: number; pageVersion: string
  url: string; title: string; isLoading: boolean; isVisible: boolean; toolbarReady: boolean; error?: string
  control: 'idle' | 'agent-controlled' | 'draining' | 'user-controlled' | 'closing' | 'closed'; clearing?: boolean
}
export type BrowserControlAction = 'take' | 'resume' | 'show' | 'hide' | 'close' | 'clear'
export interface BrowserControlInput { agentId: string; conversationId: string; action: BrowserControlAction }
export interface BrowserHostMethods {
  manualOpen: { input: BrowserManualOpenRequest; output: BrowserWindowState }
  acquire: { input: BrowserLease; output: void }
  resumeSnapshot: { input: BrowserLease; output: {source:BrowserPageEvidence;output:string} }
  inspect: { input: BrowserLease; output: BrowserPageEvidence | null }
  executeSingle: { input: BrowserActionEnvelope; output: BrowserActionReply }
  lookup: { input: { lease: BrowserLease; actionId: string }; output: BrowserActionReply | null }
  drain: { input: BrowserLease; output: { drained: true } }
  clearScope: { input: { scopeKey: string }; output: { cleared: true } }
  list: { input: Record<string, never>; output: BrowserWindowState[] }
  userControl: { input: { scopeKey: string; action: BrowserControlAction }; output: void }
  disconnect: { input: Record<string, never>; output: void }
}
export interface BrowserHostBridge {
  request<K extends keyof BrowserHostMethods>(method: K, input: BrowserHostMethods[K]['input']): Promise<BrowserHostMethods[K]['output']>
}

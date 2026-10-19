/*
 * [OUTPUT]: 动态available标记独立服务当前是否有可信同机浏览器宿主。
 * [OUTPUT]: 有效员工默认拥有浏览器权限；旧approval/approvedOrigins仅保留历史输入兼容，不再触发人工审批。
 * [OUTPUT]: 2026-10-14固定网页引用由宿主核源；本机只读租约绑定真实消息/run，写操作沿Work；重开窗口使用独立实例身份。
 * [INPUT]: 内置浏览器操作、宿主工具调用审计和真实工作执行权限。
 * [OUTPUT]: 项目内置浏览器固定身份/窗口与登录分区；公开操作无员工或会话入参；私有任务租约只约束工具调用及实际退出，不决定浏览器身份。
 * [POS]: 进程桥接 DTO；不存 Cookie、凭据或模型自报身份。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { BrowserCommandResult } from '../../runtime/adapters/mastra/browser-tool-runtime'
export const APPLICATION_BROWSER_SCOPE = 'application-browser'
/** Task authorization facts only; never a window or login-profile owner. */
export interface BrowserTaskAuthorization {
  scopeKey: string; scopeEpoch: number; agentId: string; conversationId: string
  configVersion: number; agentName: string; conversationTitle: string
}
export type BrowserManualOpenInput = Record<string, never>
export type BrowserManualOpenRequest = Record<string, never>
export interface BrowserLease extends BrowserTaskAuthorization {
  workId?: string; sourceMessageId?: string; runId: string; generation: string
  downloadDirectory: string
}
export interface BrowserPageReference {
  instanceId: string; pageVersion: string; url: string; title: string; obtainedAt: string
}
export interface BrowserPageEvidence {
  instanceId?: string
  scopeKey: string; generation: string; pageVersion: string
  url: string; title: string; obtainedAt: string
}
export interface BrowserActionEnvelope {
  lease: BrowserLease; actionId: string; toolCallId: string; command: string; argumentHash: string
  expectedPageVersion?: string; approvedOrigins?: string[]
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
  scopeKey: string; instanceId: string
  revision: number; pageVersion: string
  url: string; title: string; isLoading: boolean; isVisible: boolean; toolbarReady: boolean; error?: string
  control: 'idle' | 'agent-controlled' | 'draining' | 'user-controlled' | 'closing' | 'closed'; clearing?: boolean
}
export type BrowserControlAction = 'take' | 'resume' | 'show' | 'hide' | 'close' | 'clear'
export interface BrowserControlInput { action: BrowserControlAction }
export interface BrowserHostMethods {
  reference: { input: { instanceId?: string; pageVersion?: string }; output: BrowserPageReference }
  manualOpen: { input: BrowserManualOpenRequest; output: BrowserWindowState }
  acquire: { input: BrowserLease; output: void }
  resumeSnapshot: { input: BrowserLease; output: {source:BrowserPageEvidence;output:string} }
  inspect: { input: BrowserLease; output: BrowserPageEvidence | null }
  executeSingle: { input: BrowserActionEnvelope; output: BrowserActionReply }
  lookup: { input: { lease: BrowserLease; actionId: string }; output: BrowserActionReply | null }
  drain: { input: BrowserLease; output: { drained: true } }
  clearScope: { input: { scopeKey: string }; output: { cleared: true } }
  list: { input: Record<string, never>; output: BrowserWindowState[] }
  currentLease: { input: Record<string, never>; output: BrowserLease | null }
  userControl: { input: { scopeKey: string; action: BrowserControlAction }; output: void }
  disconnect: { input: Record<string, never>; output: void }
}
export interface BrowserHostBridge {
  readonly available?: boolean
  request<K extends keyof BrowserHostMethods>(method: K, input: BrowserHostMethods[K]['input']): Promise<BrowserHostMethods[K]['output']>
}

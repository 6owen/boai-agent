/*
 * [INPUT]: Mastra 原生 Span 与宿主运行归属。
 * [OUTPUT]: 可持久化、跨进程读取的执行 Trace；业务交付状态仍由工作记录负责。
 * [POS]: 会话执行过程共享合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export interface TraceSpan {
  id: string
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  spanType: string
  startedAt: string
  endedAt?: string
  input?: unknown
  output?: unknown
  attributes?: unknown
  metadata?: unknown
  error?: unknown
}
export interface StoredTraceSpan extends TraceSpan {
  conversationId: string
  runId: string
  agentId: string
  turnId?: string
}

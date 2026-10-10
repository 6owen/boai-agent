/*
 * [INPUT]: 已保存员工、运行、冻结执行配置及宿主 Trace。
 * [OUTPUT]: 员工执行记录的有界分页与固定运行详情；配置仅投影名称/版本/模型，不返回凭据或私有提示。
 * [POS]: 员工一等公民的执行能力读取合同，业务状态仍归 Work。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentRun, Artifact, WorkItem } from './index'
import type { ExecutionBackend } from './backends'
import type { StoredTraceSpan } from './traces'

export const EMPLOYEE_EXECUTION_LIMITS = { pageSize: 20, traceSpans: 200, artifacts: 50 } as const
export type EmployeeExecutionCursor = { createdAt: string; id: string }
export type EmployeeExecutionQuery = { agentId: string; conversationId?: string; cursor?: EmployeeExecutionCursor }
export type ExecutionConfiguration = {
  kind: ExecutionBackend['kind'] | 'unknown'; label: string; modelId: string; configVersion?: number
  profileId?: string; profileRevision?: number; programVersion?: string
}
export type EmployeeExecutionSummary = {
  run: Pick<AgentRun, 'id' | 'agentId' | 'agentName' | 'conversationId' | 'status' | 'phase' | 'responseKind' | 'createdAt' | 'finishedAt' | 'workId' | 'triggerMessageId'>
  conversationTitle: string
  configuration: ExecutionConfiguration
}
export type EmployeeExecutionPage = { items: EmployeeExecutionSummary[]; nextCursor?: EmployeeExecutionCursor }
export type EmployeeExecutionDetail = EmployeeExecutionSummary & {
  run: AgentRun
  work?: WorkItem
  spans: StoredTraceSpan[]
  spansTruncated: boolean
  artifacts: Pick<Artifact, 'id' | 'name' | 'contentHash' | 'contentVersion'>[]
  artifactsTruncated: boolean
}

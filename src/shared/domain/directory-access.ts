/*
 * [OUTPUT]: 组合目录批准回执记录本次同类操作选择，重试核对原答案。
 * [OUTPUT]: 原生目录身份区分native turn与Claude的BOAI run来源，不把宿主run伪报为原生turn。
 * [OUTPUT]: 原生目录身份增加可选approvalId，以区分同一item的独立批准回调。
 * [OUTPUT]: 目录申请/回执可携带原生runtime/thread/turn/item身份，宿主批准与原生提交分开。
 * [OUTPUT]: 单目录与命令多目录批准共用原身份回执；组合批准仅持久化目录，不扩大后续命令权限。
 * [INPUT]: 员工明确保存的业务目录与只读/读写许可。
 * [OUTPUT]: 可追加的目录授权合同；未配置与显式空列表分别保留旧行为及启用按需授权的语义。
 * [POS]: 员工配置、目录审批和执行适配共用的公开合同，不包含内部工作区或进程cwd。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { z } from 'zod'

export const MAX_DIRECTORY_GRANTS = 32
export const directoryGrantSchema = z.object({
  // Do not trim: leading/trailing spaces are valid filename bytes.
  path: z.string().min(1).max(4096).refine(value => !/[\x00-\x1f\x7f]/u.test(value), '目录路径不能包含控制字符'),
  access: z.enum(['read-only', 'read-write']),
}).strict()
export const directoryGrantsSchema = z.array(directoryGrantSchema).max(MAX_DIRECTORY_GRANTS)
export type DirectoryGrant = z.infer<typeof directoryGrantSchema>
export type DirectoryAccess = DirectoryGrant['access']
export type DirectoryApprovalChoice = 'run' | 'employee' | 'deny'
export type DirectoryNativeOrigin = { runtime: 'codex' | 'claude'; method: string; threadId: string; turnId: string; turnIdSource?: 'native' | 'boai-run'; itemId: string; approvalId?: string }
export type DirectoryAccessRequest = {
  directory: string
  target: string
  access: DirectoryAccess
  reason: string
  origin?: DirectoryNativeOrigin
}
export type DirectoryApprovalReceipt = {
  id: string
  runId: string
  agentId: string
  conversationId: string
  directory: string
  access: DirectoryAccess
  /** Present for one command approved together with all its missing directory grants. */
  directories?: DirectoryGrant[]
  command?: string
  cwd?: string
  choice: DirectoryApprovalChoice
  allowSameKind?: boolean
  directoryRevision: number
  createdAt: string
  origin?: DirectoryNativeOrigin
}

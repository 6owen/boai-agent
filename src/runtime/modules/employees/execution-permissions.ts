/*
 * [INPUT]: 已冻结员工执行权限、具体操作和宿主审批/取消信号。
 * [OUTPUT]: API与本机员工的宿主操作沿同一整体权限，只读拒绝副作用、审批等待、完全访问跳过；旧未配置定义保持。
 * [POS]: 员工工具共同的执行前权限门禁，不能扩大原资源/路径/Work授权。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import type { EngineContext } from '../../contracts'
import type { ExecutionOperation } from '../../../shared/domain/execution'

export async function authorizeExecution(context: Pick<EngineContext, 'agent' | 'signal' | 'approveOperation'>, operation: ExecutionOperation) {
  context.signal.throwIfAborted()
  const permission = context.agent.executionPermission
  if (!permission) return
  if (permission === 'read-only') throw new Error(`当前员工为只读权限，不能${operation.description}`)
  if (permission === 'ask') {
    if (!context.approveOperation) throw new Error('执行审批不可用，操作未执行')
    if (!await context.approveOperation(operation)) throw new Error('用户已拒绝本次操作，请勿重试或绕过审批')
  }
  context.signal.throwIfAborted()
}

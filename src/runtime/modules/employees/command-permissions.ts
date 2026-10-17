/*
 * [OUTPUT]: 显式整体执行权限不沿用旧永久命令授权；审批模式始终请求具体操作批准。
 * [INPUT]: 员工身份、明确的命令审批和原SQLite事务。
 * [OUTPUT]: 独立于运行配置版本的员工命令永久授权；审批提交与授权同事务，显式撤销/关闭命令/删除员工清理授权。
 * [POS]: 员工权限仓库；仅作用于BOAI宿主命令，不覆盖本机Agent自己的权限模式。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { randomUUID } from 'node:crypto'
import type { DigitalAgent, EmployeeCommandPermission } from '../../../shared/domain'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'

export const commandPermissionCollection = 'employeeCommandPermissions'
export function canRememberCommands(agent: DigitalAgent) {
  return !agent.executionPermission && agent.active && agent.allowCommands && (agent.executionBackend?.kind ?? 'mastra-model') === 'mastra-model'
}
export class CommandPermissions {
  constructor(private store: ProductStore) {}
  async list() { return this.store.load<EmployeeCommandPermission>(commandPermissionCollection) }
  async allows(agent: DigitalAgent) {
    return canRememberCommands(agent) && this.store.transaction(async tx => Boolean(await tx.get(commandPermissionCollection, agent.id)))
  }
  async grant(tx: RecordTransaction, agent: DigitalAgent) {
    if (!canRememberCommands(agent)) throw new Error('当前员工不能保存宿主命令授权')
    const permission: EmployeeCommandPermission = { id: agent.id, agentId: agent.id, revision: randomUUID(), grantedAt: new Date().toISOString() }
    await tx.put({ collection: commandPermissionCollection, id: agent.id, value: permission })
  }
  async revoke(agentId: string, revision: string) {
    await this.store.transaction(async tx => {
      const permission = await tx.get<EmployeeCommandPermission>(commandPermissionCollection, agentId)
      if (!permission) return
      if (permission.revision !== revision) throw new Error('命令授权已变化，请刷新后重试')
      await tx.remove(commandPermissionCollection, agentId)
    })
  }
}

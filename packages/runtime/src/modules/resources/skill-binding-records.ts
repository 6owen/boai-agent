/*
 * [INPUT]: 删除事务中的员工/资源身份及原 skillOperations 绑定回执。
 * [OUTPUT]: 删除私有完成快照并保留最小 requestId/fingerprint tombstone；返回本次副本清单交由既有清理日志接管。
 * [POS]: resources 的 D4 绑定回执清理合同；不建立第二套操作账本。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { RecordTransaction } from '../../adapters/storage/product-store'
import type { SkillBindingReceipt, SkillOperation } from '@boai/shared/domain/skills'
import type { BindingFiles } from './skill-binding-files'

export async function clearSkillBindingReceipts(tx: RecordTransaction, target: { agentIds?: string[]; resourceId?: string }) {
  const copies: BindingFiles[] = []
  for (const operation of await tx.list<SkillOperation & { fingerprint: string; binding?: { receipt: SkillBindingReceipt; files?: BindingFiles }; cleared?: boolean }>('skillOperations')) {
    if (operation.kind !== 'binding' || operation.cleared || !operation.binding) continue
    const { receipt, files } = operation.binding
    if (!(target.agentIds?.includes(receipt.agentId) || (target.resourceId && receipt.resource?.id === target.resourceId))) continue
    if (files) copies.push(files)
    await tx.put({ collection: 'skillOperations', id: operation.id, value: { id: operation.id, kind: 'binding', fingerprint: operation.fingerprint, cleared: true, scanId: '', status: 'interrupted', items: [] } })
  }
  return copies
}

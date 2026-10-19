/*
 * [OUTPUT]: 知识删除一并转移当前/更新旧副本与未提交副本归属，清理失败可继续，不遗失已清回执中的旧副本。
 * [OUTPUT]: 知识副本按内容归属清理；移除同事务保留最小去重回执，重启不复活资源。
 * [INPUT]: 资源删除事务、应用数据目录与持久清理记录。
 * [OUTPUT]: D4 新增 UUID 技能副本沿事务保存的所有权/hash 清单清理，外改保留；旧资源沿原删除合同。
 * [OUTPUT]: 先撤权后删除受管副本；清理失败保留可见记录，重试/重启只做本地清理。
 * [POS]: resources 的删除一致性边界；只接受已记录的受管相对路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { lstat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Resource } from '../../../shared/domain'
import type { ResourceCleanup, SkillInstallation } from '../../../shared/domain/skills'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { restrictedPath } from '../workspaces/file-access'
import { SkillBindingFiles, type BindingFiles } from './skill-binding-files'
import { clearSkillBindingReceipts } from './skill-binding-records'
import { KnowledgeFiles } from './knowledge-files'
import type { KnowledgeContent } from '../../../shared/domain/knowledge'
import type { KnowledgeOperation } from './knowledge-management'

type Record = ResourceCleanup & { target: string; bindingCopy?: BindingFiles; knowledgeCopy?: KnowledgeContent; knowledgeCopies?: KnowledgeContent[] }
export class ResourceCleanups {
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly hooks: { invalidate: (id: string) => Promise<void>; failed: (error: string) => void }) {}
  private target(record: Record) {
    const parts = record.target.split('/')
    if (parts.some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f]/.test(part)) || !((parts.length === 2 && ['skills', 'knowledge'].includes(parts[0]) && parts[1] === record.id) || (record.kind === 'skill' && parts.length === 5 && parts[0] === 'agents' && parts[2] === 'workspace' && parts[3] === 'skills' && parts[4] === record.name))) throw new Error('受管副本清理路径无效，已保留文件')
    return join(this.dataPath, ...parts)
  }
  async prepare(tx: RecordTransaction, resource: Resource) {
    const installation = resource.kind === 'skill' ? await tx.get<SkillInstallation & { bindingCopy?: BindingFiles }>('skillInstallations', resource.id) : undefined
    const bindingCopy = installation?.bindingCopy
    if (bindingCopy && (bindingCopy.resourceId !== resource.id || bindingCopy.name !== resource.name || bindingCopy.contentHash !== installation.contentHash || !installation.localSkillId)) throw new Error('技能绑定副本清理证据不一致，已保留文件')
    const value: Record = { id: resource.id, name: resource.name, kind: resource.kind, status: 'pending', createdAt: new Date().toISOString(), target: bindingCopy ? `skills/${resource.id}` : resource.kind === 'skill' && resource.ownerAgentId ? `agents/${resource.ownerAgentId}/workspace/skills/${resource.name}` : `${resource.kind === 'skill' ? 'skills' : 'knowledge'}/${resource.id}`, bindingCopy, knowledgeCopy: resource.knowledge }
    const knowledgeOperations = resource.knowledge ? await tx.list<KnowledgeOperation>('knowledgeOperations') : []
    if (resource.knowledge) value.knowledgeCopies = [...new Map([resource.knowledge, ...knowledgeOperations.flatMap(operation => [operation.resource, operation.previous].filter(item => item?.id === resource.id && item.knowledge).map(item => item!.knowledge!))].map(copy => [copy.copyId, copy])).values()]
    this.target(value)
    await tx.put({ collection: 'resourceCleanups', id: value.id, value })
    if (bindingCopy) await clearSkillBindingReceipts(tx, { resourceId: resource.id })
    if (resource.knowledge) for (const operation of knowledgeOperations) {
      if (operation.receipt.resourceId !== resource.id) continue
      await tx.put({ collection: 'knowledgeOperations', id: operation.id, value: { id: operation.id, fingerprint: operation.fingerprint, receipt: { requestId: operation.id, agentId: operation.receipt.agentId, status: 'cleared' } } })
    }
  }
  async prepareBindingCopy(tx: RecordTransaction, bindingCopy: BindingFiles) {
    const value: Record = { id: bindingCopy.resourceId, name: bindingCopy.name, kind: 'skill', status: 'pending', createdAt: new Date().toISOString(), target: `skills/${bindingCopy.resourceId}`, bindingCopy }
    this.target(value)
    await tx.put({ collection: 'resourceCleanups', id: value.id, value })
  }
  async list(): Promise<ResourceCleanup[]> { return (await this.store.load<Record>('resourceCleanups')).map(({ target: _, bindingCopy: _binding, knowledgeCopy: _knowledge, knowledgeCopies: _copies, ...value }) => value) }
  async finish(id: string) {
    const value = await this.store.transaction(tx => tx.get<Record>('resourceCleanups', id))
    if (!value) return
    try {
      if (await this.store.transaction(tx => tx.get('resources', id))) throw new Error('此资源仍在使用，清理已停止')
      await this.hooks.invalidate(id)
      const target = this.target(value)
      let exists = true
      try { await lstat(target) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error }
      if (value.bindingCopy) await new SkillBindingFiles(this.dataPath).cleanup(value.bindingCopy)
      else if (value.knowledgeCopy) { for (const copy of value.knowledgeCopies ?? [value.knowledgeCopy]) await new KnowledgeFiles(this.dataPath).cleanup(value.id, copy) }
      else if (exists) { await restrictedPath([this.dataPath], target); await rm(target, { recursive: true }) }
      await this.store.write([], [{ collection: 'resourceCleanups', id }])
    } catch (error) {
      value.status = 'failed'; value.error = error instanceof Error ? error.message : String(error)
      await this.store.write([{ collection: 'resourceCleanups', id, value }])
      throw new Error('资源及绑定已移除，但受管文件清理未完成；可在安装记录中重试。' + value.error)
    }
  }
  async init() { for (const value of await this.list()) { try { await this.finish(value.id) } catch (error) { this.hooks.failed(error instanceof Error ? error.message : String(error)) } } }
}

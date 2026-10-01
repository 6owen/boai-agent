/*
 * [INPUT]: 宿主已检查空闲的员工身份、可选分类版本、SQLite 和应用数据目录。
 * [OUTPUT]: 分类整批员工/记忆/专属资源/展示偏好与剩余群成员同事务删除并保存本地清理日志；固定员工目录安全清理，失败及重启不重新创建员工或执行模型工具。
 * [POS]: employees 的删除一致性边界；宿主先处理单聊/空群，并保留其他群聊历史。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { lstat, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { DigitalAgent, Resource, Conversation } from '../../../shared/domain'
import { emptyContactList, type ContactListPreferences } from '../../../shared/domain/contact-list'
import { isCoreAgent } from '../../../shared/domain/core-agent'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { detachSkillRecords } from '../resources/skill-collections'

export interface ContactDeletionInput { agentIds: string[]; category?: { id: string; expectedRevision: number } }
interface Cleanup { id: string; agentIds: string[]; status: 'pending' | 'failed'; error?: string }
interface OwnedRecord { id: string; ownerAgentId?: string; agentId?: string; resourceId?: string }

export class ContactDeletionService {
  constructor(private readonly store: ProductStore, private readonly dataPath: string) {}
  private paths(agentIds: string[]) {
    if (new Set(agentIds).size !== agentIds.length || agentIds.some(id => !/^[a-zA-Z0-9_-]{1,200}$/.test(id))) throw new Error('无效或重复员工标识')
    return agentIds.flatMap(id => [join(this.dataPath, 'agents', id), join(this.dataPath, 'external-workspaces', id)])
  }
  private async safe(path: string) {
    const parts = relative(this.dataPath, path).split(sep)
    if (parts.some(part => part === '..')) throw new Error('清理路径超出应用数据目录')
    let current = this.dataPath
    for (const part of parts) {
      current = join(current, part)
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error('员工目录含符号链接，请移除链接后重试删除') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  }
  private async validate(tx: RecordTransaction, input: ContactDeletionInput) {
    const preferences = await tx.get<ContactListPreferences>('contactList', 'contacts') ?? emptyContactList()
    if (input.category) {
      if (preferences.revision !== input.category.expectedRevision) throw new Error('通讯录已在其他窗口修改，请重试')
      if (!preferences.categories.some(category => category.id === input.category!.id)) throw new Error('员工分类不存在')
      const assigned = Object.entries(preferences.categoryByAgentId).filter(([, id]) => id === input.category!.id).map(([agentId]) => agentId)
      if (assigned.length !== input.agentIds.length || assigned.some(id => !input.agentIds.includes(id))) throw new Error('分类成员已变化，请刷新后重试')
    } else if (!input.agentIds.length) throw new Error('请选择要删除的员工')
    for (const id of input.agentIds) {
      const agent = await tx.get<DigitalAgent>('agents', id)
      if (!agent) throw new Error('员工不存在')
      if (isCoreAgent(agent)) throw new Error('核心助手不能删除')
    }
    return preferences
  }
  async prepare(input: ContactDeletionInput) {
    for (const path of this.paths(input.agentIds)) await this.safe(path)
    await this.store.transaction(tx => this.validate(tx, input))
  }
  async delete(input: ContactDeletionInput) {
    await this.prepare(input)
    const cleanup: Cleanup = { id: randomUUID(), agentIds: [...input.agentIds], status: 'pending' }
    const result = await this.store.transaction(async tx => {
      const preferences = await this.validate(tx, input), ids = new Set(input.agentIds)
      const removals: { collection: string; id: string }[] = []
      const remove = async (collection: string, id: string) => { await tx.remove(collection, id); removals.push({ collection, id }) }
      for (const collection of ['memory', 'memoryObservations', 'memoryForgets', 'profileModelCalls', 'profileSkillActivations', 'profileExecutions']) {
        for (const item of await tx.list<OwnedRecord>(collection)) if (ids.has(item.ownerAgentId ?? item.agentId ?? '')) await remove(collection, item.id)
      }
      for (const collection of ['memoryEpochs', 'memoryReceipts']) {
        for (const item of await tx.list<OwnedRecord>(collection)) if (input.agentIds.some(id => collection === 'memoryEpochs' ? item.id === `employee:${id}` || item.id.startsWith(`employee:${id}:`) : item.id.startsWith(`${id}:`))) await remove(collection, item.id)
      }
      const resources = (await tx.list<Resource>('resources')).filter(resource => resource.ownerAgentId && ids.has(resource.ownerAgentId)), resourceIds = new Set(resources.map(resource => resource.id))
      for (const resource of resources) {
        await remove('resources', resource.id)
        await remove('resourceCleanups', resource.id)
        if (resource.kind === 'skill') await detachSkillRecords(tx, resource.id)
      }
      for (const item of await tx.list<OwnedRecord>('skillOperations')) if (ids.has(item.ownerAgentId ?? '') || resourceIds.has(item.resourceId ?? '')) await remove('skillOperations', item.id)
      // Defend against legacy cross-owner bindings before removing the resource authority.
      for (const agent of await tx.list<DigitalAgent>('agents')) {
        if (ids.has(agent.id)) continue
        if ([...agent.skillIds, ...agent.knowledgeIds].some(id => resourceIds.has(id))) {
          await tx.put({ collection: 'agents', id: agent.id, value: { ...agent, skillIds: agent.skillIds.filter(id => !resourceIds.has(id)), knowledgeIds: agent.knowledgeIds.filter(id => !resourceIds.has(id)), configVersion: agent.configVersion + 1 } })
        }
      }
      for (const conversation of await tx.list<Conversation>('conversations')) {
        const agentIds = conversation.agentIds.filter(id => !ids.has(id))
        const sharedKnowledgeIds = conversation.sharedKnowledgeIds.filter(id => !resourceIds.has(id))
        if (agentIds.length === conversation.agentIds.length && sharedKnowledgeIds.length === conversation.sharedKnowledgeIds.length) continue
        if (agentIds.length !== conversation.agentIds.length && (conversation.kind === 'direct' || !agentIds.length)) throw new Error('请先清理员工单聊和空群后再删除员工')
        await tx.put({ collection: 'conversations', id: conversation.id, value: { ...conversation, agentIds, sharedKnowledgeIds, configVersion: (conversation.configVersion ?? 0) + 1, updatedAt: new Date().toISOString() } })
      }
      for (const id of ids) { await remove('agents', id); await remove('memoryCleanup', id) }
      preferences.agentOrder = preferences.agentOrder.filter(id => !ids.has(id))
      preferences.categoryByAgentId = Object.fromEntries(Object.entries(preferences.categoryByAgentId).filter(([id, categoryId]) => !ids.has(id) && categoryId !== input.category?.id))
      if (input.category) preferences.categories = preferences.categories.filter(category => category.id !== input.category!.id)
      preferences.revision++
      await tx.put({ collection: 'contactList', id: 'contacts', value: preferences })
      // Persist cleanup authority with deletion; startup cannot recreate a committed employee.
      await tx.put({ collection: 'contactDeletions', id: cleanup.id, value: cleanup })
      return { removals, preferences }
    })
    await this.finish(cleanup)
    return result
  }
  private async finish(cleanup: Cleanup) {
    try {
      const existing = await this.store.load<DigitalAgent>('agents')
      if (existing.some(agent => cleanup.agentIds.includes(agent.id))) throw new Error('员工身份仍存在，清理已停止')
      const paths = this.paths(cleanup.agentIds)
      for (const path of paths) await this.safe(path)
      for (const path of paths) await rm(path, { recursive: true, force: true })
      await this.store.write([], [{ collection: 'contactDeletions', id: cleanup.id }])
    } catch (error) {
      cleanup.status = 'failed'; cleanup.error = error instanceof Error ? error.message : String(error)
      await this.store.write([{ collection: 'contactDeletions', id: cleanup.id, value: cleanup }])
      throw new Error('员工及关联数据已删除，但工作区清理未完成；重启后将继续清理。' + cleanup.error)
    }
  }
  async recover() { for (const cleanup of await this.store.load<Cleanup>('contactDeletions')) await this.finish(cleanup) }
}

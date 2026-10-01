/*
 * [INPUT]: 宿主已检查空闲的整批员工身份、可选偏好/标签版本、SQLite 和应用数据目录。
 * [OUTPUT]: D4 专属 UUID 副本在删除事务保存真实 hash 清理授权，沿资源清理器失败/重启续清；旧员工目录合同保持原边界。
 * [OUTPUT]: 选中或标签整批员工/记忆/专属资源/多标签关系/展示偏好与剩余群成员同事务删除并保存本地清理日志；固定员工目录安全清理，失败及重启不重新创建员工或执行模型工具。
 * [POS]: employees 的删除一致性边界；宿主先处理单聊/空群，并保留其他群聊历史。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { lstat, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { DigitalAgent, Resource, Conversation } from '../../../shared/domain'
import { contactTagIds, emptyContactList, type ContactListPreferences } from '../../../shared/domain/contact-list'
import { isCoreAgent } from '../../../shared/domain/core-agent'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { detachSkillRecords } from '../resources/skill-collections'
import type { SkillInstallation } from '../../../shared/domain/skills'
import type { BindingFiles } from '../resources/skill-binding-files'
import type { ResourceCleanups } from '../resources/resource-cleanups'
import { clearSkillBindingReceipts } from '../resources/skill-binding-records'

export interface ContactDeletionInput { agentIds: string[]; expectedRevision?: number; category?: { id: string; expectedRevision: number } }
interface Cleanup { id: string; agentIds: string[]; status: 'pending' | 'failed'; error?: string; bindingResourceIds?: string[] }
interface OwnedRecord { id: string; ownerAgentId?: string; agentId?: string; resourceId?: string }

export class ContactDeletionService {
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly bindingCleanups?: Pick<ResourceCleanups, 'prepare' | 'prepareBindingCopy' | 'finish'>) {}
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
    if (input.expectedRevision !== undefined && preferences.revision !== input.expectedRevision) throw new Error('通讯录已在其他窗口修改，请重试')
    if (input.category) {
      if (preferences.revision !== input.category.expectedRevision) throw new Error('通讯录已在其他窗口修改，请重试')
      if (!preferences.categories.some(category => category.id === input.category!.id)) throw new Error('员工标签不存在')
      const assigned = [...new Set([...Object.keys(preferences.categoryByAgentId), ...Object.keys(preferences.tagIdsByAgentId ?? {})])].filter(agentId => contactTagIds(preferences, agentId).includes(input.category!.id))
      if (assigned.length !== input.agentIds.length || assigned.some(id => !input.agentIds.includes(id))) throw new Error('标签成员已变化，请刷新后重试')
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
        const installation = await tx.get<SkillInstallation & { bindingCopy?: BindingFiles }>('skillInstallations', resource.id)
        if (installation?.bindingCopy) {
          if (!this.bindingCleanups) throw new Error('技能绑定副本清理服务不可用')
          await this.bindingCleanups.prepare(tx, resource)
          ;(cleanup.bindingResourceIds ??= []).push(resource.id)
        }
        await remove('resources', resource.id)
        if (!installation?.bindingCopy) await remove('resourceCleanups', resource.id)
        if (resource.kind === 'skill') await detachSkillRecords(tx, resource.id)
      }
      for (const copy of await clearSkillBindingReceipts(tx, { agentIds: input.agentIds })) {
        if (!this.bindingCleanups) throw new Error('技能绑定副本清理服务不可用')
        await this.bindingCleanups.prepareBindingCopy(tx, copy)
        ;(cleanup.bindingResourceIds ??= []).push(copy.resourceId)
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
      if (preferences.tagIdsByAgentId) {
        preferences.tagIdsByAgentId = Object.fromEntries(Object.entries(preferences.tagIdsByAgentId).filter(([id]) => !ids.has(id)).map(([id, tags]) => [id, tags.filter(tagId => tagId !== input.category?.id)]))
        for (const [agentId, tags] of Object.entries(preferences.tagIdsByAgentId)) {
          if (tags[0]) preferences.categoryByAgentId[agentId] = tags[0]
          else delete preferences.categoryByAgentId[agentId]
        }
      }
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
      // Copy cleanup has its own visible, durable failure record; a conflict does not revive the employee.
      for (const id of cleanup.bindingResourceIds ?? []) {
        if (!this.bindingCleanups) throw new Error('技能绑定副本清理服务不可用')
        try { await this.bindingCleanups.finish(id) } catch { /* ResourceCleanups retains the exact error for explicit retry/startup. */ }
      }
      await this.store.write([], [{ collection: 'contactDeletions', id: cleanup.id }])
    } catch (error) {
      cleanup.status = 'failed'; cleanup.error = error instanceof Error ? error.message : String(error)
      await this.store.write([{ collection: 'contactDeletions', id: cleanup.id, value: cleanup }])
      throw new Error('员工及关联数据已删除，但工作区清理未完成；重启后将继续清理。' + cleanup.error)
    }
  }
  async recover() { for (const cleanup of await this.store.load<Cleanup>('contactDeletions')) await this.finish(cleanup) }
}

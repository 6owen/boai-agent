/*
 * [INPUT]: 空闲会话、产品 SQLite 与受管数据根目录。
 * [OUTPUT]: D6 私人阅读状态和完成事实在原最终清理事务删除，保留并提升最小 clock epoch 拒绝旧观测/锚点，不把正文带入最小清理屏障。
 * [OUTPUT]: 成果先失效再 hash 安全清理，冲突阻止后续递归删除；修订/采用 cleared 回执与恢复门禁；清空/解散保留核心首发和普通消息最小 cleared 回执；撤销材料及派生记忆后只清理 hash 匹配的私有原件，冲突聊天保持门禁并在恢复时显性返回；清空保留配置，解散删除会话配置/通讯录顺序且不重建工作区，两者共用重启续清日志；清除会话关联模型调用/技能激活/执行区间、监控检查点、Trace、自动化私有正文和跨工作证据，终结失去上下文的等待；通知待提交抑制/提交中未知，保留个人资料、共享资源及自动化触发去重身份。
 * [POS]: conversations 的破坏性历史清理用例；宿主负责阻止执行中的会话进入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, relative, sep } from 'node:path'
import type { Conversation, MemoryEntry } from '../../../shared/domain'
import type { ContactListPreferences } from '../../../shared/domain/contact-list'
import type { AutomationDispatch, AutomationNotice, AutomationOccurrence, AutomationMonitorCheckpoint } from '../../../shared/domain/automations'
import { ProductStore } from '../../adapters/storage/product-store'
import type { MaterialRepository } from '../materials/material-repository'
import type { ArtifactRepository } from '../workspaces/artifact-repository'
import type { ConversationReadingRepository } from './reading-repository'
import { pendingOccurrence } from '../automations/schedule-policy'
import { MemoryRepository } from '../memory/memory-repository'

interface HistoryRecord { id: string; conversationId?: string; turnId?: string; runId?: string; workId?: string; budgetId?: string; messageId?: string; conversation?: { id: string }; fingerprint?: string }
interface Cleanup { id: string; hide: boolean; remove?: boolean }
export class ConversationHistory {
  constructor(private store: ProductStore, private dataPath: string, private materials?: MaterialRepository, private artifacts?: ArtifactRepository, private reading?: ConversationReadingRepository) {}
  async recover() {
    const conflicts: { conversationId: string; error: string }[] = []
    for (const pending of await this.store.load<Cleanup>('conversationCleanup')) {
      const conversation = (await this.store.load<Conversation>('conversations')).find(item => item.id === pending.id)
      if (conversation) try { await this.clear(conversation, pending.hide, pending.remove) } catch (error) {
        const sourceConflicts = [...await this.store.load<{ conversationId: string; status: string }>('materialCleanups'), ...await this.store.load<{ conversationId: string; status: string }>('artifactCleanups')].some(item => item.conversationId === conversation.id && item.status === 'conflict')
        if (!sourceConflicts) throw error
        conflicts.push({ conversationId: conversation.id, error: error instanceof Error ? error.message : '材料或成果清理未完成' })
      }
    }
    return conflicts
  }
  private async safe(path: string) {
    const parts = relative(this.dataPath, path).split(sep)
    if (parts.some(part => part === '..')) throw new Error('清理路径超出应用数据目录')
    let current = this.dataPath
    for (const part of parts) {
      current = join(current, part)
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error('会话目录含符号链接，请移除链接后重试清理') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  }
  remove(conversation: Conversation) { return this.clear(conversation, false, true) }
  async clear(conversation: Conversation, hide: boolean, remove = false) {
    const id = conversation.id
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('无效会话标识')
    const runs = (await this.store.load<HistoryRecord>('runs')).filter(item => item.conversationId === id)
    const agents = await this.store.load<{ id: string }>('agents')
    const paths = [join(this.dataPath, 'workspaces', id)]
    for (const agent of agents) {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(agent.id)) throw new Error('无效员工标识')
      paths.push(join(this.dataPath, 'agents', agent.id, 'workspace', 'sessions', id), join(this.dataPath, 'external-workspaces', agent.id, id))
    }
    for (const run of runs) {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(run.id)) throw new Error('无效运行标识')
      paths.push(join(this.dataPath, 'external-runtime', run.id))
    }
    // Validate every parent before deleting anything; never follow recorded artifact/source paths.
    for (const path of paths) await this.safe(path)
    await this.store.write([{ collection: 'conversationCleanup', id, value: { id, hide, ...(remove ? { remove: true } : {}) } }])
    // Revoke derived memory even if a later hash conflict preserves a private original.
    const memoryRepository = new MemoryRepository(this.store)
    for (const agent of agents) await memoryRepository.invalidateConversation(agent.id, id)
    if (this.artifacts) {
      await this.store.transaction(tx => this.artifacts!.invalidateConversation(tx, id))
      await this.artifacts.cleanupConversation(id)
    }
    if (this.materials) {
      await this.store.transaction(tx => this.materials!.invalidateConversation(tx, id))
      await this.materials.cleanupConversation(id)
    }
    // The durable source fence precedes file removal and is repeated by recovery.
    for (const path of paths) await rm(path, { recursive: true, force: true })
    for (const agent of agents) {
      const state = join(this.dataPath, 'agents', agent.id, 'state'), manifestPath = join(state, 'bootstrap-manifest.json')
      await this.safe(manifestPath)
      let source: string
      try { source = await readFile(manifestPath, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error }
      const manifest = JSON.parse(source) as { hashes: Record<string, string> }
      for (const key of Object.keys(manifest.hashes)) if (key.startsWith(`sessions/${id}/`)) delete manifest.hashes[key]
      const temporary = `${manifestPath}.${randomUUID()}.tmp`
      try { await writeFile(temporary, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temporary, manifestPath) }
      finally { await rm(temporary, { force: true }) }
      const conflicts = join(state, 'projection-conflicts'); await this.safe(conflicts)
      const names = await readdir(conflicts).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error })
      for (const name of names) if (name.includes(`-sessions_${id}_`)) await rm(join(conflicts, name), { force: true })
    }
    if (!remove) await mkdir(join(this.dataPath, 'workspaces', id), { recursive: true })
    return this.store.transaction(async tx => {
      await this.materials?.invalidateConversation(tx, id)
      await this.artifacts?.invalidateConversation(tx, id)
      await this.reading?.resetConversation(tx, id)
      const removals: { collection: string; id: string }[] = []
      const collect = async (collection: string, match: (item: HistoryRecord) => boolean) => {
        const items = (await tx.list<HistoryRecord>(collection)).filter(match)
        removals.push(...items.map(item => ({ collection, id: item.id })))
        return items
      }
      const owned = (item: HistoryRecord) => item.conversationId === id
      const messages = new Set((await collect('messages', owned)).map(item => item.id))
      await collect('materials', owned)
      const runIds = new Set((await collect('runs', owned)).map(item => item.id))
      const turns = new Set((await collect('turns', owned)).map(item => item.id))
      const work = await collect('workItems', owned), workIds = new Set(work.map(item => item.id)), budgets = new Set(work.map(item => item.budgetId))
      for (const collection of ['profileModelCalls', 'profileSkillActivations', 'profileExecutions', 'traceSpans', 'events', 'deliveries', 'decisions', 'contributions', 'grants', 'approvals', 'artifacts', 'jobs', 'workWakes', 'budgetModelCalls']) {
        await collect(collection, item => owned(item) || Boolean(item.turnId && turns.has(item.turnId)) || Boolean(item.runId && runIds.has(item.runId)))
      }
      await collect('snapshots', item => item.conversation?.id === id || runIds.has(item.id))
      await collect('workExecutions', item => Boolean(item.workId && workIds.has(item.workId)))
      await collect('workBudgets', item => budgets.has(item.id) || owned(item))
      await collect('requests', item => {
        if (item.messageId && messages.has(item.messageId)) return true
        try { const value = JSON.parse(item.fingerprint ?? '{}'); return value.conversationId === id || runIds.has(value.id) } catch { return false }
      })
      for (const receipt of (await tx.list<HistoryRecord>('coreConversationStarts')).filter(owned)) {
        const fingerprint = /^[a-f0-9]{64}$/.test(receipt.fingerprint ?? '') ? receipt.fingerprint : createHash('sha256').update(receipt.fingerprint ?? '').digest('hex')
        await tx.put({ collection: 'coreConversationStarts', id: receipt.id, value: { id: receipt.id, fingerprint, conversationId: id, cleared: true } })
      }
      for (const receipt of (await tx.list<HistoryRecord>('messageReceipts')).filter(owned)) {
        await tx.put({ collection: 'messageReceipts', id: receipt.id, value: { id: receipt.id, fingerprint: receipt.fingerprint, conversationId: id, cleared: true } })
      }
      const epochs = new Map(agents.map(agent => [`employee:${agent.id}:conversation:${id}`, 0]))
      const memory = (await tx.list<MemoryEntry>('memory')).filter(entry => entry.conversationId === id)
      for (const entry of memory) {
        removals.push({ collection: 'memory', id: entry.id })
        epochs.set(`employee:${entry.ownerAgentId}:${entry.scope === 'profile' ? 'profile' : `conversation:${entry.conversationId}`}`, 0)
      }
      for (const epoch of await tx.list<{ id: string; epoch: number }>('memoryEpochs')) if (epoch.id.endsWith(`:conversation:${id}`) || epochs.has(epoch.id)) epochs.set(epoch.id, epoch.epoch)
      const memoryEpochs = [...epochs].map(([id, epoch]) => ({ id, epoch: epoch + 1 }))
      for (const value of memoryEpochs) await tx.put({ collection: 'memoryEpochs', id: value.id, value })
      // Retain trigger identities to prevent native automation triggers from being replayed.
      const occurrences = (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(item => item.conversationId === id).map(item => {
        const { messageId: _message, turnId: _turn, reason: _reason, turnIds: _turns, waitingTurnIds: _waitingTurns, workIds: _works, rootWorkIds: _roots, resultEvidence: _evidence, budgetId: _budgetId, budget: _budget, monitor: _monitor, ...rest } = item
        return { ...rest, ...(item.schemaVersion ? { stateVersion: item.stateVersion + 1, deliveryStatus: 'unknown' as const, ...(pendingOccurrence.has(item.status) ? { status: 'interrupted' as const, finishedAt: new Date().toISOString() } : {}) } : {}), runIds: [], resultMessageIds: [], reason: '聊天记录已清空' }
      })
      for (const value of occurrences) await tx.put({ collection: 'automationOccurrences', id: value.id, value })
      for (const checkpoint of await tx.list<AutomationMonitorCheckpoint>('automationMonitorCheckpoints')) if (checkpoint.conversationId === id) await tx.remove('automationMonitorCheckpoints', checkpoint.id)
      const occurrenceIds = new Set(occurrences.map(item => item.id))
      for (const notice of await tx.list<AutomationNotice>('automationNotices')) if (occurrenceIds.has(notice.occurrenceId)) {
        delete notice.messageId; delete notice.conversationId
        if (notice.status === 'pending') notice.status = 'suppressed'
        else if (notice.status === 'submitting') notice.status = 'unknown'
        notice.error = '聊天记录已清理'; notice.finishedAt = new Date().toISOString()
        await tx.put({ collection: 'automationNotices', id: notice.id, value: notice })
      }
      for (const intent of await tx.list<AutomationDispatch>('automationDispatches')) if (occurrenceIds.has(intent.id)) {
        await tx.put({ collection: 'automationDispatches', id: intent.id, value: { schemaVersion: 1, id: intent.id, requestId: intent.requestId, status: 'cleared' } })
      }
      const cleared = { ...conversation, workspacePath: join(this.dataPath, 'workspaces', id), lastMessageAt: undefined, lastMessagePreview: undefined, activity: 'idle' as const, ...(hide ? { list: { hidden: true, pinned: false } } : {}) }
      if (remove) {
        removals.push({ collection: 'conversations', id })
        const preferences = await tx.get<ContactListPreferences>('contactList', 'contacts')
        if (preferences?.groupOrder.includes(id)) {
          preferences.groupOrder = preferences.groupOrder.filter(groupId => groupId !== id)
          preferences.revision++
          await tx.put({ collection: 'contactList', id: 'contacts', value: preferences })
        }
      } else await tx.put({ collection: 'conversations', id, value: cleared })
      for (const item of removals) await tx.remove(item.collection, item.id)
      await tx.remove('conversationCleanup', id)
      return { conversation: cleared, removals, memoryEpochs, occurrences }
    })
  }
}

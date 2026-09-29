/*
 * [INPUT]: 空闲会话、产品 SQLite 与受管数据根目录。
 * [OUTPUT]: 清除监控私有比较证据与来源检查点；清理通知正文引用，待提交抑制/提交中未知并保留最小身份；清理自动化待回答轮次引用；按会话清理尚无 Work 的 occurrence 预算与调用回执；Trace 随会话历史原子清理；可在重启后继续的会话记录/专属文件清理；保留联系人、群配置及共享资料，清除自动化投递正文/跨工作证据、终结失去上下文的等待并保留去重身份。
 * [POS]: conversations 的破坏性历史清理用例；宿主负责阻止执行中的会话进入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, relative, sep } from 'node:path'
import type { Conversation, MemoryEntry } from '../../../shared/domain'
import type { AutomationDispatch, AutomationNotice, AutomationOccurrence, AutomationMonitorCheckpoint } from '../../../shared/domain/automations'
import { ProductStore } from '../../adapters/storage/product-store'
import { pendingOccurrence } from '../automations/schedule-policy'

interface HistoryRecord { id: string; conversationId?: string; turnId?: string; runId?: string; workId?: string; budgetId?: string; messageId?: string; conversation?: { id: string }; fingerprint?: string }
interface Cleanup { id: string; hide: boolean }
export class ConversationHistory {
  constructor(private store: ProductStore, private dataPath: string) {}
  async recover() {
    for (const pending of await this.store.load<Cleanup>('conversationCleanup')) {
      const conversation = (await this.store.load<Conversation>('conversations')).find(item => item.id === pending.id)
      if (conversation) await this.clear(conversation, pending.hide)
    }
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
  async clear(conversation: Conversation, hide: boolean) {
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
    await this.store.write([{ collection: 'conversationCleanup', id, value: { id, hide } }])
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
    await mkdir(join(this.dataPath, 'workspaces', id), { recursive: true })
    return this.store.transaction(async tx => {
      const removals: { collection: string; id: string }[] = []
      const collect = async (collection: string, match: (item: HistoryRecord) => boolean) => {
        const items = (await tx.list<HistoryRecord>(collection)).filter(match)
        removals.push(...items.map(item => ({ collection, id: item.id })))
        return items
      }
      const owned = (item: HistoryRecord) => item.conversationId === id
      const messages = new Set((await collect('messages', owned)).map(item => item.id))
      const runIds = new Set((await collect('runs', owned)).map(item => item.id))
      const turns = new Set((await collect('turns', owned)).map(item => item.id))
      const work = await collect('workItems', owned), workIds = new Set(work.map(item => item.id)), budgets = new Set(work.map(item => item.budgetId))
      for (const collection of ['traceSpans', 'events', 'deliveries', 'decisions', 'contributions', 'grants', 'approvals', 'artifacts', 'jobs', 'workWakes', 'budgetModelCalls']) {
        await collect(collection, item => owned(item) || Boolean(item.turnId && turns.has(item.turnId)) || Boolean(item.runId && runIds.has(item.runId)))
      }
      await collect('snapshots', item => item.conversation?.id === id || runIds.has(item.id))
      await collect('workExecutions', item => Boolean(item.workId && workIds.has(item.workId)))
      await collect('workBudgets', item => budgets.has(item.id) || owned(item))
      await collect('requests', item => {
        if (item.messageId && messages.has(item.messageId)) return true
        try { const value = JSON.parse(item.fingerprint ?? '{}'); return value.conversationId === id || runIds.has(value.id) } catch { return false }
      })
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
      await tx.put({ collection: 'conversations', id, value: cleared })
      for (const item of removals) await tx.remove(item.collection, item.id)
      await tx.remove('conversationCleanup', id)
      return { conversation: cleared, removals, memoryEpochs, occurrences }
    })
  }
}

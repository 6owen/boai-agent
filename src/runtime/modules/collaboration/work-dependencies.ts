/*
 * [INPUT]: 同一 SQLite 事务内的工作图、显式结果版本与可信运行来源。
 * [OUTPUT]: 继承目标工作自动化来源的依赖校验、等待状态和幂等定向通知的原子变更。
 * [POS]: collaboration 工作依赖规则；父子关系不参与成功依赖判断。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { WorkDependency, WorkItem, WorkWake } from '../../../shared/domain'
import type { RecordTransaction } from '../../adapters/storage/product-store'

const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const unavailable = new Set(['failed', 'cancelled', 'blocked', 'interrupted'])
export async function validateDependencies(tx: RecordTransaction, work: WorkItem, dependencies: WorkDependency[]) {
  const items = new Map((await tx.list<WorkItem>('workItems')).map(item => [item.id, item]))
  const reaches = (id: string, seen = new Set<string>()): boolean => {
    if (id === work.id) return true
    if (seen.has(id)) return false
    seen.add(id)
    return (items.get(id)?.dependsOnWorkIds ?? []).some(next => reaches(next, seen))
  }
  if (new Set(dependencies.map(item => item.workId)).size !== dependencies.length) throw new Error('依赖不能重复')
  for (const dependency of dependencies) {
    if (!Number.isInteger(dependency.resultVersion) || dependency.resultVersion < 1) throw new Error('依赖必须指定有效结果版本')
    const target = items.get(dependency.workId)
    if (!target || target.conversationId !== work.conversationId) throw new Error('依赖工作不属于当前会话')
    if (reaches(target.id)) throw new Error('工作依赖形成循环')
  }
}

export async function queueWorkWake(tx: RecordTransaction, work: WorkItem, kind: WorkWake['kind'], source: { runId: string; agentId: string }, reason?: string) {
  const results = [...work.requiredResults].sort((a, b) => a.workId.localeCompare(b.workId))
  const id = `wake-${createHash('sha256').update(JSON.stringify([work.id, work.waitRevision, results, kind])).digest('hex')}`
  const previous = await tx.get<WorkWake>('workWakes', id)
  if (previous) return previous
  const wake: WorkWake = { id, workId: work.id, conversationId: work.conversationId, ownerAgentId: work.ownerAgentId,
    waitRevision: work.waitRevision, requiredResults: results, kind, status: 'pending', sourceRunId: source.runId,
    sourceAgentId: source.agentId, ...(work.origin ? { origin: work.origin } : {}), reason, createdAt: new Date().toISOString() }
  work.wakeId = id
  await tx.put(row('workWakes', wake)); await tx.put(row('workItems', work))
  return wake
}

/** Called inside the result transaction, including when registration races completion. */
export async function refreshWaiters(tx: RecordTransaction, conversationId: string, source: { runId: string; agentId: string }) {
  const items = (await tx.list<WorkItem>('workItems')).filter(work => work.conversationId === conversationId)
  const byId = new Map(items.map(work => [work.id, work]))
  // Blocking propagates through a finite acyclic graph; successes never complete a parent.
  for (let pass = 0; pass < items.length; pass++) {
    let changed = false
    for (const work of items) {
      if (work.status !== 'waiting' || work.activeRunId || !work.requiredResults.length) continue
      const failed = work.requiredResults.find(result => !byId.has(result.workId) || unavailable.has(byId.get(result.workId)!.status))
      const ready = work.requiredResults.every(result => byId.get(result.workId)?.status === 'delivered' && byId.get(result.workId)!.resultVersion >= result.resultVersion)
      if (!failed && !ready) continue
      work.version++; work.updatedAt = new Date().toISOString()
      if (failed || work.requiresReview) {
        const reason = failed ? `依赖 ${failed.workId} 未交付，工作已阻塞` : '存在待核对操作，不能自动接续'
        work.status = 'blocked'; work.outcome = { disposition: 'blocked', summary: reason }
        await queueWorkWake(tx, work, 'blocked', source, reason)
      } else {
        work.status = 'ready'
        await queueWorkWake(tx, work, 'ready', source)
      }
      changed = true
    }
    if (!changed) break
  }
}

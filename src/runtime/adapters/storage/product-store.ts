/*
 * [INPUT]: 本地 SQLite 连接与产品记录。
 * [OUTPUT]: 数据库分页前筛选待处理事项；历史分页/单记录附带对应通知回执；自动化历史按时间与 ID 稳定分页且在数据库内限制条数；支持按会话范围读取记录；读检查写事务及跨连接写锁有界等待（不重试已开始的事务）、备份和空间回收。
 * [POS]: 产品持久化边界；事务回调不得再调用外层存储方法。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createClient, type Client } from '@libsql/client'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AutomationHistoryPage, AutomationHistoryQuery } from '../../../shared/domain/automations'
import { AUTOMATION_ATTENTION_STATUSES } from '../../../shared/domain/automations'

const transactionAdmissionDelays = [10, 20, 40, 80, 160, 320]

export interface StoredRecord { collection: string; id: string; value: unknown }
export interface RecordTransaction {
  get<T>(collection: string, id: string): Promise<T | undefined>
  list<T>(collection: string): Promise<T[]>
  put(record: StoredRecord): Promise<void>
  remove(collection: string, id: string): Promise<void>
}

/** One local SQLite writer; every mutation is committed before it is acknowledged. */
export class ProductStore {
  private client!: Client
  private tail: Promise<unknown> = Promise.resolve()
  constructor(readonly filename: string) {}
  async init() {
    await mkdir(dirname(this.filename), { recursive: true })
    this.client = createClient({ url: pathToFileURL(this.filename).href })
    await this.client.execute('PRAGMA journal_mode=WAL')
    await this.client.execute('CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (collection, id))')
  }
  async load<T>(collection: string, scope?: { conversationId: string }): Promise<T[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute({ sql: `SELECT value FROM records WHERE collection = ?${scope ? " AND json_extract(value, '$.conversationId') = ?" : ''} ORDER BY rowid`, args: scope ? [collection, scope.conversationId] : [collection] })
      return result.rows.map(row => JSON.parse(String(row.value)) as T)
    })
  }
  /** Stable keyset pagination: new inserts and removals cannot shift an older page's boundary. */
  automationHistory(query: AutomationHistoryQuery & { limit: number; id?: string }): Promise<AutomationHistoryPage> {
    return this.enqueue(async () => {
      const where = ["collection = 'automationOccurrences'"], args: (string | number)[] = []
      if (query.id) { where.push('id = ?'); args.push(query.id) }
      if (query.automationId) { where.push("json_extract(value, '$.automationId') = ?"); args.push(query.automationId) }
      if (query.attentionOnly) {
        // Mirror automationNeedsAttention before LIMIT, so old unresolved records cannot disappear behind recent successes.
        where.push(`(json_extract(value, '$.status') IN (${AUTOMATION_ATTENTION_STATUSES.map(() => '?').join(',')}) OR json_extract(value, '$.attentionReason') = 'authorization' OR (json_extract(value, '$.status') = 'cancelled' AND json_extract(value, '$.cancellationCause') = 'budget') OR (json_extract(value, '$.status') = 'completed' AND json_extract(value, '$.deliveryStatus') IN ('blocked', 'partial')))`)
        args.push(...AUTOMATION_ATTENTION_STATUSES)
      }
      if (query.before) {
        where.push("(json_extract(value, '$.startedAt'), id) < (?, ?)")
        args.push(query.before.startedAt, query.before.id)
      }
      args.push(query.limit + 1)
      const result = await this.client.execute({ sql: `SELECT value, (SELECT json_group_array(json(n.value)) FROM records n WHERE n.collection = 'automationNotices' AND json_extract(n.value, '$.occurrenceId') = o.id) AS notices FROM records o WHERE ${where.join(' AND ')} ORDER BY json_extract(value, '$.startedAt') DESC, id DESC LIMIT ?`, args })
      const rows = result.rows.map(row => ({ ...JSON.parse(String(row.value)), notices: JSON.parse(String(row.notices)) })) as AutomationHistoryPage['occurrences']
      const occurrences = rows.slice(0, query.limit), last = occurrences.at(-1)
      return { occurrences, ...(rows.length > query.limit && last ? { nextCursor: { startedAt: last.startedAt, id: last.id } } : {}) }
    })
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation)
    this.tail = next.catch(() => undefined)
    return next
  }
  write(records: StoredRecord[], removals: { collection: string; id: string }[] = []): Promise<void> {
    // Serialize now so a later in-memory change cannot alter this transaction.
    const statements = records.map(record => ({ sql: 'INSERT INTO records(collection,id,value) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value', args: [record.collection, record.id, JSON.stringify(record.value)] }))
    statements.push(...removals.map(record => ({ sql: 'DELETE FROM records WHERE collection=? AND id=?', args: [record.collection, record.id] })))
    return this.enqueue(async () => { if (statements.length) await this.client.batch(statements, 'write') })
  }
  /** BEGIN IMMEDIATE protects the read/check/write sequence, including other writers. */
  transaction<T>(operation: (records: RecordTransaction) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const transaction = await this.beginWriteTransaction()
      try {
        const result = await operation({
          get: async <R>(collection: string, id: string) => {
            const result = await transaction.execute({ sql: 'SELECT value FROM records WHERE collection=? AND id=?', args: [collection, id] })
            return result.rows.length ? JSON.parse(String(result.rows[0].value)) as R : undefined
          },
          list: async <R>(collection: string) => {
            const result = await transaction.execute({ sql: 'SELECT value FROM records WHERE collection=? ORDER BY rowid', args: [collection] })
            return result.rows.map(row => JSON.parse(String(row.value)) as R)
          },
          put: async record => {
            await transaction.execute({ sql: 'INSERT INTO records(collection,id,value) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value', args: [record.collection, record.id, JSON.stringify(record.value)] })
          },
          remove: async (collection, id) => {
            await transaction.execute({ sql: 'DELETE FROM records WHERE collection=? AND id=?', args: [collection, id] })
          },
        })
        await transaction.commit()
        return result
      } catch (error) {
        if (!transaction.closed) await transaction.rollback()
        throw error
      } finally { transaction.close() }
    })
  }
  private async beginWriteTransaction() {
    for (let attempt = 0; ; attempt++) {
      try { return await this.client.transaction('write') }
      catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_BUSY')) throw error
        // libsql 0.5.29 can retain the failed BEGIN statement in its connection pool.
        // No transaction began and this store's reads/writes are queued, so discard that idle pool.
        this.client.close()
        this.client = createClient({ url: pathToFileURL(this.filename).href })
        if (attempt >= transactionAdmissionDelays.length) throw error
        // Only retry acquiring BEGIN. The callback and commit are never replayed, even on SQLITE_BUSY.
        await new Promise(resolve => setTimeout(resolve, transactionAdmissionDelays[attempt]))
      }
    }
  }
  backup(destination: string): Promise<void> {
    return this.enqueue(async () => {
      await this.client.execute({ sql: 'VACUUM INTO ?', args: [destination] })
    })
  }
  compact(): Promise<void> {
    return this.enqueue(async () => {
      await this.client.execute('VACUUM')
      await this.client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    })
  }
  async close() { await this.tail; this.client.close() }
}

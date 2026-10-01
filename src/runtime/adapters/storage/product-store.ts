/*
 * [INPUT]: 本地 SQLite 连接与产品记录。
 * [OUTPUT]: D6 完整历史正文/文件名固定筛选及时间/ID/类型游标、明确目标核对和当前 epoch 完成身份的 sequence/ID 消息页；事务内按完成序号/有界缺口查询首条未读；宿主固定 inbox SELECT 在 LIMIT 前过滤四类当前事项、来源/清理条件及时间/ID 游标；全量记录标题搜索及进行中/完成/需处理条件在分页前求交；数据库分页前筛选待处理事项；历史分页/单记录附带对应通知回执；自动化历史按时间与 ID 稳定分页且在数据库内限制条数；支持按会话范围读取记录；读检查写事务及跨连接写锁有界等待（不重试已开始的事务）、备份和空间回收。
 * [POS]: 产品持久化边界；事务回调不得再调用外层存储方法。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createClient, type Client } from '@libsql/client'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AutomationHistoryPage, AutomationHistoryQuery } from '../../../shared/domain/automations'
import { AUTOMATION_ATTENTION_STATUSES, AUTOMATION_ONGOING_STATUSES } from '../../../shared/domain/automations'
import { inboxSql, type InboxSqlRow } from '../../modules/inbox/inbox-sql'
import type { InboxQuery } from '../../../shared/domain/inbox'
import type { ConversationCompletion, ConversationMessagePageQuery, ConversationSearchQuery } from '../../../shared/domain/reading'
import { conversationMessagesSql, conversationSearchSql, conversationSearchTargetSql, firstUnreadCompletionSql, type ConversationMessageSqlRow, type ConversationSearchSqlRow, type ConversationSearchSqlTarget, type FirstUnreadCompletionSqlQuery } from '../../modules/conversations/reading-sql'

const transactionAdmissionDelays = [10, 20, 40, 80, 160, 320]

export interface StoredRecord { collection: string; id: string; value: unknown }
export interface RecordTransaction {
  get<T>(collection: string, id: string): Promise<T | undefined>
  list<T>(collection: string): Promise<T[]>
  firstUnreadCompletion(query: FirstUnreadCompletionSqlQuery): Promise<ConversationCompletion | undefined>
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
      if (query.search?.trim()) { where.push("instr(lower(json_extract(value, '$.name')), lower(?)) > 0"); args.push(query.search.trim()) }
      if (query.status === 'active') { where.push(`json_extract(value, '$.status') IN (${AUTOMATION_ONGOING_STATUSES.map(() => '?').join(',')})`); args.push(...AUTOMATION_ONGOING_STATUSES) }
      if (query.status === 'completed') where.push("json_extract(value, '$.status') = 'completed'")
      if (query.attentionOnly || query.status === 'attention') {
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
  /** Fixed host-owned inbox SELECT; renderer only supplies typed filters and a bounded cursor. */
  inboxRows(query: InboxQuery & { limit: number; id?: string }): Promise<InboxSqlRow[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(inboxSql(query))
      return result.rows.map(row => ({ id: String(row.id), kind: String(row.kind), sourceCollection: String(row.sourceCollection), sourceId: String(row.sourceId), time: String(row.time), conversation: String(row.conversation), agent: row.agent == null ? null : String(row.agent), message: row.message == null ? null : String(row.message), artifact: row.artifact == null ? null : String(row.artifact), source: String(row.source) }))
    })
  }
  /** Fixed full-history queries filter before LIMIT and never infer another object's identity. */
  conversationSearchRows(query: ConversationSearchQuery & { limit: number }): Promise<ConversationSearchSqlRow[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(conversationSearchSql(query))
      return result.rows.map(row => ({ id: String(row.id), kind: String(row.kind), time: String(row.time), conversation: String(row.conversation), source: String(row.source), completion: row.completion == null ? null : String(row.completion) }))
    })
  }
  conversationSearchTarget(target: ConversationSearchSqlTarget): Promise<ConversationSearchSqlRow | null> {
    return this.enqueue(async () => {
      const result = await this.client.execute(conversationSearchTargetSql(target)), row = result.rows[0]
      return row ? { id: String(row.id), kind: String(row.kind), time: String(row.time), conversation: String(row.conversation), source: String(row.source), completion: row.completion == null ? null : String(row.completion) } : null
    })
  }
  conversationMessageRows(query: Pick<ConversationMessagePageQuery, 'conversationId' | 'before' | 'after'> & { limit: number }): Promise<ConversationMessageSqlRow[]> {
    return this.enqueue(async () => {
      const result = await this.client.execute(conversationMessagesSql(query))
      return result.rows.map(row => ({ source: String(row.source), completion: row.completion == null ? null : String(row.completion) }))
    })
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
          firstUnreadCompletion: async query => {
            const result = await transaction.execute(firstUnreadCompletionSql(query))
            return result.rows.length ? JSON.parse(String(result.rows[0].completion)) as ConversationCompletion : undefined
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

/*
 * [INPUT]: 本地 SQLite 连接与产品记录。
 * [OUTPUT]: 提交后确认的读写、备份与读检查写一体化事务。
 * [POS]: 产品持久化边界；事务回调不得再调用外层存储方法。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createClient, type Client } from '@libsql/client'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface StoredRecord { collection: string; id: string; value: unknown }
export interface RecordTransaction {
  get<T>(collection: string, id: string): Promise<T | undefined>
  list<T>(collection: string): Promise<T[]>
  put(record: StoredRecord): Promise<void>
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
  async load<T>(collection: string): Promise<T[]> {
    await this.tail
    const result = await this.client.execute({ sql: 'SELECT value FROM records WHERE collection = ? ORDER BY rowid', args: [collection] })
    return result.rows.map(row => JSON.parse(String(row.value)) as T)
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
      const transaction = await this.client.transaction('write')
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
        })
        await transaction.commit()
        return result
      } catch (error) {
        if (!transaction.closed) await transaction.rollback()
        throw error
      } finally { transaction.close() }
    })
  }
  backup(destination: string): Promise<void> {
    return this.enqueue(async () => {
      await this.client.execute({ sql: 'VACUUM INTO ?', args: [destination] })
    })
  }
  async close() { await this.tail; this.client.close() }
}

import { createClient, type Client } from '@libsql/client'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface StoredRecord { collection: string; id: string; value: unknown }

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
  backup(destination: string): Promise<void> {
    return this.enqueue(async () => {
      await this.client.execute({ sql: 'VACUUM INTO ?', args: [destination] })
    })
  }
  async close() { await this.tail; this.client.close() }
}

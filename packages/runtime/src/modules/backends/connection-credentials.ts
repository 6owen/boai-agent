/*
 * [INPUT]: 序列化的连接配置变更、私有凭据存储和 SQLite。
 * [OUTPUT]: 配置和生效凭据引用共同提交；中断后按账本回收未生效或退役的凭据。
 * [POS]: 模型连接的私有持久化边界，旧记录沿用连接 ID 查询。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import type { Connection } from '@boai/shared/domain'
import type { SecretStore } from '../../contracts'
import type { ProductStore, StoredRecord } from '../../adapters/storage/product-store'
import { GATEWAY_CATALOG_COLLECTION } from '../../adapters/mastra/gateway-catalog-store'

const refs = 'connectionCredentialRefs'
const pending = 'connectionCredentialCleanup'
const retired = (id: string) => ({ collection: pending, id, value: { id } })
interface Reference { id: string; key: string | null }

export class ConnectionCredentials {
  private readonly keys = new Map<string, string | null>()
  constructor(private readonly store: ProductStore, private readonly secrets: SecretStore) {}

  async init() {
    for (const row of await this.store.load<Reference>(refs)) this.keys.set(row.id, row.key)
    for (const row of await this.store.load<{ id: string }>(pending)) await this.cleanup(row.id)
  }
  key(id: string) {
    const key = this.keys.get(id)
    return key === undefined ? id : key
  }
  install(id: string, key: string | null) { this.keys.set(id, key) }
  get(id: string) {
    const key = this.key(id)
    return key === null ? Promise.resolve(undefined) : this.secrets.get(key)
  }
  async has(id: string) {
    const key = this.key(id)
    return key !== null && (this.secrets.has ? this.secrets.has(key) : !!await this.secrets.get(key))
  }

  // Eligibility is recorded in the same database batch that retires a live key
  // or before a fresh key is staged. On success the fresh key's marker disappears.
  private async cleanup(key: string) {
    try {
      if (!await this.store.get(pending, key)) return
      if (this.secrets.retire) await this.secrets.retire(key)
      else await this.secrets.delete(key)
      await this.store.write([], [{ collection: pending, id: key }])
    } catch { /* Keep the durable marker until the original vault is available. */ }
  }

  async save(connection: Connection, existing: boolean, value: string | undefined, stage?: (key: string) => Promise<void>) {
    const id = connection.id
    const oldKey = existing ? this.key(id) : null
    let key = oldKey
    const writes: StoredRecord[] = []
    const removals = [{ collection: GATEWAY_CATALOG_COLLECTION, id }]
    if (value) {
      // A newly generated connection ID has never been visible. Edits always get a fresh slot.
      key = existing ? 'connection-key-' + randomUUID() : id
      await this.store.write([retired(key)])
      removals.push({ collection: pending, id: key })
    } else if (value === '') key = null
    try {
      if (value && key) {
        if (stage) await stage(key)
        else await this.secrets.set(key, value, oldKey ?? undefined)
      }
      connection.hasApiKey = value === undefined ? existing && await this.has(id) : !!value
      if (oldKey && oldKey !== key) writes.push(retired(oldKey))
      writes.push({ collection: 'connections', id, value: connection }, { collection: refs, id, value: { id, key } })
      try {
        await this.store.write(writes, removals)
      } catch (error) {
        // Each save has a unique revision under the runtime's mutation queue.
        // An acknowledged read of that revision proves the entire SQLite batch committed.
        const saved = await this.store.get<Connection>('connections', id)
        if (saved?.revision !== connection.revision) throw error
      }
    } catch (error) {
      if (value && key) await this.cleanup(key)
      throw error
    }
    return { key, retired: oldKey !== key ? oldKey : null }
  }

  async remove(id: string, updates: StoredRecord[]) {
    const key = this.key(id)
    try {
      await this.store.write(key ? [...updates, retired(key)] : updates, [
        { collection: 'connections', id }, { collection: refs, id }, { collection: GATEWAY_CATALOG_COLLECTION, id },
      ])
    } catch (error) {
      if (await this.store.get('connections', id)) throw error
    }
    this.keys.delete(id)
    return key
  }

  async cleanRetired(key: string | null) { if (key) await this.cleanup(key) }
}

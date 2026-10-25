/*
 * [INPUT]: 已保存连接的来源/revision、服务声明目录和原 SQLite 存储。
 * [OUTPUT]: 独立持久目录快照；过期/乱序刷新不能覆盖新来源，不改变连接或员工版本。
 * [POS]: 网关目录元信息缓存，不是能力认证或运行配置权威。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import type { Connection } from '@boai/shared/domain'
import { gatewayRoot, type ModelCatalog } from '@boai/shared/domain/model-gateway'
import type { ProductStore } from '../storage/product-store'

interface CatalogRecord { id: string; source: string; catalog: ModelCatalog }
interface CatalogTicket { id: string; source: string; sequence: number }
export const GATEWAY_CATALOG_COLLECTION = 'modelCatalogs'
const collection = GATEWAY_CATALOG_COLLECTION
export function gatewayCatalogSource(connection: Pick<Connection, 'baseUrl' | 'gateway' | 'revision'>): string {
  return JSON.stringify([gatewayRoot(connection.baseUrl).href, connection.gateway?.kind, connection.gateway?.protocol, connection.gateway?.auth, connection.revision ?? 1])
}
export class GatewayCatalogStore {
  private records = new Map<string, CatalogRecord>()
  private sequences = new Map<string, number>()
  constructor(private readonly store: ProductStore) {}
  async init() { this.records = new Map((await this.store.load<CatalogRecord>(collection)).map(value => [value.id, value])) }
  get(connection: Connection): ModelCatalog | undefined {
    if (!connection.gateway) return undefined
    const value = this.records.get(connection.id)
    return value?.source === gatewayCatalogSource(connection) ? structuredClone(value.catalog) : undefined
  }
  forget(id: string) { this.records.delete(id); this.sequences.set(id, (this.sequences.get(id) ?? 0) + 1) }
  begin(connection: Connection): CatalogTicket {
    const sequence = (this.sequences.get(connection.id) ?? 0) + 1
    this.sequences.set(connection.id, sequence)
    return { id: connection.id, source: gatewayCatalogSource(connection), sequence }
  }
  /** Called in the host's serialized queue, after re-reading the current connection. */
  async commit(ticket: CatalogTicket, connection: Connection | undefined, catalog: ModelCatalog): Promise<boolean> {
    if (!connection?.gateway || connection.id !== ticket.id || ticket.source !== gatewayCatalogSource(connection) || ticket.sequence !== this.sequences.get(ticket.id)) return false
    const value: CatalogRecord = { id: ticket.id, source: ticket.source, catalog: structuredClone(catalog) }
    await this.store.write([{ collection, id: value.id, value }]); this.records.set(value.id, value)
    return true
  }
}

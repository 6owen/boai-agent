/*
 * [INPUT]: Validated OS import deliveries, product SQLite transactions and explicit confirmation identities.
 * [OUTPUT]: Persistent bounded drafts, source conflicts and atomic connection/receipt commits without model calls.
 * [POS]: Model gateway import repository; the host installs committed connections and cancels affected runs.
 * [PROTOCOL]: Update Header and backends/.folder.md when changing import or receipt semantics.
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Connection } from '../../../shared/domain'
import { GATEWAY_IMPORT_LIMIT, parseGatewayImport, sameGatewayImportSource, type GatewayImportConfirmation, type GatewayImportDraft, type GatewayImportReceipt, type GatewayImportView } from '../../../shared/domain/gateway-import'
import type { ProductStore } from '../../adapters/storage/product-store'
import { GATEWAY_CATALOG_COLLECTION } from '../../adapters/mastra/gateway-catalog-store'

const DRAFTS = 'gatewayImportDrafts', PAYLOADS = 'gatewayImportPayloads', DELIVERIES = 'gatewayImportDeliveries', RECEIPTS = 'gatewayImportReceipts'
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const id = z.string().uuid()
const confirmationSchema = z.object({ draftId: id, requestId: id, target: z.object({ id: z.string().min(1).max(200), revision: z.number().int().positive() }).strict().optional() }).strict()
interface StoredReceipt { inputHash: string; receipt: GatewayImportReceipt }

export class GatewayImports {
  constructor(private store: ProductStore) {}
  async receive(input: unknown): Promise<GatewayImportDraft> {
    const { eventId, url } = z.object({ eventId: id, url: z.string().max(8192) }).strict().parse(input)
    const payload = parseGatewayImport(url), payloadId = hash(payload)
    return this.store.transaction(async tx => {
      const delivery = await tx.get<{ draftId: string; payloadId: string }>(DELIVERIES, eventId)
      if (delivery) {
        if (delivery.payloadId !== payloadId) throw new Error('导入事件身份已被使用')
        const draft = await tx.get<GatewayImportDraft>(DRAFTS, delivery.draftId)
        if (!draft) throw new Error('原导入回执已不可用，请核对连接')
        return draft
      }
      const previous = await tx.get<{ draftId: string }>(PAYLOADS, payloadId)
      let draft = previous && await tx.get<GatewayImportDraft>(DRAFTS, previous.draftId)
      if (draft?.status === 'committed') {
        const current = draft.receipt && await tx.get<Connection>('connections', draft.receipt.connection.id)
        if (!current || hash(current) !== hash(draft.receipt!.connection)) draft = undefined
      } else if (draft?.status !== 'pending') draft = undefined
      if (!draft) {
        if ((await tx.list<GatewayImportDraft>(DRAFTS, { status: 'pending' })).length >= GATEWAY_IMPORT_LIMIT) throw new Error('待确认的模型导入过多，请先处理已有导入')
        draft = { id: randomUUID(), payload, status: 'pending', createdAt: new Date().toISOString() }
        await tx.put({ collection: DRAFTS, id: draft.id, value: draft })
        await tx.put({ collection: PAYLOADS, id: payloadId, value: { draftId: draft.id } })
      }
      await tx.put({ collection: DELIVERIES, id: eventId, value: { draftId: draft.id, payloadId } })
      return draft
    })
  }
  list(): Promise<GatewayImportView[]> {
    return this.store.transaction(async tx => {
      const drafts = await tx.list<GatewayImportDraft>(DRAFTS, { status: 'pending' })
      const connections = await tx.list<Connection>('connections')
      return drafts.slice(0, GATEWAY_IMPORT_LIMIT).map(draft => ({ draft, matches: connections.filter(connection => sameGatewayImportSource(connection, draft.payload)) }))
    })
  }
  receipt(requestId: string) { return this.store.get<StoredReceipt>(RECEIPTS, id.parse(requestId)).then(record => record?.receipt ?? null) }
  async cancel(draftId: string) {
    id.parse(draftId)
    return this.store.transaction(async tx => {
      const draft = await tx.get<GatewayImportDraft>(DRAFTS, draftId)
      if (!draft) throw new Error('导入草稿已不可用')
      if (draft.status === 'committed') throw new Error('连接已保存，请在模型连接中管理')
      if (draft.status === 'pending') await tx.put({ collection: DRAFTS, id: draft.id, value: { ...draft, status: 'cancelled' } })
    })
  }
  async confirm(input: GatewayImportConfirmation): Promise<GatewayImportReceipt> {
    const value = confirmationSchema.parse(input), inputHash = hash(value)
    return this.store.transaction(async tx => {
      const existing = await tx.get<StoredReceipt>(RECEIPTS, value.requestId)
      if (existing) {
        if (existing.inputHash !== inputHash) throw new Error('原保存请求内容不一致，请核对原回执')
        return existing.receipt
      }
      const draft = await tx.get<GatewayImportDraft>(DRAFTS, value.draftId)
      if (!draft || draft.status !== 'pending') throw new Error('该导入已处理，请核对原保存回执')
      const payload = draft.payload
      const previous = value.target && await tx.get<Connection>('connections', value.target.id)
      if (value.target && (!previous || (previous.revision ?? 1) !== value.target.revision)) throw new Error('连接已变化，请重新核对后确认')
      if (previous && (!sameGatewayImportSource(previous, payload) || previous.gateway?.auth !== 'local')) throw new Error('只能更新同一本机Magpie来源，请选择新增连接')
      const unchanged = previous && previous.name === payload.name && previous.defaultModel === payload.modelId && previous.gateway?.protocol === payload.protocol
      const connection: Connection = unchanged ? previous : {
        ...(previous ?? {}), id: previous?.id ?? randomUUID(), name: payload.name, provider: payload.protocol === 'messages' ? 'anthropic' : 'openai-compatible',
        baseUrl: payload.baseUrl, defaultModel: payload.modelId, hasApiKey: false, revision: (previous?.revision ?? 0) + 1,
        gateway: { kind: 'magpie', auth: 'local', protocol: payload.protocol },
      }
      if (!unchanged) {
        delete connection.api
        if (payload.protocol !== 'messages') connection.api = payload.protocol
        await tx.put({ collection: 'connections', id: connection.id, value: connection })
        await tx.remove(GATEWAY_CATALOG_COLLECTION, connection.id)
      }
      const receipt: GatewayImportReceipt = { draftId: draft.id, requestId: value.requestId, connection, outcome: unchanged ? 'reused' : previous ? 'updated' : 'created', committedAt: new Date().toISOString() }
      await tx.put({ collection: RECEIPTS, id: value.requestId, value: { inputHash, receipt } satisfies StoredReceipt })
      await tx.put({ collection: DRAFTS, id: draft.id, value: { ...draft, status: 'committed', receipt } })
      return receipt
    })
  }
}

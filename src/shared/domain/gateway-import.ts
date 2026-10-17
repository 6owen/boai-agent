/*
 * [INPUT]: Untrusted versioned boai://provider/import URLs and explicit desktop confirmation.
 * [OUTPUT]: Bounded, credential-free Magpie drafts and durable confirmation receipt contracts.
 * [POS]: Shared import format; parsing never reads files, contacts a service or saves a connection.
 * [PROTOCOL]: Update Header and domain/.folder.md when changing the versioned format.
 */
import { z } from 'zod'
import type { Connection } from './index'
import { gatewayRoot, isLoopbackGateway, MAGPIE_APP_KEY, type ModelProtocol } from './model-gateway'
import { MODEL_ID_MAX_LENGTH, validModelId } from './model-id'

export const GATEWAY_IMPORT_LIMIT = 8
export interface GatewayImportPayload { version: 1; kind: 'magpie'; name: string; baseUrl: string; protocol: ModelProtocol; modelId: string }
export interface GatewayImportDraft { id: string; payload: GatewayImportPayload; status: 'pending' | 'cancelled' | 'committed'; createdAt: string; receipt?: GatewayImportReceipt }
export interface GatewayImportView { draft: GatewayImportDraft; matches: Connection[] }
export interface GatewayImportConfirmation { draftId: string; requestId: string; target?: { id: string; revision: number } }
export interface GatewayImportReceipt { draftId: string; requestId: string; connection: Connection; outcome: 'created' | 'updated' | 'reused'; committedAt: string }

const paramsSchema = z.object({
  version: z.literal('1'), provider: z.literal('magpie'),
  name: z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value)).default('Magpie'),
  baseUrl: z.string().min(1).max(2000), protocol: z.enum(['chat', 'responses', 'messages']),
  model: z.string().min(1).max(MODEL_ID_MAX_LENGTH).refine(validModelId),
  key: z.literal(MAGPIE_APP_KEY).optional(),
}).strict()

export function parseGatewayImport(raw: string): GatewayImportPayload {
  try {
    if (typeof raw !== 'string' || raw.length > 8192 || /[\u0000-\u0020\u007f]/.test(raw) || /%(?![0-9a-f]{2})/i.test(raw)) throw new Error()
    const url = new URL(raw)
    if (url.protocol !== 'boai:' || url.hostname !== 'provider' || url.pathname !== '/import' || url.port || url.username || url.password || url.hash) throw new Error()
    const entries = [...url.searchParams.entries()]
    if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error()
    const value = paramsSchema.parse(Object.fromEntries(entries))
    const baseUrl = gatewayRoot(value.baseUrl).href.replace(/\/$/, '')
    if (!isLoopbackGateway(baseUrl)) throw new Error()
    return { version: 1, kind: 'magpie', name: value.name, baseUrl, protocol: value.protocol, modelId: value.model }
  } catch { throw new Error('无法导入：链接版本、字段或本机网关地址无效。请在模型连接中手动添加。') }
}

export function gatewayImportUrl(payload: GatewayImportPayload): string {
  return `boai://provider/import?${new URLSearchParams({ version: '1', provider: 'magpie', name: payload.name, baseUrl: payload.baseUrl, protocol: payload.protocol, model: payload.modelId })}`
}

export function sameGatewayImportSource(connection: Connection, payload: GatewayImportPayload): boolean {
  try { return connection.gateway?.kind === 'magpie' && gatewayRoot(connection.baseUrl).href === gatewayRoot(payload.baseUrl).href } catch { return false }
}

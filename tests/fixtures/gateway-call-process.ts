/*
 * [INPUT]: An isolated product directory and the production AppService.
 * [OUTPUT]: Persists real in-flight standalone calls, then signals the parent to SIGKILL this process.
 * [POS]: Gateway recovery fixture; the engine is offline and never contacts Magpie or a supplier.
 * [PROTOCOL]: Update Header and fixtures/.folder.md when changing this fixture.
 */
import { AppService } from '../../src/runtime/service'
import type { Connection } from '../../src/shared/domain'
import type { GatewayModelCall } from '../../src/shared/domain/model-gateway'

const [dataPath] = process.argv.slice(2)
let block = false
const pending: string[] = []
process.on('message', () => {}) // Keep the IPC channel alive until the parent kills us.
async function hold(id: string, observe: ((id: string, route: { routeSource: 'response-headers'; actualModelId: string; actualProvider: string; observedAt: string }) => Promise<void>) | undefined) {
  await observe?.(id, { routeSource: 'response-headers', actualModelId: 'vendor/observed', actualProvider: 'vendor', observedAt: new Date().toISOString() })
  pending.push(id)
  if (pending.length === 2) process.send?.({ connectionId: connection.id, completedId: completed.modelCall.callId, pending })
  return new Promise<never>(() => {})
}
const service = new AppService({ dataPath, engine: {
  run: async () => { throw new Error('No business run expected') },
  test: async (_connection, _key, observation) => block ? hold(observation!.modelCallId!, observation?.onModelCallRoute) : 'OK',
  draftAutomation: async context => hold(context.modelCallId!, context.onModelCallRoute),
}, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
await service.init()
const connection = await service.handle('saveConnection', { name: 'isolated gateway', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'group/work', gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
const completed = await service.handle('testConnection', { id: connection.id }) as { modelCall: GatewayModelCall }
block = true
await Promise.all([
  service.handle('testConnection', { id: connection.id }),
  service.handle('generateAutomationDraft', { connectionId: connection.id, draftId: 'crash-draft', version: 1, requestId: 'crash-draft-call', instruction: '每天整理资料', timezone: 'Asia/Singapore' }),
])

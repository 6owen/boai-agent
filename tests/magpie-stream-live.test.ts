/*
 * [INPUT]: Explicit bounded opt-in, installed Magpie, production AppService and an isolated terminal-dropping proxy.
 * [OUTPUT]: Real three-protocol HTTP EOF is rejected/persisted once, with original route and two reopenings without replay.
 * [POS]: Actual gateway transport-fault acceptance; does not stop Magpie or modify personal configuration.
 * [PROTOCOL]: Update Header, tests/.folder.md and Magpie ledger for every actual batch, including failures.
 */
import { workspaceInputFiles } from './support/workspace-inputs'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { probeMagpie } from '../packages/runtime/src/adapters/mastra/model-catalog'
import type { Connection } from '../packages/shared/src/domain'

const enabled = process.env.BOAI_MAGPIE_STREAM_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const evidence = resolve('.local/magpie-20261017', `stream-${batch}`), origin = 'http://127.0.0.1:3425', model = 'group/auto-gpt-6-luna'
let version = '', inferenceRequests = 0, sourceBefore: Record<string, string>
async function sources() {
  const files = (await workspaceInputFiles()).filter(file => /\.(ts|tsx|json)$/.test(file))
  files.push('package.json', 'pnpm-lock.yaml', 'tests/magpie-stream-live.test.ts')
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])))
}
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('Fresh batch is required')
  await mkdir(evidence); version = (await probeMagpie(origin)).version; sourceBefore = await sources()
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, version, model, maxInferenceRequests: 3, maxPerProtocol: 1, sourceBefore, fault: 'Forward actual content, drop model terminal frames after observing them, and end HTTP normally', scope: 'production saved-connection test and SQLite; no Magpie crash, routing failover, employee task or desktop certification' }, null, 2))
})
afterAll(async () => { if (enabled && version) await writeFile(join(evidence, 'source-after.json'), JSON.stringify({ sourceAfter: await sources(), inferenceRequests }, null, 2)) })
test.skipIf(!enabled).each(['chat', 'responses', 'messages'] as const)('real Magpie %s missing terminal is a durable failure and is never replayed', async protocol => {
  const directory = join(evidence, protocol); await mkdir(directory)
  const path = protocol === 'chat' ? '/v1/chat/completions' : protocol === 'responses' ? '/v1/responses' : '/v1/messages'
  const metadata: { status?: number; actualModel?: string | null; actualProvider?: string | null; requestCount: number; upstreamEnded: boolean; normalCompletion: boolean; textFrames: number; removed: number; frames: { type: string; removed: boolean; completion?: string; hash: string }[]; proxyError?: string } = { requestCount: 0, upstreamEnded: false, normalCompletion: false, textFrames: 0, removed: 0, frames: [] }
  const controllers = new Set<AbortController>()
  const tasks = new Set<Promise<void>>()
  const server = createServer((request, response) => {
    const task = (async () => {
      if (request.method !== 'POST' || request.url !== path || ++metadata.requestCount > 1 || inferenceRequests >= 3) { response.writeHead(429); response.end('Out of predeclared experiment scope'); return }
      let body = ''; for await (const part of request) body += part
      const parsed = JSON.parse(body); if (parsed.model !== model || parsed.tools?.length) throw Error('Unexpected model or tools')
      const controller = new AbortController(); controllers.add(controller)
      response.once('close', () => { if (!metadata.upstreamEnded) controller.abort() })
      try {
        inferenceRequests++
        const upstream = await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer magpie-boai', 'x-api-key': 'magpie-boai', 'anthropic-version': '2023-06-01', 'user-agent': 'BOAI/Magpie-acceptance' }, body, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) })
        metadata.status = upstream.status; metadata.actualModel = upstream.headers.get('x-magpie-model'); metadata.actualProvider = upstream.headers.get('x-magpie-provider')
        if (!upstream.ok || !upstream.body) throw Error(`Gateway HTTP ${upstream.status}`)
        response.writeHead(200, { 'content-type': 'text/event-stream', 'x-magpie-model': metadata.actualModel ?? '', 'x-magpie-provider': metadata.actualProvider ?? '' })
        const decoder = new TextDecoder(); let buffer = ''
        const frame = (raw: string) => {
          const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
          if (!data) { response.write(raw + '\n\n'); return }
          const value = data === '[DONE]' ? undefined : JSON.parse(data)
          const removed = data === '[DONE]' || (protocol === 'chat' && value?.choices?.some((choice: { finish_reason?: string | null }) => choice.finish_reason != null)) || (protocol === 'responses' && value?.type === 'response.completed') || (protocol === 'messages' && (value?.type === 'message_stop' || (value?.type === 'message_delta' && value.delta?.stop_reason)))
          const completion = protocol === 'chat' ? value?.choices?.[0]?.finish_reason : protocol === 'messages' ? value?.delta?.stop_reason : value?.type === 'response.completed' ? value.response?.status : undefined
          if (completion === 'stop' || completion === 'end_turn' || completion === 'completed') metadata.normalCompletion = true
          metadata.frames.push({ type: value?.type ?? value?.object ?? 'done', removed: Boolean(removed), ...(completion ? { completion } : {}), hash: createHash('sha256').update(raw).digest('hex') })
          if (removed) metadata.removed++
          else {
            if (value?.choices?.some((choice: { delta?: { content?: string } }) => choice.delta?.content) || value?.type === 'response.output_text.delta' || value?.delta?.type === 'text_delta') metadata.textFrames++
            response.write(raw + '\n\n')
          }
        }
        for await (const chunk of upstream.body) {
          buffer += decoder.decode(chunk, { stream: true })
          let separator: RegExpExecArray | null
          while ((separator = /\r?\n\r?\n/.exec(buffer))) { frame(buffer.slice(0, separator.index)); buffer = buffer.slice(separator.index + separator[0].length) }
        }
        buffer += decoder.decode(); if (buffer.trim()) frame(buffer)
        metadata.upstreamEnded = true; response.end()
      } finally { controllers.delete(controller) }
    })().catch(error => { metadata.proxyError = String(error); response.destroy(error instanceof Error ? error : undefined) })
    tasks.add(task); void task.finally(() => tasks.delete(task))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const create = () => new AppService({ dataPath: join(directory, 'data'), engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => { throw Error('No private credential expected') }, delete: async () => {} }, emit: () => {} })
  const read = async () => { const store = await ProductStore.openReadOnly(join(directory, 'data/boai.sqlite')); try { return await store.load('connectionTestCalls') } finally { await store.close() } }
  let service = create(), failure: string | undefined, records: unknown, errorText = ''
  try {
    await service.init()
    const connection = await service.handle('saveConnection', { name: `Magpie real ${protocol} EOF`, provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, defaultModel: model, gateway: { kind: 'magpie', auth: 'local', protocol } }) as Connection
    try { await service.handle('testConnection', { id: connection.id }) } catch (error) { errorText = error instanceof Error ? error.message : String(error) }
    expect(errorText).toContain('未确认正常完成'); expect(metadata.proxyError).toBeUndefined(); expect(metadata.upstreamEnded).toBe(true); expect(metadata.normalCompletion).toBe(true)
    expect(metadata.requestCount).toBe(1); expect(metadata.status).toBe(200); expect(metadata.removed).toBeGreaterThan(0); expect(metadata.textFrames).toBeGreaterThan(0)
    records = await read(); expect(records).toEqual([expect.objectContaining({ status: 'failed', finishedAt: expect.any(String), modelCall: expect.objectContaining({ protocol, selectedModelId: model, route: expect.objectContaining({ actualModelId: metadata.actualModel, actualProvider: metadata.actualProvider, routeSource: 'response-headers' }) }) })])
    for (let index = 0; index < 2; index++) { await service.close(); service = create(); await service.init(); await new Promise(done => setTimeout(done, 100)); expect(await read()).toEqual(records); expect(metadata.requestCount).toBe(1) }
    expect(await sources()).toEqual(sourceBefore)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await service.close(); for (const controller of controllers) controller.abort(); await Promise.all(tasks); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()))
    await writeFile(join(directory, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, version, protocol, metadata, records, errorText }, null, 2))
  }
}, 75000)

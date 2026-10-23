/*
 * [INPUT]: Explicit installed-Magpie opt-in, proven OS isolation, controlled Chat-only upstream, fixed public catalog excerpt and original PNG.
 * [OUTPUT]: Three incoming protocols preserve image bytes and explicit none versus omitted auto across actual gateway conversion.
 * [POS]: Installed gateway protocol contract, synthetic supplier only; not model vision or internal reasoning certification.
 * [PROTOCOL]: Update Header, tests/.folder.md and actual batch ledger, retaining any conversion differences or failures.
 */
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { ModelProtocol } from '../src/shared/domain/model-gateway'
import { isolatedMagpie } from './fixtures/magpie-isolated'
import { gatewayVisionImage } from './fixtures/gateway-vision-image'
import { streamText } from './fixtures/gateway-stream'

const enabled = process.env.BOAI_MAGPIE_MATERIAL_CONVERSION_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const evidence = resolve('.local/magpie-20261017', `material-conversion-${batch}`)
const png = gatewayVisionImage(), sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
// Public upstream testdata/models.dev-2026-10-09.json at ec64543952a67d12193828492ab30e323a54a2ca.
// Full source SHA256: 8438521827448b7eca6b4bea2ae3999813bc2d5067a51040bd6fdb49191e376a.
// Only this known model is copied into the owned cache; personal catalog/config remains unread.
const catalogExcerpt = { deepseek: { name: 'DeepSeek', models: { 'deepseek-flash': { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', modalities: { input: ['text', 'image'], output: ['text'] }, reasoning_options: [{ type: 'toggle' }, { type: 'effort', values: ['low', 'high', 'max'] }] } } } }
const model = 'fixture/deepseek-flash', cases = (['chat', 'responses', 'messages'] as const).flatMap(protocol => ['none', 'auto'].map(effort => ({ protocol, effort })))
type Upstream = { caseId: string; path: string; model: string; reasoning?: unknown; thinking?: unknown; enableThinking?: unknown; imageHashes: string[]; closed: boolean }
const upstreamRows: Upstream[] = [], results: unknown[] = [], tasks = new Set<Promise<void>>()
let server: Server | undefined, gateway: Awaited<ReturnType<typeof isolatedMagpie>> | undefined, current = '', initialized = false
function images(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('data:image/png;base64,') ? [sha(Buffer.from(value.slice(22), 'base64'))] : []
  return value && typeof value === 'object' ? Object.values(value).flatMap(images) : []
}
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('Fresh explicit batch required')
  await mkdir(evidence); initialized = true
  const sources = ['tests/magpie-material-conversion-live.test.ts', 'tests/fixtures/magpie-isolated.ts', 'tests/fixtures/gateway-stream.ts', 'tests/fixtures/gateway-vision-image.ts']
  const sourceBefore = Object.fromEntries(await Promise.all(sources.map(async name => [name, sha(await readFile(name))])))
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, cases, sourceBefore, gatewayRequestCap: 6, upstreamRequestCap: 6, model, imageHash: sha(png), catalogExcerpt, scope: 'Installed Magpie with one Chat-only synthetic provider, no personal configuration or real supplier inference' }, null, 2))
  server = createServer((request, response) => {
    const task = (async () => {
      if (request.method === 'GET') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-flash', object: 'model', owned_by: 'fixture' }] })); return }
      let raw = ''; for await (const part of request) raw += part
      const body = JSON.parse(raw), row: Upstream = { caseId: current, path: request.url!, model: body.model, reasoning: body.reasoning_effort, thinking: body.thinking, enableThinking: body.enable_thinking, imageHashes: images(body), closed: false }
      upstreamRows.push(row); response.once('close', () => { row.closed = true })
      if (upstreamRows.length > 6) throw Error('Unexpected gateway retry exceeds frozen upstream cap')
      if (request.url !== '/v1/chat/completions') throw Error('Provider only implements Chat')
      streamText(response, 'chat', 'CONVERSION_OK', 'complete', {})
    })().catch(error => { response.destroy(error) })
    tasks.add(task); void task.finally(() => tasks.delete(task))
  })
  await new Promise<void>(done => server!.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  gateway = await isolatedMagpie(evidence, port)
  const catalogDirectory = join(evidence, 'magpie', 'cache', 'magpie')
  await mkdir(catalogDirectory, { recursive: true })
  await writeFile(join(catalogDirectory, 'models.json'), JSON.stringify(catalogExcerpt))
  await gateway.command(['provider', 'add', 'deepseek', 'id=fixture', `url=http://127.0.0.1:${port}/v1`, 'responses=', 'anthropic=', 'key=SYNTHETIC_NOT_A_SECRET', 'models=deepseek-flash', 'catalog=deepseek'])
  await gateway.start()
  const catalog = await fetch(gateway.origin + '/v1/models', { headers: { authorization: 'Bearer magpie-boai' } }).then(response => response.json())
  await writeFile(join(evidence, 'catalog.json'), JSON.stringify(catalog, null, 2))
  const selected = catalog.data.find((item: { id: string }) => item.id === model)
  expect(selected?.supported_reasoning_levels?.map((item: { effort: string }) => item.effort)).toContain('none')
  expect(selected?.native_endpoints).toEqual(['/v1/chat/completions'])
}, 90000)
afterAll(async () => {
  if (!initialized) return
  await gateway?.close()
  if (server) { server.closeAllConnections(); await new Promise<void>(done => server!.close(() => done())) }
  await Promise.all([...tasks])
  const plan = JSON.parse(await readFile(join(evidence, 'plan.json'), 'utf8'))
  const changed = (await Promise.all(Object.entries(plan.sourceBefore as Record<string, string>).map(async ([name, hash]) => sha(await readFile(name)) === hash ? undefined : name))).filter(Boolean)
  await writeFile(join(evidence, 'closed.json'), JSON.stringify({ results, upstreamRows, sourceChanges: changed, activeTasks: tasks.size, gatewayProcesses: gateway?.processes, closedAt: new Date().toISOString() }, null, 2))
  expect(changed).toEqual([]); expect(tasks.size).toBe(0); expect(upstreamRows.every(row => row.closed)).toBe(true)
})
function body(protocol: ModelProtocol, effort: string) {
  const base = { model, stream: true }
  if (protocol === 'chat') return { ...base, messages: [{ role: 'user', content: [{ type: 'text', text: 'Read this image.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }] }], ...(effort === 'none' ? { reasoning_effort: 'none' } : {}) }
  if (protocol === 'responses') return { ...base, input: [{ role: 'user', content: [{ type: 'input_text', text: 'Read this image.' }, { type: 'input_image', image_url: `data:image/png;base64,${png.toString('base64')}` }] }], ...(effort === 'none' ? { reasoning: { effort: 'none' } } : {}) }
  return { ...base, max_tokens: 100, messages: [{ role: 'user', content: [{ type: 'text', text: 'Read this image.' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } }] }], ...(effort === 'none' ? { thinking: { type: 'disabled' } } : {}) }
}
test.skipIf(!enabled).each(cases)('installed gateway converts $protocol/$effort to a Chat-only supplier without losing image or intent', async ({ protocol, effort }) => {
  current = `${protocol}-${effort}`
  const before = upstreamRows.length
  let status = 'running', error: string | undefined, responseStatus: number | undefined, responseModel: string | null | undefined, output = ''
  try {
    const response = await fetch(gateway!.origin + `/v1/${protocol === 'chat' ? 'chat/completions' : protocol}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer magpie-boai', 'x-api-key': 'magpie-boai', 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body(protocol, effort)), signal: AbortSignal.timeout(15000) })
    responseStatus = response.status; responseModel = response.headers.get('x-magpie-model'); output = await response.text()
    expect(responseStatus).toBe(200); expect(output).toContain('CONVERSION_OK'); expect(responseModel).toBe(model)
    expect(upstreamRows).toHaveLength(before + 1)
    const row = upstreamRows[before]
    expect(row).toMatchObject({ path: '/v1/chat/completions', model: 'deepseek-flash', imageHashes: [sha(png)], closed: true })
    if (effort === 'none') {
      expect(row.reasoning === 'none' || (row.thinking as { type?: string } | undefined)?.type === 'disabled' || row.enableThinking === false).toBe(true)
      if (row.reasoning !== undefined) expect(row.reasoning).toBe('none')
      if (row.thinking !== undefined) expect(row.thinking).toEqual({ type: 'disabled' })
      if (row.enableThinking !== undefined) expect(row.enableThinking).toBe(false)
    }
    else { expect(row.reasoning).toBeUndefined(); expect(row.thinking).toBeUndefined(); expect(row.enableThinking).toBeUndefined() }
    status = 'passed'
  } catch (failure) { status = 'failed'; error = String(failure); throw failure }
  finally { results.push({ caseId: current, protocol, effort, status, error, responseStatus, responseModel, output, upstream: upstreamRows.slice(before) }) }
}, 20000)

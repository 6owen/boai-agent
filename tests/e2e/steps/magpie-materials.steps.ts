/*
 * [INPUT]: Explicit real-supplier opt-in, isolated Desktop, original PNG and capped transparent local Magpie relay.
 * [OUTPUT]: Actual composer none save, public selectionId preparation, preview close versus missing-original errors, send/model result and restart evidence.
 * [POS]: Current Electron attachment gate; native file-dialog result injection is explicit, no personal application/config changes.
 * [PROTOCOL]: Update Header and steps/.folder.md plus the Magpie ledger for all actual runs and failures.
 */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { nextMaterialDialog } from '../support/materials'
import { gatewayVisionImage } from '../../fixtures/gateway-vision-image'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { ConversationDetail } from '../../../src/shared/domain'

const model = 'deepseek/deepseek-flash', png = gatewayVisionImage()
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const prompt = '看附图，识别左右两个图形。仅返回一个JSON对象，键为left和right；每个值包含color和shape，均用常见英文小写名称。不要解释，不要使用代码围栏，不创建文件。'
const oracle = { left: { color: 'blue', shape: 'circle' }, right: { color: 'red', shape: 'square' } }
type Wire = { stage: string; path: string; model: string; reasoning?: unknown; imageHashes: string[]; status?: number; actualModel?: string | null; actualProvider?: string | null; closed: boolean; error?: string }
type State = { requests: Wire[]; active: Set<AbortController>; conversationId?: string; agentId?: string; dataPath?: string; file?: string; observed?: ConversationDetail; pids: number[] }
export const test = base.extend<{ magpieMaterialState: State }>({ magpieMaterialState: async ({}, use) => use({ requests: [], active: new Set(), pids: [] }) })
const { Given, When, Then } = createBdd(test)
const detail = (runtime: Desktop, id: string) => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
async function captureProcesses(runtime: Desktop, state: State) {
  const metrics = await runtime.app.evaluate(({ app }) => app.getAppMetrics().map(({ pid, type, name }) => ({ pid, type, name })))
  state.pids = [...new Set([...state.pids, ...metrics.map(item => item.pid), runtime.app.process().pid!])]
  await runtime.reviewData('本批Electron及运行服务进程', metrics)
}
async function records(dataPath: string) {
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try { return Object.fromEntries(await Promise.all(['agents', 'connections', 'materials', 'materialPreparations', 'messages', 'messageReceipts', 'runs', 'turns', 'workItems', 'artifacts'].map(async name => [name, await store.load(name)]))) } finally { await store.close() }
}
function imageHashes(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('data:image/png;base64,') ? [sha(Buffer.from(value.slice(22), 'base64'))] : []
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(imageHashes)
}
Given('隔离桌面已连接实际Magpie图片模型', async ({ runtime, magpieMaterialState: state }) => {
  test.skip(process.env.BOAI_MAGPIE_MATERIALS_DESKTOP_REAL !== '1', '需要显式真实模型验收开关')
  test.setTimeout(180000)
  const previewOnly = test.info().tags.includes('@magpie-materials-preview'), cap = previewOnly ? 0 : 6
  test.info().annotations.push({ type: 'model-mode', description: previewOnly ? 'no-inference' : 'real-provider' })
  const hello = await fetch('http://127.0.0.1:3425/api/hello').then(response => response.json())
  expect(hello.name).toBe('magpie')
  const files = (await readdir('src', { recursive: true })).filter(name => /\.(ts|tsx|json)$/.test(name)).map(name => `src/${name}`)
  files.push('package.json', 'pnpm-lock.yaml', 'tests/e2e/steps/magpie-materials.steps.ts', 'tests/e2e/features/magpie-materials.feature', 'tests/fixtures/gateway-vision-image.ts', 'dist/main/main.cjs', 'dist/runtime/worker.mjs')
  const inputs = Object.fromEntries(await Promise.all(files.sort().map(async name => [name, sha(await readFile(name))])))
  await runtime.reviewData('实际图片桌面批次计划', { hello, model, protocol: 'chat', preference: 'none', userMessages: previewOnly ? 0 : 1, maxInferenceRequests: cap, sourceAndBuildInputs: inputs, prompt, oracle, imageHash: sha(png), nativeSelection: 'existing nextMaterialDialog injects one original path; production host issues selectionId', scope: 'source-built Electron; packaged binary only when explicitly selected' })
  const server = createServer((request, response) => { void (async () => {
    const path = request.url!, isPost = request.method === 'POST'
    if (!(isPost && path === '/v1/chat/completions' || request.method === 'GET' && ['/api/hello', '/v1/models'].includes(path))) { response.writeHead(404); response.end(); return }
    let raw = ''; for await (const chunk of request) raw += chunk
    let row: Wire | undefined
    if (isPost) {
      if (state.requests.length >= cap) { response.writeHead(429); response.end('Experiment cap'); return }
      const body = JSON.parse(raw)
      row = { stage: raw.includes('private-participation-v2') ? 'decision' : raw.includes('private-memory-delta-v1') ? 'memory' : 'chat', path, model: body.model, reasoning: body.reasoning_effort, imageHashes: imageHashes(body), closed: false }
      state.requests.push(row)
      if (row.stage === 'chat' && JSON.stringify(row.imageHashes) !== JSON.stringify([sha(png)])) throw Error('Original image missing before forwarding')
      if (body.model !== model || body.reasoning_effort !== 'none') throw Error('Actual model/preference differs from saved selection')
    }
    const controller = new AbortController(); state.active.add(controller)
    response.once('close', () => { if (row) row.closed = true; if (!response.writableEnded) controller.abort() })
    try {
      const upstream = await fetch(`http://127.0.0.1:3425${path}`, { method: request.method, headers: { Authorization: 'Bearer magpie-boai', 'User-Agent': 'BOAI', ...(isPost ? { 'Content-Type': 'application/json' } : {}) }, ...(isPost ? { body: raw } : {}), signal: controller.signal })
      if (row) { row.status = upstream.status; row.actualModel = upstream.headers.get('x-magpie-model'); row.actualProvider = upstream.headers.get('x-magpie-provider') }
      const headers: Record<string, string> = {}
      for (const name of ['content-type', 'x-magpie-model', 'x-magpie-provider']) { const value = upstream.headers.get(name); if (value) headers[name] = value }
      response.writeHead(upstream.status, headers)
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body as never), response)
      else response.end()
    } catch (error) { if (row) row.error = String(error).slice(0, 1000); throw error }
    finally { state.active.delete(controller) }
  })().catch(error => response.destroy(error)) })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); runtime.trackServer(server)
  runtime.defer(async () => {
    for (const controller of state.active) controller.abort()
    await expect.poll(() => state.active.size).toBe(0)
    if (state.dataPath) await runtime.reviewData('关闭后实际材料数据库', await records(state.dataPath))
    const sourceAndBuildUnchanged = (await Promise.all(Object.entries(inputs).map(async ([name, hash]) => sha(await readFile(name)) === hash))).every(Boolean)
    await runtime.reviewData('实际模型请求及关闭', { requests: state.requests, active: state.active.size, pids: state.pids, sourceAndBuildUnchanged })
    expect(sourceAndBuildUnchanged).toBe(true)
    await expect.poll(() => state.pids.filter(pid => { try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error } }), { timeout: 10000 }).toEqual([])
  })
  state.file = join(await realpath(runtime.root), 'input.png'); await writeFile(state.file, png)
  await runtime.reviewFile('原始图片', state.file, { required: true, expectedSha256: sha(png) })
  await runtime.start(); await captureProcesses(runtime, state)
  await runtime.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers.get('boai:request')!
    const preparations: unknown[] = []; Object.assign(globalThis, { __magpieMaterialPreparations: preparations })
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'prepareMaterial') preparations.push(structuredClone(payload.input))
      return original(event, payload)
    })
  })
  const setup = await runtime.page.evaluate(async ({ url, model }) => {
    const connection = await window.boai.request('saveConnection', { name: 'Magpie 图片验收', provider: 'openai-compatible', baseUrl: url, defaultModel: model, gateway: { kind: 'magpie', protocol: 'chat', auth: 'local' } })
    await window.boai.request('getConnectionModelCatalog', { id: connection.id, baseUrl: url, gateway: connection.gateway, expectedRevision: connection.revision })
    const agent = await window.boai.request('saveAgent', { name: 'Magpie 图片员工', role: '图片问答', instructions: '如实查看用户图片并按指定格式回答。', color: '#123456', connectionId: connection.id, modelId: model, thinkingLevel: 'auto', skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
    const conversation = await window.boai.request('createConversation', { kind: 'direct', title: 'Magpie 图片会话', agentIds: [agent.id] })
    return { conversationId: conversation.id, agentId: agent.id, dataPath: (await window.boai.request('snapshot', undefined)).dataPath, title: conversation.title }
  }, { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, model })
  Object.assign(state, setup)
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${setup.title}`) }).click()
  await runtime.page.evaluate(() => {
    const errors: string[] = []; Object.assign(window, { __magpieMaterialErrors: errors })
    new MutationObserver(() => { for (const toast of document.querySelectorAll('[data-sonner-toast][data-type="error"]')) { const value = toast.textContent?.trim(); if (value && !errors.includes(value)) errors.push(value) } }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
})
When('用户选择无思考并从附件菜单添加原图片', async ({ runtime, magpieMaterialState: state }) => {
  await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: /推理强度/ }).hover()
  await runtime.page.getByRole('menuitemradio', { name: '无思考', exact: true }).click()
  await expect.poll(() => runtime.page.evaluate(async id => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === id)?.thinkingLevel, state.agentId!)).toBe('none')
  await runtime.page.keyboard.press('Escape')
  await nextMaterialDialog(runtime, { path: state.file! })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
})
Then('图片准备和预览没有触发模型或业务消息', async ({ runtime, magpieMaterialState: state }) => {
  const prepared = await detail(runtime, state.conversationId!)
  expect(prepared.messages).toEqual([]); expect(prepared.runs).toEqual([]); expect(prepared.workItems).toEqual([]); expect(state.requests).toEqual([])
  const preparations = await runtime.app.evaluate(() => (globalThis as unknown as { __magpieMaterialPreparations: Record<string, unknown>[] }).__magpieMaterialPreparations)
  expect(preparations).toHaveLength(1)
  expect(preparations[0]).toMatchObject({ conversationId: state.conversationId, selectionId: expect.any(String), requestId: expect.any(String) })
  expect(preparations[0]).not.toHaveProperty('path')
  expect(preparations[0]).not.toHaveProperty('authorizedAgentIds')
  await runtime.reviewData('原生选取后的公共材料输入', preparations)
  await runtime.page.getByRole('button', { name: '查看图片 input.png', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '图片预览 input.png', exact: true })
  await expect(dialog.getByRole('img', { name: 'input.png', exact: true })).toBeVisible()
  await expect.poll(() => dialog.getByRole('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(320)
  expect(await runtime.page.evaluate(() => (window as unknown as { __magpieMaterialErrors: string[] }).__magpieMaterialErrors)).toEqual([])
  expect((await detail(runtime, state.conversationId!)).materials?.[0]).toMatchObject({ status: 'ready', contentHash: sha(png) })
  await runtime.reviewNativeCheckpoint('真实原件图片准备与预览')
  await runtime.page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const previewErrors = await runtime.page.evaluate(() => (window as unknown as { __magpieMaterialErrors: string[] }).__magpieMaterialErrors)
  await runtime.reviewData('预览关闭后的错误提示观察', previewErrors)
  expect(previewErrors).toEqual([])
  expect(state.requests).toEqual([])
})
Then('原件缺失时打开预览仍报告真实错误且不调用模型', async ({ runtime, magpieMaterialState: state }) => {
  const prepared = await detail(runtime, state.conversationId!), material = prepared.materials![0]
  const original = join(state.dataPath!, 'materials', material.conversationId, material.id, 'original'), held = `${original}.held`
  expect(material).toMatchObject({ status: 'ready', contentHash: sha(png) })
  expect(await runtime.page.evaluate(() => (window as unknown as { __magpieMaterialErrors: string[] }).__magpieMaterialErrors)).toEqual([])
  await rename(original, held)
  try {
    await runtime.page.getByRole('button', { name: '查看图片 input.png', exact: true }).click()
    const dialog = runtime.page.getByRole('dialog', { name: '图片预览 input.png', exact: true })
    await expect(dialog).toBeVisible()
    await expect.poll(() => runtime.page.evaluate(() => (window as unknown as { __magpieMaterialErrors: string[] }).__magpieMaterialErrors)).toContain('材料文件不存在或已被移走')
    const toast = runtime.page.locator('[data-sonner-toast][data-type="error"]', { hasText: /^材料文件不存在或已被移走$/ })
    expect(await runtime.page.evaluate(() => (window as unknown as { __magpieMaterialErrors: string[] }).__magpieMaterialErrors)).toEqual(['材料文件不存在或已被移走'])
    await expect(toast).toBeVisible()
    await expect(runtime.page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(1)
    await expect.poll(() => toast.evaluate(element => {
      const rect = element.getBoundingClientRect(), top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return !!top && element.contains(top)
    })).toBe(true)
    await expect(dialog.getByRole('img')).toHaveCount(0)
    await runtime.reviewData('真实缺件的预览错误', { errors: await runtime.page.evaluate(() => (window as unknown as { __magpieMaterialErrors: string[] }).__magpieMaterialErrors), detail: await detail(runtime, state.conversationId!) })
    await runtime.reviewNativeCheckpoint('打开预览时真实原件缺失')
    expect(state.requests).toEqual([])
    expect((await detail(runtime, state.conversationId!)).messages).toEqual([])
  } finally { await rename(held, original) }
})
When('用户发送图片识别问题给Magpie员工', async ({ runtime, magpieMaterialState: state }) => {
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(prompt)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => {
    state.observed = await detail(runtime, state.conversationId!)
    return !!state.observed.turns?.length && state.observed.turns.every(turn => turn.status === 'completed') && state.observed.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
  }, { timeout: 120000, intervals: [200, 500, 1000] }).toBe(true)
})
Then('实际图片回答与材料来源可核对且重启不重放', async ({ runtime, magpieMaterialState: state }) => {
  const result = state.observed!, replies = result.messages.filter(message => message.senderType === 'agent')
  expect(replies).toHaveLength(1); expect(replies[0].status).toBe('completed')
  expect(JSON.parse(replies[0].content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))).toEqual(oracle)
  expect(result.runs.every(run => run.status === 'completed')).toBe(true)
  expect(result.artifacts).toEqual([])
  const material = result.materials![0], sent = result.messages.find(message => message.senderType === 'user')!
  expect(result.materials).toHaveLength(1); expect(material).toMatchObject({ format: 'image', deliveryScope: 'conversation', messageId: sent.id, contentHash: sha(png) }); expect(sent.materialIds).toEqual([material.id])
  expect(result.runs.flatMap(run => run.modelCalls ?? [])).toHaveLength(state.requests.length)
  const chatRequests = state.requests.filter(row => row.stage === 'chat')
  expect(chatRequests.length).toBeGreaterThan(0)
  expect(chatRequests.every(row => JSON.stringify(row.imageHashes) === JSON.stringify([sha(png)]))).toBe(true)
  expect(state.requests.every(row => row.closed && row.status === 200 && row.reasoning === 'none' && row.actualModel && row.actualProvider)).toBe(true)
  const original = join(state.dataPath!, 'materials', material.conversationId, material.id, 'original')
  await runtime.reviewFile('已发送材料原件', original, { required: true, expectedSha256: sha(png) })
  await runtime.reviewData('真实图片回答与原Work状态', result)
  await expect(runtime.page.locator(`#message-${replies[0].id}`)).toContainText('circle')
  await runtime.reviewNativeCheckpoint('实际模型图片回答')
  await runtime.close()
  const before = await records(state.dataPath!), count = state.requests.length
  expect(JSON.stringify(before)).not.toContain('data:image/')
  await runtime.start(); await captureProcesses(runtime, state)
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(await records(state.dataPath!)).toEqual(before); expect(state.requests).toHaveLength(count)
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('桌面重启零重放', { requestsBefore: count, requestsAfter: state.requests.length, recordsUnchanged: true })
})

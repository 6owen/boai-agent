/*
 * [OUTPUT]: 活动导入更新沿真实Dialog确认、隔离Magpie及两个并发来源，核对单源取消/新模型/重复事件/重启。
 * [OUTPUT]: 默认系统分发单列验收；先核对真实默认包路径，再不指定应用启动/热投递，保留旧副本。
 * [OUTPUT]: 取证先等待真实只读API就绪，关键截图等待原弹窗动画完成；不伪造数据库或修改动画。
 * [INPUT]: Isolated Desktop lifecycle, production OS event handler/IPC and global import confirmation UI.
 * [OUTPUT]: Startup queue, cancellation, conflict/reload evidence; packaged hot/cold links use actual LaunchServices with no inference.
 * [POS]: G3 source event fixtures and explicitly tagged actual application OS delivery tests.
 * [PROTOCOL]: Update Header and steps/.folder.md when changing scenario coverage.
 */
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { createServer, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Desktop } from '../support/desktop'
import { test as base } from '../support/test'
import { gatewayImportUrl } from '../../../src/shared/domain/gateway-import'
import type { Connection, ConversationDetail } from '../../../src/shared/domain'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'

import { isolatedMagpie } from '../../fixtures/magpie-isolated'
import { streamText } from '../../fixtures/gateway-stream'

type ActiveRow = { model: string; stage: string; closed: boolean; held: boolean }
type ImportState = { connection?: Connection; active?: { url: string; ids: string[]; rows: ActiveRow[]; releaseOther: () => void; initialConnections: Connection[] } }

const url = gatewayImportUrl({ version: 1, kind: 'magpie', name: 'BDD Magpie', baseUrl: 'http://127.0.0.1:3425', protocol: 'responses', modelId: 'provider/family/model' })
export const test = base.extend<{ gatewayImportState: ImportState }>({ gatewayImportState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const review = (runtime: Desktop) => runtime.page.getByRole('dialog', { name: '导入 Magpie 连接', exact: true })
async function receivedDeliveries(runtime: Desktop) {
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2/boai.sqlite'))
  try { return (await store.load('gatewayImportDeliveries')).length } finally { await store.close() }
}
async function deliver(runtime: Desktop, expectDraft = true, link = url) {
  await runtime.page.evaluate(() => window.boai.request('listGatewayImports', undefined))
  const before = await receivedDeliveries(runtime)
  if (process.env.BOAI_TEST_PACKAGED_PATH) {
    const bundle = dirname(dirname(dirname(resolve(process.env.BOAI_TEST_PACKAGED_PATH))))
    const useDefault = process.env.BOAI_TEST_OS_DEFAULT === '1'
    if (useDefault) expect(await runtime.app.evaluate(async ({ app }) => (await app.getApplicationInfoForProtocol('boai://provider/import')).path)).toBe(bundle)
    await promisify(execFile)('/usr/bin/open', [...(useDefault ? [] : ['-a', bundle]), '-u', link])
    await runtime.reviewData('LaunchServices实际热启动导入', { bundle, transport: useDefault ? 'open -u URL (system default)' : 'open -a bundle -u URL', appWasRunning: true })
  } else await runtime.app.evaluate(({ app }, link) => { app.emit('open-url', { preventDefault() {} }, link) }, link)
  await expect.poll(() => receivedDeliveries(runtime)).toBe(before + 1)
  await runtime.reviewData('宿主实际接收导入事件', { before, after: before + 1, expectDraft })
  if (expectDraft) await expect(review(runtime)).toBeVisible()
}
const connections = (runtime: Desktop) => runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)
async function checkpoint(runtime: Desktop, label: string) {
  const dialog = runtime.page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('opacity', '1')
  await expect.poll(() => dialog.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).length)).toBe(0)
  await runtime.page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  await runtime.reviewNativeCheckpoint(label)
}

Given('macOS从未运行状态以Magpie链接启动隔离应用包', async ({ runtime }) => {
  test.skip(!process.env.BOAI_TEST_PACKAGED_PATH || process.platform !== 'darwin', '实际系统冷启动要求明确的macOS应用包')
  await runtime.start({ launchUrl: url })
})
Given('macOS默认链接从未运行状态启动已注册的隔离应用包', async ({ runtime }) => {
  test.skip(!process.env.BOAI_TEST_PACKAGED_PATH || process.platform !== 'darwin' || process.env.BOAI_TEST_OS_DEFAULT !== '1', '默认系统分发需要明确登记的应用包对照')
  await runtime.start()
  const actual = await runtime.app.evaluate(async ({ app }) => ({ selected: (await app.getApplicationInfoForProtocol('boai://provider/import')).path, executable: process.execPath, packaged: app.isPackaged }))
  const expected = dirname(dirname(dirname(resolve(process.env.BOAI_TEST_PACKAGED_PATH!))))
  await runtime.reviewData('注册后系统实际默认副本', { ...actual, expected, matched: actual.selected === expected })
  expect(actual.selected).toBe(expected)
  await runtime.close()
  await runtime.start({ launchUrl: url, useDefaultHandler: true })
})

Given('Magpie导入链接在隔离应用就绪前到达两次', async ({ runtime }) => {
  if (process.env.BOAI_TEST_PACKAGED_PATH) throw new Error('本场为源码就绪前事件夹具；实际应用包冷启动须使用系统分发门禁')
  const entry = join(runtime.root, 'early-import.cjs')
  await writeFile(entry, `require(${JSON.stringify(resolve('dist/main/main.cjs'))});const {app}=require('electron');for(let i=0;i<2;i++)app.emit('open-url',{preventDefault(){}},${JSON.stringify(url)});`)
  await runtime.start({ mainEntry: entry })
})
Then('Magpie导入只展示一个草稿且没有创建连接', async ({ runtime }) => {
  await expect(review(runtime)).toBeVisible()
  await expect(review(runtime).getByText('provider/family/model', { exact: true })).toBeVisible()
  expect(await runtime.page.evaluate(() => window.boai.request('listGatewayImports', undefined))).toHaveLength(1)
  expect(await connections(runtime)).toEqual([])
  await checkpoint(runtime, '就绪前链接只生成待确认草稿')
})
When('取消Magpie导入后再次打开并明确保存', async ({ runtime }) => {
  await review(runtime).getByRole('button', { name: '取消导入', exact: true }).last().click()
  await expect(review(runtime)).toHaveCount(0)
  expect(await connections(runtime)).toEqual([])
  await deliver(runtime)
  await review(runtime).getByRole('button', { name: '确认添加连接', exact: true }).click()
  await expect(review(runtime)).toHaveCount(0)
})
Then('Magpie连接只保存一次且重启后仍可核对', async ({ runtime }) => {
  const saved = await connections(runtime)
  expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ defaultModel: 'provider/family/model', api: 'responses', revision: 1, gateway: { auth: 'local' } })
  await deliver(runtime, false)
  await expect.poll(() => runtime.page.evaluate(() => window.boai.request('listGatewayImports', undefined))).toEqual([])
  await runtime.restart()
  expect(await connections(runtime)).toEqual(saved)
  await expect(review(runtime)).toHaveCount(0)
  await runtime.reviewData('同一连接与重复导入后的实际记录', saved)
})
Given('隔离应用正在审阅Magpie导入', async ({ runtime }) => { await runtime.start(); await deliver(runtime) })
When('Magpie连接实际保存后响应丢失', async ({ runtime }) => {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, '_invokeHandlers') as Map<string, (event: Electron.IpcMainInvokeEvent, payload: { method: string; input: unknown }) => Promise<unknown>>
    const original = handlers.get('boai:request')!
    Object.assign(globalThis, { gatewayImportConfirmCount: 0 })
    handlers.set('boai:request', async (event, payload) => {
      const result = await original(event, payload)
      if (payload.method === 'confirmGatewayImport') { Reflect.set(globalThis, 'gatewayImportConfirmCount', Number(Reflect.get(globalThis, 'gatewayImportConfirmCount')) + 1); throw new Error('夹具：保存已提交，响应丢失') }
      return result
    })
  })
  await review(runtime).getByRole('button', { name: '确认添加连接', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '核对保存结果', exact: true })).toBeVisible()
  expect(await connections(runtime)).toHaveLength(1)
  await checkpoint(runtime, '保存已提交但界面等待原请求核对')
})
Then('重新载入界面只核对原保存且不重复创建连接', async ({ runtime }) => {
  const saved = await connections(runtime)
  await runtime.page.reload()
  await expect.poll(() => runtime.page.evaluate(() => localStorage.getItem('boai.gateway-import.pending.v1'))).toBeNull()
  await expect(runtime.page.getByRole('dialog', { name: '核对模型导入', exact: true })).toHaveCount(0)
  expect(await connections(runtime)).toEqual(saved)
  expect(await runtime.app.evaluate(() => Reflect.get(globalThis, 'gatewayImportConfirmCount'))).toBe(1)
  await runtime.reviewData('重载仅查询原回执', { confirmCalls: 1, connections: saved })
  await runtime.restart(); expect(await connections(runtime)).toEqual(saved)
})
Given('Magpie导入与已有同源连接存在差异', async ({ runtime, gatewayImportState }) => {
  await runtime.start()
  gatewayImportState.connection = await runtime.page.evaluate(() => window.boai.request('saveConnection', { name: '已有 Magpie', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'old/model', gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }))
  await deliver(runtime)
})
When('选择更新后已有Magpie连接被再次修改', async ({ runtime, gatewayImportState }) => {
  await review(runtime).getByRole('combobox').click()
  await runtime.page.getByRole('option', { name: '更新：已有 Magpie', exact: true }).click()
  await expect(review(runtime).getByText(/当前：old\/model/)).toBeVisible()
  gatewayImportState.connection = await runtime.page.evaluate(connection => window.boai.request('saveConnection', { id: connection.id, expectedRevision: connection.revision, name: '外部改名', provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: 'newer/model', gateway: connection.gateway }), gatewayImportState.connection!)
  await review(runtime).getByRole('button', { name: '确认更新连接', exact: true }).click()
})
Then('导入拒绝陈旧保存并可重新审阅后确认', async ({ runtime, gatewayImportState }) => {
  await expect(runtime.page.getByRole('button', { name: '核对保存结果', exact: true })).toBeVisible()
  expect(await connections(runtime)).toEqual([gatewayImportState.connection])
  await runtime.page.getByRole('button', { name: '核对保存结果', exact: true }).click()
  await runtime.page.getByRole('button', { name: '重新审阅', exact: true }).click()
  await expect(review(runtime)).toBeVisible()
  await expect(review(runtime).getByText(/当前：newer\/model/)).toBeVisible()
  await checkpoint(runtime, '重新读取最新连接后审阅模型差异')
  await review(runtime).getByRole('button', { name: '确认更新连接', exact: true }).click()
  await expect(review(runtime)).toHaveCount(0)
  const saved = await connections(runtime)
  expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ id: gatewayImportState.connection!.id, revision: 3, defaultModel: 'provider/family/model', api: 'responses' })
})

Given('隔离桌面有两条实际Magpie调用正在运行', async ({ runtime, gatewayImportState: state }) => {
  test.skip(process.env.BOAI_MAGPIE_IMPORT_ACTIVE !== '1', '需要显式隔离网关活动导入验收开关')
  test.setTimeout(120000)
  test.info().annotations.push({ type: 'model-mode', description: 'installed-isolated-magpie/synthetic-supplier' })
  const root = await realpath(runtime.root), rows: ActiveRow[] = [], held = new Map<string, ServerResponse>(), jobs = new Set<Promise<void>>()
  const server = createServer((request, response) => {
    const job = (async () => {
      if (request.method === 'GET') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ object: 'list', data: ['old', 'new', 'other'].map(id => ({ id, object: 'model', owned_by: 'import' })) })); return }
      let raw = ''; for await (const part of request) { raw += part; if (raw.length > 1_000_000) throw Error('Synthetic request cap') }
      const body = JSON.parse(raw), encoded = JSON.stringify(body.messages)
      const stage = encoded.includes('private-participation-v2') ? 'decision' : encoded.includes('private-memory-delta-v1') ? 'memory' : 'chat'
      const row = { model: body.model as string, stage, closed: false, held: false }; rows.push(row)
      response.once('close', () => { row.closed = true })
      if (rows.length > 12) throw Error('Frozen experiment request cap exceeded')
      if (stage === 'decision') streamText(response, 'chat', JSON.stringify({ action: 'reply', responseKind: 'chat' }), 'complete', {})
      else if (stage === 'memory') streamText(response, 'chat', JSON.stringify({ candidates: [] }), 'complete', {})
      else if (body.model === 'new') streamText(response, 'chat', 'NEW_SOURCE_OK', 'complete', {})
      else { row.held = true; held.set(body.model, response); await new Promise<void>(done => response.once('close', done)) }
    })().catch(error => { response.destroy(error) })
    jobs.add(job); void job.finally(() => jobs.delete(job))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); runtime.trackServer(server)
  let gateway: Awaited<ReturnType<typeof isolatedMagpie>> | undefined, dataPath = '', pids: number[] = []
  const inputFiles = (await readdir('src', { recursive: true })).filter(name => /\.(ts|tsx|json)$/.test(name)).map(name => `src/${name}`)
  inputFiles.push('package.json', 'pnpm-lock.yaml', 'tests/e2e/steps/gateway-import.steps.ts', 'tests/e2e/features/gateway-import.feature', 'tests/fixtures/magpie-isolated.ts', 'tests/fixtures/gateway-stream.ts', 'dist/main/main.cjs', 'dist/runtime/worker.mjs')
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  const inputs = Object.fromEntries(await Promise.all(inputFiles.sort().map(async path => [path, hash(await readFile(path))])))
  runtime.defer(async () => {
    await gateway?.close(); server.closeAllConnections(); await Promise.all(jobs)
    const unchanged = (await Promise.all(Object.entries(inputs).map(async ([path, expected]) => hash(await readFile(path)) === expected))).every(Boolean)
    const store = dataPath ? await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')) : undefined
    try {
      const records = store ? Object.fromEntries(await Promise.all(['agents', 'connections', 'conversations', 'messages', 'runs', 'turns', 'workItems', 'gatewayImportDrafts', 'gatewayImportReceipts', 'gatewayImportDeliveries'].map(async name => [name, await store.load(name)]))) : {}
      await runtime.reviewData('活动导入关闭后的实际证据', { rows, activeJobs: jobs.size, unchanged, pids, records })
    } finally { await store?.close() }
    if (gateway) await runtime.reviewFile('隔离Magpie版本与实际退出', join(root, 'isolation.json'), { required: true })
    expect(unchanged).toBe(true); expect(rows.every(row => row.closed)).toBe(true); expect(jobs.size).toBe(0)
    await expect.poll(() => pids.every(pid => { try { process.kill(pid, 0); return false } catch { return true } }), { timeout: 10000 }).toBe(true)
  })
  gateway = await isolatedMagpie(root, (server.address() as { port: number }).port)
  await gateway.command(['provider', 'add', 'import', 'id=import', `url=http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, 'key=SYNTHETIC_IMPORT_NOT_A_SECRET', 'models=old,new,other']); await gateway.start()
  await runtime.reviewData('活动导入批次计划', { version: gateway.version, origin: gateway.origin, maxUpstreamRequests: 12, userMessages: 3, sourceAndBuildInputs: inputs, scope: 'Actual isolated Magpie, synthetic supplier and production UI/IPC; source open-url event or packaged LaunchServices according to launcher' })
  await runtime.start()
  const prepared = await runtime.page.evaluate(async origin => {
    const result = []
    for (const model of ['old', 'other']) {
      const connection = await window.boai.request('saveConnection', { name: `活动 ${model}`, provider: 'openai-compatible', baseUrl: origin, defaultModel: `import/${model}`, gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } })
      const agent = await window.boai.request('saveAgent', { name: `员工 ${model}`, role: '回答', instructions: '按本次问题回答。', color: '#123456', connectionId: connection.id, modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
      const conversation = await window.boai.request('createConversation', { kind: 'direct', title: `活动导入 ${model}`, agentIds: [agent.id] })
      result.push({ connection, conversation })
    }
    return { result, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, gateway.origin)
  dataPath = prepared.dataPath
  state.connection = prepared.result[0].connection
  state.active = { url: gatewayImportUrl({ version: 1, kind: 'magpie', name: '活动更新', baseUrl: gateway.origin, protocol: 'chat', modelId: 'import/new' }), ids: prepared.result.map(row => row.conversation.id), rows, initialConnections: prepared.result.map(row => row.connection), releaseOther: () => streamText(held.get('other')!, 'chat', 'OTHER_SOURCE_OK', 'complete', {}) }
  await runtime.page.evaluate(async ids => { for (const id of ids) await window.boai.request('sendMessage', { conversationId: id, requestId: `active-${id}`, content: '请回答本次问题。', mentionIds: [] }) }, state.active.ids)
  await expect.poll(() => rows.filter(row => row.held && !row.closed).map(row => row.model).sort()).toEqual(['old', 'other'])
  pids = [...new Set([runtime.app.process().pid!, ...await runtime.app.evaluate(({ app }) => app.getAppMetrics().map(row => row.pid))])]
  await runtime.reviewData('导入前两条独立活动来源', { rows, connections: state.active.initialConnections, pids })
})
When('在导入弹窗确认更新第一条活动连接', async ({ runtime, gatewayImportState: state }) => {
  await deliver(runtime, true, state.active!.url)
  await review(runtime).getByRole('combobox').click()
  await runtime.page.getByRole('option', { name: '更新：活动 old', exact: true }).click()
  await expect(review(runtime).getByText(/当前：import\/old/)).toBeVisible()
  expect(state.active!.rows.filter(row => row.held).every(row => !row.closed)).toBe(true)
  await expect(review(runtime).getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => runtime.page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).length)).toBe(0)
  await checkpoint(runtime, '活动连接导入明确确认前')
  await review(runtime).getByRole('button', { name: '确认更新连接', exact: true }).click()
  await expect(review(runtime)).toHaveCount(0)
})
Then('旧调用退出且独立连接继续完成', async ({ runtime, gatewayImportState: state }) => {
  const active = state.active!
  await expect.poll(() => active.rows.filter(row => row.model === 'old').every(row => row.closed)).toBe(true)
  expect(active.rows.find(row => row.model === 'other' && row.held)?.closed).toBe(false)
  const saved = await connections(runtime)
  expect(saved.find(row => row.id === state.connection!.id)).toMatchObject({ revision: 2, defaultModel: 'import/new' })
  expect(saved.find(row => row.id === active.initialConnections[1].id)).toEqual(active.initialConnections[1])
  const before = await runtime.page.evaluate(ids => Promise.all(ids.map(id => window.boai.request('getConversation', { id }))), active.ids)
  expect(before[0].runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'cancelled' })
  expect(before[0].runs.find(run => run.phase === 'execution')?.error).toContain('连接')
  expect(before[1].runs.find(run => run.phase === 'execution')?.status).toBe('running')
  active.releaseOther()
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), active.ids[1])).messages.some(message => message.content === 'OTHER_SOURCE_OK' && message.status === 'completed')).toBe(true)
  await runtime.reviewData('导入仅取消目标来源并保留独立结果', { rows: active.rows, saved, before })
})
Then('新消息使用导入模型且重复导入和重启不重放', async ({ runtime, gatewayImportState: state }) => {
  const active = state.active!
  const message = await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, requestId: `after-update-${id}`, content: '只回答当前来源结果。', mentionIds: [] }), active.ids[0])
  let view!: ConversationDetail
  await expect.poll(async () => { view = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), active.ids[0]); return view.runs.some(run => run.triggerMessageId === message.id && run.phase === 'execution' && run.status === 'completed') && view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && !!view.turns?.length && view.turns.every(turn => ['completed', 'failed', 'cancelled', 'interrupted'].includes(turn.status)) }).toBe(true)
  expect(view.messages.some(row => row.content === 'NEW_SOURCE_OK' && row.status === 'completed')).toBe(true)
  const calls = view.runs.filter(run => run.triggerMessageId === message.id).flatMap(run => run.modelCalls ?? [])
  expect(calls.length).toBeGreaterThan(0); expect(calls.every(call => call.route?.actualModelId === 'import/new')).toBe(true)
  expect(active.rows.filter(row => row.model === 'old')).toHaveLength(2)
  const count = active.rows.length
  await deliver(runtime, false, active.url)
  await expect.poll(() => runtime.page.evaluate(() => window.boai.request('listGatewayImports', undefined))).toEqual([])
  const saved = await connections(runtime)
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^活动导入 old/ }).click()
  await expect(runtime.page.getByText('NEW_SOURCE_OK', { exact: true }).first()).toBeVisible()
  await runtime.reviewNativeCheckpoint('活动更新后的新来源结果')
  await runtime.reviewData('新来源业务与重复导入回执', { view, rows: active.rows, count, saved })
  await runtime.restart()
  expect(await connections(runtime)).toEqual(saved)
  expect(active.rows).toHaveLength(count)
  const restored = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), active.ids[0])
  expect(restored.messages).toEqual(view.messages); expect(restored.runs).toEqual(view.runs)
})

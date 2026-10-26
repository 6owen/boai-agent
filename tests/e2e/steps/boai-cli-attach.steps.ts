/*
 * [OUTPUT]: 服务死亡恢复沿原Run中断→请求unknown投影，核对原动作、原消息与无重放。
 * [INPUT]: Actual isolated Electron/Node processes, encrypted synthetic credential and original browser protocol fixture.
 * [OUTPUT]: One owner, private host calls, active-action drain and real desktop SIGKILL recovery with no business replay.
 * [POS]: CLI desktop attachment BDD; controlled HTTP responses, real browser actions and persisted business state.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { readFile, lstat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { createServer, connect, type Socket } from 'node:net'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { test as base } from '../support/test'
import { CliRpcClient } from '../../../packages/transport/src/client'
import { readLocalConnection, type LocalConnection } from '../../../packages/transport/src/discovery'
import type { MessageExecution } from '../../../packages/shared/src/domain/message-execution'
import type { ConversationDetail } from '../../../packages/shared/src/domain'
import { BROWSER_PAGE_MARKER, BROWSER_PASSWORD, browserDetail, browserRecords, nativeBrowserViews, prepareBrowserDesktop } from '../support/browser-migration'

const fixtureKey = 'isolated-attachment-fixture-key-not-a-provider-secret'
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
type Status = { serverId: string; state: string; desktopAttached: boolean; browserAvailable: boolean; owner: { pid: number } }
interface State {
  fixture?: Awaited<ReturnType<typeof prepareBrowserDesktop>>; client?: CliRpcClient; metadata?: LocalConnection
  child?: ChildProcess; exited?: Promise<number | null>; exitCode?: number | null; stdout: string; stderr: string
  vaultHash?: string; calls?: number; messageId?: string; requestId?: string; authenticatedRequests?: number
}
export const test = base.extend<{ attachment: State }>({ attachment: async ({}, use) => use({ stdout: '', stderr: '' }) })
const { Given, When, Then } = createBdd(test)

Given('已有员工和加密凭据的独立服务正在运行', async ({ runtime, attachment: state }) => {
  test.setTimeout(120_000)
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  const fixture = state.fixture = await prepareBrowserDesktop(runtime, { kind: 'direct' })
  state.authenticatedRequests = 0
  fixture.endpoint.server.on('request', request => { if (request.headers.authorization === `Bearer ${fixtureKey}`) state.authenticatedRequests!++ })
  await runtime.page.evaluate(async ({ connection, apiKey }) => {
    const { revision, hasApiKey: _key, ...definition } = connection
    await window.boai.request('saveConnection', { ...definition, expectedRevision: revision, apiKey })
  }, { connection: fixture.connection, apiKey: fixtureKey })
  state.vaultHash = digest(await readFile(join(fixture.dataPath, 'credentials.enc.json')))
  await runtime.close()
  const child = state.child = spawn(process.execPath, [resolve('dist/cli/index.mjs'), 'serve', '--data-dir', fixture.dataPath], {
    cwd: runtime.root, env: { PATH: process.env.PATH, HOME: runtime.root, TMPDIR: runtime.root }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  state.exited = new Promise(resolve => child.once('exit', code => { state.exitCode = code; resolve(code) }))
  child.stdout!.on('data', data => { state.stdout += String(data) }); child.stderr!.on('data', data => { state.stderr += String(data) })
  runtime.defer(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      try { await state.client?.invoke('server:shutdown', { serverId: state.metadata!.serverId }) } catch {}
      await Promise.race([state.exited, new Promise<void>(resolve => setTimeout(resolve, 5000))])
      if (child.exitCode === null && child.signalCode === null) {
        await runtime.reviewData('仅失败清理强制停止隔离服务', { pid: child.pid, action: 'SIGKILL', actualShutdownUnconfirmed: true })
        child.kill('SIGKILL'); await state.exited
      }
    }
    state.client?.destroy()
    await runtime.reviewData('独立服务实际进程和本地HTTP账本', { pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode, stdout: state.stdout, stderr: state.stderr, controlledModelRequests: fixture.endpoint.requests.length, authenticatedRequests: state.authenticatedRequests, errors: fixture.errors })
  })
  await expect.poll(() => ({ ready: state.stdout.includes('"type":"ready"'), exit: child.exitCode }), { timeout: 20_000 }).toEqual({ ready: true, exit: null })
  state.metadata = await readLocalConnection(fixture.dataPath)
  state.client = new CliRpcClient(state.metadata.url, state.metadata); await state.client.connect()
  expect(await state.client.invoke('server:status')).toMatchObject({ owner: { pid: child.pid }, desktopAttached: false, browserAvailable: false })
  const connections = await state.client.invoke('connections') as { id: string; hasApiKey: boolean }[]
  expect(connections.find(value => value.id === fixture.connection.id)?.hasApiKey).toBe(false)
  await runtime.reviewData('桌面未连接时独立owner和凭据状态', { serverId: state.metadata.serverId, ownerPid: child.pid, browserAvailable: false, desktopVaultAvailable: false, vaultSha256: state.vaultHash })
})

When('桌面连接原服务并让员工浏览网页交付文件', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!, client = state.client!
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(await client.invoke('server:status')).toMatchObject({ serverId: state.metadata!.serverId, owner: { pid: state.child!.pid }, desktopAttached: true, browserAvailable: true })
  expect((await readLocalConnection(fixture.dataPath)).serverId).toBe(state.metadata!.serverId)
  const keyAvailable = await runtime.page.evaluate(async ({ id, expected }) => (await window.boai.request('getConnectionApiKey', { id })) === expected, { id: fixture.connection.id, expected: fixtureKey })
  expect(keyAvailable).toBe(true)
  expect(await client.invoke('server:release', { serverId: state.metadata!.serverId })).toMatchObject({ accepted: false })
  const message = await fixture.send(fixture.first, 'attached-browser', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`, 'snapshot', 'screenshot --png'], artifact: true })
  state.messageId = message.id
  await expect.poll(async () => {
    const detail = await browserDetail(runtime, fixture.first.id)
    return detail.runs.length > 0 && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted'].includes(turn.status))
  }, { timeout: 40_000 }).toBe(true)
  const detail = await browserDetail(runtime, fixture.first.id), records = await browserRecords(fixture.dataPath)
  expect(fixture.errors).toEqual([])
  expect(detail.artifacts).toHaveLength(1)
  expect(records.works).toHaveLength(1); expect(records.works[0].status).toBe('delivered')
  expect(records.actions).toHaveLength(3)
  expect(records.actions.every(action => action.status === 'completed' && !!action.startedAt && !!action.toolCallId)).toBe(true)
  expect(records.evidence).toHaveLength(3)
  expect(records.artifacts[0].browserSources?.some(source => source.url === `${fixture.site.origin}/landing` && !!source.pageVersion)).toBe(true)
  const serialized = JSON.stringify(fixture.endpoint.requests)
  expect(serialized).toContain(BROWSER_PAGE_MARKER); expect(serialized).toContain('data:image/png;base64,iVBOR'); expect(serialized).not.toContain(BROWSER_PASSWORD)
  const media = serialized.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)!
  const originalScreenshot = join(runtime.root, 'actual-browser-tool-page.png')
  await writeFile(originalScreenshot, Buffer.from(media[1], 'base64'))
  await runtime.reviewFile('本次浏览器工具实际捕获并交给模型的网页PNG原件', originalScreenshot, { required: true })
  await runtime.reviewFile('原浏览器来源报告文件', records.artifacts[0].path, { required: true, expectedSha256: records.artifacts[0].contentHash })
  const native = await nativeBrowserViews(runtime)
  expect(native).toHaveLength(1); expect(native[0].views).toHaveLength(3)
  expect(native[0].views.every(view => view.preferences.sandbox && view.preferences.contextIsolation && !view.preferences.nodeIntegration)).toBe(true)
  await runtime.page.evaluate(() => window.boai.request('browserControl', { action: 'show' }))
  const captured = await runtime.app.evaluate(async ({ BrowserWindow }, id) => {
    const window = BrowserWindow.fromId(id)!
    const image = await window.capturePage()
    return { png: image.isEmpty() ? '' : image.toPNG().toString('base64'), source: window.getMediaSourceId(), bounds: window.getBounds() }
  }, native[0].id)
  const screenshot = join(runtime.root, 'attached-browser.png')
  try {
    if (captured.png) await writeFile(screenshot, Buffer.from(captured.png, 'base64'))
    else {
      const id = captured.source.match(/^window:(\d+):/)?.[1]
      if (process.platform !== 'darwin' || !id) throw new Error('浏览器原生整窗截图不可用，不能代用主窗口')
      await promisify(execFile)('/usr/sbin/screencapture', ['-x', '-l', id, screenshot])
    }
    await runtime.reviewFile('附着服务实际浏览器整窗原图', screenshot, { required: true })
  } catch (error) {
    const limitation = error instanceof Error ? error.message : String(error)
    test.info().annotations.push({ type: 'evidence-gap', description: `浏览器整窗截图不可用；实际工具网页PNG另存：${limitation}` })
    await runtime.reviewData('浏览器整窗截图环境限制', { limitation, wholeWindowAvailable: false, toolPagePngAvailable: true })
  }
  await runtime.reviewData('浏览器原图来源', { electronWindowId: native[0].id, source: captured.source, bounds: captured.bounds, method: captured.png ? 'BrowserWindow.capturePage' : 'macOS screencapture -l' })
  expect(state.authenticatedRequests).toBe(fixture.endpoint.requests.length)
  await runtime.reviewData('同一owner原浏览器动作和交付', { status: await client.invoke('server:status'), keyAvailable, native, records, observedTools: fixture.observedTools, controlledModelRequests: fixture.endpoint.requests.length })
  state.calls = fixture.endpoint.requests.length
})

Then('桌面退出重开保留同一服务和原交付且不重放', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!, client = state.client!
  await runtime.close()
  await expect.poll(async () => (await client.invoke('server:status') as Status).desktopAttached).toBe(false)
  expect(await client.invoke('server:status')).toMatchObject({ state: 'ready', owner: { pid: state.child!.pid }, browserAvailable: false })
  expect(state.child!.exitCode).toBe(null)
  const before = await client.invoke('getConversation', { id: fixture.first.id })
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(await client.invoke('server:status')).toMatchObject({ serverId: state.metadata!.serverId, desktopAttached: true, browserAvailable: true })
  const detail = await browserDetail(runtime, fixture.first.id)
  expect(detail.messages.filter(message => message.senderType === 'user').map(message => message.id)).toEqual([state.messageId])
  expect(detail.artifacts).toHaveLength(1)
  expect(await nativeBrowserViews(runtime)).toEqual([])
  expect(fixture.endpoint.requests).toHaveLength(state.calls!)
  expect(digest(await readFile(join(fixture.dataPath, 'credentials.enc.json')))).toBe(state.vaultHash)
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('桌面重开原历史零重放与加密原件保持', { before, after: detail, callsBefore: state.calls, callsAfter: fixture.endpoint.requests.length, vaultSha256: state.vaultHash, status: await client.invoke('server:status') })
  await runtime.close()
  await client.invoke('server:shutdown', { serverId: state.metadata!.serverId })
  expect(await state.exited).toBe(0)
  await expect(lstat(join(fixture.dataPath, '.cli/connection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(lstat(join(fixture.dataPath, '.cli/desktop.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(state.stdout).not.toContain(state.metadata!.token); expect(state.stdout + state.stderr).not.toContain(fixtureKey)
})

When('员工正在等待真实网页时退出附着桌面', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(await state.client!.invoke('server:status')).toMatchObject({ serverId: state.metadata!.serverId, desktopAttached: true })
  const message = await fixture.send(fixture.first, 'detach-active-browser', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`, 'wait text ATTACH_NEVER_READY 30000'] })
  state.messageId = message.id; state.requestId = 'browser-request-1-detach-active-browser'
  await expect.poll(async () => (await browserRecords(fixture.dataPath)).actions.some(action => String(action.command).includes('ATTACH_NEVER_READY') && action.status === 'started')).toBe(true)
  const active = await state.client!.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(active.activeRunIds.length).toBeGreaterThan(0)
  await runtime.reviewData('退出前实际已开始的浏览器动作', { execution: active, records: await browserRecords(fixture.dataPath), native: await nativeBrowserViews(runtime) })
  await runtime.close()
  await expect.poll(async () => (await state.client!.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution).activeRunIds).toEqual([])
  expect(await state.client!.invoke('server:status')).toMatchObject({ state: 'ready', desktopAttached: false, browserAvailable: false, owner: { pid: state.child!.pid } })
  const ended = await state.client!.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(ended.state).toBe('cancelled')
  const records = await browserRecords(fixture.dataPath)
  expect(records.actions).toHaveLength(2)
  expect(records.actions.find(action => String(action.command).includes('ATTACH_NEVER_READY'))?.status).toBe('unknown')
  expect(records.works[0].status).toBe('cancelled')
  state.calls = fixture.endpoint.requests.length
  await runtime.reviewData('实际桌面进程退出和原运行排空', { execution: ended, records, controlledModelRequests: state.calls, status: await state.client!.invoke('server:status') })
})

Then('原浏览器运行结束且重开不重放未完成动作', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(await state.client!.invoke('server:status')).toMatchObject({ serverId: state.metadata!.serverId, desktopAttached: true, browserAvailable: true })
  expect(await nativeBrowserViews(runtime)).toEqual([])
  expect((await browserRecords(fixture.dataPath)).actions).toHaveLength(2)
  expect(fixture.endpoint.requests).toHaveLength(state.calls!)
  const detail = await browserDetail(runtime, fixture.first.id)
  expect(detail.messages.filter(message => message.senderType === 'user').map(message => message.id)).toEqual([state.messageId])
  expect(fixture.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('活动退出后重开原回执零重放', { detail, callsBefore: state.calls, callsAfter: fixture.endpoint.requests.length, status: await state.client!.invoke('server:status') })
  await runtime.close()
  await state.client!.invoke('server:shutdown', { serverId: state.metadata!.serverId })
  expect(await state.exited).toBe(0)
})

When('正在执行浏览器动作的附着桌面被实际强制退出', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!, client = state.client!
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(await client.invoke('server:status')).toMatchObject({ serverId: state.metadata!.serverId, desktopAttached: true })
  const message = await fixture.send(fixture.first, 'crash-active-browser', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`, 'wait text ATTACH_NEVER_READY 30000'] })
  state.messageId = message.id; state.requestId = 'browser-request-1-crash-active-browser'
  await expect.poll(async () => (await browserRecords(fixture.dataPath)).actions.some(action => String(action.command).includes('ATTACH_NEVER_READY') && action.status === 'started')).toBe(true)
  const active = await client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(active.activeRunIds.length).toBeGreaterThan(0)
  const pids = await runtime.app.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))
  const before = await browserRecords(fixture.dataPath)
  await runtime.reviewData('SIGKILL前原动作和桌面进程', { active, pids, records: before, native: await nativeBrowserViews(runtime) })
  const crash = await runtime.crash()
  expect(crash.signalCode).toBe('SIGKILL')
  await expect.poll(() => pids.filter(pid => {
    try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error }
  }), { timeout: 10_000 }).toEqual([])
  await expect.poll(async () => (await client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution).activeRunIds, { timeout: 10_000 }).toEqual([])
  const ended = await client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(ended.state).toBe('cancelled')
  const records = await browserRecords(fixture.dataPath)
  expect(records.actions).toHaveLength(2)
  expect(records.actions.find(action => String(action.command).includes('ATTACH_NEVER_READY'))?.status).toBe('unknown')
  expect(records.works[0].status).toBe('cancelled')
  expect(await client.invoke('server:status')).toMatchObject({ state: 'ready', desktopAttached: false, browserAvailable: false, owner: { pid: state.child!.pid } })
  state.calls = fixture.endpoint.requests.length
  await runtime.reviewData('真实桌面死亡和子进程退出后原运行结算', { crash, pids, allObservedPidsExited: true, ended, records, calls: state.calls, status: await client.invoke('server:status') })
})

When('浏览器执行中断开桌面通信并重新连接', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!, client = state.client!, privateConnection = await readLocalConnection(fixture.dataPath, 'desktop.json')
  const target = new URL(privateConnection.url), sockets = new Set<Socket>()
  let connections = 0
  const proxy = createServer(incoming => {
    connections++
    const upstream = connect(Number(target.port), target.hostname)
    for (const socket of [incoming, upstream]) {
      sockets.add(socket)
      socket.on('error', () => { incoming.destroy(); upstream.destroy() })
      socket.on('close', () => { sockets.delete(socket); incoming.destroy(); upstream.destroy() })
    }
    incoming.pipe(upstream); upstream.pipe(incoming)
  })
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
  runtime.defer(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => proxy.close(() => resolve())) })
  await writeFile(join(fixture.dataPath, '.cli/desktop.json'), JSON.stringify({ ...privateConnection, url: `ws://127.0.0.1:${(proxy.address() as { port: number }).port}` }), { mode: 0o600 })
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const desktopPid = runtime.app.process().pid!
  const message = await fixture.send(fixture.first, 'network-active-browser', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`, 'wait text ATTACH_NEVER_READY 30000'] })
  state.messageId = message.id; state.requestId = 'browser-request-1-network-active-browser'
  await expect.poll(async () => (await browserRecords(fixture.dataPath)).actions.some(action => String(action.command).includes('ATTACH_NEVER_READY') && action.status === 'started')).toBe(true)
  const initialConnections = connections, calls = fixture.endpoint.requests.length
  await runtime.reviewData('实际断开前原浏览器动作', { desktopPid, originalServerId: state.metadata!.serverId, connections, records: await browserRecords(fixture.dataPath) })
  // Fault only this isolated TCP transport. No runtime method or browser outcome is replaced.
  for (const socket of [...sockets]) socket.destroy()
  await expect.poll(async () => {
    try { await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)); return (await client.invoke('server:status') as Status).desktopAttached && connections > initialConnections }
    catch { return false }
  }, { timeout: 15_000 }).toBe(true)
  expect(runtime.app.process().pid).toBe(desktopPid)
  await expect.poll(async () => (await client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution).activeRunIds).toEqual([])
  const ended = await client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(ended.state).toBe('cancelled')
  const records = await browserRecords(fixture.dataPath)
  expect(records.actions).toHaveLength(2)
  expect(records.actions.find(action => String(action.command).includes('ATTACH_NEVER_READY'))?.status).toBe('unknown')
  expect(records.works[0].status).toBe('cancelled')
  expect(fixture.endpoint.requests).toHaveLength(calls)
  state.calls = calls
  await runtime.reviewData('同桌面排空后重接同owner零重放', { desktopPid, connectionsBefore: initialConnections, connectionsAfter: connections, ended, records, calls, status: await client.invoke('server:status') })
  await runtime.close()
})

When('独立服务在浏览器执行中实际死亡', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const desktopPid = runtime.app.process().pid!
  const message = await fixture.send(fixture.first, 'service-crash-browser', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`, 'wait text ATTACH_NEVER_READY 30000'] })
  state.messageId = message.id; state.requestId = 'browser-request-1-service-crash-browser'
  await expect.poll(async () => (await browserRecords(fixture.dataPath)).actions.some(action => String(action.command).includes('ATTACH_NEVER_READY') && action.status === 'started')).toBe(true)
  await runtime.reviewData('独立服务故障前原动作', { desktopPid, serverPid: state.child!.pid, records: await browserRecords(fixture.dataPath) })
  await runtime.reviewCheckpoint('独立服务故障前原会话')
  state.calls = fixture.endpoint.requests.length
  state.child!.kill('SIGKILL'); await state.exited
  expect(state.child!.signalCode).toBe('SIGKILL')
  // The unreachable old metadata can name an old app version; it is not a live owner.
  const stale = await readLocalConnection(fixture.dataPath, 'desktop.json')
  await writeFile(join(fixture.dataPath, '.cli/desktop.json'), JSON.stringify({ ...stale, version: 'old-dead-fixture-version' }), { mode: 0o600 })
  await expect.poll(async () => {
    try { await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)); return (await readLocalConnection(fixture.dataPath)).serverId !== state.metadata!.serverId }
    catch { return false }
  }, { timeout: 15_000 }).toBe(true)
  expect(runtime.app.process().pid).toBe(desktopPid)
  const fresh = await readLocalConnection(fixture.dataPath)
  state.client!.destroy(); state.client = new CliRpcClient(fresh.url, fresh); await state.client.connect()
  await runtime.reviewData('服务实际死亡后桌面接续新owner', { oldServerId: state.metadata!.serverId, newServerId: fresh.serverId, oldServicePid: state.child!.pid, oldServiceSignal: state.child!.signalCode, desktopPid, desktopStillAlive: true })
})

Then('原桌面接续新owner并保留未知回执', async ({ runtime, attachment: state }) => {
  const fixture = state.fixture!, client = state.client!
  const execution = await client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(execution.activeRunIds).toEqual([]); expect(execution.state).toBe('unknown')
  expect(execution.runs.some(run => run.status === 'interrupted')).toBe(true)
  expect(execution.works.some(work => work.status === 'interrupted')).toBe(true)
  const detail = await client.invoke('getConversation', { id: fixture.first.id }) as ConversationDetail
  expect(detail.messages.filter(message => message.senderType === 'user').map(message => message.id)).toEqual([state.messageId])
  const records = await browserRecords(fixture.dataPath)
  expect(records.actions).toHaveLength(2)
  expect(records.actions.find(action => String(action.command).includes('ATTACH_NEVER_READY'))?.status).toBe('unknown')
  expect(fixture.endpoint.requests).toHaveLength(state.calls!)
  await runtime.reviewData('新owner原中断与未知不重放', { execution, records, callsBefore: state.calls, callsAfter: fixture.endpoint.requests.length })
  expect(fixture.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.close()
  await expect(lstat(join(fixture.dataPath, '.cli/connection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

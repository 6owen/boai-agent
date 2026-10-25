/*
 * [INPUT]: 原 Desktop、owner 预览协议、真实 PTY/native guard 和网页预览侧栏。
 * [OUTPUT]: 两员工服务进程、隐藏保活/定向退出、七轮 UI 启停与原资源门槛、真正退出/重启零重放。
 * [POS]: 原 DS05/DS12/DS13 随公开终端退役迁为预览进程；保留进程身份、资源和回执断言。
 * [PROTOCOL]: 变化同步 Header 和所属 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Conversation } from '../../../packages/shared/src/domain'
import type { ApplicationResult } from '../../../packages/shared/src/domain/application-protocol'
import type { PreviewInfo, TerminalScope } from '../../../packages/shared/src/domain/workspace-tools'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { resourceSample, verifyResources, type ResourceSample } from '../support/background-resources'

type State = { rooms?: Conversation[]; scopes?: TerminalScope[]; previews?: PreviewInfo[]; pids: number[]; otherReceipt?: ApplicationResult; samples?: ResourceSample[]; commands: string[]; counter?: string }
export const test = base.extend<{ terminalState: State }>({ terminalState: async ({}, use) => use({ pids: [], commands: [] }) })
const { Given, When, Then } = createBdd(test)
async function operation<T>(runtime: Desktop, operation: string, input: Record<string, unknown>, requestId?: string) {
  const result = await runtime.page.evaluate(request => window.boai.request('executeApplicationOperation', request), { operation, input, requestId })
  expect(result.status, JSON.stringify(result)).toBe('succeeded')
  return { result, data: result.data as T }
}
const alive = (runtime: Desktop, pid: number) => runtime.app.evaluate((_electron, pid) => { try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error } }, pid)
const previews = async (runtime: Desktop, scope: TerminalScope) => (await operation<PreviewInfo[]>(runtime, 'preview.list', { ...scope })).data
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
const show = async (runtime: Desktop, scope: TerminalScope, requestId: string) => { await operation(runtime, 'workspace.show', { ...scope, view: 'preview' }, requestId); await expect(runtime.page.getByRole('complementary', { name: '网页预览', exact: true })).toBeVisible() }
async function processId(runtime: Desktop, scope: TerminalScope, id: string) {
  let pid = 0
  await expect.poll(async () => { const preview = (await previews(runtime, scope)).find(item => item.id === id); pid = Number(preview?.diagnostics?.output.match(/PREVIEW_CHILD:(\d+)/)?.[1]); return pid > 0 }).toBe(true)
  expect(await alive(runtime, pid)).toBe(true)
  return pid
}

Given('两名员工会话各有一个实际运行的预览服务', async ({ runtime, terminalState: state }) => {
  test.setTimeout(180_000)
  const script = join(runtime.root, 'preview-server.cjs'); state.counter = join(runtime.root, 'starts.jsonl')
  await writeFile(script, `const http = require('node:http'), fs = require('node:fs');
const marker = process.argv[2], counter = process.argv[3];
fs.appendFileSync(counter, JSON.stringify({ marker, pid: process.pid }) + '\\n');
http.createServer((req, res) => { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<body>' + marker + '</body>'); }).listen(Number(process.env.PORT), '127.0.0.1', () => console.log('PREVIEW_CHILD:' + process.pid));\n`)
  state.commands = Array.from({ length: 9 }, (_, i) => `${quote(process.execPath)} ${quote(script)} ${quote(`PREVIEW_CYCLE_${i}`)} ${quote(state.counter!)}`)
  await runtime.start()
  state.rooms = await runtime.page.evaluate(async () => [await window.boai.request('createConversation', { kind: 'direct', title: '预览甲', agentIds: ['researcher'] }), await window.boai.request('createConversation', { kind: 'direct', title: '预览乙', agentIds: ['writer'] })])
  state.scopes = state.rooms.map((room, index) => ({ employeeId: ['researcher', 'writer'][index], conversationId: room.id }))
  state.previews = []
  for (const [index, scope] of state.scopes.entries()) {
    const started = await operation<PreviewInfo>(runtime, 'preview.start', { ...scope, directory: runtime.root, command: state.commands[index] }, `preview-start-${index}`)
    expect(started.data.status).toBe('ready'); state.previews.push(started.data)
    if (index === 1) state.otherReceipt = started.result
    state.pids.push(await processId(runtime, scope, started.data.id))
  }
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${state.rooms[0].title}`) }).click()
  await show(runtime, state.scopes[0], 'show-first-preview')
  await expect(runtime.page.frameLocator('iframe[title="本地网页预览"]').locator('body')).toHaveText('PREVIEW_CYCLE_0')
  await expect(runtime.page.getByLabel('会话终端', { exact: true })).toHaveCount(0)
  const retired = await runtime.page.evaluate(scope => window.boai.request('executeApplicationOperation', { operation: 'terminal.create', input: { ...scope }, requestId: 'retired-terminal' }), state.scopes[0])
  expect(retired.status).not.toBe('succeeded')
  await runtime.reviewData('两员工真实预览与子进程', { previews: state.previews, pids: state.pids, retired, modelCalls: 0 })
})

When('我隐藏并重开预览侧栏后明确停止当前预览', async ({ runtime, terminalState: state }) => {
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(runtime.page.locator('[aria-label="网页预览"]:visible')).toHaveCount(0)
  for (const pid of state.pids) expect(await alive(runtime, pid)).toBe(true)
  await show(runtime, state.scopes![0], 'show-first-again')
  await runtime.page.getByRole('button', { name: '停止', exact: true }).click()
})
Then('当前预览进程实际退出且另一员工仍在运行', async ({ runtime, terminalState: state }) => {
  await expect.poll(async () => (await previews(runtime, state.scopes![0])).find(item => item.id === state.previews![0].id)?.status).toBe('stopped')
  await expect.poll(() => alive(runtime, state.pids[0])).toBe(false)
  expect(await alive(runtime, state.pids[1])).toBe(true)
  expect((await previews(runtime, state.scopes![1])).find(item => item.id === state.previews![1].id)?.status).toBe('ready')
  await runtime.reviewCheckpoint('UI定向停止后另一员工预览仍运行')
})

When('我从界面反复启动并停止七个预览服务', async ({ runtime, terminalState: state }) => {
  const cdp = await runtime.app.context().newCDPSession(runtime.page), samples: ResourceSample[] = []
  try {
    // The stopped iframe has its own Chromium process. Take the original stable
    // baseline only once that process has really exited; keep verifyResources intact.
    await expect(runtime.page.locator('iframe[title="本地网页预览"]')).toHaveCount(0)
    await expect.poll(() => runtime.app.evaluate(({ app, BrowserWindow }) => {
      const mainPid = BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()
      return app.getAppMetrics().filter(item => item.type === 'Tab').map(item => item.pid).filter(pid => pid !== mainPid)
    })).toEqual([])
    samples.push(await resourceSample(runtime, cdp))
    for (let index = 0; index < 7; index++) {
      const before = await previews(runtime, state.scopes![0])
      await runtime.page.getByLabel('预览目录', { exact: true }).fill(runtime.root)
      await runtime.page.getByLabel('预览启动命令', { exact: true }).fill(state.commands[index + 2])
      await runtime.page.getByRole('button', { name: '启动预览', exact: true }).click()
      let created: PreviewInfo | undefined
      await expect.poll(async () => { created = (await previews(runtime, state.scopes![0])).find(item => !before.some(old => old.id === item.id)); return created?.status }).toBe('ready')
      const pid = await processId(runtime, state.scopes![0], created!.id); state.pids.push(pid)
      await expect(runtime.page.frameLocator('iframe[title="本地网页预览"]').locator('body')).toHaveText(`PREVIEW_CYCLE_${index + 2}`)
      const starts = (await readFile(state.counter!, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
      expect(starts.filter(item => item.marker === `PREVIEW_CYCLE_${index + 2}`)).toHaveLength(1)
      await runtime.page.getByRole('button', { name: '停止', exact: true }).click()
      await expect.poll(async () => (await previews(runtime, state.scopes![0])).find(item => item.id === created!.id)?.status).toBe('stopped')
      await expect.poll(() => alive(runtime, pid)).toBe(false)
      expect(await alive(runtime, state.pids[1])).toBe(true)
      samples.push(await resourceSample(runtime, cdp))
    }
    await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
    for (let index = 0; index < 5; index++) { await runtime.page.waitForTimeout(1000); samples.push(await resourceSample(runtime, cdp)) }
    await runtime.reviewData('七轮真实预览资源', { samples, cycles: 7, idleSamples: 5, resourceContract: 'existing verifyResources unchanged', shellMemoryMeasured: false, longTermLeak: 'not assessed' })
    state.samples = samples
  } finally { await cdp.detach() }
})

Then('预览短期资源有界且真正退出和重启不重做旧命令', async ({ runtime, terminalState: state }) => {
  verifyResources(state.samples!)
  expect(await alive(runtime, state.pids[1])).toBe(true)
  const starts = await readFile(state.counter!, 'utf8'); expect(starts.trim().split('\n')).toHaveLength(9)
  await runtime.close()
  for (const pid of state.pids) { try { process.kill(pid, 0); throw new Error(`预览子进程 ${pid} 在真实退出后仍存在`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
  await runtime.start()
  for (const scope of state.scopes!) expect(await previews(runtime, scope)).toEqual([])
  const receipt = await runtime.page.evaluate(() => window.boai.request('getApplicationReceipt', { requestId: 'preview-start-1' }))
  expect(receipt).toEqual(state.otherReceipt)
  expect(await readFile(state.counter!, 'utf8')).toBe(starts)
  for (const room of state.rooms!) {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), room.id)
    expect(detail.messages).toEqual([]); expect(detail.runs).toEqual([]); expect(detail.workItems ?? []).toEqual([])
  }
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('真实退出后两员工预览不重放', { originalPids: state.pids, secondReceipt: receipt, starts, modelCalls: 0 })
})

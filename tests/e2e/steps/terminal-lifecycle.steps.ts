/*
 * [INPUT]: 原Desktop、owner应用协议、真实PTY/native guard和实际终端侧栏。
 * [OUTPUT]: 两员工子进程真实身份、隐藏保活/定向实际退出、7次UI新建执行结束与原资源门槛、真正退出/重启零重放。
 * [POS]: DS05/DS12/DS13终端真实Electron场景；仅隔离会话，不调用模型或替换终端实现。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { Conversation, Snapshot } from '../../../src/shared/domain'
import type { ApplicationResult } from '../../../src/shared/domain/application-protocol'
import type { TerminalExecution, TerminalInfo, TerminalOutput, TerminalScope } from '../../../src/shared/domain/workspace-tools'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { resourceSample, verifyResources, type ResourceSample } from '../support/background-resources'

const command = 'sleep 120 & child=$!; printf "DS_TERMINAL_CHILD:%s\\n" "$child"; wait "$child"'
type State = { rooms?: Conversation[]; scopes?: TerminalScope[]; sessions?: TerminalInfo[]; pids?: number[]; original?: Snapshot; otherReceipt?: ApplicationResult; samples?: ResourceSample[] }
export const test = base.extend<{ terminalState: State }>({ terminalState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
async function operation<T>(runtime: Desktop, operation: string, input: Record<string, unknown>, requestId?: string) {
  const result = await runtime.page.evaluate(request => window.boai.request('executeApplicationOperation', request), { operation, input, requestId })
  expect(result.status, JSON.stringify(result)).toBe('succeeded')
  return { result, data: result.data as T }
}
const alive = (runtime: Desktop, pid: number) => runtime.app.evaluate((_electron, pid) => { try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error } }, pid)
const sessions = async (runtime: Desktop, scope: TerminalScope) => (await operation<TerminalInfo[]>(runtime, 'terminal.list', { ...scope })).data
const show = async (runtime: Desktop, scope: TerminalScope, requestId: string) => { await operation(runtime, 'workspace.show', { ...scope, view: 'terminal' }, requestId); await expect(runtime.page.getByRole('button', { name: '结束终端', exact: true })).toBeVisible() }

Given('两名员工会话各有一个实际运行的终端子进程', async ({ runtime, terminalState: state }) => {
  // This new case includes two cold starts and seven real native PTY lifecycles.
  test.setTimeout(180_000)
  await runtime.start()
  state.rooms = await runtime.page.evaluate(async () => [await window.boai.request('createConversation', { kind: 'direct', title: '终端甲', agentIds: ['researcher'] }), await window.boai.request('createConversation', { kind: 'direct', title: '终端乙', agentIds: ['writer'] })])
  state.scopes = state.rooms.map((room, index) => ({ employeeId: ['researcher', 'writer'][index], conversationId: room.id }))
  state.sessions = []; state.pids = []
  for (const [index, scope] of state.scopes.entries()) {
    const session = (await operation<TerminalInfo>(runtime, 'terminal.create', { ...scope }, `terminal-create-${index}`)).data
    state.sessions.push(session)
    const execution = await operation<TerminalExecution>(runtime, 'terminal.exec', { id: session.id, command, waitMs: 100 }, `terminal-exec-${index}`)
    expect(execution.data.status).toBe('running')
    if (index === 1) state.otherReceipt = execution.result
    let pid = 0
    await expect.poll(async () => { const read = (await operation<TerminalOutput>(runtime, 'terminal.read', { id: session.id })).data; pid = Number(read.text.match(/DS_TERMINAL_CHILD:(\d+)/)?.[1]); return pid > 0 }).toBe(true)
    state.pids.push(pid); expect(await alive(runtime, pid)).toBe(true)
  }
  state.original = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${state.rooms[0].title}`) }).click()
  await show(runtime, state.scopes[0], 'show-first-terminal')
  await expect(runtime.page.locator('[aria-label="会话终端"] .xterm')).toBeVisible()
  await runtime.reviewData('两员工真实终端与子进程', { sessions: state.sessions, pids: state.pids, modelCalls: 0 })
})

When('我隐藏并重开终端侧栏后明确结束当前终端', async ({ runtime, terminalState: state }) => {
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(runtime.page.locator('[aria-label="会话终端"]:visible')).toHaveCount(0)
  for (const pid of state.pids!) expect(await alive(runtime, pid)).toBe(true)
  await show(runtime, state.scopes![0], 'show-first-again')
  await runtime.page.getByRole('button', { name: '结束终端', exact: true }).click()
})
Then('当前子进程实际退出且另一员工仍在运行', async ({ runtime, terminalState: state }) => {
  await expect.poll(async () => (await sessions(runtime, state.scopes![0])).find(session => session.id === state.sessions![0].id)?.status).toBe('exited')
  await expect.poll(() => alive(runtime, state.pids![0])).toBe(false)
  expect(await alive(runtime, state.pids![1])).toBe(true)
  expect((await sessions(runtime, state.scopes![1])).find(session => session.id === state.sessions![1].id)?.status).toBe('running')
  await runtime.reviewCheckpoint('UI定向结束后另一员工终端仍运行')
})

When('我从界面反复新建执行并结束七个终端', async ({ runtime, terminalState: state }) => {
  const cdp = await runtime.app.context().newCDPSession(runtime.page), samples: ResourceSample[] = []
  try {
    samples.push(await resourceSample(runtime, cdp))
    for (let index = 0; index < 7; index++) {
      const before = await sessions(runtime, state.scopes![0])
      await runtime.page.getByRole('button', { name: '新建终端', exact: true }).click()
      let created: TerminalInfo | undefined
      await expect.poll(async () => { created = (await sessions(runtime, state.scopes![0])).find(session => !before.some(old => old.id === session.id)); return created?.status }).toBe('running')
      const marker = `TERMINAL_CYCLE_${index}`
      const execution = await operation<TerminalExecution>(runtime, 'terminal.exec', { id: created!.id, command: `printf '${marker}\\n'` }, `terminal-cycle-${index}`)
      expect(execution.data).toMatchObject({ status: 'exited', exitCode: 0 })
      expect(execution.data.output.match(new RegExp(marker, 'g'))).toHaveLength(1)
      await runtime.page.getByRole('button', { name: '结束终端', exact: true }).click()
      await expect.poll(async () => (await sessions(runtime, state.scopes![0])).find(session => session.id === created!.id)?.status).toBe('exited')
      expect(await alive(runtime, state.pids![1])).toBe(true)
      samples.push(await resourceSample(runtime, cdp))
    }
    await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
    for (let index = 0; index < 5; index++) { await runtime.page.waitForTimeout(1000); samples.push(await resourceSample(runtime, cdp)) }
    await runtime.reviewData('七轮真实终端资源', { samples, cycles: 7, idleSamples: 5, resourceContract: 'existing verifyResources unchanged', shellMemoryMeasured: false, longTermLeak: 'not assessed' })
    state.samples = samples
  } finally { await cdp.detach() }
})

Then('终端短期资源有界且真正退出和重启不重做旧命令', async ({ runtime, terminalState: state }) => {
  verifyResources(state.samples!)
  expect(await alive(runtime, state.pids![1])).toBe(true)
  await runtime.close()
  // Desktop.close waits the real Electron exit; check native PIDs independently of its callback.
  for (const pid of state.pids!) { try { process.kill(pid, 0); throw new Error(`终端子进程${pid}在真实退出后仍存在`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
  await runtime.start()
  for (const scope of state.scopes!) expect(await sessions(runtime, scope)).toEqual([])
  const receipt = await runtime.page.evaluate(() => window.boai.request('getApplicationReceipt', { requestId: 'terminal-exec-1' }))
  expect(receipt).toEqual(state.otherReceipt)
  for (const room of state.rooms!) {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), room.id)
    expect(detail.messages).toEqual([]); expect(detail.runs).toEqual([]); expect(detail.workItems ?? []).toEqual([])
  }
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('真实退出后两员工终端不重放', { originalPids: state.pids, secondReceipt: receipt, originalSessions: state.sessions, modelCalls: 0 })
})

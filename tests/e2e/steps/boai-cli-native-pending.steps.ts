/*
 * [OUTPUT]: 窗口出现后先等原Main的真实snapshot回执，再核同serverId/PID与desktopAttached；原业务断言/总期限保持。
 * [INPUT]: Real isolated Electron, built CLI and copied original native stdio programs.
 * [OUTPUT]: Pending handoff and simultaneous desktop/two-terminal startup, independent cancellation/response and restart without replay.
 * [POS]: Codex/Claude controlled protocol BDD; no installed native CLI or real supplier claims.
 * [PROTOCOL]: Changes update Header and tests/e2e/steps/.folder.md.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, chmod, realpath, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test as base } from '../support/test'
import { CliRpcClient } from '../../../packages/transport/src/client'
import { readLocalConnection, type LocalConnection } from '../../../packages/transport/src/discovery'
import type { DigitalAgent, ConversationDetail } from '../../../packages/shared/src/domain'
import type { MessageExecution } from '../../../packages/shared/src/domain/message-execution'

type Result = { stdout: string; stderr: string; code: number }
interface State {
  kind: 'codex' | 'claude'; action: string; executable: string; agent: DigitalAgent; dataPath: string
  client?: CliRpcClient; metadata?: LocalConnection; pending?: MessageExecution; requestId: string
  peer?: DigitalAgent; peerRequestId?: string; peerPending?: MessageExecution
  command: (args: string[]) => Promise<Result>; processes?: { pid: number; parentPid: number; command: string }[]
}
export const test = base.extend<{ nativePending: State }>({ nativePending: async ({}, use) => use({} as State) })
const { Given, When, Then } = createBdd(test)
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
async function processes(executable: string) {
  const output = await new Promise<string>((done, reject) => execFile('ps', ['-axo', 'pid=,ppid=,command='], (error, stdout) => error ? reject(error) : done(stdout)))
  return output.split('\n').flatMap(line => { const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/); return match && match[3].includes(executable) ? [{ pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] }] : [] })
}
Given('原生CLI交接已准备{string}员工和{string}请求', async ({ runtime, nativePending: state }, kind: string, action: string) => {
  test.setTimeout(120000)
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  state.kind = kind as State['kind']; state.action = action; state.requestId = randomUUID()
  state.executable = join(await realpath(runtime.root), `${kind}.mjs`)
  await copyFile(resolve(kind === 'codex' ? 'tests/fixtures/native-conversation.mjs' : 'tests/fixtures/native-claude-conversation.mjs'), state.executable)
  await chmod(state.executable, 0o700)
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(await realpath(runtime.root), 'native-business.mjs'))
  await runtime.start()
  const configured = await runtime.page.evaluate(async ({ kind, executable }) => {
    const draft = { name: `交接${kind}`, executable, args: [], protocol: kind === 'codex' ? 'codex-app-server' as const : 'claude-cli' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
    await window.boai.request('testLaunchProfileDraft', draft)
    const profile = await window.boai.request('saveLaunchProfile', draft)
    const agent = await window.boai.request('saveAgent', { name: `交接${kind}员工`, role: '交付文档', instructions: '完成明确请求', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: kind === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, executionPermission: 'ask', skillIds: [], knowledgeIds: [], allowCommands: true, active: true })
    return { agent, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, { kind, executable: state.executable })
  Object.assign(state, configured)
  await runtime.close()
  const packaged = process.env.BOAI_TEST_PACKAGED_PATH
  const binary = packaged ?? process.execPath, entry = packaged ? resolve(packaged, '../../Resources/app.asar/dist/cli/index.mjs') : resolve('dist/cli/index.mjs')
  state.command = args => new Promise(done => execFile(binary, [entry, '--data-dir', state.dataPath, ...args], { cwd: runtime.root, env: { PATH: process.env.PATH, HOME: runtime.root, TMPDIR: runtime.root, ...(packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, timeout: 25000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => done({ stdout, stderr, code: error ? typeof error.code === 'number' ? error.code : -1 : 0 })))
  await runtime.reviewData('原生交接预登记', { kind, action, binary, entry, dataPath: state.dataPath, employeeId: state.agent.id, externalModelRequests: 0, expectedNativeTurns: 1 })
  runtime.defer(async () => {
    state.client?.destroy()
    const current = await readLocalConnection(state.dataPath).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    if (current) {
      const client = new CliRpcClient(current.url, current)
      try { await client.connect(); await client.invoke('server:shutdown', { serverId: current.serverId }) } finally { client.destroy() }
      await expect.poll(() => alive(current.pid)).toBe(false)
    }
    if (state.metadata) await expect.poll(() => alive(state.metadata!.pid)).toBe(false)
    await expect.poll(() => processes(state.executable)).toEqual([])
    await runtime.reviewData('原生交接最终退出', { servicePid: state.metadata?.pid, nativeProcesses: state.processes, allExited: true, externalModelRequests: 0 })
  })
})
When('原生CLI退出并由桌面附着同一待决运行', async ({ runtime, nativePending: state }) => {
  const first = await state.command(['run', '--employee', state.agent.id, '--mode', 'ask', '--request-id', state.requestId, '--json', state.action === '输入' ? 'NATIVE_QUESTION' : 'NATIVE_APPROVAL'])
  await runtime.reviewData('原生CLI首次输出', first)
  state.metadata = await readLocalConnection(state.dataPath)
  state.client = new CliRpcClient(state.metadata.url, state.metadata); await state.client.connect()
  expect(first.code, first.stderr + first.stdout).toBe(3)
  expect(JSON.parse(first.stdout.trim().split('\n').at(-1)!)).toMatchObject({ type: 'service', state: 'background', serverId: state.metadata.serverId, pid: state.metadata.pid })
  state.pending = await state.client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(state.pending.state).toBe(state.action === '输入' ? 'waiting_input' : 'waiting_approval')
  expect(state.pending.nativeActions).toHaveLength(1)
  state.processes = await processes(state.executable); expect(state.processes.length).toBeGreaterThan(0)
  await runtime.start()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.map(agent => agent.id)).toContain(state.agent.id)
  expect(await state.client.invoke('server:status')).toMatchObject({ serverId: state.metadata.serverId, desktopAttached: true, owner: { pid: state.metadata.pid } })
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: state.agent.name, exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '执行过程', exact: true }).click()
  if (state.action === '输入') {
    await expect(runtime.page.locator('#agent-execution-drawer')).toContainText('等待你的回复，可直接在聊天中回答。')
    await expect(runtime.page.locator('.messages')).toContainText('这个文档针对什么产品？')
  } else await expect(runtime.page.locator('#agent-execution-drawer [aria-label="原生执行请求"]')).toBeVisible()
  await runtime.reviewData('原待决请求和实际进程', { pending: state.pending, processes: state.processes, sameServicePid: state.metadata.pid })
  await runtime.reviewNativeCheckpoint('终端退出后桌面原生待决请求')
})
Then('桌面处理原生请求后CLI只读核对且重启不重放', async ({ runtime, nativePending: state }) => {
  const action = state.pending!.nativeActions[0]
  const card = runtime.page.locator('#agent-execution-drawer [aria-label="原生执行请求"]')
  const workPath = join(state.dataPath, 'agents', state.agent.id, 'workspace', 'sessions', state.pending!.conversationId!, 'work'), marker = join(workPath, 'permission-marker')
  await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  if (state.action === '输入') { await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('DESKTOP_NATIVE_HANDOFF'); await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click() }
  else { const option = action.options.find(option => state.action === '批准' ? /^(accept|allow|approve)(_|$)/.test(option.id) : /reject|deny|decline/.test(option.id))!; await card.getByRole('button', { name: option.label, exact: true }).click() }
  const follow = await state.command(['receipt', state.requestId, '--follow', '--json'])
  expect(follow.code, follow.stderr + follow.stdout).toBe(0)
  const final = await state.client!.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(final).toMatchObject({ state: 'completed', activeRunIds: [], nativeActions: [] })
  expect(final.runs.map(run => run.id)).toEqual(state.pending!.runs.map(run => run.id))
  await expect.poll(() => state.processes!.some(process => alive(process.pid))).toBe(false)
  const detail = await state.client!.invoke('getConversation', { id: final.conversationId }) as ConversationDetail
  expect(detail.messages.filter(message => message.senderType === 'user')).toHaveLength(state.action === '输入' ? 2 : 1)
  if (state.action === '输入') expect(detail.messages.some(message => message.senderType === 'agent' && message.content.includes('DESKTOP_NATIVE_HANDOFF'))).toBe(true)
  if (state.action === '批准') { expect(await readFile(marker, 'utf8')).toBe('approved'); await runtime.reviewFile('原批准文件', marker, { required: true }) }
  else await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  const turns = await readFile(join(workPath, 'native-turn-requests.jsonl'), 'utf8'); expect(turns.trim().split('\n')).toHaveLength(1)
  await runtime.reviewFile('唯一原生轮次原件', join(workPath, 'native-turn-requests.jsonl'), { required: true })
  await expect(card).toHaveCount(0)
  await runtime.reviewData('桌面回答后CLI原回执', { follow, final, detail, nativeTurns: 1 })
  await runtime.reviewNativeCheckpoint('桌面处理后同一原生运行完成')
  await runtime.close()
  await state.client!.invoke('server:shutdown', { serverId: state.metadata!.serverId }); state.client!.destroy()
  await expect.poll(() => alive(state.metadata!.pid)).toBe(false)
  await runtime.start()
  const restored = await runtime.page.evaluate(requestId => window.boai.request('getMessageExecution', { requestId }), state.requestId)
  expect(restored).toMatchObject({ state: 'completed', activeRunIds: [], nativeActions: [] })
  expect(restored!.runs.map(run => run.id)).toEqual(final.runs.map(run => run.id))
  expect(await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), final.conversationId!)).toMatchObject({ messages: detail.messages })
  expect(await readFile(join(workPath, 'native-turn-requests.jsonl'), 'utf8')).toBe(turns)
  expect(await processes(state.executable)).toEqual([])
  await runtime.reviewData('原生交接重启零重放', { restored, originalServiceExited: true, nativeTurns: 1 })
})


Given('原生CLI交接增加独立的同事', async ({ runtime, nativePending: state }) => {
  await runtime.start()
  state.peer = await runtime.page.evaluate(async employee => window.boai.request('saveAgent', {
    name: '独立交接同事', role: '独立处理', instructions: '完成本人的明确请求', color: '#AABB00', connectionId: '', modelId: '', executionBackend: employee.executionBackend,
    executionPermission: 'ask', skillIds: [], knowledgeIds: [], allowCommands: true, active: true,
  }), state.agent)
  state.peerRequestId = randomUUID()
  await runtime.close()
})
When('桌面与两个终端同时启动不同员工任务', async ({ runtime, nativePending: state }) => {
  const args = (employee: DigitalAgent, requestId: string) => ['run', '--employee', employee.id, '--mode', 'ask', '--request-id', requestId, '--json', 'NATIVE_QUESTION']
  const results = await Promise.allSettled([runtime.start(), state.command(args(state.agent, state.requestId)), state.command(args(state.peer!, state.peerRequestId!))])
  await runtime.reviewData('同时启动原结果', results.map(result => result.status === 'fulfilled' ? { status: result.status, value: result.value } : { status: result.status, error: String(result.reason) }))
  for (const result of results) if (result.status === 'rejected') throw result.reason
  const commands = results.slice(1).map(result => (result as PromiseFulfilledResult<Result>).value)
  for (const result of commands) expect(result.code, result.stdout + result.stderr).toBe(3)
  state.metadata = await readLocalConnection(state.dataPath)
  state.client = new CliRpcClient(state.metadata.url, state.metadata); await state.client.connect()
  for (const result of commands) expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toMatchObject({ type: 'service', serverId: state.metadata.serverId, pid: state.metadata.pid })
  state.pending = await state.client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  state.peerPending = await state.client.invoke('getMessageExecution', { requestId: state.peerRequestId }) as MessageExecution
  for (const pending of [state.pending, state.peerPending]) {
    expect(pending.state).toBe('waiting_input'); expect(pending.nativeActions).toHaveLength(1); expect(pending.runs).toHaveLength(1)
    expect(await runtime.page.evaluate(requestId => window.boai.request('getMessageExecution', { requestId }), pending.requestId)).toEqual(pending)
  }
  expect(state.pending.conversationId).not.toBe(state.peerPending.conversationId)
  expect(state.pending.runs[0].id).not.toBe(state.peerPending.runs[0].id)
  state.processes = await processes(state.executable); expect(state.processes.length).toBeGreaterThanOrEqual(2)
  await runtime.reviewData('双请求同服务原身份', { serverId: state.metadata.serverId, servicePid: state.metadata.pid, owner: JSON.parse(await readFile(join(state.dataPath, '.cli/owner.json'), 'utf8')), pending: state.pending, peerPending: state.peerPending, nativeProcesses: state.processes })
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: state.peer!.name, exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(runtime.page.locator('.messages')).toContainText('这个文档针对什么产品？')
  await runtime.reviewNativeCheckpoint('并发启动后第二员工原问题')
})
Then('取消一个任务不影响另一个从桌面回答且重启不重放', async ({ runtime, nativePending: state }) => {
  const cancelled = await state.command(['cancel', state.pending!.conversationId!, '--request-id', state.requestId, '--json'])
  expect(cancelled.code, cancelled.stdout + cancelled.stderr).toBe(0)
  const peerBeforeAnswer = await state.client!.invoke('getMessageExecution', { requestId: state.peerRequestId }) as MessageExecution
  expect(peerBeforeAnswer).toMatchObject({ state: 'waiting_input', nativeActions: [{ id: state.peerPending!.nativeActions[0].id, runId: state.peerPending!.runs[0].id }] })
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('INDEPENDENT_PEER_ANSWER')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const follow = await state.command(['receipt', state.peerRequestId!, '--follow', '--json'])
  expect(follow.code, follow.stdout + follow.stderr).toBe(0)
  const identities = [{ requestId: state.requestId, before: state.pending!, expected: 'cancelled' }, { requestId: state.peerRequestId!, before: state.peerPending!, expected: 'completed' }]
  const ended: { execution: MessageExecution; detail: ConversationDetail; turns: string; workPath: string }[] = []
  for (const item of identities) {
    const execution = await state.client!.invoke('getMessageExecution', { requestId: item.requestId }) as MessageExecution
    expect(execution).toMatchObject({ state: item.expected, activeRunIds: [], nativeActions: [] }); expect(execution.runs.map(run => run.id)).toEqual(item.before.runs.map(run => run.id))
    const detail = await state.client!.invoke('getConversation', { id: execution.conversationId }) as ConversationDetail
    expect(detail.runs).toHaveLength(1); expect(detail.workItems).toEqual([])
    expect(detail.messages.filter(message => message.senderType === 'user')).toHaveLength(item.expected === 'cancelled' ? 1 : 2)
    const workPath = join(state.dataPath, 'agents', execution.runs[0].agentId, 'workspace', 'sessions', execution.conversationId!, 'work')
    const turns = await readFile(join(workPath, 'native-turn-requests.jsonl'), 'utf8'); expect(turns.trim().split('\n')).toHaveLength(1)
    await runtime.reviewFile(`并发原生轮次-${item.expected}`, join(workPath, 'native-turn-requests.jsonl'), { required: true })
    ended.push({ execution, detail, turns, workPath })
  }
  expect(ended[1].detail.messages.some(message => message.senderType === 'agent' && message.content.includes('INDEPENDENT_PEER_ANSWER'))).toBe(true)
  await expect.poll(() => processes(state.executable)).toEqual([])
  await runtime.reviewData('独立取消和另一员工完成', { cancelled, peerBeforeAnswer, follow, ended, nativeTurns: 2, externalModelRequests: 0 })
  await runtime.reviewNativeCheckpoint('独立取消后同事正常回答')
  await runtime.close()
  // Desktop can win ownership. A surviving independently started service requires its own explicit shutdown.
  if (alive(state.metadata!.pid)) {
    await state.client!.invoke('server:shutdown', { serverId: state.metadata!.serverId })
    await expect.poll(() => alive(state.metadata!.pid)).toBe(false)
  }
  state.client!.destroy()
  await runtime.start()
  const restored = []
  for (const item of ended) {
    const execution = await runtime.page.evaluate(requestId => window.boai.request('getMessageExecution', { requestId }), item.execution.requestId)
    expect(execution).toMatchObject({ state: item.execution.state, activeRunIds: [], nativeActions: [] }); expect(execution!.runs.map(run => run.id)).toEqual(item.execution.runs.map(run => run.id))
    expect(await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), item.execution.conversationId!)).toMatchObject({ messages: item.detail.messages })
    expect(await readFile(join(item.workPath, 'native-turn-requests.jsonl'), 'utf8')).toBe(item.turns)
    restored.push(execution)
  }
  expect(await processes(state.executable)).toEqual([])
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('并发任务重启零重放', { restored, originalServiceExited: true, nativeTurns: 2 })
})

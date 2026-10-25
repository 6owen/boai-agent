/*
 * [INPUT]: Actual isolated Electron and source/current-package CLI with controlled Mastra HTTP.
 * [OUTPUT]: Autostart/background question, desktop attachment, exact answer and original Work after restart.
 * [POS]: Pending input lifecycle BDD; package mode executes the actual bundled CLI and executable.
 * [PROTOCOL]: Changes update Header and tests/e2e/steps/.folder.md.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { test as base } from '../support/test'
import { cliQuestionEndpoint } from '../../fixtures/cli-question'
import { CliRpcClient } from '../../../packages/transport/src/client'
import { readLocalConnection, type LocalConnection } from '../../../packages/transport/src/discovery'
import type { ConversationDetail, Message } from '../../../packages/shared/src/domain'
import type { MessageExecution } from '../../../packages/shared/src/domain/message-execution'

type Result = { stdout: string; stderr: string; code: number }
interface State {
  endpoint?: Awaited<ReturnType<typeof cliQuestionEndpoint>>; dataPath?: string; client?: CliRpcClient; metadata?: LocalConnection
  command?: (args: string[]) => Promise<Result>; requestId?: string; before?: ConversationDetail; pending?: MessageExecution
}
export const test = base.extend<{ pending: State }>({ pending: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('CLI待补充验收已保存员工并关闭隔离桌面', async ({ runtime, pending: state }) => {
  test.setTimeout(120000)
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  const endpoint = state.endpoint = await cliQuestionEndpoint('tool'); runtime.defer(endpoint.close)
  await runtime.start()
  state.dataPath = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '待问题受控来源', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' })
    const snapshot = await window.boai.request('snapshot', undefined), employee = snapshot.agents.find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture' })
    return snapshot.dataPath
  }, endpoint.url)
  await runtime.close()
  const packaged = process.env.BOAI_TEST_PACKAGED_PATH
  const binary = packaged ?? process.execPath, entry = packaged ? resolve(packaged, '../../Resources/app.asar/dist/cli/index.mjs') : resolve('dist/cli/index.mjs')
  state.command = args => new Promise(done => execFile(binary, [entry, '--data-dir', state.dataPath!, ...args], { cwd: runtime.root, env: { PATH: '/usr/bin:/bin', HOME: runtime.root, TMPDIR: runtime.root, ...(packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, timeout: 25000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => done({ stdout, stderr, code: error ? typeof error.code === 'number' ? error.code : -1 : 0 })))
  await runtime.reviewData('实际CLI入口', { binary, entry, packaged: Boolean(packaged), dataPath: state.dataPath })
  runtime.defer(async () => {
    if (state.client?.isConnected) { await state.client.invoke('server:shutdown', { serverId: state.metadata!.serverId }); state.client.destroy() }
    if (state.metadata) await expect.poll(() => { try { process.kill(state.metadata!.pid, 0); return false } catch { return true } }).toBe(true)
    await runtime.reviewData('待问题最终进程与HTTP账本', { servicePid: state.metadata?.pid, serviceExited: true, requests: endpoint.requests, externalModelRequests: 0 })
  })
})

When('CLI自启动后等待问题并由桌面查看原任务', async ({ runtime, pending: state }) => {
  state.requestId = randomUUID()
  const result = await state.command!(['run', '--employee', 'researcher', '--request-id', state.requestId, '--provider', 'openai-compatible', '--model', 'fixture', '--base-url', state.endpoint!.url, '--api-key', 'controlled-pending-test', '--json', '请明确接收人后交付'])
  await runtime.reviewData('自启动CLI原输出', result)
  state.metadata = await readLocalConnection(state.dataPath!)
  state.client = new CliRpcClient(state.metadata.url, state.metadata); await state.client.connect()
  expect(result.code).toBe(3)
  const events = result.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events.at(-1)).toMatchObject({ type: 'service', state: 'background', serverId: state.metadata.serverId, pid: state.metadata.pid })
  state.pending = await state.client.invoke('getMessageExecution', { requestId: state.requestId }) as MessageExecution
  expect(state.pending).toMatchObject({ state: 'waiting_input', questions: [{ question: { canReply: true } }] })
  state.before = await state.client.invoke('getConversation', { id: state.pending.conversationId }) as ConversationDetail
  await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(await state.client.invoke('server:status')).toMatchObject({ serverId: state.metadata.serverId, desktopAttached: true, owner: { pid: state.metadata.pid } })
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(runtime.page.locator(`#message-${state.pending.questions![0].messageId}`)).toContainText('CLI_PENDING_QUESTION')
  await runtime.reviewNativeCheckpoint('CLI退出后桌面原任务问题')
  await runtime.reviewData('原待问题和工作', { pending: state.pending, detail: state.before })
})

Then('CLI回答接续同一个工作且重启不重复执行', async ({ runtime, pending: state }) => {
  const question = state.pending!.questions![0].question!
  const input = { questionId: question.id, expectedRevision: question.revision, requestId: randomUUID(), content: 'CLI_ANSWER_PERSON：交付给本人。' }
  const result = await state.command!(['invoke', 'replyInboxQuestion', JSON.stringify(input), '--json'])
  expect(result.code, result.stderr + result.stdout).toBe(0)
  const accepted = JSON.parse(result.stdout) as Message
  expect(accepted.inboxReply?.workId).toBe(state.before!.workItems![0].id)
  const follow = await state.command!(['receipt', state.requestId!, '--follow', '--json'])
  expect(follow.code, follow.stderr + follow.stdout).toBe(0)
  await expect(runtime.page.locator(`#message-${accepted.id}`)).toContainText('CLI_ANSWER_PERSON')
  await expect(runtime.page.locator('.messages')).toContainText('CLI_PENDING_DELIVERED')
  const after = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), accepted.conversationId)
  expect(after.workItems).toHaveLength(1)
  expect(after.workItems![0]).toMatchObject({ id: state.before!.workItems![0].id, budgetId: state.before!.workItems![0].budgetId, status: 'delivered' })
  expect(after.workBudgets![0]).toMatchObject({ id: state.before!.workBudgets![0].id, deadlineAt: state.before!.workBudgets![0].deadlineAt })
  expect(after.messages.filter(message => message.senderType === 'user')).toHaveLength(2)
  await runtime.reviewNativeCheckpoint('CLI回答后桌面同一任务交付')
  await runtime.reviewData('原问题回答和完成结果', { result, accepted, follow, after })
  const calls = state.endpoint!.requests.length
  await runtime.close()
  await state.client!.invoke('server:shutdown', { serverId: state.metadata!.serverId }); state.client!.destroy()
  await expect.poll(() => { try { process.kill(state.metadata!.pid, 0); return false } catch { return true } }).toBe(true)
  await runtime.start()
  const restored = await runtime.page.evaluate(requestId => window.boai.request('getMessageExecution', { requestId }), state.requestId!)
  expect(restored).toMatchObject({ state: 'completed', activeRunIds: [], questions: [] }); expect(state.endpoint!.requests).toHaveLength(calls)
  expect(await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), accepted.conversationId)).toMatchObject({ messages: after.messages })
  await runtime.reviewData('实际服务退出与桌面重启只读核对', { restored, calls, noReplay: true })
})

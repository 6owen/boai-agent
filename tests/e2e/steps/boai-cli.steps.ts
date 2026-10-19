/*
 * [OUTPUT]: Verbose run keeps diagnostics on stderr, ignores a custom entry when reusing desktop and preserves the same original message/service.
 * [OUTPUT]: 目录审批场景显式--mode ask，原审批前零写入及重启回执保持。
 * [OUTPUT]: bobo首次附件真实CLI/桌面接线，从核心历史打开已受理会话，核心会话仅随已受理消息出现。
 * [OUTPUT]: CLI真实附件走原桌面材料UI和读取，重启回执不重放。
 * [OUTPUT]: Temporary API model selects actual desktop-worker HTTP requests and preserves defaults and credential-free receipts.
 * [OUTPUT]: CLI-selected cwd returns pending approval, then receipt --follow observes the same task; actual file and restart do not persist run-only grants.
 * [OUTPUT]: Third-party Node library directories are explicitly requested read-only alongside the business directory; no implicit toolchain grant.
 * [OUTPUT]: Actual desktop API command calls the same run's CLI file tools; one write, original read and revoked completed lease.
 * [OUTPUT]: Actual desktop worker verifies run credentials; stopping one group employee revokes only that run and preserves the peer grant.
 * [OUTPUT]: Relocated CLI receipt --follow reads original completed execution after desktop restart, with no accepted event or new model request.
 * [OUTPUT]: 仓库外CLI核对桌面运行时版本及原消息双向游标，保留实际来源与进程。
 * [OUTPUT]: 实际桌面群聊按run停止一名员工，同事独立回复，重启原范围保持。
 * [OUTPUT]: CLI会话管理沿原主私聊/清空隐藏与持久回执，真实桌面续聊和重启后重复删除保持新消息。
 * [OUTPUT]: 仓库外单文件run复用桌面并按原requestId去重，保留桌面owner与原两轮消息。
 * [INPUT]: Actual isolated Electron, the bundled CLI copied outside checkout and local model HTTP.
 * [OUTPUT]: stdin/send JSON, competing Node owner refusal, shared conversation, restart receipt and shutdown.
 * [POS]: CLI C1/C2 desktop BDD; controlled model responses, no external provider or personal profile.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { execFile } from 'node:child_process'
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { test as base } from '../support/test'
import { prepareArtifactProtocol } from '../support/artifacts'
import { settledMainline } from '../support/mastra-mainline'
import { readLocalConnection, type LocalConnection } from '../../../src/cli/discovery'
import { CliRpcClient } from '../../../src/cli/client'
import type { Conversation, Message } from '../../../src/shared/domain'
import type { MessageExecution } from '../../../src/shared/domain/message-execution'
import { cancellationEndpoint, cancellationInstructions } from '../../fixtures/cli-cancellation'
import { cliCommandEndpoint } from '../../fixtures/cli-command'
import type { SessionOperationReceipt } from '../../../src/shared/domain/session-operation'
import applicationPackage from '../../../package.json' with { type: 'json' }
import { PROTOCOL_VERSION } from '../../../src/shared/cli/protocol'
import type { RunCliGrant } from '../../../src/shared/cli/run-access'

const first = 'CLI_FIRST_2091：请普通聊天回复这条中文消息。\n保留第二行。'
const second = 'DESKTOP_SECOND_2091：沿原会话继续普通聊天。'
const replies = { [first]: '已收到 CLI_FIRST_2091 的两行内容。', [second]: '沿原会话收到 DESKTOP_SECOND_2091。' }
interface State { attachmentReceipt?: Message; attachmentPath?: string; modelProtocol?: Awaited<ReturnType<typeof prepareArtifactProtocol>>; modelAuth?: boolean[]; modelReceipt?: Message; workingDirectory?: string; toolProtocol?: Awaited<ReturnType<typeof cliCommandEndpoint>>; cancellation?: Awaited<ReturnType<typeof cancellationEndpoint>>; selectedRunId?: string; protocol?: Awaited<ReturnType<typeof prepareArtifactProtocol>>; room?: Conversation; dataPath?: string; metadata?: LocalConnection; requestId?: string; messageId?: string; sessionDeletion?: SessionOperationReceipt; sessionCreation?: SessionOperationReceipt; calls?: number; command?: (args: string[], stdin?: string) => Promise<{ stdout: string; stderr: string }> }
export const test = base.extend<{ cli: State }>({ cli: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('CLI桌面验收已准备原员工和隔离模型协议', async ({ runtime, cli }) => {
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  cli.protocol = await prepareArtifactProtocol(runtime, { chatReplies: replies })
  await runtime.start()
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: 'CLI本地协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' })
    const snapshot = await window.boai.request('snapshot', undefined), employee = snapshot.agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture' })
    const room = await window.boai.request('createConversation', { kind: 'direct', title: 'CLI 同一私聊', agentIds: [employee.id] })
    return { dataPath: snapshot.dataPath, room }
  }, cli.protocol.endpoint.url)
  cli.room = setup.room; cli.dataPath = setup.dataPath
  await expect.poll(async () => { try { cli.metadata = await readLocalConnection(setup.dataPath); return true } catch { return false } }).toBe(true)
  const executable = join(runtime.root, 'boai-standalone.mjs'); await copyFile(resolve('dist/cli/index.mjs'), executable)
  const runCommand = (entry: string, args: string[], stdin?: string) => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(process.execPath, [entry, '--data-dir', setup.dataPath, ...args], { cwd: runtime.root, env: { PATH: process.env.PATH, HOME: runtime.root, TMPDIR: runtime.root }, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr }))
    child.stdin?.end(stdin)
  })
  cli.command = (args, stdin) => runCommand(executable, args, stdin)
  const employees = await cli.command(['employees', '--json'])
  expect(employees.stderr).toBe(''); expect(JSON.parse(employees.stdout).some((employee: { id: string }) => employee.id === 'researcher')).toBe(true)
  const help = await cli.command(['--help']); expect(help.stdout).toContain('BOAI CLI')
  const versions = JSON.parse((await cli.command(['versions', '--json'])).stdout)
  const desktopVersions = await runtime.page.evaluate(() => window.boai.request('getRuntimeVersions', undefined))
  expect(versions).toMatchObject({ cli: applicationPackage.version, service: applicationPackage.version, protocol: PROTOCOL_VERSION, runtimes: desktopVersions })
  expect(versions.runtimes.plugins.every((item: { source: string }) => item.source === 'verified-package')).toBe(true)
  await runtime.reviewData('CLI与桌面共用当前运行时版本', { cli: versions, desktop: desktopVersions })
  // serve includes the runtime/dependencies; the relocated single-file client intentionally has neither.
  await expect(runCommand(resolve('dist/cli/index.mjs'), ['serve'])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('SERVER_BUSY') })
  const unchanged = await readLocalConnection(setup.dataPath)
  expect(unchanged.serverId).toBe(cli.metadata!.serverId)
  await runtime.reviewData('桌面owner拒绝独立服务竞争', { existingServerId: cli.metadata!.serverId, serverIdAfterRefusal: unchanged.serverId, contenderExit: 1, refusalCode: 'SERVER_BUSY' })
})

When('CLI与桌面向同一员工各发送一条消息', async ({ runtime, cli }) => {
  cli.requestId = randomUUID()
  const request = { conversationId: cli.room!.id, requestId: cli.requestId, content: first, mentionIds: [] }
  const sent = await cli.command!(['send', cli.room!.id, '--stdin', '--request-id', cli.requestId, '--json'], first)
  const events = sent.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(sent.stderr).toBe('')
  expect(events.find(event => event.type === 'accepted')).toMatchObject({ requestId: cli.requestId, conversationId: cli.room!.id })
  expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
  expect(events.some(event => event.type === 'execution')).toBe(true)
  expect(events.filter(event => event.type === 'message').at(-1).message.content).toBe(replies[first])
  await runtime.reviewData('独立CLI标准输入和原执行事件', { stdin: first, events, stderr: sent.stderr, exitCode: 0 })
  const accepted = await cli.command!(['invoke', 'getMessageReceipt', JSON.stringify({ requestId: cli.requestId }), '--json'])
  const message = JSON.parse(accepted.stdout) as Message; cli.messageId = message.id
  expect(message.content).toBe(first); expect(accepted.stderr).toBe('')
  const repeated = JSON.parse((await cli.command!(['invoke', 'sendMessage', JSON.stringify(request), '--json'])).stdout) as Message
  expect(repeated.id).toBe(message.id)
  const run = await cli.command!(['run', '--employee', 'researcher', '--stdin', '--request-id', cli.requestId!, '--json', '--verbose', '--no-spinner', '--no-cleanup', '--server-entry', join(runtime.root, 'not present.mjs')], first)
  const runEvents = run.stdout.trim().split('\n').map(line => JSON.parse(line))
  const diagnostics = run.stderr.trim().split('\n').map(line => JSON.parse(line))
  expect(diagnostics.map(event => event.event)).toEqual(['connecting', 'service_reused', 'connected'])
  expect(diagnostics.every(event => event.type === 'diagnostic')).toBe(true)
  expect(run.stderr).not.toContain(first); expect(run.stderr).not.toContain(cli.metadata!.token); expect(run.stderr).not.toContain('\x1b')
  expect(runEvents.some(event => event.type === 'diagnostic')).toBe(false)
  expect(runEvents.find(event => event.type === 'accepted')).toMatchObject({ messageId: message.id, conversationId: cli.room!.id })
  expect(runEvents.at(-1)).toMatchObject({ type: 'service', state: 'reused', serverId: cli.metadata!.serverId })
  await runtime.reviewData('run复用桌面原服务和原消息', { events: runEvents, exitCode: 0, stderr: run.stderr })
  await settledMainline(runtime, cli.room!.id, 1, 0)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(runtime.page.locator(`#message-${message.id}`)).toContainText('CLI_FIRST_2091')
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(second)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settledMainline(runtime, cli.room!.id, 2, 0)
  expect(detail.workItems).toEqual([])
  const history = JSON.parse((await cli.command!(['session', 'messages', cli.room!.id, '--json'])).stdout)
  expect(history.items.filter((item: { message?: Message }) => item.message?.senderType === 'user').map((item: { message: Message }) => item.message.content)).toEqual(expect.arrayContaining([first, second]))
  const latest = JSON.parse((await cli.command!(['session', 'messages', cli.room!.id, '--limit', '2', '--json'])).stdout)
  const older = JSON.parse((await cli.command!(['session', 'messages', cli.room!.id, '--limit', '2', '--cursor', JSON.stringify(latest.beforeCursor), '--json'])).stdout)
  expect([...older.items, ...latest.items].map((item: { messageId: string }) => item.messageId)).toEqual(history.items.map((item: { messageId: string }) => item.messageId))
  const newer = JSON.parse((await cli.command!(['session', 'messages', cli.room!.id, '--limit', '2', '--cursor', JSON.stringify(older.afterCursor), '--direction', 'after', '--json'])).stdout)
  expect(newer.items).toEqual(latest.items)
  await runtime.reviewData('CLI原历史双向游标', { history, older, latest, newer })
  await expect(runtime.page.locator('.messages')).toContainText(replies[second])
  await runtime.reviewNativeCheckpoint('CLI与桌面同一私聊两轮原消息')
  await runtime.reviewData('CLI两入口原回执与历史', { accepted: message, history, workItems: detail.workItems })
})

Then('CLI重启连接保留原回执且不重放旧执行', async ({ runtime, cli }) => {
  const old = cli.metadata!, before = cli.protocol!.endpoint.requests.length
  await runtime.restart()
  let current: LocalConnection | undefined
  await expect.poll(async () => { try { current = await readLocalConnection(cli.dataPath!); return current.serverId !== old.serverId } catch { return false } }).toBe(true)
  expect(current!.token).not.toBe(old.token)
  const stale = new CliRpcClient(current!.url, { token: old.token, workspaceId: old.workspaceId }); try { await expect(stale.connect()).rejects.toMatchObject({ code: 'AUTH_FAILED' }) } finally { stale.destroy() }
  const receipt = JSON.parse((await cli.command!(['receipt', cli.requestId!, '--json'])).stdout) as MessageExecution
  expect(receipt.messageId).toBe(cli.messageId); expect(receipt.state).toBe('completed'); expect(receipt.activeRunIds).toEqual([])
  const followed = await cli.command!(['receipt', cli.requestId!, '--follow', '--json'])
  const events = followed.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(followed.stderr).toBe('')
  expect(events[0]).toMatchObject({ type: 'request', operation: 'observe', requestId: cli.requestId })
  expect(events.some(event => event.type === 'accepted')).toBe(false)
  expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
  expect(events.filter(event => event.type === 'message').at(-1).message.content).toBe(replies[first])
  await runtime.reviewData('重启后CLI只读续看原执行', { events, exitCode: 0, modelRequestsBefore: before, modelRequestsAfter: cli.protocol!.endpoint.requests.length })
  const history = JSON.parse((await cli.command!(['session', 'messages', cli.room!.id, '--json'])).stdout)
  expect(history.items.filter((item: { message?: Message }) => item.message?.senderType === 'user')).toHaveLength(2)
  expect(cli.protocol!.endpoint.requests).toHaveLength(before)
  expect(cli.protocol!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('重启原历史与零重放', { messageId: receipt.messageId, execution: receipt, history, controlledModelRequests: before, requestsAfterRestart: cli.protocol!.endpoint.requests.length, oldCredentialRejected: true, sameWorkspace: old.workspaceId === current!.workspaceId })
  await runtime.close()
  await expect(lstat(join(cli.dataPath!, '.cli/connection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  const closed = new CliRpcClient(current!.url, current!); try { await expect(closed.connect()).rejects.toMatchObject({ code: 'CLIENT_DISCONNECTED' }) } finally { closed.destroy() }
})

When('CLI创建会话并清空隐藏原私聊后由桌面继续发送', async ({ runtime, cli }) => {
  const employeeId = await runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => !['researcher','bobo'].includes(agent.id))!.id)
  const createId = randomUUID()
  cli.sessionCreation = JSON.parse((await cli.command!(['session','create','--employee',employeeId,'--name','CLI新建私聊','--request-id',createId,'--json'])).stdout)
  expect(cli.sessionCreation).toMatchObject({ operation: 'create', state: 'completed', created: true, employeeId })
  expect(JSON.parse((await cli.command!(['session','create','--employee',employeeId,'--name','CLI新建私聊','--request-id',createId,'--json'])).stdout)).toEqual(cli.sessionCreation)
  expect(await runtime.page.evaluate(async id => (await window.boai.request('getConversation', { id })).conversation.title, cli.sessionCreation!.conversationId)).toBe('CLI新建私聊')
  await cli.command!(['send',cli.room!.id,first,'--json'])
  cli.sessionDeletion = JSON.parse((await cli.command!(['session','delete',cli.room!.id,'--request-id',randomUUID(),'--json'])).stdout)
  expect(cli.sessionDeletion).toMatchObject({ operation: 'delete', state: 'completed', conversationId: cli.room!.id })
  const cleared = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), cli.room!.id)
  expect(cleared.messages).toEqual([]); expect(cleared.conversation.list?.hidden).toBe(true)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(second)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settledMainline(runtime, cli.room!.id, 1, 0)
  expect(detail.messages.filter(message => message.senderType === 'user').map(message => message.content)).toEqual([second])
  await expect(runtime.page.locator('.messages')).toContainText(replies[second])
  cli.calls = cli.protocol!.endpoint.requests.length
  await runtime.reviewNativeCheckpoint('CLI删除后桌面原主私聊的新消息')
  await runtime.reviewData('CLI会话管理原创建删除与后续消息', { creation: cli.sessionCreation, deletion: cli.sessionDeletion, cleared, after: detail, calls: cli.calls })
})

Then('重启后重复会话删除只返回原回执并保留新消息', async ({ runtime, cli }) => {
  const old = await readLocalConnection(cli.dataPath!)
  await runtime.close(); await runtime.start()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  await expect.poll(async () => { try { return (await readLocalConnection(cli.dataPath!)).serverId !== old.serverId } catch { return false } }).toBe(true)
  expect(JSON.parse((await cli.command!(['session','receipt',cli.sessionCreation!.requestId,'--json'])).stdout)).toEqual(cli.sessionCreation)
  expect(JSON.parse((await cli.command!(['session','delete',cli.room!.id,'--request-id',cli.sessionDeletion!.requestId,'--json'])).stdout)).toEqual(cli.sessionDeletion)
  const history = JSON.parse((await cli.command!(['session','messages',cli.room!.id,'--json'])).stdout)
  expect(history.items.filter((item: { message?: Message }) => item.message?.senderType === 'user').map((item: { message: Message }) => item.message.content)).toEqual([second])
  expect(cli.protocol!.endpoint.requests).toHaveLength(cli.calls!)
  expect(cli.protocol!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('重启后原会话回执和新消息不重放不重删', { creation: cli.sessionCreation, deletion: cli.sessionDeletion, history, callsBefore: cli.calls, callsAfter: cli.protocol!.endpoint.requests.length })
  await runtime.close()
  await expect(lstat(join(cli.dataPath!, '.cli/connection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

Given('CLI精确停止验收已启动两个独立执行的员工', async ({ runtime, cli }) => {
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  cli.cancellation = await cancellationEndpoint(); runtime.defer(cli.cancellation.close)
  await runtime.start()
  const setup = await runtime.page.evaluate(async ({ url, instructions }) => {
    const connection = await window.boai.request('saveConnection', { name: 'CLI取消本地协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' })
    const snapshot = await window.boai.request('snapshot', undefined)
    for (const agent of snapshot.agents.filter(agent => agent.id in instructions)) {
      const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...definition } = agent
      await window.boai.request('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture', instructions: instructions[agent.id as keyof typeof instructions] })
    }
    const room = await window.boai.request('createConversation', { kind: 'group', title: 'CLI精确停止群', agentIds: ['researcher', 'writer'] })
    return { dataPath: snapshot.dataPath, room }
  }, { url: cli.cancellation.url, instructions: cancellationInstructions })
  cli.dataPath = setup.dataPath; cli.room = setup.room
  await expect.poll(async () => { try { cli.metadata = await readLocalConnection(setup.dataPath); return true } catch { return false } }).toBe(true)
  const executable = join(runtime.root, 'boai-cancel.mjs'); await copyFile(resolve('dist/cli/index.mjs'), executable)
  cli.command = args => new Promise((done, reject) => {
    execFile(process.execPath, [executable, '--data-dir', setup.dataPath, ...args], { cwd: runtime.root, env: { PATH: process.env.PATH, HOME: runtime.root, TMPDIR: runtime.root }, timeout: 20_000 }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : done({ stdout, stderr }))
  })
  cli.requestId = randomUUID()
  await runtime.page.evaluate(input => window.boai.request('sendMessage', input), { conversationId: setup.room.id, content: '两人分别独立回复', requestId: cli.requestId, mentionIds: [] })
  await expect.poll(() => cli.cancellation!.pending.size, { message: '两名员工实际HTTP请求均已开始' }).toBe(2)
  await runtime.page.getByRole('button', { name: /CLI精确停止群/ }).click()
})

When('CLI拒绝歧义后只停止指定员工并保留同事执行', async ({ runtime, cli }) => {
  const targets = await runtime.page.evaluate(conversationId => window.boai.request('getCancellationTargets', { conversationId }), cli.room!.id)
  cli.selectedRunId = targets.find(target => target.agentId === 'researcher' && target.kind === 'run')!.runId
  const writerRunId = targets.find(target => target.agentId === 'writer' && target.kind === 'run')!.runId!
  const issue = async (runId: string) => JSON.parse((await cli.command!(['invoke','auth:issue-run',JSON.stringify({ runId }),'--json'])).stdout) as RunCliGrant
  const [researcherGrant, writerGrant] = await Promise.all([issue(cli.selectedRunId!), issue(writerRunId)])
  const researcher = new CliRpcClient(cli.metadata!.url, { token: researcherGrant.token }), writer = new CliRpcClient(cli.metadata!.url, { token: writerGrant.token })
  runtime.defer(async () => { researcher.destroy(); writer.destroy() })
  await researcher.connect(); await writer.connect()
  expect(researcher.handshake?.registeredChannels).toEqual(['employee:context','employee:tools','employee:invoke'])
  expect(await researcher.invoke('employee:context')).toMatchObject({ employeeId: 'researcher', runId: cli.selectedRunId })
  await expect(researcher.invoke('approve', { id: 'self-approval', approved: true })).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' })
  let rejected: { code?: number; stdout?: string } | undefined
  try { await cli.command!(['cancel',cli.room!.id,'--json']) } catch (error) { rejected = error as typeof rejected }
  expect(rejected?.code).toBe(2); expect(JSON.parse(rejected!.stdout!).targets).toHaveLength(2)
  expect(cli.cancellation!.closed).toEqual([])
  const output = await cli.command!(['cancel',cli.room!.id,'--run',cli.selectedRunId!,'--json'])
  const events = output.stdout.trim().split('\n').map(line => JSON.parse(line)), result = events.at(-1)
  expect(result).toMatchObject({ state: 'stopped', activeRunIds: [], runIds: [cli.selectedRunId] })
  await expect.poll(() => cli.cancellation!.closed).toEqual(['researcher'])
  expect(cli.cancellation!.pending.has('writer')).toBe(true)
  await expect(researcher.invoke('employee:context')).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  const peerContext = await writer.invoke('employee:context')
  expect(peerContext).toMatchObject({ employeeId: 'writer', runId: writerRunId })
  const { token: _researcherToken, ...researcherIdentity } = researcherGrant, { token: _writerToken, ...writerIdentity } = writerGrant
  await runtime.reviewData('员工运行凭据隔离与停止撤回', { researcherIdentity, writerIdentity, peerContext, stoppedCredentialRejected: true, ownerMethodUnavailable: true })
  cli.cancellation!.publish('writer')
  await expect.poll(async () => JSON.parse((await cli.command!(['receipt',cli.requestId!,'--json'])).stdout).activeRunIds).toEqual([])
  await expect(writer.invoke('employee:context')).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  await expect(runtime.page.locator('.messages')).toContainText('writer 的独立公开回复')
  await runtime.reviewNativeCheckpoint('只停止指定员工而同事完成原回复')
  await runtime.reviewData('群聊精确停止实际回执', { targets, ambiguousExit: rejected?.code, events, closed: cli.cancellation!.closed, requests: cli.cancellation!.requests.length })
})

Then('桌面重启保留精确停止记录且不重新执行或取消其他运行', async ({ runtime, cli }) => {
  const before = cli.cancellation!.requests.length, oldServerId = (await readLocalConnection(cli.dataPath!)).serverId
  await runtime.restart()
  // Preload availability alone is not service readiness. Observe the new owner before mutation.
  const observations: string[] = []
  await expect.poll(async () => {
    try {
      const connection = await readLocalConnection(cli.dataPath!)
      if (connection.serverId === oldServerId) { observations.push('old-owner'); return false }
      const client = new CliRpcClient(connection.url, connection)
      try { await client.connect(); await client.invoke('ping'); observations.push('authenticated-new-owner'); return true }
      finally { client.destroy() }
    } catch (error) { observations.push((error as { code?: string }).code ?? 'not-ready'); return false }
  }).toBe(true)
  await runtime.reviewData('重启后先只读核对新服务就绪', { oldServerId, observations })
  const result = await cli.command!(['cancel',cli.room!.id,'--run',cli.selectedRunId!,'--json'])
  const stopped = result.stdout.trim().split('\n').map(line => JSON.parse(line)).at(-1)
  expect(stopped).toMatchObject({ state: 'stopped', activeRunIds: [], runIds: [cli.selectedRunId] })
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), cli.room!.id)
  expect(detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.senderId)).toEqual(['writer'])
  expect(cli.cancellation!.errors).toEqual([]); expect(cli.cancellation!.requests).toHaveLength(before)
  await runtime.reviewData('精确停止重启零重放', { stopped, requestsBefore: before, requestsAfter: cli.cancellation!.requests.length, runs: detail.runs, turns: detail.turns, deliveries: detail.deliveries })
})


Given('桌面CLI工具验收已启动实际API命令', async ({ runtime, cli }) => {
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  const executable = join(runtime.root, 'boai-tools.mjs'); await copyFile(resolve('dist/cli/index.mjs'), executable)
  cli.toolProtocol = await cliCommandEndpoint(executable); runtime.trackServer(cli.toolProtocol.server)
  await runtime.start()
  cli.room = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: 'CLI工具协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' })
    const snapshot = await window.boai.request('snapshot', undefined), employee = snapshot.agents.find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture', allowCommands: true, executionPermission: 'full-access' })
    const room = await window.boai.request('createConversation', { kind: 'direct', title: 'CLI工具实际执行', agentIds: [employee.id] })
    await window.boai.request('sendMessage', { conversationId: room.id, requestId: crypto.randomUUID(), content: '通过原CLI工具写入并读回文件', mentionIds: [] })
    return room
  }, cli.toolProtocol.url)
})

Then('CLI工具沿原员工权限完成文件读写且运行凭据已撤回', async ({ runtime, cli }) => {
  const detail = await settledMainline(runtime, cli.room!.id, 1, 0)
  expect(cli.toolProtocol!.commandReceipt).toMatchObject({ approved: true, exitCode: 0 })
  const identity = JSON.parse(cli.toolProtocol!.commandReceipt!.stdout)
  expect(identity).toMatchObject({ context: { employeeId: 'researcher', conversationId: cli.room!.id }, denied: 'CHANNEL_NOT_FOUND', nested: { same: true, content: 'CLI_NESTED_FILE' }, hasToken: true, hostSecret: false })
  const dataPath = await runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).dataPath)
  const metadata = await readLocalConnection(dataPath), owner = new CliRpcClient(metadata.url, metadata)
  await owner.connect()
  try { expect(await owner.invoke('auth:revoke-run', { grantId: identity.context.grantId })).toEqual({ revoked: false }) } finally { owner.destroy() }
  const run = detail.runs.find(run => run.id === identity.run)!
  expect(run.status).toBe('completed')
  expect(run.toolEvents.filter(event => event.name === 'write_file' && event.status === 'completed')).toHaveLength(1)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(runtime.page.locator('.messages')).toContainText('命令身份已核对')
  await runtime.reviewNativeCheckpoint('桌面CLI原文件工具与正常员工回复')
  await runtime.reviewData('桌面CLI工具实际文件与回执', { identity, run, workItems: detail.workItems, credentialRevoked: true, controlledRequests: cli.toolProtocol!.requests.length, externalRequests: 0 })
})

Given('CLI工作目录验收已准备未授权业务目录', async ({ runtime, cli }) => {
  test.skip(process.platform !== 'darwin', '当前命令目录隔离为macOS实现')
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  const root = await realpath(runtime.root), cwd = join(root, 'business project')
  await mkdir(cwd); cli.workingDirectory = cwd
  const executable = join(cwd, 'boai.mjs'); await copyFile(resolve('dist/cli/index.mjs'), executable)
  // Electron and this test's external Node load different libraries. The command
  // must explicitly request the latter; selecting cwd does not authorize them.
  const libraries = (process.report.getReport() as { sharedObjects?: string[] }).sharedObjects ?? []
  const libraryDirectories = [...new Set(await Promise.all(libraries.filter(file => file.startsWith('/opt/homebrew/') || file.startsWith('/usr/local/')).map(async file => dirname(await realpath(file)))))]
  cli.toolProtocol = await cliCommandEndpoint(executable, true, [{ path: cwd, access: 'read-write' }, ...libraryDirectories.map(path => ({ path, access: 'read-only' as const }))]); runtime.trackServer(cli.toolProtocol.server)
  await runtime.start({ dataDir: join(root, 'product') })
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: 'CLI目录本地协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' })
    const snapshot = await window.boai.request('snapshot', undefined), employee = snapshot.agents.find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture', allowCommands: true, executionPermission: 'ask', directoryGrants: [] })
    const room = await window.boai.request('createConversation', { kind: 'direct', title: 'CLI工作位置', agentIds: [employee.id] })
    return { room, dataPath: snapshot.dataPath }
  }, cli.toolProtocol.url)
  cli.room = setup.room; cli.dataPath = setup.dataPath; cli.requestId = randomUUID()
  await expect.poll(async () => { try { cli.metadata = await readLocalConnection(setup.dataPath); return true } catch { return false } }).toBe(true)
  cli.command = args => new Promise((done, reject) => {
    execFile(process.execPath, [executable, '--data-dir', setup.dataPath, ...args], { cwd: root, env: { PATH: process.env.PATH, HOME: root, TMPDIR: root }, timeout: 45_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : done({ stdout, stderr }))
  })
})

When('CLI指定工作目录并在桌面批准本次命令和目录', async ({ runtime, cli }) => {
  const rejectedId = randomUUID()
  const rejected = await cli.command!(['send', cli.room!.id, '--mode', 'allow-all', '--request-id', rejectedId, '--json', '不允许临时跳过审批']).then(() => ({ code: 0 }), error => ({ code: error.code }))
  expect(rejected.code).toBe(1)
  expect(await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), rejectedId)).toBeNull()
  expect(cli.toolProtocol!.requests).toHaveLength(0)
  await runtime.reviewData('CLI显式全权与保存ask不符时零受理', { requestId: rejectedId, exitCode: rejected.code, controlledRequests: 0 })
  // Capture failures immediately while the user-visible approval is pending.
  const pending = cli.command!(['send', cli.room!.id, '--mode', 'ask', '--cwd', cli.workingDirectory!, '--request-id', cli.requestId!, '--json', '在指定目录写入并读回文件']).then(result => ({ ...result, error: undefined }), error => ({ stdout: error.stdout, stderr: error.stderr, error }))
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  const card = runtime.page.getByRole('region', { name: '研究员 的运行命令并授权目录审批', exact: true })
  await expect(card).toBeVisible(); await expect(card).toContainText(cli.workingDirectory!)
  await expect(readFile(join(cli.workingDirectory!, 'cli-nested.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  await runtime.reviewNativeCheckpoint('CLI所选业务目录仍需本人批准')
  const waiting = await pending
  expect(waiting.error?.code).toBe(3)
  const waitingEvents = waiting.stdout.trim().split('\n').map((line: string) => JSON.parse(line))
  expect(waitingEvents.at(-1)).toMatchObject({ type: 'result', state: 'waiting_approval', exitCode: 3 })
  await runtime.reviewData('CLI本次目录原审批等待', { events: waitingEvents, stderr: waiting.stderr, exitCode: 3 })
  await card.getByRole('button', { name: '允许命令及本次目录访问', exact: true }).click()
  await settledMainline(runtime, cli.room!.id, 1, 0)
  const result = await cli.command!(['receipt', cli.requestId!, '--follow', '--json'])
  const events = result.stdout.trim().split('\n').map((line: string) => JSON.parse(line))
  expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
  await runtime.reviewData('CLI所选目录实际进程终态', { events, stderr: result.stderr, exitCode: 0 })
})

Then('文件写入指定目录且重启只保留原回执而不扩大授权', async ({ runtime, cli }) => {
  const detail = await settledMainline(runtime, cli.room!.id, 1, 0)
  await runtime.reviewData('指定cwd的原命令回执', cli.toolProtocol!.commandReceipt)
  expect(cli.toolProtocol!.commandReceipt).toMatchObject({ approved: true, exitCode: 0 })
  const identity = JSON.parse(cli.toolProtocol!.commandReceipt!.stdout)
  expect(identity.cwd).toBe(cli.workingDirectory); expect(identity.nested).toEqual({ same: true, content: 'CLI_NESTED_FILE' })
  const output = join(cli.workingDirectory!, 'cli-nested.txt')
  expect(await readFile(output, 'utf8')).toBe('CLI_NESTED_FILE')
  const receipt = JSON.parse((await cli.command!(['invoke', 'getMessageReceipt', JSON.stringify({ requestId: cli.requestId }), '--json'])).stdout) as Message
  expect(detail.messages.find(message => message.id === receipt.id)).toEqual(receipt)
  expect(receipt).toMatchObject({ workingDirectory: cli.workingDirectory, content: '在指定目录写入并读回文件', permissionExpectation: { permission: 'ask', agentIds: ['researcher'] } })
  expect(detail.runs.find(run => run.id === identity.run)?.toolEvents.filter(event => event.name === 'write_file' && event.status === 'completed')).toHaveLength(1)
  await expect(runtime.page.locator('.messages')).toContainText('命令身份已核对')
  await runtime.reviewNativeCheckpoint('批准后在指定工作位置完成文件写入')
  await runtime.reviewFile('业务目录实际文件', output, { required: true })
  const requests = cli.toolProtocol!.requests.length, oldServer = cli.metadata!.serverId
  await runtime.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(cli.dataPath!)).serverId !== oldServer } catch { return false } }).toBe(true)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(agent => agent.id === 'researcher')?.directoryGrants).toEqual([])
  expect(snapshot.agents.find(agent => agent.id === 'researcher')?.executionPermission).toBe('ask')
  const reread = JSON.parse((await cli.command!(['invoke', 'getMessageReceipt', JSON.stringify({ requestId: cli.requestId }), '--json'])).stdout)
  expect(reread).toEqual(receipt); expect(cli.toolProtocol!.requests).toHaveLength(requests)
  expect(await readFile(output, 'utf8')).toBe('CLI_NESTED_FILE'); expect(runtime.errors).toEqual([])
  await runtime.reviewData('指定cwd的实际目录和重启授权', { identity, receipt, reread, grantsAfterRestart: [], beforeRestart: requests, controlledRequests: cli.toolProtocol!.requests.length, externalRequests: 0 })
})

When('CLI选择本轮API模型并由桌面按原配置继续聊天', async ({ runtime, cli }) => {
  const content = 'CLI_MODEL_ONCE_4115', reply = '本轮模型来源已核对', key = 'SYNTHETIC_DESKTOP_MODEL_4115'
  cli.modelProtocol = await prepareArtifactProtocol(runtime, { chatReplies: { [content]: reply } })
  cli.modelAuth = []
  cli.modelProtocol.endpoint.server.on('request', request => cli.modelAuth!.push(request.headers.authorization === `Bearer ${key}`))
  const before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  cli.requestId = randomUUID()
  const result = await cli.command!(['send', cli.room!.id, '--provider', 'openai-compatible', '--model', 'fixture-selected', '--base-url', cli.modelProtocol.endpoint.url, '--api-key', key, '--request-id', cli.requestId, '--json', content])
  expect(result.stdout).not.toContain(key); expect(result.stderr).toBe('')
  await settledMainline(runtime, cli.room!.id, 1, 0)
  expect(cli.protocol!.endpoint.requests).toHaveLength(0)
  expect(cli.modelProtocol.endpoint.requests.length).toBeGreaterThanOrEqual(2)
  expect(cli.modelProtocol.endpoint.requests.every(body => body.model === 'fixture-selected')).toBe(true)
  expect(cli.modelAuth!.length).toBe(cli.modelProtocol.endpoint.requests.length); expect(cli.modelAuth!.every(Boolean)).toBe(true)
  const receipt = await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), cli.requestId)
  expect(receipt).toMatchObject({ content, apiModelSource: { employeeId: 'researcher', connection: { defaultModel: 'fixture-selected', baseUrl: cli.modelProtocol.endpoint.url } } })
  expect(JSON.stringify(receipt)).not.toContain(key); cli.modelReceipt = receipt!
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(runtime.page.locator('.messages')).toContainText(reply)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(second)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await settledMainline(runtime, cli.room!.id, 2, 0)
  await expect(runtime.page.locator('.messages')).toContainText(replies[second])
  expect(cli.protocol!.endpoint.requests.length).toBeGreaterThanOrEqual(2)
  expect(cli.protocol!.endpoint.requests.every(body => body.model === 'fixture')).toBe(true)
  const after = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(after.connections).toEqual(before.connections)
  expect(after.agents.find(agent => agent.id === 'researcher')).toEqual(before.agents.find(agent => agent.id === 'researcher'))
  await runtime.reviewNativeCheckpoint('CLI本轮模型与桌面默认模型在同一聊天分别回复')
  await runtime.reviewData('实际桌面模型来源与默认保持', { receipt, authorizationMatches: cli.modelAuth, selectedModels: cli.modelProtocol.endpoint.requests.map(body => body.model), defaultModels: cli.protocol!.endpoint.requests.map(body => body.model), defaultsUnchanged: true, externalRequests: 0 })
})

Then('临时模型默认不变且重启只核对原回执', async ({ runtime, cli }) => {
  const selectedCount = cli.modelProtocol!.endpoint.requests.length, normalCount = cli.protocol!.endpoint.requests.length, previous = await readLocalConnection(cli.dataPath!)
  await runtime.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(cli.dataPath!)).serverId !== previous.serverId } catch { return false } }).toBe(true)
  const result = await cli.command!(['receipt', cli.requestId!, '--follow', '--json']), events = result.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
  expect(events.some(event => event.type === 'accepted')).toBe(false)
  const reread = await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), cli.requestId!)
  expect(reread).toEqual(cli.modelReceipt)
  expect(cli.modelProtocol!.endpoint.requests).toHaveLength(selectedCount); expect(cli.protocol!.endpoint.requests).toHaveLength(normalCount)
  expect(cli.modelProtocol!.errors).toEqual([]); expect(cli.protocol!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('本轮模型重启回执无重发', { receipt: reread, controlledRequests: selectedCount + normalCount, beforeRestart: selectedCount + normalCount, afterRestart: cli.modelProtocol!.endpoint.requests.length + cli.protocol!.endpoint.requests.length, externalRequests: 0 })
})


When('CLI上传本地附件并发送到原员工聊天', async ({ runtime, cli }) => {
  cli.attachmentPath = join(await realpath(runtime.root), '项目资料.md')
  await writeFile(cli.attachmentPath, '# 项目资料\nCLI_ATTACHMENT_DESKTOP_1902')
  cli.requestId = randomUUID()
  const sent = await cli.command!(['send', cli.room!.id, '--attachment', cli.attachmentPath, '--request-id', cli.requestId, '--json', first]).catch(async error => {
    await runtime.reviewData('CLI附件发送失败原件', { stdout: error.stdout, stderr: error.stderr, code: error.code, signal: error.signal, protocolErrors: cli.protocol!.errors, requests: cli.protocol!.endpoint.requests, execution: await runtime.page.evaluate(requestId => window.boai.request('getMessageExecution', { requestId }), cli.requestId!) })
    throw error
  })
  expect(sent.stderr).toBe('')
  await settledMainline(runtime, cli.room!.id, 1, 0)
  const receipt = await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), cli.requestId)
  expect(receipt!.materialIds).toHaveLength(1); cli.attachmentReceipt = receipt!
  const preview = await runtime.page.evaluate(id => window.boai.request('getMaterialPreview', { id }), receipt!.materialIds![0])
  expect(preview.text).toBe('# 项目资料\nCLI_ATTACHMENT_DESKTOP_1902')
  expect(preview.material).toMatchObject({ name: '项目资料.md', deliveryScope: 'conversation', messageId: receipt!.id })
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(runtime.page.locator(`#message-${receipt!.id}`)).toContainText('项目资料.md')
  await runtime.reviewNativeCheckpoint('CLI附件显示于原消息')
  await runtime.reviewData('CLI附件原准备与发送回执', { receipt, preview })
  await runtime.reviewFile('CLI实际输入原件', cli.attachmentPath, { required: true })
})

Then('桌面可读原附件且重启回执不重复执行', async ({ runtime, cli }) => {
  const before = cli.protocol!.endpoint.requests.length, server = (await readLocalConnection(cli.dataPath!)).serverId
  await runtime.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(cli.dataPath!)).serverId !== server } catch { return false } }).toBe(true)
  await cli.command!(['send', cli.room!.id, '--attachment', cli.attachmentPath!, '--request-id', cli.requestId!, '--json', first])
  const receipt = await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), cli.requestId!)
  expect(receipt).toEqual(cli.attachmentReceipt)
  const preview = await runtime.page.evaluate(id => window.boai.request('getMaterialPreview', { id }), receipt!.materialIds![0])
  expect(preview.text).toContain('CLI_ATTACHMENT_DESKTOP_1902')
  expect(cli.protocol!.endpoint.requests).toHaveLength(before); expect(runtime.errors).toEqual([])
  await runtime.reviewData('CLI附件重启原件及零重发', { receipt, preview, beforeRestart: before, afterRestart: cli.protocol!.endpoint.requests.length, externalRequests: 0 })
})


When('CLI不预建会话而向bobo首次发送附件', async ({ runtime, cli }) => {
  const before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(before.conversations.filter(room => room.purpose === 'core')).toHaveLength(0)
  cli.attachmentPath = join(await realpath(runtime.root), 'bobo首期资料.md')
  await writeFile(cli.attachmentPath, '# 首期资料\nBOBO_FIRST_DESKTOP_7704')
  cli.requestId = randomUUID()
  await cli.command!(['run', '--attachment', cli.attachmentPath, '--request-id', cli.requestId, '--json', first])
  const receipt = await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), cli.requestId)
  cli.attachmentReceipt = receipt!
  const detail = await settledMainline(runtime, receipt!.conversationId, 1, 0); cli.room = detail.conversation
  expect(detail.conversation).toMatchObject({ purpose: 'core', agentIds: ['bobo'] })
  expect(receipt!.materialIds).toHaveLength(1); expect(receipt!.attachmentInputs).toHaveLength(1)
  const preview = await runtime.page.evaluate(id => window.boai.request('getMaterialPreview', { id }), receipt!.materialIds![0])
  expect(preview.text).toContain('BOBO_FIRST_DESKTOP_7704')
  expect(preview.material.messageId).toBe(receipt!.id)
  await runtime.reviewData('bobo首次附件受理回执与原件', { receipt, preview, beforeCoreRooms: 0, afterCoreRooms: (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(room => room.purpose === 'core').length })
  await runtime.reviewFile('bobo首次输入原件', cli.attachmentPath, { required: true })
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('group', { name: 'bobo 的会话', exact: true }).getByRole('button', { name: cli.room!.title.replace(/\s+/g, ' '), exact: true }).click()
  await expect(runtime.page.locator(`#message-${receipt!.id}`)).toContainText('bobo首期资料.md')
  await runtime.reviewNativeCheckpoint('bobo首次附件随首条消息显示')
})

Then('bobo首条附件在桌面可读且重启保持原消息', async ({ runtime, cli }) => {
  const before = cli.protocol!.endpoint.requests.length, server = (await readLocalConnection(cli.dataPath!)).serverId
  await runtime.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(cli.dataPath!)).serverId !== server } catch { return false } }).toBe(true)
  await cli.command!(['run', '--attachment', cli.attachmentPath!, '--request-id', cli.requestId!, '--json', first])
  const receipt = await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), cli.requestId!)
  expect(receipt).toEqual(cli.attachmentReceipt)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.conversations.filter(room => room.purpose === 'core')).toHaveLength(1)
  const preview = await runtime.page.evaluate(id => window.boai.request('getMaterialPreview', { id }), receipt!.materialIds![0])
  expect(preview.text).toContain('BOBO_FIRST_DESKTOP_7704')
  expect(cli.protocol!.endpoint.requests).toHaveLength(before); expect(runtime.errors).toEqual([])
  await runtime.reviewData('bobo首发附件重启零重发', { receipt, preview, coreRooms: 1, beforeRestart: before, afterRestart: cli.protocol!.endpoint.requests.length, externalRequests: 0 })
})

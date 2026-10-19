/*
 * [OUTPUT]: 当前构建/应用包实际CLI与serve公开渠道发布合同，非法载荷零受理且重启不新增业务。
 * [OUTPUT]: 附件分块跨CLI进程断连重复、chunk/finish/prepared三时点SIGKILL后恢复与零重放，保留一致SQLite。
 * [OUTPUT]: BOAI_TEST_PACKAGED_PATH selects the actual application binary, bundled CLI and bundled serve module for package-specific process validation.
 * [OUTPUT]: 自启动CLI待补充/审批后保留原服务，显式回答/批准或取消沿原Work且重启零重放。
 * [OUTPUT]: Validation interrupted before ready exports the actual child identity and never submits its message; explicit test-owner shutdown is separate.
 * [OUTPUT]: Concurrent built run clients authenticate one runtime and retain one accepted message/reply with a single controlled model execution.
 * [OUTPUT]: Actual startup timeout/SIGINT retain the not-yet-ready child identity and prove zero message acceptance before explicit test-owner shutdown.
 * [OUTPUT]: Built validation defaults to a new isolated real-service/file/receipt suite; existing services remain read-only, with structured failure and retained evidence.
 * [OUTPUT]: Built CLI custom serve entry, diagnostic-only stderr, own-log cleanup/retention, startup rejection and unchanged business receipts.
 * [OUTPUT]: 实际CLI三mode/未知模式/创建/改权后旧回执及原生配置保持，零隐式提权。
 * [OUTPUT]: 实际bobo首次及后续附件、坏输入无空会话和重启原回执核对。
 * [OUTPUT]: 实际send/run分块附件与原字节、空正文、重复/重启回执及改变源文件拒绝。
 * [OUTPUT]: Temporary model also follows original Work phases and actual command-to-CLI file calls; model keys stay outside public runtime identity.
 * [OUTPUT]: Actual API overrides use the selected HTTP model/key, restore defaults next message and retain credential-free receipts after restart.
 * [OUTPUT]: 实际send/run的cwd别名使原命令和CLI相对文件工具落在所选业务目录，路径不授予其他权限。
 * [OUTPUT]: Built send/run resolve repeated --source IDs to original Composer references; changed-source retries preserve old receipts.
 * [OUTPUT]: Actual API execute_command invokes original CLI write/read tools with stable call receipts, without a second workspace.
 * [OUTPUT]: Independent serve executes the original API command with automatic run CLI credentials and revokes them before report publication.
 * [OUTPUT]: Built CLI uses explicit run credential environment, rejects owner methods and fails after original run closure.
 * [OUTPUT]: Built CLI receives partial SSE text before publication; SIGINT detaches and receipt --follow observes the original run without resubmission.
 * [OUTPUT]: CLI消息游标复用原历史双向分页；app/session:event沿公共发布器隔离会话，订阅确认及中断/断开退出可核对。
 * [OUTPUT]: 运行时版本查询复用程序身份/原验证与插件内容核验；未知明确、零启动，CLI区分自身及服务版本，验证归21组01 §12.9。
 * [OUTPUT]: 实际CLI精确停止、歧义/唯一选择、旧run不影响新任务及服务重启零重放。
 * [OUTPUT]: 构建CLI会话创建/删除/查询与重启回执保持；重复删除不影响之后的新消息。
 * [OUTPUT]: 实际run复用/自启动退出、超时后台交接与重连核对，使用原持久消息与服务身份。
 * [INPUT]: Freshly built Node CLI/serve, isolated child processes and controlled Mastra HTTP protocol.
 * [OUTPUT]: Real standalone sends, competing processes, SIGKILL lock recovery and restart/no-replay facts.
 * [POS]: Opt-in actual build integration via BOAI_CLI_PROCESS_TEST=1; never uses a personal profile.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn, execFile } from 'node:child_process'
import { mkdtemp, realpath, mkdir, rm, writeFile, readFile, stat, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { teamEndpoint, sendTeamOutput } from './fixtures/team-planner'
import { cliCommandEndpoint } from './fixtures/cli-command'
import { cancellationEndpoint, cancellationInstructions } from './fixtures/cli-cancellation'
import type { CancellationTarget } from '../src/shared/domain/run-cancellation'
import type { MessageExecution } from '../src/shared/domain/message-execution'
import type { RunCliGrant } from '../src/shared/cli/run-access'
import { readLocalConnection } from '../src/cli/discovery'
import { CliRpcClient } from '../src/cli/client'
import type { Connection, DigitalAgent, Conversation } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import { LaunchProfiles } from '../src/runtime/modules/backends/profiles'
import { version } from '../package.json'
import { PROTOCOL_VERSION } from '../src/shared/cli/protocol'
import { openValidationFixture } from '../src/cli/validation-fixture'
import { cliQuestionEndpoint } from './fixtures/cli-question'
import type { ConversationDetail, Message } from '../src/shared/domain'

const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
describe.skipIf(process.env.BOAI_CLI_PROCESS_TEST !== '1')('actual standalone serve build', () => {
  const packaged = process.env.BOAI_TEST_PACKAGED_PATH
  const binary = packaged ?? process.execPath
  const executable = packaged ? resolve(packaged, '../../Resources/app.asar/dist/cli/index.mjs') : resolve('dist/cli/index.mjs')
  const serveEntry = packaged ? resolve(packaged, '../../Resources/app.asar/dist/runtime/serve.mjs') : resolve('dist/runtime/serve.mjs')
  const runtimeEnvironment = packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}
  async function root() { const path = await realpath(await mkdtemp(join(tmpdir(), 'boai-cli-process-'))); cleanup.push(() => rm(path, { recursive: true, force: true })); return path }
  function launch(path: string) {
    const child = spawn(binary, [executable, 'serve', '--data-dir', join(path, 'profile')], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path, BOAI_SECRET_FIXTURE: 'fixture-service-secret-2093' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', exited = false
    child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
    const exit = new Promise<number | null>(resolve => { child.once('exit', code => { exited = true; resolve(code) }) })
    cleanup.push(async () => { if (!exited) { child.kill('SIGTERM'); await Promise.race([exit, new Promise(resolve => setTimeout(resolve, 5000))]); if (!exited) { child.kill('SIGKILL'); await exit } } })
    return { child, exit, get exited() { return exited }, get stdout() { return stdout }, get stderr() { return stderr }, get ready() { return stdout.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line) } catch { return null } }).find(value => value?.type === 'ready') } }
  }
  async function connect(path: string) { const metadata = await readLocalConnection(join(path, 'profile')), client = new CliRpcClient(metadata.url, metadata); cleanup.push(() => client.destroy()); await client.connect(); return { metadata, client } }
  async function command(path: string, args: string[], stdin?: string, environment: Record<string, string> = {}) {
    return new Promise<{ stdout: string; stderr: string; code: number }>(resolveResult => {
      const child = execFile(binary, [executable, '--data-dir', join(path, 'profile'), ...args], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path, BOAI_SECRET_FIXTURE: 'fixture-service-secret-2093', ...environment }, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => resolveResult({ stdout, stderr, code: typeof error?.code === 'number' ? error.code : error ? -1 : 0 }))
      child.stdin?.end(stdin)
    })
  }
  async function configured(path: string, url: string) {
    const service = launch(path)
    await vi.waitFor(() => expect(service.ready, service.stderr).toBeTruthy(), { timeout: 15_000 })
    const { client } = await connect(path)
    const connection = await client.invoke('saveConnection', { name: 'run fixture', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' }) as Connection
    await client.invoke('credentials:bind', { id: connection.id, expectedRevision: connection.revision, environmentVariable: 'BOAI_SECRET_FIXTURE' })
    const agent = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
    await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture' })
    return { service, client }
  }
  it('exposes explicit channel publication in the built service without accepting malformed or replayed work', async () => {
    const path = await root(), service = launch(path)
    await vi.waitFor(() => expect(service.ready, service.stderr).toBeTruthy(), { timeout: 15000 })
    const first = await connect(path), methods = ['publishChannelReply', 'publishChannelMessage', 'listChannelMessageDeliveries']
    for (const method of methods) expect(first.client.handshake?.registeredChannels).toContain(method)
    const responses = []
    for (const method of methods) {
      const response = await command(path, ['invoke', method, '{}', '--json'])
      expect(response.code).toBe(2); expect(response.stdout).toBe('')
      expect(JSON.parse(response.stderr)).toMatchObject({ code: 'INVALID_REQUEST' })
      responses.push({ method, ...response })
    }
    await first.client.invoke('server:shutdown', { serverId: first.metadata.serverId }); expect(await service.exit).toBe(0); first.client.destroy()
    const recovered = launch(path)
    await vi.waitFor(() => expect(recovered.ready, recovered.stderr).toBeTruthy(), { timeout: 15000 })
    const second = await connect(path)
    for (const method of methods) expect(second.client.handshake?.registeredChannels).toContain(method)
    await second.client.invoke('server:shutdown', { serverId: second.metadata.serverId }); expect(await recovered.exit).toBe(0); second.client.destroy()
    for (const pid of [service.child.pid!, recovered.child.pid!]) expect(() => process.kill(pid, 0)).toThrow()
    const db = new DatabaseSync(join(path, 'profile/boai.sqlite'), { readOnly: true })
    try {
      const counts = Object.fromEntries(['messages', 'runs', 'workItems', 'artifacts', 'channelDeliveries'].map(collection => [collection, Number((db.prepare('SELECT count(*) AS n FROM records WHERE collection=?').get(collection) as { n: number }).n)]))
      expect(Object.values(counts)).toEqual([0, 0, 0, 0, 0])
      if (process.env.BOAI_CLI_EVIDENCE_DIR) {
        const out = join(process.env.BOAI_CLI_EVIDENCE_DIR, 'channel-contract'); await mkdir(out, { recursive: true })
        await writeFile(join(out, 'facts.json'), JSON.stringify({ packaged: Boolean(packaged), executable, methods, responses, counts, pids: [service.child.pid, recovered.child.pid], exits: [0, 0], externalRequests: 0 }, null, 2))
        db.exec(`VACUUM INTO '${join(out, 'boai.sqlite').replaceAll("'", "''")}'`)
      }
    } finally { db.close() }
  })
  it.each(['chunk', 'finish', 'prepared'] as const)('recovers %s attachment staging after actual service death without replay', async phase => {
    const path = await root(), service = launch(path)
    await vi.waitFor(() => expect(service.ready, service.stderr).toBeTruthy(), { timeout: 15000 })
    const first = await connect(path)
    const created = await first.client.invoke('createEmployeeSession', { employeeId: 'researcher', name: '上传故障原会话', requestId: randomUUID() }) as { conversationId: string }
    const room = (await first.client.invoke('getConversation', { id: created.conversationId }) as ConversationDetail).conversation
    const bytes = Buffer.from('Private synthetic upload, no model execution.\n'), uploadId = randomUUID(), requestId = randomUUID()
    const descriptor = { action: 'begin', uploadId, name: 'source.md', size: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex') }
    const invoke = async (method: string, input: unknown) => {
      const result = await command(path, ['invoke', method, JSON.stringify(input), '--json'])
      expect(result.code, result.stderr + result.stdout).toBe(0); return JSON.parse(result.stdout)
    }
    await invoke('transferMaterial', descriptor)
    const part = { action: 'chunk', uploadId, offset: 0, base64: bytes.subarray(0, 10).toString('base64') }
    expect(await invoke('transferMaterial', part)).toMatchObject({ offset: 10 })
    // Each command has a different process/socket. Confirmed duplicate chunks
    // remain idempotent across disconnects without resending a user message.
    expect(await invoke('transferMaterial', part)).toMatchObject({ offset: 10 })
    let selectionId: string | undefined, prepared: { id: string; status: string } | undefined
    if (phase !== 'chunk') {
      await invoke('transferMaterial', { action: 'chunk', uploadId, offset: 10, base64: bytes.subarray(10).toString('base64') })
      selectionId = (await invoke('transferMaterial', { action: 'finish', uploadId })).selectionId
      expect((await invoke('transferMaterial', { action: 'finish', uploadId })).selectionId).toBe(selectionId)
      if (phase === 'prepared') prepared = await invoke('prepareMaterial', { selectionId, conversationId: room.id, requestId })
    }
    const staging = join(path, 'profile', '.cli-material-sources')
    expect((await readdir(staging)).length).toBe(phase === 'finish' ? 1 : 0)
    const before = await first.client.invoke('getConversation', { id: room.id }) as ConversationDetail
    expect(before.messages).toEqual([]); expect(before.runs).toEqual([])
    service.child.kill('SIGKILL'); expect(await service.exit).toBeNull(); first.client.destroy()
    expect(() => process.kill(service.child.pid!, 0)).toThrow()
    const recovered = launch(path)
    await vi.waitFor(() => expect(recovered.ready, recovered.stderr).toBeTruthy(), { timeout: 15000 })
    const second = await connect(path)
    expect(await readdir(staging)).toEqual([])
    await expect(second.client.invoke('transferMaterial', { action: 'finish', uploadId })).rejects.toThrow('失效')
    const receipt = await second.client.invoke('getMaterialPreparation', { requestId })
    if (prepared) {
      expect(receipt).toMatchObject({ id: prepared.id, status: 'removed', authorizedAgentIds: [] })
    } else expect(receipt).toBeNull()
    const after = await second.client.invoke('getConversation', { id: room.id }) as ConversationDetail
    expect(after.messages).toEqual(before.messages); expect(after.runs).toEqual(before.runs); expect(after.workItems).toEqual([])
    await second.client.invoke('server:shutdown', { serverId: recovered.ready.serverId }); expect(await recovered.exit).toBe(0)
    expect(() => process.kill(recovered.child.pid!, 0)).toThrow()
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      const out = join(process.env.BOAI_CLI_EVIDENCE_DIR, 'upload-' + phase); await mkdir(out, { recursive: true })
      await writeFile(join(out, 'facts.json'), JSON.stringify({ phase, descriptor, selectionId, prepared, receipt, before, after, servicePids: [service.child.pid, recovered.child.pid], exits: ['SIGKILL', 0], externalRequests: 0 }, null, 2))
      await writeFile(join(out, 'source.md'), bytes)
      const db = new DatabaseSync(join(path, 'profile', 'boai.sqlite'))
      try { db.exec('VACUUM INTO ' + "'" + join(out, 'boai.sqlite').replaceAll("'", "''") + "'") } finally { db.close() }
    }
  }, 60000)
  it.each(['ask', 'tool'] as const)('hands off an autostarted %s question and resumes its exact Work after an explicit answer', async mode => {
    const protocol = await cliQuestionEndpoint(mode); cleanup.push(protocol.close)
    const path = await root(), setup = await configured(path, protocol.url)
    await setup.client.invoke('server:shutdown', { serverId: setup.service.ready.serverId }); expect(await setup.service.exit).toBe(0)
    const requestId = randomUUID()
    const result = await command(path, ['run', '--employee', 'researcher', '--request-id', requestId, '--json', '请在明确接收人后交付'])
    const { client, metadata } = await connect(path)
    cleanup.push(async () => { if (client.isConnected) await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy(); await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 }) })
    expect(result.code, result.stderr + result.stdout).toBe(3)
    const events = result.stdout.trim().split('\n').map(line => JSON.parse(line)), pending = events.filter(event => event.type === 'result').at(-1)
    expect(pending.state).toBe('waiting_input'); expect(pending.recovery.questions).toHaveLength(1)
    expect(events.filter(event => event.type === 'service').at(-1)).toMatchObject({ state: 'background', pid: metadata.pid })
    const original = await client.invoke('getMessageReceipt', { requestId }) as Message
    const before = await client.invoke('getConversation', { id: original.conversationId }) as ConversationDetail
    const questions = pending.recovery.questions
    const input = { ...questions[0].identity, content: 'CLI_ANSWER_PERSON：交付给本人。', requestId: randomUUID() }
    const answer = await command(path, ['invoke', questions[0].channel, JSON.stringify(input), '--json'])
    expect(answer.code, answer.stderr + answer.stdout).toBe(0)
    const follow = await command(path, ['receipt', requestId, '--follow', '--json'])
    expect(follow.code, follow.stderr + follow.stdout).toBe(0)
    const duplicate = await command(path, ['invoke', questions[0].channel, JSON.stringify(input), '--json'])
    expect(duplicate.code).toBe(0); expect(JSON.parse(duplicate.stdout)).toEqual(JSON.parse(answer.stdout))
    const after = await client.invoke('getConversation', { id: original.conversationId }) as ConversationDetail
    expect(after.workItems).toHaveLength(1)
    expect(after.workItems![0]).toMatchObject({ id: before.workItems![0].id, sourceMessageId: original.id, budgetId: before.workItems![0].budgetId, status: 'delivered' })
    expect(after.workBudgets![0]).toMatchObject({ id: before.workBudgets![0].id, deadlineAt: before.workBudgets![0].deadlineAt })
    expect(after.messages.filter(message => message.senderType === 'user')).toHaveLength(2)
    expect(after.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toContain('CLI_PENDING_DELIVERED')
    const requests = protocol.requests.length
    await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy()
    await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 })
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready, restarted.stderr).toBeTruthy(), { timeout: 15000 })
    const final = await connect(path), recovered = await final.client.invoke('getMessageExecution', { requestId })
    expect(recovered).toMatchObject({ state: 'completed', questions: [] }); expect(protocol.requests).toHaveLength(requests)
    await final.client.invoke('server:shutdown', { serverId: final.metadata.serverId }); expect(await restarted.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, `pending-${mode}-facts.json`), JSON.stringify({ result, answer, follow, duplicate, before, after, recovered, requests: protocol.requests, servicePids: [setup.service.child.pid, metadata.pid, restarted.child.pid], allExited: true, externalRequests: 0 }, null, 2)) }
  }, 60000)
  it('cancels an autostarted pending question without answering or replaying its work', async () => {
    const protocol = await cliQuestionEndpoint('tool'); cleanup.push(protocol.close)
    const path = await root(), setup = await configured(path, protocol.url)
    await setup.client.invoke('server:shutdown', { serverId: setup.service.ready.serverId }); expect(await setup.service.exit).toBe(0)
    const requestId = randomUUID(), result = await command(path, ['run', '--employee', 'researcher', '--request-id', requestId, '--json', '请明确接收人后交付'])
    const { client, metadata } = await connect(path)
    cleanup.push(async () => { if (client.isConnected) await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy(); await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 }) })
    expect(result.code, result.stderr + result.stdout).toBe(3)
    const pending = await client.invoke('getMessageExecution', { requestId }) as MessageExecution, question = pending.questions![0].question!
    const requests = protocol.requests.length
    const cancelled = await command(path, ['cancel', pending.conversationId, '--request-id', requestId, '--json'])
    expect(cancelled.code, cancelled.stderr + cancelled.stdout).toBe(0)
    const input = { questionId: question.id, expectedRevision: question.revision, content: 'CLI_ANSWER_PERSON', requestId: randomUUID() }
    const rejected = await command(path, ['invoke', 'replyInboxQuestion', JSON.stringify(input), '--json'])
    expect(rejected.code).toBe(1); expect(await client.invoke('getMessageReceipt', { requestId: input.requestId })).toBeNull()
    expect(await client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'cancelled', activeRunIds: [] })
    await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy()
    await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 })
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready).toBeTruthy(), { timeout: 15000 })
    const final = await connect(path), recovered = await final.client.invoke('getMessageExecution', { requestId })
    expect(recovered).toMatchObject({ state: 'cancelled', activeRunIds: [] }); expect(protocol.requests).toHaveLength(requests)
    await final.client.invoke('server:shutdown', { serverId: final.metadata.serverId }); expect(await restarted.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'pending-cancel-facts.json'), JSON.stringify({ result, pending, cancelled, rejected, recovered, requests: protocol.requests, servicePids: [setup.service.child.pid, metadata.pid, restarted.child.pid], allExited: true, externalRequests: 0 }, null, 2)) }
  }, 60000)
  it('hands off an autostarted file approval and performs the original write only after approval', async () => {
    const protocol = await openValidationFixture('CLI_PENDING_APPROVED_FILE'); cleanup.push(protocol.close)
    const path = await root(), setup = await configured(path, protocol.url)
    const agent = (await setup.client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
    await setup.client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: 'ask' })
    await setup.client.invoke('server:shutdown', { serverId: setup.service.ready.serverId }); expect(await setup.service.exit).toBe(0)
    const requestId = randomUUID(), result = await command(path, ['run', '--employee', 'researcher', '--request-id', requestId, '--json', '写入并读取验证文件'])
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'pending-approval-command.json'), JSON.stringify(result, null, 2)) }
    const { client, metadata } = await connect(path)
    cleanup.push(async () => { if (client.isConnected) await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy(); await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 }) })
    expect(result.code, result.stderr + result.stdout).toBe(3)
    const pending = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(pending.state).toBe('waiting_approval'); expect(pending.approvals).toHaveLength(1)
    expect((await readdir(join(path, 'profile'), { recursive: true })).filter(file => file.endsWith('boai-validation.txt'))).toEqual([])
    const approval = await command(path, ['invoke', 'approve', JSON.stringify({ id: pending.approvals[0].id, approved: true }), '--json'])
    expect(approval.code, approval.stderr + approval.stdout).toBe(0)
    const follow = await command(path, ['receipt', requestId, '--follow', '--json'])
    expect(follow.code, follow.stderr + follow.stdout).toBe(0)
    const files = (await readdir(join(path, 'profile'), { recursive: true })).filter(file => file.endsWith('boai-validation.txt'))
    expect(files).toHaveLength(1); expect(await readFile(join(path, 'profile', files[0]), 'utf8')).toBe('CLI_PENDING_APPROVED_FILE')
    expect(protocol.receipts.some(row => row.name === 'read_file' && (row.result as { content?: string }).content === 'CLI_PENDING_APPROVED_FILE')).toBe(true)
    const status = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(status).toMatchObject({ state: 'completed', activeRunIds: [], approvals: [] })
    await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy()
    await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 })
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'pending-approval-facts.json'), JSON.stringify({ result, pending, approval, follow, status, files, receipts: protocol.receipts, requests: protocol.requests, servicePids: [setup.service.child.pid, metadata.pid], allExited: true, externalRequests: 0 }, null, 2)) }
  }, 60000)
  it('validates an isolated real service with file tools and retains evidence before selective cleanup', async () => {
    const path = await root()
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>(done => execFile(binary, [executable, '--validate-server', '--json', '--verbose', '--no-spinner'], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path }, timeout: 60000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => done({ stdout, stderr, code: typeof error?.code === 'number' ? error.code : error ? -1 : 0 })))
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'validation-isolated-command.json'), JSON.stringify(result, null, 2)) }
    expect(result.code, result.stderr + result.stdout).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report).toMatchObject({ type: 'validation', mode: 'isolated', modelMode: 'controlled-local', passed: 19, failed: 0, skipped: 0, exitCode: 0, service: { state: 'stopped' } })
    expect(report.directory.startsWith(path + '/')).toBe(true)
    expect(() => process.kill(report.service.pid, 0)).toThrow()
    expect(JSON.parse(await readFile(join(report.directory, 'report.json'), 'utf8'))).toEqual(report)
    const evidence = JSON.parse(await readFile(join(report.directory, 'execution.json'), 'utf8'))
    expect(evidence.requestId).toBe(report.requestId)
    expect(evidence.events.some((event: { type: string; state?: string }) => event.type === 'result' && event.state === 'completed')).toBe(true)
    const file = await readFile(join(report.directory, 'file-evidence.txt'), 'utf8')
    expect(evidence.toolReceipts.some((row: { name: string; result: { content?: string } }) => row.name === 'read_file' && row.result.content === file)).toBe(true)
    const originalReport = await readFile(join(report.directory, 'report.json'), 'utf8')
    const repeated = await command(path, ['validate', '--validation-profile', report.directory, '--json'])
    expect(repeated.code).toBe(1); expect(JSON.parse(repeated.stdout)).toMatchObject({ mode: 'isolated', passed: 0, exitCode: 1 })
    expect(await readFile(join(report.directory, 'report.json'), 'utf8')).toBe(originalReport)
    expect(result.stderr).not.toContain(file); expect(result.stderr).not.toContain('controlled-validation-only')
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'validation-isolated-facts.json'), JSON.stringify({ report, evidence, file, repeated, serviceExited: true, externalModelRequests: 0 }, null, 2))
  }, 90000)
  it('validates an existing service read-only and preserves bad-authentication failures', async () => {
    const protocol = await teamEndpoint(); cleanup.push(protocol.close)
    const path = await root(), { service, client } = await configured(path, protocol.url)
    const before = { employees: await client.invoke('employees'), connections: await client.invoke('connections'), sessions: await client.invoke('sessions', {}) }
    const result = await command(path, ['--validate-server', '--json'])
    expect(result.code, result.stderr + result.stdout).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: 'read-only', modelMode: 'none', passed: 10, failed: 0, skipped: 0, exitCode: 0 })
    const failure = await command(path, ['validate', '--url', service.ready.url, '--token', 'wrong-owner', '--json'])
    expect(failure.code, failure.stderr + failure.stdout).toBe(1)
    expect(JSON.parse(failure.stdout)).toMatchObject({ mode: 'read-only', passed: 0, failed: 1, skipped: 9, exitCode: 1 })
    expect(JSON.parse(failure.stdout).results[0].code).toBe('AUTH_FAILED')
    const invalid = await command(path, ['validate', '--model', 'not-authorized', '--json'])
    expect(invalid.code).toBe(2); expect(invalid.stdout).toBe('')
    const after = { employees: await client.invoke('employees'), connections: await client.invoke('connections'), sessions: await client.invoke('sessions', {}) }
    expect(after).toEqual(before); expect(protocol.requests).toEqual([])
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'validation-existing-facts.json'), JSON.stringify({ result, failure, invalid, unchanged: true, controlledRequests: 0, externalModelRequests: 0, serviceExit: service.child.exitCode }, null, 2)) }
  }, 45000)
  it('retains configured-provider approval without approving or deleting its unfinished work', async () => {
    const protocol = await openValidationFixture('PENDING_VALIDATION_FILE'); cleanup.push(protocol.close)
    const path = await root(), directory = join(path, 'configured validation')
    const result = await command(path, ['validate', '--validation-profile', directory, '--provider', 'openai-compatible', '--model', 'fixture', '--base-url', protocol.url, '--api-key', 'configured-secret-test-418', '--json'])
    expect(result.code, result.stderr + result.stdout).toBe(1)
    const report = JSON.parse(result.stdout)
    const metadata = await readLocalConnection(join(directory, 'profile')), client = new CliRpcClient(metadata.url, metadata)
    await client.connect()
    cleanup.push(async () => { if (client.isConnected) await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy(); await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 }) })
    expect(report).toMatchObject({ modelMode: 'configured-provider', exitCode: 1, service: { state: 'background' } })
    expect(report.results.find((row: { step: string }) => row.step === 'send-stream-and-tools')).toMatchObject({ status: 'failed' })
    expect(report.results.find((row: { step: string }) => row.step === 'delete-owned-session')).toMatchObject({ status: 'skipped' })
    const pending = await client.invoke('getMessageExecution', { requestId: report.requestId }) as MessageExecution
    expect(pending.state).toBe('waiting_approval'); expect(pending.approvals.length).toBeGreaterThan(0)
    expect((await readdir(join(directory, 'profile'), { recursive: true })).some(name => name.endsWith('boai-validation.txt'))).toBe(false)
    const evidence = JSON.parse(await readFile(join(directory, 'execution.json'), 'utf8'))
    expect(JSON.stringify(evidence)).not.toContain('configured-secret-test-418'); expect(result.stdout + result.stderr).not.toContain('configured-secret-test-418')
    await client.invoke('cancelMessageExecution', { requestId: report.requestId })
    await vi.waitFor(async () => expect(await client.invoke('getMessageExecution', { requestId: report.requestId })).toMatchObject({ state: 'cancelled', activeRunIds: [] }))
    await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy()
    await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 })
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'validation-pending-facts.json'), JSON.stringify({ report, pending, noFileWritten: true, noAutomaticApproval: true, controlledRequests: protocol.requests, externalModelRequests: 0, testOwnerCancelledAndStopped: true }, null, 2)) }
  }, 45000)
  it('exports original validation evidence after SIGINT without repeating the message', async () => {
    const path = await root(); let interrupted = false
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(done => {
      const child = spawn(binary, [executable, '--validate-server', '--json', '--verbose'], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path }, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', bytes => { stdout += bytes })
      child.stderr.on('data', bytes => { stderr += bytes; if (!interrupted && stderr.includes('"step":"create-session"')) { interrupted = true; child.kill('SIGINT') } })
      child.once('exit', code => done({ stdout, stderr, code }))
    })
    expect(interrupted).toBe(true); expect(result.code, result.stderr + result.stdout).toBe(130)
    const report = JSON.parse(result.stdout)
    if (report.service.state === 'background') {
      const metadata = await readLocalConnection(join(report.directory, 'profile')), client = new CliRpcClient(metadata.url, metadata); await client.connect()
      try {
        const execution = await client.invoke('getMessageExecution', { requestId: report.requestId }) as MessageExecution | null
        if (execution && execution.activeRunIds.length) await client.invoke('cancelMessageExecution', { requestId: report.requestId })
        await client.invoke('server:shutdown', { serverId: metadata.serverId })
      } finally { client.destroy() }
      await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 })
    }
    const evidence = await readFile(join(report.directory, 'execution.json'), 'utf8').catch(() => null)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'validation-interrupted-facts.json'), JSON.stringify({ result, report, evidence, testOwnerStoppedRemainder: true }, null, 2)) }
    expect(evidence).not.toBeNull()
    expect(JSON.parse(evidence!).requestId).toBe(report.requestId)
    expect(JSON.parse(evidence!).events.filter((event: { type: string }) => event.type === 'accepted').length).toBeLessThanOrEqual(1)
    expect(report.results.find((row: { step: string }) => row.step === 'export-evidence')).toMatchObject({ status: 'passed' })
    expect(report.results.find((row: { step: string }) => row.step === 'delete-owned-session')).toMatchObject({ status: 'skipped' })
    expect(() => process.kill(report.service.pid, 0)).toThrow()
  }, 45000)
  it('exports an unconfirmed validation child identity when interrupted before ready', async () => {
    const path = await root(), directory = join(path, 'early validation')
    const child = spawn(binary, [executable, 'validate', '--validation-profile', directory, '--json', '--verbose'], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', interrupted = false
    child.stdout.on('data', bytes => { stdout += bytes })
    child.stderr.on('data', bytes => { stderr += bytes; if (!interrupted && stderr.split('\n').some(line => { try { return JSON.parse(line).event === 'service_start' } catch { return false } })) { interrupted = true; child.kill('SIGINT') } })
    const code = await new Promise<number | null>(done => child.once('exit', done))
    const report = JSON.parse(stdout), metadataPath = join(directory, 'profile')
    let metadata: Awaited<ReturnType<typeof readLocalConnection>> | undefined
    await vi.waitFor(async () => { metadata = await readLocalConnection(metadataPath) }, { timeout: 15000 })
    const client = new CliRpcClient(metadata!.url, metadata!); await client.connect()
    cleanup.push(async () => { if (client.isConnected) await client.invoke('server:shutdown', { serverId: metadata!.serverId }).catch(() => {}); client.destroy() })
    expect(report.requestId).toBeTypeOf('string')
    const receipt = await client.invoke('getMessageReceipt', { requestId: report.requestId })
    await client.invoke('server:shutdown', { serverId: metadata!.serverId })
    await vi.waitFor(() => expect(() => process.kill(metadata!.pid, 0)).toThrow(), { timeout: 10000 })
    const exported = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'))
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'startup-validation-facts.json'), JSON.stringify({ binary, executable, serveEntry, code, report, exported, stderr, receipt, actualServicePid: metadata!.pid, actualOwnerExit: true, externalModelRequests: 0 }, null, 2)) }
    expect(code, stderr).toBe(130); expect(report).toMatchObject({ exitCode: 130, startup: { state: 'unconfirmed', pid: metadata!.pid } })
    expect(report.service).toBeUndefined(); expect(exported).toEqual(report); expect(receipt).toBeNull()
    expect(report.results.find((row: { step: string }) => row.step === 'send-stream-and-tools')).toMatchObject({ status: 'skipped' })
    expect(await readFile(report.startup.logPath, 'utf8')).toContain('"type":"stopped"')
  }, 45000)

  it('concurrent run startup shares one owner and one original message without replay', async () => {
    const path = await root(); let release: (() => void) | undefined
    const endpoint = await teamEndpoint((body, response) => {
      const messages = body.messages as { role: string; content: string }[], system = messages.filter(row => row.role === 'system').map(row => row.content).join('\n')
      if (system.includes('Private participation decision')) sendTeamOutput(response, { action: 'reply', responseKind: 'chat' })
      else if (system.includes('Private memory maintenance')) sendTeamOutput(response, { candidates: [] })
      else { let sent = false; release = () => { if (!sent) { sent = true; sendTeamOutput(response, '同一原请求只执行一次') } } }
    }); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const requestId = randomUUID(), runners = Array.from({ length: 2 }, () => {
      const child = spawn(binary, [executable, '--data-dir', join(path, 'profile'), 'run', '--employee', 'researcher', '--request-id', requestId, '--json', '--verbose', 'CONCURRENT_ORIGINAL_REQUEST_6111'], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path, BOAI_SECRET_FIXTURE: 'fixture-service-secret-2093' }, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = '', exited = false
      child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
      const exit = new Promise<number | null>(done => child.once('exit', code => { exited = true; done(code) }))
      cleanup.push(async () => { release?.(); if (!exited) { child.kill('SIGINT'); await exit } })
      return { child, exit, get stdout() { return stdout }, get stderr() { return stderr }, get events() { return stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) } }
    })
    await vi.waitFor(() => expect(runners.every(run => run.events.some(event => event.type === 'accepted')), runners.map(run => run.stderr).join('\n')).toBe(true), { timeout: 15000 })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const metadata = await readLocalConnection(join(path, 'profile')), observer = new CliRpcClient(metadata.url, metadata)
    await observer.connect(); cleanup.push(async () => { release?.(); if (observer.isConnected) await observer.invoke('server:shutdown', { serverId: metadata.serverId }).catch(() => {}); observer.destroy() })
    release!()
    const codes = await Promise.all(runners.map(run => run.exit))
    const receipt = await observer.invoke('getMessageReceipt', { requestId }), execution = await observer.invoke('getMessageExecution', { requestId })
    const session = runners[0].events.find(event => event.type === 'accepted').conversationId
    const history = await observer.invoke('listConversationMessages', { conversationId: session, limit: 80 }) as { items: { message?: { role?: string; senderType: string; content: string; id: string } }[] }
    const facts = { requestId, codes, runners: runners.map(run => ({ stdout: run.stdout, stderr: run.stderr })), service: { serverId: metadata.serverId, pid: metadata.pid }, receipt, execution, history, controlledRequests: endpoint.requests.length, externalModelRequests: 0 }
    await observer.invoke('server:shutdown', { serverId: metadata.serverId })
    await vi.waitFor(() => expect(() => process.kill(metadata.pid, 0)).toThrow(), { timeout: 10000 })
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'startup-concurrent-facts.json'), JSON.stringify({ ...facts, actualOwnerExit: true }, null, 2)) }
    expect(codes, facts.runners.map(run => run.stderr).join('\n')).toEqual([0, 0])
    expect(new Set(runners.map(run => run.events.find(event => event.type === 'accepted').messageId)).size).toBe(1)
    expect(runners.every(run => run.events.at(-1).serverId === metadata.serverId)).toBe(true)
    expect(history.items.filter(row => row.message?.senderType === 'user' && row.message.content === 'CONCURRENT_ORIGINAL_REQUEST_6111')).toHaveLength(1)
    expect(history.items.filter(row => row.message?.senderType === 'agent' && row.message.content === '同一原请求只执行一次')).toHaveLength(1)
    expect(execution).toMatchObject({ state: 'completed', activeRunIds: [] }); expect(endpoint.requests).toHaveLength(3)
  }, 45000)

  it.each(['timeout', 'interrupt'] as const)('preserves a not-yet-ready service on startup %s without accepting the prompt', async mode => {
    const path = await root(), modulePath = join(path, 'delayed service.mjs'), gate = join(path, 'start-gate')
    await writeFile(modulePath, `import { access } from 'node:fs/promises'; import { serve as original } from ${JSON.stringify(pathToFileURL(serveEntry).href)}; export async function serve(options) { while (!(await access(${JSON.stringify(gate)}).then(() => true, () => false))) await new Promise(r => setTimeout(r, 20)); return original(options); }`)
    const requestId = randomUUID(), child = spawn(binary, [executable, '--data-dir', join(path, 'profile'), 'run', '--employee', 'researcher', '--server-entry', modulePath, '--timeout', mode === 'timeout' ? '200' : '10000', '--verbose', '--json', '--request-id', requestId, 'STARTUP_NOT_ACCEPTED_6110'], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', exited = false
    child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
    const exit = new Promise<number | null>(done => child.once('exit', code => { exited = true; done(code) }))
    const rows = () => stderr.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    let ownedClient: CliRpcClient | undefined, metadata: Awaited<ReturnType<typeof readLocalConnection>> | undefined
    cleanup.push(async () => {
      await writeFile(gate, 'test-owner-release')
      if (!exited) { child.kill('SIGTERM'); await exit }
      if (ownedClient?.isConnected && metadata) await ownedClient.invoke('server:shutdown', { serverId: metadata.serverId }).catch(() => {})
      ownedClient?.destroy()
    })
    await vi.waitFor(() => expect(rows().some(row => row.event === 'service_start'), stderr).toBe(true), { timeout: 5000 })
    const startup = rows().find(row => row.event === 'service_start')
    if (mode === 'interrupt') child.kill('SIGINT')
    const code = await exit, signal = child.signalCode
    expect(() => process.kill(startup.pid, 0)).not.toThrow()
    await writeFile(gate, 'test-owner-release')
    await vi.waitFor(async () => { metadata = await readLocalConnection(join(path, 'profile')) }, { timeout: 15000 })
    ownedClient = new CliRpcClient(metadata!.url, metadata!); await ownedClient.connect()
    const receipt = await ownedClient.invoke('getMessageReceipt', { requestId }), status = await ownedClient.invoke('server:status')
    await ownedClient.invoke('server:shutdown', { serverId: metadata!.serverId })
    await vi.waitFor(() => expect(() => process.kill(startup.pid, 0)).toThrow(), { timeout: 10000 })
    const log = await readFile(startup.logPath, 'utf8')
    const facts = { binary, executable, serveEntry, mode, code, signal, stdout, stderr, requestId, receipt, status, startup, log, actualTestOwnerShutdown: true, externalModelRequests: 0 }
    if (process.env.BOAI_CLI_EVIDENCE_DIR) { await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, `startup-${mode}-facts.json`), JSON.stringify(facts, null, 2)) }
    expect(code, stderr).toBe(mode === 'interrupt' ? 130 : 4)
    expect(signal).toBeNull(); expect(stdout).toBe(''); expect(receipt).toBeNull()
    expect(rows().at(-1).code).toBe(mode === 'interrupt' ? 'CLIENT_DISCONNECTED' : 'REQUEST_TIMEOUT')
    expect(rows().at(-1).message).toContain(String(startup.pid)); expect(rows().at(-1).message).toContain(startup.logPath)
    expect(log).toContain('"type":"stopped"')
  }, 45000)

  it('uses explicit serve modules only for new owners and cleans only successful diagnostic logs', async () => {
    const protocol = await teamEndpoint(); cleanup.push(protocol.close)
    const path = await root(), { service, client } = await configured(path, protocol.url)
    const marker = join(path, 'custom-entry-calls'), modulePath = join(path, 'custom service.mjs')
    await writeFile(modulePath, `import { appendFile } from 'node:fs/promises'; import { serve as original } from ${JSON.stringify(pathToFileURL(serveEntry).href)}; export async function serve(options) { await appendFile(${JSON.stringify(marker)}, 'started\\n'); return original(options); }`)
    const requestId = randomUUID(), prompt = 'OPTIONS_BUSINESS_BODY_6103'
    const args = ['run', '--employee', 'researcher', '--request-id', requestId, '--json', '--verbose', '--server-entry', modulePath, '--disable-spinner', prompt]
    const reused = await command(path, args); expect(reused.code, reused.stderr).toBe(0)
    const events = (value: string) => value.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    expect(events(reused.stdout).at(-1)).toMatchObject({ type: 'service', state: 'reused', serverId: service.ready.serverId })
    await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    const receipt = await client.invoke('getMessageReceipt', { requestId }), calls = protocol.requests.length
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const runs: unknown[] = []
    for (const keep of [false, true]) {
      const result = await command(path, [...args, ...(keep ? ['--no-cleanup'] : [])])
      expect(result.code, result.stderr + result.stdout).toBe(0)
      const output = events(result.stdout), diagnostics = events(result.stderr), stopped = output.at(-1)
      expect(stopped).toMatchObject({ type: 'service', state: 'stopped' })
      expect(() => process.kill(stopped.pid, 0)).toThrow()
      expect(output.some(event => event.type === 'diagnostic')).toBe(false)
      expect(diagnostics.every(event => event.type === 'diagnostic')).toBe(true)
      expect(diagnostics.map(event => event.event)).toEqual(['connecting', 'service_start', 'service_ready', 'connected', 'service_exit'])
      expect(result.stderr).not.toContain(prompt); expect(result.stderr).not.toContain('fixture-service-secret-2093'); expect(result.stderr).not.toContain('\x1b')
      const logPath = diagnostics.find(event => event.event === 'service_start').logPath
      if (keep) {
        expect(stopped.logPath).toBe(logPath)
        expect((await stat(logPath)).mode & 0o777).toBe(0o600)
        expect(await readFile(logPath, 'utf8')).toContain('"type":"stopped"')
      } else { expect(stopped.logPath).toBeUndefined(); await expect(stat(logPath)).rejects.toMatchObject({ code: 'ENOENT' }) }
      runs.push({ keep, output, diagnostics, exitCode: result.code })
    }
    expect(await readFile(marker, 'utf8')).toBe('started\nstarted\n')
    await writeFile(modulePath, `import { fstatSync } from 'node:fs'; import { readdir, stat, rename, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { serve as original } from ${JSON.stringify(pathToFileURL(serveEntry).href)}; export async function serve(options) { const identity = fstatSync(1), directory = join(options.dataPath, '.cli'); let owned; for (const name of await readdir(directory)) { const file = join(directory, name), value = await stat(file); if (value.ino === identity.ino && value.dev === identity.dev) owned = file; } await original(options); if (!owned) throw new Error('missing original log'); await rename(owned, owned + '.saved'); await writeFile(owned, 'EXTERNAL_REPLACEMENT_6105', { mode: 0o600 }); }`)
    const replacement = await command(path, args); expect(replacement.code, replacement.stderr).toBe(0)
    const replacementService = events(replacement.stdout).at(-1)
    expect(replacementService).toMatchObject({ state: 'stopped' })
    expect(await readFile(replacementService.logPath, 'utf8')).toBe('EXTERNAL_REPLACEMENT_6105')
    expect(await readFile(replacementService.logPath + '.saved', 'utf8')).toContain('"type":"stopped"')
    runs.push({ replacement, replacedFilePreserved: true })
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready, restarted.stderr).toBeTruthy(), { timeout: 15_000 })
    const restored = await connect(path)
    expect(await restored.client.invoke('getMessageReceipt', { requestId })).toEqual(receipt)
    expect(protocol.requests).toHaveLength(calls)
    const health = await command(path, ['health', '-v', '--no-spinner', '--json'])
    expect(health.code).toBe(0); expect(events(health.stderr).map(event => event.event)).toEqual(['connecting', 'connected'])
    expect(JSON.parse(health.stdout)).toBeTruthy()
    await restored.client.invoke('server:shutdown', { serverId: restarted.ready.serverId }); expect(await restarted.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true })
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'options-lifecycle-facts.json'), JSON.stringify({ reused, runs, receipt, callsBeforeRestart: calls, callsAfterRestart: protocol.requests.length, marker: await readFile(marker, 'utf8'), health, serviceExits: [service.child.exitCode, restarted.child.exitCode], externalRequests: 0 }, null, 2))
    }
  }, 60000)
  it('preserves failed startup logs and rejects incompatible lifecycle flags before connecting', async () => {
    const path = await root(), modulePath = join(path, 'broken service.mjs'), results: unknown[] = []
    for (const source of ['export const missing = true;', 'throw new Error("PRIVATE_MODULE_ERROR_6104");']) {
      await writeFile(modulePath, source)
      const result = await command(path, ['run', '--server-entry', modulePath, '--verbose', '--no-spinner', '--json', 'NEVER_ACCEPTED_6104'])
      expect(result.code, result.stderr).toBe(1); expect(result.stdout).toBe('')
      const diagnostics = result.stderr.trim().split('\n').map(line => JSON.parse(line))
      const failed = diagnostics.find(event => event.event === 'service_failed')
      expect(failed).toBeTruthy(); expect(() => process.kill(failed.pid, 0)).toThrow()
      expect((await stat(failed.logPath)).mode & 0o777).toBe(0o600)
      const log = await readFile(failed.logPath, 'utf8')
      expect(log).toContain('CAPABILITY_UNAVAILABLE'); expect(log).not.toContain('PRIVATE_MODULE_ERROR_6104')
      await expect(readLocalConnection(join(path, 'profile'))).rejects.toMatchObject({ code: 'ENOENT' })
      results.push({ result, log })
    }
    const invalid: unknown[] = []
    for (const args of [['health', '--no-cleanup'], ['ping', '--server-entry', modulePath], ['run', '--url', 'ws://127.0.0.1:1', '--token', 'synthetic', '--server-entry', modulePath, '不执行']]) {
      const result = await command(path, args); expect(result.code, result.stderr).toBe(2); expect(result.stdout).toBe(''); invalid.push(result)
    }
    expect((await readdir(join(path, 'profile', '.cli'))).filter(file => file.endsWith('.log'))).toHaveLength(2)
    const rejected = await command(path, ['run', '--employee', 'missing-employee', '--verbose', '--json', 'NEVER_ACCEPTED_6104'])
    expect(rejected.code, rejected.stderr).toBe(2)
    const stopped = JSON.parse(rejected.stdout.trim())
    expect(stopped).toMatchObject({ type: 'service', state: 'stopped' })
    expect(await readFile(stopped.logPath, 'utf8')).toContain('"type":"stopped"')
    expect(() => process.kill(stopped.pid, 0)).toThrow()
    results.push({ rejected, commandFailureLogPreserved: true })
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true })
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'options-rejection-facts.json'), JSON.stringify({ results, invalid, acceptedMessages: 0, externalRequests: 0 }, null, 2))
    }
  }, 30000)
  it('checks all CLI modes against saved permissions and preserves receipts across a service restart', async () => {
    const protocol = await teamEndpoint(); cleanup.push(protocol.close)
    const path = await root(), { service, client } = await configured(path, protocol.url)
    const receipts: { requestId: string; mode: string; message: unknown }[] = []
    const save = async (permission: 'read-only' | 'ask' | 'full-access') => {
      const agent = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
      const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
      return client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: permission })
    }
    for (const mode of ['read-only', 'ask', 'allow-all']) {
      const expected = mode === 'allow-all' ? 'full-access' : mode as 'read-only' | 'ask'
      await save(expected)
      const before = await client.invoke('employees'), requestId = randomUUID()
      const created = await command(path, ['session', 'create', '--employee', 'researcher', '--mode', mode, '--request-id', randomUUID(), '--json'])
      expect(created.code, created.stderr).toBe(0)
      const result = await command(path, ['run', '--employee', 'researcher', '--mode', mode, '--request-id', requestId, '--json', '核对当前员工权限'])
      expect(result.code, result.stderr + result.stdout).toBe(0)
      const message = await client.invoke('getMessageReceipt', { requestId })
      expect(message).toMatchObject({ permissionExpectation: { permission: expected, agentIds: ['researcher'] } })
      expect(await client.invoke('employees')).toEqual(before)
      receipts.push({ requestId, mode, message })
    }
    const calls = protocol.requests.length, badId = randomUUID()
    const mismatch = await command(path, ['run', '--employee', 'researcher', '--mode', 'ask', '--request-id', badId, '--json', '不得改变权限'])
    expect(mismatch.code).toBe(1); expect(await client.invoke('getMessageReceipt', { requestId: badId })).toBeNull()
    for (const args of [['run', '--mode', 'full-access', '非法拼写'], ['health', '--mode', 'ask']]) expect((await command(path, args)).code).toBe(2)
    expect(protocol.requests).toHaveLength(calls)
    const serverId = (await readLocalConnection(join(path, 'profile'))).serverId
    await client.invoke('server:shutdown', { serverId }); await vi.waitFor(() => expect(service.child.exitCode).toBe(0)); client.destroy()
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready).toBeTruthy())
    const recovered = await connect(path)
    for (const receipt of receipts) {
      const repeated = await command(path, ['run', '--employee', 'researcher', '--mode', receipt.mode, '--request-id', receipt.requestId, '--json', '核对当前员工权限'])
      expect(repeated.code, repeated.stderr + repeated.stdout).toBe(0)
      expect(await recovered.client.invoke('getMessageReceipt', { requestId: receipt.requestId })).toEqual(receipt.message)
    }
    expect(protocol.requests).toHaveLength(calls)
    await recovered.client.invoke('server:shutdown', { serverId: recovered.metadata.serverId }); await vi.waitFor(() => expect(restarted.child.exitCode).toBe(0))
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true })
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'mode-facts.json'), JSON.stringify({ receipts, mismatchExit: mismatch.code, beforeRestart: calls, afterRestart: protocol.requests.length, serviceExits: [service.child.exitCode, restarted.child.exitCode], externalRequests: 0 }, null, 2))
    }
  }, 45000)

  it('runs the first bobo attachment without an empty core room and preserves both first and later receipts after restart', async () => {
    const protocol = await teamEndpoint(); cleanup.push(protocol.close)
    const path = await root(), { service, client } = await configured(path, protocol.url)
    const valid = join(path, '首次资料.md'), invalid = join(path, '坏文件.md')
    await writeFile(valid, 'BOBO_FIRST_ATTACHMENT_7703'); await writeFile(invalid, Buffer.from([0xff, 0xfe]))
    const bad = await command(path, ['run', '--attachment', invalid, '--request-id', randomUUID(), '--json'])
    expect(bad.code).not.toBe(0); expect(protocol.requests).toHaveLength(0)
    const sessions = await client.invoke('sessions', {}) as { items: Conversation[] }
    expect(sessions.items.filter(room => room.purpose === 'core')).toHaveLength(0)
    const firstId = randomUUID(), args = ['run', '--attachment', valid, '--request-id', firstId, '--json']
    const first = await command(path, args); expect(first.code, first.stderr + first.stdout).toBe(0)
    const original = await client.invoke('getMessageReceipt', { requestId: firstId }) as import('../src/shared/domain').Message
    const detail = await client.invoke('getConversation', { id: original.conversationId }) as import('../src/shared/domain').ConversationDetail
    expect(detail.conversation).toMatchObject({ purpose: 'core', title: '首次资料.md', agentIds: ['bobo'] })
    expect(original.content).toBe(''); expect(original.materialIds).toHaveLength(1)
    expect(await readFile(join(path, 'profile', 'materials', original.conversationId, original.materialIds![0], 'original'), 'utf8')).toBe('BOBO_FIRST_ATTACHMENT_7703')
    const firstCalls = protocol.requests.length
    expect((await command(path, args)).code).toBe(0); expect(protocol.requests).toHaveLength(firstCalls)
    const nextId = randomUUID(), nextArgs = ['run', '--attachment', valid, '--request-id', nextId, '--json', '继续查看附件']
    expect((await command(path, nextArgs)).code).toBe(0)
    const next = await client.invoke('getMessageReceipt', { requestId: nextId }) as import('../src/shared/domain').Message
    expect(next.conversationId).toBe(original.conversationId); expect(next.materialIds).toHaveLength(1)
    const calls = protocol.requests.length
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready, restarted.stderr).toBeTruthy(), { timeout: 15000 })
    const { client: restored } = await connect(path)
    expect((await command(path, args)).code).toBe(0); expect((await command(path, nextArgs)).code).toBe(0)
    expect(await restored.invoke('getMessageReceipt', { requestId: firstId })).toEqual(original)
    expect(await restored.invoke('getMessageReceipt', { requestId: nextId })).toEqual(next)
    expect(protocol.requests).toHaveLength(calls)
    await writeFile(valid, 'CHANGED_FIRST_CORE_ATTACHMENT')
    const changed = await command(path, args); expect(changed.code).toBe(2); expect(changed.stderr).toContain('不同附件')
    expect(protocol.requests).toHaveLength(calls)
    await restored.invoke('server:shutdown', { serverId: restarted.ready.serverId }); expect(await restarted.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true })
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'first-attachment-facts.json'), JSON.stringify({ original, next, firstCalls, beforeRestart: calls, afterRestart: protocol.requests.length, badExit: bad.code, changedExit: changed.code, emptyCoreAfterRejected: true, serviceExits: [0, 0], externalRequests: 0 }, null, 2))
    }
  }, 45000)
  it('uploads multi-frame local attachments in actual send/run and keeps original bytes and receipts across restart', async () => {
    const protocol = await teamEndpoint(); cleanup.push(protocol.close)
    const path = await root(), { service, client } = await configured(path, protocol.url)
    const room = await client.invoke('createConversation', { kind: 'direct', title: 'CLI附件', agentIds: ['researcher'] }) as Conversation
    const textPath = join(path, '资料.md'), binaryPath = join(path, '原件.bin'), text = 'CLI_ATTACHMENT_REAL_TEXT_1901', binary = Buffer.alloc(3 * 1024 * 1024 + 7, 81)
    await writeFile(textPath, text); await writeFile(binaryPath, binary)
    const requestId = randomUUID(), args = ['send', room.id, '--attachment', textPath, '--attachment', binaryPath, '--request-id', requestId, '--json', '阅读这些附件']
    const sent = await command(path, args); expect(sent.code, sent.stderr).toBe(0)
    const receipt = await client.invoke('getMessageReceipt', { requestId }) as import('../src/shared/domain').Message
    expect(receipt.materialIds).toHaveLength(2); expect(receipt.content).toBe('阅读这些附件')
    const bytes = await Promise.all(receipt.materialIds!.map(id => readFile(join(path, 'profile', 'materials', room.id, id, 'original'))))
    expect(bytes[0].toString()).toBe(text); expect(bytes[1]).toEqual(binary)
    expect(JSON.stringify(receipt)).not.toContain(textPath)
    const count = protocol.requests.length
    expect((await command(path, args)).code).toBe(0); expect(protocol.requests).toHaveLength(count)
    const runId = randomUUID(), ran = await command(path, ['run', '--employee', 'researcher', '--attachment', textPath, '--request-id', runId, '--json'])
    expect(ran.code, ran.stderr).toBe(0)
    const runReceipt = await client.invoke('getMessageReceipt', { requestId: runId }) as import('../src/shared/domain').Message
    expect(runReceipt.materialIds).toHaveLength(1); expect(runReceipt.content).toBe('')
    const beforeRestart = protocol.requests.length
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready, restarted.stderr).toBeTruthy(), { timeout: 15_000 })
    const { client: restored } = await connect(path)
    expect((await command(path, args)).code).toBe(0)
    expect(await restored.invoke('getMessageReceipt', { requestId })).toEqual(receipt)
    expect(protocol.requests).toHaveLength(beforeRestart)
    await writeFile(textPath, 'CHANGED_LOCAL_ATTACHMENT')
    const changed = await command(path, args); expect(changed.code).toBe(2); expect(changed.stderr).toContain('不同附件')
    expect(protocol.requests).toHaveLength(beforeRestart)
    await restored.invoke('server:shutdown', { serverId: restarted.ready.serverId }); expect(await restarted.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true })
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'attachment-facts.json'), JSON.stringify({ receipt, runReceipt, sizes: bytes.map(value => value.length), beforeRestart, afterRestart: protocol.requests.length, changedCode: changed.code, serviceExits: [0, 0], externalRequests: 0 }, null, 2))
    }
  })
  it('uses temporary API model parameters in actual send and run without saving credentials or changing defaults', async () => {
    const original = await teamEndpoint(), selected = await teamEndpoint()
    cleanup.push(original.close, selected.close)
    const key = 'SYNTHETIC_WIRE_MODEL_KEY_4112', authorizationMatches: boolean[] = []
    selected.server.on('request', request => authorizationMatches.push(request.headers.authorization === `Bearer ${key}`))
    const path = await root(), { service, client } = await configured(path, original.url)
    const before = { agents: await client.invoke('employees') as DigitalAgent[], connections: await client.invoke('connections') as Connection[] }
    const room = await client.invoke('createConversation', { kind: 'direct', title: '本轮模型', agentIds: ['researcher'] }) as Conversation
    const requestId = randomUUID(), args = ['send', room.id, '--provider', 'openai-compatible', '--model', 'selected-once', '--base-url', selected.url, '--api-key', key, '--request-id', requestId, '--json', '按本轮模型回复']
    const sent = await command(path, args); expect(sent.code, sent.stderr).toBe(0)
    expect(original.requests).toHaveLength(0); expect(selected.requests.length).toBeGreaterThanOrEqual(2)
    expect(selected.requests.every(body => body.model === 'selected-once')).toBe(true)
    expect(authorizationMatches.length).toBe(selected.requests.length); expect(authorizationMatches.every(Boolean)).toBe(true)
    const receipt = await client.invoke('getMessageReceipt', { requestId }) as import('../src/shared/domain').Message
    expect(receipt).toMatchObject({ content: '按本轮模型回复', apiModelSource: { connection: { baseUrl: selected.url, defaultModel: 'selected-once', hasApiKey: true } } })
    const calls = selected.requests.length
    expect((await command(path, args)).code).toBe(0); expect(selected.requests).toHaveLength(calls)
    const normal = await command(path, ['run', '--employee', 'researcher', '--json', '按员工原配置回复'])
    expect(normal.code, normal.stderr).toBe(0); expect(original.requests.every(body => body.model === 'fixture')).toBe(true); expect(original.requests.length).toBeGreaterThanOrEqual(2)
    const originalCalls = original.requests.length
    const modelOnly = await command(path, ['run', '--employee', 'researcher', '--model', 'same-source-new-model', '--json', '只选择本轮模型'])
    expect(modelOnly.code, modelOnly.stderr).toBe(0)
    expect(original.requests.slice(originalCalls).every(body => body.model === 'same-source-new-model')).toBe(true)
    const after = { agents: await client.invoke('employees') as DigitalAgent[], connections: await client.invoke('connections') as Connection[] }
    expect(after.connections).toEqual(before.connections)
    expect(after.agents.find(agent => agent.id === 'researcher')).toEqual(before.agents.find(agent => agent.id === 'researcher'))
    for (const output of [sent, normal, modelOnly]) expect(JSON.stringify(output)).not.toContain(key)
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready).toBeTruthy())
    const restored = await connect(path)
    expect(await restored.client.invoke('getMessageReceipt', { requestId })).toEqual(receipt)
    expect(selected.requests).toHaveLength(calls)
    await restored.client.invoke('server:shutdown', { serverId: restarted.ready.serverId }); expect(await restarted.exit).toBe(0)
    const store = new ProductStore(join(path, 'profile/boai.sqlite')); await store.init()
    try { for (const collection of ['messages', 'requests', 'messageReceipts', 'runs', 'snapshots', 'connections']) expect(JSON.stringify(await store.load(collection))).not.toContain(key) } finally { await store.close() }
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'model-facts.json'), JSON.stringify({ receipt, authorizationMatches, selectedModels: selected.requests.map(body => body.model), defaultModels: original.requests.map(body => body.model), defaultsUnchanged: true, noPersistedKey: true, serviceExits: [service.child.exitCode, restarted.child.exitCode], controlledRequests: selected.requests.length + original.requests.length, externalRequests: 0 }, null, 2))
  }, 45000)
  it('keeps the temporary model across original Work and real nested CLI file execution', async () => {
    const path = await root(), original = await teamEndpoint(), selected = await cliCommandEndpoint(executable)
    cleanup.push(original.close, selected.close)
    const { service, client } = await configured(path, original.url)
    const agent = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
    const saved = await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, allowCommands: true, executionPermission: 'full-access' })
    const key = 'SYNTHETIC_WORK_MODEL_KEY_4118', auth: boolean[] = []
    selected.server.on('request', request => auth.push(request.headers.authorization === `Bearer ${key}`))
    const requestId = randomUUID(), result = await command(path, ['run', '--employee', 'researcher', '--provider', 'openai-compatible', '--base-url', selected.url, '--model', 'task-selected', '--api-key', key, '--json', '--request-id', requestId, '在原任务中写入并读回文件'])
    expect(result.code, result.stderr).toBe(0)
    expect(selected.commandReceipt).toMatchObject({ approved: true, exitCode: 0 })
    const identity = JSON.parse(selected.commandReceipt!.stdout)
    expect(identity.nested).toEqual({ same: true, content: 'CLI_NESTED_FILE' }); expect(identity.hostSecret).toBe(false)
    expect(JSON.stringify({ result, identity })).not.toContain(key)
    expect(original.requests).toHaveLength(0); expect(selected.requests.length).toBeGreaterThanOrEqual(5)
    expect(selected.requests.every(body => body.model === 'task-selected')).toBe(true); expect(auth.every(Boolean)).toBe(true)
    expect((await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')).toEqual(saved)
    const receipt = await client.invoke('getMessageReceipt', { requestId }) as import('../src/shared/domain').Message
    const detail = await client.invoke('getConversation', { id: receipt.conversationId }) as import('../src/shared/domain').ConversationDetail
    expect(detail.workItems).toHaveLength(1); expect(detail.workItems![0].status).toBe('delivered')
    const phases = selected.requests.map(body => {
      const system = (body.messages as { role: string; content: string }[]).filter(message => message.role === 'system').map(message => message.content).join('\n')
      return system.includes('Private participation decision') ? 'decision' : system.includes('Private memory maintenance') ? 'memory' : system.includes('Read the actual new conversation facts.') ? 'report' : 'execution'
    })
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'model-work-facts.json'), JSON.stringify({ receipt, identity, selectedModels: selected.requests.map(body => body.model), phases, authorizationMatches: auth, defaultsUnchanged: true, controlledRequests: selected.requests.length, externalRequests: 0, serviceExit: service.child.exitCode }, null, 2))
  }, 45000)
  it('sends explicit source IDs through the actual send and run commands without rebinding or replay', async () => {
    const endpoint = await teamEndpoint((body, response) => {
      const system = (body.messages as { role: string; content: string }[]).filter(message => message.role === 'system').map(message => message.content).join('\n')
      sendTeamOutput(response, system.includes('Private participation decision') ? { action: 'reply', responseKind: 'chat' } : system.includes('Private memory maintenance') ? { candidates: [] } : '来源指定已收到')
    }); cleanup.push(endpoint.close)
    const path = await root()
    const noModel = async (): Promise<never> => { throw new Error('Source preparation must not run an employee') }
    const prepareSources = () => startOwnedRuntime({ dataPath: join(path, 'profile'), skillDiscovery: { homeDir: path }, engine: { test: noModel, decide: noModel, run: noModel }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
    const config = { name: '同名源', description: '', guide: '', enabled: true, type: 'mcp', mcp: { transport: 'http', url: 'http://127.0.0.1:1/mcp', authType: 'none' } }
    const sources = [] as import('../src/shared/domain/sources').DataSource[]
    const setup = await prepareSources()
    try { for (let i = 0; i < 2; i++) sources.push(await setup.service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config }) as import('../src/shared/domain/sources').DataSource) } finally { await setup.close() }
    let { service, client } = await configured(path, endpoint.url)
    const employee = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = employee
    await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, sourceIds: sources.map(source => source.id) })
    const room = await client.invoke('createConversation', { kind: 'direct', title: 'CLI指定来源', agentIds: [employee.id] }) as Conversation
    const requestId = randomUUID(), args = ['send', room.id, '本轮使用明确数据源', '--source', sources[0].id, '--source', sources[1].id, '--json', '--request-id', requestId]
    const sent = await command(path, args); expect(sent.code, sent.stderr).toBe(0)
    const receipt = await client.invoke('getMessageReceipt', { requestId }) as import('../src/shared/domain').Message
    expect(receipt.content).toBe('本轮使用明确数据源')
    expect(receipt.composerReferences).toEqual(sources.map(source => ({ kind: 'source', id: source.id, name: source.name, revision: 1, agentId: employee.id })))
    const calls = endpoint.requests.length
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0); client.destroy()
    const update = await prepareSources()
    try { await update.service.handle('saveDataSource', { id: sources[0].id, expectedRevision: 1, config: { ...config, enabled: false } }) } finally { await update.close() }
    service = launch(path); await vi.waitFor(() => expect(service.ready, service.stderr).toBeTruthy(), { timeout: 15_000 })
    client = (await connect(path)).client
    const repeated = await command(path, args); expect(repeated.code, repeated.stderr).toBe(0)
    expect(endpoint.requests).toHaveLength(calls)
    const rejected = await command(path, ['run', '--employee', employee.id, '--source', sources[0].id, '--json', '禁止停用源'])
    expect(rejected.code).not.toBe(0); expect(rejected.stderr).toContain('未启用'); expect(endpoint.requests).toHaveLength(calls)
    const nextRequest = randomUUID(), run = await command(path, ['run', '--employee', employee.id, '--source', sources[1].id, '--json', '--request-id', nextRequest, '仅选择第二个同名源'])
    expect(run.code, run.stderr).toBe(0)
    const next = await client.invoke('getMessageReceipt', { requestId: nextRequest }) as import('../src/shared/domain').Message
    expect(next.composerReferences).toEqual([receipt.composerReferences![1]])
    const invalid = await command(path, ['sources', '--source', sources[1].id, '--json']); expect(invalid.code).not.toBe(0); expect(invalid.stderr).toContain('仅适用于')
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'source-facts.json'), JSON.stringify({ receipt, next, rejected: { code: rejected.code, stderr: rejected.stderr }, invalid: { code: invalid.code, stderr: invalid.stderr }, beforeRepeat: calls, afterRepeat: calls, controlledRequests: endpoint.requests.length, externalRequests: 0, serviceExit: service.child.exitCode }, null, 2))
  }, 45000)
  it('executes send and run in an explicit business cwd while preserving original managed storage', async () => {
    const path = await root(), cwdA = join(path, 'project with spaces'), cwdB = join(path, 'project-b')
    await mkdir(cwdA); await mkdir(cwdB)
    const endpoint = await cliCommandEndpoint(executable, true); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    const agent = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
    await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: 'full-access' })
    const room = await client.invoke('createConversation', { kind: 'direct', title: 'CLI工作位置', agentIds: [agent.id] }) as Conversation
    const facts: unknown[] = []
    for (const [args, cwd] of [[['send', room.id, '--cwd'], cwdA], [['run', '--employee', agent.id, '--workspace-dir'], cwdB]] as const) {
      const requestId = randomUUID(), result = await command(path, [...args, cwd, '核对本次工作位置', '--json', '--request-id', requestId])
      expect(result.code, result.stderr).toBe(0)
      const identity = JSON.parse(endpoint.commandReceipt!.stdout)
      expect(identity.cwd).toBe(cwd); expect(identity.nested).toEqual({ same: true, content: 'CLI_NESTED_FILE' })
      expect(await readFile(join(cwd, 'cli-nested.txt'), 'utf8')).toBe('CLI_NESTED_FILE')
      const receipt = await client.invoke('getMessageReceipt', { requestId }) as import('../src/shared/domain').Message
      expect(receipt.content).toBe('核对本次工作位置'); expect(receipt.workingDirectory).toBe(cwd)
      expect(await client.invoke('auth:revoke-run', { grantId: identity.context.grantId })).toEqual({ revoked: false })
      facts.push({ identity, receipt })
    }
    const bad = await command(path, ['run', '--cwd', cwdA, '--workspace-dir', cwdB, '--json', '拒绝冲突'])
    expect(bad.code).not.toBe(0); expect(bad.stderr).toContain('不能指定不同目录')
    const missingRequest = randomUUID(), missing = await command(path, ['send', room.id, '--cwd', join(path, 'missing'), '--json', '--request-id', missingRequest, '不存在目录'])
    expect(missing.code).not.toBe(0); expect(await client.invoke('getMessageReceipt', { requestId: missingRequest })).toBeNull()
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'cwd-facts.json'), JSON.stringify({ facts, conflict: { code: bad.code, stderr: bad.stderr }, missing: { code: missing.code, stderr: missing.stderr }, controlledRequests: endpoint.requests.length, externalRequests: 0, serviceExit: service.child.exitCode }, null, 2))
  }, 45000)
  it('automatically gives an API command its original CLI identity in the actual standalone service', async () => {
    const path = await root(), endpoint = await cliCommandEndpoint(executable); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    const agent = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
    await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, allowCommands: true, executionPermission: 'full-access' })
    const chat = await client.invoke('createConversation', { kind: 'direct', title: '自动CLI命令', agentIds: [agent.id] }) as Conversation
    const result = await command(path, ['send', chat.id, '核对当前员工CLI身份', '--json'])
    const commandReceipt = endpoint.commandReceipt
    expect(result.code, JSON.stringify({ result, commandReceipt })).toBe(0)
    expect(commandReceipt).toMatchObject({ approved: true, exitCode: 0 })
    const identity = JSON.parse(commandReceipt!.stdout)
    expect(identity).toMatchObject({ context: { employee: { id: agent.id }, conversation: { id: chat.id }, expiresAt: null }, denied: 'CHANNEL_NOT_FOUND', hasToken: true, hostSecret: false })
    expect(identity.context.runId).toBe(identity.run)
    expect(identity.nested).toEqual({ same: true, content: 'CLI_NESTED_FILE' })
    expect(await client.invoke('auth:revoke-run', { grantId: identity.context.grantId })).toEqual({ revoked: false })
    const detail = await client.invoke('getConversation', { id: chat.id }) as import('../src/shared/domain').ConversationDetail
    expect(detail.runs.find(run => run.id === identity.run)?.toolEvents).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'execute_command', status: 'completed' })]))
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'environment-facts.json'), JSON.stringify({ identity, commandExit: commandReceipt!.exitCode, credentialRevoked: true, controlledRequests: endpoint.requests.length, externalRequests: 0, serviceExit: service.child.exitCode }, null, 2))
  }, 45000)
  it('queries built CLI/service/runtime versions without running programs and preserves unknown versions after restart', async () => {
    const path = await root(), program = join(path, 'private-program.cjs'), marker = join(path, 'unexpected-execution')
    await writeFile(program, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')\n`, { mode: 0o700 })
    // Create the original product profile and version marker before adding fixture verification records.
    const initialized = launch(path); await vi.waitFor(() => expect(initialized.ready, initialized.stderr).toBeTruthy(), { timeout: 15_000 })
    const initial = await connect(path); await initial.client.invoke('server:shutdown', { serverId: initial.metadata.serverId }); expect(await initialized.exit).toBe(0)
    const store = new ProductStore(join(path, 'profile/boai.sqlite')); await store.init()
    const profiles = new LaunchProfiles(store); await profiles.init()
    const profile = await profiles.save({ name: 'Version fixture', executable: program, args: ['private-argument'], useExistingLogin: false, hostAccessAcknowledged: true })
    await profiles.verified(profile.id, profile.revision, { name: 'fixture', version: '9.8.7-fixture', protocolVersion: 1, checkedAt: '2026-10-18T00:00:00Z' })
    await store.close()
    const first = launch(path); await vi.waitFor(() => expect(first.ready, first.stderr).toBeTruthy(), { timeout: 15_000 })
    const query = async () => {
      const result = await command(path, ['versions', '--json']); expect(result.code, result.stderr).toBe(0)
      expect(result.stdout).not.toContain(path); expect(result.stdout).not.toContain('private-argument')
      return JSON.parse(result.stdout)
    }
    const known = await query()
    expect(known).toMatchObject({ cli: version, service: version, protocol: PROTOCOL_VERSION, runtimes: { node: process.versions.node, mastra: { source: 'installed-package' }, programs: [{ profileId: profile.id, version: '9.8.7-fixture', availability: 'available' }] } })
    expect(known.runtimes.plugins).toHaveLength(2)
    expect(known.runtimes.plugins.every((item: { source: string }) => item.source === 'verified-package')).toBe(true)
    await writeFile(program, '#!/usr/bin/env node\nthrow new Error("changed program must not execute")\n')
    const changed = await query(); expect(changed.runtimes.programs[0]).toMatchObject({ version: null, source: 'unknown', availability: 'changed', lastVerification: { version: '9.8.7-fixture' } })
    const owner = await connect(path); await owner.client.invoke('server:shutdown', { serverId: owner.metadata.serverId }); expect(await first.exit).toBe(0)
    const second = launch(path); await vi.waitFor(() => expect(second.ready, second.stderr).toBeTruthy(), { timeout: 15_000 })
    const restored = await query(); expect(restored.runtimes.programs[0]).toMatchObject({ version: null, source: 'unknown', availability: 'changed' })
    const next = await connect(path); await next.client.invoke('server:shutdown', { serverId: next.metadata.serverId }); expect(await second.exit).toBe(0)
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'versions-facts.json'), JSON.stringify({ known, changed, restored, exits: [0, 0, 0], executableWasNotRun: true, controlledRequests: 0, externalRequests: 0 }, null, 2))
  }, 45_000)

  it('executes without Electron, rejects a second owner, recovers a killed process and retains history without replay', async () => {
    const path = await root(), endpoint = await teamEndpoint(); cleanup.push(endpoint.close)
    let authenticated = 0
    endpoint.server.on('request', request => { if (request.headers.authorization === 'Bearer fixture-service-secret-2093') authenticated++ })
    const first = launch(path)
    await vi.waitFor(() => expect(first.ready, first.stderr).toBeTruthy(), { timeout: 15_000 })
    expect(first.stdout).not.toContain('fixture-service-secret-2093'); expect(first.stdout).not.toContain('token')
    const { client, metadata } = await connect(path)
    expect(first.ready.owner.pid).toBe(first.child.pid); expect(first.ready.browserAvailable).toBe(false)
    const contender = launch(path)
    expect(await contender.exit).toBe(1); expect(contender.stderr).toContain('SERVER_BUSY'); expect(contender.ready).toBeUndefined()
    const connection = await client.invoke('saveConnection', { name: 'Node fixture', provider: 'openai-compatible', baseUrl: endpoint.url, defaultModel: 'fixture' }) as Connection
    await client.invoke('credentials:bind', { id: connection.id, expectedRevision: connection.revision, environmentVariable: 'BOAI_SECRET_FIXTURE' })
    const agent = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
    await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture' })
    const room = await client.invoke('createConversation', { kind: 'direct', title: 'Independent Node', agentIds: [agent.id] }) as Conversation
    const requestId = randomUUID(), prompt = 'NODE_C3_2093\n中文多行原消息'
    const sent = await command(path, ['send', room.id, '--stdin', '--json', '--request-id', requestId], prompt)
    expect(sent.code, sent.stderr).toBe(0); expect(sent.stderr).toBe('')
    const events = sent.stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
    const before = endpoint.requests.length
    expect(before).toBeGreaterThan(0); expect(authenticated).toBe(before)
    // A real crash leaves metadata behind; only the OS transaction release allows the next process.
    first.child.kill('SIGKILL'); expect(await first.exit).toBeNull()
    expect(await readFile(join(path, 'profile/.cli/owner.json'), 'utf8')).toContain(first.ready.owner.instanceId)
    const second = launch(path)
    await vi.waitFor(() => expect(second.ready, second.stderr).toBeTruthy(), { timeout: 15_000 })
    const fresh = await connect(path)
    expect(fresh.metadata.serverId).not.toBe(metadata.serverId); expect(fresh.metadata.token).not.toBe(metadata.token)
    expect(await fresh.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed', activeRunIds: [] })
    const history = await fresh.client.invoke('listConversationMessages', { conversationId: room.id }) as { items: { message?: { senderType: string; content: string } }[] }
    expect(history.items.filter(item => item.message?.senderType === 'user').map(item => item.message!.content)).toEqual([prompt])
    expect(endpoint.requests).toHaveLength(before)
    expect(await fresh.client.invoke('credentials:status')).toContainEqual({ id: connection.id, available: true, mode: 'environment', environmentVariable: 'BOAI_SECRET_FIXTURE' })
    expect(await command(path, ['invoke', 'server:shutdown', JSON.stringify({ serverId: fresh.metadata.serverId }), '--json'])).toMatchObject({ code: 0 })
    expect(await second.exit).toBe(0)
    expect(first.stdout.trim().split('\n').map(line => JSON.parse(line).type)).toEqual(['ready'])
    expect(second.stdout.trim().split('\n').map(line => JSON.parse(line).type)).toEqual(['ready', 'stopped'])
    await expect(readLocalConnection(join(path, 'profile'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(endpoint.requests).toHaveLength(before)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'process-facts.json'), JSON.stringify({ firstReady: first.ready, secondReady: second.ready, firstExitSignal: first.child.signalCode, competitorExit: 1, competitorStderr: contender.stderr, secondExit: 0, controlledRequests: before, authenticatedRequests: authenticated, requestsAfterRestartAndShutdown: endpoint.requests.length, events, history, stdoutContainsSecret: first.stdout.includes('fixture-service-secret-2093'), persistedReferences: JSON.parse(await readFile(join(path, 'profile/.cli/credential-refs.json'), 'utf8')) }, null, 2))
    }
  }, 45_000)

  it('listens to original session events and pages messages through the built CLI, with clean interrupt and disconnect exits', async () => {
    const path = await root(), endpoint = await teamEndpoint(); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    const room = await client.invoke('createConversation', { kind: 'direct', title: 'Listen and page', agentIds: ['researcher'] }) as Conversation
    const listen = () => {
      const child = spawn(binary, [executable, '--data-dir', join(path, 'profile'), 'listen', 'session:event', '--session', room.id], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path }, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = '', ended = false
      child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
      const exit = new Promise<number | null>(resolve => child.once('exit', code => { ended = true; resolve(code) }))
      cleanup.push(async () => { if (!ended) { child.kill('SIGKILL'); await exit } })
      return { child, exit, get stdout() { return stdout }, get stderr() { return stderr }, events: () => stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
    }
    const first = listen(); await vi.waitFor(() => expect(first.events()[0]).toMatchObject({ type: 'subscribed', channel: 'session:event', conversationId: room.id }), { timeout: 10_000 })
    const sent = await command(path, ['send', room.id, 'CLI_PAGE_2097', '--json']); expect(sent.code, sent.stderr).toBe(0)
    await vi.waitFor(() => expect(first.events().some(event => event.event?.type === 'message' && event.event.message.senderType === 'agent')).toBe(true))
    const page = async (args: string[]) => {
      const result = await command(path, ['session', 'messages', room.id, '--json', '--limit', '1', ...args]); expect(result.code, result.stderr).toBe(0); return JSON.parse(result.stdout)
    }
    const latest = await page([]), older = await page(['--cursor', JSON.stringify(latest.beforeCursor)])
    expect(older.items[0].message.content).toBe('CLI_PAGE_2097')
    const forward = await page(['--cursor', JSON.stringify(older.afterCursor), '--direction', 'after'])
    expect(forward.items.map((item: { messageId: string }) => item.messageId)).toEqual(latest.items.map((item: { messageId: string }) => item.messageId))
    const empty = await page(['--cursor', JSON.stringify(older.beforeCursor)]); expect(empty.items).toEqual([])
    for (const args of [['session', 'messages', room.id, '--cursor', '{'], ['session', 'messages', room.id, '--direction', 'after'], ['versions', '--limit', ''], ['listen', 'private:credentials']]) {
      const invalid = await command(path, args); expect(invalid.code).toBe(2); expect(invalid.stderr).toContain('INVALID_REQUEST'); expect(invalid.stdout).toBe('')
    }
    first.child.kill('SIGINT'); expect(await first.exit).toBe(130); expect(first.stderr).toBe('')
    const second = listen(); await vi.waitFor(() => expect(second.events()[0]).toMatchObject({ type: 'subscribed' }), { timeout: 10_000 })
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    expect(await second.exit).toBe(4); expect(second.stderr).toContain('CLIENT_DISCONNECTED')
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'history-events-facts.json'), JSON.stringify({ events: first.events(), latest, older, forward, empty, exits: { interrupt: 130, disconnect: 4, service: 0 }, disconnectedStderr: second.stderr, controlledRequests: endpoint.requests.length, externalRequests: 0 }, null, 2))
  }, 45_000)

  it('run reuses an existing owner, starts absent owners and preserves request identity across automatic shutdown', async () => {
    const path = await root(), endpoint = await teamEndpoint(); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url), requestId = randomUUID()
    const args = ['run', '--employee', 'researcher', '--stdin', '--request-id', requestId, '--json']
    const first = await command(path, args, 'RUN_C3_2094\n原员工私聊')
    expect(first.code, first.stderr).toBe(0)
    const events = first.stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(events.at(-1)).toMatchObject({ type: 'service', state: 'reused', serverId: service.ready.serverId })
    expect(service.exited).toBe(false)
    const calls = endpoint.requests.length
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const second = await command(path, args, 'RUN_C3_2094\n原员工私聊')
    expect(second.code, second.stderr).toBe(0)
    const repeatEvents = second.stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(repeatEvents.find(event => event.type === 'accepted').messageId).toBe(events.find(event => event.type === 'accepted').messageId)
    expect(repeatEvents.at(-1)).toMatchObject({ type: 'service', state: 'stopped' })
    expect(repeatEvents.at(-1).serverId).not.toBe(service.ready.serverId)
    await expect(readLocalConnection(join(path, 'profile'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(endpoint.requests).toHaveLength(calls)
    const third = await command(path, ['run', '--employee', '研究员', '--json', 'RUN_C3_2094_NEXT'])
    expect(third.code, third.stderr).toBe(0)
    const nextEvents = third.stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(nextEvents.at(-1)).toMatchObject({ type: 'service', state: 'stopped' })
    expect(nextEvents.find(event => event.type === 'accepted').conversationId).toBe(events.find(event => event.type === 'accepted').conversationId)
    expect(endpoint.requests.length).toBeGreaterThan(calls)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'run-facts.json'), JSON.stringify({ events, repeatEvents, nextEvents, requestsBeforeRestart: calls, requestsAfterDuplicate: calls, finalRequests: endpoint.requests.length, actualExit: true }, null, 2))
  }, 45_000)

  it('streams before publication, detaches without cancellation and follows the same request without resubmission', async () => {
    const path = await root(), partial = 'CLI增量正文🙂', ending = '，原任务继续完成。'
    let release: (() => void) | undefined, publicRequests = 0
    const endpoint = await teamEndpoint((body, response) => {
      const messages = body.messages as { role: string; content: string }[]
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      if (system.includes('Private participation decision')) sendTeamOutput(response, { action: 'reply', responseKind: 'chat' })
      else if (system.includes('Private memory maintenance')) sendTeamOutput(response, { candidates: [] })
      else {
        publicRequests++
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'cli-partial', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
        emit({ role: 'assistant', content: partial })
        let finished = false
        release = () => {
          if (finished) return
          finished = true; emit({ content: ending }); emit({}, 'stop')
          response.write(`data: ${JSON.stringify({ id: 'cli-partial', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 } })}\n\n`)
          response.end('data: [DONE]\n\n')
        }
      }
    }); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    cleanup.push(() => release?.())
    const room = await client.invoke('createConversation', { kind: 'direct', title: 'CLI partial', agentIds: ['researcher'] }) as Conversation
    const requestId = randomUUID()
    const start = (args: string[]) => {
      const child = spawn(binary, [executable, '--data-dir', join(path, 'profile'), ...args], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path }, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = '', exited = false
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
      child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
      const exit = new Promise<number | null>(resolve => child.once('exit', code => { exited = true; resolve(code) }))
      cleanup.push(async () => { if (!exited) { child.kill('SIGKILL'); await exit } })
      return { child, exit, get stdout() { return stdout }, get stderr() { return stderr } }
    }
    const sender = start(['send', room.id, '--request-id', requestId, '--send-timeout', '20000', 'CLI_STREAM_DETACH_2097'])
    await vi.waitFor(() => expect(sender.stdout, sender.stderr).toContain(partial), { timeout: 10000 })
    expect(sender.stdout).not.toContain('[已发布回答')
    const before = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(before.state).toBe('running'); expect(before.activeRunIds).not.toHaveLength(0)
    const grant = await client.invoke('auth:issue-run', { runId: before.runs.find(run => run.phase === 'execution')!.id }) as RunCliGrant
    const environment = { BOAI_SERVER_URL: (await readLocalConnection(join(path, 'profile'))).url, BOAI_SERVER_TOKEN: grant.token }
    const scoped = await command(path, ['invoke', 'employee:context', '--json'], undefined, environment)
    expect(scoped.code, scoped.stderr).toBe(0)
    expect(JSON.parse(scoped.stdout)).toMatchObject({ employeeId: 'researcher', runId: grant.runId })
    const denied = await command(path, ['invoke', 'approve', JSON.stringify({ id: 'self-approve', approved: true }), '--json'], undefined, environment)
    expect(denied.code).toBe(1); expect(denied.stderr).toContain('CHANNEL_NOT_FOUND')
    const requestsBeforeDetach = endpoint.requests.length
    sender.child.kill('SIGINT'); expect(await sender.exit).toBe(130)
    expect(JSON.parse(sender.stderr.trim().split('\n').at(-1)!)).toMatchObject({ state: 'detached', recovery: { observe: { command: 'receipt', args: [requestId, '--follow'] } } })
    const detached = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(detached.activeRunIds).toEqual(before.activeRunIds); expect(detached.state).toBe('running')
    const follower = start(['receipt', requestId, '--follow', '--json', '--send-timeout', '20000'])
    await vi.waitFor(() => expect(follower.stdout, follower.stderr).toContain('text_delta'), { timeout: 10000 })
    expect(endpoint.requests).toHaveLength(requestsBeforeDetach)
    expect(publicRequests).toBe(1)
    release!()
    expect(await follower.exit).toBe(0); expect(follower.stderr).toBe('')
    const events = follower.stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(events[0]).toMatchObject({ type: 'request', operation: 'observe', requestId })
    expect(events.some(event => event.type === 'accepted')).toBe(false)
    expect(events.filter(event => event.type === 'text_delta').map(event => event.delta).join('')).toBe(partial + ending)
    expect(events.filter(event => event.type === 'message').at(-1)).toMatchObject({ message: { content: partial + ending, status: 'completed' } })
    expect(events.at(-1)).toMatchObject({ state: 'completed', exitCode: 0 })
    const final = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(final.activeRunIds).toEqual([])
    const expired = await command(path, ['invoke', 'employee:context', '--json'], undefined, environment)
    expect(expired.code).toBe(1); expect(expired.stderr).toContain('AUTH_FAILED')
    expect(final.runs.filter(run => run.phase === 'execution').map(run => run.id)).toEqual(before.runs.filter(run => run.phase === 'execution').map(run => run.id))
    expect(publicRequests).toBe(1)
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'stream-facts.json'), JSON.stringify({ before, detached, final, runCredential: { context: JSON.parse(scoped.stdout), denied: { code: denied.code, stderr: denied.stderr }, expired: { code: expired.code, stderr: expired.stderr } }, sender: { stdout: sender.stdout, stderr: sender.stderr, exitCode: 130 }, events, requestsBeforeDetach, controlledRequests: endpoint.requests.length, externalRequests: 0, publicRequests, serviceExit: service.child.exitCode }, null, 2))
  }, 35000)

  it('hands off a timed-out run, keeps the actual work alive and allows explicit reconnection and shutdown', async () => {
    const path = await root()
    let release: (() => void) | undefined
    const endpoint = await teamEndpoint((body, response) => {
      const messages = body.messages as { role: string; content: string }[]
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      if (system.includes('Private participation decision')) sendTeamOutput(response, { action: 'reply', responseKind: 'chat' })
      else if (system.includes('Private memory maintenance')) sendTeamOutput(response, { candidates: [] })
      else { let sent = false; release = () => { if (!sent) { sent = true; sendTeamOutput(response, '后台交接后完成原消息') } } }
    }); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); await service.exit
    const requestId = randomUUID(), result = await command(path, ['run', '--employee', 'researcher', '--json', '--request-id', requestId, '--send-timeout', '400', 'RUN_C3_2095_BACKGROUND'])
    expect(result.code, result.stderr).toBe(4)
    const events = result.stdout.trim().split('\n').map(line => JSON.parse(line)), handoff = events.at(-1)
    expect(handoff).toMatchObject({ type: 'service', state: 'background', requestId })
    expect((await stat(handoff.logPath)).mode & 0o777).toBe(0o600)
    const fresh = await connect(path)
    cleanup.push(async () => { release?.(); if (fresh.client.isConnected) await fresh.client.invoke('server:shutdown', { serverId: fresh.metadata.serverId }).catch(() => {}); await vi.waitFor(async () => { await expect(readLocalConnection(join(path, 'profile'))).rejects.toMatchObject({ code: 'ENOENT' }) }, { timeout: 10_000 }) })
    expect(fresh.metadata.serverId).toBe(handoff.serverId)
    expect(await fresh.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'running' })
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); release!()
    await vi.waitFor(async () => expect(await fresh.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed', activeRunIds: [] }))
    const final = await fresh.client.invoke('getMessageExecution', { requestId })
    await fresh.client.invoke('server:shutdown', { serverId: fresh.metadata.serverId })
    await vi.waitFor(() => expect(() => process.kill(handoff.pid, 0)).toThrow(), { timeout: 10_000 })
    expect(await readFile(handoff.logPath, 'utf8')).toContain('"type":"stopped"')
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'handoff-facts.json'), JSON.stringify({ events, final, requests: endpoint.requests.length, actualExit: true }, null, 2))
  }, 45_000)

  it('run SIGINT cancels only its accepted request and waits for the spawned owner to actually exit', async () => {
    const path = await root()
    let executing = false
    const endpoint = await teamEndpoint((body, response) => {
      const messages = body.messages as { role: string; content: string }[]
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      if (system.includes('Private participation decision')) sendTeamOutput(response, { action: 'reply', responseKind: 'chat' })
      else if (system.includes('Private memory maintenance')) sendTeamOutput(response, { candidates: [] })
      else { executing = true; response.on('close', () => { executing = false }) }
    }); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); await service.exit
    const requestId = randomUUID(), child = spawn(binary, [executable, '--data-dir', join(path, 'profile'), 'run', '--employee', 'researcher', '--request-id', requestId, '--json', 'RUN_C3_2096_CANCEL'], { cwd: path, env: { ...runtimeEnvironment, PATH: process.env.PATH, HOME: path, TMPDIR: path, BOAI_SECRET_FIXTURE: 'fixture-service-secret-2093' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', exited = false
    child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
    const exit = new Promise<number | null>(resolve => child.once('exit', code => { exited = true; resolve(code) }))
    cleanup.push(async () => { if (!exited) { child.kill('SIGINT'); await exit } })
    await vi.waitFor(() => expect(executing, stderr).toBe(true), { timeout: 15_000 })
    child.kill('SIGINT')
    expect(await exit, stderr).toBe(130)
    const events = stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(events.filter(event => event.type === 'status').at(-1).status).toMatchObject({ requestId, state: 'cancelled', activeRunIds: [] })
    const stopped = events.at(-1)
    expect(stopped).toMatchObject({ type: 'service', state: 'stopped' })
    expect(await readFile(stopped.logPath, 'utf8')).toContain('"type":"stopped"')
    expect(() => process.kill(stopped.pid, 0)).toThrow()
    await expect(readLocalConnection(join(path, 'profile'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(executing).toBe(false)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'interrupt-facts.json'), JSON.stringify({ events, stderr, exitCode: 130, requests: endpoint.requests.length, actualExit: true }, null, 2))
  }, 45_000)

  it('session commands keep durable original receipts across restart and never delete newer messages on a duplicate', async () => {
    const path = await root(), endpoint = await teamEndpoint(); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    const createId = randomUUID(), deleteId = randomUUID()
    const createArgs = ['session', 'create', '--employee', 'researcher', '--name', '终端主私聊', '--request-id', createId, '--json']
    const created = await command(path, createArgs); expect(created.code, created.stderr).toBe(0)
    const receipt = JSON.parse(created.stdout)
    expect(receipt).toMatchObject({ operation: 'create', state: 'completed', created: true })
    expect(JSON.parse((await command(path, createArgs)).stdout)).toEqual(receipt)
    expect((await command(path, ['session','create','--employee','researcher','--name','冲突','--request-id',createId])).code).toBe(1)
    expect((await command(path, ['ping','--name','无效选项'])).code).toBe(2)
    expect((await command(path, ['session','create'])).code).toBe(2)
    expect((await command(path, ['send', receipt.conversationId, 'SESSION_BEFORE_DELETE', '--json'])).code).toBe(0)
    const deletion = await command(path, ['session','delete',receipt.conversationId,'--request-id',deleteId,'--json'])
    expect(deletion.code, deletion.stderr).toBe(0)
    expect(JSON.parse(deletion.stdout)).toMatchObject({ operation: 'delete', state: 'completed', conversationId: receipt.conversationId })
    expect(JSON.parse((await command(path, ['session','messages',receipt.conversationId,'--json'])).stdout).items).toEqual([])
    expect((await command(path, createArgs)).code).toBe(4)
    expect((await command(path, ['send',receipt.conversationId,'SESSION_AFTER_DELETE','--json'])).code).toBe(0)
    const calls = endpoint.requests.length
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const restarted = launch(path); await vi.waitFor(() => expect(restarted.ready, restarted.stderr).toBeTruthy(), { timeout: 15_000 })
    const fresh = await connect(path)
    expect(JSON.parse((await command(path, ['session','receipt',deleteId,'--json'])).stdout)).toEqual(JSON.parse(deletion.stdout))
    expect((await command(path, ['session','delete',receipt.conversationId,'--request-id',deleteId,'--json'])).code).toBe(0)
    const history = JSON.parse((await command(path, ['session','messages',receipt.conversationId,'--json'])).stdout)
    expect(history.items.filter((item: { message?: { senderType: string } }) => item.message?.senderType === 'user').map((item: { message: { content: string } }) => item.message.content)).toEqual(['SESSION_AFTER_DELETE'])
    expect(endpoint.requests).toHaveLength(calls)
    await fresh.client.invoke('server:shutdown', { serverId: fresh.metadata.serverId }); expect(await restarted.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'session-facts.json'), JSON.stringify({ created: receipt, deletion: JSON.parse(deletion.stdout), history, callsBeforeRestart: calls, callsAfterRestart: endpoint.requests.length, oldExit: service.child.exitCode, newExit: restarted.child.exitCode }, null, 2))
  }, 45_000)
  it('cancel selects explicit group runs, preserves peers and reconciles the same stopped run after restart', async () => {
    const path = await root(), endpoint = await cancellationEndpoint(); cleanup.push(endpoint.close)
    const { service, client } = await configured(path, endpoint.url)
    const employees = await client.invoke('employees') as DigitalAgent[], researcher = employees.find(agent => agent.id === 'researcher')!
    for (const agent of employees.filter(agent => agent.id in cancellationInstructions)) {
      const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
      await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: researcher.connectionId, modelId: 'fixture', instructions: cancellationInstructions[agent.id as keyof typeof cancellationInstructions] })
    }
    const room = await client.invoke('createConversation', { kind: 'group', title: 'CLI精确停止', agentIds: ['researcher','writer'] }) as Conversation
    const requestId = randomUUID()
    await client.invoke('sendMessage', { conversationId: room.id, content: '分别回复本条消息', requestId, mentionIds: [] })
    await vi.waitFor(() => expect(endpoint.pending.size, JSON.stringify(endpoint.errors)).toBe(2), { timeout: 10_000 })
    const targets = await client.invoke('getCancellationTargets', { conversationId: room.id }) as CancellationTarget[]
    const selected = targets.find(target => target.agentId === 'researcher')!, peer = targets.find(target => target.agentId === 'writer')!
    const ambiguous = await command(path, ['cancel',room.id,'--json'])
    expect(ambiguous.code, ambiguous.stderr).toBe(2); expect(JSON.parse(ambiguous.stdout)).toMatchObject({ type: 'selection-required' })
    expect(endpoint.closed).toEqual([])
    const selectedStop = await command(path, ['cancel',room.id,'--run',selected.runId!,'--json'])
    expect(selectedStop.code, selectedStop.stderr).toBe(0)
    const stopped = selectedStop.stdout.trim().split('\n').map(line => JSON.parse(line)).at(-1)
    expect(stopped).toMatchObject({ state: 'stopped', activeRunIds: [], runIds: [selected.runId] })
    expect(stopped.runIds).not.toContain(peer.runId)
    await vi.waitFor(() => expect(endpoint.closed).toEqual(['researcher']))
    expect(endpoint.pending.has('writer')).toBe(true)
    endpoint.publish('writer')
    await vi.waitFor(async () => expect(await client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'cancelled', activeRunIds: [] }), { timeout: 10_000 })
    await client.invoke('sendMessage', { conversationId: room.id, content: 'researcher现在处理新消息', requestId: randomUUID(), mentionIds: ['researcher'] })
    await vi.waitFor(() => expect(endpoint.pending.has('researcher')).toBe(true), { timeout: 10_000 })
    expect((await command(path, ['cancel',room.id,'--run',selected.runId!,'--json'])).code).toBe(0)
    expect(endpoint.pending.has('researcher')).toBe(true)
    const unique = await command(path, ['cancel',room.id,'--json'])
    expect(unique.code, unique.stderr).toBe(0)
    const uniqueStop = unique.stdout.trim().split('\n').map(line => JSON.parse(line)).at(-1)
    expect(uniqueStop.runId).not.toBe(selected.runId); expect(uniqueStop.state).toBe('stopped')
    const requests = endpoint.requests.length
    await client.invoke('server:shutdown', { serverId: service.ready.serverId }); expect(await service.exit).toBe(0)
    const restarted = launch(path)
    await vi.waitFor(() => expect(restarted.ready, restarted.stderr).toBeTruthy(), { timeout: 15_000 })
    const fresh = await connect(path)
    const afterRestart = await fresh.client.invoke('getRunCancellation', { conversationId: room.id, runId: selected.runId })
    expect(afterRestart).toMatchObject({ state: 'stopped', runIds: [selected.runId], activeRunIds: [] })
    expect((await command(path, ['cancel',room.id,'--run',selected.runId!,'--json'])).code).toBe(0)
    expect(endpoint.requests).toHaveLength(requests); expect(endpoint.errors).toEqual([])
    await fresh.client.invoke('server:shutdown', { serverId: fresh.metadata.serverId }); expect(await restarted.exit).toBe(0)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, 'cancel-facts.json'), JSON.stringify({ targets, ambiguous, stopped, uniqueStop, afterRestart, requests, requestsAfterRestart: endpoint.requests.length, closed: endpoint.closed, oldExit: service.child.exitCode, newExit: restarted.child.exitCode }, null, 2))
  }, 60_000)

})

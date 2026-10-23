/*
 * [OUTPUT]: One real API/Codex mixed-group request preserves independent employee replies and original receipt without Work/replay.
 * [OUTPUT]: Installed Pi smoke uses its original login and plugin namespace; no adapter or model loop replacement.
 * [OUTPUT]: Actual CLI file delivery checks original bytes/hash, desktop preview and receipt/restart without publishing twice.
 * [OUTPUT]: Desktop DOM readiness is separate from published CLI endpoint; restart receipt observation waits for the new server identity without resending.
 * [INPUT]: Explicit real-backend selection, original saved credential bridge or installed login, built standalone CLI and isolated Desktop.
 * [OUTPUT]: Two actual turns/backend, random context recall, original receipt/native session identity and restart without new acceptance; actual process exits retained.
 * [POS]: CLI real functional acceptance; no personal profile writes, automatic retry or independent quality certification.
 * [PROTOCOL]: Changes update Header and parent .folder.md.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { copyFile, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile } from '../../../src/shared/domain'
import type { MessageExecution } from '../../../src/shared/domain/message-execution'
import { readLocalConnection } from '../../../src/cli/discovery'
import { prepareV2DataRoot } from '../../../src/main/migration'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { test as base } from '../support/test'

type State = { backend?: string; agent?: DigitalAgent; room?: Conversation; dataPath?: string; requestId?: string; tag?: string; expectedFile?: string; first?: ConversationDetail; final?: ConversationDetail; nativeFirst?: unknown[]; command?: (args: string[], stdin?: string) => Promise<{ stdout: string; stderr: string; code: number }> }
function records(dataPath: string) {
  const db = new DatabaseSync(join(dataPath, 'boai.sqlite'), { readOnly: true })
  const load = (collection: string) => db.prepare('SELECT value FROM records WHERE collection=? ORDER BY rowid').all(collection).map(row => JSON.parse(String(row.value)))
  try { return { artifacts: load('artifacts'), runs: load('runs'), messages: load('messages'), works: load('workItems'), codexSessions: load('codexSessions'), claudeSessions: load('claudeSessions'), pluginSessions: load('pluginSessions'), actions: load('nativeActions') } } finally { db.close() }
}
export const test = base.extend<{ realCli: State }>({ realCli: async ({ runtime }, use) => {
  const state: State = {}
  try { await use(state) } finally {
    if (state.dataPath) {
      if (state.room) await runtime.reviewData('真实CLI最终会话', await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.room.id))
      await archiveNativeFinalReview(runtime, { label: '真实CLI', records: async () => records(state.dataPath!) })
    }
  }
} })
const { Given, When, Then } = createBdd(test)
Given('CLI已准备真实的{string}员工', async ({ runtime: d, realCli: s }, backend: string) => {
  test.skip(process.env.BOAI_REAL_CLI !== '1' || !(process.env.BOAI_REAL_CLI_BACKENDS ?? '').split(',').includes(backend), '本批未明确启用真实CLI后端')
  test.setTimeout(480000); test.info().annotations.push({ type: 'model-mode', description: 'real-provider' }); s.backend = backend
  const executable = process.env[backend === 'pi' ? 'BOAI_NATIVE_PI' : backend === 'codex' ? 'BOAI_NATIVE_CODEX' : 'BOAI_NATIVE_CLAUDE']
  if (backend !== 'api') expect(executable).toBeTruthy()
  await d.reviewData('真实CLI预登记', { backend, userTurns: (test.info().title.includes('交付真实文件') || test.info().title.includes('混合群')) ? 1 : 2, retries: 0, nativeInternalRequests: 'unknown', apiUsage: 'original Run', executable, executableHash: executable && backend !== 'api' ? createHash('sha256').update(await readFile(executable)).digest('hex') : undefined, plan: test.info().title.includes('混合群') ? 'One CLI message to API/native mixed group; independent replies and same request receipt; restart submits nothing' : test.info().title.includes('交付真实文件') ? 'CLI stdin publishes exact file; desktop previews original; receipt observe and restart submit nothing' : 'CLI stdin then desktop followup recalls random marker without repeating it; receipt observe and restart submit nothing' })
  await prepareV2DataRoot(d.root)
  const connection = backend === 'api' ? await prepareSavedModel(d) : undefined
  await d.start(connection ? await systemKeychainLaunch(d) : undefined)
  let profile: LaunchProfile | undefined
  if (backend !== 'api') {
    const plugin = backend === 'pi' ? (await d.page.evaluate(() => window.boai.request('listRuntimePlugins', undefined))).plugins.find(item => item.manifest.id === 'boai.runtime.pi') : undefined
    if (backend === 'pi') expect(plugin?.enabled).toBe(true)
    const draft = { name: '真实CLI-' + backend, executable: executable!, args: [], protocol: backend === 'pi' ? 'runtime-plugin' as const : backend === 'codex' ? 'codex-app-server' as const : 'claude-cli' as const, ...(plugin ? { runtimePlugin: { pluginId: plugin.manifest.id, providerId: 'pi', packageHash: plugin.packageHash } } : {}), useExistingLogin: true, hostAccessAcknowledged: true as const }
    await d.page.evaluate(input => window.boai.request('testLaunchProfileDraft', input), draft)
    profile = await d.page.evaluate(input => window.boai.request('saveLaunchProfile', input), draft)
  }
  s.agent = await d.page.evaluate(({ backend, profile, connection }) => window.boai.request('saveAgent', {
    name: 'CLI实测-' + backend, role: '日常连续交流', instructions: '沿同一聊天回答用户问题；无需工具时直接回答，不把普通聊天变成文件任务。',
    connectionId: connection?.id ?? '', modelId: connection?.defaultModel ?? (backend === 'pi' ? 'deepseek/deepseek-flash' : backend === 'claude' ? 'sonnet' : ''),
    ...(profile ? { executionBackend: backend === 'pi' ? { kind: 'runtime-plugin' as const, profileId: profile.id, pluginId: profile.runtimePlugin!.pluginId, providerId: 'pi' } : { kind: backend === 'codex' ? 'codex-local' as const : 'claude-local' as const, profileId: profile.id } } : {}),
    executionPermission: 'ask', nativeOptions: backend === 'codex' ? { codexSandbox: 'read-only', codexApprovalPolicy: 'on-request' } : { claudePermissionMode: 'default' },
    color: '#3478ce', skillIds: [], knowledgeIds: [], sourceIds: [], allowCommands: false, allowBrowser: false, active: true,
  }), { backend, profile, connection })
  s.room = await d.page.evaluate(id => window.boai.request('createConversation', { kind: 'direct', title: 'CLI连续实测-' + id, agentIds: [id] }), s.agent.id)
  s.dataPath = (await d.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  const entry = join(d.root, 'boai-standalone.mjs'); await copyFile(resolve('dist/cli/index.mjs'), entry)
  s.command = (args, stdin) => new Promise(resolveResult => {
    const child = execFile(process.execPath, [entry, '--data-dir', s.dataPath!, ...args], { cwd: d.root, env: { PATH: process.env.PATH, HOME: d.root, TMPDIR: d.root }, timeout: 240000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => resolveResult({ stdout, stderr, code: typeof error?.code === 'number' ? error.code : error ? -1 : 0 }))
    child.stdin?.end(stdin)
  })
  s.requestId = randomUUID(); s.tag = 'STAR-' + randomUUID().slice(0, 8)
  await d.reviewData('真实CLI原员工', { agent: s.agent, room: s.room, profile, connection: connection && { id: connection.id, provider: connection.provider, model: connection.defaultModel } })
})
When('CLI和桌面各发送一轮随机标记的连续问题', async ({ runtime: d, realCli: s }) => {
  const content = `这轮做一个普通聊天核对。项目识别码是 ${s.tag}，今天准备红茶7杯、绿茶5杯。\n请回复识别码和总杯数即可，不使用工具、联网或创建文件。`
  await d.reviewData('真实CLI原输入', { content, requestId: s.requestId })
  const sent = await s.command!(['run', '--employee', s.agent!.id, '--stdin', '--request-id', s.requestId!, '--send-timeout', '210000', '--json', '--no-spinner'], content)
  await d.reviewData('真实CLI首轮标准输出', sent)
  expect(sent.code).toBe(0); expect(sent.stderr).toBe('')
  const events = sent.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events.find(event => event.type === 'accepted')).toMatchObject({ requestId: s.requestId, conversationId: s.room!.id })
  expect(events.find(event => event.type === 'result')).toMatchObject({ state: 'completed', exitCode: 0 })
  expect(events.at(-1)).toMatchObject({ type: 'service', state: 'reused' })
  s.first = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.room!.id)
  const reply = s.first.messages.filter(m => m.senderType === 'agent' && m.status === 'completed').map(m => m.content).join('\n')
  expect(reply).toContain(s.tag!); expect(reply).toContain('12'); expect(s.first.workItems).toEqual([])
  const stored = records(s.dataPath!); s.nativeFirst = s.backend === 'api' ? [] : stored[s.backend === 'pi' ? 'pluginSessions' : s.backend === 'codex' ? 'codexSessions' : 'claudeSessions']
  if (s.backend !== 'api') { expect(s.nativeFirst).toHaveLength(1); expect((s.nativeFirst![0] as { threadId?: string }).threadId).toBeTruthy() }
  await d.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(s.room!.title) }).click()
  const followup = '沿刚才那个项目，红茶再加3杯，绿茶不变。请回复之前的项目识别码和现在的总杯数，不使用工具、联网或创建文件。'
  await d.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(followup)
  await d.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => {
    s.final = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.room!.id)
    return s.final.messages.filter(m => m.senderType === 'agent' && m.status === 'completed').length === 2 && s.final.runs.every(r => r.status === 'completed')
  }, { timeout: 210000, intervals: [300, 800, 1500] }).toBe(true)
  const last = s.final!.messages.filter(m => m.senderType === 'agent' && m.status === 'completed').at(-1)!
  expect(last.content).toContain(s.tag!); expect(last.content).toContain('15')
  expect(s.final!.messages.filter(m => m.senderType === 'user').map(m => m.content)).toEqual([content, followup])
  expect(s.final!.workItems).toEqual([]); expect(records(s.dataPath!).artifacts).toEqual([])
  expect(s.final!.runs.flatMap(r => r.toolEvents).filter(t => !(t.name === 'task_step' && t.id.startsWith('activity:') && t.input === undefined))).toEqual([])
  await d.reviewNativeCheckpoint('真实CLI与桌面连续两轮')
  await d.reviewData('真实CLI两轮与原生映射', { first: s.first, final: s.final, nativeFirst: s.nativeFirst, nativeAfter: records(s.dataPath!)[s.backend === 'pi' ? 'pluginSessions' : s.backend === 'codex' ? 'codexSessions' : 'claudeSessions'] })
})
Then('CLI只读核对原回复且重启保持历史和原生会话', async ({ runtime: d, realCli: s }) => {
  const before = records(s.dataPath!)
  const receipt = JSON.parse((await s.command!(['receipt', s.requestId!, '--json'])).stdout) as MessageExecution
  expect(receipt.state).toBe('completed'); expect(receipt.activeRunIds).toEqual([])
  const originalServer = (await readLocalConnection(s.dataPath!)).serverId
  await d.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(s.dataPath!)).serverId !== originalServer } catch { return false } }, { timeout: 15000 }).toBe(true)
  await d.reviewData('真实CLI新端点就绪', { originalServer, currentServer: (await readLocalConnection(s.dataPath!)).serverId, resubmitted: false })
  const followed = await s.command!(['receipt', s.requestId!, '--follow', '--json']); await d.reviewData('真实CLI重启后原回执', followed)
  expect(followed.code).toBe(0); expect(followed.stderr).toBe('')
  const events = followed.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events[0]).toMatchObject({ type: 'request', operation: 'observe', requestId: s.requestId })
  expect(events.some(e => e.type === 'accepted')).toBe(false); expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
  const after = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.room!.id)
  expect(after.messages).toEqual(s.final!.messages); expect(after.runs).toEqual(s.final!.runs)
  const stored = records(s.dataPath!); expect(stored.messages).toEqual(before.messages); expect(stored.runs).toEqual(before.runs)
  for (const key of ['codexSessions', 'claudeSessions', 'pluginSessions'] as const) expect(stored[key]).toEqual(before[key])
  if (s.backend !== 'api') {
    const key = s.backend === 'pi' ? 'pluginSessions' : s.backend === 'codex' ? 'codexSessions' : 'claudeSessions'
    expect(stored[key]).toHaveLength(1)
    expect(stored[key][0].threadId).toBe((s.nativeFirst![0] as { threadId: string }).threadId)
  }
  await d.reviewData('真实CLI重启零重放', { receipt, before, after: stored, qualityReview: 'pending', userTurns: 2 })
})

When('CLI明确请求该员工创建并交付一个带随机标记的文件', async ({ runtime: d, realCli: s }) => {
  const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...agent } = s.agent!
  s.agent = await d.page.evaluate(input => window.boai.request('saveAgent', input), { ...agent, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: 'full-access' as const, allowCommands: true,
    instructions: '按明确请求在自己的工作目录生成实际文件，并使用 BOAI publish_artifact 交付。保留用户要求的原文。',
    nativeOptions: s.backend === 'codex' ? { codexSandbox: 'workspace-write' as const, codexApprovalPolicy: 'on-request' as const } : { claudePermissionMode: 'acceptEdits' as const } })
  s.expectedFile = `# CLI 交付\n识别码：${s.tag}\n总杯数：12\n`
  const content = `请在你本次会话自己的工作目录创建 cli-delivery.md，并通过 BOAI publish_artifact 交付真实文件；不要只在聊天粘贴内容。文件是UTF-8文本，恰好以下三行，末尾换行：\n${s.expectedFile}不要联网、委派或修改其他文件。`
  await d.reviewData('真实CLI文件预登记', { backend: s.backend, userTurns: 1, retries: 0, expected: s.expectedFile, content, requestId: s.requestId, scope: '本场隔离员工自己的工作目录；只批准此交付的publish_artifact', usage: 'API原Run账本；本机内部请求数未知' })
  const result = await s.command!(['run', '--employee', s.agent.id, '--stdin', '--request-id', s.requestId!, '--send-timeout', '210000', '--json', '--no-spinner'], content)
  await d.reviewData('真实CLI文件首发输出', result)
  expect([0, 3]).toContain(result.code); expect(result.stderr).toBe('')
  const events = result.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events.find(event => event.type === 'accepted')).toMatchObject({ requestId: s.requestId, conversationId: s.room!.id })
  await expect.poll(async () => {
    s.final = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.room!.id)
    for (const run of s.final.runs) {
      const actions = await d.page.evaluate(({ conversationId, runId }) => window.boai.request('listNativeActions', { conversationId, runId }), { conversationId: s.room!.id, runId: run.id })
      for (const action of actions) if (action.status === 'pending' && action.method === 'mcp__boai__publish_artifact') {
        await d.reviewData('真实CLI明确批准文件交付-' + action.id, { action, requestId: s.requestId, scope: '本次明确文件交付' })
        await d.page.evaluate(input => window.boai.request('respondNativeAction', input), { conversationId: s.room!.id, runId: run.id, actionId: action.id, response: { option: 'allow' } })
      }
    }
    return s.final.runs.length > 0 && s.final.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && s.final.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
  }, { timeout: 210000, intervals: [400, 1000] }).toBe(true)
  await d.reviewData('真实CLI文件执行事实', s.final)
  expect(s.final!.runs.every(run => run.status === 'completed')).toBe(true)
  expect(s.final!.artifacts).toHaveLength(1); expect(s.final!.artifacts[0].name).toBe('cli-delivery.md')
  expect(s.final!.workItems).toHaveLength(1); expect(s.final!.workItems![0].status).toBe('delivered')
  expect(s.final!.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  const artifact = s.final!.artifacts[0], bytes = await readFile(artifact.path)
  expect(bytes).toEqual(Buffer.from(s.expectedFile)); expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.contentHash)
  await d.reviewFile('真实CLI交付原件', artifact.path, { required: true })
  const receipt = await s.command!(['receipt', s.requestId!, '--follow', '--json']); await d.reviewData('真实CLI文件完成回执', receipt)
  expect(receipt.code).toBe(0); expect(receipt.stderr).toBe('')
})
Then('桌面预览CLI交付的原件且重启只读核对不重复交付', async ({ runtime: d, realCli: s }) => {
  const artifact = s.final!.artifacts[0]
  await d.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(s.room!.title) }).click()
  await d.page.locator(`#message-${artifact.sourceMessageId}`).getByRole('button', { name: `打开 ${artifact.name}`, exact: true }).click()
  await expect(d.page.locator(`[data-artifact-id="${artifact.id}"]:visible`)).toContainText(s.tag!)
  await d.reviewNativeCheckpoint('真实CLI文件桌面预览')
  const before = records(s.dataPath!), originalServer = (await readLocalConnection(s.dataPath!)).serverId
  await d.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(s.dataPath!)).serverId !== originalServer } catch { return false } }, { timeout: 15000 }).toBe(true)
  const receipt = await s.command!(['receipt', s.requestId!, '--follow', '--json']); await d.reviewData('真实CLI文件重启回执', receipt)
  expect(receipt.code).toBe(0); expect(receipt.stderr).toBe('')
  const events = receipt.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events[0]).toMatchObject({ operation: 'observe', requestId: s.requestId }); expect(events.some(event => event.type === 'accepted')).toBe(false)
  const after = records(s.dataPath!)
  for (const key of ['messages', 'runs', 'artifacts', 'works', 'codexSessions', 'claudeSessions', 'pluginSessions'] as const) expect(after[key]).toEqual(before[key])
  expect(await readFile(artifact.path, 'utf8')).toBe(s.expectedFile)
  await d.reviewData('真实CLI文件重启零重放', { before, after, artifact, expected: s.expectedFile, userTurns: 1, qualityReview: 'pending' })
})

When('CLI向API与Codex混合群发送一条明确点名两人的问题', async ({ runtime: d, realCli: s }) => {
  const executable = process.env.BOAI_NATIVE_CODEX; expect(executable).toBeTruthy()
  const draft = { name: 'CLI混合群Codex', executable: executable!, args: [], protocol: 'codex-app-server' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
  await d.page.evaluate(input => window.boai.request('testLaunchProfileDraft', input), draft)
  const profile = await d.page.evaluate(input => window.boai.request('saveLaunchProfile', input), draft)
  const native = await d.page.evaluate(profile => window.boai.request('saveAgent', { name: 'CLI混合群本机同事', role: '独立回答普通问题', instructions: '只回应被明确点名的问题，保留自己身份；简单算术直接回答，不调用工具或生成文件。', color: '#3478ce', connectionId: '', modelId: '', executionBackend: { kind: 'codex-local', profileId: profile.id }, executionPermission: 'ask', nativeOptions: { codexSandbox: 'read-only', codexApprovalPolicy: 'on-request' }, skillIds: [], knowledgeIds: [], sourceIds: [], allowCommands: false, allowBrowser: false, active: true }), profile)
  s.room = await d.page.evaluate(agentIds => window.boai.request('createConversation', { kind: 'group', title: 'CLI真实混合群', agentIds, mode: 'mention' }), [s.agent!.id, native.id])
  const content = `这是简单普通聊天，请两位独立回答，不分工、不使用工具、不生成文件。识别码 ${s.tag}，红茶7杯加绿茶5杯，共多少杯？各自仅回复识别码和总数。`
  await d.reviewData('真实CLI混合群预登记', { userTurns: 1, retries: 0, employees: [s.agent, native], room: s.room, requestId: s.requestId, content, nativeInternalRequests: 'unknown' })
  const result = await s.command!(['send', s.room.id, '--stdin', '--mention', s.agent!.id, '--mention', native.id, '--request-id', s.requestId!, '--send-timeout', '210000', '--json', '--no-spinner'], content)
  await d.reviewData('真实CLI混合群标准输出', result); expect(result.code).toBe(0); expect(result.stderr).toBe('')
  const events = result.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events.find(event => event.type === 'accepted')).toMatchObject({ requestId: s.requestId, conversationId: s.room.id })
  expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
  s.final = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.room.id)
  await d.reviewData('真实CLI混合群实际会话', s.final)
  const replies = s.final.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')
  expect(replies).toHaveLength(2); expect(replies.map(message => message.senderId).sort()).toEqual([s.agent!.id, native.id].sort())
  for (const reply of replies) { expect(reply.content).toContain(s.tag!); expect(reply.content).toContain('12') }
  expect(s.final.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  expect(s.final.workItems).toEqual([]); expect(s.final.artifacts).toEqual([])
  expect(s.final.runs.every(run => run.status === 'completed')).toBe(true)
  expect(s.final.runs.flatMap(run => run.toolEvents).filter(tool => !(tool.name === 'task_step' && tool.id.startsWith('activity:') && tool.input === undefined))).toEqual([])
  const receipt = JSON.parse((await s.command!(['receipt', s.requestId!, '--json'])).stdout) as MessageExecution
  expect(receipt.state).toBe('completed'); expect(receipt.activeRunIds).toEqual([])
  expect([...new Set(receipt.runs.map(run => run.agentId))].sort()).toEqual([s.agent!.id, native.id].sort())
  await d.reviewData('真实CLI混合群原回执', receipt)
})
Then('桌面显示两位员工的独立回答且重启不新增群执行', async ({ runtime: d, realCli: s }) => {
  await d.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(s.room!.title) }).click()
  for (const message of s.final!.messages.filter(message => message.senderType === 'agent')) await expect(d.page.locator(`#message-${message.id}`)).toContainText(s.tag!)
  await d.reviewNativeCheckpoint('真实CLI混合群独立回答')
  const before = records(s.dataPath!), originalServer = (await readLocalConnection(s.dataPath!)).serverId
  await d.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(s.dataPath!)).serverId !== originalServer } catch { return false } }, { timeout: 15000 }).toBe(true)
  const receipt = await s.command!(['receipt', s.requestId!, '--follow', '--json']); await d.reviewData('真实CLI混合群重启回执', receipt)
  expect(receipt.code).toBe(0); expect(receipt.stderr).toBe('')
  const events = receipt.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(events[0]).toMatchObject({ operation: 'observe', requestId: s.requestId }); expect(events.some(event => event.type === 'accepted')).toBe(false)
  const after = records(s.dataPath!)
  for (const key of ['messages', 'runs', 'artifacts', 'works', 'codexSessions', 'claudeSessions', 'pluginSessions'] as const) expect(after[key]).toEqual(before[key])
  await d.reviewData('真实CLI混合群重启零重放', { before, after, userTurns: 1, qualityReview: 'pending' })
})

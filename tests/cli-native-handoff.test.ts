/*
 * [INPUT]: Built CLI/autostart service, owned profile initialization and isolated original Codex/Claude stdio fixtures.
 * [OUTPUT]: Pending native input/approval survives the first terminal, exact replies/cancellation,
 * duplicate request identity, actual native/service exit and consistent SQLite evidence without replay.
 * [POS]: Opt-in macOS/Linux process integration, BOAI_CLI_PROCESS_TEST=1; no real supplier or installed CLI certification.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile, mkdtemp, realpath, copyFile, chmod, rm, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { createClient } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import { CliRpcClient } from '../src/cli/client'
import { readLocalConnection } from '../src/cli/discovery'
import type { ConversationDetail, Message, DigitalAgent, LaunchProfile } from '../src/shared/domain'
import type { MessageExecution } from '../src/shared/domain/message-execution'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
type CommandResult = { code: number; stdout: string; stderr: string }
function command(dataPath: string, args: string[]) {
  return new Promise<CommandResult>(done => execFile(process.execPath, [resolve('dist/cli/index.mjs'), '--data-dir', dataPath, ...args], {
    cwd: dataPath, env: { PATH: process.env.PATH, HOME: dataPath, TMPDIR: dataPath }, timeout: 20000, maxBuffer: 8 * 1024 * 1024,
  }, (error, stdout, stderr) => done({ code: error ? typeof error.code === 'number' ? error.code : -1 : 0, stdout, stderr })))
}
async function prepareNative(runtime: 'codex' | 'claude') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-cli-native-handoff-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const owned = await startOwnedRuntime({ dataPath: root, engine: { run: async () => { throw Error('native must not call API') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, skillDiscovery: { homeDir: root } })
  cleanup.push(owned.close)
  const executable = join(root, runtime + '.mjs')
  await copyFile(resolve(runtime === 'codex' ? 'tests/fixtures/native-conversation.mjs' : 'tests/fixtures/native-claude-conversation.mjs'), executable)
  await chmod(executable, 0o700)
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(root, 'native-business.mjs'))
  const draft = { name: 'Native handoff', executable, args: [], protocol: runtime === 'codex' ? 'codex-app-server' : 'claude-cli', useExistingLogin: true, hostAccessAcknowledged: true }
  await owned.service.handle('testLaunchProfileDraft', draft)
  const profile = await owned.service.handle('saveLaunchProfile', draft) as LaunchProfile
  const agent = await owned.service.handle('saveAgent', { name: '原生员工', role: '写作', instructions: '按消息完成工作', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: runtime === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: true, executionPermission: 'ask', active: true }) as DigitalAgent
  await owned.close()
  return { root, executable, agent }
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
async function nativeProcesses(executable: string) {
  const output = await new Promise<string>((done, reject) => execFile('ps', ['-axo', 'pid=,ppid=,command='], (error, stdout) => error ? reject(error) : done(stdout)))
  return output.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    return match && match[3].includes(executable) ? [{ pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] }] : []
  })
}
describe.skipIf(process.env.BOAI_CLI_PROCESS_TEST !== '1' || process.platform === 'win32')('native CLI background handoff', () => {
  it.each((['codex', 'claude'] as const).flatMap(runtime => (['input', 'approve', 'deny', 'cancel'] as const).map(action => ({ runtime, action }))))('$runtime resumes or cancels the original $action after the first terminal exits', async ({ runtime, action }) => {
    const fixture = await prepareNative(runtime)
    const servicePids: number[] = []
    cleanup.push(async () => {
      let metadata: Awaited<ReturnType<typeof readLocalConnection>>
      try { metadata = await readLocalConnection(fixture.root) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
      const client = new CliRpcClient(metadata.url, metadata)
      try { await client.connect(); await client.invoke('server:shutdown', { serverId: metadata.serverId }) } finally { client.destroy() }
      await vi.waitFor(() => expect(alive(metadata.pid)).toBe(false), { timeout: 10000 })
    })
    const requestId = randomUUID(), prompt = action === 'input' || action === 'cancel' ? 'NATIVE_QUESTION' : 'NATIVE_APPROVAL'
    const args = ['run', '--employee', fixture.agent.id, '--mode', 'ask', '--request-id', requestId, '--json', prompt]
    const first = await command(fixture.root, args)
    if (first.code !== 3 && process.env.BOAI_CLI_EVIDENCE_DIR) {
      await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true })
      const logs = await Promise.all((await readdir(join(fixture.root, '.cli'))).filter(name => name.endsWith('.log')).map(async name => ({ name, text: await readFile(join(fixture.root, '.cli', name), 'utf8') })))
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, `failed-start-${runtime}-${action}.json`), JSON.stringify({ first, logs }, null, 2))
    }
    expect(first.code, first.stdout + first.stderr).toBe(3)
    const metadata = await readLocalConnection(fixture.root); servicePids.push(metadata.pid)
    const client = new CliRpcClient(metadata.url, metadata); cleanup.push(async () => client.destroy()); await client.connect()
    const events = first.stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(events.at(-1)).toMatchObject({ type: 'service', state: 'background', serverId: metadata.serverId, pid: metadata.pid })
    expect(alive(metadata.pid)).toBe(true)
    const pending = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(pending.state).toBe(action === 'input' || action === 'cancel' ? 'waiting_input' : 'waiting_approval')
    expect(pending.nativeActions).toHaveLength(1)
    const nativeAction = pending.nativeActions[0], recovery = events.find(event => event.type === 'result').recovery.nativeActions[0]
    expect(recovery).toMatchObject({ channel: 'respondNativeAction', identity: { conversationId: pending.conversationId, runId: nativeAction.runId, actionId: nativeAction.id } })
    const processes = await nativeProcesses(fixture.executable)
    expect(processes.length).toBeGreaterThan(0)
    expect(processes.every(process => alive(process.pid))).toBe(true)
    const duplicate = await command(fixture.root, args)
    expect(duplicate.code, duplicate.stderr + duplicate.stdout).toBe(3)
    const repeated = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(repeated.runs.map(run => run.id)).toEqual(pending.runs.map(run => run.id))
    expect(repeated.nativeActions.map(item => item.id)).toEqual([nativeAction.id])
    const receipt = await client.invoke('getMessageReceipt', { requestId }) as Message
    const marker = join(fixture.root, 'agents', fixture.agent.id, 'workspace', 'sessions', receipt.conversationId, 'work', 'permission-marker')
    await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    const response = action === 'input' || action === 'cancel'
      ? { answers: Object.fromEntries(nativeAction.questions!.map(question => [question.id, ['CLI_HANDOFF_ANSWER']])) }
      : { option: nativeAction.options.find(option => action === 'approve' ? /^(accept|allow|approve)(_|$)/.test(option.id) : /reject|deny|decline/.test(option.id))!.id }
    const answerInput = { ...recovery.identity, response }
    const answered = action === 'cancel'
      ? await command(fixture.root, ['cancel', receipt.conversationId, '--request-id', requestId, '--json'])
      : await command(fixture.root, ['invoke', recovery.channel, JSON.stringify(answerInput), '--json'])
    expect(answered.code, answered.stderr + answered.stdout).toBe(0)
    const follow = await command(fixture.root, ['receipt', requestId, '--follow', '--json'])
    expect(follow.code, follow.stderr + follow.stdout).toBe(action === 'cancel' ? 1 : 0)
    const final = await client.invoke('getMessageExecution', { requestId }) as MessageExecution
    expect(final).toMatchObject({ state: action === 'cancel' ? 'cancelled' : 'completed', activeRunIds: [], nativeActions: [] })
    expect(final.runs.map(run => run.id)).toEqual(pending.runs.map(run => run.id))
    await vi.waitFor(() => expect(processes.some(process => alive(process.pid))).toBe(false), { timeout: 10000 })
    const detail = await client.invoke('getConversation', { id: receipt.conversationId }) as ConversationDetail
    expect(detail.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
    if (action === 'input') expect(detail.messages.some(message => message.senderType === 'agent' && message.content.includes('CLI_HANDOFF_ANSWER'))).toBe(true)
    if (action === 'approve') expect(await readFile(marker, 'utf8')).toBe('approved')
    else await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    const late = await command(fixture.root, ['invoke', recovery.channel, JSON.stringify(answerInput), '--json'])
    expect(late.code).not.toBe(0)
    await client.invoke('server:shutdown', { serverId: metadata.serverId }); client.destroy()
    await vi.waitFor(() => expect(alive(metadata.pid)).toBe(false), { timeout: 10000 })
    // Re-observe the exact request after a fresh owner startup; run must not replay it.
    const restarted = await command(fixture.root, args)
    expect(restarted.code, restarted.stderr + restarted.stdout).toBe(action === 'cancel' ? 1 : 0)
    const restartEvents = restarted.stdout.trim().split('\n').map(line => JSON.parse(line)), ended = restartEvents.at(-1)
    expect(ended).toMatchObject({ type: 'service', state: 'stopped' }); servicePids.push(ended.pid)
    expect(servicePids.every(pid => !alive(pid))).toBe(true)
    expect(await nativeProcesses(fixture.executable)).toEqual([])
    const turns = (await readFile(join(fixture.root, 'agents', fixture.agent.id, 'workspace', 'sessions', receipt.conversationId, 'work', 'native-turn-requests.jsonl'), 'utf8')).trim().split('\n')
    expect(turns).toHaveLength(1)
    if (process.env.BOAI_CLI_EVIDENCE_DIR) {
      await mkdir(process.env.BOAI_CLI_EVIDENCE_DIR, { recursive: true })
      const database = createClient({ url: pathToFileURL(join(fixture.root, 'boai.sqlite')).href })
      try { await database.execute({ sql: 'VACUUM INTO ?', args: [join(process.env.BOAI_CLI_EVIDENCE_DIR, `native-handoff-${runtime}-${action}.sqlite`)] }) } finally { database.close() }
      await writeFile(join(process.env.BOAI_CLI_EVIDENCE_DIR, `native-handoff-${runtime}-${action}.json`), JSON.stringify({ runtime, action, classification: 'built-node-cli-and-controlled-native-stdio', externalRequests: 0, first, duplicate, pending, answered, follow, final, detail, late, restarted, nativeProcesses: processes, servicePids, allExited: true, nativeTurnCount: turns.length, nativeTurnRequests: turns.map(line => JSON.parse(line)), marker: { path: marker, exists: action === 'approve', bytes: action === 'approve' ? await readFile(marker, 'utf8') : null } }, null, 2))
    }
  }, 60000)
})

/*
 * [INPUT]: Explicit bounded batch, installed Magpie/native CLIs, owned native profiles and production AppService backup.
 * [OUTPUT]: G2a external model changes and actual backup restoration with source/session/file/exit evidence and no replay.
 * [POS]: M13/M17 lifecycle acceptance using a synthetic supplier; no personal configuration or natural-model quality claim.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger; preserve failed batches and original files.
 */
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { AgentHome, AgentRun, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../src/shared/domain'
import type { RuntimePluginCatalog } from '../src/shared/plugins/runtime-catalog'
import { isolatedMagpie } from './fixtures/magpie-isolated'
import { streamText, streamTool } from './fixtures/gateway-stream'
import { writeNativeMagpieProfile } from './fixtures/native-magpie-profile'

const enabled = process.env.BOAI_MAGPIE_LIFECYCLE_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const cases = (process.env.BOAI_MAGPIE_LIFECYCLE_CASES ?? 'codex,claude,pi,opencode').split(',')
const directory = resolve('.local/magpie-20261017', `lifecycle-${batch}`)
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'waiting_user', 'budget_exhausted'])
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms))
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const collections = ['connections', 'launchProfiles', 'agents', 'conversations', 'messages', 'runs', 'turns', 'workItems', 'artifacts', 'nativeActions', 'codexSessions', 'claudeSessions', 'pluginSessions', 'codexRuntime', 'claudeRuntime', 'pluginRuntime']
type Body = { model: string; messages?: unknown[]; tools?: { function?: { name?: string }; name?: string }[] }
type Wire = { phase: string; model: string; tools: string[]; title: boolean; closed: boolean; started: string; tool?: string; error?: string }
let sourceBefore: Record<string, string>, started = false
async function sources() {
  const files: string[] = []
  for (const root of ['src', 'tests', 'scripts']) for (const name of await readdir(root, { recursive: true })) if (/\.(ts|tsx|mjs|json)$/.test(name)) files.push(`${root}/${name}`)
  files.push('package.json', 'pnpm-lock.yaml')
  return Object.fromEntries(await Promise.all(files.sort().map(async name => [name, sha(await readFile(name))])))
}
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch) || cases.some(name => !['codex', 'claude', 'pi', 'opencode'].includes(name))) throw Error('Fresh batch and supported runtimes required')
  await mkdir(directory); started = true; sourceBefore = await sources()
  await writeFile(join(directory, 'plan.json'), JSON.stringify({ batch, cases, sourceBefore, mode: 'G2a native profile; no BOAI connection or selected-model override', userMessagesPerCase: 4, maxUpstreamRequestsPerCase: 16, phaseDeadlineMs: 60000, retries: 0,
    scope: 'Installed isolated Magpie and real CLI. Native write once, completed conversation, external owned profile model edit, new session/new actual model, real service.backup and restored startup, no automatic inference, explicit fresh native session and later reuse. No personal HOME/CODEX_HOME/configuration changes; no desktop/package certification.' }, null, 2))
})
afterAll(async () => {
  if (!started) return
  const sourceAfter = await sources(); await writeFile(join(directory, 'source-check.json'), JSON.stringify({ sourceBefore, sourceAfter, unchanged: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter) }, null, 2)); expect(sourceAfter).toEqual(sourceBefore)
})
for (const runtime of cases) test.skipIf(!enabled)(`${runtime}: changed native source and restored backup use fresh sessions without replay`, async () => {
  const evidence = join(directory, runtime), originalData = join(evidence, 'data'), restoredData = join(evidence, 'restored'), config = join(evidence, 'config')
  await mkdir(evidence); await mkdir(config)
  const homeBefore = process.env.HOME, codexHomeBefore = process.env.CODEX_HOME
  const rows: Wire[] = [], snapshots: unknown[] = [], errors: string[] = [], jobs = new Set<Promise<void>>()
  const owned = new Map<number, { pid: number; parentPid: number; executable: string; phase: string }>()
  let phase = 'setup', status = 'running', failure: string | undefined, parentCalls = 0, nativeFile = '', workdir = '', fileRelative = '', fileStamp: { sha256: string; mtimeMs: number } | undefined
  let gateway: Awaited<ReturnType<typeof isolatedMagpie>> | undefined, service: AppService | undefined, activeData = originalData
  let files: Record<string, string> = {}, changedFiles: Record<string, string> = {}, profile: LaunchProfile | undefined, chat: Conversation | undefined
  const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
  const capture = async () => {
    const output = (await promisify(execFile)('/bin/ps', ['-axo', 'pid=,ppid=,comm='])).stdout
    const all = output.split('\n').flatMap(line => { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/); return m ? [{ pid: +m[1], parentPid: +m[2], executable: m[3] }] : [] })
    const parents = new Set([process.pid]), excluded = new Set(gateway?.processes.map(row => row.pid) ?? [])
    for (let more = true; more;) { more = false; for (const row of all) if (parents.has(row.parentPid) && !parents.has(row.pid) && !excluded.has(row.pid) && row.executable !== '/bin/ps') { parents.add(row.pid); if (!owned.has(row.pid)) owned.set(row.pid, { ...row, phase }); more = true } }
  }
  const server = createServer((request, response) => {
    const job = (async () => {
      if (request.method === 'GET') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ object: 'list', data: [runtime, `${runtime}-updated`].map(id => ({ id, object: 'model', owned_by: 'lifecycle', context_window: 131072, max_output_tokens: 8192 })) })); return }
      let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4_000_000) throw Error('Synthetic request cap exceeded') }
      const body: Body = JSON.parse(raw), tools = (body.tools ?? []).map(tool => tool.function?.name ?? tool.name ?? '')
      const row: Wire = { phase, model: body.model, tools, title: runtime === 'opencode' && !tools.length && JSON.stringify(body.messages).toLowerCase().includes('title'), closed: false, started: new Date().toISOString() }; rows.push(row)
      response.once('close', () => { row.closed = true }); await capture()
      if (rows.length > 16 || !request.url?.endsWith('/chat/completions')) throw Error('Frozen request/endpoint contract exceeded')
      if (row.title) { streamText(response, 'chat', 'Lifecycle', 'complete', {}); return }
      const count = rows.filter(item => item.phase === phase && !item.title).length
      if (phase === 'initial' && count === 1) {
        const tool = runtime === 'codex' ? 'exec_command' : runtime === 'claude' ? 'Write' : 'write'
        expect(tools).toContain(tool); row.tool = tool
        const input = runtime === 'codex' ? { cmd: "printf '%s' 'LIFECYCLE_ONCE' > effect.txt", workdir } : runtime === 'claude' ? { file_path: nativeFile, content: 'LIFECYCLE_ONCE' } : runtime === 'opencode' ? { filePath: nativeFile, content: 'LIFECYCLE_ONCE' } : { path: nativeFile, content: 'LIFECYCLE_ONCE' }
        streamTool(response, 'chat', tool, input, true, {}, `lifecycle-${rows.length}`)
      } else streamText(response, 'chat', `LIFECYCLE_${phase}`, 'complete', {})
    })().catch(error => { errors.push(String(error)); response.destroy(error instanceof Error ? error : undefined) })
    jobs.add(job); void job.finally(() => jobs.delete(job))
  })
  const read = async (path = activeData): Promise<Record<string, Record<string, unknown>[]>> => { const store = await ProductStore.openReadOnly(join(path, 'boai.sqlite')); try { return Object.fromEntries(await Promise.all(collections.map(async collection => [collection, await store.load<Record<string, unknown>>(collection)]))) } finally { await store.close() } }
  const create = () => new AppService({ dataPath: activeData, engine: { run: async () => { parentCalls++; throw Error('Native conversation must not use parent API') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => { throw Error('No credential storage expected') }, delete: async () => {} }, emit: () => {} })
  const detail = async () => await service!.handle('getConversation', { id: chat!.id }) as ConversationDetail
  const send = async (content: string): Promise<AgentRun> => {
    const message = await service!.handle('sendMessage', { conversationId: chat!.id, content, requestId: `${batch}-${runtime}-${phase}`, mentionIds: [] }) as Message
    let view: ConversationDetail | undefined, run: AgentRun | undefined
    await expect.poll(async () => { view = await detail(); run = view.runs.find(r => r.triggerMessageId === message.id && r.phase === 'execution'); if (run?.status === 'waiting_approval') throw Error('Unexpected native approval; retain without bypass'); return !!run && terminal.has(run.status) && view.runs.every(r => terminal.has(r.status)) && !!view.turns?.length && view.turns.every(t => terminal.has(t.status)) }, { timeout: 60000, interval: 50 }).toBe(true)
    snapshots.push({ phase, messageId: message.id, detail: view, records: await read() })
    expect(run!.status, run!.error).toBe('completed'); expect(run!.backend?.sessionId).toBeTruthy(); expect(run!.usage).toBeUndefined()
    expect(view!.messages.find(m => m.runId === run!.id && m.senderType === 'agent')?.content).toBe(`LIFECYCLE_${phase}`)
    expect(view!.workItems).toEqual([]); expect(view!.artifacts).toEqual([])
    await expect.poll(() => [...owned.keys()].every(pid => !alive(pid)), { timeout: 10000 }).toBe(true)
    return run!
  }
  try {
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const port = (server.address() as { port: number }).port
    gateway = await isolatedMagpie(evidence, port)
    await gateway.command(['provider', 'add', 'compat', 'id=lifecycle', `url=http://127.0.0.1:${port}/v1`, 'key=SYNTHETIC_LIFECYCLE_NOT_A_SECRET', `models=${runtime},${runtime}-updated`]); await gateway.start()
    for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'CLAUDE_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OPENCODE_CONFIG_DIR']) { const path = join(config, key); await mkdir(path); vi.stubEnv(key, path) }
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_CONTENT']) vi.stubEnv(key, undefined)
    vi.stubEnv('BOAI_NATIVE_MAGPIE_KEY', 'magpie-boai'); vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
    const selectedConfig = runtime === 'claude' ? process.env.CLAUDE_CONFIG_DIR! : runtime === 'pi' ? process.env.PI_CODING_AGENT_DIR! : join(config, 'native-profile')
    files = await writeNativeMagpieProfile(runtime, selectedConfig, gateway.origin, { id: `lifecycle/${runtime}`, context_window: 131072, max_output_tokens: 8192, reasoning: false })
    if (runtime === 'opencode') vi.stubEnv('OPENCODE_CONFIG', join(selectedConfig, 'opencode.json'))
    service = create(); await service.init()
    const catalog = await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog, plugin = catalog.plugins.find(p => p.manifest.id === `boai.runtime.${runtime}`)
    const executable = runtime === 'opencode' ? resolve('.local/magpie-20261017/opencode-tool/node_modules/opencode-ai/bin/opencode.exe') : `/Users/wangwenbo/.nvm/versions/node/v24.16.0/bin/${runtime}`
    const draft = { name: `Lifecycle ${runtime}`, executable, args: [], protocol: runtime === 'codex' ? 'codex-app-server' : runtime === 'claude' ? 'claude-cli' : 'runtime-plugin', useExistingLogin: true, ...(runtime === 'codex' ? { codexHome: selectedConfig } : {}), hostAccessAcknowledged: true, ...(plugin ? { runtimePlugin: { pluginId: plugin.manifest.id, providerId: runtime, packageHash: plugin.packageHash } } : {}) }
    await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const agent = await service.handle('saveAgent', { name: `生命周期 ${runtime}`, role: '文件处理', instructions: '只执行用户明确要求的操作。', color: '#123456', connectionId: '', modelId: '', executionBackend: plugin ? { kind: 'runtime-plugin', profileId: profile.id, pluginId: plugin.manifest.id, providerId: runtime } : { kind: runtime === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, ...(runtime === 'codex' ? { nativeOptions: { codexSandbox: 'workspace-write', codexApprovalPolicy: 'never' } } : runtime === 'claude' ? { nativeOptions: { claudePermissionMode: 'acceptEdits' } } : {}), skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
    chat = await service.handle('createConversation', { kind: 'direct', title: `Lifecycle ${runtime}`, agentIds: [agent.id] }) as Conversation
    const home = await service.handle('getAgentHome', { agentId: agent.id, conversationId: chat.id }) as AgentHome
    workdir = join(home.sessionPath!, 'work'); nativeFile = join(workdir, 'effect.txt')
    phase = 'initial'; const first = await send('只保存一次 effect.txt，内容为 LIFECYCLE_ONCE，然后回答 LIFECYCLE_initial。')
    const effects = (await readdir(originalData, { recursive: true })).filter(path => path.endsWith('/effect.txt')); expect(effects).toHaveLength(1)
    fileRelative = effects[0]; nativeFile = join(originalData, fileRelative); expect(await readFile(nativeFile, 'utf8')).toBe('LIFECYCLE_ONCE')
    fileStamp = { sha256: sha(await readFile(nativeFile)), mtimeMs: (await stat(nativeFile)).mtimeMs }
    const oldFiles: Record<string, string> = Object.fromEntries(await Promise.all(Object.keys(files).map(async path => [path, await readFile(path, 'utf8')])))
    for (const [path, value] of Object.entries(oldFiles)) { const updated = value.replaceAll(`lifecycle/${runtime}`, `lifecycle/${runtime}-updated`); expect(updated).not.toBe(value); await writeFile(path, updated); changedFiles[path] = updated }
    const countBeforeChange = rows.length; await pause(150); expect(rows).toHaveLength(countBeforeChange)
    await writeFile(join(evidence, 'profile-change.json'), JSON.stringify({ original: files, afterNativePreparation: oldFiles, afterExternalEdit: changedFiles, requestsBefore: countBeforeChange }, null, 2))
    phase = 'changed'; const changed = await send('不要重复文件操作。现在只回答 LIFECYCLE_changed。')
    expect(changed.backend!.sessionId).not.toBe(first.backend!.sessionId)
    expect(rows.filter(r => r.phase === 'initial').every(r => r.model === runtime)).toBe(true)
    expect(rows.filter(r => r.phase === 'changed').every(r => r.model === `${runtime}-updated`)).toBe(true)
    const beforeBackup = await read(), requestsBeforeBackup = rows.length
    phase = 'backup'; await service.backup(restoredData)
    const manifest = JSON.parse(await readFile(join(restoredData, 'backup.json'), 'utf8'))
    expect(manifest).toMatchObject({ credentialsIncluded: false, nativeAgentRestorePolicy: 'fresh-session' }); expect(manifest.excludedNativeRuntimeHomes.length).toBeGreaterThan(0)
    for (const path of manifest.excludedNativeRuntimeHomes) await expect(stat(join(restoredData, path))).rejects.toThrow()
    expect(sha(await readFile(join(restoredData, fileRelative)))).toBe(fileStamp.sha256)
    const backupRecords = await read(restoredData)
    for (const collection of ['connections', 'launchProfiles', 'messages', 'runs', 'turns', 'workItems']) expect(backupRecords[collection]).toEqual(beforeBackup[collection])
    await service.close(); activeData = restoredData; service = create(); await service.init(); await pause(150)
    expect(rows).toHaveLength(requestsBeforeBackup)
    const restoredRecords = await read(), sessionCollection = runtime === 'codex' ? 'codexSessions' : runtime === 'claude' ? 'claudeSessions' : 'pluginSessions'
    const previousSession = beforeBackup[sessionCollection].filter(s => s.agentId === agent.id)
    expect(previousSession).toEqual([expect.objectContaining({ state: 'completed', runId: changed.id, threadId: expect.any(String) })])
    // Pi resumes with its private transcript path; its public session UUID is a different identity.
    expect(restoredRecords[sessionCollection].filter(s => s.agentId === agent.id)).toEqual(previousSession.map(s => ({ ...s, resumeInvalidated: 'restored-backup' })))
    for (const collection of ['connections', 'launchProfiles', 'messages', 'runs', 'turns', 'workItems']) expect(restoredRecords[collection]).toEqual(beforeBackup[collection])
    snapshots.push({ phase: 'restored-no-replay', records: restoredRecords, manifest })
    phase = 'restored'; const restored = await send('保留之前的文件，不重复操作。现在只回答 LIFECYCLE_restored。')
    expect(restored.backend!.sessionId).not.toBe(changed.backend!.sessionId)
    phase = 'reuse'; const reused = await send('不修改文件，只回答 LIFECYCLE_reuse。')
    expect(reused.backend!.sessionId).toBe(restored.backend!.sessionId)
    expect(rows.filter(r => ['restored', 'reuse'].includes(r.phase)).every(r => r.model === `${runtime}-updated`)).toBe(true)
    expect(rows.filter(r => r.tool)).toHaveLength(1); expect(rows.filter(r => !r.title)).toHaveLength(5)
    expect({ sha256: sha(await readFile(nativeFile)), mtimeMs: (await stat(nativeFile)).mtimeMs }).toEqual(fileStamp)
    expect(sha(await readFile(join(restoredData, fileRelative)))).toBe(fileStamp.sha256)
    for (const [path, value] of Object.entries(changedFiles)) expect(await readFile(path, 'utf8')).toBe(value)
    expect((await read()).connections).toEqual([]); expect(parentCalls).toBe(0); expect(errors).toEqual([])
    expect(process.env.HOME).toBe(homeBefore); expect(process.env.CODEX_HOME).toBe(codexHomeBefore); status = 'passed'
  } catch (error) { status = 'failed'; failure = String(error); throw error }
  finally {
    phase = 'close'; await service?.close(); await gateway?.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await Promise.all(jobs)
    const processes = [...owned.values()].map(p => ({ ...p, exited: !alive(p.pid) }))
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ runtime, status, failure, profile, files, changedFiles, activeData, originalData, restoredData, fileRelative, fileStamp, parentCalls, rows, errors, snapshots, records: service ? await read() : {}, processes, allProcessesExited: processes.every(p => p.exited), allRequestsClosed: rows.every(r => r.closed), activeJobs: jobs.size }, null, 2))
    vi.unstubAllEnvs(); expect(jobs.size).toBe(0); expect(processes.every(p => p.exited)).toBe(true); expect(rows.every(r => r.closed)).toBe(true)
  }
}, 300000)

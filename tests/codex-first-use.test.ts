/*
 * [INPUT]: Explicit installed-Codex opt-in and a fresh isolated profile without project trust.
 * [OUTPUT]: First/second/restart messages reuse the actual session; configuration and frozen source evidence remain auditable.
 * [POS]: G2a first-use regression; no personal settings or supplier inference.
 * [PROTOCOL]: Update this Header, tests/.folder.md and the Magpie ledger with every actual batch.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fork } from 'node:child_process'
import { join, resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { build } from 'esbuild'
import { AppService } from '../src/runtime/service'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../src/shared/domain'
import { gatewayWireServer } from './fixtures/gateway-wire-server'

async function sources() {
  const paths = (await readdir('src', { recursive: true })).filter(path => /\.(ts|tsx|json)$/.test(path)).map(path => `src/${path}`)
  paths.push('package.json', 'pnpm-lock.yaml', 'tests/codex-first-use.test.ts', 'tests/fixtures/gateway-wire-server.ts', 'tests/fixtures/native-first-use-process.ts')
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
}

test.skipIf(process.env.BOAI_CODEX_FIRST_USE_REAL !== '1')('fresh Codex profile accepts its first native message without prewritten project trust', async () => {
  const batch = process.env.BOAI_MAGPIE_BATCH
  if (!batch || !/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('A fresh BOAI_MAGPIE_BATCH is required')
  const evidence = resolve('.local/magpie-20261017', `codex-first-use-${batch}`)
  await mkdir(evidence)
  const home = join(evidence, 'native-home'), config = join(home, '.codex'), filename = join(config, 'config.toml')
  await mkdir(config, { recursive: true })
  const sourceBefore = await sources(), requests: Parameters<typeof gatewayWireServer>[2] = [], configurations: Record<string, string> = {}, runs: ConversationDetail['runs'] = []
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, sourceBefore, messages: ['first', 'second', 'after-process-restart'], supplierInference: false, prewrittenTrust: false }, null, 2))
  let phase = 'setup', failure: string | undefined, profile: LaunchProfile | undefined, run: ConversationDetail['runs'][number] | undefined, parentCalls = 0, service: AppService | undefined
  let processRestart: { pid?: number; ready?: unknown; completed?: unknown; exit?: { code: number | null; signal: NodeJS.Signals | null }; exited?: boolean } | undefined
  const server = await gatewayWireServer(() => phase, 'native', requests)
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CODEX_HOME', config); vi.stubEnv('BOAI_NATIVE_WIRE_KEY', 'magpie-boai')
  vi.stubEnv('OPENAI_API_KEY', undefined); vi.stubEnv('OPENAI_BASE_URL', undefined)
  await writeFile(filename, `model = "group/native-a"\nmodel_provider = "native_wire"\n[model_providers.native_wire]\nname = "Native wire"\nbase_url = "${server.url}/v1"\nwire_api = "responses"\nenv_key = "BOAI_NATIVE_WIRE_KEY"\nrequires_openai_auth = false\nsupports_websockets = false\n[analytics]\nenabled = false\n`)
  configurations.initial = await readFile(filename, 'utf8')
  const makeService = () => new AppService({ dataPath: join(evidence, 'data'), engine: { run: async () => { parentCalls++; throw Error('Native must not call API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  try {
    service = makeService()
    await service.init()
    const draft = { name: 'Fresh native Codex', executable: process.env.BOAI_NATIVE_EXECUTABLE ?? 'codex', args: [], protocol: 'codex-app-server', useExistingLogin: true, hostAccessAcknowledged: true }
    phase = 'profile-test'; await service.handle('testLaunchProfileDraft', draft); configurations.tested = await readFile(filename, 'utf8')
    profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const agent = await service.handle('saveAgent', { name: '首次原生调用', role: '测试', instructions: '按消息回答。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: 'codex-local', profileId: profile.id }, nativeOptions: { codexSandbox: 'workspace-write', codexApprovalPolicy: 'never' }, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
    const conversation = await service.handle('createConversation', { kind: 'direct', title: 'Codex first use', agentIds: [agent.id] }) as Conversation
    configurations.beforeMessage = await readFile(filename, 'utf8')
    expect(configurations.beforeMessage).toBe(configurations.initial)
    const send = async (label: string) => {
      phase = label
      const before = requests.length
      const message = await service!.handle('sendMessage', { conversationId: conversation.id, content: '只回答 BOAI_NATIVE_SOURCE_OK。', mentionIds: [], requestId: `${batch}-${label}` }) as Message
      await expect.poll(async () => {
        const detail = await service!.handle('getConversation', { id: conversation.id }) as ConversationDetail
        run = detail.runs.find(item => item.triggerMessageId === message.id)
        return run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)
      }, { timeout: 60000, interval: 100 }).toBe(true)
      runs.push(run!); expect(run?.status, run?.error).toBe('completed'); expect(requests.length - before).toBe(1)
      expect(run?.backend?.modelSource).toBeUndefined(); expect(run?.usage).toBeUndefined()
      return run?.backend?.sessionId
    }
    const session = await send('first-message'); configurations.afterMessage = await readFile(filename, 'utf8')
    expect(configurations.afterMessage).toContain('trust_level = "trusted"')
    expect(await send('second-message')).toBe(session)
    phase = 'process-restart'; const before = requests.length
    await service.close(); service = undefined
    const outfile = join(evidence, 'restart-runner.mjs')
    await build({ entryPoints: ['tests/fixtures/native-first-use-process.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
    const child = fork(outfile, [join(evidence, 'data'), conversation.id, `${batch}-after-restart`], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let diagnostics = ''
    child.stderr?.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000) })
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
    const message = <T,>() => new Promise<T>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); child.off('message', success); child.off('error', failed); child.off('exit', gone) }
      const success = (value: unknown) => { cleanup(); resolve(value as T) }
      const failed = (error: Error) => { cleanup(); reject(error) }
      const gone = () => failed(Error(`Process exited before checkpoint: ${diagnostics}`))
      const timer = setTimeout(() => failed(Error('Process checkpoint timed out')), 65000)
      child.once('message', success); child.once('error', failed); child.once('exit', gone)
    })
    processRestart = { pid: child.pid }
    try {
      const ready = await message<{ type: string; runs: ConversationDetail['runs']; parentCalls: number }>(); processRestart.ready = ready
      expect(ready.type).toBe('ready'); expect(ready.runs).toHaveLength(2); expect(ready.parentCalls).toBe(0); expect(requests.length).toBe(before)
      phase = 'after-process-restart'
      const result = message<{ type: string; run: ConversationDetail['runs'][number]; parentCalls: number }>(); child.send('continue')
      const completed = await result; processRestart.completed = completed; run = completed.run; runs.push(run)
      expect(completed.type).toBe('completed'); expect(completed.parentCalls).toBe(0)
      expect(run.status, run.error).toBe('completed'); expect(run.backend?.sessionId).toBe(session); expect(requests.length - before).toBe(1)
      processRestart.exit = await exited; expect(processRestart.exit).toEqual({ code: 0, signal: null })
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited }
      try { process.kill(child.pid!, 0); processRestart.exited = false } catch (error) { processRestart.exited = (error as NodeJS.ErrnoException).code === 'ESRCH' }
    }
    expect(processRestart.exited).toBe(true)
    expect(await readFile(filename, 'utf8')).toBe(configurations.afterMessage)
    expect(requests.every(row => row.model === 'group/native-a' && row.keyMatches)).toBe(true)
    expect(parentCalls).toBe(0); expect(await sources()).toEqual(sourceBefore)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await service?.close(); await server.close(); vi.unstubAllEnvs()
    configurations.closed = await readFile(filename, 'utf8')
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ batch, status: failure ? 'failed' : 'passed', failure, profile, configurations, requests, runs, run, parentCalls, processRestart, sourceBefore, sourceAfter: await sources() }, null, 2))
  }
}, 90000)

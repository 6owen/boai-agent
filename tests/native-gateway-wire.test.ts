/*
 * [INPUT]: Explicit installed-CLI opt-in, isolated native profiles and two independent loopback model sources.
 * [OUTPUT]: Native default/explicit model precedence, stable restart and external source change without replay or settings overwrite.
 * [POS]: G2a actual-binary protocol evidence; no supplier inference or personal configuration changes.
 * [PROTOCOL]: Retain each new batch and update tests/.folder.md with source coverage.
 */
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test, vi } from 'vitest'
import { AppService } from '../src/runtime/service'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../src/shared/domain'
import type { RuntimePluginCatalog } from '../src/shared/plugins/runtime-catalog'
import { gatewayWireServer } from './fixtures/gateway-wire-server'

for (const runtime of ['codex', 'claude', 'pi', 'opencode'] as const) test.skipIf(process.env.BOAI_NATIVE_GATEWAY_WIRE !== runtime)(`${runtime} follows native model configuration and fences external changes across restart`, async () => {
  const batch = process.env.BOAI_MAGPIE_BATCH
  if (!batch || !/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('A new BOAI_MAGPIE_BATCH is required')
  const evidence = resolve('.local/magpie-20261017', `${runtime}-native-wire-${batch}`); await mkdir(evidence)
  const root = await realpath(await mkdtemp(join(tmpdir(), `boai-${runtime}-native-`))), config = join(root, 'native-config'); await mkdir(config)
  let phase = 'setup', failure: string | undefined, parentCalls = 0, service: AppService | undefined, profile: LaunchProfile | undefined
  const requests: Parameters<typeof gatewayWireServer>[2] = [], runs: ConversationDetail['runs'] = []
  const first = await gatewayWireServer(() => phase, 'first', requests), second = await gatewayWireServer(() => phase, 'second', requests)
  const filename = join(config, runtime === 'codex' ? 'config.toml' : runtime === 'claude' || runtime === 'pi' ? 'settings.json' : 'opencode.json')
  let expectedSettings = ''
  const configure = async (url: string, model: string) => {
    if (runtime === 'codex') expectedSettings = `model = "${model}"\nmodel_provider = "native_wire"\n[model_providers.native_wire]\nname = "Native wire"\nbase_url = "${url}/v1"\nwire_api = "responses"\nenv_key = "BOAI_NATIVE_WIRE_KEY"\nrequires_openai_auth = false\nsupports_websockets = false\n[analytics]\nenabled = false\n`
    else if (runtime === 'claude') expectedSettings = JSON.stringify({ model, env: { ANTHROPIC_BASE_URL: url, ANTHROPIC_API_KEY: 'magpie-boai', ANTHROPIC_AUTH_TOKEN: 'magpie-boai', ANTHROPIC_MODEL: model, ANTHROPIC_DEFAULT_SONNET_MODEL: model, ANTHROPIC_DEFAULT_HAIKU_MODEL: model, ANTHROPIC_DEFAULT_OPUS_MODEL: model } })
    else if (runtime === 'pi') {
      await writeFile(join(config, 'models.json'), JSON.stringify({ providers: { native_wire: { api: 'openai-completions', baseUrl: `${url}/v1`, apiKey: '$BOAI_NATIVE_WIRE_KEY', models: ['group/native-a', 'group/native-b', 'group/override'].map(id => ({ id, name: id, contextWindow: 1000000, maxTokens: 16384 })) } } }))
      expectedSettings = JSON.stringify({ defaultProvider: 'native_wire', defaultModel: model })
    } else expectedSettings = JSON.stringify({ $schema: 'https://opencode.ai/config.json', model: `native_wire/${model}`, small_model: `native_wire/${model}`, provider: { native_wire: { npm: '@ai-sdk/openai-compatible', options: { baseURL: `${url}/v1`, apiKey: '{env:BOAI_NATIVE_WIRE_KEY}' }, models: Object.fromEntries(['group/native-a', 'group/native-b', 'group/override'].map(id => [id, { name: id }])) } } })
    await writeFile(filename, expectedSettings)
  }
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('BOAI_NATIVE_WIRE_KEY', 'magpie-boai')
  for (const key of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_CONFIG_DIR', 'OPENAI_BASE_URL', 'OPENAI_API_KEY']) vi.stubEnv(key, undefined)
  vi.stubEnv('CODEX_HOME', config); vi.stubEnv('CLAUDE_CONFIG_DIR', config); vi.stubEnv('PI_CODING_AGENT_DIR', config); vi.stubEnv('OPENCODE_CONFIG', filename)
  vi.stubEnv('XDG_CONFIG_HOME', join(root, '.config')); vi.stubEnv('XDG_DATA_HOME', join(root, '.local/share')); vi.stubEnv('XDG_CACHE_HOME', join(root, '.cache')); vi.stubEnv('XDG_STATE_HOME', join(root, '.local/state'))
  vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
  await configure(first.url, 'group/native-a')
  if (runtime === 'claude') await writeFile(join(root, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: ['magpie-boai'], rejected: [] } }))
  const options = { dataPath: join(root, 'data'), engine: { run: async () => { parentCalls++; throw Error('Native must not use API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  try {
    service = new AppService(options); await service.init()
    const plugin = ['pi', 'opencode'].includes(runtime) ? (await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog).plugins.find(p => p.manifest.id === `boai.runtime.${runtime}`)! : undefined
    const draft = { name: `Native ${runtime}`, executable: process.env.BOAI_NATIVE_EXECUTABLE ?? runtime, args: [], protocol: runtime === 'codex' ? 'codex-app-server' : runtime === 'claude' ? 'claude-cli' : 'runtime-plugin', useExistingLogin: true, hostAccessAcknowledged: true, ...(plugin ? { runtimePlugin: { pluginId: plugin.manifest.id, providerId: runtime, packageHash: plugin.packageHash } } : {}) }
    await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const employee = { name: '原生配置验证', role: '测试', instructions: '按消息回答。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: plugin ? { kind: 'runtime-plugin', profileId: profile.id, pluginId: plugin.manifest.id, providerId: runtime } : { kind: runtime === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
    let agent = await service.handle('saveAgent', employee) as DigitalAgent
    const conversation = await service.handle('createConversation', { kind: 'direct', title: 'Native source', agentIds: [agent.id] }) as Conversation
    await writeFile(join(evidence, 'plan.json'), JSON.stringify({ runtime, batch, userMessages: 5, maxHttpRequests: 30, nativeProfile: profile, sourceMode: 'native configuration', sequence: ['native default', 'same native session', 'restart unchanged', 'external source change', 'explicit native model'], scope: 'real CLI/local HTTP fixture, no supplier inference' }, null, 2))
    const send = async (label: string, source: string, model: string) => {
      phase = label; const before = requests.length
      const message = await service!.handle('sendMessage', { conversationId: conversation.id, content: '只回答 BOAI_NATIVE_SOURCE_OK。', mentionIds: [], requestId: `${batch}-${label}` }) as Message
      let run: ConversationDetail['runs'][number] | undefined
      await expect.poll(async () => { const detail = await service!.handle('getConversation', { id: conversation.id }) as ConversationDetail; run = detail.runs.find(item => item.triggerMessageId === message.id); return run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) }, { timeout: 60000, interval: 100 }).toBe(true)
      runs.push(run!); expect(run?.status, run?.error).toBe('completed'); expect(run?.backend?.modelSource).toBeUndefined(); expect(run?.usage).toBeUndefined()
      const received = requests.slice(before); expect(received.length).toBeGreaterThan(0); expect(received.every(row => row.source === source && row.keyMatches)).toBe(true)
      // OpenCode keeps its native small_model for title generation; the explicit
      // ACP model changes the task model, not that separate native configuration.
      const taskCalls = received.filter(row => row.tools.length > 0), auxiliary = received.filter(row => row.tools.length === 0)
      expect(taskCalls.length).toBeGreaterThan(0); expect(taskCalls.every(row => row.model === model)).toBe(true)
      expect(auxiliary.every(row => runtime === 'opencode' && row.purpose === 'native-title')).toBe(true)
      expect(auxiliary.every(row => row.model === (runtime === 'opencode' && label === 'explicit-model' ? 'group/native-b' : model))).toBe(true)
      expect(received.some(row => row.tools.some(name => ['bash', 'Bash', 'exec_command', 'shell_command', 'shell'].includes(name)))).toBe(true)
      expect(received.some(row => row.tools.some(name => name.includes('publish_artifact')))).toBe(true)
      return run!.backend!.sessionId
    }
    const session = await send('first', 'first', 'group/native-a')
    expect(await send('second', 'first', 'group/native-a')).toBe(session)
    phase = 'restart'; const before = requests.length; await service.close(); service = new AppService(options); await service.init(); expect(requests.length).toBe(before)
    expect(await send('after-restart', 'first', 'group/native-a')).toBe(session)
    await configure(second.url, 'group/native-b')
    expect(await send('external-change', 'second', 'group/native-b')).not.toBe(session)
    agent = await service.handle('saveAgent', { ...employee, id: agent.id, expectedConfigVersion: agent.configVersion, modelId: runtime === 'opencode' ? 'native_wire/group/override' : 'group/override' }) as DigitalAgent
    await send('explicit-model', 'second', 'group/override')
    expect(await readFile(filename, 'utf8')).toBe(expectedSettings); expect(parentCalls).toBe(0)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await service?.close(); await first.close(); await second.close(); vi.unstubAllEnvs()
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, profile, parentCalls, requests, runs }, null, 2)); await rm(root, { recursive: true, force: true })
  }
}, 360000)

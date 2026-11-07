/*
 * [INPUT]: Explicit opt-in, installed Codex, isolated HOME/CODEX_HOME/AppService and fixed loopback Responses/MCP fixtures.
 * [OUTPUT]: Actual native Skill consumption and retained native tools; duplicate skills/mixed native Source packages stop before model input or package MCP startup.
 * [POS]: WT2 installed-binary wire evidence; never forwards to a supplier or reads personal configuration.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md through its owner.
 */
import { createServer, type ServerResponse } from 'node:http'
import { access, mkdtemp, mkdir, realpath, writeFile, readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, vi } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { CodexClient } from '../packages/runtime/src/adapters/codex/client'
import type { ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { CapabilityInspection, CapabilityInstallation, CapabilityOperation } from '../packages/shared/src/domain/capability-packages'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message, Snapshot } from '../packages/shared/src/domain'

type WireTool = { type?: string; name?: string; tools?: WireTool[] }
type WireRequest = { model: string; keyMatches: boolean; tools: string[]; skillConsumed: boolean; sourceConsumed: boolean; outputs: number }
function toolNames(tools: WireTool[], namespace = ''): string[] {
  return tools.flatMap(tool => [tool.name ?? tool.type ?? '', ...(tool.name && namespace ? [`${namespace}.${tool.name}`] : []), ...toolNames(tool.tools ?? [], tool.type === 'namespace' ? tool.name : namespace)])
}
function fixedResponse(response: ServerResponse, model: string, sequenceId: number, tool?: { name: string; namespace?: string; input: object }) {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  let sequence = 0
  const event = (type: string, data: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`)
  const base = { id: `response_${sequenceId}`, object: 'response', created_at: 1, model, status: 'in_progress', output: [] }
  event('response.created', { response: base })
  let item: object
  if (tool) {
    const args = JSON.stringify(tool.input)
    item = { id: `function_${sequenceId}`, type: 'function_call', call_id: `capability_call_${sequenceId}`, name: tool.name, ...(tool.namespace ? { namespace: tool.namespace } : {}), arguments: args, status: 'completed' }
    event('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', arguments: '' } })
    event('response.function_call_arguments.delta', { output_index: 0, item_id: `function_${sequenceId}`, delta: args })
    event('response.function_call_arguments.done', { output_index: 0, item_id: `function_${sequenceId}`, arguments: args })
  } else {
    const text = 'BOAI_CAPABILITY_CODEX_WIRE_OK'
    item = { id: `message_${sequenceId}`, type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
    event('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
    event('response.content_part.added', { output_index: 0, item_id: `message_${sequenceId}`, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
    event('response.output_text.delta', { output_index: 0, item_id: `message_${sequenceId}`, content_index: 0, delta: text })
    event('response.output_text.done', { output_index: 0, item_id: `message_${sequenceId}`, content_index: 0, text })
  }
  event('response.output_item.done', { output_index: 0, item })
  event('response.completed', { response: { ...base, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } })
  response.end()
}

for (const scenario of ['bound-skill', 'duplicate-native-skill', 'mixed-package-refused'] as const) {
  test.skipIf(process.env.BOAI_CAPABILITY_CODEX_WIRE !== '1')(`installed Codex capability wire: ${scenario}`, async () => {
    const batch = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
    const evidence = resolve('.local/wt2-evidence/native-wire', `${batch}-${scenario}`)
    await mkdir(evidence, { recursive: true })
    const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-capability-codex-wire-')))
    const config = join(root, '.codex'), packagePath = join(root, 'package-input'), mcpStarted = join(root, 'package-mcp-started')
    await mkdir(config); await mkdir(join(packagePath, 'skills', 'wire-method'), { recursive: true })
    const skillText = '---\nname: wire-method\ndescription: Read the fixed local evidence.\n---\nReturn PACKAGE_SKILL_FACT from this bound package.'
    await writeFile(join(packagePath, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'wire-package', version: '1', repository: 'https://example.test/wire-package' }))
    await writeFile(join(packagePath, 'skills/wire-method/SKILL.md'), skillText)
    if (scenario === 'mixed-package-refused') {
      const wrapper = join(root, 'mcp-entry.mjs')
      await writeFile(wrapper, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(mcpStarted)}, 'started');\nawait import(${JSON.stringify(pathToFileURL(resolve('tests/fixtures/source-mcp.mjs')).href)});\n`)
      await writeFile(join(packagePath, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { fixture: { type: 'stdio', command: process.execPath, args: [wrapper], env: { SOURCE_TOKEN: '${SOURCE_TOKEN}' } } } }))
    }
    if (scenario === 'duplicate-native-skill') {
      await mkdir(join(config, 'skills', 'native-copy'), { recursive: true })
      await writeFile(join(config, 'skills/native-copy/SKILL.md'), skillText)
    }
    let service: AppService | undefined, profile: LaunchProfile | undefined, run: ConversationDetail['runs'][number] | undefined, failure: string | undefined
    let sourceId = '', skillId = '', forbidden = 0, parentCalls = 0, step = 0
    const requests: WireRequest[] = [], rpc: { method: string; completed: boolean }[] = []
    const originalRequest = CodexClient.prototype.request
    const rpcSpy = vi.spyOn(CodexClient.prototype, 'request').mockImplementation(async function (this: CodexClient, ...args: Parameters<CodexClient['request']>) {
      const record = { method: args[0], completed: false }; rpc.push(record)
      const result = await originalRequest.apply(this, args); record.completed = true; return result
    })
    const server = createServer((request, response) => { void (async () => {
      if (request.method !== 'POST' || request.url !== '/relay/v1/responses') { forbidden++; response.writeHead(404); response.end('{}'); return }
      let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4_000_000) throw new Error('Fixture request limit') }
      const body = JSON.parse(raw), names = toolNames(body.tools ?? [])
      const outputs = (body.input ?? []).filter((item: { type?: string }) => item.type === 'function_call_output')
      const outputText = JSON.stringify(outputs)
      requests.push({ model: body.model, keyMatches: request.headers.authorization === 'Bearer synthetic-native', tools: names, skillConsumed: outputText.includes('PACKAGE_SKILL_FACT'), sourceConsumed: outputText.includes('CAPABILITY_MCP_FACT'), outputs: outputs.length })
      if (requests.length > 8) { response.writeHead(429); response.end('fixture call cap'); return }
      const actions = [{ name: 'read_skill', input: { resourceId: skillId } }]
      const action = actions[step++]
      const namespace = (body.tools ?? []).some((tool: WireTool) => tool.type === 'namespace' && tool.name === 'boai') ? 'boai' : undefined
      const name = action && (namespace ? action.name : names.find(value => value === action.name || value.endsWith(`.${action.name}`) || value.endsWith(`__${action.name}`)) ?? action.name)
      fixedResponse(response, body.model, requests.length, action ? { name: name!, namespace, input: action.input } : undefined)
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end('fixed fixture failure') }) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const settings = `model = "group/work"\nmodel_provider = "fixture"\n[model_providers.fixture]\nname = "Isolated fixture"\nbase_url = "${endpoint}/relay/v1"\nwire_api = "responses"\nenv_key = "BOAI_CAPABILITY_WIRE_KEY"\nrequires_openai_auth = false\nsupports_websockets = false\n[analytics]\nenabled = false\n`
    await writeFile(join(config, 'config.toml'), settings)
    vi.stubEnv('HOME', root); vi.stubEnv('CODEX_HOME', config); vi.stubEnv('OPENAI_BASE_URL', `${endpoint}/forbidden`); vi.stubEnv('OPENAI_API_KEY', 'synthetic-ambient'); vi.stubEnv('BOAI_CAPABILITY_WIRE_KEY', 'synthetic-native')
    const secrets = new Map<string, string>()
    try {
      service = new AppService({ dataPath: join(root, 'data'), skillDiscovery: { homeDir: root }, engine: { run: async () => { parentCalls++; throw new Error('No API inference') }, test: async () => '' }, secrets: { get: async id => secrets.get(id), set: async (id, value) => { secrets.set(id, value) }, delete: async id => { secrets.delete(id) } }, emit: () => {} })
      await service.init()
      const call = (operation: string, input: Record<string, unknown> = {}) => service!.handle('executeApplicationOperation', { operation, input, requestId: randomUUID() }) as Promise<ApplicationResult>
      const draft = { name: 'Capability wire Codex', executable: process.env.BOAI_CODEX_EXECUTABLE ?? 'codex', args: [], protocol: 'codex-app-server', useExistingLogin: true, codexHome: config, hostAccessAcknowledged: true }
      await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
      expect(profile.verified?.version).toContain('0.167')
      const employee = await service.handle('saveAgent', { name: '能力包原生验证', role: '本机受控验收', instructions: '读取已绑定技能，最后返回固定结果。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: 'codex-local', profileId: profile.id }, executionPermission: 'full-access', skillIds: [], knowledgeIds: [], sourceIds: [], allowCommands: true, active: true }) as DigitalAgent
      const inspected = await call('capabilityPackages.inspect', { path: packagePath }); expect(inspected.status).toBe('succeeded')
      const installed = await call('capabilityPackages.install', { path: packagePath, contentHash: (inspected.data as CapabilityInspection).contentHash }); expect(installed).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
      const installationId = (installed.data as CapabilityOperation).installationId
      const getPackage = async () => ((await call('capabilityPackages.get', { installationId })).data as { installation: CapabilityInstallation }).installation
      let installation = await getPackage()
      const sourceContribution = installation.contributions.find(value => value.kind === 'source')
      if (sourceContribution) {
        sourceId = sourceContribution.objectId
        const source = await service.handle('getDataSource', { id: sourceId }) as { revision: number }
        expect(await call('capabilityPackages.configure', { installationId, expectedRevision: installation.revision, contributionId: sourceContribution.id, expectedSourceRevision: source.revision, credential: JSON.stringify({ SOURCE_TOKEN: 'synthetic-fixture-only' }) })).toMatchObject({ status: 'succeeded' })
      }
      expect(await call('capabilityPackages.bind', { installationId, expectedRevision: installation.revision, employeeId: employee.id, expectedConfigVersion: employee.configVersion, expectedBindingRevision: 0, contributionIds: installation.contributions.map(value => value.id) })).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
      installation = await getPackage()
      expect(await call('capabilityPackages.setEnabled', { installationId, expectedRevision: installation.revision, enabled: true })).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
      const snapshot = await service.handle('snapshot', undefined) as Snapshot
      skillId = snapshot.resources.find(value => value.ownerAgentId === employee.id && value.name === 'wire-method')!.id
      await expect(access(mcpStarted)).rejects.toMatchObject({ code: 'ENOENT' })
      const chat = await service.handle('createConversation', { kind: 'direct', title: scenario, agentIds: [employee.id] }) as Conversation
      const rpcStart = rpc.length
      const message = await service.handle('sendMessage', { conversationId: chat.id, requestId: randomUUID(), content: '读取包技能，完成后回答 BOAI_CAPABILITY_CODEX_WIRE_OK。', mentionIds: [] }) as Message
      await expect.poll(async () => { const detail = await service!.handle('getConversation', { id: chat.id }) as ConversationDetail; run = detail.runs.find(value => value.triggerMessageId === message.id); return !!run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) }, { timeout: 60000, interval: 100 }).toBe(true)
      const executionRpc = rpc.slice(rpcStart).map(value => value.method)
      expect(executionRpc).toContain('thread/start'); expect(executionRpc).toContain('skills/list'); expect(executionRpc).not.toContain('mcpServerStatus/list')
      if (scenario !== 'bound-skill') {
        expect(run?.status).toBe('failed'); expect(run?.error).toMatch(/原生|归属|同一能力/)
        expect(executionRpc).not.toContain('turn/start'); expect(requests).toHaveLength(0)
      } else {
        expect(run?.status, run?.error).toBe('completed')
        const afterThread = executionRpc.findIndex((method, index) => index > executionRpc.indexOf('thread/start') && method === 'skills/list')
        expect(afterThread).toBeGreaterThan(executionRpc.indexOf('thread/start')); expect(afterThread).toBeLessThan(executionRpc.indexOf('turn/start'))
        expect(requests.some(value => value.tools.some(name => ['exec_command', 'shell', 'shell_command'].includes(name)))).toBe(true)
        expect(requests.some(value => value.tools.includes('read_skill'))).toBe(true)
        expect(requests.some(value => value.skillConsumed)).toBe(true)
        expect(requests.every(value => value.keyMatches && value.model === 'group/work')).toBe(true)
        const detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail
        expect(detail.messages.some(value => value.senderType === 'agent' && value.content.includes('BOAI_CAPABILITY_CODEX_WIRE_OK'))).toBe(true)
      }
      expect(parentCalls).toBe(0); expect(forbidden).toBe(0)
      await expect(access(mcpStarted)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(join(config, 'config.toml'), 'utf8')).toContain('supports_websockets = false')
    } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
    finally {
      await service?.close()
      const packageMcpStarted = await access(mcpStarted).then(() => true, () => false)
      await writeFile(join(evidence, 'result.json'), JSON.stringify({ scenario, status: failure ? 'failed' : 'passed', failure, scope: 'installed Codex with fixed local Responses; pure Skill consumption and fail-closed mixed package, no supplier inference', version: profile?.verified?.version, executableHash: profile?.executableHash, rpc, requests, parentCalls, forbidden, packageMcpStarted, run: run ? { id: run.id, status: run.status, error: run.error } : undefined }, null, 2))
      rpcSpy.mockRestore(); vi.unstubAllEnvs()
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  }, 100000)
}

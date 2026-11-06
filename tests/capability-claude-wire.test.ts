/*
 * [INPUT]: Opt-in installed Claude 2.1.318, isolated HOME/config/project/AppService, and fixed loopback Anthropic SSE plus local MCP.
 * [OUTPUT]: Real mixed-package Skill/MCP consumption, preserved native tools, and pre-input duplicate/incomplete Skill rejection.
 * [POS]: WT2 actual CLI wire evidence; no supplier inference, personal account, shared fixture edits or credential logs.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md through its owner.
 */
import { createServer, type ServerResponse } from 'node:http'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, vi } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import * as claudeProcess from '../packages/runtime/src/adapters/claude/process'
import type { ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { CapabilityInspection, CapabilityInstallation, CapabilityOperation } from '../packages/shared/src/domain/capability-packages'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message, Snapshot } from '../packages/shared/src/domain'

type ModelRequest = { model: string; keyMatches: boolean; tools: string[]; skillConsumed: boolean; sourceConsumed: boolean; outputs: number }
function fixedAnthropic(response: ServerResponse, model: string, sequence: number, action?: { name: string; input: object }) {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`)
  event('message_start', { message: { id: `message_${sequence}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } })
  if (action) {
    event('content_block_start', { index: 0, content_block: { type: 'tool_use', id: `capability_tool_${sequence}`, name: action.name, input: {} } })
    event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(action.input) } })
  } else {
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'BOAI_CAPABILITY_CLAUDE_WIRE_OK' } })
  }
  event('content_block_stop', { index: 0 })
  event('message_delta', { delta: { stop_reason: action ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } })
  event('message_stop', {}); response.end()
}

for (const scenario of ['bound-mixed-package', 'duplicate-native-skill', 'manual-only-metadata'] as const) {
  test.skipIf(process.env.BOAI_CAPABILITY_CLAUDE_WIRE !== '1')(`installed Claude capability wire: ${scenario}`, async () => {
    const batch = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
    const evidence = resolve('.local/wt2-evidence/native-wire', `${batch}-claude-${scenario}`)
    await mkdir(evidence, { recursive: true })
    const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-capability-claude-wire-')))
    const config = join(root, 'native-config'), project = join(root, 'project'), packagePath = join(root, 'package-input'), mcpStarted = join(root, 'package-mcp-started')
    await mkdir(config); await mkdir(project); await mkdir(join(packagePath, 'skills', 'wire-method'), { recursive: true })
    const fixtureKey = randomUUID().replaceAll('-', '').slice(0, 20), sourceKey = randomUUID()
    const skillText = '---\nname: wire-method\ndescription: Read the fixed local evidence.\n---\nReturn PACKAGE_SKILL_FACT from this bound package.'
    await writeFile(join(packagePath, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'wire-package', version: '1', repository: 'https://example.test/wire-package' }))
    await writeFile(join(packagePath, 'skills/wire-method/SKILL.md'), skillText)
    const wrapper = join(root, 'mcp-entry.mjs')
    await writeFile(wrapper, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(mcpStarted)}, 'started\\n');\nawait import(${JSON.stringify(pathToFileURL(resolve('tests/fixtures/source-mcp.mjs')).href)});\n`)
    await writeFile(join(packagePath, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { fixture: { type: 'stdio', command: process.execPath, args: [wrapper], env: { SOURCE_TOKEN: '${SOURCE_TOKEN}' } } } }))
    if (scenario !== 'bound-mixed-package') {
      const nativeSkill = join(config, 'skills', scenario === 'duplicate-native-skill' ? 'wire-method' : 'manual-only')
      await mkdir(nativeSkill, { recursive: true })
      await writeFile(join(nativeSkill, 'SKILL.md'), scenario === 'duplicate-native-skill' ? skillText : '---\nname: manual-only\ndescription: An explicit user command only.\ndisable-model-invocation: true\n---\nDo not invoke automatically.')
    }
    let service: AppService | undefined, profile: LaunchProfile | undefined, run: ConversationDetail['runs'][number] | undefined, failure: string | undefined
    let sourceId = '', skillId = '', parentCalls = 0, forbidden = 0, countTokens = 0, step = 0
    const requests: ModelRequest[] = [], traffic: { direction: 'input' | 'output'; type: string; subtype?: string }[] = [], flags: string[][] = [], directories: string[] = [], commandSets: string[][] = []
    const originalProcess = claudeProcess.runClaudeProcess
    const processSpy = vi.spyOn(claudeProcess, 'runClaudeProcess').mockImplementation(input => {
      flags.push(input.args.filter(value => value.startsWith('--')))
      directories.push(input.cwd)
      return originalProcess({ ...input,
        onReady: input.onReady ? (write, end) => input.onReady!(line => {
          try { const frame = JSON.parse(line); traffic.push({ direction: 'input', type: frame.type, ...(frame.request?.subtype ? { subtype: frame.request.subtype } : {}) }) } catch { /* Record no raw payload. */ }
          write(line)
        }, end) : undefined,
        onLine: line => {
          try {
            const frame = JSON.parse(line); traffic.push({ direction: 'output', type: frame.type, ...(frame.subtype ? { subtype: frame.subtype } : {}) })
            const commands = frame.response?.response?.commands
            if (Array.isArray(commands)) commandSets.push(commands.map(value => typeof value === 'string' ? value : value?.name).filter((value): value is string => typeof value === 'string'))
          } catch { /* Record no raw payload. */ }
          return input.onLine(line)
        },
      })
    })
    const server = createServer((request, response) => { void (async () => {
      const path = request.url?.split('?')[0]
      if (request.method === 'POST' && path === '/relay/v1/messages/count_tokens') { countTokens++; response.setHeader('content-type', 'application/json'); response.end('{"input_tokens":100}'); return }
      if (request.method !== 'POST' || path !== '/relay/v1/messages') { forbidden++; response.writeHead(404); response.end('{}'); return }
      let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4_000_000) throw new Error('Fixture request limit') }
      const body = JSON.parse(raw), tools: string[] = (body.tools ?? []).map((tool: { name: string }) => tool.name)
      const outputs = (body.messages ?? []).flatMap((message: { content?: unknown }) => Array.isArray(message.content) ? message.content : []).filter((part: { type?: string }) => part.type === 'tool_result')
      const outputText = JSON.stringify(outputs)
      requests.push({ model: body.model, keyMatches: request.headers['x-api-key'] === fixtureKey || request.headers.authorization === `Bearer ${fixtureKey}`, tools, skillConsumed: outputText.includes('PACKAGE_SKILL_FACT'), sourceConsumed: outputText.includes('CAPABILITY_MCP_FACT'), outputs: outputs.length })
      if (requests.length > 8) { response.writeHead(429); response.end('fixture call cap'); return }
      const actions = [
        { name: 'ToolSearch', input: { query: 'select:mcp__boai__read_skill,mcp__boai__inspect_data_source,mcp__boai__call_data_source' } },
        { name: 'read_skill', input: { resourceId: skillId } },
        { name: 'inspect_data_source', input: { sourceId } },
        { name: 'call_data_source', input: { sourceId, tool: 'echo', arguments: { value: 'CAPABILITY_MCP_FACT' } } },
      ]
      const action = actions[step]
      const name = action && tools.find(value => value === (action.name === 'ToolSearch' ? action.name : `mcp__boai__${action.name}`))
      if (action && !name) throw new Error('Required bound product tool is absent')
      step++
      fixedAnthropic(response, body.model, requests.length, action ? { name: name!, input: action.input } : undefined)
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end('fixed fixture failure') }) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/relay`
    const settings = JSON.stringify({ model: 'group/work', env: { ANTHROPIC_BASE_URL: endpoint, ANTHROPIC_API_KEY: fixtureKey, ANTHROPIC_AUTH_TOKEN: fixtureKey, ANTHROPIC_MODEL: 'group/work', ANTHROPIC_DEFAULT_SONNET_MODEL: 'group/work', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'group/work', ANTHROPIC_DEFAULT_OPUS_MODEL: 'group/work' } })
    await writeFile(join(config, 'settings.json'), settings)
    await writeFile(join(root, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: [fixtureKey], rejected: [] } }))
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CLAUDE_CONFIG_DIR', config)
    for (const key of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_CUSTOM_HEADERS', 'ANTHROPIC_MODEL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST']) vi.stubEnv(key, undefined)
    vi.stubEnv('XDG_CONFIG_HOME', join(root, '.config')); vi.stubEnv('XDG_DATA_HOME', join(root, '.local/share')); vi.stubEnv('XDG_CACHE_HOME', join(root, '.cache')); vi.stubEnv('XDG_STATE_HOME', join(root, '.local/state'))
    vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
    const secrets = new Map<string, string>()
    try {
      service = new AppService({ dataPath: join(root, 'data'), skillDiscovery: { homeDir: root }, engine: { run: async () => { parentCalls++; throw new Error('No API inference') }, test: async () => '' }, secrets: { get: async id => secrets.get(id), set: async (id, value) => { secrets.set(id, value) }, delete: async id => { secrets.delete(id) } }, emit: () => {} })
      await service.init()
      const call = (operation: string, input: Record<string, unknown> = {}) => service!.handle('executeApplicationOperation', { operation, input, requestId: randomUUID() }) as Promise<ApplicationResult>
      const draft = { name: 'Capability wire Claude', executable: process.env.BOAI_CLAUDE_EXECUTABLE ?? 'claude', args: [], protocol: 'claude-cli', useExistingLogin: true, hostAccessAcknowledged: true }
      await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
      expect(profile.verified?.version).toContain('2.1.318')
      const employee = await service.handle('saveAgent', { name: '混合能力包原生验证', role: '本机受控验收', instructions: '读取已绑定技能，检查并调用已绑定包数据源，最后返回固定结果。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: 'claude-local', profileId: profile.id }, executionPermission: 'full-access', defaultProjectDirectory: project, skillIds: [], knowledgeIds: [], sourceIds: [], allowCommands: true, active: true }) as DigitalAgent
      const inspected = await call('capabilityPackages.inspect', { path: packagePath }); expect(inspected.status).toBe('succeeded')
      const installed = await call('capabilityPackages.install', { path: packagePath, contentHash: (inspected.data as CapabilityInspection).contentHash }); expect(installed).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
      const installationId = (installed.data as CapabilityOperation).installationId
      const getPackage = async () => ((await call('capabilityPackages.get', { installationId })).data as { installation: CapabilityInstallation }).installation
      let installation = await getPackage()
      const sourceContribution = installation.contributions.find(value => value.kind === 'source')!; sourceId = sourceContribution.objectId
      const source = await service.handle('getDataSource', { id: sourceId }) as { revision: number }
      expect(await call('capabilityPackages.configure', { installationId, expectedRevision: installation.revision, contributionId: sourceContribution.id, expectedSourceRevision: source.revision, credential: JSON.stringify({ SOURCE_TOKEN: sourceKey }) })).toMatchObject({ status: 'succeeded' })
      expect(await call('capabilityPackages.bind', { installationId, expectedRevision: installation.revision, employeeId: employee.id, expectedConfigVersion: employee.configVersion, expectedBindingRevision: 0, contributionIds: installation.contributions.map(value => value.id) })).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
      installation = await getPackage()
      expect(await call('capabilityPackages.setEnabled', { installationId, expectedRevision: installation.revision, enabled: true })).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
      const snapshot = await service.handle('snapshot', undefined) as Snapshot
      skillId = snapshot.resources.find(value => value.ownerAgentId === employee.id && value.name === 'wire-method')!.id
      await expect(access(mcpStarted)).rejects.toMatchObject({ code: 'ENOENT' })
      const chat = await service.handle('createConversation', { kind: 'direct', title: scenario, agentIds: [employee.id] }) as Conversation
      const traceStart = traffic.length
      const message = await service.handle('sendMessage', { conversationId: chat.id, requestId: randomUUID(), content: '读取已绑定的包技能，调用包 echo 工具，完成后回答 BOAI_CAPABILITY_CLAUDE_WIRE_OK。', mentionIds: [] }) as Message
      await expect.poll(async () => { const detail = await service!.handle('getConversation', { id: chat.id }) as ConversationDetail; run = detail.runs.find(value => value.triggerMessageId === message.id); return !!run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) }, { timeout: 60000, interval: 100 }).toBe(true)
      const sent = traffic.slice(traceStart).filter(value => value.direction === 'input')
      expect(sent.some(value => value.subtype === 'mcp_status')).toBe(true); expect(sent.some(value => value.subtype === 'get_context_usage')).toBe(true)
      if (scenario === 'bound-mixed-package') {
        expect(run?.status, run?.error).toBe('completed')
        expect(sent.some(value => value.type === 'user')).toBe(true)
        expect(requests.some(value => value.tools.includes('Bash') && value.tools.includes('Read'))).toBe(true)
        expect(requests.some(value => value.skillConsumed)).toBe(true); expect(requests.some(value => value.sourceConsumed)).toBe(true)
        expect(requests.every(value => value.keyMatches && value.model === 'group/work')).toBe(true)
        await expect(access(mcpStarted)).resolves.toBeUndefined()
        const detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail
        expect(detail.messages.some(value => value.senderType === 'agent' && value.content.includes('BOAI_CAPABILITY_CLAUDE_WIRE_OK'))).toBe(true)
      } else {
        expect(run?.status).toBe('failed'); expect(run?.error).toMatch(/原生|归属|完整|无法确认/)
        expect(sent.some(value => value.type === 'user')).toBe(false)
        expect(requests).toHaveLength(0); expect(countTokens).toBe(0)
        await expect(access(mcpStarted)).rejects.toMatchObject({ code: 'ENOENT' })
      }
      expect(flags.some(args => args.includes('--mcp-config'))).toBe(true)
      expect(flags.every(args => !args.includes('--strict-mcp-config') && !args.includes('--disable-slash-commands'))).toBe(true)
      expect(parentCalls).toBe(0); expect(forbidden).toBe(0)
      expect(await readFile(join(config, 'settings.json'), 'utf8')).toBe(settings)
    } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
    finally {
      await service?.close()
      const packageMcpStarted = await access(mcpStarted).then(() => true, () => false)
      await writeFile(join(evidence, 'result.json'), JSON.stringify({ scenario, status: failure ? 'failed' : 'passed', failure, scope: 'installed Claude with fixed local Anthropic SSE and package stdio MCP; no supplier inference', version: profile?.verified?.version, executableHash: profile?.executableHash, flags, directories, requestedDirectory: project, commandSets, traffic, requests, parentCalls, forbidden, countTokens, packageMcpStarted, run: run ? { id: run.id, status: run.status, error: run.error } : undefined }, null, 2))
      processSpy.mockRestore(); vi.unstubAllEnvs()
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  }, 100000)
}

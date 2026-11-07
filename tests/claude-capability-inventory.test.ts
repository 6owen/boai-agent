/*
 * [INPUT]: Claude 2.1.318 control shapes, actual isolated skill trees and production conversation admission with a controlled transport.
 * [OUTPUT]: Complete/opaque ownership evidence, bridge authentication, manual-only/unknown rejection, correlated replies and cancellation before prompt.
 * [POS]: Offline Claude package boundary; no model, personal configuration, real account or GUI.
 * [PROTOCOL]: Changes update Header and tests/.folder.md through its designated owner.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { collectClaudeCapabilityInventory, createClaudeCapabilityControl, type ClaudeCapabilityBridgeIdentity, type ClaudeCapabilityRequest } from '../packages/runtime/src/adapters/claude/capability-inventory'
import { nativeCapabilityTargetIdentity } from '../packages/runtime/src/modules/resources/capability-native-ownership'
import { runClaudeConversation } from '../packages/runtime/src/adapters/claude/conversation'
import { runClaudeProcess } from '../packages/runtime/src/adapters/claude/process'
import { inspectProgram } from '../packages/runtime/src/modules/backends/program'
import type { EngineContext } from '../packages/runtime/src/contracts'

vi.mock('../packages/runtime/src/adapters/claude/process', () => ({ runClaudeProcess: vi.fn() }))
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.mocked(runClaudeProcess).mockReset() })
const bridge: ClaudeCapabilityBridgeIdentity = { type: 'http', url: 'http://127.0.0.1:49123/mcp', authorization: 'Bearer PRIVATE_BRIDGE' }
const initialization = { claude_code_version: '2.1.318', commands: [{ name: 'builtin-help', builtin: true }] }
const summary = () => ({ skills: { totalSkills: 1, includedSkills: 1, skillFrontmatter: [{ name: 'builtin-help', source: 'built-in', tokens: 1 }] }, apiUsage: null })
const bridgeRow = (identity = bridge) => ({ name: 'boai', source: 'dynamic', scope: 'dynamic', status: 'connected', config: { type: identity.type, url: identity.url, headers: { Authorization: identity.authorization } } })
const signal = () => new AbortController().signal
const read = (servers: unknown[] = [], usage: unknown = summary()) => vi.fn(async (request: ClaudeCapabilityRequest) => structuredClone(request.subtype === 'mcp_status' ? { mcpServers: [bridgeRow(), ...servers] } : usage))
async function root() { const path = await realpath(await mkdtemp(join(tmpdir(), 'boai-claude-capability-'))); cleanup.push(() => rm(path, { recursive: true, force: true })); return path }

it('compares two complete snapshots, excludes only the exact bridge and returns opaque native targets without credentials', async () => {
  const directory = await root(); await writeFile(join(directory, 'SKILL.md'), '---\nname: project-method\ndescription: Current input.\n---\nRead current values.\n')
  const usage = summary(); usage.skills.totalSkills = 2; usage.skills.includedSkills = 2
  const request = read([
    { name: 'native-api', source: 'plugin', scope: 'dynamic', status: 'connected', config: { type: 'http', url: 'https://native.test/mcp?token=PRIVATE_URL', headers: { Authorization: 'PRIVATE_HEADER' } } },
    { name: 'native-command', source: 'user', scope: 'user', status: 'connected', config: { type: 'stdio', command: '/usr/bin/node', args: ['server.js', '--credential', 'PRIVATE_ARGUMENT'], env: { TOKEN: 'PRIVATE_ENV' } } },
  ], { ...usage, skills: { ...usage.skills, skillFrontmatter: [...usage.skills.skillFrontmatter, { name: 'project-method', source: 'projectSettings', path: join(directory, 'SKILL.md') }] } })
  const actual = await collectClaudeCapabilityInventory(request, { initialization: { ...initialization, commands: [...initialization.commands, { name: 'project-method', aliases: ['method-alias'] }] }, bridge, signal: signal() })
  expect(actual.skills.complete).toBe(true); expect(actual.sources.complete).toBe(true)
  expect(actual.skills.items).toEqual(expect.arrayContaining([{ name: 'builtin-help', builtin: true }, expect.objectContaining({ name: 'method-alias', path: directory, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) })]))
  expect(actual.sources.items).toEqual(expect.arrayContaining([{ name: 'native-api', target: { transport: 'identity', hash: nativeCapabilityTargetIdentity({ transport: 'http', url: 'https://native.test/mcp?token=PRIVATE_URL' }) } }]))
  expect(JSON.stringify(actual)).not.toMatch(/PRIVATE_|Authorization|headers|args|env/)
  expect(request.mock.calls.map(([value]) => value)).toEqual([{ subtype: 'mcp_status' }, { subtype: 'get_context_usage', detail: 'summary' }, { subtype: 'mcp_status' }, { subtype: 'get_context_usage', detail: 'summary' }])
})

it.each(['auth', 'url', 'source', 'extra-header', 'missing', 'duplicate'] as const)('rejects a %s bridge identity mismatch even for a skill-only package', async kind => {
  const row = bridgeRow()
  if (kind === 'auth') row.config.headers.Authorization = 'PRIVATE_WRONG'
  if (kind === 'url') row.config.url = 'http://127.0.0.1:49124/mcp'
  if (kind === 'source') row.source = 'plugin'
  if (kind === 'extra-header') Object.assign(row.config.headers, { 'x-extra': 'PRIVATE_EXTRA' })
  const request = vi.fn(async (value: ClaudeCapabilityRequest) => value.subtype === 'mcp_status' ? { mcpServers: kind === 'missing' ? [] : kind === 'duplicate' ? [row, row] : [row] } : summary())
  const actual = await collectClaudeCapabilityInventory(request, { initialization, bridge, signal: signal() })
  expect(actual.skills.complete).toBe(false); expect(actual.sources.complete).toBe(false)
  expect(JSON.stringify(actual)).not.toContain('PRIVATE_')
})

it('rejects manual-only commands omitted from context rather than accepting totalSkills as all installed skills', async () => {
  const actual = await collectClaudeCapabilityInventory(read(), { initialization: { ...initialization, commands: [...initialization.commands, { name: 'manual-only' }] }, bridge, signal: signal() })
  expect(actual.skills.complete).toBe(false)
})

it.each(['missing-path', 'unknown-source', 'incomplete', 'fake-builtin'] as const)('rejects %s skill provenance', async kind => {
  const skill: Record<string, unknown> = { name: 'native-method', source: 'projectSettings' }
  if (kind === 'unknown-source') Object.assign(skill, { source: 'unrecognized', path: '/tmp/SKILL.md' })
  if (kind === 'fake-builtin') Object.assign(skill, { source: 'built-in', pluginId: 'user-package' })
  const usage = { skills: { totalSkills: kind === 'incomplete' ? 2 : 1, includedSkills: 1, skillFrontmatter: [skill] } }
  const actual = await collectClaudeCapabilityInventory(read([], usage), { initialization: { ...initialization, commands: [] }, bridge, signal: signal() })
  expect(actual.skills.complete).toBe(false)
})

it.each([
  { name: 'proxy', source: 'claudeai', status: 'connected', config: { type: 'claudeai-proxy', id: 'private' } },
  { name: 'relative-command', source: 'user', status: 'connected', config: { type: 'stdio', command: 'npx', args: ['server'] } },
  { name: 'disabled-native', source: 'user', status: 'disabled', config: { type: 'http', url: 'https://example.test/mcp' } },
  { name: 'unknown-config', source: 'plugin', status: 'connected' },
])('rejects an unprovable $name MCP target without exposing raw configuration', async row => {
  const actual = await collectClaudeCapabilityInventory(read([row]), { initialization, bridge, signal: signal() })
  expect(actual.sources.complete).toBe(false)
})

it('rejects configuration drift between snapshots without leaking the changed header', async () => {
  let count = 0
  const request = vi.fn(async (value: ClaudeCapabilityRequest) => value.subtype === 'mcp_status' ? { mcpServers: [bridgeRow(), { name: 'native', source: 'user', status: 'connected', config: { type: 'http', url: 'https://example.test/mcp', headers: { Authorization: ++count === 1 ? 'PRIVATE_ONE' : 'PRIVATE_TWO' } } }] } : summary())
  const actual = await collectClaudeCapabilityInventory(request, { initialization, bridge, signal: signal() })
  expect(actual.skills.complete).toBe(false); expect(actual.sources.complete).toBe(false)
  expect(JSON.stringify(actual)).not.toContain('PRIVATE_')
})

it('rejects a changed native skill file after the first snapshot', async () => {
  const directory = await root(), file = join(directory, 'SKILL.md'); await writeFile(file, 'Original method')
  let count = 0
  const request = vi.fn(async (value: ClaudeCapabilityRequest) => {
    if (value.subtype === 'mcp_status') return { mcpServers: [bridgeRow()] }
    if (++count === 2) await writeFile(file, 'Changed method')
    return { skills: { totalSkills: 1, includedSkills: 1, skillFrontmatter: [{ name: 'native-method', source: 'userSettings', path: file }] } }
  })
  const actual = await collectClaudeCapabilityInventory(request, { initialization: { ...initialization, commands: [{ name: 'native-method' }] }, bridge, signal: signal() })
  expect(actual.skills.complete).toBe(false)
})

it('waits for the same process MCP connection without reconnect, reload or full context requests', async () => {
  let count = 0
  const request = vi.fn(async (value: ClaudeCapabilityRequest) => value.subtype === 'mcp_status' ? { mcpServers: [{ ...bridgeRow(), status: ++count === 1 ? 'pending' : 'connected' }] } : summary())
  const actual = await collectClaudeCapabilityInventory(request, { initialization, bridge, signal: signal() })
  expect(actual.sources.complete).toBe(true)
  expect(request.mock.calls).toHaveLength(5)
  expect(request.mock.calls.every(([value]) => value.subtype === 'mcp_status' || value.detail === 'summary')).toBe(true)
})

it('rejects unverified CLI versions before any directory request', async () => {
  const request = read()
  const actual = await collectClaudeCapabilityInventory(request, { initialization: { ...initialization, claude_code_version: '2.1.317' }, bridge, signal: signal() })
  expect(actual.skills.complete).toBe(false); expect(request).not.toHaveBeenCalled()
})

it('correlates reversed and interleaved replies by request identity', async () => {
  const frames: Record<string, any>[] = [], control = createClaudeCapabilityControl(line => { frames.push(JSON.parse(line)) }, signal())
  const first = control.request({ subtype: 'mcp_status' }), second = control.request({ subtype: 'get_context_usage', detail: 'summary' })
  expect(control.accept({ subtype: 'success', request_id: 'unrelated', response: {} })).toBe(false)
  expect(control.accept({ subtype: 'success', request_id: frames[1].request_id, response: { second: true } })).toBe(true)
  expect(control.accept({ subtype: 'success', request_id: frames[0].request_id, response: { first: true } })).toBe(true)
  expect(await first).toEqual({ first: true }); expect(await second).toEqual({ second: true }); control.close()
})

it('cancels and times out outstanding controls, consumes late replies and never resumes their continuation', async () => {
  for (const mode of ['cancel', 'timeout']) {
    const frames: Record<string, any>[] = [], controller = new AbortController(), control = createClaudeCapabilityControl(line => { frames.push(JSON.parse(line)) }, controller.signal, 5)
    const continued = vi.fn(), promise = control.request({ subtype: 'mcp_status' }).then(continued)
    const rejected = expect(promise).rejects.toThrow('目录')
    if (mode === 'cancel') controller.abort(); else await new Promise(resolve => setTimeout(resolve, 15))
    await rejected
    expect(control.accept({ subtype: 'success', request_id: frames[0].request_id, response: {} })).toBe(true)
    expect(continued).not.toHaveBeenCalled(); control.close()
  }
})

async function conversation(mode: 'valid' | 'invalid' | 'cancel' | 'none' | 'question' | 'cancel-question' | 'replaced-config') {
  const directory = await root(), executable = join(directory, 'fake-claude.mjs')
  await writeFile(executable, '#!/usr/bin/env node\n'); await chmod(executable, 0o700)
  const program = inspectProgram(executable), controller = new AbortController(), sent: Record<string, any>[] = [], nativeEvents: unknown[] = []
  const guard = vi.fn(async (inventory: Awaited<ReturnType<typeof collectClaudeCapabilityInventory>>) => { if (!inventory.skills.complete || !inventory.sources.complete) throw new Error('unproven ownership') })
  const onSubmitted = vi.fn(async () => {})
  let questionSent = false, lateReply: (() => void) | undefined
  const requestNativeAction = vi.fn(async () => {
    if (mode === 'cancel-question') { controller.abort(new Error('cancelled during native question')); lateReply?.(); throw new Error('cancelled') }
    return { answers: { 'Which input?': ['December'] } }
  })
  vi.mocked(runClaudeProcess).mockImplementation(async options => {
    const configPath = options.args[options.args.indexOf('--mcp-config') + 1], originalConfig = await readFile(configPath, 'utf8')
    const configuration = JSON.parse(originalConfig).mcpServers.boai
    const identity: ClaudeCapabilityBridgeIdentity = { type: 'http', url: configuration.url, authorization: configuration.headers.Authorization }
    if (mode === 'replaced-config') await writeFile(configPath, JSON.stringify({ mcpServers: { boai: { ...configuration, headers: { Authorization: 'WRONG' } } } }))
    const sessionId = options.args[options.args.indexOf('--session-id') + 1]
    try { await new Promise<void>((resolve, reject) => {
      let chain = Promise.resolve(), finished = false
      const finish = (error?: unknown) => { if (finished) return; finished = true; options.signal.removeEventListener('abort', abort); error ? reject(error) : resolve() }
      const abort = () => finish(options.signal.reason)
      options.signal.addEventListener('abort', abort, { once: true })
      const deliver = (frame: unknown) => { chain = chain.then(async () => { await options.onLine(JSON.stringify(frame)) }).catch(finish) }
      options.onReady!(line => {
        const frame = JSON.parse(line); sent.push(frame)
        if (frame.type === 'control_request') {
          if (frame.request.subtype === 'initialize') deliver({ type: 'control_response', response: { subtype: 'success', request_id: frame.request_id, response: initialization } })
          else {
            deliver({ type: 'keep_alive' })
            const response = frame.request.subtype === 'mcp_status' ? { mcpServers: [bridgeRow({ ...identity, ...(['invalid', 'replaced-config'].includes(mode) ? { authorization: 'WRONG' } : {}) })] } : summary()
            if (['question', 'cancel-question'].includes(mode) && !questionSent) {
              questionSent = true
              lateReply = () => deliver({ type: 'control_response', response: { subtype: 'success', request_id: frame.request_id, response } })
              deliver({ type: 'control_request', request_id: 'fixture-question', request: { subtype: 'can_use_tool', tool_use_id: 'fixture-question-tool', tool_name: 'AskUserQuestion', input: { questions: [{ question: 'Which input?' }] } } })
              return
            }
            if (mode === 'cancel') controller.abort(new Error('cancelled during ownership read'))
            deliver({ type: 'control_response', response: { subtype: 'success', request_id: frame.request_id, response } })
          }
        } else if (frame.type === 'control_response' && frame.response.request_id === 'fixture-question') {
          expect(frame.response.response.updatedInput.answers).toEqual({ 'Which input?': 'December' })
          lateReply?.()
        } else if (frame.type === 'user') {
          if (mode !== 'none') expect(guard).toHaveBeenCalledTimes(1)
          deliver({ type: 'result', subtype: 'success', session_id: sessionId, result: 'fixture result' })
          deliver({ type: 'system', subtype: 'session_state_changed', session_id: sessionId, state: 'idle' })
        }
      }, () => finish())
    }) } finally { if (mode === 'replaced-config') await writeFile(configPath, originalConfig) }
    for (const flag of ['--bare', '--strict-mcp-config', '--setting-sources', '--disable-slash-commands']) expect(options.args).not.toContain(flag)
    return { exitCode: 0, bytesReceived: 0 } as Awaited<ReturnType<typeof runClaudeProcess>>
  })
  const context = { runtimeProfile: { id: 'fixture', executable: program.path, executableHash: program.hash, runtime: 'node', useExistingLogin: true, verified: { version: '2.1.318' } }, runtimeDirectory: { cwd: join(directory, 'work'), privateHome: join(directory, 'private') }, signal: controller.signal, agent: { modelId: '' }, runId: 'fixture-run', onDelta: async () => {}, requestNativeAction, onNativeExecution: async (value: unknown) => { nativeEvents.push(value) }, ...(mode === 'none' ? {} : { assertNativeCapabilities: guard }) } as unknown as EngineContext
  const result = runClaudeConversation(context, { instructions: 'Current test input only.', prompt: 'Read current test input.', images: [], tools: [{ name: 'fixture_tool', description: 'Controlled fixture', inputSchema: { type: 'object' }, execute: async () => ({ ok: true }) }], onSession: async () => {}, onSubmitted })
  if (mode === 'valid' || mode === 'none' || mode === 'question') expect(await result).toEqual({ text: 'fixture result' })
  else await expect(result).rejects.toThrow(['invalid', 'replaced-config'].includes(mode) ? 'unproven ownership' : 'cancelled')
  expect(JSON.stringify(nativeEvents)).not.toMatch(/PRIVATE_|Authorization|headers/)
  return { sent, guard, onSubmitted, requestNativeAction }
}

it('runs the production pre-prompt guard with interleaved notifications and preserves original native flags', async () => {
  const actual = await conversation('valid')
  expect(actual.sent.filter(frame => frame.type === 'user')).toHaveLength(1)
  expect(actual.onSubmitted).toHaveBeenCalledTimes(1)
})
it.each(['invalid', 'cancel'] as const)('sends no prompt or submission receipt after %s ownership preparation', async mode => {
  const actual = await conversation(mode)
  expect(actual.sent.filter(frame => frame.type === 'user')).toEqual([])
  expect(actual.onSubmitted).not.toHaveBeenCalled()
})
it('adds no capability control queries to a native run without active package bindings', async () => {
  const actual = await conversation('none')
  expect(actual.sent.filter(frame => frame.type === 'control_request').map(frame => frame.request.subtype)).toEqual(['initialize'])
  expect(actual.guard).not.toHaveBeenCalled()
})
it('keeps AskUserQuestion requests and their replies on the original reader while inventory is pending', async () => {
  const actual = await conversation('question')
  expect(actual.requestNativeAction).toHaveBeenCalledTimes(1)
  expect(actual.sent.some(frame => frame.type === 'control_response' && frame.response.request_id === 'fixture-question')).toBe(true)
  expect(actual.sent.filter(frame => frame.type === 'user')).toHaveLength(1)
})
it('ignores the late inventory reply after cancellation inside a pending native question', async () => {
  const actual = await conversation('cancel-question')
  expect(actual.requestNativeAction).toHaveBeenCalledTimes(1)
  expect(actual.sent.filter(frame => frame.type === 'user')).toEqual([])
  expect(actual.onSubmitted).not.toHaveBeenCalled()
})
it('rejects a replaced config file identity using the bridge authority held at creation', async () => {
  const actual = await conversation('replaced-config')
  expect(actual.sent.filter(frame => frame.type === 'user')).toEqual([])
  expect(actual.onSubmitted).not.toHaveBeenCalled()
})

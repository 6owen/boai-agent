/*
 * [OUTPUT]: API切本机默认遵循原生权限，保留明确思考配置而不继承API只读限制。
 * [OUTPUT]: API空模型继承连接默认值，默认模型更新后动态跟随，显式覆盖不受影响。
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [OUTPUT]: 三协议本机网关无需伪造私钥，远程缺凭据或公开标识误用不能提交。
 * [OUTPUT]: 2026-10-10 核对Claude来源与宿主同规则、不自动回退及Codex/API混绑拒绝。
 * [INPUT]: 全局模型选择合同与隔离API/本机配置。
 * [OUTPUT]: 明确API来源不受列表顺序影响，本机按实际协议而非品牌绑定，失效/未测试/不适用连接拒绝提交且不自动回退。
 * [POS]: tests/agent-model-selection.test.ts；纯模块回归，不执行外部程序或E2E。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, it } from 'vitest'
import type { Connection, LaunchProfile } from '../src/shared/domain'
import { agentModelConnections, agentModelLabel, agentModelSelectionReady, agentRunMode, changeAgentRunMode, selectAgentProfile, type AgentModelSelection } from '../src/renderer/components/employee/agent-model-selection'

const connections: Connection[] = [
  { id: 'first', name: '日常连接', provider: 'openai', baseUrl: '', defaultModel: 'default-a', hasApiKey: true },
  { id: 'chosen', name: '项目连接', provider: 'anthropic', baseUrl: '', defaultModel: 'default-b', hasApiKey: true },
]
const selected: AgentModelSelection = { executionBackend: { kind: 'mastra-model' }, connectionId: 'chosen', modelId: 'explicit-model' }
const profile = (id: string, protocol: LaunchProfile['protocol'], name = id): LaunchProfile => ({ id, name, protocol, executable: '/fixture/program', args: [], hostAccessAcknowledged: true, useExistingLogin: false, revision: 1, executableHash: 'fixture', verified: { name, version: 'fixture', protocolVersion: 1, checkedAt: '2026-10-08T00:00:00Z' } })

it('keeps the selected API and explicit model when connection order changes, and never substitutes a deleted connection', () => {
  for (const list of [connections, [...connections].reverse()]) {
    expect(agentModelSelectionReady(selected, list, [])).toBe(true)
    expect(agentModelLabel(selected, list, [])).toBe('项目连接 · explicit-model')
  }
  expect(agentModelSelectionReady(selected, connections.slice(0, 1), [])).toBe(false)
  expect(agentModelLabel(selected, connections.slice(0, 1), [])).toBe('模型 API · 请选择连接')
  expect(selected.connectionId).toBe('chosen')
})

it('requires an explicit local choice and does not silently pick an installed program', () => {
  const draft = changeAgentRunMode(selected, 'local')
  expect(agentRunMode(draft)).toBe('local')
  expect(agentModelSelectionReady(draft, connections, [profile('available', 'codex-app-server')])).toBe(false)
  expect(changeAgentRunMode(draft, 'api')).toEqual(selected)
})

it('binds native and ACP configurations by their protocol, even when names are identical or mention another brand', () => {
  for (const [protocol, kind] of [['codex-app-server', 'codex-local'], ['claude-cli', 'claude-local'], ['acp', 'acp-local'], [undefined, 'acp-local']] as const) {
    const saved = profile(`${kind}-${protocol ?? 'legacy'}`, protocol, 'Pi / omp / Codex 自定义连接')
    const choice = selectAgentProfile(selected, saved)
    expect(agentRunMode(choice)).toBe('local')
    expect(choice.executionBackend).toEqual({ kind, profileId: saved.id })
    expect(agentModelSelectionReady(choice, connections, [saved])).toBe(true)
    expect(agentModelLabel(choice, connections, [saved])).toBe(saved.name)
    expect(choice.connectionId).toBe(kind === 'claude-local' ? 'chosen' : '')
  }
})

it('rejects stale, untested and protocol-mismatched profiles without rebinding to another available one', () => {
  const saved = profile('selected', 'codex-app-server'), choice = selectAgentProfile(selected, saved)
  expect(agentModelSelectionReady(choice, connections, [profile('other', 'codex-app-server')])).toBe(false)
  expect(agentModelSelectionReady(choice, connections, [{ ...saved, verified: undefined }])).toBe(false)
  expect(agentModelSelectionReady(choice, connections, [{ ...saved, protocol: 'acp' }])).toBe(false)
  expect(choice.executionBackend).toEqual({ kind: 'codex-local', profileId: 'selected' })
})

it('prevents task-only profiles for incompatible employees while preserving native choices and explicit API requirements', () => {
  const acp = profile('task-only', 'acp'), native = profile('native', 'codex-app-server'), claude = profile('api-backed', 'claude-cli')
  expect(agentModelSelectionReady(selectAgentProfile(selected, acp), connections, [acp], false)).toBe(false)
  expect(agentModelSelectionReady(selectAgentProfile(selected, native), [], [native], false)).toBe(true)
  expect(agentModelSelectionReady(selectAgentProfile(selected, claude), [], [claude], false)).toBe(false)
  expect(agentModelSelectionReady(selectAgentProfile(selected, claude), connections, [claude], false)).toBe(true)
})

it('accepts an explicit model on a configured connection and refuses missing model or credentials', () => {
  const noDefault = connections.map(connection => ({ ...connection, defaultModel: '' }))
  expect(agentModelSelectionReady(selected, noDefault, [])).toBe(true)
  expect(agentModelSelectionReady({ ...selected, modelId: '' }, noDefault, [])).toBe(false)
  expect(agentModelSelectionReady(selected, noDefault.map(connection => ({ ...connection, hasApiKey: false })), [])).toBe(false)
})

it('exposes only host-accepted Claude API sources and never enables a Codex/API mixed binding', () => {
  const claude = profile('claude', 'claude-cli'), choice = selectAgentProfile(selected, claude)
  const deepseek = { ...connections[0], id: 'deepseek', provider: 'openai-compatible' as const, baseUrl: 'https://api.deepseek.com/v1' }
  expect(agentModelConnections(choice, [...connections, deepseek]).map(item => item.id)).toEqual(['chosen', 'deepseek'])
  expect(agentModelSelectionReady({ ...choice, connectionId: 'first' }, connections, [claude])).toBe(false)
  expect(agentModelSelectionReady({ ...choice, connectionId: 'deepseek' }, [deepseek], [claude])).toBe(true)
  const codex = profile('codex', 'codex-app-server')
  expect(agentModelSelectionReady({ ...selectAgentProfile(selected, codex), connectionId: 'chosen' }, connections, [codex])).toBe(false)
})

it.each(['chat', 'responses', 'messages'] as const)('accepts the configured local Magpie %s source without a fake private key', protocol => {
  const connection: Connection = { id: 'gateway', name: 'Magpie', provider: protocol === 'messages' ? 'anthropic' : 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'vendor/model', hasApiKey: false, gateway: { kind: 'magpie', protocol, auth: 'local' } }
  const value = { ...selected, connectionId: connection.id }
  expect(agentModelSelectionReady(value, [connection], [])).toBe(true)
  expect(agentModelSelectionReady(value, [{ ...connection, baseUrl: 'https://remote.test' }], [])).toBe(false)
  expect(agentModelSelectionReady(value, [{ ...connection, gateway: { ...connection.gateway!, auth: 'key' } }], [])).toBe(false)
})


it('plugin model sources require the tested protocol capability and preserve native-only compatibility', () => {
  const saved = { ...profile('plugin', 'runtime-plugin'), runtimePlugin: { pluginId: 'boai.runtime.pi', providerId: 'pi', packageHash: 'fixture' } }
  const choice = selectAgentProfile(selected, saved)
  const gateway: Connection = { id: 'gateway', name: 'Magpie', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'vendor/model', hasApiKey: false, gateway: { kind: 'magpie', protocol: 'chat', auth: 'local' } }
  expect(agentModelSelectionReady(choice, [], [saved])).toBe(true)
  expect(agentModelSelectionReady({ ...choice, connectionId: gateway.id }, [gateway], [saved])).toBe(false)
  const capable = { ...saved, verified: { ...saved.verified!, modelSource: { protocols: ['chat' as const] } } }
  expect(agentModelConnections(choice, [...connections, gateway], capable)).toEqual([gateway])
  expect(agentModelSelectionReady({ ...choice, connectionId: gateway.id }, [gateway], [capable])).toBe(true)
  expect(agentModelSelectionReady({ ...choice, connectionId: gateway.id }, [{ ...gateway, gateway: { ...gateway.gateway!, protocol: 'messages' } }], [capable])).toBe(false)
  expect(agentModelSelectionReady({ ...choice, connectionId: gateway.id }, [], [capable])).toBe(false)
})


it('inherits the selected connection default when the employee model is blank and follows later default changes', () => {
  const inherited = { ...selected, modelId: '' }
  expect(agentModelSelectionReady(inherited, connections, [])).toBe(true)
  expect(agentModelLabel(inherited, connections, [])).toBe('项目连接 · default-b')
  const updated = connections.map(connection => ({ ...connection, defaultModel: 'new-default' }))
  expect(agentModelLabel(inherited, updated, [])).toBe('项目连接 · new-default')
  expect(agentModelLabel(selected, updated, [])).toBe('项目连接 · explicit-model')
  expect(inherited.modelId).toBe('')
})


it.each(['codex-app-server','claude-cli'] as const)('selecting %s starts with native permissions instead of inheriting API restrictions',protocol=>{
 const choice=selectAgentProfile({...selected,executionPermission:'read-only',nativeOptions:{effort:'low',codexSandbox:'read-only',claudePermissionMode:'plan'}},profile('native',protocol))
 expect(choice.executionPermission).toBeUndefined()
 expect(choice.nativeOptions).toMatchObject({useNativePermissions:true,effort:'low'})
})

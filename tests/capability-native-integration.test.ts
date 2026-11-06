/*
 * [INPUT]: Production AppService/SQLite, isolated package files and a copied Codex stdio fixture.
 * [OUTPUT]: Real package skill consumption; source packages explicitly rejected pending safe native inventory; duplicate/unknown skills fail before turn/start; lifecycle/restart recheck ownership.
 * [POS]: WT2 native integration without live models, personal configuration or shared fixture mutations.
 * [PROTOCOL]: Changes update Header and tests/.folder.md through its owner.
 */
import { afterEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { AppService } from '../packages/runtime/src/service'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message, Snapshot } from '../packages/shared/src/domain'
import type { ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { CapabilityBinding, CapabilityInspection, CapabilityInstallation, CapabilityOperation } from '../packages/shared/src/domain/capability-packages'
import type { SkillDetail } from '../packages/shared/src/domain/skills'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function restoreDirectory() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-capability-restored-')))
  cleanup.unshift(() => rm(root, { recursive: true, force: true }))
  return root
}
const skillText = '---\nname: quarterly-expenses\ndescription: Reconcile the current invoices.\n---\nDeduplicate invoice numbers; use the current account mapping.\n'
type Inventory = { skills?: unknown[]; servers?: Record<string, unknown>; status?: unknown[]; unsupported?: string; malformedSkills?: boolean; pause?: boolean; sourceId?: string; skillId?: string }

async function setup(pureSkill = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-capability-native-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  let sourceCalls = 0, sourceRequests = 0
  const server = createServer((request, response) => {
    sourceRequests++
    let body = ''; request.on('data', chunk => { body += chunk }); request.on('end', () => {
      const frame = body ? JSON.parse(body) : {}
      if (frame.id === undefined) { response.writeHead(202); response.end(); return }
      const result = frame.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'package-fixture', version: '1' } }
        : frame.method === 'tools/list' ? { tools: [{ name: 'echo', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] }
          : (sourceCalls++, { content: [{ type: 'text', text: JSON.stringify({ actualSourceValue: frame.params.arguments.value }) }] })
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }))
    })
  })
  await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready))
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) })
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`
  const executable = join(root, 'codex.mjs')
  let script = await readFile(resolve('tests/fixtures/native-conversation.mjs'), 'utf8')
  const inventoryHandler = `
 if(['skills/list','config/read','mcpServerStatus/list'].includes(method)){
  const inventory=JSON.parse(await readFile(new URL('./native-inventory.json',import.meta.url),'utf8'))
  await appendFile(new URL('./inventory-requests.jsonl',import.meta.url),JSON.stringify({method,params})+'\\n')
  if(inventory.unsupported===method)return send({id,error:{code:-32601,message:'fixture unsupported '+method}})
  if(method==='skills/list'){
   if(inventory.pause)await new Promise(()=>{})
   if(inventory.malformedSkills)return send({id,result:{data:params.cwds.map(cwd=>({cwd,skills:inventory.skills??[]}))}})
   return send({id,result:{data:params.cwds.map(cwd=>({cwd,skills:inventory.skills??[],errors:[]}))}})
  }
  if(method==='config/read')return send({id,result:{config:{mcp_servers:inventory.servers??{},plugins:{}},layers:[]}})
  return send({id,result:{data:inventory.status??[],nextCursor:null}})
 }
`
  script = script.replace(" if(method==='config/read')", inventoryHandler + " if(method==='config/read')")
  script = script.replace(" let reply=await business(prompt,tool)??'普通回复'", `
 let capabilityReply
 if(prompt.messages.at(-1)?.content.includes('CAPABILITY_READ')){
  const inventory=JSON.parse(await readFile(new URL('./native-inventory.json',import.meta.url),'utf8'))
  const listing=await tool('list_skills',{})
  const selected=listing.skills.find(skill=>skill.name==='quarterly-expenses')
  if(!selected)throw Error('bound package skill was not discoverable')
  const skill=await tool('read_skill',{resourceId:selected.resourceId})
  const source=inventory.sourceId?await tool('call_data_source',{sourceId:inventory.sourceId,tool:'echo',arguments:{value:'December marketing invoices'}}):undefined
  await writeFile(new URL('./capability-consumed.json',import.meta.url),JSON.stringify({skill,source,resourceId:selected.resourceId}))
  capabilityReply='Read the current skill'+(source?' and actual source result.':'.')
 }
 if(prompt.messages.at(-1)?.content.includes('CAPABILITY_ABSENT')){
  const inventory=JSON.parse(await readFile(new URL('./native-inventory.json',import.meta.url),'utf8'))
  const listing=await tool('list_skills',{})
  const listed=listing.skills.some(skill=>skill.name==='quarterly-expenses')
  let readDenied=false
  try{await tool('read_skill',{resourceId:inventory.skillId})}catch{readDenied=true}
  await writeFile(new URL('./capability-absent.json',import.meta.url),JSON.stringify({listed,readDenied}))
  if(listed||!readDenied)throw Error('removed package capability is still available')
  capabilityReply='Package capability is unavailable.'
 }
 let reply=capabilityReply??await business(prompt,tool)??'普通回复'`)
  await writeFile(executable, script); await chmod(executable, 0o700)
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(root, 'native-business.mjs'))
  await writeFile(join(root, 'native-version.txt'), '0.167.0')
  let inventory: Inventory = {}
  const setInventory = async (value: Inventory) => { inventory = { ...inventory, ...value }; await writeFile(join(root, 'native-inventory.json'), JSON.stringify(inventory)) }
  await setInventory({})
  const options = { dataPath: root, engine: { run: async () => { throw new Error('native employee must never invoke API engine') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  let service = new AppService(options); await service.init()
  cleanup.push(() => service.close())
  const codexHome = join(root, 'native-home'); await mkdir(codexHome)
  const draft = { name: 'Package native fixture', executable, args: [], protocol: 'codex-app-server', useExistingLogin: true, codexHome, hostAccessAcknowledged: true }
  await service.handle('testLaunchProfileDraft', draft)
  const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
  const agent = await service.handle('saveAgent', { name: '包合同员工', role: '费用核对', instructions: '按当前输入核对', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: 'codex-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true }) as DigitalAgent
  const chat = await service.handle('createConversation', { kind: 'direct', title: '包原生合同', agentIds: [agent.id] }) as Conversation
  let cwd = join(root, 'agents', agent.id, 'workspace', 'sessions', chat.id, 'work')
  const lines = async (path: string): Promise<Record<string, any>[]> => (await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  const op = async <T>(name: string, input: unknown, write = false) => {
    const result = await service.handle('executeApplicationOperation', { operation: `capabilityPackages.${name}`, input, ...(write ? { requestId: randomUUID() } : {}) }) as ApplicationResult
    expect(result.status, JSON.stringify(result)).toBe('succeeded')
    return result.data as T
  }
  const path = join(root, 'input-package'); await mkdir(join(path, 'skills', 'quarterly-expenses'), { recursive: true })
  await writeFile(join(path, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'quarterly-package', version: '1.0.0', repository: 'https://example.test/quarterly-package' }))
  await writeFile(join(path, 'skills/quarterly-expenses/SKILL.md'), skillText)
  if (!pureSkill) await writeFile(join(path, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { invoices: { type: 'streamable-http', url } } }))
  let installationId = ''
  const current = () => op<{ installation: CapabilityInstallation; bindings: CapabilityBinding[] }>('get', { installationId })
  const employee = async () => (await service.handle('snapshot', undefined) as Snapshot).agents.find(value => value.id === agent.id)!
  const installAndBind = async () => {
    const inspection = await op<CapabilityInspection>('inspect', { path })
    const receipt = await op<CapabilityOperation>('install', { path, contentHash: inspection.contentHash }, true)
    expect(receipt.status).toBe('completed'); installationId = receipt.installationId
    const { installation } = await current()
    await op('bind', { installationId, expectedRevision: installation.revision, employeeId: agent.id, expectedConfigVersion: (await employee()).configVersion, expectedBindingRevision: 0, contributionIds: installation.contributions.map(value => value.id) }, true)
    await setInventory({ sourceId: installation.contributions.find(value => value.kind === 'source')?.objectId })
  }
  const enabled = async (value: boolean) => { const { installation } = await current(); await op('setEnabled', { installationId, expectedRevision: installation.revision, enabled: value }, true) }
  const unbind = async () => { const { installation, bindings } = await current(); await op('unbind', { installationId, expectedRevision: installation.revision, employeeId: agent.id, expectedBindingRevision: bindings.find(value => value.employeeId === agent.id)!.revision, expectedConfigVersion: (await employee()).configVersion }, true) }
  const uninstall = async () => { const { installation } = await current(); return op<CapabilityOperation>('uninstall', { installationId, expectedRevision: installation.revision }, true) }
  const send = (content: string) => service.handle('sendMessage', { conversationId: chat.id, content, mentionIds: [], requestId: randomUUID() }) as Promise<Message>
  const wait = async (message: Message) => {
    let detail: ConversationDetail | undefined
    await expect.poll(async () => { detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail; return detail.runs.find(run => run.triggerMessageId === message.id)?.status }, { timeout: 15000 }).toMatch(/^(completed|failed|cancelled|interrupted)$/)
    return { detail: detail!, run: detail!.runs.find(run => run.triggerMessageId === message.id)! }
  }
  const run = async (content = '普通交流') => wait(await send(content))
  return { root, get cwd() { return cwd }, url, agent, chat, current, installAndBind, enabled, unbind, uninstall, employee, setInventory, run, send, wait, lines, sourceCalls: () => sourceCalls, sourceRequests: () => sourceRequests,
    skill: (resourceId: string) => service.handle('getSkillDetail', { resourceId }) as Promise<SkillDetail>,
    backup: (destination: string) => service.backup(destination),
    requests: () => lines(join(root, 'inventory-requests.jsonl')), turns: () => lines(join(cwd, 'native-turn-requests.jsonl')), threads: () => lines(join(cwd, 'native-thread-requests.jsonl')),
    restart: async (dataPath?: string) => {
      if (dataPath && dataPath !== options.dataPath) await service.backup(dataPath)
      await service.close()
      if (dataPath && dataPath !== options.dataPath) { options.dataPath = dataPath; cwd = join(dataPath, 'agents', agent.id, 'workspace', 'sessions', chat.id, 'work') }
      service = new AppService(options); await service.init()
    },
  }
}

it('consumes the original Skill service and refreshes native sessions only when available package capabilities change', async () => {
  const f = await setup(true), nativeSkill = join(f.root, 'unrelated-native-skill')
  await mkdir(nativeSkill); await writeFile(join(nativeSkill, 'SKILL.md'), '---\nname: native-only\ndescription: Preserve this unrelated native capability.\n---\nUse its native implementation.\n')
  await f.setInventory({ skills: [{ name: 'native-only', path: join(nativeSkill, 'SKILL.md'), enabled: true, scope: 'user', pluginId: null }],
    servers: { nativeOther: { command: process.execPath, args: ['unrelated-native-fixture'] } },
    status: [{ name: 'nativeOther', pluginId: null, runtimeStatus: 'connected', httpOrigin: null, tools: {}, resources: [], resourceTemplates: [], authStatus: 'unsupported', toolsError: null }] })
  const before = await f.run()
  expect(before.run.status, before.run.error).toBe('completed')
  expect((await f.requests()).filter(value => value.method === 'skills/list')).toEqual([])
  await f.installAndBind(); await f.enabled(true)
  const first = await f.run('CAPABILITY_READ')
  expect(first.run.status, first.run.error).toBe('completed')
  expect(first.run.backend?.sessionId).not.toBe(before.run.backend?.sessionId)
  const consumed = JSON.parse(await readFile(join(f.root, 'capability-consumed.json'), 'utf8'))
  await f.setInventory({ skillId: consumed.resourceId })
  expect(consumed.skill.content).toBe(skillText)
  expect(consumed.skill.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'SKILL.md' })]))
  expect(consumed.source).toBeUndefined()
  expect(f.sourceCalls()).toBe(0)
  const calls = await f.requests()
  expect(calls.some(value => value.method === 'skills/list' && value.params.forceReload === true && value.params.cwds[0] === f.cwd)).toBe(true)
  expect(calls.some(value => value.method === 'mcpServerStatus/list')).toBe(false)
  const thread = (await f.threads()).at(-1)!.params
  expect(thread.config ?? {}).not.toHaveProperty('mcp_servers')
  const names = thread.dynamicTools.flatMap((value: { tools: { name: string }[] }) => value.tools.map(tool => tool.name))
  expect(names).toEqual(expect.arrayContaining(['publish_artifact', 'read_skill']))
  await f.enabled(true)
  const unchanged = await f.run()
  expect(unchanged.run.status, unchanged.run.error).toBe('completed')
  expect(unchanged.run.backend?.sessionId).toBe(first.run.backend?.sessionId)
  await f.enabled(false)
  const disabled = await f.run('CAPABILITY_ABSENT')
  expect(disabled.run.status, disabled.run.error).toBe('completed')
  expect(disabled.run.backend?.sessionId).not.toBe(unchanged.run.backend?.sessionId)
  expect(JSON.parse(await readFile(join(f.root, 'capability-absent.json'), 'utf8'))).toEqual({ listed: false, readDenied: true })
  await f.enabled(true)
  const reenabled = await f.run('CAPABILITY_READ')
  expect(reenabled.run.status, reenabled.run.error).toBe('completed')
  expect(reenabled.run.backend?.sessionId).not.toBe(disabled.run.backend?.sessionId)
  await f.unbind()
  const unbound = await f.run('CAPABILITY_ABSENT')
  expect(unbound.run.status, unbound.run.error).toBe('completed')
  expect(unbound.run.backend?.sessionId).not.toBe(reenabled.run.backend?.sessionId)
  expect(JSON.parse(await readFile(join(f.root, 'capability-absent.json'), 'utf8'))).toEqual({ listed: false, readDenied: true })
  expect(f.sourceCalls()).toBe(0)
})

it('rejects the same native skill content under an alias before submitting any user turn', async () => {
  const f = await setup(true); await f.installAndBind(); await f.enabled(true)
  const folder = join(f.root, 'native-alias'); await mkdir(folder); await writeFile(join(folder, 'SKILL.md'), skillText)
  await f.setInventory({ skills: [{ name: 'different-native-alias', path: join(folder, 'SKILL.md'), enabled: true, scope: 'user', pluginId: null }] })
  const result = await f.run('CAPABILITY_READ')
  expect(result.run.status).toBe('failed'); expect(result.run.error).toMatch(/重复|已由.*原生|归属/)
  expect(await f.turns()).toEqual([]); expect(f.sourceCalls()).toBe(0)
})

it.each(['empty', 'duplicate-endpoint', 'opaque-plugin'] as const)('rejects source packages with %s native inventory without opening a discovery manager or submitting input', async scenario => {
  const f = await setup(); await f.installAndBind(); await f.enabled(true)
  if (scenario === 'duplicate-endpoint') await f.setInventory({ servers: { nativeAlias: { url: f.url } }, status: [{ name: 'nativeAlias', pluginId: null, runtimeStatus: 'connected', httpOrigin: new URL(f.url).origin, tools: {}, resources: [], resourceTemplates: [], authStatus: 'unsupported', toolsError: null }] })
  if (scenario === 'opaque-plugin') await f.setInventory({ status: [{ name: 'opaquePlugin', pluginId: 'unknown@marketplace', runtimeStatus: 'connected', httpOrigin: null, tools: {}, resources: [], resourceTemplates: [], authStatus: 'unsupported', toolsError: null }] })
  const result = await f.run('CAPABILITY_READ')
  expect(result.run.status).toBe('failed'); expect(result.run.error).toMatch(/完整|归属/)
  expect((await f.requests()).some(value => value.method === 'mcpServerStatus/list')).toBe(false)
  expect(await f.turns()).toEqual([]); expect(f.sourceCalls()).toBe(0); expect(f.sourceRequests()).toBe(0)
})

it.each(['unsupported', 'malformed'] as const)('fails closed for %s native skill inventory without a user turn', async scenario => {
  const f = await setup(true); await f.installAndBind(); await f.enabled(true)
  await f.setInventory(scenario === 'unsupported' ? { unsupported: 'skills/list' } : { malformedSkills: true })
  const result = await f.run('CAPABILITY_READ')
  expect(result.run.status).toBe('failed'); expect(await f.turns()).toEqual([]); expect(f.sourceCalls()).toBe(0)
})

it('recollects native inventory after restart instead of reusing the prior successful proof', async () => {
  const f = await setup(true); await f.installAndBind(); await f.enabled(true)
  const first = await f.run(); expect(first.run.status, first.run.error).toBe('completed')
  const before = (await f.requests()).filter(value => value.method === 'skills/list').length
  await f.restart()
  const restored = await f.run('CAPABILITY_READ')
  expect(restored.run.status, restored.run.error).toBe('completed')
  expect(JSON.parse(await readFile(join(f.root, 'capability-consumed.json'), 'utf8')).skill.content).toBe(skillText)
  const afterRestart = (await f.requests()).filter(value => value.method === 'skills/list').length
  expect(afterRestart).toBeGreaterThan(before)
  await f.setInventory({ unsupported: 'skills/list' })
  const second = await f.run()
  expect(second.run.status).toBe('failed')
  expect((await f.requests()).filter(value => value.method === 'skills/list').length, second.run.error).toBeGreaterThan(afterRestart)
  expect(await f.turns()).toHaveLength(2)
})

it('cancels ownership collection and submits no user input when the package is disabled during preparation', async () => {
  const f = await setup(true); await f.installAndBind(); await f.enabled(true); await f.setInventory({ pause: true })
  const message = await f.send('CAPABILITY_READ')
  await expect.poll(async () => (await f.requests()).some(value => value.method === 'skills/list'), { timeout: 15000 }).toBe(true)
  await f.enabled(false)
  const result = await f.wait(message)
  expect(['cancelled', 'interrupted', 'failed']).toContain(result.run.status)
  expect(await f.turns()).toEqual([]); expect(f.sourceCalls()).toBe(0)
})

it('restores package-owned skill copies under a different dataPath and consumes the restored file', async () => {
  const f = await setup(true); await f.installAndBind(); await f.enabled(true)
  const resourceId = (await f.employee()).skillIds[0]
  const original = await f.skill(resourceId)
  const { installation } = await f.current()
  const restoredRoot = await restoreDirectory()
  await f.restart(restoredRoot)
  expect(JSON.parse(await readFile(join(restoredRoot, 'capability-packages', installation.id, installation.contentHash, 'package', 'plugin.json'), 'utf8')).name).toBe('quarterly-package')
  await rm(join(f.root, 'skills'), { recursive: true })
  const restored = await f.skill(resourceId)
  expect(restored.resource.path).toBe(join(restoredRoot, 'skills', resourceId, original.resource.name))
  expect(restored.content).toBe(skillText)
  expect((await f.current()).installation.enabled).toBe(false)
  await f.setInventory({ skillId: resourceId })
  const disabled = await f.run('CAPABILITY_ABSENT')
  expect(disabled.run.status, disabled.run.error).toBe('completed')
  expect(JSON.parse(await readFile(join(f.root, 'capability-absent.json'), 'utf8'))).toEqual({ listed: false, readDenied: true })
  await f.enabled(true)
  const result = await f.run('CAPABILITY_READ')
  expect(result.run.status, result.run.error).toBe('completed')
  expect(JSON.parse(await readFile(join(f.root, 'capability-consumed.json'), 'utf8')).skill.content).toBe(skillText)
})

it('backs up and restores a dataPath with no capability installation or package directory', async () => {
  const f = await setup(true), restoredRoot = await restoreDirectory()
  await f.restart(restoredRoot)
  const result = await f.run()
  expect(result.run.status, result.run.error).toBe('completed')
  expect((await f.employee()).skillIds).toEqual([])
})

it('rejects a backup when an installed frozen package snapshot is missing original files', async () => {
  const f = await setup(true); await f.installAndBind()
  const { installation } = await f.current()
  await rm(join(f.root, 'capability-packages', installation.id, installation.contentHash, 'package', 'plugin.json'))
  const destination = await restoreDirectory()
  await expect(f.backup(destination)).rejects.toThrow(/能力包|快照/)
})

it('keeps a customized owned skill after uninstall and restart without restoring package authorization', async () => {
  const f = await setup(true); await f.installAndBind(); await f.enabled(true)
  const resourceId = (await f.employee()).skillIds[0], original = await f.skill(resourceId)
  const customized = skillText + '\nKeep the owner-specific cost-center mapping.\n'
  await writeFile(join(original.resource.path, 'SKILL.md'), customized)
  const receipt = await f.uninstall()
  expect(receipt.status).toBe('completed')
  expect(receipt.retained).toContain(original.resource.path)
  expect((await f.employee()).skillIds).not.toContain(resourceId)
  await f.restart()
  const kept = await f.skill(resourceId)
  expect(kept.resource.path).toBe(original.resource.path)
  expect(kept.content).toBe(customized)
  expect((await f.current()).installation.status).toBe('uninstalled')
  expect((await f.employee()).skillIds).not.toContain(resourceId)
  await f.setInventory({ skillId: resourceId })
  const result = await f.run('CAPABILITY_ABSENT')
  expect(result.run.status, result.run.error).toBe('completed')
  expect(JSON.parse(await readFile(join(f.root, 'capability-absent.json'), 'utf8'))).toEqual({ listed: false, readDenied: true })
})

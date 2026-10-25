/*
 * [OUTPUT]: 删除仅持久移除产品配置并保留员工绑定/聊天/外部文件；已保存和编辑草稿测试期间拒绝删除，避免迟到验证恢复已删配置。
 * [INPUT]: 本地扫描、真实 ACP 客户端、AppService 与隔离登录/可执行夹具。
 * [OUTPUT]: 明确原生Codex目录载入不依赖ACP程序、不执行程序或复制凭据；同账号双协议独立持久化，刷新登录稳定、换账号拒绝。
 * [OUTPUT]: 只读启动项状态即时拒借外改/缺失程序与失效登录目录，保留原配置/验证/工作事实且不调用模型或握手。
 * [OUTPUT]: 短命令自动解析/Node 识别、无执行保存、参数边界/空参数保留、固定路径跨 PATH 变化与重启、拒绝 shell/相对路径；草稿验证继承、失败与未授权隔离、登录来源及会话认证回归。
 * [POS]: tests/local-agent-connections.test.ts；不读取真实登录或调用付费模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LocalConfigDiscovery } from '../apps/electron/src/main/local-configs/discovery'
import { AppService } from '../packages/runtime/src/service'
import { runAcp } from '../packages/runtime/src/adapters/acp/client'
import * as acpClient from '../packages/runtime/src/adapters/acp/client'
import { inspectProgram, resolveProgram } from '../packages/runtime/src/modules/backends/program'
import type { Conversation, DigitalAgent, LaunchProfile, LaunchProfileStatus, Snapshot } from '../packages/shared/src/domain'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.unstubAllEnvs(); for (const close of cleanup.splice(0).reverse()) await close() })

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-local-acp-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'custom-codex'), bin = join(root, 'bin')
  await mkdir(directory); await mkdir(bin)
  const executable = join(bin, 'codex-acp')
  await writeFile(executable, `#!/usr/bin/env node\nprocess.argv.push('--require-codex-home');await import(${JSON.stringify(pathToFileURL(resolve('tests/fixtures/acp-agent.mjs')).href)});\n`)
  await chmod(executable, 0o755)
  const authPath = join(directory, 'auth.json')
  const login = (account = 'fixture-account', access = 'private-access') => writeFile(authPath, JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: account, access_token: access, refresh_token: 'private-refresh' } }))
  await login()
  const discovery = new LocalConfigDiscovery([bin])
  const scan = () => discovery.scan({ directory, userHome: root, env: {} })
  const options = { dataPath: join(root, 'data'), engine: { run: async () => {}, test: async () => 'OK' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  let service = new AppService(options)
  await service.init()
  cleanup.push(() => service.close())
  return { root, directory, bin, executable, authPath, login, discovery, scan, get service() { return service }, restart: async () => { await service.close(); service = new AppService(options); await service.init() } }
}

it('imports login ownership without copying tokens; token refresh is stable but account changes require a rescan', async () => {
  const f = await fixture()
  expect(() => f.discovery.launchProfile('unscanned')).toThrow('先扫描')
  const scanned = f.scan(), id = scanned.logins[0].configId
  expect(scanned.logins[0]).toMatchObject({ authType: 'oauth', acp: { executable: f.executable, runtime: 'node' } })
  expect(JSON.stringify(scanned)).not.toMatch(/private-access|private-refresh/)
  await f.login('fixture-account', 'rotated-access')
  expect(f.scan().logins[0].configId).toBe(id)
  const input = f.discovery.launchProfile(id)
  expect(input).toMatchObject({ codexHome: f.directory, useExistingLogin: true, runtime: 'node', args: [] })
  expect(JSON.stringify(input)).not.toContain('rotated-access')
  const original = await readFile(f.authPath, 'utf8')
  const saved = await f.service.handle('saveLaunchProfile', input) as LaunchProfile
  expect(saved.verified).toBeUndefined()
  expect(await f.service.handle('saveLaunchProfile', input)).toEqual(saved)
  expect(await readFile(f.authPath, 'utf8')).toBe(original)
  await f.restart()
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([saved])
  const repeated = await Promise.all([f.service.handle('saveLaunchProfile', input), f.service.handle('saveLaunchProfile', input)])
  expect(repeated).toEqual([saved, saved])
  await f.login('different-account')
  expect(() => f.discovery.launchProfile(id)).toThrow('源登录已变化')
})

it('only uses a selected installed program and rejects missing programs, empty credentials and replaced executables', async () => {
  const f = await fixture(), discovery = new LocalConfigDiscovery([])
  const result = discovery.scan({ directory: f.directory, env: {} })
  expect(result.logins[0]).not.toHaveProperty('acp')
  expect(() => discovery.launchProfile(result.logins[0].configId)).toThrow('未找到 codex-acp')
  const id = f.scan().logins[0].configId
  await writeFile(f.executable, '#!/usr/bin/env node\nthrow new Error("changed")')
  expect(() => f.discovery.launchProfile(id)).toThrow('ACP 程序已变化')
  await writeFile(f.authPath, JSON.stringify({ auth_mode: 'chatgpt', tokens: {} }))
  expect(f.scan().logins).toEqual([])
  expect(() => f.discovery.launchProfile(id)).toThrow('先扫描')
})

it('keeps an explicitly selected native Codex login without codex-acp or executing the installed program', async () => {
  const f = await fixture(), native = join(f.bin, 'codex')
  await writeFile(native, '#!/usr/bin/env node\nthrow new Error("DIRECTORY_SELECTION_MUST_NOT_EXECUTE")\n')
  await chmod(native, 0o755); await rm(f.executable)
  const scanned = f.scan(), id = scanned.logins[0].configId, source = await readFile(f.authPath, 'utf8')
  expect(scanned.logins[0]).not.toHaveProperty('acp')
  const draft = f.discovery.launchProfile(id, 'codex-app-server')
  expect(draft).toMatchObject({ protocol: 'codex-app-server', executable: native, runtime: 'node', args: [], codexHome: f.directory, localConfigId: id, useExistingLogin: true })
  expect(JSON.stringify(draft)).not.toMatch(/private-access|private-refresh/)
  const saved = await f.service.handle('saveLaunchProfile', draft) as LaunchProfile
  expect(saved).toMatchObject({ protocol: 'codex-app-server', executable: native, codexHome: f.directory })
  expect(saved.verified).toBeUndefined()
  expect(await readFile(f.authPath, 'utf8')).toBe(source)
  expect(await readdir(f.directory)).toEqual(['auth.json'])
  expect((await f.service.handle('snapshot', undefined) as { conversations: unknown[] }).conversations).toEqual([])
})

it('keeps ACP and native profiles separate for one account and rechecks the selected native account after token refresh', async () => {
  const f = await fixture(), native = join(f.bin, 'codex')
  await writeFile(native, '#!/usr/bin/env node\nthrow new Error("SAVE_MUST_NOT_EXECUTE")\n'); await chmod(native, 0o755)
  const id = f.scan().logins[0].configId
  const acp = await f.service.handle('saveLaunchProfile', f.discovery.launchProfile(id)) as LaunchProfile
  await f.login('fixture-account', 'refreshed-native-access')
  const draft = f.discovery.launchProfile(id, 'codex-app-server')
  expect(draft.localConfigId).toBe(id)
  expect(JSON.stringify(draft)).not.toContain('refreshed-native-access')
  const saved = await f.service.handle('saveLaunchProfile', draft) as LaunchProfile
  expect(saved.id).not.toBe(acp.id)
  expect(saved.protocol).toBe('codex-app-server')
  expect(await f.service.handle('saveLaunchProfile', f.discovery.launchProfile(id))).toEqual(acp)
  expect(await f.service.handle('saveLaunchProfile', draft)).toEqual(saved)
  await f.restart()
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([acp, saved])
  await f.login('changed-native-account')
  expect(() => f.discovery.launchProfile(id, 'codex-app-server')).toThrow('源登录已变化')
})

it('does not fall back to an installed ACP program when the explicitly chosen native Codex is unavailable', async () => {
  const f = await fixture(), id = f.scan().logins[0].configId
  expect(() => f.discovery.launchProfile(id, 'codex-app-server')).toThrow('未找到 codex')
  expect(f.discovery.launchProfile(id).executable).toBe(f.executable)
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([])
})

it('tests a session using the selected login directory without a prompt, then executes through the same Node adapter', async () => {
  const f = await fixture(), input = f.discovery.launchProfile(f.scan().logins[0].configId)
  const p = await f.service.handle('saveLaunchProfile', input) as LaunchProfile
  const verified = await f.service.handle('testLaunchProfile', { id: p.id }) as LaunchProfile
  expect(verified.verified?.name).toBe('boai-protocol-fixture')
  expect(await readdir(join(f.root, 'data/external-probes', p.id))).not.toContain('report.txt')
  const output = await runAcp({ profile: verified, cwd: join(f.root, 'task'), signal: new AbortController().signal, prompt: 'Complete a test task', approve: async () => false, onTool: async () => {} })
  expect(output.text).toContain(`CODEX_HOME=${f.directory}`)
  expect(output.text).toContain('KEY=absent')
  expect(output.text).not.toMatch(/private-access|private-refresh/)
  await writeFile(f.authPath, '{}')
  await expect(f.service.handle('testLaunchProfile', { id: p.id })).rejects.toThrow('需要登录')
  expect((await f.service.handle('listLaunchProfiles', undefined) as LaunchProfile[])[0].verified).toBeUndefined()
  await expect(runAcp({ profile: { ...verified, useExistingLogin: false }, cwd: join(f.root, 'private'), signal: new AbortController().signal, approve: async () => false, onTool: async () => {} })).rejects.toMatchObject({ code: -32000 })
})

it('tests an unsaved draft without creating a profile and preserves verification only when explicitly saving the same configuration', async () => {
  const f = await fixture(), input = f.discovery.launchProfile(f.scan().logins[0].configId)
  const verified = await f.service.handle('testLaunchProfileDraft', input) as NonNullable<LaunchProfile['verified']>
  expect(verified.name).toBe('boai-protocol-fixture')
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([])
  expect(await readdir(join(f.root, 'data/external-probes'))).toEqual([])
  const changed = await f.service.handle('saveLaunchProfile', { ...input, args: ['--changed'], localConfigId: undefined }) as LaunchProfile
  expect(changed.verified).toBeUndefined()
  const saved = await f.service.handle('saveLaunchProfile', input) as LaunchProfile
  expect(saved.verified).toEqual(verified)
  await f.restart()
  expect((await f.service.handle('listLaunchProfiles', undefined) as LaunchProfile[]).find(p => p.id === saved.id)?.verified).toEqual(verified)
})

it('does not change a saved profile while testing edits, and rejects stale edits or a changed executable at save time', async () => {
  const f = await fixture(), input = f.discovery.launchProfile(f.scan().logins[0].configId)
  const saved = await f.service.handle('saveLaunchProfile', input) as LaunchProfile
  const edit = { ...input, id: saved.id, expectedRevision: saved.revision, name: 'Edited Agent' }
  await f.service.handle('testLaunchProfileDraft', edit)
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([saved])
  await writeFile(f.executable, (await readFile(f.executable, 'utf8')) + '\n// replaced program identity\n')
  const changed = await f.service.handle('saveLaunchProfile', edit) as LaunchProfile
  expect(changed.verified).toBeUndefined()
  await expect(f.service.handle('saveLaunchProfile', edit)).rejects.toThrow('启动配置已变更')
})

it('requires explicit host permission and does not retain a successful draft result after a later authentication failure', async () => {
  const f = await fixture(), input = f.discovery.launchProfile(f.scan().logins[0].configId)
  await expect(f.service.handle('testLaunchProfileDraft', { ...input, hostAccessAcknowledged: false })).rejects.toThrow()
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([])
  await f.service.handle('testLaunchProfileDraft', input)
  await writeFile(f.authPath, '{}')
  await expect(f.service.handle('testLaunchProfileDraft', input)).rejects.toThrow('需要登录')
  expect(await readdir(join(f.root, 'data/external-probes'))).toEqual([])
  expect((await f.service.handle('saveLaunchProfile', input) as LaunchProfile).verified).toBeUndefined()
})

it('resolves a short command and detects Node without executing on save, retaining literal arguments and the chosen program across PATH changes and restart', async () => {
  const f = await fixture(), argvPath = join(f.root, 'arguments.json')
  const source = await readFile(f.executable, 'utf8')
  await writeFile(f.executable, source.replace('\n', `\nimport { writeFileSync } from 'node:fs';writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(process.argv.slice(2)));\n`))
  vi.stubEnv('PATH', f.bin)
  const input = { name: 'My Codex', executable: 'codex-acp', args: ['path with spaces', '', '$(literal)', 'a"b'], codexHome: f.directory, useExistingLogin: true, hostAccessAcknowledged: true as const }
  const saved = await f.service.handle('saveLaunchProfile', input) as LaunchProfile
  expect(saved).toMatchObject({ executable: f.executable, runtime: 'node', args: input.args, codexHome: f.directory })
  await expect(readFile(argvPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  const edit = { ...input, id: saved.id, expectedRevision: saved.revision }
  const verified = await f.service.handle('testLaunchProfileDraft', edit)
  expect(JSON.parse(await readFile(argvPath, 'utf8'))).toEqual(input.args)
  const updated = await f.service.handle('saveLaunchProfile', edit) as LaunchProfile
  expect(updated.verified).toEqual(verified)
  vi.stubEnv('PATH', join(f.root, 'no-programs'))
  await f.restart()
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([updated])
  await expect(f.service.handle('testLaunchProfile', { id: saved.id })).resolves.toMatchObject({ verified: { name: 'boai-protocol-fixture', version: '1.0.0' } })
})

it('looks up only installed executable files and rejects shell commands, relative paths and shell symlinks without executing anything', async () => {
  const f = await fixture()
  expect(resolveProgram('codex-acp', [f.bin])).toMatchObject({ path: f.executable, runtime: 'node' })
  expect(resolveProgram(f.executable, [])).toMatchObject({ path: f.executable })
  for (const command of ['sh', 'bash -c echo', 'codex-acp --flag', './codex-acp', '../codex-acp', 'codex-acp;echo', '$(codex-acp)']) {
    expect(() => resolveProgram(command, [f.bin])).toThrow()
  }
  expect(() => resolveProgram('missing-agent', [f.bin])).toThrow('未找到 missing-agent')
  const alias = join(f.bin, 'pretend-agent')
  await symlink('/bin/sh', alias)
  expect(() => inspectProgram(alias)).toThrow('不支持 shell')
  expect(() => resolveProgram('pretend-agent', [f.bin])).toThrow('未找到')
})

it('reads one saved program identity without changing verification or executing after external change and removal', async () => {
  const f = await fixture(), saved = await f.service.handle('saveLaunchProfile', f.discovery.launchProfile(f.scan().logins[0].configId)) as LaunchProfile
  const verified = await f.service.handle('testLaunchProfile', { id: saved.id }) as LaunchProfile
  expect(verified.verified).toBeDefined()
  const before = await f.service.handle('snapshot', undefined)
  expect(await f.service.handle('getLaunchProfileStatus', { id: saved.id })).toMatchObject({ profile: verified, status: 'available' })
  await writeFile(f.executable, '#!/usr/bin/env node\nthrow new Error("VIEW_MUST_NOT_EXECUTE");\n')
  expect(await f.service.handle('getLaunchProfileStatus', { id: saved.id })).toMatchObject({ profile: verified, status: 'changed' })
  await rm(f.executable)
  expect(await f.service.handle('getLaunchProfileStatus', { id: saved.id })).toMatchObject({ profile: verified, status: 'unavailable' })
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([verified])
  expect(await f.service.handle('snapshot', undefined)).toEqual(before)
  await expect(f.service.handle('getLaunchProfileStatus', { id: saved.id, executable: '/unapproved' })).rejects.toThrow()
})

it('reports an unavailable configured login directory read-only without clearing the prior handshake', async () => {
  const f = await fixture(), saved = await f.service.handle('saveLaunchProfile', f.discovery.launchProfile(f.scan().logins[0].configId)) as LaunchProfile
  const verified = await f.service.handle('testLaunchProfile', { id: saved.id }) as LaunchProfile
  await rm(f.directory, { recursive: true })
  const status = await f.service.handle('getLaunchProfileStatus', { id: saved.id }) as LaunchProfileStatus
  expect(status.status).toBe('unavailable'); expect(status.profile).toEqual(verified)
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([verified])
})

it('deletes only the saved launch profile, retaining employee identity, chats and external files across restart', async () => {
  const f = await fixture(), input = f.discovery.launchProfile(f.scan().logins[0].configId)
  const saved = await f.service.handle('saveLaunchProfile', input) as LaunchProfile
  const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agentInput } = snapshot.agents[0]
  const employee = await f.service.handle('saveAgent', { ...agentInput, connectionId: '', executionBackend: { kind: 'acp-local', profileId: saved.id } }) as DigitalAgent
  const conversation = await f.service.handle('createConversation', { kind: 'direct', title: '保留原聊天', agentIds: [employee.id] }) as Conversation
  const program = await readFile(f.executable, 'utf8'), login = await readFile(f.authPath, 'utf8')
  await f.service.handle('deleteLaunchProfile', { id: saved.id })
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([])
  expect(await readFile(f.executable, 'utf8')).toBe(program)
  expect(await readFile(f.authPath, 'utf8')).toBe(login)
  await expect(f.service.handle('saveLaunchProfile', { ...input, id: saved.id, expectedRevision: saved.revision })).rejects.toThrow('启动项')
  await expect(f.service.handle('testLaunchProfile', { id: saved.id })).rejects.toThrow('启动项')
  await expect(f.service.handle('sendExternalTask', { conversationId: conversation.id, content: '不能继续使用已删除配置', requestId: 'deleted-profile' })).rejects.toThrow('启动项')
  await f.restart()
  const restored = await f.service.handle('snapshot', undefined) as Snapshot
  expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([])
  expect(restored.agents.find(agent => agent.id === employee.id)).toEqual(employee)
  expect(restored.conversations.find(chat => chat.id === conversation.id)).toMatchObject({ id: conversation.id, agentIds: [employee.id] })
})

it.each(['saved', 'draft'] as const)('rejects deletion while the same profile has an active %s test', async kind => {
  const f = await fixture(), input = f.discovery.launchProfile(f.scan().logins[0].configId)
  const saved = await f.service.handle('saveLaunchProfile', input) as LaunchProfile
  let finish!: () => void, started!: () => void
  const startedPromise = new Promise<void>(resolve => { started = resolve })
  const pending = new Promise<void>(resolve => { finish = resolve })
  const verified = { name: 'controlled-test', version: '1', protocolVersion: 1, checkedAt: new Date().toISOString() }
  const probe = vi.spyOn(acpClient, 'runAcp').mockImplementationOnce(async () => { started(); await pending; return { text: '', verified, sessionId: 'controlled-session' } })
  try {
    const testing = kind === 'saved'
      ? f.service.handle('testLaunchProfile', { id: saved.id })
      : f.service.handle('testLaunchProfileDraft', { ...input, id: saved.id, expectedRevision: saved.revision })
    await startedPromise
    await expect(f.service.handle('deleteLaunchProfile', { id: saved.id })).rejects.toThrow('正在测试')
    expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([saved])
    finish(); await testing
    await f.service.handle('deleteLaunchProfile', { id: saved.id })
    expect(await f.service.handle('listLaunchProfiles', undefined)).toEqual([])
  } finally { finish(); probe.mockRestore() }
})

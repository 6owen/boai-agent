/*
 * [INPUT]: 本地扫描、真实 ACP 客户端、AppService 与隔离登录/可执行夹具。
 * [OUTPUT]: 登录来源身份、无凭据导入、启动项重启去重、Node 启动及会话认证失败回归。
 * [POS]: tests/local-agent-connections.test.ts；不读取真实登录或调用付费模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LocalConfigDiscovery } from '../src/main/local-configs/discovery'
import { AppService } from '../src/runtime/service'
import { runAcp } from '../src/runtime/adapters/acp/client'
import type { LaunchProfile } from '../src/shared/domain'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

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

/*
 * [INPUT]: 隔离安装目录、登录来源及不会执行的程序夹具。
 * [OUTPUT]: 扫描只返回实际程序；原生协议/双登录来源保持，未知协议不冒充ACP，程序或来源变化拒绝陈旧候选。
 * [POS]: tests/agent-program-discovery.test.ts；离线模块测试，不执行外部Agent或读取真实登录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalConfigDiscovery } from '../src/main/local-configs/discovery'
import { localAgentProtocol } from '../src/shared/domain/local-configs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(commands: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'boai-agent-discovery-')); roots.push(root)
  const bin = join(root, 'bin'); await mkdir(bin)
  for (const command of commands) {
    const path = join(bin, command)
    await writeFile(path, '#!/usr/bin/env node\nthrow new Error("DISCOVERY_MUST_NOT_EXECUTE")\n'); await chmod(path, 0o755)
  }
  return { root, bin, discovery: new LocalConfigDiscovery([bin]) }
}

it('reports only actual installed agents and keeps detected unsupported programs unavailable', async () => {
  const f = await fixture(['codex', 'claude', 'pi', 'omp'])
  const scan = f.discovery.scan({ userHome: f.root, env: {} })
  expect(scan.agents?.map(item => item.name)).toEqual(['Codex', 'Claude', 'Pi', 'omp'])
  for (const item of scan.agents!) {
    if (['Pi', 'omp'].includes(item.name)) {
      expect(item).toMatchObject({ availability: 'unsupported' }); expect(item.protocol).toBeUndefined()
      expect(() => f.discovery.detectedProfile(item.candidateId)).toThrow('暂未接入')
    } else {
      const draft = f.discovery.detectedProfile(item.candidateId)
      expect(draft.protocol).toBe(item.name === 'Codex' ? 'codex-app-server' : 'claude-cli')
      expect(draft.useExistingLogin).toBe(item.name === 'Codex')
    }
  }
  expect(new LocalConfigDiscovery([]).scan({ userHome: f.root, env: {} }).agents).toEqual([])
})

it('keeps native and ACP candidates distinct for each selected login without copying credentials', async () => {
  const f = await fixture(['codex', 'codex-acp', 'claude'])
  for (const directory of ['first', 'second']) {
    await mkdir(join(f.root, directory))
    await writeFile(join(f.root, directory, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'one-account', access_token: 'secret-token' } }))
  }
  const result = f.discovery.scan({ directory: f.root, userHome: f.root, env: {} })
  expect(result.agents).toHaveLength(4)
  const native = result.agents!.filter(item => item.protocol === 'codex-app-server')
  expect(new Set(native.map(item => item.localConfigId)).size).toBe(2)
  for (const item of result.agents!) {
    const original = await readFile(item.sourcePath!, 'utf8')
    const draft = f.discovery.detectedProfile(item.candidateId)
    expect(draft.protocol).toBe(item.protocol)
    expect(draft.localConfigId).toBe(item.localConfigId)
    expect(draft.codexHome).toBe(item.sourcePath!.replace(/[\\/]auth\.json$/, ''))
    expect(await readFile(item.sourcePath!, 'utf8')).toBe(original)
  }
  expect(JSON.stringify(result)).not.toContain('secret-token')
  await writeFile(native[0].sourcePath!, '{}')
  expect(() => f.discovery.detectedProfile(native[0].candidateId)).toThrow('源登录已变化')
})

it('rejects a changed or removed program instead of preparing stale scan results', async () => {
  const f = await fixture(['codex', 'claude'])
  const scan = f.discovery.scan({ userHome: f.root, env: {} }), [codex, claude] = scan.agents!
  await writeFile(codex.executable, '#!/usr/bin/env node\nthrow new Error("changed")\n')
  expect(() => f.discovery.detectedProfile(codex.candidateId)).toThrow('程序已变化')
  await rm(claude.executable)
  expect(() => f.discovery.detectedProfile(claude.candidateId)).toThrow('程序已移除')
  f.discovery.scan({ userHome: f.root, env: {} })
  expect(() => f.discovery.detectedProfile(claude.candidateId)).toThrow('重新扫描')
})

it('identifies manual native commands by exact basename while unknown programs stay unresolved', () => {
  expect(localAgentProtocol('codex')).toBe('codex-app-server')
  expect(localAgentProtocol('/usr/local/bin/claude')).toBe('claude-cli')
  expect(localAgentProtocol('codex-acp')).toBe('acp')
  expect(localAgentProtocol('C:\\tools\\codex.exe')).toBe('codex-app-server')
  for (const command of ['pi', 'omp', '/codex/other-agent', 'my-claude', 'codex --help']) expect(localAgentProtocol(command)).toBeUndefined()
})

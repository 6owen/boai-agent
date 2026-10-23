/*
 * [OUTPUT]: 脚本工具库/Node位置变化不改变原生供应商配置身份，普通提供方变量仍敏感。
 * [INPUT]: Isolated native configuration files, environment references and read-only source helpers.
 * [OUTPUT]: Change-sensitive provider identity, CLI transport lease independence, bounded files and directory overrides.
 * [POS]: Offline G2a source contract; actual CLI behavior is verified separately.
 * [PROTOCOL]: Update Header and tests/.folder.md when source coverage changes.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { nativeConfigurationIdentity } from '../src/runtime/adapters/native-source'
import { employeeEnvironment } from '../src/shared/cli/employee-environment'
import { piNativeSourceIdentity, opencodeNativeSourceIdentity } from '../src/runtime/adapters/plugins/native-source'
const roots: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true }) })
async function root() { const value = await mkdtemp(join(tmpdir(), 'boai-native-source-')); roots.push(value); return value }
test('CLI transport leases do not change native provider identity but provider changes still do', async () => {
  const original = { HOME: '/synthetic-home', PRIVATE_PROVIDER_TOKEN: 'provider-a', BOAI_CUSTOM_SOURCE: 'custom-a' }
  const baseline = await nativeConfigurationIdentity([], employeeEnvironment(original))
  for (const run of ['first', 'second']) {
    expect(await nativeConfigurationIdentity([], employeeEnvironment(original, { BOAI_CLI_EMPLOYEE_RUN: run }))).toBe(baseline)
    expect(await nativeConfigurationIdentity([], employeeEnvironment(original, { BOAI_CLI_EMPLOYEE_RUN: run, BOAI_CLI_NODE: `/host/${run}/node`, BOAI_CLI_TOOL_CLIENT: `/host/${run}/employee-tools.mjs` }))).toBe(baseline)
    expect(await nativeConfigurationIdentity([], employeeEnvironment(original, { BOAI_CLI_EMPLOYEE_RUN: run, BOAI_SERVER_URL: `ws://127.0.0.1:${run === 'first' ? 1234 : 4321}`, BOAI_SERVER_TOKEN: `synthetic-${run}` }))).toBe(baseline)
  }
  expect(await nativeConfigurationIdentity([], employeeEnvironment({ ...original, PRIVATE_PROVIDER_TOKEN: 'provider-b' }))).not.toBe(baseline)
  expect(await nativeConfigurationIdentity([], employeeEnvironment({ ...original, BOAI_CUSTOM_SOURCE: 'custom-b' }))).not.toBe(baseline)
})
test('identity captures external file, missing-file creation and custom environment credential changes without exposing any value', async () => {
  const path = join(await root(), 'settings.json'), environment = { HOME: '/synthetic-home', PRIVATE_PROVIDER_TOKEN: 'private-test-a' }
  const absent = await nativeConfigurationIdentity([path], environment)
  expect(await nativeConfigurationIdentity([path], { ...environment, NODE_CHANNEL_FD: '5' })).toBe(absent)
  await writeFile(path, JSON.stringify({ model: 'group/a', key: 'private-file-key' }))
  const first = await nativeConfigurationIdentity([path], environment)
  expect(first).not.toBe(absent); expect(first).toMatch(/^[a-f0-9]{64}$/)
  expect(await nativeConfigurationIdentity([path, path], environment)).toBe(first)
  expect(await nativeConfigurationIdentity([path], { ...environment, PRIVATE_PROVIDER_TOKEN: 'private-test-b' })).not.toBe(first)
  await writeFile(path, JSON.stringify({ model: 'group/b', key: 'private-file-key' }))
  expect(await nativeConfigurationIdentity([path], environment)).not.toBe(first)
})
test('oversized and non-file sources fail before execution without disclosing their paths or content', async () => {
  const directory = await root(), path = join(directory, 'settings.json'); await writeFile(path, Buffer.alloc(2 * 1024 * 1024 + 1))
  for (const value of [directory, path]) await expect(nativeConfigurationIdentity([value], {})).rejects.toThrow('原生配置当前无法稳定核对')
})
test.each(['pi', 'opencode'] as const)('%s directory/file environment overrides are part of the source fence', async provider => {
  const home = await root(), custom = join(home, 'custom'); await mkdir(custom)
  const launch = { executable: '/native', args: [], cwd: home, privateHome: join(home, 'private'), config: {} }
  const file = join(custom, provider === 'pi' ? 'models.json' : 'opencode.json'), environment = { HOME: home, ...(provider === 'pi' ? { PI_CODING_AGENT_DIR: custom } : { OPENCODE_CONFIG: file }) }
  const inspect = provider === 'pi' ? piNativeSourceIdentity : opencodeNativeSourceIdentity
  const absent = await inspect(launch, environment); await writeFile(file, '{"model":"group/a"}')
  const present = await inspect(launch, environment); expect(present).not.toBe(absent)
  // Session/login state is not configuration and must not invalidate every turn.
  await writeFile(join(custom, 'auth.json'), '{"synthetic-token":"new-session-token"}')
  expect(await inspect(launch, environment)).toBe(present)
})

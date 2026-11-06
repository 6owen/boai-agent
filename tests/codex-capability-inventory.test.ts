/*
 * [INPUT]: Real bounded skill trees and controlled replies shaped like installed Codex 0.167.0.
 * [OUTPUT]: Effective inventory never mistakes unsupported, malformed, stale or plugin-only evidence for an empty native surface.
 * [POS]: Codex/package pre-turn collector regression; no model, personal configuration or native capabilities are altered.
 * [PROTOCOL]: Changes must update this Header; tests directory index is maintained by its designated owner.
 */
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test, vi } from 'vitest'
import { collectCodexCapabilityInventory, readCodexCapabilityConfig, readCodexCapabilitySkills } from '../packages/runtime/src/adapters/codex/capability-inventory'
import { inspectResourceTree } from '../packages/runtime/src/modules/resources/local-resources'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'boai-native-inventory-'))); roots.push(cwd)
  const input = { cwd, threadId: 'actual-thread', signal: new AbortController().signal }
  const skills: Record<string, unknown> = { data: [{ cwd, skills: [], errors: [] }] }
  const config: Record<string, unknown> = { mcp_servers: {} }
  const request = vi.fn(async (method: string, _params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (method === 'skills/list') return skills
    if (method === 'config/read') return { config }
    throw new Error(`Unexpected RPC ${method}`)
  })
  const addSkill = async (name = 'native-skill') => {
    const root = join(cwd, name); await mkdir(root)
    await writeFile(join(root, 'SKILL.md'), `---\nname: ${name}\ndescription: Synthetic inventory fixture\n---\nOnly a local fixture.\n`)
    const item = { name, path: join(root, 'SKILL.md'), enabled: true, pluginId: null }
    ;(skills.data as { skills: unknown[] }[])[0].skills.push(item)
    return { item, root }
  }
  return { input, skills, config, request, addSkill, collect: async () => {
    const configBeforeThread = await readCodexCapabilityConfig({ request }, input)
    const skillsBeforeThread = await readCodexCapabilitySkills({ request }, input)
    return collectCodexCapabilityInventory({ request }, { ...input, configBeforeThread, skillsBeforeThread })
  } }
}

test('hashes actual enabled skill trees, canonicalizes native root links and preserves equal names', async () => {
  const f = await fixture(), first = await f.addSkill(), second = await f.addSkill('second-root')
  second.item.name = first.item.name
  const link = join(f.input.cwd, 'native-link'); await symlink(first.root, link)
  first.item.path = join(link, 'SKILL.md')
  await writeFile(join(first.root, 'helper.sh'), 'exit 9\n')
  const result = await f.collect()
  expect(result.skills.complete).toBe(true)
  expect(result.skills.items).toEqual([
    { name: 'native-skill', path: first.root, contentHash: (await inspectResourceTree(first.root)).hash },
    { name: 'native-skill', path: second.root, contentHash: (await inspectResourceTree(second.root)).hash },
  ])
  expect(f.request.mock.calls.find(([method]) => method === 'skills/list')?.[1]).toEqual({ cwds: [f.input.cwd], forceReload: true })
  expect(new Set(f.request.mock.calls.map(([method]) => method))).toEqual(new Set(['skills/list', 'config/read']))
})

test('does not read disabled skill files and does not invent missing enabled hashes', async () => {
  const f = await fixture(), skill = await f.addSkill()
  skill.item.enabled = false; await rm(skill.root, { recursive: true })
  expect((await f.collect()).skills).toEqual({ complete: true, items: [] })
  skill.item.enabled = true
  expect((await f.collect()).skills).toEqual({ complete: false, items: [{ name: 'native-skill', path: skill.item.path }] })
})

test.each(['wrong cwd', 'scan error', 'missing enabled', 'invalid plugin', 'missing plugin', 'relative path', 'missing errors', 'missing data'])('rejects an incomplete skill view: %s', async reason => {
  const f = await fixture(), { item } = await f.addSkill(), entry = (f.skills.data as Record<string, unknown>[])[0]
  if (reason === 'wrong cwd') entry.cwd = dirnameForTest(f.input.cwd)
  if (reason === 'scan error') entry.errors = [{ path: '/unreadable', message: 'denied' }]
  if (reason === 'missing enabled') delete (item as Partial<typeof item>).enabled
  if (reason === 'invalid plugin') (item as Record<string, unknown>).pluginId = 5
  if (reason === 'missing plugin') delete (item as Record<string, unknown>).pluginId
  if (reason === 'relative path') item.path = 'relative/SKILL.md'
  if (reason === 'missing errors') delete entry.errors
  if (reason === 'missing data') delete f.skills.data
  expect((await f.collect()).skills.complete).toBe(false)
})
const dirnameForTest = (path: string) => join(path, '..')

test('a linked file inside a skill tree is unproved, without executing or following it', async () => {
  const f = await fixture(), { root } = await f.addSkill()
  const outside = join(f.input.cwd, 'outside'); await writeFile(outside, 'outside tree')
  await symlink(outside, join(root, 'unsafe'))
  expect((await f.collect()).skills.complete).toBe(false)
})

test.each(['empty config', 'native MCP', 'plugin MCP'])('never initiates MCP discovery for %s without a complete read-only thread inventory', async reason => {
  const f = await fixture()
  if (reason === 'native MCP') f.config.mcp_servers = { existing: { command: '/native', args: ['private-argument'] } }
  if (reason === 'plugin MCP') f.config.plugins = { 'plugin@market': { enabled: true } }
  const result = await f.collect()
  expect(result.sources).toEqual({ complete: false, items: [] })
  expect(f.request.mock.calls.some(([method]) => method.startsWith('mcp') || method.startsWith('plugin/'))).toBe(false)
  expect(JSON.stringify(result)).not.toContain('private-argument')
})

test('pre-thread config snapshot contains no native arguments, URL query or credential values', async () => {
  const f = await fixture()
  f.config.mcp_servers = {
    target: { url: 'https://example.test/mcp?token=private-token', http_headers: { authorization: 'private-header' } },
    stdio: { command: '/private/program', args: ['--token', 'private-argument'], env: { SECRET: 'private-env' } },
  }
  const before = await readCodexCapabilityConfig({ request: f.request }, f.input)
  expect(before).toEqual({ fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(JSON.stringify(before)).not.toMatch(/private|authorization|SECRET|token/)
  f.config.plugins = { 'new@market': { enabled: true } }
  const after = await readCodexCapabilityConfig({ request: f.request }, f.input)
  expect(after?.fingerprint).not.toBe(before?.fingerprint)
})

test.each(['added', 'removed', 'changed file', 'disabled'])('rejects skills %s after the thread baseline', async change => {
  const f = await fixture(), skill = await f.addSkill()
  const skillsBeforeThread = await readCodexCapabilitySkills({ request: f.request }, f.input)
  if (change === 'added') await f.addSkill('new-skill')
  if (change === 'removed') (f.skills.data as { skills: unknown[] }[])[0].skills = []
  if (change === 'changed file') await writeFile(join(skill.root, 'extra.txt'), 'changed after thread start')
  if (change === 'disabled') skill.item.enabled = false
  const result = await collectCodexCapabilityInventory({ request: f.request }, { ...f.input, skillsBeforeThread })
  expect(result.skills.complete).toBe(false)
})

test('missing pre-thread skills cannot be certified by a clean post-thread list', async () => {
  const f = await fixture()
  expect((await collectCodexCapabilityInventory({ request: f.request }, f.input)).skills.complete).toBe(false)
})

test('a present config baseline must still match after the thread boundary', async () => {
  const f = await fixture()
  const configBeforeThread = await readCodexCapabilityConfig({ request: f.request }, f.input)
  const skillsBeforeThread = await readCodexCapabilitySkills({ request: f.request }, f.input)
  f.config.plugins = { 'changed@market': { enabled: true } }
  const result = await collectCodexCapabilityInventory({ request: f.request }, { ...f.input, configBeforeThread, skillsBeforeThread })
  expect(result.skills.complete).toBe(false)
})

test('config RPC failure does not block independent skill proof; unsupported skill RPC remains unproved', async () => {
  const f = await fixture(), original = f.request.getMockImplementation()!
  f.request.mockImplementation(async (method, params) => { if (method === 'config/read') throw new Error('unknown method'); return original(method, params) })
  expect((await f.collect()).skills.complete).toBe(true)
  f.request.mockRejectedValue(new Error('unknown method'))
  expect((await f.collect()).skills.complete).toBe(false)
})

test('cancellation is propagated instead of converted to an empty inventory', async () => {
  const f = await fixture(), controller = new AbortController()
  controller.abort(new Error('stopped'))
  await expect(collectCodexCapabilityInventory({ request: f.request }, { ...f.input, signal: controller.signal })).rejects.toThrow('stopped')
  expect(f.request).not.toHaveBeenCalled()
})

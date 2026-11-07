/*
 * [INPUT]: Existing local MCP/skill asset fixtures, inspected temporary package, and normalized native inventory snapshots.
 * [OUTPUT]: Selected-contribution ownership proof, complete-inventory rejection and credential-free errors without native config writes.
 * [POS]: WT2 pure native ownership tests; does not start Codex, MCP processes, external services or models.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md through its owner.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { CapabilityDefinition, CapabilityInstallation } from '../packages/shared/src/domain/capability-packages'
import { inspectCapabilityPackage } from '../packages/runtime/src/modules/resources/capability-package-inspection'
import { assertNativeCapabilityOwnership, nativeCapabilityTargetIdentity, NativeCapabilityOwnershipError, type NativeCapabilityInventory, type NativeCapabilityOwnershipReason, type NativeCapabilitySkill, type NativeCapabilitySource } from '../packages/runtime/src/modules/resources/capability-native-ownership'

let directory: string, installation: CapabilityInstallation
let skill: Extract<CapabilityDefinition, { kind: 'skill' }>
const fixtureMcp = resolve('tests/fixtures/source-mcp.mjs')
const unrelatedHash = '0'.repeat(64)
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'boai-native-ownership-'))
  await mkdir(join(directory, 'skills', 'test-method'), { recursive: true })
  await writeFile(join(directory, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'test-package', version: '1.0.0', repository: 'https://example.test/package' }))
  await writeFile(join(directory, 'skills/test-method/SKILL.md'), '---\nname: test-method\ndescription: Inspect the supplied fixture.\n---\nRead the local fixture only.')
  await copyFile(resolve('tests/fixtures/skills/index.html'), join(directory, 'skills/test-method/index.html'))
  await writeFile(join(directory, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: {
    local: { type: 'stdio', command: process.execPath, args: [fixtureMcp], env: { SOURCE_TOKEN: '${SOURCE_TOKEN}' } },
    remote: { type: 'streamable-http', url: 'https://native-fixture.example.test/mcp' },
  } }))
  const inspection = await inspectCapabilityPackage(directory)
  installation = { ...inspection, id: 'installation-1', revision: 1, enabled: true, status: 'installed', partial: false, createdAt: '', updatedAt: '', contributions: inspection.definitions.map((value, index) => ({ id: `contribution-${index}`, key: value.key, kind: value.kind, objectId: `object-${index}`, ownership: 'owned', version: inspection.contentHash })) }
  skill = inspection.definitions.find((value): value is Extract<CapabilityDefinition, { kind: 'skill' }> => value.kind === 'skill')!
})
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })
function inventory(skills: NativeCapabilitySkill[] = [], sources: NativeCapabilitySource[] = []): NativeCapabilityInventory { return { owner: 'codex-local', skills: { complete: true, items: skills }, sources: { complete: true, items: sources } } }
function nativeSkill(extra: Partial<NativeCapabilitySkill> = {}): NativeCapabilitySkill { return { name: 'unrelated-native-skill', path: resolve('tests/fixtures/skills'), contentHash: unrelatedHash, ...extra } }
function ids(...keys: string[]) { return keys.map(key => installation.contributions.find(value => value.key === key)!.id) }
function check(value: unknown, keys = ['skill:test-method'], owner = 'codex-local') { return assertNativeCapabilityOwnership({ owner, installation, selectedContributionIds: ids(...keys), inventory: value }) }
function expectReason(run: () => void, reason: NativeCapabilityOwnershipReason) {
  let failure: unknown
  try { run() } catch (error) { failure = error }
  expect(failure).toBeInstanceOf(NativeCapabilityOwnershipError)
  expect(failure).toMatchObject({ reason })
}

it('requires no native inventory or owner support when no capability contribution is bound', () => {
  expect(() => assertNativeCapabilityOwnership({ owner: 'claude-local', installation, selectedContributionIds: [] })).not.toThrow()
})
it('rejects unsupported owners and a selected contribution no longer belonging to the installation', () => {
  expectReason(() => check(inventory(), ['skill:test-method'], 'pi-local'), 'unsupported-owner')
  expectReason(() => assertNativeCapabilityOwnership({ owner: 'codex-local', installation, selectedContributionIds: ['missing'], inventory: inventory() }), 'invalid-selection')
})
it.each([undefined, null, { owner: 'codex-local', skills: { complete: false, items: [] } }, { owner: 'codex-local', skills: { complete: true, items: [{}] } }, { owner: 'other-native', skills: { complete: true, items: [] } }])('rejects absent, incomplete or malformed skill enumeration %#', value => {
  expectReason(() => check(value), 'incomplete-inventory')
})
it('requires hashes for all native skills when selecting a skill, but source-only ownership does not require unrelated hashes', () => {
  const native = inventory([nativeSkill({ contentHash: undefined })])
  expectReason(() => check(native), 'incomplete-inventory')
  expect(() => check(native, ['source:local'])).not.toThrow()
  expectReason(() => check(inventory([nativeSkill({ contentHash: 'not-a-hash' })])), 'incomplete-inventory')
})
it('does not require MCP inventory proof for a skill-only binding', () => {
  expect(() => check({ ...inventory([nativeSkill()]), sources: { complete: false, items: [{ name: 'unrelated', target: { transport: 'unknown' } }] } })).not.toThrow()
  const { sources: _sources, ...skillsOnly } = inventory([nativeSkill()])
  expect(() => check(skillsOnly)).not.toThrow()
})
it('rejects a same-name native skill even when path and content differ', () => {
  expectReason(() => check(inventory([nativeSkill({ name: skill.name })])), 'duplicate-capability')
})
it.each(['directory', 'document', 'normalized', 'trailing-separator'])('rejects the canonical original skill path supplied as %s', form => {
  const root = installation.source.path
  const path = form === 'directory' ? join(root, skill.path) : form === 'document' ? join(root, skill.path, 'SKILL.md') : form === 'trailing-separator' ? `${root}/${skill.path}/` : `${root}/${skill.path}/../test-method/SKILL.md`
  expectReason(() => check(inventory([nativeSkill({ path })])), 'duplicate-capability')
})
it('detects a renamed copy from its actual inspected skill content hash', () => {
  expectReason(() => check(inventory([nativeSkill({ contentHash: skill.contentHash })])), 'duplicate-capability')
})
it.each(['test-package', 'test-package@local-marketplace'])('detects the package plugin identity %s in the complete skill enumeration for source-only bindings', pluginId => {
  expectReason(() => check(inventory([nativeSkill({ pluginId, contentHash: undefined })]), ['source:local']), 'duplicate-capability')
})
it('checks only selected contribution identities and leaves unrelated native inventory unchanged', () => {
  const native = inventory([nativeSkill({ name: skill.name, contentHash: skill.contentHash })], [{ name: 'remote', target: { transport: 'http', url: 'https://native-fixture.example.test/mcp' } }])
  const before = structuredClone(native)
  expect(() => check(native, ['source:local'])).not.toThrow()
  expect(native).toEqual(before)
})
it('keeps unrelated native skills and MCPs available without modifying their snapshot', () => {
  const native = inventory([nativeSkill({ pluginId: 'other-package@local' })], [{ name: 'other-tools', pluginId: 'other-package', target: { transport: 'http', url: 'https://native-fixture.example.test/other' } }])
  const before = structuredClone(native)
  expect(() => check(native, installation.definitions.map(value => value.key))).not.toThrow()
  expect(native).toEqual(before)
})
it('compares complete normalized HTTP targets and does not collapse paths or query parameters into host-only matches', () => {
  expectReason(() => check(inventory([], [{ name: 'renamed', target: { transport: 'http', url: 'HTTPS://NATIVE-FIXTURE.EXAMPLE.TEST:443/unused/../mcp' } }]), ['source:remote']), 'duplicate-capability')
  for (const url of ['https://native-fixture.example.test/other', 'https://native-fixture.example.test/mcp?workspace=other']) {
    expect(() => check(inventory([], [{ name: 'unrelated', target: { transport: 'http', url } }]), ['source:remote'])).not.toThrow()
  }
})
it('compares normalized stdio command and all ordered args from the existing source fixture without using secret env', () => {
  const source: NativeCapabilitySource = { name: 'renamed', target: { transport: 'stdio', command: `${dirname(process.execPath)}/./${basename(process.execPath)}`, args: [fixtureMcp] } }
  expectReason(() => check(inventory([], [source]), ['source:local']), 'duplicate-capability')
  expect(() => check(inventory([], [{ ...source, target: { ...source.target as Extract<NativeCapabilitySource['target'], { transport: 'stdio' }>, args: [fixtureMcp, '--different-workspace'] } }]), ['source:local'])).not.toThrow()
  expect(installation.definitions.find(value => value.key === 'source:local')).toMatchObject({ requiredSecrets: ['SOURCE_TOKEN'] })
})
it('rejects an identically named MCP contribution even when wrappers or remote paths differ', () => {
  expectReason(() => check(inventory([], [{ name: 'remote', target: { transport: 'http', url: 'https://other.example.test/wrapped' } }]), ['source:remote']), 'duplicate-capability')
})
it('rejects a native source exposing the same package plugin even when source name and endpoint differ', () => {
  expectReason(() => check(inventory([], [{ name: 'renamed', pluginId: 'test-package@local', target: { transport: 'http', url: 'https://other.example.test/wrapped' } }]), ['source:remote']), 'duplicate-capability')
})
it('rejects incomplete or unknown MCP targets whenever a source contribution is selected', () => {
  expectReason(() => check({ ...inventory(), sources: { complete: false, items: [] } }, ['source:local']), 'incomplete-inventory')
  expectReason(() => check(inventory([], [{ name: 'unrelated', target: { transport: 'unknown' } }]), ['source:local']), 'incomplete-inventory')
  expectReason(() => check({ ...inventory(), sources: { complete: true, items: [{ name: 'unrelated', target: { transport: 'stdio', command: 'node' } }] } }, ['source:local']), 'incomplete-inventory')
})
it('refuses malformed credential-bearing inventory without exposing its contents in errors', () => {
  const marker = 'PRIVATE_FIXTURE_SECRET'
  for (const native of [
    { ...inventory(), privateToken: marker },
    { ...inventory(), sources: { complete: true, items: [{ name: 'unrelated', target: { transport: 'stdio', command: 'node', args: [], env: { TOKEN: marker } } }] } },
    inventory([], [{ name: 'unrelated', target: { transport: 'http', url: `https://user:${marker}@example.test/mcp` } }]),
  ]) {
    let failure: unknown
    try { check(native, ['source:local']) } catch (error) { failure = error }
    expect(failure).toMatchObject({ reason: 'incomplete-inventory' })
    expect(String(failure)).not.toContain(marker)
  }
  expectReason(() => check({ ...inventory(), sources: { complete: false, items: [{ name: 'unrelated', target: { transport: 'unknown' }, privateToken: marker }] } }), 'incomplete-inventory')
})
it('accepts verified Claude built-ins without fabricated paths while rejecting collisions and misattributed built-ins', () => {
  const native = { ...inventory([{ name: 'built-in-method', builtin: true }]), owner: 'claude-local' as const }
  expect(() => check(native, ['skill:test-method', 'source:remote'], 'claude-local')).not.toThrow()
  expectReason(() => check({ ...native, skills: { complete: true, items: [{ name: skill.name, builtin: true }] } }, ['skill:test-method'], 'claude-local'), 'duplicate-capability')
  expectReason(() => check({ ...native, owner: 'codex-local' }), 'incomplete-inventory')
  expectReason(() => check({ ...native, skills: { complete: true, items: [{ name: 'method', builtin: true, pluginId: 'third-party' }] } }, ['skill:test-method'], 'claude-local'), 'incomplete-inventory')
  expectReason(() => check(native), 'incomplete-inventory')
})
it('compares opaque native MCP target identities without retaining endpoint or command credentials', () => {
  const target = { transport: 'http' as const, url: 'https://native-fixture.example.test/mcp' }
  const native = { ...inventory([], [{ name: 'renamed', target: { transport: 'identity' as const, hash: nativeCapabilityTargetIdentity(target) } }]), owner: 'claude-local' as const }
  expect(JSON.stringify(native)).not.toContain(target.url)
  expectReason(() => check(native, ['source:remote'], 'claude-local'), 'duplicate-capability')
  const local = { ...native, sources: { complete: true, items: [{ name: 'other', target: { transport: 'identity' as const, hash: nativeCapabilityTargetIdentity({ transport: 'stdio', command: process.execPath, args: [fixtureMcp] }) } }] } }
  expectReason(() => check(local, ['source:local'], 'claude-local'), 'duplicate-capability')
  expect(() => check(local, ['source:remote'], 'claude-local')).not.toThrow()
})
it('detects native plugin-prefixed contribution names even when their target or content has been modified', () => {
  expectReason(() => check(inventory([nativeSkill({ name: `other:${skill.name}` })])), 'duplicate-capability')
  expectReason(() => check(inventory([], [{ name: 'plugin:other:remote', target: { transport: 'http', url: 'https://other.test/mcp' } }]), ['source:remote']), 'duplicate-capability')
})

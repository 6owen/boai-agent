/*
 * [INPUT]: Selected BOAI package contributions and private Codex/Claude runtime inventories collected before input submission.
 * [OUTPUT]: Selected skill/MCP ownership proof, explicit builtin provenance and opaque target comparison; unrelated native capabilities remain untouched.
 * [POS]: Internal capability/native boundary; pure validation, no native config reads, execution or persistence.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md through its owner.
 */
import { isAbsolute, join, normalize, resolve, basename, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { CapabilityDefinition, CapabilityInstallation } from '@boai/shared/domain/capability-packages'

export type NativeCapabilitySkill = { name: string; path?: string; pluginId?: string; contentHash?: string; builtin?: true }
export type NativeCapabilitySource = { name: string; pluginId?: string; target:
  | { transport: 'stdio'; command: string; args: string[] }
  | { transport: 'http'; url: string }
  | { transport: 'identity'; hash: string }
  | { transport: 'unknown' }
}
/** Collector owns canonical paths/content hashing and must never include credentials or private configuration. */
export type NativeCapabilityInventory = {
  owner: 'codex-local' | 'claude-local'
  skills: { complete: boolean; items: NativeCapabilitySkill[] }
  sources: { complete: boolean; items: NativeCapabilitySource[] }
}
export type NativeCapabilityOwnershipReason = 'unsupported-owner' | 'invalid-selection' | 'incomplete-inventory' | 'duplicate-capability'
export class NativeCapabilityOwnershipError extends Error {
  constructor(readonly reason: NativeCapabilityOwnershipReason, message: string) { super(message); this.name = 'NativeCapabilityOwnershipError' }
}
const label = z.string().trim().min(1).max(4000)
const hash = z.string().regex(/^[a-f0-9]{64}$/i)
const skillSchema = z.object({ name: label, path: label.optional(), pluginId: label.optional(), contentHash: hash.optional(), builtin: z.literal(true).optional() }).strict()
const sourceSchema = z.object({ name: label, pluginId: label.optional(), target: z.discriminatedUnion('transport', [
  z.object({ transport: z.literal('stdio'), command: label, args: z.array(z.string()) }).strict(),
  z.object({ transport: z.literal('http'), url: label }).strict(),
  z.object({ transport: z.literal('identity'), hash }).strict(),
  z.object({ transport: z.literal('unknown') }).strict(),
]) }).strict()
const sourceInventorySchema = z.object({ complete: z.boolean(), items: z.array(sourceSchema) }).strict()
const inventorySchema = z.object({ owner: z.enum(['codex-local', 'claude-local']), skills: z.object({ complete: z.literal(true), items: z.array(skillSchema) }).strict(), sources: sourceInventorySchema.optional() }).strict()
const sourcesSchema = sourceInventorySchema.extend({ complete: z.literal(true) })
const identifier = (value: string) => value.trim().normalize('NFC').toLowerCase()
const invalidInventory = () => new NativeCapabilityOwnershipError('incomplete-inventory', '无法完整确认原生能力归属，请重新读取原生技能与 MCP 清单后再执行。')
const invalidSelection = () => new NativeCapabilityOwnershipError('invalid-selection', '能力包绑定贡献已变化或无法识别，请重新检查绑定。')
const duplicate = () => new NativeCapabilityOwnershipError('duplicate-capability', '同一能力已由原生技能或 MCP 加载，请只保留原生或 BOAI 能力包中的一个归属。')

function skillPath(value: string) {
  if (!isAbsolute(value) || value.includes('\0')) throw invalidInventory()
  const path = resolve(value).normalize('NFC')
  return basename(path).toLowerCase() === 'skill.md' ? dirname(path) : path
}
function originalSkillPath(installation: CapabilityInstallation, definition: Extract<CapabilityDefinition, { kind: 'skill' }>) {
  if (!isAbsolute(installation.source.path) || !definition.path || definition.path.includes('\\') || definition.path.split('/').some(part => !part || part === '.' || part === '..') || isAbsolute(definition.path)) throw invalidSelection()
  return skillPath(join(installation.source.path, definition.path))
}
function samePlugin(pluginId: string | undefined, installation: CapabilityInstallation) {
  if (!pluginId) return false
  const value = identifier(pluginId), packageName = identifier(installation.name), packageId = identifier(installation.packageId)
  return value === packageId || value === packageName || value.split('@', 1)[0] === packageName
}
function httpTarget(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw invalidInventory()
    // Keep the full path and ordered query. Equal hosts alone never establish equal MCP endpoints.
    return url.href.replace(/%[a-f0-9]{2}/gi, encoded => {
      const decoded = String.fromCharCode(Number.parseInt(encoded.slice(1), 16))
      return /^[A-Za-z0-9._~-]$/.test(decoded) ? decoded : encoded.toUpperCase()
    })
  } catch { throw invalidInventory() }
}
export function nativeCapabilityTargetIdentity(target: { transport: 'http'; url: string } | { transport: 'stdio'; command: string; args: string[] }): string {
  let identity: string
  if (target.transport === 'http') identity = `http:${httpTarget(target.url)}`
  else {
    if (target.command.includes('\0') || target.args.some(value => value.includes('\0'))) throw invalidInventory()
    identity = `stdio:${JSON.stringify([normalize(target.command).normalize('NFC'), target.args])}`
  }
  return createHash('sha256').update(identity).digest('hex')
}
function sourceTarget(target: NativeCapabilitySource['target']) {
  if (target.transport === 'unknown') throw invalidInventory()
  return target.transport === 'identity' ? target.hash.toLowerCase() : nativeCapabilityTargetIdentity(target)
}
function definitionTarget(definition: Extract<CapabilityDefinition, { kind: 'source' }>) {
  if (definition.config.type !== 'mcp') throw invalidSelection()
  const mcp = definition.config.mcp
  return sourceTarget(mcp.transport === 'stdio' ? { transport: 'stdio', command: mcp.command, args: mcp.args } : { transport: 'http', url: mcp.url })
}

/** Binding admission is not this proof: call after native thread start/resume, before each turn/start. */
export function assertNativeCapabilityOwnership(input: { owner: string; installation: CapabilityInstallation; selectedContributionIds: readonly string[]; inventory?: unknown }): void {
  const { owner, installation, selectedContributionIds, inventory } = input
  if (!Array.isArray(selectedContributionIds)) throw invalidSelection()
  if (!selectedContributionIds.length) return
  if (!['codex-local', 'claude-local'].includes(owner)) throw new NativeCapabilityOwnershipError('unsupported-owner', '此原生执行器尚不能核对能力包归属，请解除该能力包绑定后再执行。')
  const selected = selectedContributionIds.map(id => {
    const contribution = installation.contributions.find(value => value.id === id)
    const definition = contribution && installation.definitions.find(value => value.key === contribution.key && value.kind === contribution.kind)
    if (!definition) throw invalidSelection()
    return definition
  })
  const parsed = inventorySchema.safeParse(inventory)
  if (!parsed.success || parsed.data.owner !== owner) throw invalidInventory()
  const skills = parsed.data.skills.items
  const selectedSkills = selected.filter((value): value is Extract<CapabilityDefinition, { kind: 'skill' }> => value.kind === 'skill')
  const selectedSources = selected.filter((value): value is Extract<CapabilityDefinition, { kind: 'source' }> => value.kind === 'source')
  // Source-only bindings still inspect complete skill/plugin names, but do not require unrelated skill hashes.
  for (const skill of skills) {
    const builtin = skill.builtin === true
    if (builtin && (owner !== 'claude-local' || skill.path || skill.pluginId || skill.contentHash)) throw invalidInventory()
    const path = builtin ? undefined : skill.path ? skillPath(skill.path) : (() => { throw invalidInventory() })()
    if (!builtin && selectedSkills.length && !skill.contentHash) throw invalidInventory()
    if (samePlugin(skill.pluginId, installation)) throw duplicate()
    for (const definition of selectedSkills) {
      if (!hash.safeParse(definition.contentHash).success) throw invalidSelection()
      if (identifier(skill.name) === identifier(definition.name) || identifier(skill.name.split(':').at(-1)!) === identifier(definition.name) || path === originalSkillPath(installation, definition) || skill.contentHash?.toLowerCase() === definition.contentHash.toLowerCase()) throw duplicate()
    }
  }
  // A skill-only package does not depend on MCP inventory support or target discovery.
  if (!selectedSources.length) return
  const parsedSources = sourcesSchema.safeParse(parsed.data.sources)
  if (!parsedSources.success) throw invalidInventory()
  const sources = parsedSources.data.items.map(source => ({ ...source, normalizedTarget: sourceTarget(source.target) }))
  for (const definition of selectedSources) {
    const target = definitionTarget(definition)
    const sourceName = identifier(definition.key.replace(/^source:/, ''))
    for (const source of sources) {
      if (samePlugin(source.pluginId, installation) || identifier(source.name) === sourceName || identifier(source.name.split(':').at(-1)!) === sourceName || source.normalizedTarget === target) throw duplicate()
    }
  }
}

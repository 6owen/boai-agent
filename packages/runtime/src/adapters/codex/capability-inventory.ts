/*
 * [INPUT]: The actual Codex app-server process and execution cwd, sampled before and after thread start/resume.
 * [OUTPUT]: Bounded effective skill hashes with a stable pre-thread baseline; MCP ownership remains unproved until a read-only runtime inventory is available.
 * [POS]: Native/package ownership collector. No plugin RPC, account read, model call, config write or MCP discovery connection.
 * [PROTOCOL]: Changes must update this Header; directory membership is maintained by its designated owner.
 */
import { realpath, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute } from 'node:path'
import type { CodexClient } from './client'
import type { NativeCapabilityInventory, NativeCapabilitySkill } from '../../modules/resources/capability-native-ownership'
import { inspectResourceTree, RESOURCE_LIMITS } from '../../modules/resources/local-resources'

const maxItems = 2000
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 4000 && !/[\u0000-\u001f\u007f]/.test(value)
const plugin = (value: unknown): value is string | null => value === null || text(value)
const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => object(item) ? Object.fromEntries(Object.entries(object(item)!).sort(([a], [b]) => a.localeCompare(b))) : item)

export type CodexCapabilityConfig = { fingerprint: string }
/** Capture before thread/start or resume. This opaque fingerprint detects drift only; it never proves absence or identity. */
export async function readCodexCapabilityConfig(client: Pick<CodexClient, 'request'>, input: { cwd: string; signal?: AbortSignal }): Promise<CodexCapabilityConfig | undefined> {
  input.signal?.throwIfAborted()
  if (!text(input.cwd) || !isAbsolute(input.cwd)) return
  try {
    const config = object((await client.request('config/read', { cwd: input.cwd, includeLayers: true })).config)
    input.signal?.throwIfAborted()
    const servers = object(config?.mcp_servers)
    if (!servers || Object.keys(servers).length > maxItems) return
    return { fingerprint: createHash('sha256').update(stable({ mcp: servers, plugins: config?.plugins, skills: config?.skills })).digest('hex') }
  } catch { input.signal?.throwIfAborted(); return }
}

/** Force the actual process to discover enabled skills; then hash bounded real trees without running package files. */
export async function readCodexCapabilitySkills(client: Pick<CodexClient, 'request'>, input: { cwd: string; signal?: AbortSignal }): Promise<NativeCapabilityInventory['skills']> {
  const result: NativeCapabilityInventory['skills'] = { complete: false, items: [] }
  input.signal?.throwIfAborted()
  if (!text(input.cwd) || !isAbsolute(input.cwd)) return result
  try {
    const response = await client.request('skills/list', { cwds: [input.cwd], forceReload: true })
    input.signal?.throwIfAborted()
    if (!Array.isArray(response.data) || response.data.length !== 1) return result
    const entry = object(response.data[0])
    if (!entry || !text(entry.cwd) || !isAbsolute(entry.cwd) || await realpath(entry.cwd) !== await realpath(input.cwd) || !Array.isArray(entry.skills) || entry.skills.length > maxItems || !Array.isArray(entry.errors)) return result
    let complete = entry.errors.length === 0, bytes = 0, entries = 0
    const identities = new Set<string>()
    for (const raw of entry.skills) {
      input.signal?.throwIfAborted()
      const skill = object(raw)
      if (!skill || typeof skill.enabled !== 'boolean' || !text(skill.name) || !text(skill.path) || !isAbsolute(skill.path) || !Object.hasOwn(skill, 'pluginId') || !plugin(skill.pluginId)) { complete = false; continue }
      if (!skill.enabled) continue
      const item: NativeCapabilitySkill = { name: skill.name, path: skill.path, ...(skill.pluginId ? { pluginId: skill.pluginId } : {}) }
      result.items.push(item)
      try {
        const path = await realpath(skill.path)
        const info = await stat(path)
        if (!info.isDirectory() && (!info.isFile() || basename(path) !== 'SKILL.md')) throw new Error('Unrecognized native skill path')
        const root = info.isDirectory() ? path : dirname(path)
        const identity = `${root}\0${skill.pluginId ?? ''}\0${skill.name}`
        if (identities.has(identity)) throw new Error('Repeated native skill')
        identities.add(identity)
        // Native linked skill roots are canonicalized, while links inside a tree remain unproved.
        const tree = await inspectResourceTree(root, input.signal)
        bytes += tree.bytes; entries += tree.entries
        if (!tree.files.some(file => file.path === 'SKILL.md') || bytes > RESOURCE_LIMITS.bytes || entries > RESOURCE_LIMITS.entries) throw new Error('Native skill inventory limit')
        item.path = root; item.contentHash = tree.hash
      } catch { input.signal?.throwIfAborted(); complete = false }
      if (bytes > RESOURCE_LIMITS.bytes || entries > RESOURCE_LIMITS.entries) break
    }
    result.complete = complete
  } catch { input.signal?.throwIfAborted() }
  return result
}
const skillIdentity = (skills: NativeCapabilityInventory['skills']) => stable(skills.items.map(item => stable(item)).sort())

/** Keep this result in memory and immediately check ownership before turn/start. An opaque config fence alone is insufficient. */
export async function collectCodexCapabilityInventory(client: Pick<CodexClient, 'request'>, input: { cwd: string; threadId: string; signal?: AbortSignal; configBeforeThread?: CodexCapabilityConfig; skillsBeforeThread?: NativeCapabilityInventory['skills'] }): Promise<NativeCapabilityInventory> {
  input.signal?.throwIfAborted()
  const result: NativeCapabilityInventory = { owner: 'codex-local', skills: { complete: false, items: [] }, sources: { complete: false, items: [] } }
  if (!text(input.cwd) || !isAbsolute(input.cwd) || !text(input.threadId)) return result
  result.skills = await readCodexCapabilitySkills(client, input)
  result.skills.complete = result.skills.complete && input.skillsBeforeThread?.complete === true && skillIdentity(result.skills) === skillIdentity(input.skillsBeforeThread)
  if (input.configBeforeThread) {
    const after = await readCodexCapabilityConfig(client, input)
    result.skills.complete = result.skills.complete && after?.fingerprint === input.configBeforeThread.fingerprint
  }
  // Codex 0.167.0 threadId-only mcpServerStatus/list constructs a discovery manager. It may connect independently.
  // serverName-scoped status reuses the thread, but there is not yet proof that its names cover the entire thread runtime.
  // Do not initiate discovery or expose native command args/URL credentials as an apparent ownership proof.
  input.signal?.throwIfAborted()
  return result
}

/*
 * [OUTPUT]: 两个原生后端沿共同清单字段、指纹和整次读取的技能预算，采样范围及失败语义归各自协议。
 * [INPUT]: The actual Codex app-server process and execution cwd, sampled before and after thread start/resume.
 * [OUTPUT]: Bounded effective skill hashes with a stable pre-thread baseline; MCP ownership remains unproved until a read-only runtime inventory is available.
 * [POS]: Native/package ownership collector. No plugin RPC, account read, model call, config write or MCP discovery connection.
 * [PROTOCOL]: Changes must update this Header; directory membership is maintained by its designated owner.
 */
import { realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute } from 'node:path'
import type { CodexClient } from './client'
import type { NativeCapabilityInventory, NativeCapabilitySkill } from '../../modules/resources/capability-native-ownership'
import { inventoryFingerprint, inventoryRecord, isInventoryLabel, MAX_NATIVE_INVENTORY_ITEMS, NativeSkillTrees, serializeInventory } from '../native-capability-inventory'

const plugin = (value: unknown): value is string | null => value === null || isInventoryLabel(value)

export type CodexCapabilityConfig = { fingerprint: string }
/** Capture before thread/start or resume. This opaque fingerprint detects drift only; it never proves absence or identity. */
export async function readCodexCapabilityConfig(client: Pick<CodexClient, 'request'>, input: { cwd: string; signal?: AbortSignal }): Promise<CodexCapabilityConfig | undefined> {
  input.signal?.throwIfAborted()
  if (!isInventoryLabel(input.cwd) || !isAbsolute(input.cwd)) return
  try {
    const config = inventoryRecord((await client.request('config/read', { cwd: input.cwd, includeLayers: true })).config)
    input.signal?.throwIfAborted()
    const servers = inventoryRecord(config?.mcp_servers)
    if (!servers || Object.keys(servers).length > MAX_NATIVE_INVENTORY_ITEMS) return
    return { fingerprint: inventoryFingerprint({ mcp: servers, plugins: config?.plugins, skills: config?.skills }) }
  } catch { input.signal?.throwIfAborted(); return }
}

/** Force the actual process to discover enabled skills; then hash bounded real trees without running package files. */
export async function readCodexCapabilitySkills(client: Pick<CodexClient, 'request'>, input: { cwd: string; signal?: AbortSignal }): Promise<NativeCapabilityInventory['skills']> {
  const result: NativeCapabilityInventory['skills'] = { complete: false, items: [] }
  input.signal?.throwIfAborted()
  if (!isInventoryLabel(input.cwd) || !isAbsolute(input.cwd)) return result
  try {
    const response = await client.request('skills/list', { cwds: [input.cwd], forceReload: true })
    input.signal?.throwIfAborted()
    if (!Array.isArray(response.data) || response.data.length !== 1) return result
    const entry = inventoryRecord(response.data[0])
    if (!entry || !isInventoryLabel(entry.cwd) || !isAbsolute(entry.cwd) || await realpath(entry.cwd) !== await realpath(input.cwd) || !Array.isArray(entry.skills) || entry.skills.length > MAX_NATIVE_INVENTORY_ITEMS || !Array.isArray(entry.errors)) return result
    let complete = entry.errors.length === 0
    const trees = new NativeSkillTrees()
    const identities = new Set<string>()
    for (const raw of entry.skills) {
      input.signal?.throwIfAborted()
      const skill = inventoryRecord(raw)
      if (!skill || typeof skill.enabled !== 'boolean' || !isInventoryLabel(skill.name) || !isInventoryLabel(skill.path) || !isAbsolute(skill.path) || !Object.hasOwn(skill, 'pluginId') || !plugin(skill.pluginId)) { complete = false; continue }
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
        const contentHash = await trees.contentHash(root, input.signal)
        if (contentHash) { item.path = root; item.contentHash = contentHash }
        else complete = false
      } catch { input.signal?.throwIfAborted(); complete = false }
      if (trees.overBudget) break
    }
    result.complete = complete
  } catch { input.signal?.throwIfAborted() }
  return result
}
const skillIdentity = (skills: NativeCapabilityInventory['skills']) => serializeInventory(skills.items.map(item => serializeInventory(item)).sort())

/** Keep this result in memory and immediately check ownership before turn/start. An opaque config fence alone is insufficient. */
export async function collectCodexCapabilityInventory(client: Pick<CodexClient, 'request'>, input: { cwd: string; threadId: string; signal?: AbortSignal; configBeforeThread?: CodexCapabilityConfig; skillsBeforeThread?: NativeCapabilityInventory['skills'] }): Promise<NativeCapabilityInventory> {
  input.signal?.throwIfAborted()
  const result: NativeCapabilityInventory = { owner: 'codex-local', skills: { complete: false, items: [] }, sources: { complete: false, items: [] } }
  if (!isInventoryLabel(input.cwd) || !isAbsolute(input.cwd) || !isInventoryLabel(input.threadId)) return result
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

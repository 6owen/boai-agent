/*
 * [OUTPUT]: 两个原生后端沿共同清单字段、指纹和整次读取的技能预算，采样范围及失败语义归各自协议。
 * [INPUT]: Claude 2.1.318's same-process read-only control replies and the exact private BOAI bridge identity.
 * [OUTPUT]: Bounded, stable native skill/MCP ownership evidence before a user prompt; opaque targets exclude headers, arguments and credentials.
 * [POS]: Claude capability-package admission only. No configuration writes, plugin reload, account access, discovery process or model requests.
 * [PROTOCOL]: Changes update Header and the owning .folder.md through its designated owner.
 */
import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { inventoryFingerprint, inventoryRecord, isInventoryLabel, MAX_NATIVE_INVENTORY_ITEMS, NativeSkillTrees, serializeInventory } from '../native-capability-inventory'
import { nativeCapabilityTargetIdentity, type NativeCapabilityInventory, type NativeCapabilitySkill, type NativeCapabilitySource } from '../../modules/resources/capability-native-ownership'

export type ClaudeCapabilityRequest = { subtype: 'mcp_status' } | { subtype: 'get_context_usage'; detail: 'summary' }
export type ClaudeCapabilityBridgeIdentity = { type: 'http'; url: string; authorization: string }
type Request = (input: ClaudeCapabilityRequest) => Promise<unknown>
const empty = (): NativeCapabilityInventory => ({ owner: 'claude-local', skills: { complete: false, items: [] }, sources: { complete: false, items: [] } })
const failure = () => new Error('Claude 原生能力目录无法完整核对，未提交本轮消息')

/** Correlates only ownership reads, without blocking the process's serial line reader. */
export function createClaudeCapabilityControl(send: (line: string) => void, signal: AbortSignal, timeoutMs = 10000) {
  const pending = new Map<string, { resolve(value: unknown): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout> }>()
  const retired = new Set<string>()
  let closed = false, requests = 0
  const retire = (id: string) => { retired.add(id); if (retired.size > 128) retired.delete(retired.values().next().value!) }
  const finish = (id: string, value?: unknown, error?: Error) => {
    const entry = pending.get(id); if (!entry) return
    pending.delete(id); clearTimeout(entry.timer); retire(id)
    if (error) entry.reject(error); else entry.resolve(value)
  }
  const close = () => {
    if (closed) return
    closed = true; signal.removeEventListener('abort', close)
    for (const id of pending.keys()) finish(id, undefined, failure())
  }
  signal.addEventListener('abort', close, { once: true }); if (signal.aborted) close()
  return {
    request: (input: ClaudeCapabilityRequest): Promise<unknown> => {
      if (closed || signal.aborted || ++requests > 128 || pending.size >= 4) return Promise.reject(failure())
      const id = randomUUID()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(id, undefined, failure()), timeoutMs); timer.unref()
        pending.set(id, { resolve, reject, timer })
        try { send(JSON.stringify({ type: 'control_request', request_id: id, request: input }) + '\n') }
        catch { finish(id, undefined, failure()) }
      })
    },
    accept: (raw: unknown): boolean => {
      const response = inventoryRecord(raw), id = response?.request_id
      if (typeof id !== 'string') return false
      if (retired.has(id)) return true
      if (!pending.has(id)) return false
      if (closed || signal.aborted || response?.subtype !== 'success' || !inventoryRecord(response.response)) finish(id, undefined, failure())
      else finish(id, response.response)
      return true
    },
    close,
  }
}

/** Only the version actually inspected and exercised offline is admitted. Unknown versions fail closed. */
export async function collectClaudeCapabilityInventory(request: Request, input: { initialization: unknown; bridge: ClaudeCapabilityBridgeIdentity; signal: AbortSignal }): Promise<NativeCapabilityInventory> {
  input.signal.throwIfAborted()
  const init = inventoryRecord(input.initialization)
  if (init?.claude_code_version !== '2.1.318' || !Array.isArray(init.commands) || init.commands.length > MAX_NATIVE_INVENTORY_ITEMS) return empty()
  const commands = init.commands.map(inventoryRecord)
  if (commands.some(command => !command || !isInventoryLabel(command.name) || (command.builtin !== undefined && typeof command.builtin !== 'boolean') || (command.aliases !== undefined && (!Array.isArray(command.aliases) || command.aliases.length > 32 || !command.aliases.every(isInventoryLabel))))) return empty()
  let bridgeUrl: URL
  try { bridgeUrl = new URL(input.bridge.url) } catch { return empty() }
  if (input.bridge.type !== 'http' || bridgeUrl.protocol !== 'http:' || bridgeUrl.hostname !== '127.0.0.1' || !bridgeUrl.port || bridgeUrl.pathname !== '/mcp' || bridgeUrl.username || bridgeUrl.password || bridgeUrl.search || bridgeUrl.hash || !isInventoryLabel(input.bridge.authorization)) return empty()

  const readSkills = async (raw: unknown): Promise<NativeCapabilityInventory['skills']> => {
    const result: NativeCapabilityInventory['skills'] = { complete: false, items: [] }
    const skills = inventoryRecord(inventoryRecord(raw)?.skills)
    if (!skills || !Number.isSafeInteger(skills.totalSkills) || skills.totalSkills !== skills.includedSkills || !Array.isArray(skills.skillFrontmatter) || skills.skillFrontmatter.length !== skills.totalSkills || skills.skillFrontmatter.length > MAX_NATIVE_INVENTORY_ITEMS) return result
    const byName = new Map<string, NativeCapabilitySkill>()
    const trees = new NativeSkillTrees()
    for (const value of skills.skillFrontmatter) {
      input.signal.throwIfAborted()
      const skill = inventoryRecord(value)
      if (!skill || !isInventoryLabel(skill.name) || byName.has(skill.name) || !isInventoryLabel(skill.source)) return result
      let item: NativeCapabilitySkill
      if (skill.source === 'built-in') {
        if (skill.path !== undefined || skill.pluginId !== undefined || skill.pluginName !== undefined) return result
        item = { name: skill.name, builtin: true }
      } else {
        if (!['userSettings', 'projectSettings', 'plugin'].includes(skill.source) || !isInventoryLabel(skill.path) || !isAbsolute(skill.path)) return result
        if (skill.source === 'plugin' ? !isInventoryLabel(skill.pluginId) || !isInventoryLabel(skill.pluginName) : skill.pluginId !== undefined || skill.pluginName !== undefined) return result
        try {
          const path = await realpath(skill.path), info = await stat(path)
          if (!info.isFile() || basename(path) !== 'SKILL.md') return result
          const root = dirname(path)
          const contentHash = await trees.contentHash(root, input.signal)
          if (!contentHash) return result
          item = { name: skill.name, path: root, contentHash, ...(typeof skill.pluginId === 'string' ? { pluginId: skill.pluginId } : {}) }
        } catch { input.signal.throwIfAborted(); return result }
      }
      byName.set(skill.name, item)
    }
    // Manual-only commands have no path in initialize. They cannot be treated as absent just because context omits them.
    for (const command of commands) {
      const name = command!.name as string, existing = byName.get(name)
      if (!existing && command!.builtin !== true) return result
      if (existing && !!existing.builtin !== (command!.builtin === true)) return result
      const item = existing ?? { name, builtin: true as const }
      byName.set(name, item)
      for (const alias of (command!.aliases ?? []) as string[]) {
        const collision = byName.get(alias)
        if (collision && serializeInventory(collision) !== serializeInventory({ ...item, name: alias })) return result
        byName.set(alias, { ...item, name: alias })
      }
    }
    if (byName.size > MAX_NATIVE_INVENTORY_ITEMS) return result
    result.items = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)); result.complete = true
    return result
  }
  const readSources = (raw: unknown): { inventory: NativeCapabilityInventory['sources']; pending: boolean; fingerprint?: string; bridgeVerified?: boolean } => {
    const inventory: NativeCapabilityInventory['sources'] = { complete: false, items: [] }
    const response = inventoryRecord(raw), servers = response?.mcpServers
    if (!Array.isArray(servers) || servers.length > MAX_NATIVE_INVENTORY_ITEMS) return { inventory, pending: false }
    const names = new Set<string>()
    const privateIdentities: { name: string; source: string; status: unknown; config: Record<string, unknown> }[] = []
    let bridgeSeen = false, pending = false, complete = true
    for (const value of servers) {
      const server = inventoryRecord(value), config = inventoryRecord(server?.config)
      if (!server || !isInventoryLabel(server.name) || names.has(server.name) || !config || !isInventoryLabel(server.source)) return { inventory, pending: false }
      names.add(server.name)
      if (server.status === 'pending') pending = true
      if (server.status !== 'connected') complete = false
      privateIdentities.push({ name: server.name, source: server.source, status: server.status, config })
      if (server.name === 'boai') {
        const headers = inventoryRecord(config.headers), entries = headers && Object.entries(headers)
        if (bridgeSeen || server.source !== 'dynamic' || server.scope !== 'dynamic' || server.status !== 'connected' || config.type !== input.bridge.type || config.url !== input.bridge.url || !entries || entries.length !== 1 || entries[0][0].toLowerCase() !== 'authorization' || entries[0][1] !== input.bridge.authorization || Object.keys(config).some(key => !['type', 'url', 'headers'].includes(key))) return { inventory, pending }
        bridgeSeen = true; continue
      }
      let target: NativeCapabilitySource['target'] = { transport: 'unknown' }
      if (['plugin', 'dynamic', 'user', 'project', 'local', 'managed', 'enterprise', 'agent'].includes(server.source)) {
        try {
          if (config.type === 'stdio' && isInventoryLabel(config.command) && isAbsolute(config.command) && !config.command.includes('${') && (config.args === undefined || Array.isArray(config.args) && config.args.length <= 100 && config.args.every(arg => typeof arg === 'string' && arg.length <= 4000 && !arg.includes('\0') && !arg.includes('${')))) {
            target = { transport: 'identity', hash: nativeCapabilityTargetIdentity({ transport: 'stdio', command: config.command, args: (config.args ?? []) as string[] }) }
          } else if (['http', 'sse'].includes(String(config.type)) && isInventoryLabel(config.url) && !config.url.includes('${')) {
            target = { transport: 'identity', hash: nativeCapabilityTargetIdentity({ transport: 'http', url: config.url }) }
          }
        } catch { /* Unknown target remains explicit; never expose the provider's raw config or error. */ }
      }
      if (target.transport === 'unknown') complete = false
      inventory.items.push({ name: server.name, target })
    }
    inventory.items.sort((a, b) => a.name.localeCompare(b.name))
    inventory.complete = complete && bridgeSeen
    privateIdentities.sort((a, b) => a.name.localeCompare(b.name))
    return { inventory, pending, bridgeVerified: bridgeSeen, fingerprint: inventoryFingerprint(privateIdentities) }
  }
  const sample = async () => {
    const pendingUntil = Date.now() + 10000
    let source = readSources(await request({ subtype: 'mcp_status' }))
    for (let count = 0; source.pending && count < 40 && Date.now() < pendingUntil; count++) {
      await delay(250, undefined, { signal: input.signal })
      source = readSources(await request({ subtype: 'mcp_status' }))
    }
    input.signal.throwIfAborted()
    const skills = await readSkills(await request({ subtype: 'get_context_usage', detail: 'summary' }))
    if (!source.bridgeVerified) skills.complete = false
    input.signal.throwIfAborted()
    return { inventory: { owner: 'claude-local' as const, skills, sources: source.inventory }, fingerprint: source.fingerprint }
  }
  try {
    const before = await sample()
    if (!before.inventory.skills.complete || !before.inventory.sources.complete) return before.inventory
    const after = await sample()
    if (before.fingerprint !== after.fingerprint || serializeInventory(before.inventory) !== serializeInventory(after.inventory)) return empty()
    input.signal.throwIfAborted()
    return after.inventory
  } catch { input.signal.throwIfAborted(); return empty() }
}

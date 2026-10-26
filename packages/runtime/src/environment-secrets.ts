/*
 * [INPUT]: Explicit BOAI_SECRET_* values, a private environment-reference map and optional desktop vault metadata.
 * [OUTPUT]: Environment/session secrets plus authenticated desktop vault fallback; explicit desktop edits use that vault.
 * [POS]: Headless credential provider. Never decrypts or rewrites Electron's credential vault.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { lstat, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SecretStore } from './contracts'

const variable = z.string().regex(/^BOAI_SECRET_[A-Z0-9_]+$/).max(200)
const credentialId = z.string().min(1).max(200).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value))
const references = z.record(credentialId, variable.nullable())
export class EnvironmentSecrets implements SecretStore {
  private refs: Record<string, string | null> = {}
  private session = new Map<string, string>()
  private vaultKeys = new Set<string>()
  private queue: Promise<unknown> = Promise.resolve()
  private desktopContext = new AsyncLocalStorage<boolean>()
  constructor(private readonly dataPath: string, private readonly environment: Readonly<Record<string, string | undefined>>, private readonly host?: SecretStore & { connected(): boolean }) {}
  withDesktop<T>(operation: () => Promise<T>) { return this.desktopContext.run(true, operation) }
  async init() {
    const path = join(this.dataPath, '.cli', 'credential-refs.json')
    try {
      const stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256_000 || process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)) throw new Error('服务凭据引用文件必须为当前用户私有文件')
      this.refs = references.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    try {
      const path = join(this.dataPath, 'credentials.enc.json'), stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('桌面凭据文件类型无效')
      this.vaultKeys = new Set(Object.keys(JSON.parse(await readFile(path, 'utf8'))))
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  private value(id: string) { const name = Object.hasOwn(this.refs, id) ? this.refs[id] : undefined; return this.session.get(id) ?? (name ? this.environment[name] : undefined) }
  async has(id: string) { await this.queue; credentialId.parse(id); return !!this.value(id) || !Object.hasOwn(this.refs, id) && !!this.host?.connected() && !!await this.host.has?.(id) }
  async get(id: string) {
    await this.queue
    const value = this.value(id)
    if (value) return value
    if (this.refs[id]) throw new Error('此连接的服务端凭据环境变量不可用，请在服务环境中配置后重启')
    credentialId.parse(id)
    if (!Object.hasOwn(this.refs, id) && this.host?.connected()) return this.host.get(id)
    if (!Object.hasOwn(this.refs, id) && this.vaultKeys.has(id)) throw new Error('此连接凭据保存在桌面系统钥匙串；当前独立服务尚未连接可信凭据宿主')
    return undefined
  }
  private mutate(change: (refs: Record<string, string | null>) => void, committed: () => void) {
    const next = this.queue.then(async () => {
      const refs = { ...this.refs }; change(refs); references.parse(refs)
      const path = join(this.dataPath, '.cli', 'credential-refs.json'), temporary = `${path}.${randomUUID()}.tmp`
      const handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(JSON.stringify(refs)); await handle.sync() } finally { await handle.close() }
      try { await rename(temporary, path) } finally { await rm(temporary, { force: true }) }
      this.refs = refs; committed()
    })
    this.queue = next.catch(() => {})
    return next
  }
  bind(id: string, environmentVariable: string) {
    credentialId.parse(id)
    variable.parse(environmentVariable)
    if (!this.environment[environmentVariable]) throw new Error('指定的服务端凭据变量不可用')
    return this.mutate(refs => { refs[id] = environmentVariable }, () => { this.session.delete(id) })
  }
  environmentValue(name: string) { variable.parse(name); return this.environment[name] || (() => { throw new Error('指定的服务端凭据变量不可用') })() }
  async set(id: string, value: string) {
    credentialId.parse(id)
    if (this.desktopContext.getStore() && this.host?.connected()) {
      await this.queue
      if (this.refs[id] && this.value(id) === value) return
      await this.host.set(id, value)
      return this.mutate(refs => { delete refs[id] }, () => { this.session.delete(id); this.vaultKeys.add(id) })
    }
    return this.mutate(refs => { refs[id] = null }, () => { this.session.set(id, value) })
  }
  async delete(id: string) {
    credentialId.parse(id)
    if (this.desktopContext.getStore() && this.host?.connected()) await this.host.delete(id)
    return this.mutate(refs => { refs[id] = null }, () => { this.session.delete(id); this.vaultKeys.delete(id) })
  }
  async status() {
    await this.queue
    return Promise.all([...new Set([...Object.keys(this.refs), ...this.session.keys(), ...this.vaultKeys])].sort().map(async id => ({
      id, available: await this.has(id), mode: this.session.has(id) ? 'session' : this.refs[id] ? 'environment' : Object.hasOwn(this.refs, id) ? 'none' : this.host?.connected() ? 'desktop-vault' : 'desktop-vault-unavailable',
      ...(this.refs[id] ? { environmentVariable: this.refs[id] } : {}),
    })))
  }
}

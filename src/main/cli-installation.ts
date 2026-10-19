/*
 * [INPUT]: Current application executable/CLI bundle/profile and a native-selected command directory.
 * [OUTPUT]: Private versioned launcher, exclusive command link, CAS update and identity-checked uninstall.
 * [POS]: Desktop-only CLI installer; no shell-profile edits, arbitrary execution or business-data cleanup.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readlink, realpath, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { CliInstallation } from '../shared/ipc/cli-installation'

const pathSchema = z.string().min(1).max(8000).refine(value => value.startsWith('/') && !/[\x00-\x1f\x7f]/u.test(value))
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const stateSchema = z.object({ schemaVersion: z.literal(1), directory: pathSchema, directoryIdentity: z.object({ dev: z.number(), ino: z.number() }).strict(), hashes: z.array(hashSchema).min(1).max(2), installedVersion: z.string().max(100) }).strict()
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
type Host = { platform: string; executable: string; entry: string; dataPath: string; version: string }
type Status = Omit<CliInstallation, 'connection'>
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
async function info(path: string) { return lstat(path).catch(error => { if (missing(error)) return undefined; throw error }) }

export class CliInstaller {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly launcher: string
  private readonly record: string
  constructor(private readonly root: string, private readonly host: Host) {
    this.launcher = join(root, 'boai-launcher'); this.record = join(root, 'installation.json')
  }
  private script() {
    for (const value of [this.host.executable, this.host.entry, this.host.dataPath]) pathSchema.parse(value)
    return `#!/bin/sh\n# BOAI CLI launcher v1\nunset ELECTRON_NO_ASAR NODE_OPTIONS NODE_PATH\nexport ELECTRON_RUN_AS_NODE=1\nexec ${quote(this.host.executable)} ${quote(this.host.entry)} --data-dir ${quote(this.host.dataPath)} "$@"\n`
  }
  private async inspect() {
    const directory = await info(this.root)
    if (directory && (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== process.getuid?.() || (directory.mode & 0o077))) throw new Error('命令行安装记录目录已变化，请核对原目录。')
    const metadata = await info(this.record)
    if (metadata && (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16384 || metadata.uid !== process.getuid?.() || (metadata.mode & 0o077))) throw new Error('命令行安装记录无法安全读取，原文件保留。')
    const state = metadata ? stateSchema.parse(JSON.parse(await readFile(this.record, 'utf8'))) : undefined
    const launcherInfo = await info(this.launcher)
    const bytes = launcherInfo?.isFile() && !launcherInfo.isSymbolicLink() && launcherInfo.size <= 16384 ? await readFile(this.launcher, 'utf8') : undefined
    const owned = !!state && !!launcherInfo && launcherInfo.uid === process.getuid?.() && bytes !== undefined && state.hashes.includes(hash(bytes))
    const commandPath = state ? join(state.directory, 'boai') : undefined
    const selectedInfo = state ? await info(state.directory) : undefined
    const sameDirectory = selectedInfo?.isDirectory() && !selectedInfo.isSymbolicLink() && selectedInfo.dev === state?.directoryIdentity.dev && selectedInfo.ino === state?.directoryIdentity.ino
    const targetInfo = commandPath && sameDirectory ? await info(commandPath) : undefined
    const target = targetInfo?.isSymbolicLink() ? await readlink(commandPath!) : undefined
    const linked = target === this.launcher && targetInfo?.uid === process.getuid?.()
    const conflict = !!launcherInfo && !owned || !!targetInfo && !linked || !!selectedInfo && !sameDirectory
    const status: Status = { revision: hash(JSON.stringify({ state, launcher: bytes ?? null, launcherIdentity: launcherInfo && [launcherInfo.dev, launcherInfo.ino, launcherInfo.mode], directoryIdentity: selectedInfo && [selectedInfo.dev, selectedInfo.ino], target, targetIdentity: targetInfo && [targetInfo.dev, targetInfo.ino, targetInfo.mode], expected: this.script() })), supported: this.host.platform === 'darwin', state: conflict ? 'conflict' : linked && owned ? bytes === this.script() ? 'installed' : 'update-available' : 'not-installed', version: this.host.version, ...(state ? { installedVersion: bytes === this.script() ? this.host.version : state.installedVersion, commandPath } : {}), canUninstall: !!state && (!launcherInfo || owned) }
    return { status, state, owned, bytes, linked, targetInfo, launcherInfo }
  }
  async status(): Promise<Status> { return this.host.platform === 'darwin' ? (await this.inspect()).status : { revision: hash('unsupported'), supported: false, state: 'not-installed', version: this.host.version, canUninstall: false } }
  private serial<T>(run: () => Promise<T>) { const work = this.queue.then(run); this.queue = work.catch(() => {}); return work }
  private async atomic(path: string, bytes: string, mode: number) {
    const temporary = `${path}.${randomUUID()}.tmp`
    try { await writeFile(temporary, bytes, { mode, flag: 'wx' }); await rename(temporary, path) }
    finally { await unlink(temporary).catch(error => { if (!missing(error)) throw error }) }
  }
  install(directory: string | undefined, expectedRevision: string): Promise<Status> {
    return this.serial(async () => {
      if (this.host.platform !== 'darwin') throw new Error('命令行安装目前支持 macOS。')
      const before = await this.inspect()
      if (!before.status.supported) throw new Error('命令行安装目前支持 macOS。')
      if (before.status.revision !== expectedRevision) throw new Error('命令行安装状态已变化，请刷新后重试。')
      if (before.status.state === 'conflict') throw new Error('现有命令或启动器已被修改，原文件保留。')
      const selected = await realpath(pathSchema.parse(directory ?? before.state?.directory))
      if (before.linked && selected !== before.state!.directory) throw new Error('请先卸载原命令，再选择其他安装位置。')
      const selectedInfo = await lstat(selected)
      if (!selectedInfo.isDirectory()) throw new Error('请选择命令安装目录。')
      // Check current bundled paths without running any program from an existing installation.
      await realpath(this.host.executable); await realpath(this.host.entry)
      const command = join(selected, 'boai'), existing = await info(command)
      if (existing && (!existing.isSymbolicLink() || await readlink(command) !== this.launcher || !before.state || before.state.directory !== selected)) throw new Error('此目录已存在其他 boai 命令，原文件保留。')
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      const script = this.script(), nextHash = hash(script)
      // Prepare ownership before replacing bytes; either hash is recoverable after an interrupted update.
      const next = { schemaVersion: 1, directory: selected, directoryIdentity: { dev: selectedInfo.dev, ino: selectedInfo.ino }, hashes: [...new Set([nextHash, ...(before.owned ? [hash(before.bytes!)] : [])])], installedVersion: this.host.version }
      await this.atomic(this.record, JSON.stringify(next), 0o600)
      await this.atomic(this.launcher, script, 0o700)
      if (!existing) await symlink(this.launcher, command)
      return this.status()
    })
  }
  uninstall(expectedRevision: string): Promise<Status> {
    return this.serial(async () => {
      if (this.host.platform !== 'darwin') throw new Error('命令行安装目前支持 macOS。')
      const before = await this.inspect()
      if (before.status.revision !== expectedRevision) throw new Error('命令行安装状态已变化，请刷新后重试。')
      if (!before.state) return before.status
      if (!before.status.canUninstall) throw new Error('启动器已被外部修改，原文件保留。')
      if (before.linked) {
        const path = before.status.commandPath!, current = await lstat(path)
        if (current.dev !== before.targetInfo!.dev || current.ino !== before.targetInfo!.ino || await readlink(path) !== this.launcher) throw new Error('命令链接已变化，请刷新后重试。')
        await unlink(path)
      }
      if (before.owned) {
        const current = await lstat(this.launcher)
        if (current.dev !== before.launcherInfo!.dev || current.ino !== before.launcherInfo!.ino || hash(await readFile(this.launcher, 'utf8')) !== hash(before.bytes!)) throw new Error('启动器已变化，原文件保留。')
        await unlink(this.launcher)
      }
      await unlink(this.record)
      return this.status()
    })
  }
  async flush() { await this.queue }
}

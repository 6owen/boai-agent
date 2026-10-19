/*
 * [INPUT]: Isolated application/command directories, actual POSIX launcher execution and filesystem replacement.
 * [OUTPUT]: Install, upgrade, restart, CAS, interrupted preparation and selective uninstall without personal PATH changes.
 * [POS]: Desktop CLI installer contract; no real model or personal application.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { afterEach, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm, lstat, symlink, unlink, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { CliInstaller } from '../src/main/cli-installation'

const roots: string[] = [], exec = promisify(execFile)
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-installer-'))); roots.push(root)
  const directory = join(root, "bin ' ` $ 中文"), entry = join(root, "application ' ` $.mjs"), dataPath = join(root, "data ' ` $"), privateRoot = join(root, 'private')
  await mkdir(directory); await mkdir(dataPath); await writeFile(join(dataPath, 'history'), 'ORIGINAL_BUSINESS_HISTORY')
  await writeFile(entry, 'process.stdout.write(JSON.stringify({version:"1",args:process.argv.slice(2)}))')
  const host = { platform: 'darwin', executable: process.execPath, entry, dataPath, version: '1' }
  const installer = new CliInstaller(privateRoot, host)
  const install = async () => installer.install(directory, (await installer.status()).revision)
  return { root, directory, entry, dataPath, privateRoot, host, installer, install, command: join(directory, 'boai') }
}
it('installs an executable quoted launcher, persists and removes only its own command', async () => {
  const f = await fixture(), value = await f.install()
  expect(value).toMatchObject({ state: 'installed', installedVersion: '1', commandPath: f.command })
  const args = ["hello ' ` $(touch NO_SHELL_EXPANSION)", '--json']
  expect(JSON.parse((await exec(f.command, args, { cwd: f.root })).stdout)).toEqual({ version: '1', args: ['--data-dir', f.dataPath, ...args] })
  await expect(lstat(join(f.root, 'NO_SHELL_EXPANSION'))).rejects.toMatchObject({ code: 'ENOENT' })
  const reopened = new CliInstaller(f.privateRoot, f.host)
  expect(await reopened.status()).toEqual(value)
  expect((await reopened.uninstall(value.revision)).state).toBe('not-installed')
  await expect(lstat(f.command)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(f.dataPath, 'history'), 'utf8')).toBe('ORIGINAL_BUSINESS_HISTORY')
  expect(await readFile(f.entry, 'utf8')).toContain('version')
})
it('follows in-place application upgrades and explicitly updates a relocated bundle', async () => {
  const f = await fixture(); await f.install()
  await writeFile(f.entry, 'process.stdout.write("VERSION_TWO")')
  const inPlace = new CliInstaller(f.privateRoot, { ...f.host, version: '2' })
  expect(await inPlace.status()).toMatchObject({ state: 'installed', installedVersion: '2' })
  expect((await exec(f.command)).stdout).toBe('VERSION_TWO')
  const relocated = join(f.root, 'moved.mjs'); await writeFile(relocated, 'process.stdout.write("VERSION_THREE")')
  const updated = new CliInstaller(f.privateRoot, { ...f.host, entry: relocated, version: '3' })
  const before = await updated.status(); expect(before.state).toBe('update-available')
  expect((await updated.install(undefined, before.revision)).state).toBe('installed')
  expect((await exec(f.command)).stdout).toBe('VERSION_THREE')
})
it.each(['file', 'symlink'])('never replaces a pre-existing foreign %s command', async kind => {
  const f = await fixture()
  if (kind === 'file') await writeFile(f.command, 'FOREIGN'); else await symlink(f.entry, f.command)
  const before = await lstat(f.command)
  await expect(f.install()).rejects.toThrow('其他 boai')
  expect((await lstat(f.command)).ino).toBe(before.ino)
  await expect(lstat(f.privateRoot)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('preserves an externally replaced command while uninstalling only its private launcher', async () => {
  const f = await fixture(); await f.install(); await unlink(f.command); await writeFile(f.command, 'FOREIGN_REPLACEMENT')
  const status = await f.installer.status(); expect(status.state).toBe('conflict')
  await f.installer.uninstall(status.revision)
  expect(await readFile(f.command, 'utf8')).toBe('FOREIGN_REPLACEMENT')
  expect(await readFile(join(f.dataPath, 'history'), 'utf8')).toBe('ORIGINAL_BUSINESS_HISTORY')
})
it('rejects changes to the private launcher and stale or simultaneous mutations', async () => {
  const f = await fixture(), before = await f.installer.status()
  const outcomes = await Promise.allSettled([f.installer.install(f.directory, before.revision), f.installer.install(f.directory, before.revision)])
  expect(outcomes.map(value => value.status)).toEqual(['fulfilled', 'rejected'])
  await expect(f.installer.uninstall(before.revision)).rejects.toThrow('已变化')
  await writeFile(join(f.privateRoot, 'boai-launcher'), 'EXTERNAL_SCRIPT')
  const changed = await f.installer.status(); expect(changed).toMatchObject({ state: 'conflict', canUninstall: false })
  await expect(f.installer.uninstall(changed.revision)).rejects.toThrow('外部修改')
  expect(await readFile(join(f.privateRoot, 'boai-launcher'), 'utf8')).toBe('EXTERNAL_SCRIPT')
})
it('does not follow a replaced install directory when uninstalling', async () => {
  const f = await fixture(); await f.install()
  const moved = join(f.root, 'original-bin'), foreign = join(f.root, 'foreign-bin')
  await rename(f.directory, moved); await mkdir(foreign); await symlink(join(f.privateRoot, 'boai-launcher'), join(foreign, 'boai')); await symlink(foreign, f.directory)
  const changed = await f.installer.status(); expect(changed.state).toBe('conflict')
  await f.installer.uninstall(changed.revision)
  expect((await lstat(join(foreign, 'boai'))).isSymbolicLink()).toBe(true)
  expect((await lstat(join(moved, 'boai'))).isSymbolicLink()).toBe(true)
})
it('recovers prepared ownership after interruption without treating old bytes as foreign', async () => {
  const f = await fixture(); await f.install()
  const record = join(f.privateRoot, 'installation.json'), state = JSON.parse(await readFile(record, 'utf8'))
  state.hashes.unshift(createHash('sha256').update('PREPARED_NEW_BYTES').digest('hex'))
  await writeFile(record, JSON.stringify(state))
  const newEntry = join(f.root, 'new.mjs'); await writeFile(newEntry, 'process.stdout.write("RECOVERED")')
  const installer = new CliInstaller(f.privateRoot, { ...f.host, entry: newEntry })
  const status = await installer.status(); expect(status.state).toBe('update-available')
  await installer.install(undefined, status.revision)
  expect((await exec(f.command)).stdout).toBe('RECOVERED')
})
it('rejects malformed ownership records and reports unsupported platforms without writes', async () => {
  const f = await fixture()
  const unsupported = new CliInstaller(f.privateRoot, { ...f.host, platform: 'win32', entry: 'C:\\app\\cli' })
  expect(await unsupported.status()).toMatchObject({ supported: false, state: 'not-installed' })
  await expect(unsupported.install(f.directory, (await unsupported.status()).revision)).rejects.toThrow('macOS')
  await f.install(); const record = join(f.privateRoot, 'installation.json')
  await writeFile(record, '{"schemaVersion":99}')
  await expect(f.installer.status()).rejects.toThrow()
  expect(await readFile(record, 'utf8')).toBe('{"schemaVersion":99}')
})

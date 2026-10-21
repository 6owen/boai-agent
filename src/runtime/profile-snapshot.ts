/*
 * [INPUT]: 已持久登记原ID的维护租约、明确新备份目录、macOS清单工具及受管执行器。
 * [OUTPUT]: 离线userData快照及沿原authority完成凭据的独立重核；取消/失败不凭文件标记晋升。
 * [POS]: 独立个人升级备份阶段；调用方仍须确认旧程序实际退出，不代替安装/回滚事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查src/runtime/.folder.md。
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, realpath, rm, statfs, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { acquireProfileAccess } from './profile-access'

interface Catalog { version: number; controls: string[]; entries: unknown[]; hardlinks: string[][] }
export interface ProfileSnapshotTools {
  inventoryTool: string
  execute: (name: string, command: string, args: string[]) => Promise<{ exitCode: number | null; failure?: string }>
  signal?: AbortSignal
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const reserved = (name: string) => name.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, '').toUpperCase().startsWith('.BOAI-PROFILE-LOCKS-')
const within = (root: string, path: string) => { const part = relative(root, path); return !part || !part.startsWith('..' + sep) && part !== '..' && !isAbsolute(part) }
const snapshotManifest = z.object({
  format: z.literal('boai-offline-profile'), version: z.literal(2),
  transactionId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  source: z.string().refine(path => isAbsolute(path) && path === resolve(path) && path !== dirname(path)),
  createdAt: z.string().refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value),
  catalogSha256: z.string().regex(/^[a-f0-9]{64}$/),
  excludedControls: z.array(z.string().refine(path => Boolean(path) && !isAbsolute(path) && path.split('/').every(part => part && part !== '.' && part !== '..') && reserved(basename(path)))).refine(paths => new Set(paths).size === paths.length),
}).strict()
async function regular(path: string, limit = 128 * 1024 * 1024) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.mode & 0o077 || info.size > limit) throw Error('快照元数据必须为本人私有普通文件')
  return readFile(path)
}
async function durable(path: string, value: unknown) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync() } finally { await file.close() }
}
async function sync(path: string, directory = false) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | (directory ? constants.O_DIRECTORY : 0))
  try { await file.sync() } finally { await file.close() }
}
async function syncTree(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name)
    if (entry.isDirectory()) await syncTree(file)
    else if (entry.isFile()) await sync(file)
    else if (!entry.isSymbolicLink()) throw Error('快照中出现特殊文件')
  }
  await sync(path, true)
}
async function run(tools: ProfileSnapshotTools, name: string, command: string, args: string[]) {
  tools.signal?.throwIfAborted()
  const receipt = await tools.execute(name, command, args)
  if (receipt.exitCode !== 0 || receipt.failure) throw Error(`${name}未完成：${receipt.failure ?? receipt.exitCode}`)
  tools.signal?.throwIfAborted()
}
async function inventory(tools: ProfileSnapshotTools, name: string, root: string, output: string) {
  await run(tools, name, tools.inventoryTool, ['inventory', root, output])
  const bytes = await regular(output), value = JSON.parse(bytes.toString()) as Catalog
  if (value.version !== 1 || !Array.isArray(value.entries) || !value.entries.length || !Array.isArray(value.controls) || !Array.isArray(value.hardlinks)) throw Error('快照原生清单格式不受支持')
  return { bytes, value }
}
async function newDestination(input: string, tools: ProfileSnapshotTools, source?: string) {
  if (!isAbsolute(input)) throw Error('快照目录须为明确绝对路径')
  const parent = await realpath(dirname(input)), destination = join(parent, basename(input)), info = await lstat(parent)
  for (let path = destination; path !== dirname(path); path = dirname(path)) if (reserved(basename(path))) throw Error('快照不能位于维护控制命名空间')
  if (source && (within(source, destination) || within(destination, source))) throw Error('快照与原数据目录不能相互包含')
  if (!info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o077) throw Error('快照父目录必须为本人私有目录')
  await run(tools, 'profile-private-parent', tools.inventoryTool, ['private-root', parent, parent])
  await mkdir(destination, { mode: 0o700 }) // EEXIST never merges an older or unknown attempt.
  return destination
}
async function childAuthorities(source: string) {
  const controls: string[] = [], children: ReturnType<typeof acquireProfileAccess>[] = []
  async function discover(path: string) {
    for (const name of (await readdir(path)).sort()) {
      const file = join(path, name), info = await lstat(file)
      if (reserved(name)) {
        if (!info.isDirectory() || info.isSymbolicLink()) throw Error('嵌套维护控制路径不受支持')
        controls.push(relative(source, file))
      } else if (info.isDirectory() && !info.isSymbolicLink()) await discover(file)
    }
  }
  try {
    await discover(source)
    for (const control of controls) {
      const directory = join(source, control), expected = join(dirname(directory), `.boai-profile-locks-${process.getuid?.()}`)
      if (await realpath(directory) !== await realpath(expected)) throw Error('嵌套维护控制目录不属于当前用户协议')
      for (const leaf of await readdir(directory)) {
        const file = join(directory, leaf, 'access.sqlite'), info = await lstat(file)
        if (!info.isFile() || info.isSymbolicLink()) throw Error('嵌套维护身份缺失或不是普通文件')
        const profile = join(dirname(directory), leaf)
        // A moved profile may be absent, but cannot redirect an existing authority elsewhere.
        try { if ((await lstat(profile)).isSymbolicLink()) throw Error('嵌套数据路径已被符号链接替换') }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        const child = acquireProfileAccess(profile); children.push(child)
        const held = await lstat(child.file)
        if (held.dev !== info.dev || held.ino !== info.ino || await realpath(child.file) !== await realpath(file)) throw Error('嵌套维护租约与已发布身份不符')
        child.assertHeld()
      }
    }
    return { controls: controls.sort(), release() { for (const child of children.reverse()) child.release() } }
  } catch (error) { for (const child of children.reverse()) child.release(); throw error }
}

export async function createProfileSnapshot(access: ReturnType<typeof acquireProfileAccess>, destination: string, transactionId: string, tools: ProfileSnapshotTools) {
  if (process.platform !== 'darwin') throw Error('个人升级离线快照当前只支持macOS')
  const assertAccess = () => { access.assertHeld(); if (access.maintenanceIntent()?.id !== transactionId) throw Error('快照必须沿已持久登记的原维护事务') }
  assertAccess(); tools.signal?.throwIfAborted()
  const source = access.profileRoot, info = await lstat(source)
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(source) !== source) throw Error('快照来源必须为实际维护目录')
  const output = await newDestination(destination, tools, source), payload = join(output, 'profile'), createdAt = new Date().toISOString()
  let authorities: Awaited<ReturnType<typeof childAuthorities>> | undefined, committing = false
  try {
    if (access.snapshotReceipt(transactionId)) throw Error('原事务已有完成快照，请先核对原凭据')
    await durable(join(output, 'intent.json'), { version: 1, transactionId, source, createdAt, status: 'building' }); await sync(output, true)
    authorities = await childAuthorities(source); assertAccess()
    const before = await inventory(tools, 'profile-before', source, join(output, 'source-before.json'))
    if (!equal(before.value.controls, authorities.controls)) throw Error('原数据维护目录在准备期间变化')
    // CoW may fall back to a full copy, including forks and temporary control files.
    const capacityFile = join(output, 'capacity.json')
    await run(tools, 'profile-capacity', tools.inventoryTool, ['capacity', source, capacityFile])
    const capacity = z.object({ version: z.literal(1), totalBytes: z.number().int().nonnegative().safe() }).strict().parse(JSON.parse((await regular(capacityFile, 1024 * 1024)).toString()))
    const space = await statfs(output)
    if (space.bavail * space.bsize < capacity.totalBytes + 256 * 1024 ** 2) throw Error('快照空间不足，原数据和维护事务保持')
    await run(tools, 'profile-copy', '/usr/bin/env', ['DITTOABORT=1', '/usr/bin/ditto', '--clone', '--rsrc', '--extattr', '--acl', '--qtn', source, payload])
    for (const control of authorities.controls) {
      const copied = join(payload, control)
      if (!within(payload, await realpath(copied))) throw Error('复制的维护路径越出快照')
      await rm(copied, { recursive: true }) // Only this private copy, never the live authority inode.
    }
    await run(tools, 'profile-times', tools.inventoryTool, ['restore-times', payload, join(output, 'source-before.json')])
    const copied = await inventory(tools, 'profile-catalog', payload, join(output, 'catalog.json'))
    const after = await inventory(tools, 'profile-after', source, join(output, 'source-after.json')); assertAccess()
    if (!equal(before.value, after.value) || !equal(before.value.entries, copied.value.entries) || !equal(before.value.hardlinks, copied.value.hardlinks) || copied.value.controls.length) throw Error('快照与原数据字节、元数据或硬链接不一致')
    await syncTree(payload); tools.signal?.throwIfAborted(); assertAccess()
    const manifest = { format: 'boai-offline-profile', version: 2, transactionId, source, createdAt, catalogSha256: hash(copied.bytes), excludedControls: authorities.controls }
    await durable(join(output, 'snapshot.json'), manifest); await sync(output, true); await sync(dirname(output), true)
    const result = { directory: output, manifestSha256: hash(await regular(join(output, 'snapshot.json'), 1024 * 1024)), ...manifest }
    // Release can fail too. No awaits or fallible cleanup after the FULL completion commit.
    const children = authorities; authorities = undefined; children.release()
    tools.signal?.throwIfAborted(); assertAccess(); committing = true
    access.recordSnapshot({ version: 1, transactionId, directory: output, manifestSha256: result.manifestSha256 })
    return result
  } catch (error) {
    try { await writeFile(join(output, 'failure.json'), JSON.stringify({ status: committing ? 'unknown' : 'failed', transactionId, error: String(error) }, null, 2), { flag: 'wx', mode: 0o600 }) }
    catch (recordingError) { throw new AggregateError([error, recordingError], '快照未返回完成，失败记录也未写入；核对原事务凭据') }
    throw error
  } finally { authorities?.release() }
}

export async function verifyProfileSnapshot(access: ReturnType<typeof acquireProfileAccess>, directory: string, proofDirectory: string, tools: ProfileSnapshotTools) {
  tools.signal?.throwIfAborted()
  const input = resolve(directory), info = await lstat(input), root = await realpath(input)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077) throw Error('快照根必须为本人私有真实目录')
  await run(tools, 'profile-private-root', tools.inventoryTool, ['private-root', root, root])
  try { await lstat(join(root, 'failure.json')); throw Error('原快照有失败结果，不能提供恢复资格') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const manifestBytes = await regular(join(root, 'snapshot.json'), 1024 * 1024), manifest = snapshotManifest.parse(JSON.parse(manifestBytes.toString()))
  const assertReceipt = () => {
    const receipt = access.snapshotReceipt(manifest.transactionId)
    if (access.profileRoot !== manifest.source || !receipt || receipt.directory !== root || receipt.manifestSha256 !== hash(manifestBytes)) throw Error('快照缺少同一原维护身份的完成凭据')
  }
  assertReceipt()
  const catalogBytes = await regular(join(root, 'catalog.json')), catalog = JSON.parse(catalogBytes.toString()) as Catalog
  if (hash(catalogBytes) !== manifest.catalogSha256 || catalog.version !== 1 || !equal(catalog.controls, [])) throw Error('快照身份、版本或清单hash不符')
  const proof = await newDestination(proofDirectory, tools, root)
  const observed = await inventory(tools, 'profile-verify', join(root, 'profile'), join(proof, 'catalog.json'))
  if (!equal(catalog, observed.value) || !(await regular(join(root, 'snapshot.json'), 1024 * 1024)).equals(manifestBytes) || !(await regular(join(root, 'catalog.json'))).equals(catalogBytes)) throw Error('快照内容或核验期间身份变化')
  tools.signal?.throwIfAborted(); assertReceipt()
  return { directory: root, proof, manifestSha256: hash(manifestBytes), transactionId: manifest.transactionId, source: manifest.source }
}

import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

async function exists(path: string) { try { await lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error } }
async function copyTree(source: string, destination: string) {
  const info = await lstat(source)
  if (info.isSymbolicLink()) throw new Error('迁移目录包含符号链接，请移除链接后重试。原始数据未修改。')
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true })
    for (const entry of await readdir(source)) await copyTree(join(source, entry), join(destination, entry))
  } else if (info.isFile()) await copyFile(source, destination)
  else throw new Error('迁移目录包含不支持的文件类型。原始数据未修改。')
}

/** Called by the desktop host only after the shared application instance lock is held. */
export async function prepareV2DataRoot(legacyRoot: string): Promise<string> {
  const destination = join(legacyRoot, 'v2')
  await mkdir(legacyRoot, { recursive: true })
  if (await exists(destination)) {
    if ((await lstat(destination)).isSymbolicLink()) throw new Error('新版数据目录不能是符号链接')
    const marker = JSON.parse(await readFile(join(destination, 'data-version.json'), 'utf8')) as { schemaVersion: number }
    if (marker.schemaVersion !== 2) throw new Error('数据版本不受支持，请使用对应版本的应用')
    return destination
  }
  const staging = join(legacyRoot, `.v2-migration-${randomUUID()}`)
  await mkdir(staging, { recursive: false })
  try {
    const oldDatabase = join(legacyRoot, 'boai.sqlite')
    if (await exists(oldDatabase)) {
      if ((await lstat(oldDatabase)).isSymbolicLink()) throw new Error('旧数据库不能是符号链接')
      const source = createClient({ url: pathToFileURL(oldDatabase).href })
      try {
        const checked = await source.execute('PRAGMA integrity_check')
        if (String(checked.rows[0]?.integrity_check) !== 'ok') throw new Error('原数据库完整性检查未通过')
        // VACUUM INTO captures a consistent snapshot including committed WAL pages.
        await source.execute({ sql: 'VACUUM INTO ?', args: [join(staging, 'boai.sqlite')] })
      } finally { source.close() }
      for (const folder of ['skills', 'knowledge', 'workspaces']) if (await exists(join(legacyRoot, folder))) await copyTree(join(legacyRoot, folder), join(staging, folder))
      const credentials = join(legacyRoot, 'credentials.enc.json')
      if (await exists(credentials)) await copyTree(credentials, join(staging, 'credentials.enc.json'))
      const target = createClient({ url: pathToFileURL(join(staging, 'boai.sqlite')).href })
      try {
        const checked = await target.execute('PRAGMA integrity_check')
        if (String(checked.rows[0]?.integrity_check) !== 'ok') throw new Error('迁移数据库校验失败')
        await target.execute('PRAGMA wal_checkpoint(TRUNCATE)')
      } finally { target.close() }
    }
    await writeFile(join(staging, 'data-version.json'), JSON.stringify({ schemaVersion: 2, migratedFrom: await exists(oldDatabase) ? 'v0.1' : null, createdAt: new Date().toISOString(), legacyRootPreserved: true }, null, 2), { mode: 0o600 })
    // No reader sees the new root until all copies and validations have succeeded.
    await rename(staging, destination)
    return destination
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw new Error(`无法建立新版数据副本，原有数据保持不变：${error instanceof Error ? error.message : String(error)}`)
  }
}

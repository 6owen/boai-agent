/*
 * [INPUT]: Original AppService dependencies and an explicit data profile.
 * [OUTPUT]: Profile访问准入先于迁移/owner；实际服务排空后依次释放owner及共享访问。
 * [POS]: Shared desktop worker/headless assembly; no duplicate scheduler or migration.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { AppService } from './service'
import { acquireRuntimeOwner } from './owner'
import { acquireRuntimeProfileAccess } from './profile-access'
import { readFile, writeFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'

export async function startOwnedRuntime(options: ConstructorParameters<typeof AppService>[0], prepare?: () => Promise<void>) {
  const access = acquireRuntimeProfileAccess(options.dataPath)
  const owner = await acquireRuntimeOwner(options.dataPath).catch(error => { access.release(); throw error })
  try {
    const marker = join(owner.identity.dataPath, 'data-version.json')
    try { if (JSON.parse(await readFile(marker, 'utf8')).schemaVersion !== 2) throw new Error('数据版本不受支持') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const existing = await lstat(join(owner.identity.dataPath, 'boai.sqlite')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
      if (existing) throw new Error('已有数据库缺少版本标记；请先通过原桌面迁移，不能作为新服务配置打开')
      await writeFile(marker, JSON.stringify({ schemaVersion: 2, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 })
    }
    await prepare?.()
  } catch (error) { await owner.release(); access.release(); throw error }
  const service = new AppService({ ...options, dataPath: owner.identity.dataPath })
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => { await service.close(); await owner.release(); access.release() })()
  try { await service.init() }
  catch (error) {
    // Failed cleanup keeps the kernel lock until this process exits; another writer must not race it.
    await close().catch(() => {})
    throw error
  }
  return { service, owner: owner.identity, close }
}

/*
 * [INPUT]: 明确资源锁路径，默认同一用户的本机桌面资源。
 * [OUTPUT]: SQLite持有期互斥，真实进程退出自动释放；不同仓库/worktree共用桌面锁。
 * [POS]: 开发测试资源锁；不进入产品权限或员工运行逻辑。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { DatabaseSync } from 'node:sqlite'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'

export const desktopLockPath = join(tmpdir(), `boai-desktop-${userInfo().uid}.sqlite`)
export function acquireResourceLock(path = desktopLockPath) {
  const database = new DatabaseSync(path)
  try {
    database.exec('PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS mutex (id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE')
  } catch (error) { database.close(); throw new Error(`无法领取UI资源锁：${error.message}`) }
  return () => { try { database.exec('ROLLBACK') } finally { database.close() } }
}

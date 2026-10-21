/*
 * [INPUT]: Playwright全局生命周期及同用户本机桌面锁。
 * [OUTPUT]: 所有桌面BDD入口跨worktree互斥，执行结束或进程死亡后释放。
 * [POS]: Playwright globalSetup；覆盖test:electron和专用UI入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
// @ts-expect-error Shared plain Node CLI helper intentionally has no declaration file.
import { acquireResourceLock } from '../../../scripts/resource-lock.mjs'

export default function desktopResource() {
  return acquireResourceLock()
}

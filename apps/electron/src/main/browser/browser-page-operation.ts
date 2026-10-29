/*
 * [INPUT]: Electron WebContents and an original page/CDP operation.
 * [OUTPUT]: Retain the real reply while alive; actual destruction ends a lost reply without replay.
 * [POS]: Shared termination boundary for browser capture, JavaScript and CDP waits.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import type { WebContents } from 'electron'

export async function untilPageDestroyed<T>(contents: WebContents, operation: () => Promise<T>): Promise<T> {
  const exitedError = () => new Error('浏览器页面已实际退出，原动作结果未知')
  if (contents.isDestroyed()) throw exitedError()
  let onDestroyed!: () => void
  const exited = new Promise<never>((_resolve, reject) => { onDestroyed = () => reject(exitedError()) })
  contents.once('destroyed', onDestroyed)
  try {
    const result = await Promise.race([operation(), exited])
    if (contents.isDestroyed()) throw exitedError()
    return result
  } finally {
    contents.removeListener('destroyed', onDestroyed)
  }
}

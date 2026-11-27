/*
 * [INPUT]: Application data root and a cleanup target derived from product identity.
 * [OUTPUT]: Verifies containment and existing path components before journaled removal.
 * [POS]: Shared preflight for employee and conversation cleanup.
 * [PROTOCOL]: Update this header and cleanup/.folder.md on change.
 */
import { lstat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export async function assertCleanupPath(root: string, path: string, linkError: string) {
  const parts = relative(root, path).split(sep)
  if (parts.some(part => part === '..')) throw new Error('清理路径超出应用数据目录')
  let current = root
  for (const part of parts) {
    current = join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(linkError)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

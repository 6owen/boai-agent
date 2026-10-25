/*
 * [INPUT]: Actual Codex working directory and bounded Git metadata.
 * [OUTPUT]: Read-only expected trust key, including a validated linked worktree's main checkout.
 * [POS]: Native first-thread preparation fence; follows openai/codex 0.162.1 git-utils/trust.rs semantics.
 * [PROTOCOL]: Update Header and codex/.folder.md when trust-root handling changes.
 */
import { lstat, open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { configurationAncestors } from '@boai/shared/node/native-source'

async function metadata(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size > 65536) throw Error('Invalid Git metadata')
    const bytes = Buffer.alloc(before.size + 1)
    try {
      let length = 0
      while (length < bytes.length) { const next = await file.read(bytes, length, bytes.length - length); if (!next.bytesRead) break; length += next.bytesRead }
      const after = await file.stat()
      if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw Error('Changed Git metadata')
      return bytes.subarray(0, length).toString('utf8').trim()
    } finally { bytes.fill(0) }
  } finally { await file.close() }
}
async function gitDirectory(path: string) {
  const value = await metadata(path)
  if (!value.startsWith('gitdir:') || !value.slice(7).trim()) throw Error('Invalid Git pointer')
  return resolve(dirname(path), value.slice(7).trim())
}

export async function codexProjectTrustTarget(cwd: string): Promise<string> {
  const fallback = resolve(cwd)
  try {
    for (const candidate of configurationAncestors(cwd)) {
      const dotGit = join(candidate, '.git'), entry = await lstat(dotGit).catch(() => undefined)
      if (!entry) continue
      if (entry.isDirectory()) {
        if (await lstat(join(dotGit, 'HEAD')).catch(() => undefined)) return candidate
        continue
      }
      if (!entry.isFile() || entry.isSymbolicLink()) return fallback
      const gitDir = await gitDirectory(dotGit), info = await lstat(gitDir)
      if (!info.isDirectory() || info.isSymbolicLink()) return fallback
      const canonical = await realpath(gitDir), worktrees = dirname(canonical), common = dirname(worktrees)
      if (basename(worktrees) !== 'worktrees') return fallback
      const registered = resolve(canonical, await metadata(join(canonical, 'gitdir')))
      if (basename(registered) !== '.git' || await realpath(dirname(registered)) !== await realpath(candidate)) return fallback
      if (await realpath(resolve(canonical, await metadata(join(canonical, 'commondir')))) !== common) return fallback
      const main = dirname(dirname(dirname(gitDir))), mainDotGit = join(main, '.git'), mainInfo = await lstat(mainDotGit)
      const mainGitDir = mainInfo.isDirectory() ? mainDotGit : await gitDirectory(mainDotGit)
      return await realpath(mainGitDir) === common ? main : fallback
    }
  } catch { /* Unsupported/unstable metadata cannot expand the allowed trust key. */ }
  return fallback
}

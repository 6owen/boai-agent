/*
 * [INPUT]: Repository root, candidate control directory and optional artifact location.
 * [OUTPUT]: Reserved dist/releases paths, package exclusions and legacy candidate lookup.
 * [POS]: Shared build/release output contract; recovery ledgers remain outside dist.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { basename, dirname, resolve } from 'node:path'

export const releaseOutputName = 'releases'
export const releaseFileExclusions = ['!dist/releases', '!dist/releases/**/*']

export function withoutReleaseArtifacts(files = ['**/*']) {
  const original = Array.isArray(files) ? files : [files]
  return [...original, ...releaseFileExclusions.filter(pattern => !original.includes(pattern))]
}

export function releaseArtifactDirectory(root, candidateDirectory) {
  candidateDirectory = resolve(candidateDirectory)
  if (dirname(candidateDirectory) !== resolve(root, '.local/release-candidates')) throw Error('候选产物目录须属于本worktree')
  return resolve(root, 'dist', releaseOutputName, 'candidates', basename(candidateDirectory))
}

export function candidateArtifactDirectory(root, directory, candidate) {
  // Old candidates retain their original assets/updates paths and recovery records.
  if (!Object.hasOwn(candidate, 'artifactDirectory')) return resolve(directory)
  const expected = releaseArtifactDirectory(root, directory)
  if (candidate.artifactDirectory !== expected) throw Error('候选产物目录与本worktree及候选ID不匹配')
  return expected
}

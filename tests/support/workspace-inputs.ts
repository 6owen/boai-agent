/*
 * [INPUT]: Workspace source roots used by provenance and live evaluation recording.
 * [OUTPUT]: Sorted original source paths, excluding dependencies and generated output.
 * [POS]: Shared test/evaluation source enumeration; never starts the application.
 * [PROTOCOL]: Update tests/.folder.md when this helper changes.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function workspaceInputFiles(roots: string[] = ['apps', 'packages']): Promise<string[]> {
  const files: string[] = []
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', '.local'].includes(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  for (const root of roots) await walk(root)
  return files.sort()
}

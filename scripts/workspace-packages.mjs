/*
 * [INPUT]: Current worktree package manifests and their explicit public exports.
 * [OUTPUT]: Source aliases for app/test builds; workspace packages stay local even when third-party packages are external.
 * [POS]: Shared workspace resolution; importing this module does not compile or start an application.
 * [PROTOCOL]: Update scripts/.folder.md when this interface changes.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const workspaceRoot = fileURLToPath(new URL('../', import.meta.url))

function sourceTarget(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') throw new Error('Invalid workspace export target')
  return sourceTarget(value.development ?? value.import ?? value.default)
}

/** Follow package exports, never a node_modules symlink into another worktree. */
export function workspaceAliases(root = workspaceRoot) {
  const aliases = {}
  const directory = resolve(root, 'packages')
  for (const member of readdirSync(directory, { withFileTypes: true })) {
    if (!member.isDirectory()) continue
    const packageRoot = resolve(directory, member.name)
    const manifestPath = resolve(packageRoot, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!manifest.name?.startsWith('@boai/')) continue
    for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
      if (subpath !== '.' && !subpath.startsWith('./')) throw new Error(`Invalid export in ${manifest.name}: ${subpath}`)
      if (subpath.includes('*')) throw new Error(`Workspace exports must be explicit: ${manifest.name}/${subpath}`)
      const target = sourceTarget(value)
      if (!target.startsWith('./')) throw new Error(`Workspace export must be local: ${manifest.name}/${subpath}`)
      const destination = resolve(packageRoot, target)
      const child = relative(packageRoot, destination)
      if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error(`Workspace export escapes package: ${manifest.name}/${subpath}`)
      aliases[manifest.name + subpath.slice(1)] = destination
    }
  }
  return Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => b.length - a.length))
}

export function workspaceViteAliases(root = workspaceRoot) {
  return Object.entries(workspaceAliases(root)).map(([find, replacement]) => ({ find, replacement }))
}

/** Aliases are applied before packages:external, so only third-party dependencies remain external. */
export async function buildWorkspace({ workspaceRoot: root = workspaceRoot, ...options }) {
  const { build } = await import('esbuild')
  return build({ ...options, alias: { ...workspaceAliases(root), ...options.alias } })
}

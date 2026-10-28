/*
 * [OUTPUT]: 2026-10-29 包边界纳入file-explorer-plugin；build分发固定来源和MIT许可。
 * [OUTPUT]: 2026-10-27 语音包分发、工作区依赖或静音诊断候选；不代表产品验收。
 * [INPUT]: Workspace manifests, public exports and TS/JS source imports.
 * [OUTPUT]: Reject app/package dependency reversals, source path escapes and unresolved public entries.
 * [POS]: Lightweight static workspace contract; does not build or execute product code.
 * [PROTOCOL]: Update scripts/.folder.md and spec/26 when this contract changes.
 */
import { builtinModules } from 'node:module'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
const allowed = {
  '@boai/shared': ['@boai/tokens', '@boai/runtime-plugin-sdk'],
  '@boai/file-explorer-plugin': ['@boai/shared', '@boai/ui'],
  '@boai/voice-input-plugin': ['@boai/shared'],
  '@boai/transport': ['@boai/shared'],
  '@boai/runtime': ['@boai/shared', '@boai/transport', '@boai/tokens', '@boai/runtime-plugin-sdk', '@boai/runtime-plugins'],
  '@boai/runtime-plugin-sdk': [],
  '@boai/runtime-plugins': ['@boai/shared', '@boai/runtime-plugin-sdk'],
  '@boai/ui': ['@boai/tokens'],
  '@boai/tokens': [],
  '@boai/electron': ['@boai/file-explorer-plugin', '@boai/voice-input-plugin', '@boai/runtime', '@boai/shared', '@boai/transport', '@boai/ui', '@boai/tokens', '@boai/runtime-plugin-sdk'],
  '@boai/cli': ['@boai/shared', '@boai/transport'],
  '@boai/design-docs': ['@boai/ui', '@boai/tokens'],
}
const errors = [], workspaces = [], files = [], graph = new Map()
const display = path => relative(root, path).split(sep).join('/')
const exists = async path => stat(path).then(value => value.isFile(), () => false)
function fail(file, message) { errors.push(`${display(file)}: ${message}`) }
async function walk(directory, visit) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '.local'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await walk(path, visit)
    else if (entry.isFile()) await visit(path)
  }
}
for (const group of ['apps', 'packages']) {
  for (const entry of await readdir(resolve(root, group), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = resolve(root, group, entry.name), manifestFile = resolve(directory, 'package.json')
    if (!await exists(manifestFile)) { fail(directory, 'missing workspace package.json'); continue }
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
    if (!allowed[manifest.name]) fail(manifestFile, `no dependency contract for ${manifest.name}`)
    const workspace = { directory, manifest, name: manifest.name }
    workspaces.push(workspace)
    await walk(resolve(directory, 'src'), path => {
      if (sourceExtensions.has(extname(path))) files.push({ path, workspace })
    }).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
const byName = new Map(workspaces.map(value => [value.name, value]))
const owner = path => workspaces.find(value => path === value.directory || path.startsWith(value.directory + sep))
const packageName = specifier => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
const cleanSpecifier = value => value.replace(/[?#].*$/, '')
async function resolveFile(path) {
  const candidates = [path, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.d.ts'].map(suffix => path + suffix), ...['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map(name => resolve(path, name))]
  if (/\.m?js$/.test(path)) candidates.push(path.replace(/\.m?js$/, '.ts'), path.replace(/\.m?js$/, '.tsx'))
  for (const candidate of candidates) if (await exists(candidate)) return candidate
}
function exportEntries(manifest) {
  if (!manifest.exports) return []
  if (typeof manifest.exports === 'string' || Array.isArray(manifest.exports)) return [['.', manifest.exports]]
  return Object.keys(manifest.exports).some(key => key.startsWith('.')) ? Object.entries(manifest.exports) : [['.', manifest.exports]]
}
function sourceTargets(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(sourceTargets)
  if (!value || typeof value !== 'object') return []
  return [...new Set(['development', 'source', 'types', 'default', 'node', 'import', 'require'].flatMap(key => sourceTargets(value[key])))]
}
function exported(workspace, subpath) {
  const entries = exportEntries(workspace.manifest)
  const exact = entries.find(([key]) => key === subpath)
  if (exact) return sourceTargets(exact[1])
  for (const [key, value] of entries) {
    if (!key.includes('*')) continue
    const [start, end] = key.split('*')
    if (subpath.startsWith(start) && subpath.endsWith(end)) {
      const match = subpath.slice(start.length, subpath.length - end.length || undefined)
      return sourceTargets(value).map(target => target.replaceAll('*', match))
    }
  }
  return []
}
async function resolvePublic(workspace, subpath) {
  const targets = exported(workspace, subpath)
  for (const target of targets) {
    if (!target.startsWith('./')) continue
    const file = await resolveFile(resolve(workspace.directory, target))
    if (file && !display(file).includes('/dist/')) return file
  }
}
// Source export targets must exist before a build; generated dist/types outputs are checked by packaging.
for (const workspace of workspaces) {
  for (const [entry, target] of exportEntries(workspace.manifest)) {
    for (const value of sourceTargets(target)) {
      if (!value.startsWith('./src/') || value.includes('*')) continue
      if (!await resolveFile(resolve(workspace.directory, value))) fail(resolve(workspace.directory, 'package.json'), `export ${entry} source target missing: ${value}`)
    }
  }
}
function importedSpecifiers(ast) {
  const result = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const item of node) visit(item); return }
    let source
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) source = node.source
    else if (node.type === 'TSImportType') source = node.argument
    else if (node.type === 'CallExpression' && (node.callee?.type === 'Import' || (node.callee?.type === 'Identifier' && node.callee.name === 'require'))) source = node.arguments?.[0]
    if (source?.type === 'StringLiteral') result.push({ value: source.value, line: source.loc?.start.line ?? 0, typeOnly: node.importKind === 'type' || node.exportKind === 'type' || node.type === 'TSImportType' })
    for (const [key, value] of Object.entries(node)) if (!['loc', 'start', 'end', 'comments', 'tokens', 'extra'].includes(key)) visit(value)
  }
  visit(ast)
  return result
}
for (const { path, workspace } of files) {
  let ast
  try { ast = parse(await readFile(path, 'utf8'), { sourceType: 'unambiguous', plugins: ['typescript', 'jsx', 'importAttributes'], allowReturnOutsideFunction: true }) }
  catch (error) { fail(path, `syntax: ${error.message}`); continue }
  const imports = importedSpecifiers(ast), edges = []
  graph.set(path, edges)
  for (const imported of imports) {
    const value = cleanSpecifier(imported.value), at = `line ${imported.line}`
    let target
    if (value.startsWith('.')) {
      target = await resolveFile(resolve(dirname(path), value))
      if (!target) { fail(path, `${at} unresolved relative import ${value}`); continue }
      const targetOwner = owner(target)
      // App version and bundled skill manifests remain source data, not cross-package code imports.
      const rootResource = extname(target) === '.json' && (target === resolve(root, 'package.json') || target.startsWith(resolve(root, 'resources') + sep))
      if (targetOwner?.name !== workspace.name && !rootResource) fail(path, `${at} relative import escapes ${workspace.name}: ${value}; use public package export`)
    } else if (value.startsWith('@/')) {
      if (workspace.name !== '@boai/electron') { fail(path, `${at} Electron renderer alias used outside the app`); continue }
      target = await resolveFile(resolve(root, 'apps/electron/src/renderer', value.slice(2)))
      if (!target) fail(path, `${at} unresolved renderer alias ${value}`)
    } else if (value.startsWith('@shared/')) {
      fail(path, `${at} legacy shared alias ${value}; use @boai/shared exports`)
    } else if (value.startsWith('@boai/')) {
      const name = packageName(value), dependency = byName.get(name)
      if (!dependency) { fail(path, `${at} missing workspace ${name}`); continue }
      if (name !== workspace.name && !allowed[workspace.name]?.includes(name)) fail(path, `${at} forbidden dependency ${workspace.name} -> ${name}`)
      if (name !== workspace.name && !workspace.manifest.dependencies?.[name] && !workspace.manifest.peerDependencies?.[name]) fail(path, `${at} undeclared workspace dependency ${name}`)
      const subpath = value === name ? '.' : '.' + value.slice(name.length)
      target = await resolvePublic(dependency, subpath)
      if (!target) fail(path, `${at} unresolved public export ${value}`)
    }
    if (!imported.typeOnly && target) edges.push(target)
    if (['@boai/ui', '@boai/tokens', '@boai/runtime-plugin-sdk'].includes(workspace.name) && (builtins.has(value) || value === 'electron')) fail(path, `${at} platform import in portable package: ${value}`)
    if (!imported.typeOnly && (builtins.has(value) || value === 'electron')) edges.push(value)
  }
}
// A browser consumer of the shared root must not pull platform code through a barrel.
const shared = byName.get('@boai/shared')
if (shared) {
  const entry = await resolvePublic(shared, '.')
  if (entry) {
    const visited = new Set()
    function inspect(path, trail) {
      if (visited.has(path)) return
      visited.add(path)
      for (const next of graph.get(path) ?? []) {
        if (builtins.has(next) || next === 'electron') fail(entry, `portable shared root reaches ${next} through ${[...trail, display(path)].join(' -> ')}`)
        else inspect(next, [...trail, display(path)])
      }
    }
    inspect(entry, [])
  }
}
if (errors.length) {
  process.stderr.write(`Workspace static check failed (${errors.length}):\n${errors.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Workspace static check passed: ${workspaces.length} packages, ${files.length} source files; imports, public entries and dependency directions checked.\n`)
}

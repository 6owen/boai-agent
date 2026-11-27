/*
 * [OUTPUT]: --graph 从同一次 AST 检查输出工作区公开入口、真实源码和逐条依赖的类型、位置与目标。
 * [OUTPUT]: 桌面浏览器命令公开入口的传递值依赖不得引入 Electron、执行器适配层或 Mastra SDK。
 * [OUTPUT]: 构建与边界检查共用显式开发导出解析；检查包含所有命名空间的工作区成员。
 * [OUTPUT]: 独立avatar-motion子模块可由Electron单向引用，无BOAI业务依赖。
 * [OUTPUT]: Canvas package stays independent; shared imports only its platform-neutral protocol.
 * [OUTPUT]: Agent Desktop 可选插件接线；默认关闭、独立于旧computer-use，调用沿员工权限及真实图片。
 * [OUTPUT]: 独立浏览器包只依赖上游，由runtime调用公开host入口。
 * [OUTPUT]: 2026-10-29 包边界纳入file-explorer-plugin；build分发固定来源和MIT许可。
 * [OUTPUT]: 2026-10-27 语音包分发、工作区依赖或静音诊断候选；不代表产品验收。
 * [OUTPUT]: CI 拒绝静态 ES 模块值导入环，报告闭环路径。
 * [INPUT]: Workspace manifests, public exports and TS/JS source imports.
 * [OUTPUT]: Reject app/package dependency reversals, source path escapes and unresolved public entries.
 * [POS]: Lightweight static workspace contract; does not build or execute product code.
 * [PROTOCOL]: Update scripts/.folder.md and spec/26 when this contract changes.
 */
import { builtinModules } from 'node:module'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { workspaceSourceAliases } from './workspace-packages.mjs'
import { parse } from '@babel/parser'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
const allowed = {
  '@6owen/avatar-motion': [],
  '@boai/canvas-plugin': [],
  '@boai/shared': ['@boai/canvas-plugin', '@boai/tokens', '@boai/runtime-plugin-sdk'],
  '@boai/file-explorer-plugin': ['@boai/shared', '@boai/ui'],
  '@boai/voice-input-plugin': ['@boai/shared'],
  '@boai/browser-plugins': [],
  '@boai/desktop-plugin': [],
  '@boai/transport': ['@boai/shared'],
  '@boai/runtime': ['@boai/canvas-plugin', '@boai/desktop-plugin', '@boai/browser-plugins', '@boai/shared', '@boai/transport', '@boai/tokens', '@boai/runtime-plugin-sdk', '@boai/runtime-plugins'],
  '@boai/runtime-plugin-sdk': [],
  '@boai/runtime-plugins': ['@boai/shared', '@boai/runtime-plugin-sdk'],
  '@boai/ui': ['@boai/tokens'],
  '@boai/tokens': [],
  '@boai/electron': ['@6owen/avatar-motion', '@boai/canvas-plugin', '@boai/file-explorer-plugin', '@boai/voice-input-plugin', '@boai/runtime', '@boai/shared', '@boai/transport', '@boai/ui', '@boai/tokens', '@boai/runtime-plugin-sdk'],
  '@boai/cli': ['@boai/shared', '@boai/transport'],
  '@boai/design-docs': ['@boai/ui', '@boai/tokens'],
}
const errors = [], workspaces = [], files = [], graph = new Map()
const reportFiles = process.argv.includes('--graph') ? [] : undefined
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
    const workspace = { directory, manifest, name: manifest.name, aliases: workspaceSourceAliases(directory, manifest) }
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
function sourceTargets(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(sourceTargets)
  if (!value || typeof value !== 'object') return []
  return [...new Set(['development', 'source', 'types', 'default', 'node', 'import', 'require'].flatMap(key => sourceTargets(value[key])))]
}
async function resolvePublic(workspace, specifier) {
  const target = workspace.aliases[specifier]
  if (target && !display(target).includes('/dist/')) return resolveFile(target)
}
// Source export targets must exist before a build; generated dist/types outputs are checked by packaging.
for (const workspace of workspaces) {
  const { dependencies, peerDependencies, optionalDependencies } = workspace.manifest
  for (const name of Object.keys({ ...dependencies, ...peerDependencies, ...optionalDependencies })) {
    if (byName.has(name) && !allowed[workspace.name]?.includes(name)) {
      fail(resolve(workspace.directory, 'package.json'), `forbidden dependency ${workspace.name} -> ${name}`)
    }
  }
  for (const [entry, target] of Object.entries(workspace.manifest.exports ?? {})) {
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
    if (source?.type === 'StringLiteral') {
      const onlyTypeSpecifiers = node.specifiers?.length > 0 && node.specifiers.every(spec => spec.importKind === 'type' || spec.exportKind === 'type')
      const typeOnly = node.importKind === 'type' || node.exportKind === 'type' || node.type === 'TSImportType' || onlyTypeSpecifiers
      let kind = 'dynamic'
      if (typeOnly) kind = 'type'
      else if (node.type === 'ImportDeclaration') kind = 'import'
      else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') kind = 'reexport'
      else if (node.callee?.name === 'require') kind = 'require'
      result.push({ value: source.value, line: source.loc?.start.line ?? 0, kind })
    }
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
  const report = reportFiles && { path: display(path), workspace: workspace.name, imports: [] }
  if (report) reportFiles.push(report)
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
    } else if (value.startsWith('@boai/') || byName.has(packageName(value))) {
      const name = packageName(value), dependency = byName.get(name)
      if (!dependency) { fail(path, `${at} missing workspace ${name}`); continue }
      if (name !== workspace.name && !allowed[workspace.name]?.includes(name)) fail(path, `${at} forbidden dependency ${workspace.name} -> ${name}`)
      if (name !== workspace.name && !workspace.manifest.dependencies?.[name] && !workspace.manifest.peerDependencies?.[name] && !workspace.manifest.optionalDependencies?.[name]) fail(path, `${at} undeclared workspace dependency ${name}`)
      target = await resolvePublic(dependency, value)
      if (!target) fail(path, `${at} unresolved public export ${value}`)
    }
    if (report) {
      report.imports.push({
        line: imported.line, kind: imported.kind, specifier: imported.value,
        ...(target ? { target: display(target) } : {}),
      })
    }
    if (imported.kind !== 'type' && target) {
      // Vite raw/url imports load asset data, not the target module's imports.
      const asset = /[?&](?:raw|url)(?:&|$)/.test(imported.value)
      if (!asset) edges.push({ target, staticImport: imported.kind === 'import' || imported.kind === 'reexport' })
    }
    if (['@boai/ui', '@boai/tokens', '@boai/runtime-plugin-sdk'].includes(workspace.name) && (builtins.has(value) || value === 'electron')) fail(path, `${at} platform import in portable package: ${value}`)
    if (imported.kind !== 'type' && (builtins.has(value) || value === 'electron' || value.startsWith('electron/') || value.startsWith('@mastra/'))) edges.push({ target: value, staticImport: false })
  }
}
// Only synchronous ES module imports and re-exports impose initialization order.
const inspected = new Set()
const trail = []
const visiting = new Set()
function inspectImports(path) {
  if (inspected.has(path)) return
  visiting.add(path)
  trail.push(path)
  for (const { target, staticImport } of graph.get(path) ?? []) {
    if (!staticImport) continue
    if (visiting.has(target)) {
      const cycle = [...trail.slice(trail.indexOf(target)), target]
      fail(path, `static import cycle: ${cycle.map(display).join(' -> ')}`)
    } else {
      inspectImports(target)
    }
  }
  trail.pop()
  visiting.delete(path)
  inspected.add(path)
}
for (const path of graph.keys()) inspectImports(path)
async function checkReachableImports(name, specifier, label, forbidden) {
  const workspace = byName.get(name)
  if (!workspace) return
  const entry = await resolvePublic(workspace, specifier)
  if (!entry) return
  const visited = new Set()
  function inspect(path, trail) {
    if (visited.has(path)) return
    visited.add(path)
    for (const { target } of graph.get(path) ?? []) {
      const chain = [...trail, display(path)]
      if (forbidden(target)) fail(entry, `${label} reaches ${graph.has(target) ? display(target) : target} through ${chain.join(' -> ')}`)
      else if (graph.has(target)) inspect(target, chain)
    }
  }
  inspect(entry, [])
}

const electron = target => target === 'electron' || target.startsWith('electron/')
await checkReachableImports('@boai/shared', '@boai/shared', 'portable shared root', target => builtins.has(target) || electron(target))
const adapterRoot = resolve(root, 'packages/runtime/src/adapters') + sep
await checkReachableImports('@boai/runtime', '@boai/runtime/browser', 'browser host entry', target =>
  electron(target) || target.startsWith('@mastra/') || target.startsWith(adapterRoot))

if (errors.length) {
  process.stderr.write(`Workspace static check failed (${errors.length}):\n${errors.join('\n')}\n`)
  process.exitCode = 1
} else if (reportFiles) {
  const packages = workspaces.map(({ name, manifest, aliases }) => ({
    name,
    dependencies: Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies }).filter(dependency => byName.has(dependency)).sort(),
    exports: Object.fromEntries(Object.entries(aliases).map(([specifier, target]) => [specifier, display(target)])),
  }))
  packages.sort((a, b) => a.name.localeCompare(b.name))
  reportFiles.sort((a, b) => a.path.localeCompare(b.path))
  process.stdout.write(JSON.stringify({ packages, files: reportFiles }) + '\n')
} else {
  process.stdout.write(`Workspace static check passed: ${workspaces.length} packages, ${files.length} source files; imports, public entries and dependency directions checked.\n`)
}

/*
 * [INPUT]: A prebuilt plugin directory and the installed SDK manifest schema.
 * [OUTPUT]: Offline package/dependency/export diagnostics without importing plugin code.
 * [POS]: Portable preflight shared by the example and BOAI development tooling.
 * [PROTOCOL]: Keep directory limits aligned with RuntimePlugins; update example README on changes.
 */
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
const inside = (root, path) => { const name = relative(root, path); return !isAbsolute(name) && name !== '..' && !name.startsWith(`..${sep}`) }

export async function checkPackage(directory, options = {}) {
  const root = resolve(directory)
  const entries = []
  let nodes = 0, bytes = 0
  async function visit(path) {
    if (++nodes > 256 || relative(root, path).split(/[\\/]/).length > 8) throw new Error('插件包目录超出限制')
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) throw new Error('插件包不能包含符号链接')
    if (stat.isDirectory()) { for (const name of (await readdir(path)).sort()) await visit(join(path, name)); return }
    if (!stat.isFile() || entries.length >= 128 || stat.size > 16 * 1024 * 1024) throw new Error('插件包超出文件限制')
    const content = await readFile(path)
    bytes += content.length
    if (bytes > 32 * 1024 * 1024) throw new Error('插件包超过32MiB')
    entries.push({ name: relative(root, path).split('\\').join('/'), content })
  }
  await visit(root)
  const source = entries.find(entry => entry.name === 'manifest.json')
  if (!source || source.content.length > 32768) throw new Error('插件包缺少有效manifest.json')
  const schema = options.runtimeManifestSchema ?? (await import('@boai/runtime-plugin-sdk/manifest')).runtimeManifestSchema
  const manifest = schema.parse(JSON.parse(source.content.toString()))
  if (!entries.some(entry => /^LICENSE(?:\.txt|\.md)?$/i.test(entry.name))) throw new Error('插件包需要LICENSE文件')
  const contribution = manifest.contributions[0]
  if (contribution.driver.kind !== 'module') throw new Error('此开发工具预检要求独立module入口；builtin ACP声明请沿宿主原入口核验')
  if (!entries.some(entry => entry.name === contribution.driver.entry)) throw new Error('插件入口不在包内')
  // esbuild parses/bundles in memory. No plugin import, eval, child process, or install hook runs.
  const analysis = await build({ absWorkingDir: root, entryPoints: [contribution.driver.entry], bundle: true, write: false, metafile: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' })
  for (const name of Object.keys(analysis.metafile.inputs)) {
    if (!inside(root, resolve(root, name))) throw new Error(`模块依赖必须在插件包内: ${name}`)
  }
  const modules = Object.values(analysis.metafile.outputs)
  for (const output of modules) for (const item of output.imports) {
    if (item.external && !builtins.has(item.path)) throw new Error(`模块依赖未打包: ${item.path}`)
  }
  const names = new Set(modules.flatMap(output => output.exports))
  for (const name of ['runtimeApiVersion', 'createRuntime']) if (!names.has(name)) throw new Error(`插件入口缺少导出: ${name}`)
  const digest = createHash('sha256')
  for (const entry of entries) digest.update(entry.name).update('\0').update(createHash('sha256').update(entry.content).digest('hex')).update('\0')
  return { id: manifest.id, version: manifest.version, runtimeApiVersion: contribution.runtimeApiVersion, files: entries.length, bytes, packageHash: digest.digest('hex'), runtimeLoaded: false }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [directory = 'package', ...extra] = process.argv.slice(2)
  if (extra.length) throw new Error('Usage: node tools/check-package.mjs [package-directory]')
  process.stdout.write(JSON.stringify(await checkPackage(directory), null, 2) + '\n')
}

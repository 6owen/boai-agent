/*
 * [INPUT]: The real SDK package manifest/source and the standalone Text Inspector template.
 * [OUTPUT]: Local SDK tarball, new independent project, or read-only package diagnostics; never installs a plugin.
 * [POS]: External plugin development entry; separate from application/runtime builds.
 * [PROTOCOL]: Update scripts/.folder.md and workspace spec 04 when commands change.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkPackage } from '../examples/runtime-plugins/text-inspector/tools/check-package.mjs'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sdkRoot = join(root, 'packages/runtime-plugin-sdk')
const template = join(root, 'examples/runtime-plugins/text-inspector')
const json = value => JSON.stringify(value, null, 2) + '\n'
const contained = (parent, child) => { const name = relative(parent, child); return !isAbsolute(name) && name !== '..' && !name.startsWith(`..${sep}`) }

async function sdkEntries() {
  const manifest = JSON.parse(await readFile(join(sdkRoot, 'package.json'), 'utf8'))
  const entries = Object.entries(manifest.exports).filter(([, value]) => typeof value === 'object').map(([name, value]) => {
    const source = resolve(sdkRoot, value.development)
    if (!contained(sdkRoot, source) || !source.endsWith('.ts')) throw new Error(`Invalid SDK source export: ${name}`)
    const stem = basename(source, '.ts')
    return { name, source, stem }
  })
  if (!entries.length || new Set(entries.map(entry => entry.stem)).size !== entries.length) throw new Error('SDK exports must have unique source filenames')
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error(`SDK dependency must be portable and pinned: ${name}`)
  }
  return { manifest, entries }
}

/** Builds only the portable SDK; npm pack does not install dependencies or publish. */
export async function exportSdk(output = join(root, '.local/plugin-devkit')) {
  const { manifest, entries } = await sdkEntries()
  output = resolve(output)
  await mkdir(output, { recursive: true })
  const staging = await mkdtemp(join(output, '.sdk-'))
  try {
    const { build } = await import('esbuild')
    const dist = join(staging, 'dist')
    await build({ entryPoints: entries.map(entry => entry.source), outdir: dist, outExtension: { '.js': '.mjs' }, bundle: false, platform: 'neutral', format: 'esm', target: 'es2022', logLevel: 'silent' })
    // Use the installed CLI: TypeScript 7 intentionally does not export the old createProgram API.
    const compilerPackage = require.resolve('typescript/package.json')
    const compilerManifest = JSON.parse(await readFile(compilerPackage, 'utf8'))
    const compilerConfig = join(staging, 'tsconfig.sdk.json')
    await writeFile(compilerConfig, json({
      compilerOptions: {
        target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'],
        declaration: true, emitDeclarationOnly: true, strict: true, skipLibCheck: true, types: [],
        outDir: dist, rootDir: join(sdkRoot, 'src'), noEmitOnError: true,
      },
      files: entries.map(entry => entry.source),
    }))
    try {
      await exec(process.execPath, [resolve(dirname(compilerPackage), compilerManifest.bin.tsc), '--project', compilerConfig], { cwd: root, maxBuffer: 4 * 1024 * 1024 })
    } finally { await rm(compilerConfig, { force: true }) }
    const exports = Object.fromEntries(entries.map(({ name, stem }) => [name, { types: `./dist/${stem}.d.ts`, default: `./dist/${stem}.mjs` }]))
    exports['./package.json'] = './package.json'
    const portable = {
      name: manifest.name, version: manifest.version, private: true, type: manifest.type,
      description: manifest.description, license: manifest.license ?? 'UNLICENSED', exports,
      files: [...entries.flatMap(({ stem }) => [`dist/${stem}.mjs`, `dist/${stem}.d.ts`]), 'manifest.schema.json', 'README.md', 'LICENSE.txt'],
      dependencies: manifest.dependencies,
    }
    await writeFile(join(staging, 'package.json'), json(portable))
    await copyFile(join(sdkRoot, 'README.md'), join(staging, 'README.md'))
    await copyFile(join(sdkRoot, 'LICENSE.txt'), join(staging, 'LICENSE.txt'))
    // Execute only BOAI's trusted schema, bundled in memory so the output may be outside this repository.
    const { runtimeManifestSchema, z } = await loadManifestSchema()
    await writeFile(join(staging, 'manifest.schema.json'), json(z.toJSONSchema(runtimeManifestSchema)))
    const packed = JSON.parse((await exec(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], { cwd: staging, maxBuffer: 1024 * 1024 })).stdout)
    if (packed.length !== 1 || basename(packed[0].filename) !== packed[0].filename || !packed[0].filename.endsWith('.tgz')) throw new Error('npm pack returned an invalid artifact name')
    const target = join(output, 'sdk')
    // This directory is owned by the SDK exporter; never remove the caller's output root.
    try {
      const previous = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
      if (previous.name !== manifest.name || previous.private !== true) throw new Error(`Refusing to replace a different package: ${target}`)
      if ((await lstat(target)).isSymbolicLink()) throw new Error(`Refusing SDK output symlink: ${target}`)
      await rm(target, { recursive: true })
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    await rename(staging, target)
    return { sdkDirectory: target, tarball: join(output, packed[0].filename), name: manifest.name, version: manifest.version }
  } finally { await rm(staging, { recursive: true, force: true }) }
}

async function loadManifestSchema() {
  const { build } = await import('esbuild')
  const result = await build({ stdin: { contents: 'export { runtimeManifestSchema } from "./src/manifest.ts"; export { z } from "zod"', resolveDir: sdkRoot }, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}

/** The exclusive mkdir protects existing files; all template dependencies remain inside the new project. */
export async function createPlugin(directory, options = {}) {
  if (!directory) throw new Error('Usage: runtime-plugin-devkit.mjs create <new-directory>')
  const target = resolve(directory)
  await mkdir(dirname(target), { recursive: true })
  await mkdir(target)
  try {
    const artifact = options.sdk ?? await exportSdk()
    // mkdir above reserves the target; copy children so cp does not reject that owned root as an existing destination.
    for (const name of await readdir(template)) {
      if (['node_modules', 'package', 'vendor'].includes(name)) continue
      await cp(join(template, name), join(target, name), { recursive: true, force: false, errorOnExist: true, filter: source => !['node_modules', 'package', 'vendor'].includes(basename(source)) })
    }
    await mkdir(join(target, 'vendor'))
    await copyFile(artifact.tarball, join(target, 'vendor', basename(artifact.tarball)))
    const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
    const workspace = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    manifest.packageManager = workspace.packageManager
    manifest.devDependencies[artifact.name] = `file:./vendor/${basename(artifact.tarball)}`
    for (const name of ['esbuild', 'typescript']) manifest.devDependencies[name] = workspace.devDependencies[name]
    await writeFile(join(target, 'package.json'), json(manifest))
    return { directory: target, packageDirectory: join(target, 'package'), sdkVersion: artifact.version }
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
}

export async function checkPlugin(directory) {
  if (!directory) throw new Error('Usage: runtime-plugin-devkit.mjs check <package-directory>')
  const { runtimeManifestSchema } = await loadManifestSchema()
  return checkPackage(directory, { runtimeManifestSchema })
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [command, directory, ...extra] = process.argv.slice(2)
  if (extra.length || command === 'sdk' && directory) throw new Error('Unexpected arguments')
  const result = command === 'sdk' ? await exportSdk() : command === 'create' ? await createPlugin(directory) : command === 'check' ? await checkPlugin(directory) : undefined
  if (!result) throw new Error('Usage: runtime-plugin-devkit.mjs <sdk | create new-directory | check package-directory>')
  process.stdout.write(json(result))
}

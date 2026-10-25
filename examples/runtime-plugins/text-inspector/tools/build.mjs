/*
 * [INPUT]: Standalone provider source, manifest, license and installed local SDK tarball.
 * [OUTPUT]: Typechecked self-contained install directory; no BOAI profile changes.
 * [POS]: Independent external project build, with no source-tree aliases.
 * [PROTOCOL]: Update the example README and folder map when output changes.
 */
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { RUNTIME_API_VERSION } from '@boai/runtime-plugin-sdk'
import { runtimeManifestSchema } from '@boai/runtime-plugin-sdk/manifest'
import { checkPackage } from './check-package.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const compilerPackage = require.resolve('typescript/package.json')
const compilerManifest = JSON.parse(await readFile(compilerPackage, 'utf8'))
execFileSync(process.execPath, [resolve(dirname(compilerPackage), compilerManifest.bin.tsc), '--noEmit', '--project', join(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' })
const manifest = runtimeManifestSchema.parse(JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')))
const driver = manifest.contributions[0].driver
if (driver.kind !== 'module' || manifest.contributions[0].runtimeApiVersion !== RUNTIME_API_VERSION) throw new Error('示例要求与SDK一致的module Runtime API')
const target = join(root, 'package')
await rm(target, { recursive: true, force: true })
await mkdir(target)
await build({ absWorkingDir: root, entryPoints: ['src/index.ts'], outfile: join(target, driver.entry), bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'eof' })
await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await copyFile(join(root, 'LICENSE.txt'), join(target, 'LICENSE.txt'))
process.stdout.write(JSON.stringify(await checkPackage(target), null, 2) + '\n')

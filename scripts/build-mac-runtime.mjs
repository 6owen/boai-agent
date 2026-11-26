/*
 * [INPUT]: electron-builder staging context and the locked DuckDB macOS binding.
 * [OUTPUT]: Stages the matching DuckDB dylib beside its binding before signing.
 * [POS]: macOS arm64 electron-builder afterPack hook shared by ordinary and release builds.
 * [PROTOCOL]: Update scripts/.folder.md and the macOS packaging notes when this changes.
 */
import { execFile } from 'node:child_process'
import { access, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { Arch, Platform } from 'electron-builder'

const run = promisify(execFile)
const bindingPackage = '@duckdb/node-bindings-darwin-arm64'

export default async function afterPack({ appOutDir, arch, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin' || arch !== Arch.arm64) return

  const destination = join(packager.getResourcesDir(appOutDir), 'app.asar.unpacked/node_modules', bindingPackage)
  await access(join(destination, 'duckdb.node'))
  const store = createRequire(import.meta.resolve('@mastra/duckdb'))
  const api = createRequire(store.resolve('@duckdb/node-api'))
  const bindings = createRequire(api.resolve('@duckdb/node-bindings'))
  const source = join(dirname(bindings.resolve(`${bindingPackage}/package.json`)), 'libduckdb.dylib')
  const target = join(destination, 'libduckdb.dylib')

  // dyld loads the dylib via @rpath from duckdb.node. Keeping it outside the
  // ASAR file list avoids recording the original size and hash for the slice.
  const universal = packager.packagerOptions.targets?.get(Platform.MAC)?.has(Arch.universal)
  const { stdout } = await run('/usr/bin/lipo', ['-archs', source])
  if (universal || stdout.trim() === 'arm64') await copyFile(source, target)
  else await run('/usr/bin/lipo', [source, '-thin', 'arm64', '-output', target])
}

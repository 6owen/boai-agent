/*
 * [INPUT]: The real UI preview adapter and the production workspace external-dependency build policy.
 * [OUTPUT]: A fresh Node process can resolve canvas schema dependencies from the generated root artifact.
 * [POS]: Packaging regression; imports only, with no Electron launch, model call or personal profile.
 * [PROTOCOL]: Update Header and tests/.folder.md when this file changes.
 */
import { expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { buildWorkspace } from '../scripts/workspace-packages.mjs'

it('loads the real UI preview adapter with external packages from a root build artifact', async () => {
  const root = resolve('.')
  const directory = await mkdtemp(join(tmpdir(), 'boai-canvas-packaging-'))
  const outfile = join(directory, '.local/ui-preview-adapter/app.mjs')
  try {
    // An old local installation may contain undeclared packages. Give this root artifact
    // only the manifest's declared runtime dependencies, as on a clean CI checkout.
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      const target = join(directory, 'node_modules', name)
      await mkdir(dirname(target), { recursive: true })
      await symlink(join(root, 'node_modules', name), target, 'dir')
    }
    await buildWorkspace({ workspaceRoot: root, entryPoints: [join(root, '.github/ui-preview/app.ts')], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22', logLevel: 'silent' })
    const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', 'const adapter = await import(process.argv[1]); if (typeof adapter.createApp !== "function") throw new Error("Missing preview factory"); process.stdout.write("adapter-imported");', pathToFileURL(outfile).href], { cwd: root, timeout: 30_000 })
    expect(result.stdout).toBe('adapter-imported')
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 45_000)

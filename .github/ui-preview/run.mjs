/*
 * [INPUT]: Source checkout, output directory and DeepSeek environment configuration.
 * [OUTPUT]: Builds the small BOAI adapter and runs the upstream-derived recorder.
 * [POS]: UI preview entry; the application's pnpm build is a separate CI step.
 * [PROTOCOL]: Update this header and .folder.md when changed.
 */
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const source = resolve(process.argv[2] || '.')
const output = resolve(process.argv[3] || '.local/ui-preview-out')
if (!process.env.DEEPSEEK_API_KEY && !process.env.PLAN_FILE) throw new Error('Set DEEPSEEK_API_KEY in the local env file or the ui-preview GitHub environment')
const { buildWorkspace } = await import(pathToFileURL(join(source, 'scripts/workspace-packages.mjs')).href)
const adapter = join(source, '.local/ui-preview-adapter/app.mjs')
await mkdir(dirname(adapter), { recursive: true })
await buildWorkspace({ workspaceRoot: source, entryPoints: [join(source, '.github/ui-preview/app.ts')], outfile: adapter, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22', logLevel: 'warning' })
const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'record.mjs')], {
  cwd: source, stdio: 'inherit',
  env: { ...process.env, SRC_DIR: source, OUT_DIR: output, BOAI_PREVIEW_ADAPTER: adapter, SECRETS: process.env.DEEPSEEK_API_KEY || '' },
})
child.once('error', error => { console.error(error.message); process.exitCode = 1 })
child.once('exit', code => { process.exitCode = code ?? 1 })

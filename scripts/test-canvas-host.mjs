/*
 * [INPUT]: Current worktree canvas renderer, narrow preload, host and an isolated Electron fixture.
 * [OUTPUT]: Reproducible hidden Electron acceptance in a fresh attempt directory, with exact source/build/result evidence.
 * [POS]: WT4 host-only validation; no main app build, personal profile, visible window or model invocation.
 * [PROTOCOL]: Update Header and scripts/.folder.md when this file changes.
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { build as buildVite } from 'vite'
import react from '@vitejs/plugin-react'
import { buildWorkspace, workspaceViteAliases } from './workspace-packages.mjs'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(import.meta.url)
const output = resolve(process.env.BOAI_CANVAS_HOST_EVIDENCE ?? join(source, '.local/canvas-host-acceptance'))
await mkdir(output, { recursive: true })
const attempt = await mkdtemp(join(output, `attempt-${new Date().toISOString().replace(/[:.]/g, '-')}-`))
const rendererRoot = join(source, 'apps/electron/src/renderer'), rendererOutput = join(attempt, 'renderer')
const preload = join(attempt, 'canvas-renderer-preload.cjs'), entry = join(attempt, 'canvas-host-electron.cjs')
const report = { status: 'running', startedAt: new Date().toISOString(), attempt, source, sourceHashes: {}, phases: [], error: undefined }
const inputFiles = ['scripts/test-canvas-host.mjs', 'tests/fixtures/canvas-host-electron.ts', 'apps/electron/src/main/canvas-host.ts', 'apps/electron/src/preload/canvas-renderer.ts', 'apps/electron/src/renderer/canvas-renderer.tsx', 'apps/electron/src/renderer/canvas-renderer.html', 'packages/canvas-plugin/src/protocol.ts', 'packages/canvas-plugin/src/document.ts', 'packages/canvas-plugin/src/host.ts', 'packages/canvas-plugin/src/executor.ts', 'packages/canvas-plugin/src/editor.tsx', 'packages/canvas-plugin/package.json', 'pnpm-lock.yaml']
for (const file of inputFiles) report.sourceHashes[file] = createHash('sha256').update(await readFile(join(source, file))).digest('hex')
process.stdout.write(`Canvas host evidence: ${attempt}\n`)
try {
  await buildVite({ configFile: false, root: rendererRoot, base: './', plugins: [react()], resolve: { alias: workspaceViteAliases(source) }, optimizeDeps: { exclude: ['@tldraw/assets/imports.vite'] }, build: { outDir: rendererOutput, emptyOutDir: true, rolldownOptions: { input: join(rendererRoot, 'canvas-renderer.html') } }, logLevel: 'warn' })
  report.phases.push('dedicated-renderer-built')
  await buildWorkspace({ workspaceRoot: source, absWorkingDir: source, entryPoints: [join(source, 'apps/electron/src/preload/canvas-renderer.ts')], outfile: preload, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], logLevel: 'silent' })
  await buildWorkspace({ workspaceRoot: source, absWorkingDir: source, entryPoints: [join(source, 'tests/fixtures/canvas-host-electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], logLevel: 'silent' })
  report.phases.push('narrow-preload-and-fixture-built')
  const env = { ...process.env, BOAI_CANVAS_HOST_ATTEMPT: attempt, BOAI_CANVAS_HOST_PRELOAD: preload, BOAI_CANVAS_HOST_RENDERER: join(rendererOutput, 'canvas-renderer.html') }
  delete env.ELECTRON_RUN_AS_NODE
  const logs = { stdout: '', stderr: '' }
  const exit = await new Promise((done, reject) => {
    const child = spawn(require('electron'), [entry], { cwd: source, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 3000).unref() }, 180_000)
    child.stdout.on('data', chunk => { logs.stdout += String(chunk); process.stdout.write(chunk) })
    child.stderr.on('data', chunk => { logs.stderr += String(chunk); process.stderr.write(chunk) })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', (code, signal) => { clearTimeout(timer); done({ code, signal }) })
  })
  await writeFile(join(attempt, 'stdout.log'), logs.stdout); await writeFile(join(attempt, 'stderr.log'), logs.stderr)
  report.exit = exit
  if (exit.code !== 0) throw new Error(`Canvas host fixture exited ${exit.code ?? exit.signal}`)
  const result = JSON.parse(await readFile(join(attempt, 'result.json'), 'utf8'))
  if (!result.ok) throw new Error('Canvas host fixture did not acknowledge successful acceptance')
  report.phases.push('actual-electron-fixture-passed'); report.status = 'passed'; report.checks = result.checks.length
} catch (error) {
  report.status = 'failed'; report.error = error.stack ?? String(error); process.exitCode = 1; process.stderr.write(`${report.error}\n`)
} finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(join(attempt, 'run.json'), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(`Evidence: ${attempt}\n`)
}

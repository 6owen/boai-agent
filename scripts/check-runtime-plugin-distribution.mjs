/*
 * [INPUT]: Explicit standalone SDK/template integration check and current production installer/runner source.
 * [OUTPUT]: Real external tarball consumption and temporary install/runner lifecycle; no real model or user profile.
 * [POS]: Opt-in distribution verification, isolated from application dist and normal unit tests.
 * [PROTOCOL]: Record actual results in workspace spec 02; update spec 04 when the check changes.
 */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
import { exportSdk, createPlugin, checkPlugin } from './runtime-plugin-devkit.mjs'
import { buildWorkspace } from './workspace-packages.mjs'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extra = process.argv.slice(2)
if (extra.some(value => value !== '--offline') || extra.length > 1) throw new Error('Usage: node scripts/check-runtime-plugin-distribution.mjs [--offline]')
const temporary = await mkdtemp(join(tmpdir(), 'boai-external-runtime-'))
const environment = { ...process.env }
delete environment.NODE_PATH
delete environment.NODE_OPTIONS
const clients = []

function runnerClient(entry) {
  const child = spawn(process.execPath, [entry], { cwd: temporary, env: environment, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map(), events = []
  let sequence = 0, stderr = ''
  child.stderr.on('data', value => { stderr = (stderr + value).slice(-16000) })
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(`Runner exited: ${code}/${signal} ${stderr}`)) }
      pending.clear(); resolve({ code, signal })
    })
  })
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    let frame
    try { frame = JSON.parse(line) } catch { child.kill(); return }
    if (frame.type === 'event') { events.push(frame.event); return }
    const request = pending.get(frame.id)
    if (frame.type !== 'response' || !request) { child.kill(); return }
    pending.delete(frame.id); clearTimeout(request.timer)
    if (frame.error) request.reject(new Error(frame.error)); else request.resolve(frame.result)
  })
  const client = {
    events,
    request(method, input) {
      return new Promise((resolve, reject) => {
        const id = `external-check-${++sequence}`
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Runner timeout: ${method} ${stderr}`)); child.kill() }, 10000)
        pending.set(id, { resolve, reject, timer })
        child.stdin.write(JSON.stringify({ type: 'request', id, method, ...(input === undefined ? {} : { input }) }) + '\n')
      })
    },
    async close() {
      child.stdin.end()
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
      try { return await closed } finally { clearTimeout(timer); lines.close() }
    },
  }
  clients.push(client)
  return client
}

try {
  const sdk = await exportSdk(join(temporary, 'artifacts'))
  const consumer = join(temporary, 'consumer')
  await createPlugin(consumer, { sdk })
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  await run(pnpm, ['install', '--ignore-scripts', ...extra], { cwd: consumer, env: environment, timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
  await run(pnpm, ['typecheck'], { cwd: consumer, env: environment, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
  await run(pnpm, ['build'], { cwd: consumer, env: environment, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
  await run(pnpm, ['check'], { cwd: consumer, env: environment, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
  const installedSdk = join(consumer, 'node_modules/@boai/runtime-plugin-sdk')
  const sdkManifest = JSON.parse(await readFile(join(installedSdk, 'package.json'), 'utf8'))
  assert.equal(sdkManifest.name, sdk.name)
  assert.equal(sdkManifest.version, sdk.version)
  assert.equal(sdkManifest.private, true)
  assert(!JSON.stringify(sdkManifest).includes('workspace:'))
  assert(!JSON.stringify(sdkManifest).includes(root))
  assert(!(await readdir(installedSdk)).includes('src'))
  for (const value of Object.values(sdkManifest.exports)) if (typeof value === 'object') {
    assert(value.types.endsWith('.d.ts')); assert(value.default.endsWith('.mjs')); assert.equal(value.development, undefined)
    await readFile(join(installedSdk, value.types)); await readFile(join(installedSdk, value.default))
  }
  await run(process.execPath, ['--input-type=module', '-e', "const api = await import('@boai/runtime-plugin-sdk'); const schema = await import('@boai/runtime-plugin-sdk/manifest'); if (api.RUNTIME_API_VERSION !== 2 || !schema.runtimeManifestSchema) throw new Error('SDK import failed')"], { cwd: consumer, env: environment, timeout: 10000 })
  const packageDirectory = join(consumer, 'package'), checked = await checkPlugin(packageDirectory)
  const host = join(temporary, 'host')
  await buildWorkspace({ absWorkingDir: root, entryPoints: [join(root, 'packages/runtime/src/modules/backends/runtime-plugins.ts'), join(root, 'packages/runtime/src/adapters/plugins/runner.ts')], outdir: host, outExtension: { '.js': '.mjs' }, entryNames: '[name]', bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' })
  const { RuntimePlugins } = await import(pathToFileURL(join(host, 'runtime-plugins.mjs')).href)
  const registry = join(temporary, 'registry'), emptyBundle = join(temporary, 'empty-bundle')
  const manager = new RuntimePlugins(registry, emptyBundle); await manager.init()
  const installed = await manager.install(packageDirectory, 0)
  assert.equal(installed.plugins[0].packageHash, checked.packageHash)
  await assert.rejects(manager.install(packageDirectory, 0), /插件列表已变化/)
  const restarted = new RuntimePlugins(registry, emptyBundle); await restarted.init()
  const ref = { pluginId: checked.id, providerId: 'text-inspector', packageHash: checked.packageHash }
  assert.equal(restarted.resolve(ref).hash, checked.packageHash)
  const lease = await restarted.acquire(ref)
  await assert.rejects(restarted.uninstall(ref.pluginId, 1), /仍在执行/)
  const launch = { executable: process.execPath, runtime: 'node', args: [], cwd: temporary, privateHome: join(temporary, 'private'), config: { includePreview: true } }
  await mkdir(launch.privateHome)
  const client = runnerClient(join(host, 'runner.mjs'))
  assert.equal(await client.request('initialize', { entry: lease.entry, runtimeApiVersion: 2, launch }), true)
  const probe = await client.request('probe')
  assert.equal(probe.protocolVersion, 1)
  assert.deepEqual(probe.capabilities, { chat: 'supported', resume: 'unsupported', images: 'unsupported', tools: 'unsupported', actions: 'unsupported', steer: 'unsupported', followUp: 'unsupported' })
  assert.equal(typeof (await client.request('openSession', { instructions: '', tools: [] })).sessionId, 'string')
  const result = await client.request('submit', { requestId: 'first', text: 'Hello 世界\nline 2', images: [] })
  assert.equal(result.text, 'Text Inspector（确定性示例）\n字符（Unicode码点）: 15\n词段（空白分隔）: 4\n行数: 2\n\n文本预览（最多300个码点）:\nHello 世界\nline 2')
  assert.deepEqual(client.events.map(event => event.type), ['input.accepted', 'message.delta', 'message.completed', 'session.idle'])
  assert.equal(client.events[0].requestId, 'first'); assert.equal(client.events[2].text, result.text)
  await assert.rejects(client.request('submit', { requestId: 'image', text: '', images: ['unsupported'] }), /不支持图片/)
  assert.equal(client.events.length, 4)
  assert.deepEqual(await client.request('inspect'), { state: 'idle' })
  await client.request('closeSession')
  assert.equal((await client.close()).code, 0)
  lease.release()

  const incompatible = join(temporary, 'incompatible'); await mkdir(incompatible)
  const manifest = JSON.parse(await readFile(join(packageDirectory, 'manifest.json'), 'utf8')); manifest.id = 'example.incompatible'
  await writeFile(join(incompatible, 'manifest.json'), JSON.stringify(manifest))
  await copyFile(join(packageDirectory, 'LICENSE.txt'), join(incompatible, 'LICENSE.txt'))
  await writeFile(join(incompatible, 'plugin.mjs'), 'export const runtimeApiVersion = 1; export const createRuntime = () => { throw new Error("must not instantiate") }')
  const negative = await restarted.install(incompatible, 1), item = negative.plugins.find(value => value.manifest.id === manifest.id)
  const rejectedLease = await restarted.acquire({ pluginId: manifest.id, providerId: 'text-inspector', packageHash: item.packageHash })
  const rejected = runnerClient(join(host, 'runner.mjs'))
  await assert.rejects(rejected.request('initialize', { entry: rejectedLease.entry, runtimeApiVersion: 2, launch }), /插件Runtime API不兼容/)
  assert.equal((await rejected.close()).code, 0); rejectedLease.release()
  await restarted.uninstall(manifest.id, 2)
  await restarted.uninstall(ref.pluginId, 3)
  assert.equal(restarted.snapshot().plugins.length, 0)
  process.stdout.write(JSON.stringify({ sdk: `${sdk.name}@${sdk.version}`, externalInstall: true, typecheck: true, build: true, preflight: true, installedPackageHash: checked.packageHash, runnerLifecycle: true, incompatibleApiRejected: true, realModel: false, userProfile: false }, null, 2) + '\n')
} finally {
  await Promise.allSettled(clients.map(client => client.close()))
  await rm(temporary, { recursive: true, force: true })
}

/*
 * [INPUT]: Actual Electron/Sparkle binaries and the production AppUpdates coordinator.
 * [OUTPUT]: Isolated ad-hoc bundles, Ed25519 feed, real delta/full installation and failure evidence.
 * [POS]: Opt-in macOS native updater fixture; never uses the personal application or Keychain key.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { _electron, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, cp, rm, stat, readdir, rename } from 'node:fs/promises'
import { dirname, join, basename, resolve } from 'node:path'
import { build } from 'esbuild'
// @ts-expect-error Shared Node release module.
import { prepareElectronDist } from '../../../scripts/release-updates.mjs'

const require = createRequire(import.meta.url)
const sparkle = dirname(dirname(require.resolve('electron-sparkle-updater')))
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
export type UpdateProbeMode = 'delta-quit' | 'delta-fallback-restart' | 'invalid-full'

export async function probeNativeUpdate(root: string, mode: UpdateProbeMode) {
  const requests: string[] = [], events: unknown[] = []
  const assets = join(root, 'assets'), profile = join(root, 'profile'), installed = join(root, 'installed/BoAI Update Probe.app')
  for (const directory of [assets, profile, dirname(installed)]) await mkdir(directory, { recursive: true })
  const server = createServer(async (req, res) => {
    const name = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname).slice(1)
    requests.push(name)
    try {
      if (basename(name) !== name) throw Error('invalid request')
      if (name === 'appcast.xml') {
        const xml = await readFile(join(assets, name), 'utf8')
        res.setHeader('Content-Type', 'application/xml')
        res.end(mode === 'invalid-full' ? xml.replace(/<sparkle:deltas>[\s\S]*?<\/sparkle:deltas>/g, '') : xml)
      } else {
        const path = join(assets, name), info = await stat(path)
        res.setHeader('Content-Length', info.size)
        if (mode === 'delta-fallback-restart' && name.endsWith('.delta') || mode === 'invalid-full' && name.endsWith('.zip')) {
          const bytes = await readFile(path); bytes[bytes.length - 1] ^= 0xff; res.end(bytes)
        } else createReadStream(path).pipe(res)
      }
    } catch { res.statusCode = 404; res.end() }
  })
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept))
  const port = (server.address() as { port: number }).port, feedUrl = `http://127.0.0.1:${port}/appcast.xml`
  const keys = generateKeyPairSync('ed25519'), privateKey = keys.privateKey.export({ format: 'jwk' }), publicKey = Buffer.from(keys.publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('base64')
  const keyFile = join(root, 'ephemeral-key'), log = join(profile, 'events.jsonl'), sentinel = join(profile, 'user-file.txt')
  await writeFile(keyFile, Buffer.from(privateKey.d!, 'base64url').toString('base64'), { mode: 0o600 })
  await writeFile(sentinel, 'PERSISTED-USER-DATA')
  const id = `com.boai.updateprobe.${randomUUID()}`
  let application: Awaited<ReturnType<typeof _electron.launch>> | undefined
  try {
    const old = join(root, 'old/BoAI Update Probe.app'), newer = join(root, 'new/BoAI Update Probe.app')
    await mkdir(dirname(old)); await mkdir(dirname(newer))
    const dist = await prepareElectronDist(join(root, 'electron-dist'))
    run('/usr/bin/ditto', [join(dist, 'Electron.app'), old])
    await rm(dist, { recursive: true })
    await rename(join(old, 'Contents/MacOS/Electron'), join(old, 'Contents/MacOS/BoAI Update Probe'))
    const resources = join(old, 'Contents/Resources'), source = join(resources, 'app')
    await rm(join(resources, 'default_app.asar'), { force: true })
    await mkdir(source)
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'boai-update-probe', version: '6.0.1', main: 'index.cjs' }))
    const entry = `
      import { app, BrowserWindow } from 'electron';
      import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
      import { AppUpdates } from ${JSON.stringify(resolve('apps/electron/src/main/app-updates.ts'))};
      app.setPath('userData', ${JSON.stringify(profile)});
      const log = value => appendFileSync(${JSON.stringify(log)}, JSON.stringify({at:Date.now(),pid:process.pid,...value})+'\\n');
      let approved=false;
      const updates=new AppUpdates(app.getVersion(), state=>log({state}), error=>log({error}));
      globalThis.probe={updates};
      app.whenReady().then(async()=>{
        const win=new BrowserWindow({width:480,height:240,show:false});
        await win.loadURL('data:text/html,BOAI update probe');
        log({started:app.getVersion(),packaged:app.isPackaged});
        if(app.getVersion()==='6.0.2') { setTimeout(()=>{approved=true;app.quit()},500); return; }
        const {loadSparkleBridgeForApp}=await import('electron-sparkle-updater');
        const bridge=await loadSparkleBridgeForApp(error=>log({error}));
        if(!bridge) throw Error('native bridge missing');
        updates.start(bridge,${JSON.stringify({ feedUrl, publicKey })});
      });
      app.on('before-quit',event=>{
        if(approved)return;
        event.preventDefault();
        setTimeout(()=>{
          writeFileSync(${JSON.stringify(join(profile, 'drained.txt'))},'DRAINED');
          log({drained:true}); approved=true;
          if(!updates.finishQuit())app.quit();
        },200);
      });
    `
    await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, outfile: join(source, 'index.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'electron-sparkle-updater'], logLevel: 'silent' })
    const target = join(source, 'node_modules/electron-sparkle-updater')
    await mkdir(target, { recursive: true })
    for (const item of ['dist', 'package.json', 'LICENSE']) await cp(join(sparkle, item), join(target, item), { recursive: true })
    const native = join(resources, 'app.asar.unpacked/node_modules/electron-sparkle-updater/native/build/Release')
    await mkdir(native, { recursive: true })
    await cp(join(sparkle, 'native/build/Release/sparkle_bridge.node'), join(native, 'sparkle_bridge.node'))
    run('/usr/bin/ditto', [join(sparkle, 'native/vendor/Sparkle.framework'), join(old, 'Contents/Frameworks/Sparkle.framework')])
    const plist = join(old, 'Contents/Info.plist')
    const values = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]))
    Object.assign(values, { CFBundleIdentifier: id, CFBundleName: 'BoAI Update Probe', CFBundleExecutable: 'BoAI Update Probe', CFBundleShortVersionString: '6.0.1', CFBundleVersion: '6.0.1', SUFeedURL: feedUrl, SUPublicEDKey: publicKey, SUEnableInstallerLauncherService: false, SUDeltaChainHistory: 0, NSAppTransportSecurity: { NSAllowsLocalNetworking: true } })
    await writeFile(plist, JSON.stringify(values)); run('/usr/bin/plutil', ['-convert', 'xml1', plist])
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', old])
    run('/usr/bin/ditto', [old, newer])
    const nextPlist = join(newer, 'Contents/Info.plist')
    await writeFile(nextPlist, JSON.stringify({ ...values, CFBundleShortVersionString: '6.0.2', CFBundleVersion: '6.0.2' }))
    run('/usr/bin/plutil', ['-convert', 'xml1', nextPlist])
    await writeFile(join(newer, 'Contents/Resources/app/package.json'), JSON.stringify({ name: 'boai-update-probe', version: '6.0.2', main: 'index.cjs' }))
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', newer])
    for (const [path, version] of [[old, '6.0.1'], [newer, '6.0.2']]) {
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', path])
      run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path, join(assets, `Probe-${version}.zip`)])
    }
    run(join(sparkle, 'native/vendor/bin/generate_appcast'), [assets, '--ed-key-file', keyFile, '--download-url-prefix', `http://127.0.0.1:${port}/`, '--maximum-deltas', '1', '--maximum-versions', '1', '--versions', '6.0.2'])
    expect((await readdir(assets)).some(name => name.endsWith('.delta'))).toBe(true)
    await rm(keyFile)
    run('/usr/bin/ditto', [old, installed])
    const binary = join(installed, 'Contents/MacOS/BoAI Update Probe')
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
    application = await _electron.launch({ executablePath: binary, env, timeout: 30_000 })
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true)
    const snapshot = () => application!.evaluate(() => (globalThis as unknown as { probe: { updates: { snapshot(): { phase: string; error?: string } } } }).probe.updates.snapshot())
    await expect.poll(async () => (await snapshot()).phase, { timeout: 90_000, message: 'actual Sparkle download/verification' }).toBe(mode === 'invalid-full' ? 'error' : 'ready')
    const state = await snapshot()
    expect(JSON.parse(await readFile(join(installed, 'Contents/Resources/app/package.json'), 'utf8')).version).toBe('6.0.1')
    expect(await readFile(sentinel, 'utf8')).toBe('PERSISTED-USER-DATA')
    if (mode === 'invalid-full') {
      expect(state.error).toBeTruthy()
      expect(requests).toContain('Probe-6.0.2.zip')
    } else {
      expect(requests.some(name => name.endsWith('.delta'))).toBe(true)
      expect(requests.includes('Probe-6.0.2.zip')).toBe(mode === 'delta-fallback-restart')
      const closed = application.waitForEvent('close', { timeout: 30_000 })
      await application.evaluate(({ app }, restart) => {
        const probe = (globalThis as unknown as { probe: { updates: { requestInstall(version: string, quit: () => void): void } } }).probe
        if (restart) probe.updates.requestInstall('6.0.2', () => app.quit()); else app.quit()
      }, mode === 'delta-fallback-restart')
      await closed
      application = undefined
      await expect.poll(async () => JSON.parse(await readFile(join(installed, 'Contents/Resources/app/package.json'), 'utf8')).version, { timeout: 30_000 }).toBe('6.0.2')
      expect(await readFile(join(profile, 'drained.txt'), 'utf8')).toBe('DRAINED')
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', installed])
      if (mode === 'delta-fallback-restart') {
        await expect.poll(async () => (await readFile(log, 'utf8')).includes('"started":"6.0.2"'), { timeout: 30_000 }).toBe(true)
        const restarted = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).find(row => row.started === '6.0.2')
        await expect.poll(() => { try { process.kill(restarted.pid, 0); return false } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; throw error } }, { timeout: 15_000, message: 'restarted fixture must actually exit before deleting its profile' }).toBe(true)
      }
    }
    expect(await readFile(sentinel, 'utf8')).toBe('PERSISTED-USER-DATA')
    events.push(...(await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)))
    return { mode, requests, state, events, deltaBytes: (await Promise.all((await readdir(assets)).filter(name => name.endsWith('.delta')).map(async name => (await stat(join(assets, name))).size)))[0], fullBytes: (await stat(join(assets, 'Probe-6.0.2.zip'))).size }
  } finally {
    if (application) await application.close().catch(() => {})
    await writeFile(join(root, 'probe-evidence.json'), JSON.stringify({ mode, requests, events: await readFile(log, 'utf8').catch(() => '') }, null, 2))
    await rm(keyFile, { force: true })
    server.closeAllConnections()
    await new Promise<void>(accept => server.close(() => accept()))
  }
}

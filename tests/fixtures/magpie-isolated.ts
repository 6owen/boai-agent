/*
 * [INPUT]: Explicit macOS installed-binary experiment, fresh directory and one controlled upstream port.
 * [OUTPUT]: Sandboxed Magpie with synthetic configuration, tested filesystem/network boundaries and tracked process exit.
 * [POS]: Opt-in gateway fault fixture; never starts/stops the user's service or changes personal CLI settings.
 * [PROTOCOL]: Update Header, fixtures/.folder.md and the Magpie ledger when changing this fixture.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const binary = '/Applications/magpie.app/Contents/MacOS/magpie'
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms))
export async function isolatedMagpie(directory: string, upstreamPort: number) {
  if (process.platform !== 'darwin') throw Error('This installed-binary fixture requires macOS sandbox-exec')
  const allowed = join(directory, 'magpie'); await mkdir(allowed)
  for (const name of ['config', 'cache', 'data', 'state', 'tmp']) await mkdir(join(allowed, name))
  const reserve = createServer(); await new Promise<void>(done => reserve.listen(0, '127.0.0.1', done))
  const port = (reserve.address() as { port: number }).port; await new Promise<void>(done => reserve.close(() => done()))
  if (port === 3425 || upstreamPort === 3425) throw Error('Personal gateway port is excluded')
  const origin = `http://127.0.0.1:${port}`
  // HOME retains its original value; the OS policy, not a redirected personal home, enforces isolation.
  const env: NodeJS.ProcessEnv = { HOME: process.env.HOME, PATH: '/usr/bin:/bin', MAGPIE_NO_ACCOUNTS: '1', MAGPIE_ADDR: `127.0.0.1:${port}`, TMPDIR: join(allowed, 'tmp'), XDG_CONFIG_HOME: join(allowed, 'config'), XDG_CACHE_HOME: join(allowed, 'cache'), XDG_DATA_HOME: join(allowed, 'data'), XDG_STATE_HOME: join(allowed, 'state') }
  const q = (value: string) => JSON.stringify(value)
  const policy = (executables: string[]) => `(version 1)
(allow default)
(deny file-read-data (require-all (subpath "/Users") (require-not (subpath ${q(allowed)}))))
(deny file-read-data (subpath "/Library/Keychains") (subpath "/private/var/db") (subpath "/var/db"))
(deny file-write* (require-not (require-any (subpath ${q(allowed)}) (literal "/dev/null"))))
(deny mach-lookup)
(deny network-outbound (require-not (remote ip "localhost:${upstreamPort}")))
(deny network-bind (require-not (local ip "localhost:${port}")))
(deny network-inbound (require-not (local ip "localhost:${port}")))
(deny process-exec (require-not (require-any ${executables.map(path => `(literal ${q(path)})`).join(' ')})))
`
  const profile = join(directory, 'magpie.sb'), probeProfile = join(directory, 'probe.sb')
  await writeFile(profile, policy([binary])); await writeFile(probeProfile, policy(['/bin/sh', '/bin/bash', '/usr/bin/curl']))
  const processes: { args: string[]; pid?: number; stdout: string; stderr: string; code?: number | null; signal?: string | null }[] = []
  function launch(executable: string, args: string[], sandbox = profile) {
    const row: typeof processes[number] = { args: [executable, ...args], stdout: '', stderr: '' }; processes.push(row)
    const child = spawn('/usr/bin/sandbox-exec', ['-f', sandbox, executable, ...args], { cwd: allowed, env, stdio: ['ignore', 'pipe', 'pipe'] })
    row.pid = child.pid
    child.stdout.on('data', data => { row.stdout += String(data) }); child.stderr.on('data', data => { row.stderr += String(data) })
    const exited = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { row.code = code; row.signal = signal; resolve() }) })
    return { child, row, exited }
  }
  async function command(executable: string, args: string[], sandbox = profile) {
    const run = launch(executable, args, sandbox)
    const timer = setTimeout(() => run.child.kill('SIGKILL'), 20000)
    try { await run.exited; if (run.row.code !== 0) throw Error(`Isolated command failed: ${args[0]}: ${run.row.stderr || run.row.signal}`); return run.row.stdout }
    finally { clearTimeout(timer); await writeFile(join(directory, 'commands.json'), JSON.stringify(processes, null, 2)) }
  }
  const outside = join(directory, 'sentinel.txt'); await writeFile(outside, 'SYNTHETIC_SENTINEL')
  let deniedRequests = 0
  const denied = createServer((_request, response) => { deniedRequests++; response.end('must not be reached') })
  await new Promise<void>(done => denied.listen(0, '127.0.0.1', done))
  const deniedPort = (denied.address() as { port: number }).port
  try {
    await command('/bin/sh', ['-c', 'if IFS= read -r value < "$1"; then exit 21; fi; if (printf changed > "$1"); then exit 22; fi; printf allowed > "$2"', 'probe', outside, join(allowed, 'allowed.txt')], probeProfile)
    await command('/usr/bin/curl', ['-q', '--fail', '--max-time', '2', `http://127.0.0.1:${upstreamPort}/isolation-probe`], probeProfile)
    const blocked = launch('/usr/bin/curl', ['-q', '--fail', '--max-time', '2', `http://127.0.0.1:${deniedPort}/denied`], probeProfile); await blocked.exited
    if (blocked.row.code === 0 || deniedRequests || await readFile(outside, 'utf8') !== 'SYNTHETIC_SENTINEL' || await readFile(join(allowed, 'allowed.txt'), 'utf8') !== 'allowed') throw Error('OS isolation probe failed')
  } finally { denied.closeAllConnections(); await new Promise<void>(done => denied.close(() => done())) }
  const version = (await command(binary, ['version'])).trim()
  if (version !== 'magpie 0.1.1277') throw Error(`Review the newly installed version before testing: ${version}`)
  const binaryHash = createHash('sha256').update(await readFile(binary)).digest('hex')
  let running: ReturnType<typeof launch> | undefined
  async function stop(signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') {
    const run = running; if (!run) return
    if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill(signal)
    const timer = setTimeout(() => run.child.kill('SIGKILL'), 5000)
    try { await run.exited } finally { clearTimeout(timer); running = undefined }
  }
  const save = async () => {
    const binaryHashAfter = createHash('sha256').update(await readFile(binary)).digest('hex')
    await writeFile(join(directory, 'isolation.json'), JSON.stringify({ version, binary, binaryHash, binaryHashAfter, origin, upstreamPort, accountDiscovery: false, homeValueChanged: false, deniedRequests, processes, allExited: processes.every(row => row.code !== undefined) }, null, 2))
    if (binaryHashAfter !== binaryHash) throw Error('Installed Magpie binary changed during the experiment')
  }
  await save()
  return {
    origin, version, binaryHash, processes, command: (args: string[]) => command(binary, args), stop, save,
    get pid() { return running?.child.pid },
    async start() {
      if (running) throw Error('Previous Magpie process has not exited')
      running = launch(binary, ['serve'])
      try {
        for (let i = 0; i < 100; i++) {
          if (running.row.code !== undefined) throw Error(`Isolated gateway exited: ${running.row.stderr}`)
          try { const response = await fetch(origin + '/api/hello', { signal: AbortSignal.timeout(200) }); if (response.ok && (await response.json()).version === '0.1.1277') return } catch { /* The same owned process is still starting. */ }
          await delay(50)
        }
        throw Error('Isolated gateway did not become ready')
      } catch (error) { await stop(); throw error }
    },
    async close() { await stop(); await save() },
  }
}

/*
 * [INPUT]: Built native guard, actual shell/HTTP listener and isolated workspace directories.
 * [OUTPUT]: Preview/raw PTY input and resize; immediate descendant disappearance and mandatory cleanup receipts.
 * [POS]: Real local process integration; no Electron E2E or external model calls.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm, mkdir, writeFile, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { get } from 'node:http'
import { TerminalService } from '../src/runtime/modules/workspace-tools/terminal-service'
import { PreviewService } from '../src/runtime/modules/workspace-tools/preview-service'
const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const f of clean.splice(0).reverse()) await f(); vi.unstubAllEnvs() })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-workspace-'))); clean.push(() => rm(root, { recursive: true, force: true }))
  vi.stubEnv('HOME', root)
  const terminal = new TerminalService(root), preview = new PreviewService(terminal)
  clean.push(() => terminal.close()); clean.push(() => preview.close())
  await terminal.recover()
  return { root, terminal, preview, scope: { employeeId: 'bobo', conversationId: 'isolated' } }
}
const request = (url: string) => new Promise<{ code: number; text: string }>((done, reject) => { get(url, result => { let text = ''; result.setEncoding('utf8'); result.on('data', value => { text += value }); result.on('end', () => done({ code: result.statusCode!, text })) }).on('error', reject) })
it('runs a real PTY and preserves directory/environment with actual exit status and Unicode output', async () => {
  const f = await fixture(); await mkdir(join(f.root, 'next'))
  const session = await f.terminal.create(f.scope, f.root)
  const first = await f.terminal.exec(session.id, 'test -t 0 && cd next && export BOAI_TEST_VALUE=持久变量')
  expect(first).toMatchObject({ status: 'exited', exitCode: 0 })
  const second = await f.terminal.exec(session.id, 'printf "%s\\n" "$PWD" "$BOAI_TEST_VALUE"; false')
  expect(second).toMatchObject({ status: 'exited', exitCode: 1 }); expect(second.output).toContain(join(f.root, 'next')); expect(second.output).toContain('持久变量')
  const read = f.terminal.read(session.id); expect(read.text).toContain('持久变量'); expect(f.terminal.read(session.id, read.cursor).text).toBe('')
})
it('resizes the same shell and returns a running command without silently retrying it', async () => {
  const f = await fixture(), session = await f.terminal.create(f.scope, f.root)
  f.terminal.resize(session.id, 81, 23)
  const size = await f.terminal.exec(session.id, 'stty size')
  expect(size.output).toContain('23 81')
  const pending = await f.terminal.exec(session.id, 'while [ ! -f release-command ]; do sleep 0.01; done; echo done-once', 100)
  expect(pending.status).toBe('running')
  await expect(f.terminal.exec(session.id, 'echo duplicate')).rejects.toThrow('仍在运行')
  await writeFile(join(f.root, 'release-command'), 'release once')
  await expect.poll(() => f.terminal.execution(session.id)?.status).toBe('exited')
  expect(f.terminal.execution(session.id)?.output.match(/done-once/g)).toHaveLength(1)
})
it('waits for background descendants to exit before acknowledging terminal kill', async () => {
  const f = await fixture(), session = await f.terminal.create(f.scope, f.root)
  await f.terminal.exec(session.id, `sleep 120 & echo $! > child.pid`)
  const pid = Number((await readFile(join(f.root, 'child.pid'), 'utf8')).trim())
  expect(() => process.kill(pid, 0)).not.toThrow()
  await f.terminal.kill(session.id)
  expect(() => process.kill(pid, 0)).toThrow()
  expect(f.terminal.read(session.id).session.status).toBe('exited')
})
it('interrupts a foreground command and accepts the next exec after the real shell prompt returns', async () => {
  const f = await fixture(), session = await f.terminal.create(f.scope, f.root)
  expect((await f.terminal.exec(session.id, 'printf foreground-ready; sleep 120', 100)).status).toBe('running')
  await expect.poll(() => f.terminal.execution(session.id)?.output).toContain('foreground-ready')
  await f.terminal.write(session.id, '\u0003')
  await expect.poll(() => f.terminal.execution(session.id)?.status).toBe('exited')
  expect(f.terminal.execution(session.id)?.exitCode).toBe(130)
  const next = await f.terminal.exec(session.id, 'printf next-command')
  expect(next).toMatchObject({ status: 'exited', exitCode: 0, output: 'next-command' })
})
it('does not report an empty static directory as a ready webpage', async () => {
  const f = await fixture()
  expect(await f.preview.start(f.scope, f.root)).toMatchObject({ status: 'failed' })
})
it('provides a static page, rejects private/traversal/symlink files and really stops its listener', async () => {
  const f = await fixture(); await mkdir(join(f.root, 'site')); await writeFile(join(f.root, 'site/index.html'), '<h1>actual preview</h1>')
  await writeFile(join(f.root, 'secret.txt'), 'private'); await symlink(join(f.root, 'secret.txt'), join(f.root, 'site/escape.txt'))
  const p = await f.preview.start(f.scope, join(f.root, 'site'))
  expect(p.status).toBe('ready'); expect(await request(p.url)).toEqual({ code: 200, text: '<h1>actual preview</h1>' })
  expect((await request(`${p.url}escape.txt`)).code).toBe(403)
  expect((await request(`${p.url}.env`)).code).toBe(403)
  await f.preview.stop(p.id); await expect(request(p.url)).rejects.toThrow()
})
it('starts an actual development command in a visible terminal and closes both server and shell', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'server.cjs'), `require('node:http').createServer((q,s)=>s.end('development ready')).listen(Number(process.env.PORT),'127.0.0.1')`)
  const p = await f.preview.start(f.scope, f.root, `${JSON.stringify(process.execPath)} server.cjs`)
  expect(p.status).toBe('ready'); expect(p.terminalId).toBeTruthy(); expect((await request(p.url)).text).toBe('development ready')
  await f.preview.clearConversation(f.scope.conversationId)
  expect(f.terminal.info(p.terminalId!).status).toBe('exited'); await expect(request(p.url)).rejects.toThrow()
})

it('starts a raw login shell without preview hooks and accepts input and confirmed resize', async () => {
  const f = await fixture()
  const loginFile = process.platform === 'darwin' ? '.zprofile' : '.bash_profile'
  const rcFile = process.platform === 'darwin' ? '.zshrc' : '.bashrc'
  await writeFile(join(f.root, loginFile), 'export BOAI_INTERACTIVE_LOGIN=interactive-login-loaded\nprintf "LOGIN-INIT\\n"\n')
  await writeFile(join(f.root, rcFile), 'PS1="RAW-PROMPT> "\n')
  let output = ''
  const interactive = new TerminalService(f.root, { purpose: 'interactive', onData: (_id, data) => { output += data } })
  clean.push(() => interactive.close())
  await interactive.recover()
  const session = await interactive.create(f.scope, f.root)
  await expect.poll(() => output).toContain('LOGIN-INIT')
  await interactive.resizeConfirmed(session.id, 81, 23)
  await interactive.write(session.id, 'printf "%s\\n" "$BOAI_INTERACTIVE_LOGIN"; stty size > interactive-size.txt\n')
  await expect.poll(async () => { try { return (await readFile(join(f.root, 'interactive-size.txt'), 'utf8')).trim() } catch { return '' } }).toBe('23 81')
  await expect.poll(() => output).toContain('interactive-login-loaded')
  expect(output).not.toContain('633;BOAI;prompt')
  await interactive.write(session.id, 'exit\n')
  await expect.poll(() => interactive.info(session.id).status).toBe('exited')
  expect((await interactive.kill(session.id)).status).toBe('exited')
})

it('recovers and closes user terminals without killing preview shells and confirms descendant exit', async () => {
  const f = await fixture(), previewShell = await f.terminal.create(f.scope, f.root)
  const interactive = new TerminalService(f.root, { purpose: 'interactive' })
  clean.push(() => interactive.close())
  // Recovering this independent ledger must not consider the live preview process an orphan.
  await interactive.recover()
  const userShell = await interactive.create(f.scope, f.root)
  await interactive.write(userShell.id, 'sleep 120 & echo $! > interactive-child.pid\n')
  await expect.poll(async () => { try { return Number((await readFile(join(f.root, 'interactive-child.pid'), 'utf8')).trim()) } catch { return 0 } }).toBeGreaterThan(0)
  const childPid = Number((await readFile(join(f.root, 'interactive-child.pid'), 'utf8')).trim())
  expect(() => process.kill(childPid, 0)).not.toThrow()
  await interactive.kill(userShell.id)
  expect(() => process.kill(childPid, 0)).toThrow()
  expect(f.terminal.info(previewShell.id).status).toBe('running')
  expect(await f.terminal.exec(previewShell.id, 'printf preview-still-alive')).toMatchObject({ status: 'exited', exitCode: 0, output: 'preview-still-alive' })
})

it('services resize and Ctrl-C during continuous PTY output before accepting another command', async () => {
  const f = await fixture()
  const rc = 'PS1="PTY-READY> "\n'
  await writeFile(join(f.root, process.platform === 'darwin' ? '.zshrc' : '.bash_profile'), rc)
  let tail = '', streaming = false
  const interactive = new TerminalService(f.root, { purpose: 'interactive', onData: (_id, data) => {
    tail = (tail + data).slice(-8192)
    if (tail.includes('BOAI_STREAM_DATA\r\nBOAI_STREAM_DATA')) streaming = true
  } })
  clean.push(() => interactive.close())
  await interactive.recover()
  const session = await interactive.create(f.scope, f.root)
  await expect.poll(() => tail).toContain('PTY-READY> ')
  await interactive.write(session.id, 'yes BOAI_STREAM_DATA\n')
  await expect.poll(() => streaming).toBe(true)
  await interactive.resizeConfirmed(session.id, 87, 19)
  tail = ''
  await interactive.write(session.id, '\u0003')
  await expect.poll(() => tail).toContain('PTY-READY> ')
  await interactive.write(session.id, 'stty size > responsive-size.txt\n')
  await expect.poll(async () => { try { return (await readFile(join(f.root, 'responsive-size.txt'), 'utf8')).trim() } catch { return '' } }).toBe('19 87')
  expect((await interactive.kill(session.id)).status).toBe('exited')
})


it('rejects terminal kill when the supervisor exits without a descendant cleanup receipt', async () => {
  const f = await fixture(), guard = join(f.root, 'unconfirmed-guard.cjs')
  await writeFile(guard, '#!/usr/bin/env node\nif (process.argv[2] === "--recover") process.exit(0);\nprocess.on("SIGTERM", () => process.exit(0));\nprocess.stdin.resume();\nprocess.stdout.write(JSON.stringify({ type: "ready" }) + "\\n");\n', { mode: 0o700 })
  vi.stubEnv('BOAI_NATIVE_PROCESS_GUARD', guard)
  const interactive = new TerminalService(f.root, { purpose: 'interactive' })
  const session = await interactive.create(f.scope, f.root)
  await expect(interactive.kill(session.id)).rejects.toThrow('子进程清理尚未确认')
  await expect(interactive.kill(session.id)).rejects.toThrow('子进程清理尚未确认')
})

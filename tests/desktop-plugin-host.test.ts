/*
 * [INPUT]: Actual child processes with fixture-only output and an abort signal.
 * [OUTPUT]: Literal argv delivery, credential isolation and actual cancellation/exit evidence.
 * [POS]: Desktop process boundary tests; no OS app or model is invoked.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDesktopCommand } from '../packages/desktop-plugin/src/host'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); vi.unstubAllEnvs() })
it('delivers shell syntax literally and excludes unrelated host credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-ad-process-')); roots.push(root)
  const script = join(root, 'literal.cjs')
  await writeFile(script, `process.stdout.write(JSON.stringify({version:'2.6',ok:true,command:'fixture',data:{args:process.argv.slice(2),private:process.env.BOAI_DESKTOP_FIXTURE_SECRET??null}}))`)
  vi.stubEnv('BOAI_DESKTOP_FIXTURE_SECRET', 'private-host-token')
  const literal = '$(touch /tmp/never-created); `not-a-command`'
  const result = await runDesktopCommand(process.execPath, [script, literal], join(root, 'state'), 'owned-session', new AbortController().signal)
  expect(JSON.parse((result.content[0] as { text: string }).text).data).toEqual({ args: [literal], private: null })
})
it('rejects an aborted call only after its native process has actually exited', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-ad-cancel-')); roots.push(root)
  const script = join(root, 'wait.cjs'), pidFile = join(root, 'pid')
  await writeFile(script, `require('node:fs').writeFileSync(process.argv[2],String(process.pid));setInterval(()=>{},1000)`)
  const controller = new AbortController()
  const call = runDesktopCommand(process.execPath, [script, pidFile], join(root, 'state'), 'owned-session', controller.signal)
  const rejected = expect(call).rejects.toThrow()
  let pid = 0
  await vi.waitFor(async () => { pid = Number(await readFile(pidFile, 'utf8')); expect(pid).toBeGreaterThan(0) })
  controller.abort(new Error('fixture cancellation'))
  await rejected
  expect(() => process.kill(pid, 0)).toThrow()
})

/*
 * [INPUT]: Shipped Bash launchers and isolated fake CLI/dependency executables.
 * [OUTPUT]: Exact argument forwarding, pinned fallback, proxy precedence and exit status; no real account or network calls.
 * [POS]: Social skill launcher regression; real upstream --help/--version runs are recorded separately.
 * [PROTOCOL]: Update this Header and tests/.folder.md when changed.
 */
import { afterEach, expect, test } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const run = promisify(execFile), roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const definitions = [
  { name: 'twitter-cli', command: 'twitter', version: '0.8.5' },
  { name: 'xiaohongshu-cli', command: 'xhs', version: '0.5.0' },
]
async function fixture(command: string, name: string) {
  const root = await mkdtemp(join(tmpdir(), 'boai-social-cli-')); roots.push(root)
  const script = resolve('resources/agent-skills', 'boai-' + name, 'scripts', command)
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: root + ':/usr/bin:/bin', TWITTER_PROXY: 'http://explicit.invalid:1234' }
  const executable = (name: string, content: string) => writeFile(join(root, name), '#!/bin/sh\n' + content, { mode: 0o700 })
  const report = `exec '${process.execPath.replaceAll("'", "'\\''")}' -e 'console.log(JSON.stringify({args:process.argv.slice(1),proxy:process.env.TWITTER_PROXY}))' -- "$@"\n`
  return { root, script, env, executable, report, call: (args: string[]) => run('/bin/bash', [script, ...args], { env }) }
}
for (const { name, command, version } of definitions) {
  test.skipIf(process.platform === 'win32')(`${name} preserves argument boundaries using a matching local version`, async () => {
    const f = await fixture(command, name)
    await f.executable(command, `if [ "$1" = "--version" ]; then printf '%s\\n' '${command}, version ${version}'; exit 0; fi\n` + f.report)
    const args = ['search', 'spaces and\nnewlines; $(do-not-execute)', '--json']
    expect(JSON.parse((await f.call(args)).stdout).args).toEqual(args)
  })
  test.skipIf(process.platform === 'win32')(`${name} rejects an unrelated local version and pins uvx, then uv`, async () => {
    const f = await fixture(command, name)
    await f.executable(command, 'printf "unrelated version\\n"\n')
    await f.executable('uvx', f.report)
    expect(JSON.parse((await f.call(['--help'])).stdout).args).toEqual(['--from', name + '==' + version, command, '--help'])
    await rm(join(f.root, 'uvx'))
    await f.executable('uv', f.report)
    expect(JSON.parse((await f.call(['--version'])).stdout).args).toEqual(['tool', 'run', '--from', name + '==' + version, command, '--version'])
  })
  test.skipIf(process.platform === 'win32')(`${name} reports missing dependencies and preserves actual process failure`, async () => {
    const f = await fixture(command, name)
    await expect(f.call(['--help'])).rejects.toMatchObject({ code: 127, stderr: expect.stringContaining('uv/uvx is unavailable') })
    await f.executable('uvx', 'exit 23\n')
    await expect(f.call(['--help'])).rejects.toMatchObject({ code: 23 })
  })
}
test.skipIf(process.platform === 'win32')('twitter launcher preserves explicit proxy and otherwise inherits the available environment proxy', async () => {
  const f = await fixture('twitter', 'twitter-cli')
  await f.executable('uvx', f.report)
  f.env.HTTPS_PROXY = 'http://environment.invalid:5678'
  expect(JSON.parse((await f.call(['--help'])).stdout).proxy).toBe('http://explicit.invalid:1234')
  f.env.TWITTER_PROXY = ''
  expect(JSON.parse((await f.call(['--help'])).stdout).proxy).toBe('http://environment.invalid:5678')
})

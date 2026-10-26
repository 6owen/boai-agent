/*
 * [INPUT]: 显式提供的本机Chrome二进制，仅新建临时user-data-dir与虚构fixture.invalid Cookie。
 * [OUTPUT]: 真正源浏览器加密落盘→所选A/B profile副本解密→清理验证；不访问个人profile。
 * [POS]: 可独立esbuild为Node脚本运行的人工授权本机验收；不自动启动GUI或读取日常账号。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { BrowserCookieSources } from '../apps/electron/src/main/browser/cookie-sources'

async function seed(executable: string, root: string, profile: string, value: string): Promise<void> {
  const child = spawn(executable, ['--headless', '--remote-debugging-pipe', `--user-data-dir=${root}`, `--profile-directory=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--disable-component-update', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  const reader = child.stdio[4] as Readable, writer = child.stdio[3] as Writable
  const exit = new Promise<void>((yes, no) => { child.once('close', code => code === 0 ? yes() : no(new Error(`fixture Chrome exited ${code}`))); child.once('error', no) })
  void exit.catch(() => {})
  let text = '', id = 0
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  reader.on('data', buffer => {
    text += buffer.toString('utf8')
    for (;;) { const end = text.indexOf('\0'); if (end < 0) break; const message = JSON.parse(text.slice(0, end)); text = text.slice(end + 1); const next = pending.get(message.id); if (next) { pending.delete(message.id); if (message.error) next.reject(new Error('fixture CDP failed')); else next.resolve(message.result) } }
  })
  writer.on('error', () => {}); reader.on('error', () => {})
  const timeout = setTimeout(() => { for (const next of pending.values()) next.reject(new Error('fixture CDP timeout')); child.kill('SIGKILL') }, 15_000)
  const send = (method: string, params?: unknown) => new Promise<unknown>((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); writer.write(JSON.stringify({ id: next, method, params }) + '\0') })
  try {
    await send('Storage.setCookies', { cookies: [{ name: 'boai_fixture', value, domain: 'fixture.invalid', path: '/', secure: true, httpOnly: true, sameSite: 'Strict', expires: Date.now() / 1000 + 3600 }] })
    const values = await send('Storage.getCookies') as { cookies: Array<{ value: string }> }; assert(values.cookies.some(cookie => cookie.value === value))
    await send('Browser.close'); await exit
  } finally { clearTimeout(timeout); if (child.exitCode === null) { child.kill('SIGKILL'); await exit.catch(() => {}) }; reader.destroy(); writer.destroy() }
}
async function main(): Promise<void> {
  const executable = process.argv[2]
  assert(executable, 'Supply an installed Chrome executable explicitly')
  const temporary = await mkdtemp(join(tmpdir(), 'boai-chrome-cookie-fixture-')), root = join(temporary, 'source'), scratch = join(temporary, 'copies')
  try {
    await mkdir(root); await mkdir(scratch)
    await seed(executable, root, 'Default', 'synthetic-A')
    await seed(executable, root, 'Profile 2', 'synthetic-B')
    const localState = JSON.parse(await readFile(join(root, 'Local State'), 'utf8'))
    localState.profile.last_used = 'Default'; localState.profile.info_cache.Default.name = 'Fixture A'; localState.profile.info_cache['Profile 2'].name = 'Fixture B'
    await writeFile(join(root, 'Local State'), JSON.stringify(localState))
    const sources = new BrowserCookieSources({ installations: async () => [{ kind: 'chrome', root, executable }], temporaryDirectory: scratch })
    const listed = (await sources.list()).sources
    assert.equal(listed.length, 2)
    for (const [label, expected] of [['Fixture B', 'synthetic-B'], ['Fixture A', 'synthetic-A']]) {
      const selected = listed.find(source => source.profileName === label); assert(selected)
      const payload = await sources.read(selected.id), cookies = JSON.parse(payload.text)
      assert.equal(cookies.find((cookie: { name: string }) => cookie.name === 'boai_fixture')?.value, expected)
      assert.deepEqual(await readdir(scratch), [])
    }
    process.stdout.write(JSON.stringify({ passed: true, profiles: 2, selectedProfileIsolation: true, copiesRemoved: true, personalProfilesRead: false }) + '\n')
  } finally { await rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }) }
}
void main().catch(error => { process.stderr.write(`Cookie fixture failed: ${error instanceof Error ? error.message : 'unknown'}\n`); process.exitCode = 1 })

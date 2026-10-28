/*
 * [INPUT]: Real AppService/SQLite and a native stdio fixture with a separately upgraded binary version.
 * [OUTPUT]: Version drift succeeds on the original session; actual receipts persist without configuration drift or task replay.
 * [POS]: Codex native compatibility regression, zero model calls.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { afterEach, expect, it } from 'vitest'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaunchProfile } from '../packages/shared/src/domain/backends'
import type { RuntimeVersions } from '../packages/shared/src/domain/runtime-versions'
import { nativeFixture } from './fixtures/native-product'
import { resolveCodexRuntime } from '../packages/runtime/src/modules/backends/runtime-config'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
const profiles = async (f: Awaited<ReturnType<typeof nativeFixture>>) => await f.service.handle('listLaunchProfiles', undefined) as LaunchProfile[]
it('accepts a newer native version, records it, and preserves configuration/session across the update and restart', async () => {
  const f = await nativeFixture('codex', cleanup)
  const initial = (await profiles(f))[0], fingerprint = (await resolveCodexRuntime(f.agent, initial)).fingerprint
  const first = await f.wait(await f.send('普通交流'))
  expect(first.runs[0].status).toBe('completed')
  await writeFile(join(f.root, 'native-version.txt'), '0.164.0')
  const message = await f.send('升级后继续'), second = await f.wait(message)
  const run = second.runs.find(run => run.triggerMessageId === message.id)!
  expect(run.status, run.error).toBe('completed')
  expect(run.backend?.program?.version).toBe('0.164.0')
  expect(run.backend?.sessionId).toBe(first.runs[0].backend?.sessionId)
  const saved = (await profiles(f))[0]
  expect(saved.verified).toEqual(initial.verified)
  expect(saved.revision).toBe(initial.revision)
  expect(saved.observedProgram).toMatchObject({ name: 'Codex', version: '0.164.0', protocolVersion: 2 })
  expect((await resolveCodexRuntime(f.agent, saved)).fingerprint).toBe(fingerprint)
  expect((await f.service.handle('getRuntimeVersions', undefined) as RuntimeVersions).programs[0]).toMatchObject({ version: '0.164.0', lastVerification: { version: initial.verified!.version } })
  await f.restart()
  const lastMessage = await f.send('重启后继续'), third = await f.wait(lastMessage)
  expect(third.runs.every(value => value.status === 'completed')).toBe(true)
  expect(third.runs.find(value => value.triggerMessageId === lastMessage.id)?.backend?.sessionId).toBe(first.runs[0].backend?.sessionId)
  const cwd = join(f.root, 'agents', f.agent.id, 'workspace', 'sessions', f.chat.id, 'work')
  const calls = (await readFile(join(cwd, 'native-thread-requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  expect(calls.map(call => call.method)).toEqual(['thread/start', 'thread/resume', 'thread/resume'])
  expect((await readFile(join(cwd, 'native-turn-requests.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(3)
})
it.each(['initialize', 'thread'] as const)('keeps the concrete %s failure and sends no user turn or automatic retry', async kind => {
  const f = await nativeFixture('codex', cleanup)
  if (kind === 'initialize') await writeFile(join(f.root, 'native-version.txt'), 'BROKEN')
  else { await writeFile(join(f.root, 'native-version.txt'), '0.164.0'); await writeFile(join(f.root, 'native-thread-fault'), 'incompatible') }
  const message = await f.send('不要重发'), detail = await f.wait(message)
  expect(detail.runs).toHaveLength(1)
  expect(detail.runs[0]).toMatchObject({ status: 'failed' })
  expect(detail.runs[0].error).toContain(kind === 'initialize' ? 'initialize unsupported' : 'thread schema incompatible')
  expect((await profiles(f))[0].observedProgram).toBeUndefined()
  const cwd = join(f.root, 'agents', f.agent.id, 'workspace', 'sessions', f.chat.id, 'work')
  await expect(readFile(join(cwd, 'native-turn-requests.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
  await f.restart()
  expect((await f.detail()).runs).toHaveLength(1)
  await expect(readFile(join(cwd, 'native-turn-requests.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('still rejects a changed executable before running it', async () => {
  const f = await nativeFixture('codex', cleanup)
  await appendFile(f.executable, '\n// replaced launcher\n')
  const detail = await f.wait(await f.send('程序入口变了'))
  expect(detail.runs[0]).toMatchObject({ status: 'failed' })
  expect(detail.runs[0].error).toContain('程序已变化')
  expect((await profiles(f))[0].observedProgram).toBeUndefined()
})

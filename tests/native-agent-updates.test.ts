/*
 * [INPUT]: Real SQLite and native stdio fixture; controllable download and registry ports.
 * [OUTPUT]: Runtime verification, persisted profile switch and unchanged profile on candidate failure.
 * [POS]: No account access, model inference or external package writes.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { chmod, copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaunchProfile } from '../packages/shared/src/domain/backends'
import { dispatchRuntime } from '../packages/runtime/src/dispatch'
import { isPublicMethod } from '../packages/shared/src/ipc/public-methods'
import { inspectProgram } from '../packages/runtime/src/modules/backends/program'
import { isNewerAgentVersion } from '../packages/runtime/src/modules/backends/agent-updates'
import { nativeFixture } from './fixtures/native-product'

const ports = vi.hoisted(() => ({ latestAgentVersion: vi.fn(), stageAgentUpdate: vi.fn() }))
vi.mock('../packages/runtime/src/modules/backends/agent-updates', async load => ({
  ...await load<typeof import('../packages/runtime/src/modules/backends/agent-updates')>(),
  ...ports,
  supportsAgentInstallation: () => true,
}))

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  vi.resetAllMocks()
})

it('compares numeric stable versions and keeps install private', () => {
  expect(isNewerAgentVersion('1.10.0', '1.9.9')).toBe(true)
  expect(isNewerAgentVersion('1.9.9', '1.10.0')).toBe(false)
  expect(isNewerAgentVersion('2.0.0-beta', '1.10.0')).toBe(false)
  expect(isPublicMethod('__installAgentUpdate')).toBe(false)
})

it('probes the staged program before switching and keeps the original connection across restart', async () => {
  const fixture = await nativeFixture('codex', cleanup)
  const getProfile = async () => (await fixture.service.handle('listLaunchProfiles', undefined) as LaunchProfile[])[0]
  const profile = await getProfile()
  const makeCandidate = async (name: string, version: string) => {
    const directory = join(fixture.root, name)
    await mkdir(directory)
    const executable = join(directory, 'codex.mjs')
    await copyFile(fixture.executable, executable)
    await copyFile(join(fixture.root, 'native-business.mjs'), join(directory, 'native-business.mjs'))
    await chmod(executable, 0o700)
    await writeFile(join(directory, 'native-version.txt'), version)
    return { directory, file: inspectProgram(executable) }
  }
  ports.latestAgentVersion.mockResolvedValue('0.172.0')
  await expect(dispatchRuntime(fixture.service, '__checkAgentUpdates', undefined)).resolves.toMatchObject({
    updates: [{ profileId: profile.id, currentVersion: '0.161.0', latestVersion: '0.172.0' }],
  })
  const input = { profileId: profile.id, profileRevision: profile.revision, version: '0.172.0' }
  await expect(dispatchRuntime(fixture.service, '__installAgentUpdate', { ...input, profileRevision: profile.revision + 1 })).rejects.toThrow('连接已变化')
  expect(ports.stageAgentUpdate).not.toHaveBeenCalled()
  const bad = await makeCandidate('failed-program', '0.170.0')
  ports.stageAgentUpdate.mockResolvedValueOnce(bad)
  await expect(dispatchRuntime(fixture.service, '__installAgentUpdate', input)).rejects.toThrow('版本与目标不一致')
  expect(await getProfile()).toEqual(profile)
  await expect(stat(bad.directory)).rejects.toMatchObject({ code: 'ENOENT' })

  const waiting = await fixture.send('NATIVE_WAIT')
  await expect.poll(async () => (await fixture.detail()).runs.find(run => run.triggerMessageId === waiting.id)?.status).toBe('running')
  await expect(dispatchRuntime(fixture.service, '__installAgentUpdate', input)).rejects.toThrow('员工仍在使用')
  expect(ports.stageAgentUpdate).toHaveBeenCalledTimes(1)
  await fixture.wait(waiting)

  const good = await makeCandidate('verified-program', input.version)
  ports.stageAgentUpdate.mockResolvedValueOnce(good)
  await expect(dispatchRuntime(fixture.service, '__installAgentUpdate', input)).resolves.toMatchObject({
    profileId: profile.id, profileRevision: profile.revision + 1, currentVersion: input.version,
  })
  await expect(stat(fixture.executable)).resolves.toBeDefined()
  await fixture.restart()
  expect(await getProfile()).toMatchObject({ id: profile.id, revision: profile.revision + 1, executable: good.file.path, useExistingLogin: true, verified: { version: input.version } })
  const after = await fixture.send('请验证升级后的本机执行')
  const detail = await fixture.wait(after)
  expect(detail.runs.find(run => run.triggerMessageId === after.id)).toMatchObject({ status: 'completed', backend: { profileId: profile.id, program: { version: input.version } } })
}, 25_000)

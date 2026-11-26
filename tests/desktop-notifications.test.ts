/*
 * [INPUT]: Controlled registry and installer ports plus a real local inbox file.
 * [OUTPUT]: Live delivery, history without replay, duplicate suppression, exact version and stale offer invalidation.
 * [POS]: Electron notification store regression without opening a window.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesktopNotifications } from '../apps/electron/src/main/notifications'
import type { AgentUpdate } from '../packages/shared/src/ipc/notifications'

const cleanup: string[] = []
afterEach(async () => { await Promise.all(cleanup.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const update = { profileId: 'pi-personal', profileRevision: 1, name: 'Pi', currentVersion: '1.3.0', latestVersion: '1.6.0' } satisfies AgentUpdate
const key = { profileId: update.profileId, profileRevision: update.profileRevision, version: update.latestVersion }

async function inbox() {
  const directory = await mkdtemp(join(tmpdir(), 'boai-notifications-'))
  cleanup.push(directory)
  const path = join(directory, 'notifications.json')
  const ports = { check: vi.fn<() => Promise<{ updates: AgentUpdate[]; unavailableProfileIds: string[] }>>().mockResolvedValue({ updates: [update], unavailableProfileIds: [] }), install: vi.fn() }
  const open = async () => {
    const store = new DesktopNotifications(path, ports, () => {}, error => { throw error })
    await store.init()
    return store
  }
  return { open, store: await open(), ports }
}

it('keeps task and release notices read across restart and does not duplicate the same target version', async () => {
  const { open, store } = await inbox()
  const task = { type: 'employee-task:result', occurrenceId: 'round-1', taskId: 'task-1', employeeId: 'employee-1', employeeName: '天气助手', title: '天气', status: 'in_review' } as const
  store.observe(task)
  store.observe(task)
  store.observe({ type: 'app:update', state: { revision: 2, phase: 'ready', currentVersion: '1.0.0', availableVersion: '1.0.1' } })
  await store.check(true)
  const ids = store.snapshot().items.map(item => item.id)
  expect(ids).toEqual(['agent:pi-personal:1.6.0', 'app:1.0.1', 'task:round-1'])
  expect(store.snapshot().pendingIds).toEqual([...ids].reverse())
  await store.read(ids.slice(1))
  expect(store.snapshot().pendingIds).toEqual(ids.slice(0, 1))
  const restored = await open()
  await restored.check(true)
  expect(restored.snapshot().items).toMatchObject(ids.map((id, index) => ({ id, read: index > 0 })))
  expect(restored.snapshot().pendingIds).toEqual([])
})

it('keeps retry available after failure and uses the exact offered version', async () => {
  const { store, ports } = await inbox()
  await store.check(true)
  expect(() => store.install({ ...key, version: '9.0.0' })).toThrow('更新信息已变化')
  let finish!: (update: AgentUpdate) => void
  ports.install.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const installing = store.install(key)
  expect(() => store.install(key)).toThrow('已有 Agent 检查或更新正在进行')
  store.observe({ type: 'agent-update:verifying', profileId: key.profileId })
  expect(store.snapshot().agentUpdates[0].phase).toBe('verifying')
  finish({ ...update, profileRevision: 2, currentVersion: '1.6.0', latestVersion: undefined })
  await installing
  expect(store.snapshot().items).toMatchObject([{ id: 'agent-installed:pi-personal:1.6.0', read: true }])
  expect(store.snapshot().pendingIds).toEqual([])
  await store.check(true)
  ports.install.mockRejectedValueOnce(new Error('probe failed'))
  await expect(store.install(key)).rejects.toThrow('probe failed')
  expect(store.snapshot().agentUpdates[0]).toMatchObject({ phase: 'failed', latestVersion: '1.6.0' })
})

it('preserves the last result on network failure and clears superseded offers after a successful check', async () => {
  const { store, ports } = await inbox()
  await store.check(true)
  ports.check.mockResolvedValueOnce({ updates: [{ ...update, latestVersion: undefined }], unavailableProfileIds: [key.profileId] })
  await expect(store.check(true)).rejects.toThrow('版本检查失败')
  expect(store.snapshot().items).toHaveLength(1)
  expect(store.snapshot().agentUpdates[0].latestVersion).toBe('1.6.0')
  ports.check.mockResolvedValueOnce({ updates: [{ ...update, latestVersion: '1.7.0' }], unavailableProfileIds: [] })
  await store.check(true)
  expect(store.snapshot().items.map(item => item.id)).toEqual(['agent:pi-personal:1.7.0'])
})

it('drops stale offers when a profile changes without starting another registry check', async () => {
  const { store, ports } = await inbox()
  let finish!: (result: Awaited<ReturnType<typeof ports.check>>) => void
  ports.check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const starting = store.check(false)
  const invalidation = store.invalidateAgentOffer(update.profileId, { profileRevision: update.profileRevision + 1 })
  finish({ updates: [update], unavailableProfileIds: [] })
  await Promise.all([starting, invalidation])
  expect(store.snapshot()).toMatchObject({ items: [], agentUpdates: [] })
  expect(ports.check).toHaveBeenCalledTimes(1)
  await store.check(true)
  await store.invalidateAgentOffer(update.profileId, update)
  expect(store.snapshot().items).toHaveLength(1)
  expect(ports.check).toHaveBeenCalledTimes(2)
})

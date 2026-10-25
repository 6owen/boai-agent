/*
 * [INPUT]: Real temporary storage, controlled native permission/capture results and timers.
 * [OUTPUT]: Capture/OCR fallback, exact-session source/theme pagination and revision/deletion boundaries, JPEG lifecycle/quota and restore contracts.
 * [POS]: Desktop recorder integration checks; no real screen recording or system permission changes.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { DesktopActivityService } from '../src/runtime/modules/desktop-activity/activity-service'
import { ActivityStorage } from '../src/runtime/modules/desktop-activity/activity-storage'
import { activitySessions } from '../src/runtime/modules/desktop-activity/activity-sessions'
import { emptyActivityEntities } from '../src/runtime/modules/desktop-activity/activity-analysis'
import { restoreActivitySettings } from '../src/runtime/modules/desktop-activity/activity-settings'
import { ApplicationService } from '../src/runtime/modules/application/application-service'
import type { ActivityCaptureAction, ActivityCaptureOptions, ActivityCaptureResult, ActivityInputEvent, ActivitySample } from '../src/shared/domain/desktop-activity'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const fn of cleanup.splice(0).reverse()) await fn() })
const jpeg = Buffer.from([255, 216, 1, 2, 255, 217]).toString('base64')
async function setup(capture?: (action: ActivityCaptureAction, options?: ActivityCaptureOptions) => Promise<ActivityCaptureResult>) {
  const root = await mkdtemp(join(tmpdir(), 'boai-recorder-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  let sample = 0
  const native = vi.fn(async (action: ActivityCaptureAction, _excluded?: string[], options?: ActivityCaptureOptions): Promise<ActivityCaptureResult> => capture ? capture(action, options) : action === 'sample' ? { app: 'Editor', bundleId: 'test.editor', capturedAt: new Date().toISOString(), title: `Window ${++sample}`, text: 'Observed text', image: jpeg } : { supported: true, permission: true, accessibilityPermission: true })
  const service = new DesktopActivityService(store, { capture: native, available: () => true, changed() {} }, root)
  await service.init(); cleanup.push(() => service.close())
  const api = new ApplicationService(store, service.operations(), async () => {})
  return { root, store, service, native, api }
}
it('migrates old settings without opting into screenshots or input monitoring', () => {
  const old = { revision: 8, enabled: true, intervalSeconds: 120, retentionDays: 7, excludedApps: ['private.app'] }
  expect(restoreActivitySettings(old)).toMatchObject({ ...old, saveScreenshots: false, enableInputMonitor: false, enableOcr: true })
})
it('does not write image payloads unless separately enabled and preserves files after disabling', async () => {
  const f = await setup(); await f.service.configure({ expectedRevision: 0, enabled: true }); await f.service.sample()
  expect(await readdir(join(f.root, 'activity-records'))).toEqual([])
  await f.service.configure({ expectedRevision: 1, saveScreenshots: true }); await f.service.sample()
  const samples = await f.store.load<ActivitySample>('desktopActivitySamples'), saved = samples.find(s => s.screenshot)!
  expect(saved.screenshot?.bytes).toBe(6)
  expect(await readFile(join(f.root, 'activity-records', `${saved.id}.jpg`))).toEqual(Buffer.from(jpeg, 'base64'))
  await f.service.configure({ expectedRevision: 2, saveScreenshots: false })
  expect((await f.service.status()).screenshotCount).toBe(1)
  await f.service.clear()
  expect(await readdir(join(f.root, 'activity-records'))).toEqual([])
})
it('requires accessibility only for the independent monitor opt-in and keeps settings on rejection', async () => {
  const f = await setup(async () => ({ supported: true, permission: true, accessibilityPermission: false }))
  await f.service.configure({ expectedRevision: 0, enabled: true, saveScreenshots: true })
  await expect(f.service.configure({ expectedRevision: 1, enableInputMonitor: true })).rejects.toThrow('辅助功能')
  expect((await f.service.status()).settings).toMatchObject({ revision: 1, enabled: true, saveScreenshots: true, enableInputMonitor: false })
})
it('passes OCR language, cadence and image quality to native without reusing skipped OCR text', async () => {
  const f = await setup(); await f.service.configure({ expectedRevision: 0, enabled: true, ocrEveryN: 2, ocrLanguages: ['en-US'], jpegQuality: 40 })
  await f.service.sample(); await f.service.sample()
  const options = f.native.mock.calls.filter(c => c[0] === 'sample').map(c => c[2])
  expect(options).toMatchObject([{ enableOcr: true, ocrLanguages: ['en-US'], jpegQuality: 40 }, { enableOcr: false }])
  expect((await f.store.load<ActivitySample>('desktopActivitySamples')).map(s => [s.ocr, s.text])).toEqual([[true, 'Observed text'], [false, '']])
})
it('keeps the original window and screenshot when OCR fails without accepting stale text', async () => {
  const f = await setup(async action => action === 'sample'
    ? { app: 'Editor', bundleId: 'test.editor', title: 'Current window', capturedAt: new Date().toISOString(), image: jpeg, text: 'stale OCR', ocr: false, ocrError: '文字识别暂不可用，已保留窗口记录。' }
    : { supported: true, permission: true })
  await f.service.configure({ expectedRevision: 0, enabled: true, saveScreenshots: true })
  await f.service.sample()
  const samples = await f.store.load<ActivitySample>('desktopActivitySamples')
  expect(samples).toHaveLength(1)
  expect(samples[0]).toMatchObject({ app: 'Editor', title: 'Current window', text: '', ocr: false, screenshot: { bytes: 6 } })
  expect((await f.service.status()).lastError).toContain('文字识别暂不可用')
})
it('accepts capture adapters without OCR and exposes their independent platform capabilities', async () => {
  const capabilities = { platform: 'windows', screenshots: false, inputMonitor: false, ocr: false } as const
  const f = await setup(async action => action === 'sample'
    ? { capabilities, app: 'Editor', bundleId: 'test.editor', title: 'Current window', capturedAt: new Date().toISOString(), text: 'unavailable OCR' }
    : { supported: true, permission: true, capabilities })
  await f.service.configure({ expectedRevision: 0, enabled: true })
  await f.service.sample()
  expect(await f.store.load<ActivitySample>('desktopActivitySamples')).toMatchObject([{ title: 'Current window', text: '', ocr: false }])
  expect((await f.service.status()).capabilities).toEqual(capabilities)
})
it('paginates only the selected session and refuses its old identity after deletion', async () => {
  const start = Date.now() - 20 * 60000, times = [0, 10000, 600000].map(delta => new Date(start + delta).toISOString())
  let index = 0
  const f = await setup(async action => action === 'sample' ? { app: 'Editor', bundleId: 'test.editor', title: `Window ${index}`, capturedAt: times[index++]!, text: 'Original observation' } : { supported: true, permission: true })
  await f.service.configure({ expectedRevision: 0, enabled: true })
  for (let count = 0; count < times.length; count++) await f.service.sample(true)
  const sessions = (await f.service.status()).recentSessions
  expect(sessions).toHaveLength(2)
  const selected = sessions[1]!, first = await f.service.sessionSources(selected.id, 0, 0, 1), second = await f.service.sessionSources(selected.id, 1, 0, 1)
  expect(first).toMatchObject({ total: 2, nextOffset: 1, samples: [{ title: 'Window 0' }] })
  expect(second).toMatchObject({ total: 2, nextOffset: null, samples: [{ title: 'Window 1' }], revision: first.revision })
  expect(await f.api.call({ operation: 'activity.session.sources', input: { id: selected.id, offset: 1, limit: 1 } })).toMatchObject({ status: 'succeeded', data: { total: 2, samples: [{ title: 'Window 1' }] } })
  await f.service.clear()
  await expect(f.service.sessionSources(selected.id)).rejects.toThrow('活动片段已变化或删除')
})
it('includes only valid related analyses and changes the detail revision when a source changes', async () => {
  const f = await setup(); await f.service.configure({ expectedRevision: 0, enabled: true }); await f.service.sample(true)
  const session = (await f.service.status()).recentSessions[0]!, page = await f.service.sessionSources(session.id), sample = page.samples[0]!
  const date = new Date(sample.capturedAt), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const prepared = await f.service.prepareAnalyses({ from: day, to: day, groups: [{ sampleIds: [sample.id] }] })
  await f.service.saveAnalyses({ from: day, to: day, items: [{ ...prepared.groups[0]!, worth: true, title: 'Original theme', description: 'Based on this session', project: null, topics: [], highlights: [], entities: emptyActivityEntities(), memoryCandidates: [] }] })
  const analyzed = await f.service.sessionSources(session.id)
  expect(analyzed).toMatchObject({ analysisTotal: 1, analyses: [{ title: 'Original theme' }] })
  expect(analyzed.revision).not.toBe(page.revision)
  await f.store.transaction(async tx => { await tx.put({ collection: 'desktopActivitySamples', id: sample.id, value: { ...sample, hash: 'changed-source', text: 'Updated observation' } }) })
  const updated = await f.service.sessionSources(session.id)
  expect(updated).toMatchObject({ analysisTotal: 0, analyses: [] })
  expect(updated.revision).not.toBe(analyzed.revision)
})
it('drops a pending screenshot when recording is disabled before capture completes', async () => {
  let resolve!: (result: ActivityCaptureResult) => void
  const f = await setup(async action => action === 'sample' ? new Promise(done => { resolve = done }) : { supported: true, permission: true })
  await f.service.configure({ expectedRevision: 0, enabled: true, saveScreenshots: true })
  const capturing = f.service.sample()
  await f.service.configure({ expectedRevision: 1, enabled: false })
  resolve({ app: 'Editor', bundleId: 'test.editor', capturedAt: new Date().toISOString(), image: jpeg })
  await capturing
  expect((await f.service.status()).count).toBe(0)
  expect(await readdir(join(f.root, 'activity-records'))).toEqual([])
  expect(f.native.mock.calls.some(c => c[0] === 'stop')).toBe(true)
})
it('uses actual screen permission for recording status instead of the enabled preference', async () => {
  let permission = true
  const f = await setup(async () => ({ supported: true, permission }))
  await f.service.configure({ expectedRevision: 0, enabled: true }); permission = false
  expect(await f.service.status()).toMatchObject({ state: 'permission', permission: false, monitoring: false, settings: { enabled: true } })
})
it('evicts oldest screenshots and their report when quota is exceeded', async () => {
  const payload = Buffer.concat([Buffer.from([255, 216]), Buffer.alloc(3_700_000), Buffer.from([255, 217])]).toString('base64')
  let count = 0
  const f = await setup(async action => action === 'sample' ? { app: 'Editor', bundleId: 'test.editor', title: `Page ${++count}`, capturedAt: new Date(Date.now() + count).toISOString(), image: payload } : { supported: true, permission: true })
  await f.service.configure({ expectedRevision: 0, enabled: true, saveScreenshots: true, maxStorageMB: 10 })
  await f.service.sample()
  const first = (await f.store.load<ActivitySample>('desktopActivitySamples'))[0]!
  const date = new Date(first.capturedAt), day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  const source = await f.service.prepareReport({ from: day, to: day, sampleIds: [first.id] })
  await f.service.saveReport({ ...source, content: 'Observed Page 1' })
  await f.service.sample(); await f.service.sample()
  expect((await f.service.status()).screenshotCount).toBe(2)
  expect((await f.service.status()).storageBytes).toBeLessThan(10 * 1024 * 1024)
  expect(await f.service.reports()).toEqual([])
  expect(await readdir(join(f.root, 'activity-records'))).not.toContain(`${first.id}.jpg`)
})
it('rejects model access to screenshots and permits owner reads only for current records', async () => {
  const f = await setup(); await f.service.configure({ expectedRevision: 0, enabled: true, saveScreenshots: true }); await f.service.sample()
  const id = (await f.store.load<ActivitySample>('desktopActivitySamples'))[0]!.id
  expect((await f.api.catalog({}, { kind: 'core', employeeId: 'bobo', conversationId: 'c' } as never)).operations.some((operation: { name: string }) => operation.name === 'activity.screenshot')).toBe(false)
  expect(await f.api.call({ operation: 'activity.screenshot', input: { id } })).toMatchObject({ status: 'succeeded', data: { url: `data:image/jpeg;base64,${jpeg}` } })
  await f.service.clear()
  expect(await f.api.call({ operation: 'activity.screenshot', input: { id } })).toMatchObject({ status: 'rejected' })
})
it('backs up retained screenshots and pauses the input monitor while exporting', async () => {
  const f = await setup(); await f.service.configure({ expectedRevision: 0, enabled: true, saveScreenshots: true }); await f.service.sample()
  const destination = join(f.root, 'backup'); await f.service.beforeBackup(); await f.service.backup(destination)
  expect(await readdir(join(destination, 'activity-records'))).toEqual(await readdir(join(f.root, 'activity-records')))
  expect(f.native.mock.calls.at(-1)?.[0]).toBe('stop')
  f.service.afterBackup()
})
it('removes orphaned screenshot files and repairs missing screenshot references on restart', async () => {
  const f = await setup(), files = new ActivityStorage(f.root), orphan = randomUUID()
  await files.save(orphan, jpeg)
  await writeFile(join(files.directory, 'user-notes.txt'), 'Keep this unrelated file')
  const unrelated = randomUUID(); await writeFile(join(files.directory, unrelated), 'Unrelated file')
  await f.service.init()
  expect((await readdir(files.directory)).sort()).toEqual([unrelated, 'user-notes.txt'].sort())
})
it('rejects path traversal and symbolic-link screenshot roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-storage-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const storage = new ActivityStorage(root)
  await expect(storage.save('../../outside', jpeg)).rejects.toThrow('无效活动')
  await rm(storage.directory, { recursive: true, force: true }); await symlink(tmpdir(), storage.directory)
  await expect(storage.save(randomUUID(), jpeg)).rejects.toThrow('符号链接')
})
it('groups real events into idle-delimited sessions without persisting key contents', () => {
  const events: ActivityInputEvent[] = [0, 1000, 50000].map((offset, i) => ({ id: String(i), capturedAt: new Date(1_000_000 + offset).toISOString(), app: i ? 'Browser' : 'Editor', bundleId: 'app', keypresses: 2, clicks: 1 }))
  expect(activitySessions([], events, 30000, true, 1_050_100)).toMatchObject([{ keypresses: 2, clicks: 1, active: true }, { apps: ['Editor', 'Browser'], keypresses: 4, clicks: 2, active: false }])
})

it('coalesces enabled input aggregates and stops polling after disable', async () => {
  let event = true
  const eventTime = new Date(Math.floor(Date.now() / 60000) * 60000 + 1000).toISOString()
  const f = await setup(async action => action === 'probe' ? { app: 'Editor', bundleId: 'editor', idleMs: 100, typingIdleMs: 10000, events: event ? [{ app: 'Editor', bundleId: 'editor', capturedAt: eventTime, keypresses: 3, clicks: 2 }, { app: 'Private', bundleId: 'private.app', capturedAt: new Date().toISOString(), keypresses: 99, clicks: 0 }] : [] } : { supported: true, permission: true, accessibilityPermission: true })
  await f.service.configure({ expectedRevision: 0, enabled: true, enableInputMonitor: true, excludedApps: ['private.app'] })
  await vi.waitFor(async () => expect(await f.store.load('desktopActivityInputEvents')).toMatchObject([{ keypresses: 6, clicks: 4 }]), { timeout: 3500 })
  expect(await f.store.load('desktopActivityInputEvents')).toHaveLength(1)
  event = false
  await f.service.configure({ expectedRevision: 1, enabled: false })
  const calls = f.native.mock.calls.filter(c => c[0] === 'probe').length
  await new Promise(resolve => setTimeout(resolve, 1100))
  expect(f.native.mock.calls.filter(c => c[0] === 'probe')).toHaveLength(calls)
  expect((await f.service.status()).recentSessions[0]).toMatchObject({ keypresses: 6, clicks: 4, active: false })
  await f.service.clear()
  expect(await f.store.load('desktopActivityInputEvents')).toEqual([])
})

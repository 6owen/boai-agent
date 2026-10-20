/*
 * [INPUT]: Original SQLite and controlled OCR samples, permissions and delayed capture.
 * [OUTPUT]: Opt-in/no-records behavior, provenance/cache, stale-source and deletion checks.
 * [POS]: Domain tests; fixtures do not certify real screen-capture permission or OCR quality.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { DesktopActivityService } from '../src/runtime/modules/desktop-activity/activity-service'
import type { ActivityCaptureResult } from '../src/shared/domain/desktop-activity'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f() })
async function fixture(capture?: (action: string) => Promise<ActivityCaptureResult>) {
  const root = await mkdtemp(join(tmpdir(), 'boai-activity-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const db = new ProductStore(join(root, 'boai.sqlite')); await db.init(); cleanup.push(() => db.close())
  const calls: string[] = []
  const activity = new DesktopActivityService(db, { available: () => true, changed() {}, capture: async action => { calls.push(action); return capture ? capture(action) : action === 'sample' ? { app: 'Editor', bundleId: 'test.editor', title: 'Project A', text: 'Fixed actual task', capturedAt: new Date().toISOString() } : { supported: true, permission: true } } })
  await activity.init(); cleanup.push(() => activity.close())
  const date = new Date(), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { activity, db, calls, day }
}
it('is off by default and cannot invent a report without desktop evidence', async () => {
  const f = await fixture()
  await f.activity.sample()
  expect(f.calls).toEqual([])
  const report = await f.activity.evidence(f.day, f.day)
  expect(report.total).toBe(0); expect(report.report).toBeNull()
  await expect(f.activity.saveReport({ from: f.day, to: f.day, sourceHash: report.sourceHash, sampleIds: [], content: 'Invented work' })).rejects.toThrow('来源')
})
it('requires actual screen permission to enable recording and preserves revision on denial', async () => {
  const f = await fixture(async () => ({ supported: true, permission: false }))
  await expect(f.activity.configure({ expectedRevision: 0, enabled: true })).rejects.toThrow('屏幕录制')
  expect((await f.activity.status()).settings).toMatchObject({ enabled: false, revision: 0 })
})
it('deduplicates unchanged windows and saves a source-bound report with a ten minute cache', async () => {
  const f = await fixture()
  await f.activity.configure({ expectedRevision: 0, enabled: true })
  await f.activity.sample(); await f.activity.sample()
  const evidence = await f.activity.evidence(f.day, f.day)
  expect(evidence.total).toBe(1); expect(evidence.samples[0]!.text).toBe('Fixed actual task')
  await f.activity.saveReport({ from: f.day, to: f.day, sourceHash: evidence.sourceHash, sampleIds: evidence.samples.map(s => s.id), content: 'Project A：Fixed actual task' })
  expect((await f.activity.evidence(f.day, f.day)).report?.content).toBe('Project A：Fixed actual task')
  expect((await f.activity.evidence(f.day, f.day, true)).report).toBeNull()
  expect((await f.activity.query({ from: f.day, to: f.day, search: 'project a' })).total).toBe(1)
})
it('clears activity and linked reports, and refuses to republish a deleted source snapshot', async () => {
  const f = await fixture(); await f.activity.configure({ expectedRevision: 0, enabled: true }); await f.activity.sample()
  const evidence = await f.activity.evidence(f.day, f.day), report = { from: f.day, to: f.day, sourceHash: evidence.sourceHash, sampleIds: evidence.samples.map(s => s.id), content: 'Project A' }
  await f.activity.saveReport(report); await f.activity.clear(f.day, f.day)
  expect((await f.activity.evidence(f.day, f.day)).total).toBe(0)
  expect(await f.db.load('desktopActivityReports')).toEqual([])
  await expect(f.activity.saveReport(report)).rejects.toThrow('来源')
})
it('discards an in-flight sample after recording is disabled', async () => {
  let release!: (v: ActivityCaptureResult) => void
  const f = await fixture(async action => action === 'sample' ? new Promise(resolve => { release = resolve }) : { supported: true, permission: true })
  await f.activity.configure({ expectedRevision: 0, enabled: true })
  const sample = f.activity.sample()
  await f.activity.configure({ expectedRevision: 1, enabled: false })
  release({ app: 'Editor', bundleId: 'test.editor', text: 'late', capturedAt: new Date().toISOString() })
  await sample
  expect((await f.activity.evidence(f.day, f.day)).total).toBe(0)
})

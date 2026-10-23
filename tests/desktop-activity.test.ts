/*
 * [INPUT]: Original SQLite and controlled OCR samples, permissions and delayed capture.
 * [OUTPUT]: Opt-in/no-records behavior, source-bound structured themes/original review/cache, local-midnight/OCR-empty search, backup/restore and deletion checks.
 * [POS]: Domain tests; fixtures do not certify real screen-capture permission or OCR quality.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { DesktopActivityService } from '../src/runtime/modules/desktop-activity/activity-service'
import { emptyActivityEntities } from '../src/runtime/modules/desktop-activity/activity-analysis'
import { ApplicationService } from '../src/runtime/modules/application/application-service'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import type { AgentEngine } from '../src/runtime/contracts'
import type { ActivityCaptureResult, ActivitySample } from '../src/shared/domain/desktop-activity'
import type { ApplicationResult } from '../src/shared/domain/application-protocol'
import type { Conversation, Snapshot } from '../src/shared/domain'
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
  const recalled = await f.activity.searchMemory({ search: 'fixed actual task' })
  expect(recalled.hits.map(hit => hit.kind).sort()).toEqual(['observation', 'report'])
  expect(recalled.hits.find(hit => hit.kind === 'report')).toMatchObject({ sampleIds: evidence.samples.map(sample => sample.id), sourceHash: evidence.sourceHash })
})
it('prepares the final report source from sampled and deep-dive evidence together', async () => {
  let capture = 0
  const f = await fixture(async action => action === 'sample'
    ? { app: 'Editor', bundleId: 'test.editor', title: `Project ${++capture}`, text: `Observed item ${capture}`, capturedAt: new Date().toISOString() }
    : { supported: true, permission: true })
  await f.activity.configure({ expectedRevision: 0, enabled: true })
  await f.activity.sample(); await f.activity.sample()
  const first = (await f.activity.query({ from: f.day, to: f.day, search: 'Project 1' })).samples[0]!
  const second = (await f.activity.query({ from: f.day, to: f.day, search: 'Project 2' })).samples[0]!
  const prepared = await f.activity.prepareReport({ from: f.day, to: f.day, sampleIds: [first.id, second.id] })
  const saved = await f.activity.saveReport({ ...prepared, content: 'Project 1 and Project 2 were observed.' })
  expect(saved.sourceHash).toBe(prepared.sourceHash)
  expect((await f.activity.evidence(f.day, f.day)).report?.sampleIds).toEqual([first.id, second.id])
  await expect(f.activity.prepareReport({ from: f.day, to: f.day, sampleIds: [first.id, first.id] })).rejects.toThrow('不重复')
  await f.activity.clear(f.day, f.day)
  await expect(f.activity.saveReport({ ...prepared, content: 'Stale report' })).rejects.toThrow('来源')
})
it('keeps actual observation dates across local midnight and does not invent text for an OCR-empty window', async () => {
  const f = await fixture()
  const today = new Date(`${f.day}T00:01:00`), yesterday = new Date(today.getTime() - 2 * 60_000)
  const previousDay = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  const first: ActivitySample = { id: randomUUID(), capturedAt: yesterday.toISOString(), app: 'Editor', bundleId: 'test.editor', title: 'Late draft', text: 'Draft still open', hash: 'late-source' }
  const second: ActivitySample = { id: randomUUID(), capturedAt: today.toISOString(), app: 'Calendar', bundleId: 'test.calendar', title: 'Next day plan', text: '', hash: 'empty-ocr-source' }
  await f.db.write([first, second].map(sample => ({ collection: 'desktopActivitySamples', id: sample.id, value: sample })))
  expect((await f.activity.query({ from: previousDay, to: previousDay })).samples.map(sample => sample.id)).toEqual([first.id])
  expect((await f.activity.query({ from: f.day, to: f.day })).samples.map(sample => sample.id)).toEqual([second.id])
  expect((await f.activity.evidence(previousDay, f.day)).samples).toMatchObject([{ id: first.id, text: first.text }, { id: second.id, text: '' }])
  expect((await f.activity.searchMemory({ from: f.day, to: f.day, search: 'Next day plan' })).hits).toMatchObject([{ kind: 'observation', id: second.id, excerpt: '' }])
})
it('saves Alma-style structured fragments with exact source versions and removes them when sources change', async () => {
  let capture = 0
  const f = await fixture(async action => action === 'sample'
    ? { app: 'Editor', bundleId: 'test.editor', title: `BOAI PR #${++capture}`, text: `BOAI memory PR #${capture}`, capturedAt: new Date().toISOString() }
    : { supported: true, permission: true })
  await f.activity.configure({ expectedRevision: 0, enabled: true })
  await f.activity.sample(); await f.activity.sample()
  const evidence = await f.activity.evidence(f.day, f.day)
  const sampleIds = evidence.samples.map(sample => sample.id)
  const prepared = await f.activity.prepareAnalyses({ from: f.day, to: f.day, groups: [{ sampleIds }] })
  const entry = { ...prepared.groups[0]!, worth: true, title: 'BOAI memory', description: 'Observed BOAI memory PR #1 and PR #2 on screen.', project: 'BOAI', topics: ['memory'], highlights: ['PR #1', 'PR #2'],
    entities: { ...emptyActivityEntities(), prs: [{ label: 'PR #1', ref: '1' }], identifiers: ['BOAI'] }, memoryCandidates: [{ type: 'project' as const, content: 'BOAI memory is an ongoing project', why: 'Potentially durable beyond this session' }] }
  expect(await f.activity.saveAnalyses({ from: f.day, to: f.day, items: [entry] })).toMatchObject({ count: 1 })
  expect((await f.activity.evidence(f.day, f.day)).clusters).toMatchObject([{ title: 'BOAI', sampleIds, analysisIds: [expect.any(String)] }])
  expect((await f.activity.searchMemory({ search: 'Observed BOAI memory' })).hits).toMatchObject([{ kind: 'analysis', sampleIds }])
  expect((await f.activity.evidence(f.day, f.day)).analyses[0]?.memoryCandidates).toHaveLength(1)
  const analysisId = (await f.activity.evidence(f.day, f.day)).analyses[0]!.id
  expect(await f.activity.analysisSources(analysisId, 0, 1)).toMatchObject({ total: 2, samples: [{ id: sampleIds[0] }], nextOffset: 1 })
  expect(await f.activity.analysisSources(analysisId, 1, 1)).toMatchObject({ total: 2, samples: [{ id: sampleIds[1] }], nextOffset: null })
  expect(await f.db.load('memory')).toEqual([])
  await expect(f.activity.saveAnalyses({ from: f.day, to: f.day, items: [{ ...entry, entities: { ...entry.entities, identifiers: ['invented-identifier'] } }] })).rejects.toThrow('实际窗口')
  const source = evidence.samples[0]!
  await f.db.write([{ collection: 'desktopActivitySamples', id: source.id, value: { ...source, hash: 'revised' } }])
  expect((await f.activity.evidence(f.day, f.day)).analyses).toEqual([])
  expect((await f.activity.searchMemory({ search: 'Observed BOAI memory' })).hits).toEqual([])
  await expect(f.activity.analysisSources(analysisId)).rejects.toThrow('来源')
  await expect(f.activity.saveAnalyses({ from: f.day, to: f.day, items: [entry] })).rejects.toThrow('来源')
  await f.activity.clear(f.day, f.day)
  expect(await f.db.load('desktopActivityAnalyses')).toEqual([])
})
it('bounds report analysis input and exposes the remaining source-checked themes in pages', async () => {
  let number = 0
  const f = await fixture(async action => action === 'sample'
    ? { app: 'Editor', bundleId: 'test.editor', title: `Observation ${++number}`, text: `Unique OCR ${number}`, capturedAt: new Date().toISOString() }
    : { supported: true, permission: true })
  await f.activity.configure({ expectedRevision: 0, enabled: true })
  for (let index = 0; index < 41; index++) await f.activity.sample()
  const samples = (await f.activity.query({ from: f.day, to: f.day, limit: 100 })).samples
  for (let start = 0; start < samples.length; start += 40) {
    const prepared = await f.activity.prepareAnalyses({ from: f.day, to: f.day, groups: samples.slice(start, start + 40).map(sample => ({ sampleIds: [sample.id] })) })
    await f.activity.saveAnalyses({ from: f.day, to: f.day, items: prepared.groups.map((group, index) => ({ ...group, worth: true, title: `Theme ${start + index}`, description: `Observed theme ${start + index}`, project: null, topics: [], highlights: [], entities: emptyActivityEntities(), memoryCandidates: [] })) })
  }
  const evidence = await f.activity.evidence(f.day, f.day)
  expect(evidence).toMatchObject({ analysisTotal: 41, analysisTruncated: true })
  expect(evidence.analyses).toHaveLength(40)
  const app = new ApplicationService(f.db, f.activity.operations(), async () => {})
  expect(await app.call({ operation: 'activity.analyses', input: { from: f.day, to: f.day, offset: 40 } })).toMatchObject({ status: 'succeeded', data: { total: 41, analyses: [expect.any(Object)], nextOffset: null } })
})
it('restores source-bound analyses and reports from a SQLite backup, then forgets both with their original samples', async () => {
  const f = await fixture(); await f.activity.configure({ expectedRevision: 0, enabled: true }); await f.activity.sample()
  const source = (await f.activity.query({ from: f.day, to: f.day })).samples[0]!
  const prepared = await f.activity.prepareAnalyses({ from: f.day, to: f.day, groups: [{ sampleIds: [source.id] }] })
  await f.activity.saveAnalyses({ from: f.day, to: f.day, items: [{ ...prepared.groups[0]!, worth: true, title: 'Project A', description: 'Observed task in Editor', project: 'Project A', topics: [], highlights: [], entities: emptyActivityEntities(), memoryCandidates: [] }] })
  const report = await f.activity.prepareReport({ from: f.day, to: f.day, sampleIds: [source.id] })
  await f.activity.saveReport({ ...report, content: 'Editor window showed Project A.' })
  const restoreRoot = await mkdtemp(join(tmpdir(), 'boai-activity-restore-')); cleanup.push(() => rm(restoreRoot, { recursive: true, force: true }))
  const restoredPath = join(restoreRoot, 'boai.sqlite'); await f.db.backup(restoredPath)
  const restoredStore = new ProductStore(restoredPath); await restoredStore.init(); cleanup.push(() => restoredStore.close())
  const restored = new DesktopActivityService(restoredStore, { available: () => false, changed() {}, capture: async () => ({ supported: false, permission: false }) })
  await restored.init(); cleanup.push(() => restored.close())
  expect(await restored.evidence(f.day, f.day)).toMatchObject({ total: 1, analyses: [{ sampleIds: [source.id] }], report: { sampleIds: [source.id], content: 'Editor window showed Project A.' } })
  expect((await restored.searchMemory({ search: 'Project A' })).hits.map(hit => hit.kind).sort()).toEqual(['analysis', 'observation', 'report'])
  await restored.clear(f.day, f.day)
  expect(await restored.evidence(f.day, f.day)).toMatchObject({ total: 0, analyses: [], report: null })
  expect((await restored.searchMemory({ search: 'Project A' })).hits).toEqual([])
})
it('clears activity and linked reports, and refuses to republish a deleted source snapshot', async () => {
  const f = await fixture(); await f.activity.configure({ expectedRevision: 0, enabled: true }); await f.activity.sample()
  const evidence = await f.activity.evidence(f.day, f.day), report = { from: f.day, to: f.day, sourceHash: evidence.sourceHash, sampleIds: evidence.samples.map(s => s.id), content: 'Project A' }
  await f.activity.saveReport(report); await f.activity.clear(f.day, f.day)
  expect((await f.activity.evidence(f.day, f.day)).total).toBe(0)
  expect((await f.activity.searchMemory({ search: 'Project A' })).total).toBe(0)
  expect(await f.db.load('desktopActivityReports')).toEqual([])
  await expect(f.activity.saveReport(report)).rejects.toThrow('来源')
})
it('does not recall a report after its source version changes', async () => {
  const f = await fixture(); await f.activity.configure({ expectedRevision: 0, enabled: true }); await f.activity.sample()
  const evidence = await f.activity.evidence(f.day, f.day), source = evidence.samples[0]!
  await f.activity.saveReport({ from: f.day, to: f.day, sourceHash: evidence.sourceHash, sampleIds: [source.id], content: 'Project A：Fixed actual task' })
  await f.db.write([{ collection: 'desktopActivitySamples', id: source.id, value: { ...source, hash: 'revised', text: 'Revised observed text' } }])
  expect((await f.activity.searchMemory({ search: 'Fixed actual task' })).hits).toEqual([])
  expect((await f.activity.searchMemory({ search: 'Revised observed text' })).hits).toMatchObject([{ kind: 'observation', id: source.id }])
  expect((await f.activity.evidence(f.day, f.day)).report).toBeNull()
  expect(await f.activity.reports()).toEqual([])
})
it('exposes cross-date memory through the application catalog and validated call', async () => {
  const f = await fixture(); await f.activity.configure({ expectedRevision: 0, enabled: true }); await f.activity.sample()
  const app = new ApplicationService(f.db, f.activity.operations(), async actor => {
    if (actor.kind !== 'owner' && (actor.kind !== 'employee' || actor.employeeId !== 'bobo')) throw new Error('not authorized')
  })
  const bobo = { kind: 'employee' as const, employeeId: 'bobo', conversationId: 'core', messageId: 'user-turn' }
  const catalog = await app.catalog({ domain: 'activity' }, bobo)
  expect(catalog.operations.find(operation => operation.name === 'activity.memory.search')).toMatchObject({ access: 'owner-or-core', available: true })
  expect(catalog.operations.some(operation => operation.name === 'activity.clear')).toBe(false)
  expect(await app.call({ operation: 'activity.memory.search', input: { search: 'Fixed actual task' } }, bobo)).toMatchObject({ status: 'succeeded', data: { total: 1, hits: [{ kind: 'observation' }] } })
  expect(await app.call({ operation: 'activity.memory.search', input: { limit: 200 } }, bobo)).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(await app.call({ operation: 'activity.memory.search', input: {} }, { ...bobo, employeeId: 'other' })).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
})
it('lets bobo read retained activity through its real authorized conversation tool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-activity-bobo-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const source: ActivitySample = { id: randomUUID(), capturedAt: new Date().toISOString(), app: 'Editor', bundleId: 'test.editor', title: 'Project A', text: 'Observed source for bobo', hash: 'actual-source-version' }
  const date = new Date(source.capturedAt), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  let catalogName: string | undefined, result: ApplicationResult | undefined, saved: ApplicationResult | undefined, sources: ApplicationResult | undefined
  const engine: AgentEngine = {
    test: async () => 'test',
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => {
      catalogName = (await context.application!.catalog({ domain: 'activity' })).operations.find(operation => operation.name === 'activity.memory.search')?.name
      const prepared = await context.application!.call({ operation: 'activity.analysis.prepare', input: { from: day, to: day, groups: [{ sampleIds: [source.id] }] } })
      expect(prepared.status).toBe('succeeded')
      const sourceHash = (prepared.data as { groups: { sourceHash: string }[] }).groups[0]!.sourceHash
      saved = await context.application!.call({ operation: 'activity.analysis.save', input: { from: day, to: day, items: [{ sampleIds: [source.id], sourceHash, worth: true, title: 'Project A', description: 'Observed source for bobo', project: 'Project A', topics: ['source'], highlights: [], entities: emptyActivityEntities(), memoryCandidates: [] }] }, requestId: 'bobo-analysis-save' })
      const analysisId = (saved.data as { saved: { id: string }[] }).saved[0]!.id
      sources = await context.application!.call({ operation: 'activity.analysis.sources', input: { id: analysisId } })
      result = await context.application!.call({ operation: 'activity.memory.search', input: { search: 'Observed source for bobo' } })
      await context.onDelta('找到有来源的桌面观察。')
    },
  }
  const owned = await startOwnedRuntime({ dataPath: root, skillDiscovery: { homeDir: root }, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }); cleanup.push(owned.close)
  const db = new ProductStore(join(root, 'boai.sqlite')); await db.init()
  await db.write([{ collection: 'desktopActivitySamples', id: source.id, value: source }]); await db.close()
  await owned.service.handle('executeApplicationOperation', { operation: 'connections.create', input: { name: 'API', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture-model' }, requestId: 'activity-model' })
  const room = await owned.service.handle('startCoreConversation', { content: '找一下桌面观察', requestId: 'activity-question' }) as Conversation
  await expect.poll(async () => (await owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity, { timeout: 10_000 }).toBe('idle')
  expect(catalogName).toBe('activity.memory.search')
  expect(saved).toMatchObject({ status: 'succeeded', data: { count: 1 } })
  expect(sources).toMatchObject({ status: 'succeeded', data: { samples: [{ id: source.id, text: source.text }], nextOffset: null } })
  expect(result).toMatchObject({ status: 'succeeded', data: { total: 2, hits: expect.arrayContaining([expect.objectContaining({ kind: 'analysis', sampleIds: [source.id] }), expect.objectContaining({ kind: 'observation', id: source.id })]) } })
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

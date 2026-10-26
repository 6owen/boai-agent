/*
 * [INPUT]: Real isolated journal files, process restart and hostile/error metadata.
 * [OUTPUT]: Cross-build and legacy provenance, startup failure redaction, canonical export safety and bounded journal regressions.
 * [POS]: Desktop fault evidence contract; does not run Electron or a model.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, lstatSync, rmSync, symlinkSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DesktopDiagnostics, diagnosticError, diagnosticRequest, writeDiagnosticsReport } from '../apps/electron/src/main/diagnostics'

const roots: string[] = []
const application = { version: 'test', inputHash: 'a'.repeat(64), source: 'compiled-inputs' as const }
function fixture() { const directory = mkdtempSync(join(tmpdir(), 'boai-diagnostics-')); roots.push(directory); return { directory, journal: new DesktopDiagnostics(directory, application) } }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test('a second process session can export the original failure and keeps immutable build provenance', () => {
  const { directory, journal } = fixture()
  journal.record('app-start', { pid: 123 })
  journal.record('runtime-exit', { pid: 456, exitCode: 7 })
  const upgraded = { ...application, version: 'next', inputHash: 'b'.repeat(64) }
  const next = new DesktopDiagnostics(directory, upgraded); next.record('app-start', { pid: 789 })
  upgraded.inputHash = 'c'.repeat(64)
  const report = next.report()
  expect(report.entries.map(entry => entry.event)).toEqual(['app-start', 'runtime-exit', 'app-start'])
  expect(new Set(report.entries.map(entry => entry.sessionId)).size).toBe(2)
  expect(report.application).toEqual({ ...upgraded, inputHash: 'b'.repeat(64) })
  expect(report.entries.filter(entry => entry.sessionId === journal.sessionId).map(entry => entry.application)).toEqual([application, application])
  expect(report.entries.at(-1)?.application).toEqual(report.application)
  expect(lstatSync(join(directory, 'desktop.jsonl')).mode & 0o777).toBe(0o600)
})

test('legacy failures keep unknown build identity rather than inheriting the exporting build', () => {
  const { directory, journal } = fixture(); journal.record('runtime-exit', { exitCode: 1 })
  const path = join(directory, 'desktop.jsonl'), legacy = JSON.parse(readFileSync(path, 'utf8'))
  delete legacy.application
  writeFileSync(path, JSON.stringify(legacy) + '\n')
  const next = new DesktopDiagnostics(directory, application)
  expect(next.report().entries[0].application).toEqual({ version: null, inputHash: null, source: 'unknown' })
  expect(next.report().journal.rejectedRecords).toBe(0)
})

test('startup failures retain safe evidence after restart, and invalid build fields are rejected', () => {
  const { directory, journal } = fixture()
  const error = Object.assign(new Error('/Users/private/v2/data-version.json'), { code: 'ENOENT' })
  journal.record('app-start-failed', diagnosticError(error))
  const path = join(directory, 'desktop.jsonl'), original = readFileSync(path, 'utf8')
  writeFileSync(path, original + JSON.stringify({ ...JSON.parse(original), application: { ...application, path: '/Users/private' } }) + '\n')
  const report = new DesktopDiagnostics(directory, application).report()
  expect(report.entries).toHaveLength(1)
  expect(report.entries[0]).toMatchObject({ event: 'app-start-failed', application, metadata: { errorKind: 'Error', errorCode: 'ENOENT', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) } })
  expect(report.journal.rejectedRecords).toBe(1)
  expect(JSON.stringify(report)).not.toContain('/Users/private')
})

test('only fixed metadata reaches disk; request text, paths and credentials never enter the report', () => {
  const { directory, journal } = fixture()
  const secret = 'sk-secret-用户正文-/Users/private'
  const error = Object.assign(new Error(secret), { code: 'AUTH_FAILED' })
  journal.record('request-failed', { ...diagnosticRequest('sendMessage', 'request-1', { requestId: 'original-send', conversationId: 'chat-1', employeeId: 'researcher', content: secret, apiKey: secret, path: secret }), ...diagnosticError(error) })
  expect(journal.record('runtime-error', { content: secret } as never)).toBe(false)
  const text = readFileSync(join(directory, 'desktop.jsonl'), 'utf8') + JSON.stringify(journal.report())
  expect(text).not.toContain(secret)
  expect(journal.report().entries[0].metadata).toMatchObject({ method: 'sendMessage', requestId: 'request-1', operationId: 'original-send', conversationId: 'chat-1', employeeId: 'researcher', errorCode: 'AUTH_FAILED' })
})

test('corrupt and extra-field records are counted but never copied into an export', () => {
  const { directory, journal } = fixture(); journal.record('app-start')
  const path = join(directory, 'desktop.jsonl'), original = readFileSync(path, 'utf8')
  const injected = { ...JSON.parse(original), content: 'PRIVATE' }
  writeFileSync(path, original + 'partial crash line\n' + JSON.stringify(injected) + '\n')
  const report = journal.report()
  expect(report.entries).toHaveLength(1); expect(report.journal.rejectedRecords).toBe(2)
  expect(JSON.stringify(report)).not.toContain('PRIVATE')
})

test('rotation bounds disk use and retains the latest failure', () => {
  const { directory, journal } = fixture()
  for (let index = 0; index < 2100; index++) journal.record('request-failed', { method: 'sendMessage', requestId: String(index), conversationId: 'x'.repeat(200), fingerprint: 'a'.repeat(64) })
  journal.record('runtime-exit', { exitCode: 99 })
  expect(readdirSync(directory).sort()).toEqual(['desktop.jsonl', 'desktop.previous.jsonl'])
  for (const name of readdirSync(directory)) expect(lstatSync(join(directory, name)).size).toBeLessThanOrEqual(256 * 1024)
  expect(journal.report().entries.at(-1)).toMatchObject({ event: 'runtime-exit', metadata: { exitCode: 99 } })
  const upgraded = new DesktopDiagnostics(directory, { ...application, version: 'next', inputHash: 'b'.repeat(64) })
  expect(upgraded.report().entries.every(entry => entry.application.inputHash === application.inputHash)).toBe(true)
})

test('an unavailable journal remains exportable from memory with an explicit persistence failure', () => {
  const { directory } = fixture(), blocked = join(directory, 'file'); writeFileSync(blocked, 'original')
  const journal = new DesktopDiagnostics(blocked, application)
  expect(journal.record('runtime-exit', { exitCode: 3 })).toBe(false)
  const report = journal.report()
  expect(report.journal.persistenceError).toBeTruthy()
  expect(report.entries).toHaveLength(1)
  expect(readFileSync(blocked, 'utf8')).toBe('original')
})

test('a linked journal is not overwritten or exported', () => {
  const { directory, journal } = fixture(), target = join(directory, 'private'); writeFileSync(target, 'PRIVATE')
  symlinkSync(target, join(directory, 'desktop.jsonl'))
  expect(journal.record('app-start')).toBe(false)
  expect(readFileSync(target, 'utf8')).toBe('PRIVATE')
  expect(journal.report().journal.unreadableFiles).toBe(1)
})

test('a dangling journal link cannot create or overwrite its target', () => {
  const { directory, journal } = fixture(), target = join(directory, 'missing-private')
  symlinkSync(target, join(directory, 'desktop.jsonl'))
  expect(journal.record('app-start')).toBe(false)
  expect(readdirSync(directory)).toEqual(['desktop.jsonl'])
})

test('export refuses direct and linked profile destinations without replacing configuration', async () => {
  const { directory } = fixture(), profile = join(directory, 'profile'), alias = join(directory, 'alias')
  mkdirSync(profile); symlinkSync(profile, alias, 'dir')
  for (const name of ['application-plugins.json', '..protected.json']) {
    const original = join(profile, name); writeFileSync(original, 'ORIGINAL SETTINGS')
    for (const dataRoot of [profile, alias]) for (const destinationRoot of [profile, alias]) {
      await expect(writeDiagnosticsReport(dataRoot, join(destinationRoot, name), { diagnostic: true })).rejects.toThrow('应用数据目录之外')
      expect(readFileSync(original, 'utf8')).toBe('ORIGINAL SETTINGS')
    }
  }
  expect(readdirSync(profile).sort()).toEqual(['..protected.json', 'application-plugins.json'])
})

test('export through an external directory alias writes only the checked canonical destination', async () => {
  const { directory, journal } = fixture(), profile = join(directory, 'profile'), external = join(directory, 'external'), alias = join(directory, 'external-alias')
  mkdirSync(profile); mkdirSync(external); symlinkSync(external, alias, 'dir')
  const file = join(external, 'diagnostics.json'); writeFileSync(file, 'OLD EXPORT')
  journal.record('app-start')
  const result = await writeDiagnosticsReport(profile, join(alias, 'diagnostics.json'), journal.report())
  expect(result).toBe(join(realpathSync(external), 'diagnostics.json'))
  expect(JSON.parse(readFileSync(file, 'utf8')).entries[0].application).toEqual(application)
  expect(lstatSync(file).mode & 0o777).toBe(0o600)
  expect(readdirSync(external)).toEqual(['diagnostics.json'])
})

test('export refuses a linked destination and preserves its target', async () => {
  const { directory } = fixture(), profile = join(directory, 'profile'), target = join(profile, 'application-plugins.json'), alias = join(directory, 'export.json')
  mkdirSync(profile); writeFileSync(target, 'ORIGINAL SETTINGS'); symlinkSync(target, alias)
  await expect(writeDiagnosticsReport(profile, alias, {})).rejects.toThrow('普通文件')
  expect(readFileSync(target, 'utf8')).toBe('ORIGINAL SETTINGS')
  expect(lstatSync(alias).isSymbolicLink()).toBe(true)
})

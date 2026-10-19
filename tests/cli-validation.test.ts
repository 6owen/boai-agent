/*
 * [INPUT]: Actual RPC transport, existing-profile sentinels and validation runner.
 * [OUTPUT]: Existing-service zero writes, failed prerequisites/non-green counts, authentication and interruption.
 * [POS]: Service validation contract; actual built isolated integration is tested separately.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { startRpcServer, type RpcChannel } from '../src/cli/server'
import { validateServer } from '../src/cli/validation'
import { PROTOCOL_VERSION } from '../src/shared/cli/protocol'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(brokenHealth = false) {
  const calls: string[] = [], token = randomBytes(32).toString('base64url')
  const values: Record<string, unknown> = { ping: { ok: true, protocolVersion: PROTOCOL_VERSION }, health: { service: brokenHealth ? 'stopping' : 'ready', storage: 'ready' }, versions: { service: 'fixture', protocol: PROTOCOL_VERSION, runtimes: {} }, workspaces: [{ id: 'fixture' }], employees: [{ id: 'employee', name: 'PRIVATE_EMPLOYEE_NAME' }], connections: [{ id: 'connection' }], sources: [], sessions: { items: [] } }
  const channels = new Map<string, RpcChannel>(Object.entries(values).map(([name, result]) => [name, { input: ['sources', 'sessions'].includes(name) ? z.object({ limit: z.number().optional() }).strict() : z.undefined(), effect: 'read', handle: () => { calls.push(name); return result } }]))
  channels.set('sendMessage', { input: z.unknown(), effect: 'write', handle: () => { throw new Error('MUST_NOT_WRITE') } })
  const server = await startRpcServer({ token, workspaceId: 'fixture', version: 'test', channels }); cleanup.push(() => server.close())
  return { server, token, calls }
}
it('diagnoses an existing service without messages, configuration writes or exposing personal names', async () => {
  const f = await fixture(), report = await validateServer({ url: f.server.url, token: f.token, timeout: 1000 })
  expect(report).toMatchObject({ mode: 'read-only', modelMode: 'none', exitCode: 0, passed: 10, failed: 0, skipped: 0 })
  expect(f.calls).toEqual(['ping', 'health', 'versions', 'workspaces', 'employees', 'connections', 'sources', 'sessions'])
  expect(JSON.stringify(report)).not.toContain('PRIVATE_EMPLOYEE_NAME'); expect(JSON.stringify(report)).not.toContain(f.token)
  expect(report.directory).toBeUndefined(); expect(report.results.every(row => row.elapsedMs >= 0)).toBe(true)
})
it('retains a failing health step while continuing other read-only diagnostics', async () => {
  const f = await fixture(true), report = await validateServer({ url: f.server.url, token: f.token, timeout: 1000 })
  expect(report).toMatchObject({ exitCode: 1, passed: 9, failed: 1, skipped: 0 })
  expect(report.results.find(row => row.step === 'health')).toMatchObject({ status: 'failed', code: 'VALIDATION_FAILED' })
  expect(f.calls).toContain('sessions')
})
it('failed authentication cannot become a passing or mutating validation', async () => {
  const f = await fixture(), report = await validateServer({ url: f.server.url, token: 'wrong-token', timeout: 1000 })
  expect(report).toMatchObject({ exitCode: 1, passed: 0, failed: 1, skipped: 9 }); expect(f.calls).toEqual([])
  expect(report.results[0].code).toBe('AUTH_FAILED')
})
it('never initializes or edits an existing validation directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-validation-existing-')); cleanup.push(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, 'original'), 'KEEP_ORIGINAL')
  const report = await validateServer({ directory, timeout: 1000 })
  expect(report.exitCode).toBe(1); expect(report.directory).toBeUndefined()
  expect(await readdir(directory)).toEqual(['original']); expect(await readFile(join(directory, 'original'), 'utf8')).toBe('KEEP_ORIGINAL')
})
it('does not run later steps after an explicit interruption or count skipped steps as success', async () => {
  const f = await fixture(), controller = new AbortController()
  const report = await validateServer({ url: f.server.url, token: f.token, timeout: 1000, signal: controller.signal, step: result => { if (result.step === 'ping') controller.abort() } })
  expect(report).toMatchObject({ exitCode: 130, passed: 2, failed: 0, skipped: 8 }); expect(f.calls).toEqual(['ping'])
})

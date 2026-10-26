/*
 * [INPUT]: Production AppService/SQLite, an offline child engine and actual SIGKILL.
 * [OUTPUT]: In-flight standalone calls become unknown/interrupted on restart without replay; completed records and route evidence survive two restarts and backup restore.
 * [POS]: Gateway crash recovery integration, not supplier or desktop certification.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing this test.
 */
import { fork } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { buildWorkspace as build } from '../scripts/workspace-packages.mjs'
import { expect, test } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { GatewayModelCall } from '../packages/shared/src/domain/model-gateway'

interface Call { id: string; status: string; finishedAt?: string; outcome?: string; modelCall: GatewayModelCall }
test('SIGKILL leaves standalone calls unknown, keeps their identities and never replays them on restart or restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-gateway-crash-')), cache = resolve('node_modules/.cache')
  await mkdir(cache, { recursive: true })
  const runtime = await mkdtemp(join(cache, 'gateway-crash-')), outfile = join(runtime, 'runner.mjs'), backup = join(runtime, 'backup')
  let service: AppService | undefined
  try {
    await build({ entryPoints: ['tests/fixtures/gateway-call-process.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
    const child = fork(outfile, [root], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let diagnostics = '', checkpoint!: { connectionId: string; completedId: string; pending: string[] }
    child.stderr?.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-6000) })
    try {
      checkpoint = await new Promise<typeof checkpoint>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Checkpoint unavailable: ${diagnostics}`)), 15000)
        child.once('message', value => { clearTimeout(timer); resolve(value as typeof checkpoint) })
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${diagnostics}`)) })
        child.once('error', error => { clearTimeout(timer); reject(error) })
      })
    } finally {
      if (child.exitCode === null && child.signalCode === null) { const exited = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGKILL'); await exited }
    }
    const read = async (path: string) => {
      const store = await ProductStore.openReadOnly(join(path, 'boai.sqlite'))
      try { return [...await store.load<Call>('connectionTestCalls'), ...await store.load<Call>('automationDraftCalls')] } finally { await store.close() }
    }
    const crashed = await read(root)
    expect(crashed.filter(call => checkpoint.pending.includes(call.id)).map(call => call.status)).toEqual(['running', 'running'])
    const completed = crashed.find(call => call.id === checkpoint.completedId)!
    expect(completed.status).toBe('completed')
    let calls = 0, firstRecovery: Call[] | undefined
    for (const [index, dataPath] of [root, root, backup].entries()) {
      service = new AppService({ dataPath, engine: { run: async () => { calls++ }, test: async () => { calls++; return 'NO REPLAY' }, draftAutomation: async () => { calls++; throw new Error('No replay') } }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
      await service.init()
      const recovered = await read(dataPath)
      expect(calls).toBe(0)
      expect(recovered.find(call => call.id === checkpoint.completedId)).toEqual(completed)
      for (const id of checkpoint.pending) {
        const call = recovered.find(value => value.id === id)!
        expect(call).toMatchObject({ status: 'interrupted', outcome: 'unknown', finishedAt: expect.any(String) })
        expect(call.modelCall).toEqual(crashed.find(value => value.id === id)!.modelCall)
      }
      if (firstRecovery) expect(recovered).toEqual(firstRecovery)
      else firstRecovery = recovered
      await expect(service.handle('generateAutomationDraft', { connectionId: checkpoint.connectionId, draftId: 'crash-draft', version: 1, requestId: 'crash-draft-call', instruction: '每天整理资料', timezone: 'Asia/Singapore' })).rejects.toThrow('已经受理')
      expect(calls).toBe(0)
      const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
      try { for (const collection of ['runs', 'turns', 'workItems', 'messages', 'automations']) expect(await store.load(collection)).toEqual([]) } finally { await store.close() }
      if (index === 1) await service.backup(backup)
      await service.close(); service = undefined
    }
  } finally { await service?.close(); await rm(runtime, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) }
}, 30000)

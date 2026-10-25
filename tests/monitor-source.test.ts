/*
 * [INPUT]: 隔离已发布文件/可信根别名、真实 AppService/SQLite、内容身份和可控读取/授权退出信号。
 * [OUTPUT]: 已登记 hash 外改拒绝/检查点不变、canonical/逻辑根兼容且子路径拒绝链接、唯一最新来源前后复核；保留来源权限/版本/文件边界、生产 IPC 无模型监控、清理/重启及停止待实际退出验证。
 * [POS]: 监控数据入口与宿主集成验收；不使用真实用户资料或在线模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, writeFile, rm, symlink, link } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Artifact, AutomationDefinition, AutomationInput, AutomationMonitorCheckpoint, AutomationMonitorRead, AutomationOccurrence, AutomationsView, Connection, Conversation, ConversationDetail, Snapshot } from '../packages/shared/src/domain'
import { readMonitorArtifact } from '../packages/runtime/src/modules/automations/monitor-source'
import { AutomationService } from '../packages/runtime/src/modules/automations/automation-service'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })
async function root() { const root = await mkdtemp(join(tmpdir(), 'boai-monitor-source-')); disposers.push(() => rm(root, { recursive: true, force: true })); return root }
async function until(check: () => Promise<boolean>) { const end = Date.now() + 8000; while (!await check()) { if (Date.now() > end) throw new Error('monitor did not settle'); await new Promise(r => setTimeout(r, 10)) } }
const input = (conversationId: string): AutomationInput => ({ name: '检查指标', prompt: '计数增长时提醒', conversationId, taskKind: 'monitor', monitor: { comparator: 'json-fields-v1', source: { kind: 'conversation-artifact', conversationId, name: 'metrics.json' }, maxAgeSeconds: 300, cooldownSeconds: 60, rules: [{ pointer: '/count', mode: 'numeric_delta', threshold: 10 }] }, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: true, notificationPolicy: 'important_only' })
const data = (count: number, complete = true, observedAt = new Date().toISOString()) => ({ schemaVersion: 1, observedAt, complete, data: { count } })
async function published(root: string, chat: Conversation, id: string, contents: unknown, publishedAt = new Date().toISOString()) {
  const path = join(root, 'workspaces', chat.id, 'artifacts', `${id}-metrics.json`)
  await mkdir(join(chat.workspacePath, 'artifacts'), { recursive: true })
  const text = JSON.stringify(contents); await writeFile(path, text)
  return { id, conversationId: chat.id, path, size: Buffer.byteLength(text), name: 'metrics.json', publishedAt } satisfies Artifact & { id: string; conversationId: string }
}

it('reads only the latest unambiguous published JSON in the selected managed chat and retains file evidence', async () => {
  const path = await root(), chat = { id: 'chat', workspacePath: join(path, 'workspaces', 'chat') } as Conversation
  const old = await published(path, chat, 'old', data(1), '2026-01-01T00:00:00Z'), fresh = await published(path, chat, 'new', data(2), '2026-01-02T00:00:00Z')
  const source = input(chat.id).monitor!.source, signal = new AbortController().signal
  const read = await readMonitorArtifact(path, chat, [old, fresh], source, signal)
  expect(read).toMatchObject({ observation: { data: { count: 2 } }, evidence: { artifactId: 'new', name: 'metrics.json', fileHash: expect.stringMatching(/^[a-f0-9]{64}$/) } })
  await expect(readMonitorArtifact(path, chat, [old, { ...fresh, publishedAt: old.publishedAt }], source, signal)).rejects.toThrow('发布时间相同')
  await expect(readMonitorArtifact(path, chat, [{ ...fresh, publishedAt: undefined }], source, signal)).rejects.toThrow('可信发布时间')
  await expect(readMonitorArtifact(path, chat, [fresh], { ...source, conversationId: 'other' }, signal)).rejects.toThrow('不属于')
  await expect(readMonitorArtifact(path, chat, [{ ...fresh, path: join(path, 'private.json') }], source, signal)).rejects.toThrow('受管发布')
  await expect(readMonitorArtifact(path, chat, [{ ...fresh, conversationId: 'other' }], source, signal)).rejects.toThrow('未找到')
  const controller = new AbortController(); controller.abort(new Error('stopped'))
  await expect(readMonitorArtifact(path, chat, [fresh], source, controller.signal)).rejects.toThrow('stopped')
})

it('rejects symlinks, hard links, excessive files and invalid JSON instead of reading outside the published source', async () => {
  const path = await root(), chat = { id: 'chat', workspacePath: join(path, 'workspaces', 'chat') } as Conversation
  const a = await published(path, chat, 'sample', data(1)), source = input(chat.id).monitor!.source, signal = new AbortController().signal
  const outside = join(path, 'outside.json'); await writeFile(outside, JSON.stringify(data(999)))
  await rm(a.path); await symlink(outside, a.path)
  await expect(readMonitorArtifact(path, chat, [a], source, signal)).rejects.toThrow('Symbolic')
  await rm(a.path); await link(outside, a.path)
  await expect(readMonitorArtifact(path, chat, [a], source, signal)).rejects.toThrow('普通 JSON')
  await rm(a.path); await writeFile(a.path, 'x'.repeat(128 * 1024 + 1))
  await expect(readMonitorArtifact(path, chat, [a], source, signal)).rejects.toThrow('128 KiB')
  await writeFile(a.path, '{broken')
  await expect(readMonitorArtifact(path, chat, [a], source, signal)).rejects.toThrow()
})

it('requires registered content identity while retaining the legacy hashless source contract', async () => {
  const path = await root(), chat = { id: 'chat', workspacePath: join(path, 'workspaces', 'chat') } as Conversation
  const original = await published(path, chat, 'hashed', data(100)), contentHash = createHash('sha256').update(await readFile(original.path)).digest('hex')
  const artifact = { ...original, contentHash }, source = input(chat.id).monitor!.source, signal = new AbortController().signal
  expect(await readMonitorArtifact(path, chat, [artifact], source, signal)).toMatchObject({ observation: { data: { count: 100 } }, evidence: { artifactId: original.id, fileHash: contentHash } })
  await writeFile(original.path, JSON.stringify(data(999)))
  await expect(readMonitorArtifact(path, chat, [artifact], source, signal)).rejects.toThrow('外部修改')
  expect(await readMonitorArtifact(path, chat, [original], source, signal)).toMatchObject({ observation: { data: { count: 999 } } })
})

it('accepts only the trusted root alias or canonical fixed publication paths and rejects linked descendants', async () => {
  const parent = await realpath(await root()), canonicalData = join(parent, 'managed'), aliasData = join(parent, 'host-root-alias')
  await mkdir(canonicalData); await symlink(canonicalData, aliasData)
  const chat = { id: 'chat', workspacePath: join(aliasData, 'workspaces', 'chat') } as Conversation
  const artifact = await published(canonicalData, chat, 'canonical', data(100)), source = input(chat.id).monitor!.source, signal = new AbortController().signal
  for (const workspacePath of [chat.workspacePath, join(canonicalData, 'workspaces', chat.id)]) for (const path of [artifact.path, join(aliasData, 'workspaces', chat.id, 'artifacts', 'canonical-metrics.json')]) {
    expect(await readMonitorArtifact(aliasData, { ...chat, workspacePath }, [{ ...artifact, path }], source, signal)).toMatchObject({ observation: { data: { count: 100 } }, evidence: { artifactId: artifact.id } })
  }
  const unrelatedAlias = join(parent, 'file-alias'); await symlink(artifact.path, unrelatedAlias)
  await expect(readMonitorArtifact(aliasData, chat, [{ ...artifact, path: unrelatedAlias }], source, signal)).rejects.toThrow('受管发布')
  const directory = join(canonicalData, 'workspaces', chat.id, 'artifacts'), outside = join(parent, 'external-artifacts')
  await mkdir(outside); await writeFile(join(outside, 'canonical-metrics.json'), JSON.stringify(data(900))); await rm(directory, { recursive: true }); await symlink(outside, directory)
  await expect(readMonitorArtifact(aliasData, chat, [artifact], source, signal)).rejects.toThrow('Symbolic')
})

it('verifies the selected latest source before opening and after reading without falling back to an older file', async () => {
  const path = await root(), chat = { id: 'chat', workspacePath: join(path, 'workspaces', 'chat') } as Conversation
  const old = await published(path, chat, 'old', data(1), '2026-01-01T00:00:00Z'), fresh = await published(path, chat, 'new', data(2), '2026-01-02T00:00:00Z')
  const source = input(chat.id).monitor!.source, signal = new AbortController().signal, verified: string[] = []
  await expect(readMonitorArtifact(path, chat, [old, fresh], source, signal, async artifact => { verified.push(artifact.id); if (verified.length === 2) throw new Error('材料来源已撤权') })).rejects.toThrow('材料来源已撤权')
  expect(verified).toEqual(['new', 'new'])
  await rm(fresh.path)
  await expect(readMonitorArtifact(path, chat, [old, fresh], source, signal, async artifact => { expect(artifact.id).toBe('new'); throw new Error('打开前已撤权') })).rejects.toThrow('打开前已撤权')
})

it('keeps the real SQLite comparison checkpoint when a registered file changes or post-read source authority is revoked', async () => {
  const path = await root(), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); disposers.push(() => store.close())
  const chat = { id: 'chat', workspacePath: join(path, 'workspaces', 'chat') } as Conversation, original = await published(path, chat, 'registered', data(100))
  const bytes = await readFile(original.path), artifact = { ...original, contentHash: createHash('sha256').update(bytes).digest('hex') }
  let modelCalls = 0, revokeAfterRead = false, verifications = 0
  const service = new AutomationService(store, path, { critical: fn => fn(), validate: () => 'authorized', busy: () => false, changed: () => {}, notify: () => {}, inspect: () => undefined, cancel: async () => {}, dispatch: async () => { modelCalls++; throw new Error('unexpected model dispatch') }, readMonitor: (_definition, signal) => readMonitorArtifact(path, chat, [artifact], input(chat.id).monitor!.source, signal, async selected => { expect(selected.id).toBe(artifact.id); verifications++; if (revokeAfterRead && verifications === 2) throw new Error('材料来源已撤权') }) })
  disposers.push(() => service.close()); await service.init()
  const definition = await service.save(input(chat.id))
  const check = async (requestId: string) => { verifications = 0; const occurrence = await service.run(definition.id, requestId); await until(async () => !['admitted', 'running'].includes((await service.occurrence(occurrence.id)).status)); return service.occurrence(occurrence.id) }
  expect((await check('baseline')).monitor?.outcome).toBe('baseline')
  const checkpoint = await store.load<AutomationMonitorCheckpoint>('automationMonitorCheckpoints'); expect(checkpoint).toHaveLength(1)
  await writeFile(original.path, JSON.stringify(data(999)))
  const changed = await check('externally-modified')
  expect(changed).toMatchObject({ status: 'failed', monitor: { outcome: 'data_error' } }); expect(changed.reason).toContain('外部修改')
  expect(await store.load('automationMonitorCheckpoints')).toEqual(checkpoint); expect(verifications).toBe(1)
  await writeFile(original.path, bytes); revokeAfterRead = true
  const revoked = await check('revoked-after-read')
  expect(revoked).toMatchObject({ status: 'failed', monitor: { outcome: 'data_error' } }); expect(revoked.reason).toContain('撤权'); expect(verifications).toBe(2)
  expect(await store.load('automationMonitorCheckpoints')).toEqual(checkpoint); expect(modelCalls).toBe(0)
})

it('runs the real product monitoring IPC without model calls or chat spam and clears private checkpoints with chat history', async () => {
  const path = await root()
  let modelCalls = 0
  const make = async () => {
    const service = new AppService({ dataPath: path, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, engine: { test: async () => '', run: async () => { modelCalls++; throw new Error('monitor must not invoke a model') } } })
    await service.init(); disposers.push(() => service.close()); return service
  }
  const service = await make(), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); disposers.push(() => store.close())
  const connection = await service.handle('saveConnection', { name: 'isolated', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as Connection
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  await service.handle('saveAgent', { ...agent, connectionId: connection.id, allowCommands: false })
  const chat = await service.handle('createConversation', { kind: 'direct', title: '来源聊天', agentIds: ['researcher'] }) as Conversation
  const plan = await service.handle('saveAutomation', input(chat.id)) as AutomationDefinition
  await expect(service.handle('saveAutomation', { ...input(chat.id), conversationId: 'another' })).rejects.toThrow()
  const check = async (id: string, contents?: unknown) => {
    if (contents) { const artifact = await published(path, chat, id, contents); await store.write([{ collection: 'artifacts', id, value: artifact }]) }
    const o = await service.handle('runAutomation', { id: plan.id, requestId: id }) as AutomationOccurrence
    await until(async () => !['admitted', 'running'].includes((await service.handle('getAutomationOccurrence', { id: o.id }) as AutomationOccurrence).status))
    return service.handle('getAutomationOccurrence', { id: o.id }) as Promise<AutomationOccurrence>
  }
  const missing = await check('missing')
  expect(missing).toMatchObject({ status: 'failed', monitor: { outcome: 'data_error' } })
  const baseline = await check('baseline', data(100)); expect(baseline.monitor?.outcome).toBe('baseline')
  const changed = await check('change', data(112)); expect(changed.monitor?.notification).toBe('eligible')
  const same = await check('same'); expect(same.monitor?.outcome).toBe('no_change')
  const before = await store.load<AutomationMonitorCheckpoint>('automationMonitorCheckpoints')
  const failed = await check('incomplete', data(112, false)); expect(failed.monitor?.outcome).toBe('data_error')
  expect(await store.load('automationMonitorCheckpoints')).toEqual(before)
  const detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail
  expect(detail.messages).toEqual([]); expect(detail.runs).toEqual([]); expect(modelCalls).toBe(0)
  await service.close(); const restarted = await make()
  expect((await restarted.handle('getAutomationOccurrence', { id: changed.id }) as AutomationOccurrence).monitor).toEqual(changed.monitor)
  expect(modelCalls).toBe(0)
  await restarted.handle('clearConversationHistory', { id: chat.id, hide: false })
  expect(await store.load('automationMonitorCheckpoints')).toEqual([])
  const cleared = await restarted.handle('getAutomationOccurrence', { id: changed.id }) as AutomationOccurrence
  expect(cleared.monitor).toBeUndefined(); expect(cleared.deliveryStatus).toBe('unknown')
  expect(await restarted.handle('runAutomation', { id: plan.id, requestId: 'change' })).toMatchObject({ id: changed.id })
  expect(await store.load('automationMonitorCheckpoints')).toEqual([]); expect(modelCalls).toBe(0)
})

it('commits stop before signalling the reader and retains its slot until actual exit', async () => {
  const path = await root(), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); disposers.push(() => store.close())
  let release!: (value: AutomationMonitorRead) => void, started = false, aborted = false, cancelledModel = 0
  const wait = new Promise<AutomationMonitorRead>(resolve => { release = resolve })
  const service = new AutomationService(store, path, { critical: fn => fn(), validate: () => 'authorized', busy: () => false, changed: () => {}, notify: () => {}, inspect: () => { throw new Error('monitor must not aggregate model work') }, cancel: async () => { cancelledModel++ }, dispatch: async () => { throw new Error('monitor must not dispatch a model') }, readMonitor: async (_d, signal) => { started = true; signal.addEventListener('abort', () => { aborted = true }); return wait } })
  disposers.push(() => service.close()); await service.init()
  const d = await service.save(input('chat')), o = await service.run(d.id, 'one')
  try {
    await until(async () => started)
    await service.stop(o.id)
    expect(aborted).toBe(true); expect(cancelledModel).toBe(0)
    expect(service.hasActiveConversation('chat')).toBe(true)
    await expect(service.beforeBackup()).rejects.toThrow('自动化正在执行')
    expect(await service.run(d.id, 'two')).toMatchObject({ status: 'skipped' })
  } finally { release({ observation: data(500), evidence: { artifactId: 'late', name: 'metrics.json', publishedAt: new Date().toISOString(), fileHash: 'a'.repeat(64) } }) }
  await until(async () => (await service.occurrence(o.id)).status === 'cancelled')
  expect(await store.load('automationMonitorCheckpoints')).toEqual([])
  expect(service.hasActiveConversation('chat')).toBe(false)
})

it('rejects a read completed after permission changes and never creates a comparison baseline', async () => {
  const path = await root(), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); disposers.push(() => store.close())
  let permission = 'authorized', release!: (value: AutomationMonitorRead) => void
  const wait = new Promise<AutomationMonitorRead>(resolve => { release = resolve })
  const service = new AutomationService(store, path, { critical: fn => fn(), validate: () => permission, busy: () => false, changed: () => {}, notify: () => {}, inspect: () => undefined, cancel: async () => {}, dispatch: async () => { throw new Error('unexpected model dispatch') }, readMonitor: () => wait })
  disposers.push(() => service.close()); await service.init()
  const d = await service.save(input('chat')), o = await service.run(d.id, 'one')
  permission = 'changed'
  release({ observation: data(100), evidence: { artifactId: 'late', name: 'metrics.json', publishedAt: new Date().toISOString(), fileHash: 'a'.repeat(64) } })
  await until(async () => (await service.occurrence(o.id)).status === 'failed')
  expect((await service.occurrence(o.id)).reason).toContain('授权已变化')
  expect(await store.load('automationMonitorCheckpoints')).toEqual([])
  expect(await service.run(d.id, 'new')).toMatchObject({ status: 'skipped', attentionReason: 'authorization' })
})

it('marks an exited check for review if result and failure writes both fail, without reading the source twice', async () => {
  const path = await root(), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); disposers.push(() => store.close())
  let reads = 0
  const service = new AutomationService(store, path, { critical: fn => fn(), validate: () => 'authorized', busy: () => false, changed: () => {}, notify: () => {}, inspect: () => undefined, cancel: async () => {}, dispatch: async () => { throw new Error('unexpected model dispatch') }, readMonitor: async () => { reads++; return { observation: data(100), evidence: { artifactId: 'source', name: 'metrics.json', publishedAt: new Date().toISOString(), fileHash: 'a'.repeat(64) } } } })
  disposers.push(() => service.close()); await service.init()
  const d = await service.save(input('chat')), transaction = store.transaction.bind(store)
  let failures = 2
  store.transaction = fn => transaction(tx => fn({ ...tx, put: async row => {
    if (failures > 0 && (row.collection === 'automationMonitorCheckpoints' || row.collection === 'automationOccurrences' && (row.value as AutomationOccurrence).status === 'failed')) { failures--; throw new Error('result storage unavailable') }
    await tx.put(row)
  } }))
  const o = await service.run(d.id, 'one')
  await until(async () => (await service.occurrence(o.id)).status === 'needs_review')
  expect((await service.occurrence(o.id)).reason).toContain('不会自动重读')
  expect(reads).toBe(1); expect(await store.load('automationMonitorCheckpoints')).toEqual([])
  expect(service.hasActiveConversation('chat')).toBe(false)
  store.transaction = transaction
})

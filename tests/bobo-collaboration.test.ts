/*
 * [INPUT]: 真实 SQLite/受管文件、原用户请求与 Work 持有者，以及故障注入。
 * [OUTPUT]: 员工一等身份、仅缺员准备与新旧 Mastra 默认浏览器能力摘要、三种组织模式/原预算原子发布、幂等/只读恢复和取消实际退出及 hash 清理不变量。
 * [POS]: bobo 组织模块验收；不使用模型或伪造群运行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test, vi } from 'vitest'
import type { AgentRun, Conversation, DigitalAgent, Message, WorkExecution, WorkItem } from '../src/shared/domain'
import type { BoboCollaborationOperation, BoboCollaborationPlan, BoboOrganizationAuthority } from '../src/shared/domain/bobo-collaboration'
import { boboCollaborationPlanSchema } from '../src/shared/domain/bobo-collaboration'
import type { BoboOrganizationMode } from '../src/shared/domain/work'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { BoboCollaborationService, type BoboCollaborationHooks } from '../src/runtime/modules/bobo-collaboration/service'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import { assertOrganizationHolder, bindGroupStart } from '../src/runtime/modules/collaboration/work-collaboration'
import { listArtifacts } from '../src/runtime/modules/resources/local-resources'
import { newWorkBudget } from '../src/runtime/modules/collaboration/work-budget'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const plan: BoboCollaborationPlan = { existingMembers: [{ agentId: 'writer', configVersion: 1 }], newEmployees: [{ name: '审核', role: '核对内容', instructions: '核对事实和遗漏。' }], groupTitle: '写作协作', announcement: '目标：完成文章。写手起草，审核核对，我组织交付。' }
function deferred() { let resolve!: () => void; return { promise: new Promise<void>(done => { resolve = done }), resolve: () => resolve() } }
async function fixture(mode: BoboOrganizationMode = 'organize_and_execute', overrides: Partial<BoboCollaborationHooks> = {}) {
  const dataPath = await mkdtemp(join(tmpdir(), 'boai-bobo-org-')); cleanups.push(() => rm(dataPath, { recursive: true, force: true }))
  const store = new ProductStore(join(dataPath, 'db.sqlite')); await store.init(); cleanups.push(() => store.close())
  const homes = new WorkspaceService(dataPath), stamp = new Date().toISOString()
  const core: DigitalAgent = { id: 'bobo', systemRole: 'core', name: 'bobo', role: '个人助手', instructions: '协助组织。', color: '#6675a4', executionBackend: { kind: 'mastra-model' }, connectionId: 'model', modelId: 'fixture', skillIds: [], knowledgeIds: [], active: true, allowBrowser: false, allowCommands: false, configVersion: 1 }
  const writer: DigitalAgent = { ...core, id: 'writer', name: '写手', role: '文章写作', systemRole: undefined, instructions: 'PRIVATE_EMPLOYEE_RULES', allowBrowser: true, allowCommands: true, skillIds: ['skill'] }
  const conversation: Conversation = { id: 'core', kind: 'direct', purpose: 'core', title: '需求讨论', agentIds: ['bobo'], mode: 'natural', workspacePath: join(dataPath, 'workspaces/core'), sharedKnowledgeIds: [], createdAt: stamp, updatedAt: stamp, configVersion: 1 }
  const source: Message = { id: 'source', conversationId: 'core', senderType: 'user', senderId: 'user', senderName: '本人', content: '请帮我找员工写文章并组织协作。', sequence: 1, status: 'completed', createdAt: stamp, materialIds: ['private-material'] }
  const budget = newWorkBudget('budget', { collaborationRequestId: 'bobo-collaboration:source', conversationId: 'core' }); budget.workItems = 1
  const work: WorkItem = { id: 'organization', schemaVersion: 2, organization: { requestId: 'bobo-collaboration:source', mode, goal: '完成文章' }, ownerAgentId: 'bobo', conversationId: 'core', sourceMessageId: 'source', key: 'organize', scope: '写作', deliverable: '建立协作', activeRunId: 'actual-core-run', version: 1, status: 'running', budgetId: budget.id, rootWorkId: 'organization', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: stamp, updatedAt: stamp }
  const execution: WorkExecution = { id: 'actual-core-run', workId: work.id, budgetId: budget.id, agentId: 'bobo', claimVersion: 1, modelCalls: 0, usage: {}, status: 'active' }
  const run: AgentRun = { id: execution.id, conversationId: conversation.id, agentId: 'bobo', agentName: core.name, triggerMessageId: source.id, messageId: 'actual-draft', status: 'running', workId: work.id, workVersion: work.version, responseKind: 'task', phase: 'execution', createdAt: stamp, toolEvents: [] }
  await store.write([
    { collection: 'connections', id: 'model', value: { id: 'model', name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost', defaultModel: 'fixture', hasApiKey: false } },
    { collection: 'agents', id: core.id, value: core }, { collection: 'agents', id: writer.id, value: writer },
    { collection: 'resources', id: 'skill', value: { id: 'skill', kind: 'skill', name: '写作技能', path: '/PRIVATE_PATH', createdAt: stamp } },
    { collection: 'conversations', id: conversation.id, value: conversation }, { collection: 'messages', id: source.id, value: source },
    { collection: 'runs', id: run.id, value: run }, { collection: 'profileModelCalls', id: 'actual-model-call', value: { id: 'actual-model-call', runId: run.id, conversationId: conversation.id, phase: 'execution', startedAt: stamp, budgetOwned: true } },
    { collection: 'workItems', id: work.id, value: work }, { collection: 'workBudgets', id: budget.id, value: budget }, { collection: 'workExecutions', id: execution.id, value: execution },
    { collection: 'contactList', id: 'contacts', value: { revision: 2, categories: [], categoryByAgentId: {}, agentOrder: ['writer'], groupOrder: [] } },
  ])
  await homes.initialize(writer); await writeFile(join(dataPath, writer.workspaceRef!, 'private/personal.txt'), 'EXISTING_PERSONAL_FILE')
  const hooks: BoboCollaborationHooks = { critical: action => action(), install: vi.fn(), reload: vi.fn(async () => {}), changed: vi.fn(), assertOrganizationHolder, bindGroupStart, commitReading: async (tx, announcement) => { await tx.put({ collection: 'testReading', id: announcement.id, value: { messageId: announcement.id } }) }, ...overrides }
  const service = new BoboCollaborationService(store, dataPath, homes, hooks); cleanups.push(() => service.close())
  const authority: BoboOrganizationAuthority = { workId: work.id, runId: execution.id, workVersion: 1, sourceConversationId: conversation.id, sourceMessageId: source.id, agentConfigVersion: 1 }
  const provenance = { modelCallId: 'actual-model-call', toolCallId: 'actual-tool-call' }
  return { dataPath, store, homes, service, hooks, authority, provenance, writer, work, budget, source }
}

test.each(['employee_creation', 'organize_only', 'organize_and_execute'] as const)('%s preserves independent employees and publishes only authorized objects', async mode => {
  const f = await fixture(mode), input = mode === 'employee_creation' ? { existingMembers: [], newEmployees: plan.newEmployees } : plan
  const before = await readFile(join(f.dataPath, f.writer.workspaceRef!, 'private/personal.txt'), 'utf8')
  const receipt = await f.service.organize(input, f.authority, f.provenance)
  expect(receipt.status).toBe('committed'); expect(receipt.agents).toHaveLength(1)
  const agents = await f.store.load<DigitalAgent>('agents'), existing = agents.find(agent => agent.id === 'writer')!
  expect(existing.instructions).toBe('PRIVATE_EMPLOYEE_RULES'); expect(existing.allowCommands).toBe(true); expect(existing.allowBrowser).toBe(true)
  expect(await readFile(join(f.dataPath, f.writer.workspaceRef!, 'private/personal.txt'), 'utf8')).toBe(before)
  const created = agents.find(agent => agent.id === receipt.agents[0].id)!
  expect(created).toMatchObject({ allowCommands: false, allowBrowser: true, skillIds: [], knowledgeIds: [], creationSource: { kind: 'bobo-collaboration', operationId: receipt.id } })
  expect(await readFile(join(f.dataPath, created.workspaceRef!, 'AGENTS.md'), 'utf8')).toBe(plan.newEmployees[0].instructions)
  const groups = (await f.store.load<Conversation>('conversations')).filter(item => item.kind === 'group'), messages = await f.store.load<Message>('messages')
  expect(messages.find(message => message.id === 'source')).toEqual(f.source)
  expect(await f.store.load('runs')).toHaveLength(1); expect((await f.store.load<AgentRun>('runs'))[0].conversationId).toBe('core')
  if (mode === 'employee_creation') { expect(groups).toEqual([]); expect(messages).toHaveLength(1); expect(await f.store.load('collaborationStarts')).toEqual([]); expect(await f.store.load('workItems')).toHaveLength(1) }
  else {
    expect(groups).toHaveLength(1); expect(groups[0].agentIds).toEqual(['bobo', 'writer', created.id]); expect(groups[0].sharedKnowledgeIds).toEqual([])
    const announcement = messages.find(message => message.id === receipt.announcementMessageId)!
    expect(announcement).toMatchObject({ senderType: 'agent', senderId: 'bobo', content: plan.announcement, collaborationSource: { sourceRunId: f.authority.runId, modelCallId: f.provenance.modelCallId, toolCallId: f.provenance.toolCallId } })
    expect(announcement.runId).toBeUndefined(); expect(announcement.materialIds).toBeUndefined(); expect(await f.store.load('testReading')).toHaveLength(1)
    expect(await f.store.load('collaborationStarts')).toHaveLength(mode === 'organize_and_execute' ? 1 : 0)
    const works = await f.store.load<WorkItem>('workItems'); expect(works).toHaveLength(mode === 'organize_and_execute' ? 2 : 1)
    if (mode === 'organize_and_execute') { expect(works.find(work => work.id === receipt.groupRootWorkId)?.budgetId).toBe(f.budget.id); expect(works.find(work => work.id === receipt.groupRootWorkId)?.parentWorkId).toBeUndefined(); expect(receipt.startStatus).toBe('pending') }
  }
  expect(JSON.stringify(receipt)).not.toContain('workspace'); expect(JSON.stringify(receipt)).not.toContain('PRIVATE_EMPLOYEE_RULES')
  expect(await f.service.list({ conversationId: 'core' })).toHaveLength(1)
})

test('same source freezes one request and altered plan cannot duplicate employees/groups', async () => {
  const f = await fixture()
  const results = await Promise.all([f.service.organize(plan, f.authority, f.provenance), f.service.organize(plan, f.authority, { ...f.provenance, toolCallId: 'second-call' })])
  expect(new Set(results.map(item => item.id)).size).toBe(1); expect(await f.store.load('agents')).toHaveLength(3)
  await expect(f.service.organize({ ...plan, groupTitle: '另一个群' }, f.authority, f.provenance)).rejects.toThrow('REQUEST_CONFLICT')
  expect(await f.service.lookup({ requestId: 'bobo-collaboration:source' })).toMatchObject({ id: results[0].id, status: 'committed' })
})

test('employee discovery filters in SQL, bounds capabilities and never reads rules/history/credentials', async () => {
  const f = await fixture(), all: {collection:string;id:string;value:unknown}[] = []
  for (let index = 0; index < 25; index++) { const id = `candidate-${String(index).padStart(2, '0')}`; all.push({ collection: 'agents', id, value: { ...f.writer, id, name: `员工${index}`, allowBrowser: index % 2 ? undefined : false, instructions: `PRIVATE_${index}` } }) }
  all.push({ collection: 'agents', id: 'inactive', value: { ...f.writer, id: 'inactive', active: false } }, { collection: 'agents', id: 'acp', value: { ...f.writer, id: 'acp', executionBackend: { kind: 'acp-local', profileId: 'private' } } }, { collection: 'agents', id: 'missing-model', value: { ...f.writer, id: 'missing-model', connectionId: 'missing' } }, { collection: 'contactDeletions', id: 'deletion', value: { id: 'deletion', agentIds: ['candidate-00'] } })
  await f.store.write(all)
  const page = await f.service.findEmployees({ limit: 3 }); expect(page.employees).toHaveLength(3); expect(page.revision).toBe(2); expect(page.cursor).toBeTruthy()
  expect(page.employees[0].agentId).toBe('candidate-01'); expect(page.employees[0].capabilities).toMatchObject({ browser: true, commands: true, skills: [{ id: 'skill', name: '写作技能' }] })
  expect(JSON.stringify(page)).not.toMatch(/PRIVATE|instructions|baseUrl|apiKey|workspace|path/)
  const next = await f.service.findEmployees({ limit: 3, cursor: page.cursor }); expect(next.employees[0].agentId).toBe('candidate-04')
  await expect(f.service.findEmployees({ limit: 3, search: '不同', cursor: page.cursor })).rejects.toThrow('STALE_CURSOR')
  await f.store.write([{ collection: 'agents', id: 'candidate-02', value: { ...f.writer, id: 'candidate-02', configVersion: 2 } }])
  await expect(f.service.findEmployees({ limit: 3, cursor: page.cursor })).rejects.toThrow('STALE_CURSOR')
  const lookup = await f.service.findEmployees({ search: '文章' }); expect(lookup.employees.length).toBeLessThanOrEqual(20); expect(lookup.employees.every(agent => agent.role.includes('文章'))).toBe(true)
})

test.each(['holder', 'source', 'contact', 'employee'])('a changed %s before publication leaves every object unpublished', async change => {
  const f = await fixture(undefined, { checkpoint: async phase => {
    if (phase !== 'before-commit') return
    if (change === 'holder') await f.store.write([{ collection: 'workItems', id: f.work.id, value: { ...f.work, activeRunId: 'new-run' } }])
    if (change === 'source') await f.store.write([{ collection: 'messages', id: 'source', value: { ...f.source, content: 'changed' } }])
    if (change === 'contact') await f.store.write([{ collection: 'contactList', id: 'contacts', value: { revision: 3, categories: [], categoryByAgentId: {}, agentOrder: [], groupOrder: [] } }])
    if (change === 'employee') await f.store.write([{ collection: 'agents', id: f.writer.id, value: { ...f.writer, configVersion: 2 } }])
  } })
  const receipt = await f.service.organize(plan, f.authority, f.provenance)
  expect(receipt.status).toBe('needs_attention'); expect(await f.store.load('agents')).toHaveLength(2); expect(await f.store.load('messages')).toHaveLength(1); expect(await f.store.load('conversations')).toHaveLength(1); expect(await f.store.load('collaborationStarts')).toEqual([])
})

test('announcement reading fault rolls back objects/start/budget and explicit resume uses original identities', async () => {
  let failReading = true
  const f = await fixture(undefined, { commitReading: async () => { if (failReading) throw new Error('reading transaction fault') } })
  const failed = await f.service.organize(plan, f.authority, f.provenance)
  expect(failed.status).toBe('needs_attention'); expect(await f.store.load('agents')).toHaveLength(2); expect(await f.store.load('collaborationStarts')).toEqual([])
  expect((await f.store.load<{workItems:number}>('workBudgets'))[0].workItems).toBe(1)
  await expect(f.service.resume({ operationId: failed.id, expectedVersion: failed.version })).rejects.toThrow('ACTIVE_HOLDER_REQUIRED')
  failReading = false
  const resumed = await f.service.resume({ operationId: failed.id, expectedVersion: failed.version }, f.authority)
  expect(resumed.status).toBe('committed'); expect(resumed.agents.map(agent => agent.id)).toEqual(failed.agents.map(agent => agent.id)); expect(resumed.groupConversationId).toBe(failed.groupConversationId)
})

test('cancel waits for the file writer to exit, cleans only owned new roots and never removes existing workspace', async () => {
  const entered = deferred(), release = deferred()
  const f = await fixture(undefined, { checkpoint: async phase => { if (phase === 'before-write') { entered.resolve(); await release.promise } } })
  const controller = new AbortController(), pending = f.service.organize(plan, f.authority, f.provenance, controller.signal)
  await entered.promise; controller.abort()
  let completed = false; void pending.then(() => { completed = true }); await new Promise(resolve => setTimeout(resolve, 30)); expect(completed).toBe(false)
  await expect(f.service.assertBackup()).rejects.toThrow('CLEANUP_REQUIRED')
  release.resolve(); const cancelled = await pending
  expect(cancelled.status).toBe('cancelled'); expect(await f.store.load('agents')).toHaveLength(2); expect(await readFile(join(f.dataPath, f.writer.workspaceRef!, 'private/personal.txt'), 'utf8')).toBe('EXISTING_PERSONAL_FILE')
  expect((await readdir(join(f.dataPath, 'agents')))).toEqual(['writer']); await f.service.assertBackup()
})

test('recovery only audits files, never calls publication; modified owned files are preserved on abandon', async () => {
  let once = true
  const f = await fixture(undefined, { checkpoint: async phase => { if (phase === 'after-move' && once) { once = false; throw new Error('power interruption') } } })
  const broken = await f.service.organize(plan, f.authority, f.provenance), frozen = (await f.store.load<BoboCollaborationOperation>('boboCollaborations'))[0]
  expect(broken.status).toBe('needs_attention'); await f.service.recover()
  const recovered = await f.service.get({ operationId: broken.id }); expect(recovered.status).toBe('interrupted'); expect(f.hooks.install).not.toHaveBeenCalled(); expect(await f.store.load('collaborationStarts')).toEqual([])
  const path = join(f.dataPath, frozen.agents[0].workspaceRef!, 'AGENTS.md'); await writeFile(path, 'USER_MODIFIED')
  await expect(f.service.abandon({ operationId: recovered.id, expectedVersion: recovered.version })).rejects.toThrow('FILES_CONFLICT')
  expect(await readFile(path, 'utf8')).toBe('USER_MODIFIED'); expect((await f.service.get({ operationId: broken.id })).status).toBe('needs_attention')
})

test('clearing the original discussion preserves the independent committed group/employees/shared budget', async () => {
  const f = await fixture(), committed = await f.service.organize(plan, f.authority, f.provenance)
  await f.service.clearSource('core')
  const op = (await f.store.load<BoboCollaborationOperation>('boboCollaborations'))[0]
  expect(op).toMatchObject({ status: 'committed', sourceCleared: true, goal: '', budgetId: f.budget.id, groupRootWorkId: committed.groupRootWorkId })
  expect(await f.store.load('agents')).toHaveLength(3); expect(await f.store.load('conversations')).toHaveLength(2); expect(await f.store.load('workItems')).toHaveLength(2); expect(await f.service.list({ conversationId: 'core' })).toEqual([])
  await expect(f.service.organize(plan, f.authority, f.provenance)).rejects.toThrow('SOURCE_CHANGED')
  await f.service.clearGroup(committed.groupConversationId!); expect(await f.store.load('agents')).toHaveLength(3)
})

test('strict plan cannot grant mode, budget, materials, private inputs or core identity', async () => {
  for (const extra of [{ mode: 'organize_and_execute' }, { materialIds: ['private'] }, { requestId: 'another' }, { budgetId: 'new-budget' }]) expect(boboCollaborationPlanSchema.safeParse({ ...plan, ...extra }).success).toBe(false)
  const f = await fixture(); await expect(f.service.organize({ ...plan, existingMembers: [{ agentId: 'bobo', configVersion: 1 }] }, f.authority, f.provenance)).rejects.toThrow('CONFIG_CHANGED')
  expect(await f.store.load('boboCollaborations')).toEqual([])
})

test('reused employee connection mutation is rechecked even when its config version is unchanged', async () => {
  const f = await fixture(undefined, { checkpoint: async phase => {
    if (phase !== 'before-commit') return
    await f.store.write([{ collection: 'connections', id: 'other-model', value: { id: 'other-model', name: 'other', provider: 'openai-compatible', baseUrl: 'http://changed', defaultModel: 'fixture', hasApiKey: false } }])
  } })
  await f.store.write([{ collection: 'connections', id: 'other-model', value: { id: 'other-model', name: 'other', provider: 'openai-compatible', baseUrl: 'http://original', defaultModel: 'fixture', hasApiKey: false } }, { collection: 'agents', id: 'writer', value: { ...f.writer, connectionId: 'other-model' } }])
  const result = await f.service.organize(plan, f.authority, f.provenance)
  expect(result.status).toBe('needs_attention'); expect(result.error).toContain('模型连接已变化'); expect(await f.store.load('agents')).toHaveLength(2); expect(await f.store.load('collaborationStarts')).toEqual([])
})

test('only existing employees create a real independent group without cloning any employee workspace', async () => {
  const f = await fixture('organize_only'), result = await f.service.organize({ ...plan, newEmployees: [] }, f.authority, f.provenance)
  expect(result.status).toBe('committed'); expect(result.agents).toEqual([]); expect(await f.store.load('agents')).toHaveLength(2)
  expect((await f.store.load<Conversation>('conversations')).find(group => group.id === result.groupConversationId)?.agentIds).toEqual(['bobo', 'writer'])
  expect(await readdir(join(f.dataPath, 'agents'))).toEqual(['writer'])
})

test('source clearing within the host critical boundary cannot recursively reacquire that boundary', async () => {
  let entered = false
  const f = await fixture(undefined, { critical: async action => { if (entered) throw new Error('nested critical lock'); entered = true; try { return await action() } finally { entered = false } }, checkpoint: async phase => { if (phase === 'before-commit') throw new Error('interrupt before publish') } })
  const failed = await f.service.organize(plan, f.authority, f.provenance); expect(failed.status).toBe('needs_attention')
  entered = true
  try { await f.service.clearSource('core', { criticalHeld: true }) } finally { entered = false }
  const receipt = await f.service.get({ operationId: failed.id }); expect(receipt).toMatchObject({ status: 'cancelled', sourceCleared: true, agents: [] })
  expect(await f.store.load('agents')).toHaveLength(2)
})

test('host source invalidation during preparation prevents old derived content publication', async () => {
  let valid = true
  const f = await fixture(undefined, { validateSource: async () => { if (!valid) throw new Error('original memory source invalidated') }, checkpoint: async phase => { if (phase === 'before-commit') valid = false } })
  const result = await f.service.organize(plan, f.authority, f.provenance)
  expect(result.status).toBe('needs_attention'); expect(result.error).toContain('source invalidated'); expect(await f.store.load('agents')).toHaveLength(2); expect(await f.store.load('collaborationStarts')).toEqual([])
})

test('the committed group ownership marker never appears as a loose or discovered historical artifact', async () => {
  const f = await fixture('organize_only'), result = await f.service.organize(plan, f.authority, f.provenance)
  const group = (await f.store.load<Conversation>('conversations')).find(item => item.id === result.groupConversationId)!
  expect(await readFile(join(group.workspacePath, '.team-creation.json'), 'utf8')).toContain(result.id)
  expect(await listArtifacts(group.workspacePath)).toEqual([])
  await mkdir(join(group.workspacePath, 'artifacts')); await writeFile(join(group.workspacePath, 'artifacts/report.md'), 'REAL_REPORT')
  // User-authored hidden names remain valid files; only the host-reserved ownership marker is excluded.
  await writeFile(join(group.workspacePath, '.notes.md'), 'USER_NOTES')
  const listed = await listArtifacts(group.workspacePath)
  expect(listed.map(item => item.name)).toEqual(['.notes.md', 'artifacts/report.md']); expect(listed.some(item => item.path.endsWith('.team-creation.json'))).toBe(false)
  await f.service.recover(); expect(await listArtifacts(group.workspacePath)).toHaveLength(2)
})

test('explicit recovery uses a new holder without claiming that it generated the frozen announcement or rewriting ready files', async () => {
  let once = true
  const f = await fixture(undefined, { checkpoint: async phase => { if (phase === 'before-commit' && once) { once = false; throw new Error('publication interrupted') } } })
  const interrupted = await f.service.organize(plan, f.authority, f.provenance)
  const audited = await f.service.auditOperation({ operationId: interrupted.id, expectedVersion: interrupted.version })
  const path = join(f.dataPath, audited.agents[0].workspaceRef!, 'AGENTS.md'), before = await stat(path)
  const nextRun = 'explicit-recovery-run', authority = { ...f.authority, runId: nextRun, workVersion: 2 }
  await f.store.write([{ collection: 'workItems', id: f.work.id, value: { ...f.work, version: 2, activeRunId: nextRun } }, { collection: 'workExecutions', id: f.authority.runId, value: { id: f.authority.runId, workId: f.work.id, budgetId: f.budget.id, agentId: 'bobo', claimVersion: 1, modelCalls: 0, usage: {}, status: 'released' } }, { collection: 'workExecutions', id: nextRun, value: { id: nextRun, workId: f.work.id, budgetId: f.budget.id, agentId: 'bobo', claimVersion: 2, modelCalls: 0, usage: {}, status: 'active' } }])
  const result = await f.service.resume({ operationId: interrupted.id, expectedVersion: interrupted.version }, authority)
  expect(result.status).toBe('committed'); expect(result.agents.map(agent => agent.id)).toEqual(interrupted.agents.map(agent => agent.id)); expect((await stat(path)).mtimeMs).toBe(before.mtimeMs)
  const announcement = (await f.store.load<Message>('messages')).find(message => message.id === result.announcementMessageId)!
  expect(announcement.collaborationSource).toMatchObject({ sourceRunId: f.authority.runId, toolCallId: f.provenance.toolCallId, modelCallId: f.provenance.modelCallId }); expect(announcement.runId).toBeUndefined()
})

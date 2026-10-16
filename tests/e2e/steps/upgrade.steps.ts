/*
 * [OUTPUT]: 技能一级入口随产品统一为自定义。
 * [INPUT]: 旧版数据升级且不重放工作的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 资料库主页面退役后，旧受管技能正文和文件通过真实 IPC 核读，现行技能主导航仍可用；核心预置身份与普通员工场景隔离，保留原业务断言；一致性旧格式备份恢复后原技能绑定可用于新任务、知识内容保持且旧工作不重放；旧版数据升级且不重放工作的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/upgrade.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { isCoreAgent } from '../../../src/shared/domain/core-agent'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { DigitalAgent, Conversation, Message, AgentRun, Resource } from '../../../src/shared/domain'
import { startSkillDeliveryModel } from '../../fixtures/skills/delivery-model'

type Scenario = {
  prepareLegacyData?: Awaited<ReturnType<typeof prepareLegacyData>>
  launchLegacyDesktop?: Awaited<ReturnType<typeof launchLegacyDesktop>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function prepareLegacyData(runtime: Desktop) {
  const root = runtime.root
  const time = new Date().toISOString()
  const agent: DigitalAgent = {
    id: 'legacy-agent',
    name: '旧版员工',
    role: '保留原样',
    instructions: 'LEGACY_INSTRUCTIONS_KEEP_EXACT\n原有工作规则。',
    color: '#556677',
    connectionId: '',
    modelId: '',
    skillIds: ['legacy-skill'],
    knowledgeIds: ['legacy-knowledge'],
    allowCommands: false,
    active: true,
    configVersion: 3,
  }
  const conversation: Conversation = {
    id: 'legacy-chat',
    kind: 'direct',
    title: '旧版会话',
    agentIds: [agent.id],
    mode: 'mention',
    workspacePath: join(root, 'workspaces/legacy-chat'),
    sharedKnowledgeIds: [],
    createdAt: time,
    updatedAt: time,
  }
  const message: Message = {
    id: 'legacy-user',
    conversationId: conversation.id,
    senderType: 'user',
    senderId: 'user',
    senderName: '我',
    content: '保留历史，不要自动执行',
    status: 'completed',
    sequence: 1,
    createdAt: time,
  }
  const run: AgentRun = {
    id: 'legacy-run',
    phase: 'execution',
    conversationId: conversation.id,
    agentId: agent.id,
    agentName: agent.name,
    triggerMessageId: message.id,
    messageId: 'legacy-response',
    status: 'running',
    createdAt: time,
    toolEvents: [],
  }
  await mkdir(conversation.workspacePath, { recursive: true })
  await writeFile(join(conversation.workspacePath, 'report.md'), '# 旧版产物')
  const skill: Resource = { id: 'legacy-skill', kind: 'skill', name: 'legacy-reader', description: '旧版技能', path: join(root, 'skills/legacy-skill/legacy-reader'), createdAt: time }
  const knowledge: Resource = { id: 'legacy-knowledge', kind: 'knowledge', name: 'facts.md', description: '旧版资料', path: join(root, 'knowledge/legacy-knowledge/facts.md'), createdAt: time }
  await mkdir(join(skill.path, 'references'), { recursive: true }); await mkdir(join(root, 'knowledge/legacy-knowledge'), { recursive: true })
  await writeFile(join(skill.path, 'SKILL.md'), '---\nname: legacy-reader\ndescription: 旧版技能\n---\n# 原有技能说明\n保留原绑定，不自动重放任务。')
  await writeFile(join(skill.path, 'references/evidence.md'), 'SKILL_EVIDENCE_legacybackup')
  await writeFile(knowledge.path, '# 原有知识\n知识资源不会被技能迁移改写。')
  const old = new ProductStore(join(root, 'boai.sqlite'))
  await old.init()
  await old.write([
    { collection: 'agents', id: agent.id, value: agent },
    { collection: 'conversations', id: conversation.id, value: conversation },
    { collection: 'messages', id: message.id, value: message },
    { collection: 'runs', id: run.id, value: run },
    { collection: 'resources', id: skill.id, value: skill },
    { collection: 'resources', id: knowledge.id, value: knowledge },
    { collection: 'jobs', id: 'old-job', value: { id: 'old-job', conversationId: conversation.id, status: 'running', runIds: [run.id] } },
    {
      collection: 'messages',
      id: 'legacy-response',
      value: {
        ...message,
        id: 'legacy-response',
        senderType: 'agent',
        senderId: agent.id,
        senderName: agent.name,
        sequence: 2,
        content: '曾经的部分输出',
        status: 'streaming',
        runId: run.id,
      },
    },
  ])
  await old.close()
  return { runtime, root, agent, conversation }
}

async function launchLegacyDesktop(previous: Awaited<ReturnType<typeof prepareLegacyData>>) {
  let { runtime, root, agent, conversation } = previous
  const restored = join(root, 'restored-old-backup')
  await mkdir(restored)
  const source = new ProductStore(join(root, 'boai.sqlite')); await source.init()
  try { await source.backup(join(restored, 'boai.sqlite')) } finally { await source.close() }
  for (const item of ['skills', 'knowledge', 'workspaces']) await cp(join(root, item), join(restored, item), { recursive: true })
  const desktop = await runtime.start({ dataDir: restored })

  const page = await desktop.firstWindow()
  return { root: restored, agent, conversation, page }
}

async function verifyMigration(previous: Awaited<ReturnType<typeof launchLegacyDesktop>>) {
  let { root, agent, conversation, page } = previous
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.filter(agent => !isCoreAgent(agent))).toHaveLength(1)
  expect(snapshot.agents.filter(isCoreAgent)).toHaveLength(1)
  expect(snapshot.agents[0].id).toBe(agent.id)
  expect(snapshot.conversations[0].mode).toBe('natural')
  const detail = await page.evaluate((id) => window.boai.request('getConversation', { id }), conversation.id)
  expect(detail.messages.map((m) => m.id)).toEqual(['legacy-user', 'legacy-response'])
  expect(detail.messages[1].status).toBe('interrupted')
  expect(detail.runs[0].status).toBe('interrupted')
  expect(detail.turns).toHaveLength(0)
  expect(detail.deliveries).toHaveLength(0)
  expect(detail.artifacts.find((a) => a.name === 'report.md')?.path).toContain('/v2/workspaces/legacy-chat/')
  const source = await page.evaluate((agentId) => window.boai.request('readAgentFile', { agentId, name: 'AGENTS.md' }), agent.id)
  expect(source.content).toBe(agent.instructions)
  expect(await readFile(join(conversation.workspacePath, 'report.md'), 'utf8')).toBe('# 旧版产物')
  expect(await readFile(join(root, 'v2/workspaces/legacy-chat/report.md'), 'utf8')).toBe('# 旧版产物')
  expect(snapshot.resources).toHaveLength(2)
  expect(snapshot.agents[0].skillIds).toEqual(['legacy-skill'])
  expect(snapshot.agents[0].knowledgeIds).toEqual(['legacy-knowledge'])
  const skill = await page.evaluate(() => window.boai.request('getSkillDetail', { resourceId: 'legacy-skill' }))
  expect(skill.content).toContain('原有技能说明')
  expect(skill.installation).toBeUndefined()
  expect(skill.resource.path).toBe(join(root, 'v2/skills/legacy-skill/legacy-reader'))
  expect(await readFile(join(root, 'skills/legacy-skill/legacy-reader/SKILL.md'), 'utf8')).toBe(skill.content)
  const knowledge = snapshot.resources.find(r => r.id === 'legacy-knowledge')!
  expect(await readFile(knowledge.path, 'utf8')).toBe(await readFile(join(root, 'knowledge/legacy-knowledge/facts.md'), 'utf8'))
  expect(await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).toMatchObject({ favoriteResourceIds: [], groups: [] })
  const file = await page.evaluate(() => window.boai.request('readSkillFile', { resourceId: 'legacy-skill', path: 'SKILL.md' }))
  expect(file.content).toBe(skill.content)
  const nav = page.getByRole('navigation', { name: '主导航' })
  await expect(nav.getByRole('button', { name: '资料库', exact: true })).toHaveCount(0)
  await nav.getByRole('button', { name: '自定义', exact: true }).click()
  for (const name of ['本地', '收藏', '商城']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
}

Given('旧版数据保留员工历史产物和未完成运行', async ({ runtime, scenario }) => {
  scenario.prepareLegacyData = await prepareLegacyData(runtime)
})

When('真实桌面打开旧版数据目录', async ({ scenario }) => {
  scenario.launchLegacyDesktop = await launchLegacyDesktop(scenario.prepareLegacyData!)
})

Then('历史和产物完整迁移且未完成运行标记中断', async ({ scenario }) => {
  await verifyMigration(scenario.launchLegacyDesktop!)
})

Then('旧格式备份保留的技能绑定可用于新的明确任务', async ({ runtime, scenario }) => {
  const { page, agent, conversation } = scenario.launchLegacyDesktop!
  const model = await startSkillDeliveryModel('legacy-reader'); runtime.trackServer(model.server)
  await page.evaluate(async ({ baseUrl, agentId, conversationId }) => {
    const connection = await window.boai.request('saveConnection', { name: '旧备份技能验收', provider: 'openai-compatible', baseUrl, defaultModel: 'fixture' })
    const current = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === agentId)!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = current
    await window.boai.request('saveAgent', { ...input, connectionId: connection.id, expectedConfigVersion: configVersion })
    await window.boai.request('sendMessage', { conversationId, content: '使用保留的技能读取依据并发布一份新报告', mentionIds: [], requestId: 'explicit-after-legacy-restore' })
  }, { baseUrl: model.url, agentId: agent.id, conversationId: conversation.id })
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).turns?.at(-1)?.status).toBe('completed')
  const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  const task = detail.runs.filter(r => r.phase === 'execution').at(-1)!
  expect(task.environment).toMatchObject({ resourceVersions: expect.arrayContaining([expect.objectContaining({ id: 'legacy-skill' })]), commandMode: 'disabled' })
  expect(task.toolEvents.filter(t => t.status === 'completed').map(t => t.name)).toEqual(['skill', 'skill_read', 'write_file', 'publish_artifact'])
  const artifact = detail.artifacts.find(a => a.name === 'skill-report.md')!
  expect(await readFile(artifact.path, 'utf8')).toBe('# 技能依据\nSKILL_EVIDENCE_legacybackup')
  expect(detail.runs.find(r => r.id === 'legacy-run')?.status).toBe('interrupted')
  expect(detail.messages.filter(m => m.senderType === 'user').map(m => m.content)).toEqual(['保留历史，不要自动执行', '使用保留的技能读取依据并发布一份新报告'])
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents[0].skillIds).toEqual(['legacy-skill'])
  expect(runtime.errors).toEqual([])
})

/*
 * [INPUT]: 旧版数据升级且不重放工作的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 旧版数据升级且不重放工作的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/upgrade.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { DigitalAgent, Conversation, Message, AgentRun } from '../../../src/shared/domain'

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
    skillIds: [],
    knowledgeIds: [],
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
  const old = new ProductStore(join(root, 'boai.sqlite'))
  await old.init()
  await old.write([
    { collection: 'agents', id: agent.id, value: agent },
    { collection: 'conversations', id: conversation.id, value: conversation },
    { collection: 'messages', id: message.id, value: message },
    { collection: 'runs', id: run.id, value: run },
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
  const desktop = await runtime.start({ dataDir: root })

  const page = await desktop.firstWindow()
  return { root, agent, conversation, page }
}

async function verifyMigration(previous: Awaited<ReturnType<typeof launchLegacyDesktop>>) {
  let { root, agent, conversation, page } = previous
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toHaveLength(1)
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

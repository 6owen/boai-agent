/*
 * [INPUT]: 技能执行产物与环境快照的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 任务面板按工作结果展示，运行成功通过原记录验证；会话菜单入口、技能产物、工作预算/业务结果、运行展示与环境快照的桌面断言。
 * [POS]: tests/e2e/steps/environment.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type ElectronApplication } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type Scenario = {
  prepareSkillEnvironment?: Awaited<ReturnType<typeof prepareSkillEnvironment>>
  publishReport?: Awaited<ReturnType<typeof publishReport>>
  inspectWorkspace?: Awaited<ReturnType<typeof inspectWorkspace>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function prepareSkillEnvironment(runtime: Desktop) {
  const root = runtime.root
  const skill = join(root, 'report-writer')
  await mkdir(skill)
  await writeFile(
    join(skill, 'SKILL.md'),
    '---\nname: report-writer\ndescription: Write and publish a report\n---\nWrite the requested report and publish the finished file.',
  )
  const modelCounter = { calls: 0 }
  const server = createServer(async (request, response) => {
    let text = ''
    for await (const chunk of request) text += chunk
    const input = JSON.parse(text),
      system = input.messages
        .filter((message: { role: string }) => message.role === 'system')
        .map((message: { content: string }) => message.content)
        .join('\n')
    modelCounter.calls++
    let content = '报告已发布。',
      tool: { name: string; arguments: string } | undefined
    if (system.includes('Private participation decision')) content = JSON.stringify({ action: 'reply', responseKind: 'task' })
    else if (system.includes('Private memory maintenance')) content = JSON.stringify({ candidates: [] })
    else {
      const count = input.messages.filter((message: { role: string }) => message.role === 'tool').length
      const operations = [
        { name: 'skill', arguments: JSON.stringify({ name: 'report-writer' }) },
        {
          name: 'write_file',
          arguments: JSON.stringify({ path: 'self:/work/report.md', content: '# Packaged report\nSkill and workspace verified.' }),
        },
        { name: 'publish_artifact', arguments: JSON.stringify({ path: 'self:/work/report.md', name: 'report.md' }) },
      ]
      tool = operations[count]
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const emit = (delta: unknown, finish_reason: string | null = null) =>
      response.write(
        `data: ${JSON.stringify({ id: `response-${modelCounter.calls}`, object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      )
    emit({ role: 'assistant' })
    if (tool) {
      emit({ tool_calls: [{ index: 0, id: `tool-${modelCounter.calls}`, type: 'function', function: tool }] })
      emit({}, 'tool_calls')
    } else {
      emit({ content })
      emit({}, 'stop')
    }
    response.end('data: [DONE]\n\n')
  })
  runtime.trackServer(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  let desktop: ElectronApplication | undefined
  const launch = () => runtime.start({ dataDir: join(root, 'data') })

  desktop = await launch()
  let page = await desktop.firstWindow()
  await desktop.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
  }, skill)
  const imported = await page.evaluate(async () => {
    const path = await window.boai.request('choosePath', { kind: 'skill' })
    return window.boai.request('importResource', { kind: 'skill', path: path! })
  })
  const connection = await page.evaluate(
    (port) =>
      window.boai.request('saveConnection', {
        name: 'Local fixture',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        defaultModel: 'fixture',
      }),
    port,
  )
  await page.evaluate(
    async ({ skillId, connectionId }) => {
      const agent = (await window.boai.request('snapshot', undefined)).agents.find((agent) => agent.id === 'researcher')!
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, skillIds: [skillId], connectionId, expectedConfigVersion: configVersion })
    },
    { skillId: imported.id, connectionId: connection.id },
  )
  const conversation = await page.evaluate(() =>
    window.boai.request('createConversation', { kind: 'direct', title: '技能文件验证', agentIds: ['researcher'] }),
  )
  return { runtime, skill, modelCounter, desktop, launch, page, imported, conversation }
}

async function publishReport(previous: Awaited<ReturnType<typeof prepareSkillEnvironment>>) {
  let { runtime, skill, modelCounter, desktop, launch, page, imported, conversation } = previous
  await page.evaluate(
    (conversationId) =>
      window.boai.request('sendMessage', { conversationId, content: '请使用技能写一份报告并发布', mentionIds: [], requestId: 'environment-task' }),
    conversation.id,
  )
  await expect
    .poll(async () => {
      const detail = await page.evaluate((id) => window.boai.request('getConversation', { id }), conversation.id)
      return detail.turns?.at(-1)?.status
    })
    .toBe('completed')
  const detail = await page.evaluate((id) => window.boai.request('getConversation', { id }), conversation.id)
  const task = detail.runs.find((run) => run.phase === 'execution')!
  expect(task.status).toBe('completed')
  expect(task.environment).toMatchObject({ version: 1, commandMode: 'disabled', resourceVersions: [{ id: imported.id }] })
  expect(task.toolEvents.filter((event) => event.status === 'completed').map((event) => event.name)).toEqual([
    'skill',
    'write_file',
    'publish_artifact',
  ])
  expect(detail.artifacts).toHaveLength(1)
  const artifact = detail.artifacts[0]
  expect(await readFile(artifact.path, 'utf8')).toContain('Skill and workspace verified')
  return { runtime, modelCounter, desktop, launch, page, conversation, detail, task, artifact }
}

async function inspectWorkspace(previous: Awaited<ReturnType<typeof publishReport>>) {
  let { runtime, modelCounter, desktop, launch, page, conversation, detail, task, artifact } = previous
  await page.reload()
  await page.getByRole('button', { name: /技能文件验证/ }).click()
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await page.getByRole('tab', { name: '工作区', exact: true }).click()
  await expect(page.locator('.detail-panel')).toContainText('说明可用')
  await expect(page.locator('.detail-panel')).toContainText('命令未启用')
  await page.screenshot({ path: 'test-results/s1-employee-environment.png', fullPage: true })
  return { runtime, modelCounter, desktop, launch, page, conversation, task, artifact }
}

async function verifyEnvironmentRestart(previous: Awaited<ReturnType<typeof inspectWorkspace>>) {
  let { runtime, modelCounter, desktop, launch, page, conversation, task, artifact } = previous
  const before = modelCounter.calls
  await runtime.close()
  desktop = await launch()
  page = await desktop.firstWindow()
  const restored = await page.evaluate((id) => window.boai.request('getConversation', { id }), conversation.id)
  expect(restored.artifacts[0].id).toBe(artifact.id)
  expect(restored.runs.find((run) => run.id === task.id)?.environment).toEqual(task.environment)
  expect(await readFile(artifact.sourcePath!, 'utf8')).toContain('Skill and workspace verified')
  expect(modelCounter.calls).toBe(before)
}

Given('员工已绑定本地技能和报告模型', async ({ runtime, scenario }) => {
  scenario.prepareSkillEnvironment = await prepareSkillEnvironment(runtime)
})

When('员工读取技能写入并发布真实报告', async ({ scenario }) => {
  scenario.publishReport = await publishReport(scenario.prepareSkillEnvironment!)
})

Then('工作区显示技能与命令授权状态', async ({ scenario }) => {
  scenario.inspectWorkspace = await inspectWorkspace(scenario.publishReport!)
})

Then('重启保留产物与执行环境且不再次调用模型', async ({ scenario }) => {
  await verifyEnvironmentRestart(scenario.inspectWorkspace!)
})

Then('活动区区分运行结束与业务交付', async ({ scenario }) => {
  const { page, conversation, task, artifact } = scenario.inspectWorkspace!
  const detail = await page.evaluate((id) => window.boai.request('getConversation', { id }), conversation.id)
  expect(detail.workItems).toHaveLength(1)
  expect(detail.workItems![0]).toMatchObject({ ownerAgentId: 'researcher', status: 'blocked', outcome: { disposition: 'progress' }, artifactIds: [artifact.id] })
  expect(detail.workBudgets![0].modelCalls).toBe(4)
  expect(detail.runs.find((run) => run.id === task.id)?.draft?.status).toBe('published')
  expect(detail.messages.map((message) => message.sequence)).toEqual([1, 2])
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
  const card = page.locator(`[data-work-id="${detail.workItems![0].id}"]`)
  expect(detail.runs.find(run => run.id === task.id)?.status).toBe('completed')
  await expect(card).toContainText('需要处理')
  await expect(card).toContainText('本次工作结果：已有进展')
})

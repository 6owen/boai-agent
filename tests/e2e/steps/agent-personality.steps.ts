/*
 * [INPUT]: Isolated Electron/pnpm dev, actual UI and a local streaming model endpoint.
 * [OUTPUT]: Direct source/activity sections, immediate preferences, highlighted rest button and file-local switches; only maintained here, no E2E execution.
 * [POS]: Architecture desktop verification; no external model or persona-quality claim.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createServer } from 'node:http'
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { AgentProfile } from '../../../src/shared/domain/agent-profile'
type State = { roomId?: string; modelRequests: Record<string, unknown>[] }
export const test = base.extend<{ personality: State }>({ personality: async ({}, use) => use({ modelRequests: [] }) })
const { Given, When, Then } = createBdd(test)

Given('人格验收已准备隔离员工和本地模型', async ({ runtime, personality }) => {
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk
    personality.modelRequests.push(JSON.parse(body))
    const content = JSON.stringify({ decision: 'apply', reason: '明确启用的界面验收行为', message: '这是按已保存约定发送的问候。', sourceMessageIds: [] })
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(`data: ${JSON.stringify({ id: 'behavior-ui', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`)
    response.end(`data: ${JSON.stringify({ id: 'behavior-ui', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  runtime.defer(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('模型夹具未启动')
  test.info().annotations.push({ type: 'model-mode', description: 'local-protocol-fixture; zero external requests' })
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  personality.roomId = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '人格协议验收', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, connectionId: connection.id, modelId: 'fixture', expectedConfigVersion: configVersion })
    const room = await window.boai.request('createConversation', { kind: 'direct', title: '人格验收聊天', agentIds: ['researcher'], mode: 'natural', sharedKnowledgeIds: [] })
    return room.id
  }, `http://127.0.0.1:${address.port}/v1`)
  const soul = await runtime.page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'bobo', name: 'SOUL.md' }))
  expect(soul.content.length).toBeGreaterThan(4000)
  await runtime.reviewData('bobo实际源文件', { hash: soul.hash, characters: soul.content.length, source: soul.path })
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '高级配置', exact: true }).click()
})

When('用户在高级配置修改场景文件与人格开关', async ({ runtime }) => {
  const page = runtime.page, dialog = page.getByRole('dialog', { name: '高级配置', exact: true })
  await expect(dialog.getByRole('tab', { name: '人格与行为', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('tab', { name: '系统文件', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /SOUL\.md/ })).toHaveCount(1)
  await expect(dialog.getByRole('region', { name: '情绪当前状态', exact: true })).toHaveCount(0)
  await runtime.reviewCheckpoint('人格规则、功能状态及主动交流归人格页')
  await dialog.getByRole('switch', { name: '情绪', exact: true }).click()
  await dialog.getByRole('button', { name: '编辑人格', exact: true }).click()
  const persona = page.getByRole('dialog', { name: '人格正文', exact: true })
  await persona.getByRole('textbox', { name: '人格正文 内容', exact: true }).fill('PERSONA_ENTRY_SHARED：自然直接，有自己的判断。')
  await persona.getByRole('button', { name: '关闭人格正文', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(persona.getByRole('textbox')).toHaveValue('PERSONA_ENTRY_SHARED：自然直接，有自己的判断。')
  await persona.getByRole('button', { name: '保存正文', exact: true }).click()
  await expect(persona.getByRole('button', { name: '保存正文', exact: true })).toBeDisabled()
  await persona.getByRole('button', { name: '关闭人格正文', exact: true }).click()
  await expect(dialog.getByRole('switch', { name: '情绪', exact: true })).toBeChecked()
  const savedSwitch = await page.evaluate(() => window.boai.request('executeApplicationOperation', { operation: 'employees.profile', input: { agentId: 'researcher' } }))
  expect((savedSwitch.data as AgentProfile).features.emotions).toBe(true)

  await dialog.getByRole('button', { name: /SOUL\.md/ }).click()
  const source = page.getByRole('dialog', { name: 'SOUL.md', exact: true })
  await expect(source.getByRole('textbox')).toHaveValue('PERSONA_ENTRY_SHARED：自然直接，有自己的判断。')
  await source.getByRole('textbox').fill('PERSONA_ENTRY_SHARED：从源文件修改同一份人格。')
  await source.getByRole('button', { name: '保存文件', exact: true }).click()
  await expect(source.getByRole('button', { name: '保存文件', exact: true })).toBeDisabled()
  await source.getByRole('button', { name: '关闭配置源文件 SOUL.md', exact: true }).click()
  await dialog.getByRole('button', { name: '编辑人格', exact: true }).click()
  await expect(persona.getByRole('textbox')).toHaveValue('PERSONA_ENTRY_SHARED：从源文件修改同一份人格。')
  await persona.getByRole('button', { name: '关闭人格正文', exact: true }).click()
  await expect(dialog.getByRole('switch', { name: '情绪', exact: true })).toBeChecked()

  await dialog.getByRole('switch', { name: '加载私聊表达补充规则', exact: true }).click()
  await dialog.getByRole('button', { name: '编辑私聊表达提示词', exact: true }).click()
  const prompt = page.getByRole('dialog', { name: '私聊表达提示词', exact: true })
  await prompt.getByRole('textbox').fill('自然接话，保留自己的判断。不要机械地邀请用户提问。')
  await prompt.getByRole('button', { name: '保存正文', exact: true }).click()
  await expect(prompt.getByRole('button', { name: '保存正文', exact: true })).toBeDisabled()
  await prompt.getByRole('button', { name: '关闭私聊表达提示词', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'prompts/direct.md' }))).content).toBe('自然接话，保留自己的判断。不要机械地邀请用户提问。')
  await expect(dialog.getByRole('switch', { name: '加载私聊表达补充规则', exact: true })).not.toBeChecked()
  await dialog.getByRole('tab', { name: '工作区', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(dialog.getByRole('tab', { name: '工作区', exact: true })).toHaveAttribute('aria-selected', 'true')
  await dialog.getByRole('tab', { name: '人格与行为', exact: true }).click()
  await expect(dialog.getByRole('switch', { name: '情绪', exact: true })).toBeChecked()
  await dialog.getByRole('switch', { name: '疲劳与休息', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '保存人格与行为', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('region', { name: '疲劳与休息当前状态', exact: true })).toBeVisible()
  await runtime.reviewCheckpoint('正文独立保存，开关即时保存，状态显示在对应功能下方')
  await dialog.getByRole('button', { name: '休息', exact: true }).click()
  await expect(dialog.getByRole('region', { name: '疲劳与休息当前状态', exact: true })).toContainText('休息中')
  await expect(dialog.getByRole('button', { name: '休息中', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: '休息中', exact: true }).click()
  await expect(dialog.getByRole('region', { name: '疲劳与休息当前状态', exact: true })).not.toContainText('休息中')
})

When('用户启用主动交流并查看高级记录', async ({ runtime, personality }) => {
  const dialog = runtime.page.getByRole('dialog', { name: '高级配置', exact: true })
  await expect(dialog.getByRole('tab', { name: '人格与行为', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('button', { name: '添加行为', exact: true })).toHaveCount(0)
  await dialog.getByRole('switch', { name: '允许主动联系我', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: '联系频率', exact: true })).toBeVisible()
  const result = await runtime.page.evaluate(() => window.boai.request('executeApplicationOperation', { operation: 'employees.profile', input: { agentId: 'researcher' } }))
  expect((result.data as AgentProfile).proactive).toEqual({ enabled: true, frequency: 'normal', quietStart: 22, quietEnd: 8 })
  expect((result.data as AgentProfile).behaviors).toEqual([])
  const check = await runtime.page.evaluate(() => window.boai.request('executeApplicationOperation', { operation: 'employees.runBehavior', input: { agentId: 'researcher', behaviorId: 'personality-heartbeat' }, requestId: 'empty-heartbeat' }))
  expect(check).toMatchObject({ status: 'succeeded', data: null })
  expect(personality.modelRequests).toHaveLength(0)
  await expect(dialog.getByRole('region', { name: '后台活动记录详情', exact: true })).toContainText('暂无后台活动记录')
  await runtime.reviewData('人格功能与主动交流偏好', { profile: result.data, requestCount: personality.modelRequests.length })
})

Then('空聊天保持安静且重启保持人格配置', async ({ runtime, personality }) => {
  const before = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), personality.roomId!)
  expect(before.messages.filter(message => message.senderType === 'user')).toEqual([])
  expect(before.messages).toEqual([])
  expect(before.workItems).toEqual([])
  await runtime.restart()
  const after = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), personality.roomId!)
  expect(after.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
  expect(personality.modelRequests).toHaveLength(0)
  const result = await runtime.page.evaluate(() => window.boai.request('executeApplicationOperation', { operation: 'employees.profile', input: { agentId: 'researcher' } }))
  expect(result.data).toMatchObject({ features: { emotions: true, fatigue: true }, disabledPrompts: ['direct'], behaviors: [], proactive: { enabled: true, frequency: 'normal', quietStart: 22, quietEnd: 8 } })
  expect((await runtime.page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'prompts/direct.md' }))).content).toContain('保留自己的判断')
  expect((await runtime.page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'SOUL.md' }))).content).toBe('PERSONA_ENTRY_SHARED：从源文件修改同一份人格。')
  expect(runtime.errors).toEqual([])
})

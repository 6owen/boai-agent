/*
 * [INPUT]: 中文协作场景、真实 Electron/Mastra 与隔离的本地模型协议。
 * [OUTPUT]: 真实委派工具、版本等待、定向接续、根预算、停止 UI 和重启断言。
 * [POS]: tests/e2e/steps/collaboration.steps.ts，不代表真实供应商语义评估。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'node:http'
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { Conversation, ConversationDetail, WorkItem } from '../../../src/shared/domain'
import { test as base } from '../support/test'

type State = { conversation?: Conversation; detail?: ConversationDetail; version: number; calls: number; errors: string[] }
export const test = base.extend<{ collaboration: State }>({ collaboration: async ({}, use) => use({ version: 1, calls: 0, errors: [] }) })
const { Given, When, Then } = createBdd(test)

Given('群内两名员工已配置协作测试模型', async ({ runtime, collaboration: state }) => {
  const server = createServer(async (request, response) => {
    try {
      let body = ''; for await (const chunk of request) body += chunk
      const input = JSON.parse(body) as { model: string; messages: { role: string; content: string }[] }
      const system = input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      state.calls++
      let content = '', tool: { name: string; arguments: string } | undefined
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(input.messages.at(-1)!.content).data
        content = JSON.stringify(data.currentEmployeeId === 'researcher' && data.participation.isFirstDecision
          ? { action: 'reply', responseKind: 'task', work: { key: 'main', scope: '检查数据后汇总', deliverable: '协作汇总报告' } } : { action: 'pass' })
      } else if (system.includes('Private memory maintenance')) content = JSON.stringify({ candidates: [] })
      else {
        const work = JSON.parse(system.match(/Your host-claimed work: (.*?)\. Before the final answer/s)![1]) as WorkItem
        const results = input.messages.filter(message => message.role === 'tool')
        const call = (name: string, args: unknown) => ({ name, arguments: JSON.stringify(args) })
        if (!work.parentWorkId && !work.waitRevision) {
          const childId = JSON.stringify(results[0]?.content ?? "").match(/work-[a-f0-9]{64}/)?.[0]
          tool = [
            call('delegate_work', { key: 'check', ownerAgentId: 'writer', scope: '检查数据', deliverable: '数据检查结果' }),
            call('wait_for_work', { dependencies: [{ workId: childId, resultVersion: state.version }], nextStep: '根据检查结果汇总' }),
            call('report_work', { disposition: 'waiting', summary: '等待数据检查结果' }),
          ][results.length]
          content = '等待数据检查结果'
        } else {
          content = work.parentWorkId ? '检查结果为 42' : '汇总：检查结果为 42'
          if (!results.length) tool = call('report_work', { disposition: 'delivered', summary: content, evidence: [{ kind: 'answer', reference: content }] })
        }
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `collaboration-${state.calls}`, object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      emit({ role: 'assistant' })
      if (tool) { emit({ tool_calls: [{ index: 0, id: `tool-${state.calls}`, type: 'function', function: tool }] }); emit({}, 'tool_calls') }
      else { emit({ content }); emit({}, 'stop') }
      response.end('data: [DONE]\n\n')
    } catch (error) { state.errors.push(String(error)); response.writeHead(500); response.end(JSON.stringify({ error: { message: String(error) } })) }
  })
  runtime.trackServer(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await runtime.start()
  state.conversation = await runtime.page.evaluate(async port => {
    const connection = await window.boai.request('saveConnection', { name: '协作验证', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' })
    for (const agent of (await window.boai.request('snapshot', undefined)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, connectionId: connection.id, modelId: 'fixture', expectedConfigVersion: configVersion })
    }
    return window.boai.request('createConversation', { kind: 'group', title: '定向接续验证', agentIds: ['researcher', 'writer'] })
  }, port)
})

When('负责人委派检查并等待第一版结果', async ({ runtime, collaboration: state }) => {
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '请委派数据检查，结果返回后由负责人汇总', mentionIds: ['researcher'], requestId: 'work-request' }), state.conversation!.id)
})
When('负责人等待尚未交付的第二版结果', async ({ runtime, collaboration: state }) => {
  state.version = 2
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '请委派数据检查，等待第二版结果后汇总', mentionIds: ['researcher'], requestId: 'work-request' }), state.conversation!.id)
  await expect.poll(async () => {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversation!.id)
    if (state.errors.length || detail.runs.some(run => run.status === 'failed')) throw new Error(JSON.stringify({ errors: state.errors, runs: detail.runs, works: detail.workItems }))
    return detail.workItems?.some(work => work.parentWorkId && work.status === 'delivered') && detail.workItems?.some(work => !work.parentWorkId && work.status === 'waiting')
  }).toBe(true)
})
Then('子工作交付后负责人完成汇总且共享原始预算', async ({ runtime, collaboration: state }) => {
  await expect.poll(async () => {
    state.detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversation!.id)
    if (state.errors.length || state.detail.runs.some(run => run.status === 'failed')) throw new Error(JSON.stringify({ errors: state.errors, runs: state.detail.runs.map(run => ({ phase: run.phase, status: run.status, error: run.error, tools: run.toolEvents })), works: state.detail.workItems }))
    return state.detail.workItems?.length === 2 && state.detail.workItems.every(work => work.status === 'delivered') && state.detail.runs.every(run => run.status === 'completed')
  }).toBe(true)
  expect(state.errors).toEqual([])
  const detail = state.detail!
  expect(detail.workBudgets).toHaveLength(1); expect(detail.workBudgets![0]).toMatchObject({ runs: 3, modelCalls: 8, workItems: 2 })
  expect(detail.messages.map(message => message.sequence)).toEqual([1, 2, 3, 4])
  expect(detail.runs.filter(run => run.phase === 'execution').map(run => run.agentId)).toEqual(['researcher', 'writer', 'researcher'])
  expect(detail.workWakes?.map(wake => wake.status)).toEqual(['consumed', 'consumed'])
})
async function openProgress(page: import('@playwright/test').Page) {
  await page.reload()
  await page.getByRole('button', { name: /定向接续验证/ }).click()
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await page.getByRole('button', { name: '任务与产物', exact: true }).click()
}
Then('桌面显示父子工作及已交付状态', async ({ runtime, collaboration: state }) => {
  await openProgress(runtime.page)
  const root = state.detail!.workItems!.find(work => !work.parentWorkId)!, child = state.detail!.workItems!.find(work => work.parentWorkId)!
  await expect(runtime.page.locator(`[data-work-id="${root.id}"]`)).toContainText('已交付')
  await expect(runtime.page.locator(`[data-work-id="${child.id}"]`)).toContainText('所属工作：协作汇总报告')
})
Then('可以从工作进度停止此工作及子工作', async ({ runtime, collaboration: state }) => {
  await openProgress(runtime.page)
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversation!.id)
  const root = detail.workItems!.find(work => !work.parentWorkId)!, card = runtime.page.locator(`[data-work-id="${root.id}"]`)
  await expect(card).toContainText('第 2 版起')
  await card.getByRole('button', { name: '停止此工作及子工作' }).click()
  await expect(card).toContainText('已停止')
  state.detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversation!.id)
  expect(state.detail.workItems!.find(work => work.parentWorkId)?.status).toBe('delivered')
  expect(state.detail.runs.filter(run => run.phase === 'execution')).toHaveLength(2)
  expect(state.errors).toEqual([])
})
Then('重启保留协作结果而不重新执行', async ({ runtime, collaboration: state }) => {
  const calls = state.calls
  await runtime.restart()
  const restored = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversation!.id)
  expect(restored.workItems).toEqual(state.detail!.workItems)
  expect(restored.workBudgets).toEqual(state.detail!.workBudgets)
  expect(restored.runs.filter(run => run.phase === 'execution')).toHaveLength(state.detail!.runs.filter(run => run.phase === 'execution').length)
  expect(state.calls).toBe(calls)
})

/*
 * [OUTPUT]: 报数和接龙的原消息及重启界面均不得把顺序发言显示为引用回复。
 * [OUTPUT]: 群报数/接龙/编辑部全部顺序场景在BDD中直接核对真实前文输入与时间先后，不仅在批后手工审计。
 * [INPUT]: 实际 Electron/Mastra、隔离数据及离线协议或显式已保存真实 API 连接。
 * [OUTPUT]: 五人报数/倒序随机内容接龙、前置输入、持久顺序和重启零重放；原消息/Trace/截图留证。
 * [POS]: 第14组群聊天接续 BDD，离线协议与真实语义分开登记。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'node:http'
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { Conversation, ConversationDetail } from '../../../src/shared/domain'
import { test as base } from './collaboration.steps'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import type { Desktop } from '../support/desktop'
import { verifyOrderedInputs } from '../support/group-coordination'

type State = { group?: Conversation; real: boolean; relay: boolean; calls: number; outputs: string[]; errors: string[] }
export const test = base.extend<{ coordination: State }>({ coordination: async ({}, use) => use({ real: process.env.BOAI_TEST_REAL_API === '1', relay: false, calls: 0, outputs: [], errors: [] }) })
const { Given, When, Then } = createBdd(test)

Given('五位API员工已配置群接续模型', async ({ runtime, coordination: state }) => {
  test.setTimeout(state.real ? 180_000 : 90_000)
  test.info().annotations.push({ type: 'model-mode', description: state.real ? 'real-provider' : 'offline-protocol' })
  let connectionId: string
  if (state.real) {
    await runtime.start(); await runtime.close()
    const connection = await prepareSavedModel(runtime); connectionId = connection.id
    await runtime.start(await systemKeychainLaunch(runtime))
  } else {
    const server = createServer(async (request, response) => {
      try {
        let raw = ''; for await (const chunk of request) raw += chunk
        const body = JSON.parse(raw), text = JSON.stringify(body.messages), system = body.messages.filter((m: { role: string }) => m.role === 'system').map((m: { content: string }) => m.content).join('\n')
        state.calls++
        let content: string
        if (system.includes('Private group request interpretation')) {
          const data = JSON.parse(body.messages.at(-1).content).data, ids = data.members.map((m: { id: string }) => m.id)
          content = JSON.stringify({ mode: 'ordered', instruction: state.relay ? '依次复述前一位实际选出的随机数字' : '从一开始接着前一位递增报数', agentIds: state.relay ? ids.reverse() : ids })
        } else if (system.includes('Private memory maintenance')) content = '{"candidates":[]}'
        else {
          if (!system.includes('host-scheduled conversation sequence')) throw new Error('接续执行缺少共享语义')
          const previous = state.outputs.at(-1)
          if (previous && !text.includes(previous)) throw new Error('下一位的真实请求缺少前置正文')
          if (body.tools?.length) throw new Error('轻量接续不应授予工具')
          content = state.relay ? previous ?? String(1000 + Math.floor(Math.random() * 9000)) : String(state.outputs.length + 1)
          state.outputs.push(content)
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        for (const [delta, finish_reason] of [[{ role: 'assistant', content }, null], [{}, 'stop']]) response.write(`data: ${JSON.stringify({ id: `coordination-${state.calls}`, object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
        response.end('data: [DONE]\n\n')
      } catch (error) { state.errors.push(String(error)); response.writeHead(500); response.end(JSON.stringify({ error: { message: String(error) } })) }
    })
    runtime.trackServer(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    await runtime.start()
    const port = (server.address() as { port: number }).port
    connectionId = (await runtime.page.evaluate(port => window.boai.request('saveConnection', { name: '群接续离线协议', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' }), port)).id
  }
  state.group = await runtime.page.evaluate(async connectionId => {
    const snapshot = await window.boai.request('snapshot', undefined), connection = snapshot.connections.find(c => c.id === connectionId)!
    const ids = ['researcher', 'writer', 'reviewer']
    for (const agent of snapshot.agents.filter(agent => ids.includes(agent.id))) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, connectionId, modelId: connection.defaultModel, thinkingLevel: 'off', expectedConfigVersion: configVersion })
    }
    for (const name of ['记录员', '观察员']) ids.push((await window.boai.request('saveAgent', { name, role: name, instructions: '按照当前用户请求协作。', color: '#667788', connectionId, modelId: connection.defaultModel, thinkingLevel: 'off', skillIds: [], knowledgeIds: [], allowCommands: false, active: true })).id)
    return window.boai.request('createConversation', { kind: 'group', title: '五人群接续验证', agentIds: ids })
  }, connectionId)
  await runtime.reviewData('模型来源', { modelMode: state.real ? 'real-provider' : 'offline-protocol', nativeRuntime: false })
  await runtime.page.reload(); await runtime.page.getByRole('button', { name: /五人群接续验证/ }).click()
})

async function submit(runtime: Desktop, content: string) {
  await runtime.reviewData('原始用户请求', { content })
  const composer = runtime.page.getByRole('textbox', { name: '消息内容' })
  await composer.fill(content); await composer.press('Enter')
  await runtime.reviewCheckpoint('请求已从原聊天输入框发送')
}
When('用户要求大家开始报数', async ({ runtime }) => { await submit(runtime, '大家开始报数') })
When('用户指定倒序接龙传递随机数字', async ({ runtime, coordination: state }) => {
  state.relay = true
  const names = await runtime.page.evaluate(async ids => { const agents = (await window.boai.request('snapshot', undefined)).agents; return [...ids].reverse().map(id => agents.find(a => a.id === id)!.name) }, state.group!.agentIds)
  await submit(runtime, `请按这个顺序接龙：${names.join('、')}。第一位自由选择一个4位随机数字；之后每位只回复前一位实际选出的同一个数字。每人只发一次，不要解释。`)
})
async function verify(runtime: Desktop, state: State) {
  let detail!: ConversationDetail
  await expect.poll(async () => {
    detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.group!.id)
    return detail.turns?.length === 1 && detail.turns.every(turn => ['completed', 'failed', 'cancelled', 'budget_exhausted', 'interrupted'].includes(turn.status)) && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
  }, { timeout: state.real ? 120_000 : 30_000 }).toBe(true)
  await runtime.reviewData('实际群消息与运行结果', detail)
  await runtime.reviewNativeCheckpoint('五人接续完成的原生窗口')
  expect(state.errors).toEqual([])
  expect(detail.turns![0]).toMatchObject({ status: 'completed', publicMessages: 5, coordination: { mode: 'ordered', revision: 6 } })
  expect(detail.runs.filter(run => run.phase === 'coordination')).toHaveLength(1)
  expect(detail.runs.filter(run => run.phase === 'decision')).toHaveLength(0)
  expect(detail.workItems).toEqual([])
  const replies = detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')
  expect(replies.every(message => !message.replyToMessageId), '顺序发言不得把调度来源保存为引用回复').toBe(true)
  await expect(runtime.page.locator('.message-row.agent .quoted-message')).toHaveCount(0)
  expect(replies.map(message => message.senderId)).toEqual(state.relay ? [...state.group!.agentIds].reverse() : state.group!.agentIds)
  if (state.relay) {
    expect(replies[0].content.trim()).toMatch(/^\d{4}$/)
    expect(replies.map(message => message.content.trim())).toEqual(Array(5).fill(replies[0].content.trim()))
  } else expect(replies.map(message => message.content.match(/\d+/g))).toEqual([['1'], ['2'], ['3'], ['4'], ['5']])
  const trace = await runtime.page.evaluate(({ conversationId, messageId }) => window.boai.request('getConversationTrace', { conversationId, messageId }), { conversationId: state.group!.id, messageId: detail.messages.find(message => message.senderType === 'user')!.id })
  await runtime.reviewData('原轮次实际请求Trace', trace)
  await verifyOrderedInputs(runtime, detail)
  const calls = state.calls, runs = detail.runs.map(run => run.id)
  await runtime.close(); await runtime.start()
  await runtime.page.getByRole('button', { name: /五人群接续验证/ }).click()
  await runtime.page.waitForTimeout(300)
  const restored = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.group!.id)
  expect(restored.runs.map(run => run.id)).toEqual(runs); expect(state.calls).toBe(calls)
  expect(restored.turns![0].coordination).toEqual(detail.turns![0].coordination)
  expect(restored.messages).toEqual(detail.messages)
  await expect(runtime.page.locator('.message-row.agent .quoted-message')).toHaveCount(0)
  await runtime.reviewData('重启后原记录与零新增运行', { runs: restored.runs, coordination: restored.turns![0].coordination, callsBefore: calls, callsAfter: state.calls })
  await runtime.reviewNativeCheckpoint('重启保留原接续结果')
}
Then('每位员工依据前一位完整回复接续到五且重启不重放', async ({ runtime, coordination }) => verify(runtime, coordination))
Then('每位员工读取前一位实际内容且重启不重放', async ({ runtime, coordination }) => verify(runtime, coordination))

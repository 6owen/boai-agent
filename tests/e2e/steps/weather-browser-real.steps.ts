/*
 * [INPUT]: 原始天气查询、明确保存连接的vault桥和隔离Electron。
 * [OUTPUT]: 单次真实定时任务/浏览器/来源/公开回复与模型账本，失败保留原过程、不重试。
 * [POS]: 天气故障业务复验，不代替离线恢复回归或原失败记录。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { AutomationDefinition, AutomationOccurrence, ConversationDetail } from '../../../packages/shared/src/domain'
import { test as base } from '../support/test'
import { prepareV2DataRoot } from '../../../apps/electron/src/main/migration'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'

const prompt = '调用浏览器查询一下南京的天气'
type State = { plan?: AutomationDefinition; occurrence?: AutomationOccurrence; detail?: ConversationDetail }
export const test = base.extend<{ weather: State }>({ weather: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('我准备隔离的真实DeepSeek天气定时任务', async ({ runtime, weather }) => {
  test.skip(process.env.BOAI_WEATHER_REAL !== '1', '真实模型仅显式启动')
  test.setTimeout(240000)
  await prepareV2DataRoot(runtime.root)
  const connection = await prepareSavedModel(runtime)
  await runtime.start(await systemKeychainLaunch(runtime))
  weather.plan = await runtime.page.evaluate(async connection => {
    const agent = await window.boai.request('saveAgent', { name: 'DS天气复验', role: '', instructions: '', connectionId: connection.id, modelId: '', color: '#3478ce', skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
    const chat = await window.boai.request('createConversation', { kind: 'direct', title: '天气隔离复验', agentIds: [agent.id] })
    return window.boai.request('saveAutomation', { name: '天气隔离复验', prompt: '调用浏览器查询一下南京的天气', conversationId: chat.id, frequency: 'daily', weekday: 1, time: '09:00', timezone: 'Asia/Shanghai', enabled: false, notify: false })
  }, connection)
  await runtime.reviewData('天气单次真实预登记', { prompt, model: connection.defaultModel, provider: connection.provider, messages: 1, retries: 0, isolated: true, sourceConnectionUnchanged: true })
})
When('我仅触发一次原始南京天气查询', async ({ runtime, weather }) => {
  weather.occurrence = await runtime.page.evaluate(id => window.boai.request('runAutomation', { id, requestId: 'weather-once' }), weather.plan!.id)
  try {
    await expect.poll(async () => {
      weather.occurrence = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), weather.occurrence!.id)
      return ['completed','failed','cancelled','interrupted'].includes(weather.occurrence.status)
    }, { timeout: 180000, intervals: [500, 1000] }).toBe(true)
  } finally {
    weather.detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), weather.occurrence!.conversationId)
    await runtime.reviewData('天气原始真实终态', { occurrence: weather.occurrence, detail: weather.detail })
    if (weather.detail.runs.some(run => ['running','waiting_approval'].includes(run.status))) await runtime.page.evaluate(id => window.boai.request('cancelRun', { conversationId: id }), weather.occurrence!.conversationId)
  }
})
Then('本次天气任务完成且回复包含天气和网页来源', async ({ runtime, weather }) => {
  expect(weather.occurrence!.status).toBe('completed')
  const detail = weather.detail!
  expect(detail.runs.filter(run => run.phase === 'execution').every(run => run.status === 'completed')).toBe(true)
  expect(detail.runs.flatMap(run => run.toolEvents).some(event => event.name === 'browser_tool' && event.status === 'completed')).toBe(true)
  const replies = detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.content).join('\n')
  expect(replies).toContain('南京')
  expect(replies).toMatch(/(?:℃|°C|摄氏|[\d]+度)/)
  expect(replies).toMatch(/https?:\/\//)
  await runtime.reviewNativeCheckpoint('天气真实交付')
})

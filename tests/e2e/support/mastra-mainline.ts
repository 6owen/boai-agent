/*
 * [INPUT]: 隔离 Desktop、已有成果 HTTP/SSE 协议端点和真实产品 API。
 * [OUTPUT]: 仅准备本地模型连接及确定聊天回复；读取同聊真实终态和 SDK 请求，不创建员工或伪造文件/Work。
 * [POS]: 单场 Mastra 产品闭环的协议准备与只读核对支撑；非真实供应商效果验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import type { Desktop } from './desktop'
import { artifactDetail, prepareArtifactProtocol } from './artifacts'

export const MAINLINE_EMPLOYEE = '主线文件同事'
export const MAINLINE_ROLE = '持续交流并交付可核对的文件'
export const MAINLINE_RULES = '先理解原用户请求；普通聊天不创建文件任务，文件交付保留明确版本。'
export const CHAT_ONE = '请记住本次交流代号 MAINLINE_CHAT_4682，先普通聊天。'
export const REPLY_ONE = '收到交流代号 MAINLINE_CHAT_4682，接下来继续在这个私聊交流。'
export const CHAT_TWO = '沿用刚才的交流代号继续普通聊天，暂时不用生成文件。'
export const REPLY_TWO = '沿用 MAINLINE_CHAT_4682，普通聊天已经连续完成两轮。'
export const FILE_REQUEST = '请执行文件任务，发布可检查的交付报告。'
export const REVISION_REQUEST = '明确修改当前第一版，补充验收条件并发布第二版，保留第一版原文。'
export const CHAT_AFTER_RESTART = '重启后继续普通聊天，沿用 MAINLINE_CHAT_4682，不重新办理旧文件。'
export const REPLY_AFTER_RESTART = '重启后沿用 MAINLINE_CHAT_4682 继续交流，两版旧文件保持。'

export async function prepareMastraMainline(runtime: Desktop) {
  const protocol = await prepareArtifactProtocol(runtime, { chatReplies: { [CHAT_ONE]: REPLY_ONE, [CHAT_TWO]: REPLY_TWO, [CHAT_AFTER_RESTART]: REPLY_AFTER_RESTART } })
  await runtime.start()
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: 'Mastra主线本地协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'artifacts-fixture' })
    const snapshot = await window.boai.request('snapshot', undefined)
    return { connection, dataPath: snapshot.dataPath }
  }, protocol.endpoint.url)
  return { ...protocol, ...setup }
}

export async function settledMainline(runtime: Desktop, conversationId: string, expectedUserMessages: number, artifactCount: number) {
  await expect.poll(async () => {
    const detail = await artifactDetail(runtime, conversationId)
    return detail.messages.filter(message => message.senderType === 'user').length === expectedUserMessages
      && detail.artifacts.length === artifactCount && detail.runs.length > 0
      && detail.runs.every(run => ['completed', 'cancelled', 'failed', 'interrupted'].includes(run.status))
      && detail.turns!.every(turn => ['completed', 'cancelled', 'failed', 'interrupted'].includes(turn.status))
  }, { timeout: 30_000 }).toBe(true)
  const detail = await artifactDetail(runtime, conversationId)
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  expect(detail.turns!.every(turn => turn.status === 'completed')).toBe(true)
  return detail
}

export function publicChatRequests(requests: Record<string, unknown>[], currentText: string) {
  return requests.filter(request => {
    const messages = request.messages as { role: string; content: unknown }[]
    const system = messages.filter(message => message.role === 'system').map(message => JSON.stringify(message.content)).join('\n')
    const current = [...messages].reverse().find(message => message.role === 'user' && JSON.stringify(message.content).includes('[CURRENT TURN USER REQUEST;'))
    return !system.includes('Private participation decision') && !system.includes('Private memory maintenance') && Boolean(current && JSON.stringify(current.content).includes(currentText))
  })
}

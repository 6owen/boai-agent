/*
 * [INPUT]: 本场实际群消息/已提交进度、运行时间及原模型请求Trace。
 * [OUTPUT]: 有序回复的内容hash、前置提交先于后续启动、实际模型输入确含前文的共同断言和留证。
 * [POS]: 第14组BDD因果核验；不以UI排列或模型自称读过替代实际依赖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header和所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import type { ConversationDetail } from '../../../packages/shared/src/domain'
import type { Desktop } from './desktop'

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}
export async function verifyOrderedInputs(runtime: Desktop, detail: ConversationDetail) {
  const checks: { turnId: string; runId: string; previousMessageId: string }[] = []
  for (const turn of detail.turns ?? []) {
    if (turn.coordination?.mode !== 'ordered') continue
    const spans = await runtime.page.evaluate(input => window.boai.request('getConversationTrace', input), { conversationId: turn.conversationId, messageId: turn.triggerMessageId, turnId: turn.id })
    const completed = turn.coordination.completed
    for (let index = 0; index < completed.length; index++) {
      const item = completed[index], message = detail.messages.find(m => m.id === item.messageId)!
      expect(message, '已提交进度必须指向本场真实消息').toBeDefined()
      expect(createHash('sha256').update(message.content).digest('hex')).toBe(item.contentHash)
      if (!index) continue
      const previous = detail.messages.find(m => m.id === completed[index - 1].messageId)!
      const run = detail.runs.find(r => r.id === message.runId)!, before = detail.runs.find(r => r.id === previous.runId)!
      expect(before.finishedAt).toBeTruthy()
      expect(Date.parse(run.createdAt), '后继员工必须在前驱实际结束之后启动').toBeGreaterThanOrEqual(Date.parse(before.finishedAt!))
      const inputs = spans.filter(s => s.runId === run.id && s.name === '模型请求').map(s => strings(s.input).join('\n'))
      expect(inputs.some(input => input.includes(previous.id) && (input.includes(previous.content) || input.includes(JSON.stringify(previous.content).slice(1, -1)))), '真实模型请求必须包含前一位消息身份与完整正文').toBe(true)
      checks.push({ turnId: turn.id, runId: run.id, previousMessageId: previous.id })
    }
  }
  await runtime.reviewData('有序消息的实际因果链', checks)
}

/*
 * [INPUT]: Electron 应用、共享领域类型与历史会话数据。
 * [OUTPUT]: 历史群聊和活动轮次的端到端验证。
 * [POS]: tests/e2e/history.spec.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ConversationDetail, Snapshot } from '../../src/shared/domain'

test('existing group keeps past replies and failures separate from a new greeting and its activity', async () => {
  const decisions: { employee: string; data: any }[] = []
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    const request = JSON.parse(body), employee = request.model.replace('test-', '')
    const system = request.messages.filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n')
    const lastUser = request.messages.filter((m: any) => m.role === 'user').at(-1)?.content ?? ''
    let content: string
    if (system.includes('Private participation decision')) {
      const data = JSON.parse(lastUser).data
      decisions.push({ employee, data })
      const root = data.currentTurnMessages?.find((m: any) => m.id === data.currentTurn?.rootMessageId)
      if (root?.content === '旧轮故障') content = employee === 'reviewer' ? 'OLD_ERR observedThroughSequence' : '{"action":"pass"}'
      else content = JSON.stringify({ action: !root || data.currentTurn.ownCompletedMessageIds.length ? 'pass' : 'reply', responseKind: 'chat' })
    } else if (system.includes('Private memory maintenance')) content = '{"candidates":[]}'
    else content = String(lastUser).includes('历史自我介绍') ? `${employee}：这是旧轮的自我介绍，等待主题与素材。` : `${employee}：你好，我在。`
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const chunk = (delta: unknown, finish: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'history', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
    chunk({ role: 'assistant', content }); chunk({}, 'stop'); res.end('data: [DONE]\n\n')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const root = await mkdtemp(join(tmpdir(), 'boai-history-'))
  const launch = () => electron.launch({ ...(process.env.BOAI_TEST_PACKAGED_PATH ? { executablePath: process.env.BOAI_TEST_PACKAGED_PATH, args: [] } : { args: [resolve('.')] }), env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' } })
  let desktop = await launch()
  try {
    let page = await desktop.firstWindow(); await page.waitForFunction(() => Boolean(window.boai))
    const initial: Snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
    const connection = await page.evaluate(port => window.boai.request('saveConnection', { name: '历史回归连接', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'test' }), port)
    for (const agent of initial.agents) await page.evaluate(({ agent, connectionId }) => {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      return window.boai.request('saveAgent', { ...input, connectionId, modelId: `test-${agent.id}`, expectedConfigVersion: configVersion })
    }, { agent, connectionId: connection.id })
    const group = await page.evaluate(agentIds => window.boai.request('createConversation', { kind: 'group', title: '已有历史的群', agentIds }), initial.agents.map(a => a.id))
    const detail = () => page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
    const send = async (content: string) => {
      const message = await page.evaluate(input => window.boai.request('sendMessage', input), { conversationId: group.id, content, mentionIds: [], requestId: content })
      await expect.poll(async () => {
        const state = await detail(), turn = state.turns?.find(t => t.id === message.turnId)
        return !!turn && ['completed', 'failed', 'budget_exhausted'].includes(turn.status) && state.runs.filter(r => r.turnId === turn.id).every(r => !['running', 'queued', 'waiting_approval'].includes(r.status))
      }).toBe(true)
      return message
    }
    await send('历史自我介绍')
    const failedMessage = await send('旧轮故障')
    const failed = await detail()
    expect(failed.turns?.find(t => t.id === failedMessage.turnId)?.status).toBe('failed')
    const failedRun = failed.runs.find(r => r.turnId === failedMessage.turnId && r.status === 'failed')!
    expect(failedRun.error).toContain('OLD_ERR')
    const greeting = await send('你们好啊')
    const successful: ConversationDetail = await detail()
    expect(successful.turns?.find(t => t.id === greeting.turnId)?.status).toBe('completed')
    expect(new Set(successful.messages.filter(m => m.turnId === greeting.turnId && m.senderType === 'agent').map(m => m.senderId)).size).toBe(3)
    const initialDecisions = decisions.filter(d => d.data.currentTurn?.id === greeting.turnId && d.data.participation.isFirstDecision)
    expect(initialDecisions).toHaveLength(3)
    expect(initialDecisions.every(d => d.data.currentTurn.ownCompletedMessageIds.length === 0 && d.data.historicalBackground.some((m: any) => m.senderId === d.employee) && d.data.currentTurnMessages.length === 1)).toBe(true)
    const checkActivity = async () => {
      await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^已有历史的群/ }).click()
      await page.getByRole('button', { name: '任务与产物', exact: true }).click()
      const current = page.getByRole('region', { name: '本轮详情', exact: true })
      await expect(current).toHaveAttribute('data-turn-id', greeting.turnId!)
      await expect(current).toContainText('你们好啊')
      await expect(current.locator('.delivery-row')).toHaveCount(3)
      await expect(current.locator('.delivery-row small')).toHaveText([/^已回复/, /^已回复/, /^已回复/])
      await expect(current.locator('.run-card[data-run-id="' + failedRun.id + '"]')).toHaveCount(0)
      await expect(page.getByText('OLD_ERR', { exact: false })).not.toBeVisible()
      await page.locator('details.round-history > summary').click()
      await page.locator('details.history-round > summary').filter({ hasText: '旧轮故障' }).click()
      const history = page.getByRole('region', { name: '历史轮次详情', exact: true }).filter({ hasText: '旧轮故障' })
      await expect(history).toHaveAttribute('data-turn-id', failedMessage.turnId!)
      await expect(history.locator('.run-card[data-run-id="' + failedRun.id + '"]')).toBeVisible()
      await expect(history.getByRole('button', { name: '重新尝试', exact: true })).toHaveCount(0)
      await history.locator('.error-details > summary').click()
      await expect(history).toContainText('OLD_ERR')
    }
    await checkActivity()
    await desktop.close(); desktop = await launch(); page = await desktop.firstWindow()
    await checkActivity()
    expect((await detail()).messages).toHaveLength(successful.messages.length)
  } finally {
    await desktop.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await rm(root, { recursive: true, force: true })
  }
})

/*
 * [INPUT]: Electron 应用、产品存储与旧版领域数据。
 * [OUTPUT]: 旧数据升级和恢复的端到端验证。
 * [POS]: tests/e2e/upgrade.spec.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ProductStore } from '../../src/runtime/adapters/storage/product-store'
import type { DigitalAgent, Conversation, Message, AgentRun } from '../../src/shared/domain'

test('the actual desktop upgrades v0.1 history and files without replaying unfinished work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-upgrade-'))
  const time = new Date().toISOString()
  const agent: DigitalAgent = { id: 'legacy-agent', name: '旧版员工', role: '保留原样', instructions: 'LEGACY_INSTRUCTIONS_KEEP_EXACT\n原有工作规则。', color: '#556677', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 3 }
  const conversation: Conversation = { id: 'legacy-chat', kind: 'direct', title: '旧版会话', agentIds: [agent.id], mode: 'mention', workspacePath: join(root, 'workspaces/legacy-chat'), sharedKnowledgeIds: [], createdAt: time, updatedAt: time }
  const message: Message = { id: 'legacy-user', conversationId: conversation.id, senderType: 'user', senderId: 'user', senderName: '我', content: '保留历史，不要自动执行', status: 'completed', sequence: 1, createdAt: time }
  const run: AgentRun = { id: 'legacy-run', phase: 'execution', conversationId: conversation.id, agentId: agent.id, agentName: agent.name, triggerMessageId: message.id, messageId: 'legacy-response', status: 'running', createdAt: time, toolEvents: [] }
  await mkdir(conversation.workspacePath, { recursive: true }); await writeFile(join(conversation.workspacePath, 'report.md'), '# 旧版产物')
  const old = new ProductStore(join(root, 'boai.sqlite')); await old.init()
  await old.write([
    { collection: 'agents', id: agent.id, value: agent }, { collection: 'conversations', id: conversation.id, value: conversation }, { collection: 'messages', id: message.id, value: message }, { collection: 'runs', id: run.id, value: run },
    { collection: 'jobs', id: 'old-job', value: { id: 'old-job', conversationId: conversation.id, status: 'running', runIds: [run.id] } },
    { collection: 'messages', id: 'legacy-response', value: { ...message, id: 'legacy-response', senderType: 'agent', senderId: agent.id, senderName: agent.name, sequence: 2, content: '曾经的部分输出', status: 'streaming', runId: run.id } },
  ]); await old.close()
  const desktop = await electron.launch({ ...(process.env.BOAI_TEST_PACKAGED_PATH ? { executablePath: process.env.BOAI_TEST_PACKAGED_PATH, args: [] } : { args: [resolve('.')] }), env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' } })
  try {
    const page = await desktop.firstWindow()
    const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
    expect(snapshot.agents).toHaveLength(1)
    expect(snapshot.agents[0].id).toBe(agent.id)
    expect(snapshot.conversations[0].mode).toBe('natural')
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
    expect(detail.messages.map(m => m.id)).toEqual(['legacy-user', 'legacy-response'])
    expect(detail.messages[1].status).toBe('interrupted')
    expect(detail.runs[0].status).toBe('interrupted')
    expect(detail.turns).toHaveLength(0)
    expect(detail.deliveries).toHaveLength(0)
    expect(detail.artifacts.find(a => a.name === 'report.md')?.path).toContain('/v2/workspaces/legacy-chat/')
    const source = await page.evaluate(agentId => window.boai.request('readAgentFile', { agentId, name: 'AGENTS.md' }), agent.id)
    expect(source.content).toBe(agent.instructions)
    expect(await readFile(join(conversation.workspacePath, 'report.md'), 'utf8')).toBe('# 旧版产物')
    expect(await readFile(join(root, 'v2/workspaces/legacy-chat/report.md'), 'utf8')).toBe('# 旧版产物')
  } finally { await desktop.close(); await rm(root, { recursive: true, force: true }) }
})

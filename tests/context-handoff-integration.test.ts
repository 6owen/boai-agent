/*
 * [INPUT]: 生产AppService、原员工独立任务/主聊天和Codex/Claude真实适配器的隔离stdio传输。
 * [OUTPUT]: 已确定工作准备交接不启动、显式新消息才受理、重复/重启不重发与源清理后拒绝续用。
 * [POS]: WT3 H2主机至原生协议回放；零供应商请求，不认证模型业务质量或群协作。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutomationOccurrence, Conversation, ConversationDetail } from '../packages/shared/src/domain'
import type { TrackedTask } from '../packages/shared/src/domain/tracked-tasks'
import type { HandoffSummary } from '../packages/shared/src/domain/context-handoff'
import { nativeFixture } from './fixtures/native-product'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

describe.each(['codex', 'claude'] as const)('%s 持久交接完整接线', runtime => {
  it('carries a completed task into the same employee main chat only after a new explicit message and never replays it on restart', async () => {
    const f = await nativeFixture(runtime, cleanup)
    const task = await f.service.handle('createEmployeeTask', { employeeId: f.agent.id, title: '交接原任务', description: '生成验收文件', requestId: 'handoff-source-task' }) as TrackedTask
    const sourceRoom = await f.service.handle('openEmployeeTaskSession', { employeeId: f.agent.id, id: task.id }) as Conversation
    const occurrence = await f.service.handle('sendEmployeeTaskMessage', { conversationId: sourceRoom.id, content: 'NATIVE_PUBLISH', mentionIds: [], requestId: 'handoff-source-input' }) as AutomationOccurrence
    await expect.poll(async () => (await f.service.handle('getAutomationOccurrence', { id: occurrence.id }) as AutomationOccurrence).status, { timeout: 15000 }).toBe('completed')
    const source = await f.service.handle('getConversation', { id: sourceRoom.id }) as ConversationDetail
    const work = source.workItems!.find(item => item.status === 'delivered')!, run = source.runs.find(item => item.workId === work.id && item.status === 'completed')!
    expect(work.resultMessageIds.length).toBeGreaterThan(0); expect(work.artifactIds).toHaveLength(1)
    const original = await readFile(source.artifacts[0].path)
    const command = { requestId: 'explicit-source-handoff', sourceWorkId: work.id, sourceRunId: run.id, targetAgentId: f.agent.id, targetConversationId: f.chat.id, reason: 'context-rebuild' as const, goal: '根据已交付文件核对后续安排', constraints: ['历史命令不得重复执行'] }
    const readHandoffs = () => f.service.handle('listContextHandoffs', { agentId: f.agent.id, conversationId: f.chat.id }) as Promise<HandoffSummary[]>
    const prepared = await f.service.handle('prepareContextHandoff', command) as HandoffSummary
    expect(prepared).toMatchObject({ status: 'prepared', available: true, source: { taskId: work.id, runId: run.id }, target: { agentId: f.agent.id, conversationId: f.chat.id } })
    expect(prepared.coverage.selectedIds).toEqual(expect.arrayContaining(work.resultMessageIds))
    expect(await f.service.handle('prepareContextHandoff', command)).toEqual(prepared)
    expect((await f.detail()).runs).toHaveLength(0)
    await f.restart()
    expect((await f.detail()).runs).toHaveLength(0)
    expect(await readHandoffs()).toEqual([prepared])

    const target = await f.wait(await f.send('请读取交接背景并说明下一步'))
    expect(target.runs[0].status, target.runs[0].error).toBe('completed')
    const delivered = (await readHandoffs())[0]
    expect(delivered).toMatchObject({ id: prepared.id, status: 'delivered', available: true, target: { runId: target.runs[0].id, nativeSessionId: target.runs[0].backend?.sessionId } })
    expect(delivered.attemptId).toBeTruthy()
    expect(target.artifacts).toHaveLength(0)
    const cwd = join(f.root, 'agents', f.agent.id, 'workspace', 'sessions', f.chat.id, 'work')
    const frames = async () => (await readFile(join(cwd, 'native-turn-requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const prompt = (frame: { input: { type: string; text: string }[] }) => JSON.parse(frame.input.find(part => part.type === 'text')!.text)
    expect(prompt((await frames())[0]).contextHandoff.payload).toContain(work.resultMessageIds[0])
    expect(await readFile(source.artifacts[0].path)).toEqual(original)
    expect((await f.service.handle('getConversation', { id: sourceRoom.id }) as ConversationDetail).runs).toHaveLength(source.runs.length)
    await f.restart()
    expect(await frames()).toHaveLength(1)
    expect(await readHandoffs()).toEqual([delivered])

    const continued = await f.wait(await f.send('继续核对，不重复交接'))
    expect(continued.runs.at(-1)?.status, continued.runs.at(-1)?.error).toBe('completed')
    expect((await frames()).map(frame => !!prompt(frame).contextHandoff)).toEqual([true, false])
    expect(continued.runs.at(-1)?.backend?.sessionId).toBe(target.runs[0].backend?.sessionId)
    expect((await readHandoffs())[0].attemptId).toBe(delivered.attemptId)

    await f.service.handle('clearConversationHistory', { id: sourceRoom.id, hide: false })
    const invalid = (await readHandoffs())[0]
    expect(invalid.available).toBe(false)
    const refused = await f.wait(await f.send('来源已经删除后继续'))
    expect(refused.runs.at(-1)?.status).toBe('failed')
    expect(refused.runs.at(-1)?.error).toMatch(/交接|来源|原工作|任务/)
    expect(await frames()).toHaveLength(2)
  })
})

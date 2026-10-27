/*
 * [OUTPUT]: 可在同一次离线预备事务阶段追加场景历史，实际Electron仍只启动一次。
 * [OUTPUT]: 单次启动先经原snapshot请求等待服务就绪并核对本场profile/会话，再开始真实点击；不重试或重建数据。
 * [OUTPUT]: UI可在本场独立profile用原bootstrap/配置事务准备数据后仅启动一次；其他BDD保留原桌面配置和重启路径。
 * [OUTPUT]: 渠道引用在模型正文附带固定来源，离线参与判断按首行原测试要求识别；不改员工实际判断逻辑。
 * [OUTPUT]: 原视觉夹具默认模拟视口；后台原生窗口场景可显式禁用，避免截图截断。
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [INPUT]: 每场景独立 Desktop、SQLite 历史合同与本地离线模型端点。
 * [OUTPUT]: 真实历史/文件及离线协议；视觉基线可显式固定时间和隔离本机技能入口，原场景默认行为保持。
 * [POS]: 单聊/群聊共享交互验收数据和协议支撑，生产 main/IPC/renderer 保持原样。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Desktop } from './desktop'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { Message, WorkItem, Artifact } from '../../../packages/shared/src/domain'
import type { Methods } from '../../../packages/shared/src/ipc'

type Request = <K extends keyof Methods>(method: K, input: Methods[K]['input']) => Promise<Methods[K]['output']>
async function configureGroupChat(request: Request, port: number) {
  const connection = await request('saveConnection', { name: '群聊离线验收', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' })
  const names: Record<string, [string, string]> = { researcher: ['研究员', '信息研究'], writer: ['写手', '内容创作'], reviewer: ['设计师', '视觉设计'] }
  for (const agent of (await request('snapshot', undefined)).agents.filter(agent => agent.id in names)) {
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await request('saveAgent', { ...input, name: names[agent.id][0], role: names[agent.id][1], connectionId: connection.id, modelId: 'fixture', allowCommands: agent.id === 'reviewer', expectedConfigVersion: configVersion })
  }
  const group = await request('createConversation', { kind: 'group', title: '产品讨论组', agentIds: ['researcher', 'writer', 'reviewer'] })
  const direct = await request('createConversation', { kind: 'direct', title: '与研究员对话', agentIds: ['researcher'] })
  return { group, direct, dataPath: (await request('snapshot', undefined)).dataPath }
}

export async function prepareGroupChat(runtime: Desktop, { emulateViewport = true, mainEntry, now = Date.now(), seedBeforeLaunch = false, seedAdditional }: { emulateViewport?: boolean; mainEntry?: string; now?: number; seedBeforeLaunch?: boolean; seedAdditional?: (store: ProductStore, setup: Awaited<ReturnType<typeof configureGroupChat>>) => Promise<void> } = {}) {
  const state = { calls: 0, errors: [] as string[] }
  const server = createServer(async (request, response) => {
    try {
      let body = ''; for await (const chunk of request) body += chunk
      const input = JSON.parse(body) as { messages: { role: string; content: string }[] }
      const system = input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      let content = '', tool: { name: string; arguments: string } | undefined
      state.calls++
      if (system.includes('Private group request interpretation')) content = JSON.stringify({ mode: 'independent' })
      else if (system.includes('Private participation decision')) {
        const data = JSON.parse(input.messages.at(-1)!.content).data
        const root = data.currentTurnMessages?.find((message: { id: string }) => message.id === data.currentTurn.rootMessageId)
        const directChat = ['单聊统一交互验收', '单聊滚动补充消息'].includes(root?.content?.split('\n')[0])
        content = JSON.stringify(directChat && data.currentEmployeeId === 'researcher' && !data.currentTurn.ownCompletedMessageIds.length ? { action: 'reply', responseKind: 'chat' } : data.currentEmployeeId === 'reviewer' && data.participation.isFirstDecision && input.messages.at(-1)!.content.includes('排版目录') ? { action: 'reply', responseKind: 'task', work: { key: `layout-${data.triggerMessage?.id ?? state.calls}`, scope: '检查报告排版目录', deliverable: '报告排版检查' } } : { action: 'pass' })
      } else if (system.includes('Private memory maintenance')) content = JSON.stringify({ candidates: [] })
      else if (JSON.stringify(input.messages).includes('单聊统一交互验收') || JSON.stringify(input.messages).includes('单聊滚动补充消息')) content = '研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。'
      else if (!input.messages.some(message => message.role === 'tool')) tool = { name: 'execute_command', arguments: JSON.stringify({ command: 'printf group-chat-approved > approval-marker.txt' }) }
      else content = '排版检查已结束，请查看执行过程中的命令结果。'
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `group-${state.calls}`, object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      emit({ role: 'assistant' })
      if (tool) { emit({ tool_calls: [{ index: 0, id: `tool-${state.calls}`, type: 'function', function: tool }] }); emit({}, 'tool_calls') }
      else { emit({ content }); emit({}, 'stop') }
      response.end('data: [DONE]\n\n')
    } catch (error) { state.errors.push(String(error)); response.writeHead(500); response.end(JSON.stringify({ error: { message: String(error) } })) }
  })
  runtime.trackServer(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  let setup: Awaited<ReturnType<typeof configureGroupChat>>
  if (seedBeforeLaunch) {
    const { startOwnedRuntime } = await import('../../../packages/runtime/src/bootstrap')
    const noModel = async () => { throw new Error('UI历史准备不得调用模型') }
    const owned = await startOwnedRuntime({
      dataPath: join(runtime.root, 'v2'),
      skillDiscovery: { homeDir: join(runtime.root, 'local-user'), bundledRoot: resolve('dist/agent-skills') },
      engine: { run: noModel, test: noModel },
      secrets: { get: async () => undefined, set: noModel, delete: noModel }, emit: () => {},
    })
    try { setup = await configureGroupChat((method, input) => owned.service.handle(method, input) as ReturnType<Request>, port) }
    finally { await owned.close() }
  } else {
    await runtime.start({ mainEntry })
    setup = await configureGroupChat((method, input) => runtime.page.evaluate(({ method, input }) => window.boai.request(method, input), { method, input }) as ReturnType<Request>, port)
    await runtime.page.evaluate(async () => {
      const appearance = await window.boai.request('getAppearance', undefined)
      await window.boai.request('updateAppearance', { patch: { mode: 'light', zoomFactor: 1 }, expectedRevision: appearance.revision })
    })
    await runtime.close()
  }
  const { group } = setup
  const baseTime = now - 10 * 60_000
  const makeMessage = (id: string, senderId: string, content: string, index: number, replyToMessageId?: string): Message => ({ id, conversationId: group.id, senderType: senderId === 'user' ? 'user' : 'agent', senderId, senderName: ({ user: '你', researcher: '研究员', writer: '写手' })[senderId]!, content, status: 'completed', sequence: index, turnId: 'history-turn', runId: senderId === 'user' ? undefined : `history-${senderId}`, replyToMessageId, createdAt: new Date(baseTime + index * 30_000).toISOString() })
  const messages = [
    makeMessage('history-user', 'user', '帮我做一份 AI 协作产品的竞品分析，重点看群聊体验和任务协作。', 1),
    makeMessage('history-research', 'researcher', '我整理了三类产品的使用方式，群聊体验有几个值得借鉴的点。\n\n### 01 · 对话先保持清楚\n统一头像、发言人和时间的位置，减少气泡和色块，让讨论本身成为视觉中心。\n\n### 02 · 任务进展有固定位置\n把目标、负责人和交付状态放到右侧，需要时打开。聊天里只保留结论和必要的确认。\n\n### 03 · 文件跟着结论走\n报告同时出现在对应回复和群文件中，方便顺着讨论找到结果。\n\n建议先完成消息流与任务详情，再验证长消息和窄窗口的阅读体验。', 2),
    makeMessage('history-writer', 'writer', '我把研究结论整理成了报告初稿，按「对话体验 → 协作方式 → 建议」展开。', 3, 'history-research'),
    makeMessage('history-note', 'writer', '重点建议已经放在第一节，可以先看这一部分。', 4),
    makeMessage('history-continuation', 'writer', '后续可以再补充实际使用截图。', 5),
  ]
  const directMessages = [
    { ...makeMessage('history-direct-user', 'user', '单聊历史中也要保留头像、发言人与正文。', 1), conversationId: setup.direct.id, turnId: 'direct-history-1' },
    ...Array.from({ length: 12 }, (_, index) => ({ ...makeMessage(`history-direct-${index + 2}`, index % 2 ? 'user' : 'researcher', `第 ${index + 1} 轮阅读记录。\n\n${'查阅历史时保持阅读位置，新消息不应打断正在阅读的内容。'.repeat(8)}`, index + 2), conversationId: setup.direct.id, turnId: `direct-history-${index + 2}` })),
  ]
  const makeWork = (id: string, ownerAgentId: string, deliverable: string, message: Message, artifactId: string, parentWorkId?: string): WorkItem => ({ schemaVersion: 2, id, conversationId: group.id, sourceMessageId: 'history-user', key: id, scope: deliverable, deliverable, ownerAgentId, version: 2, status: 'delivered', budgetId: 'history-budget', rootWorkId: 'history-root', parentWorkId, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, outcome: { disposition: 'delivered', summary: '结果已发布到群聊。', evidence: [{ kind: 'answer', reference: message.content.slice(0, 14) }] }, resultMessageIds: [message.id], artifactIds: [artifactId], resultVersion: 1, requiresReview: false, createdAt: message.createdAt, updatedAt: message.createdAt })
  const works = [makeWork('history-root', 'researcher', 'AI 协作产品竞品分析', messages[1], 'research-file'), makeWork('history-writing', 'writer', '整理竞品分析报告初稿', messages[2], 'report-file', 'history-root')]
  const artifacts: (Artifact & { conversationId: string })[] = [
    { id: 'research-file', name: '研究要点.md', ownerAgentId: 'researcher', runId: 'history-researcher', path: join(group.workspacePath, 'artifacts', '研究要点.md'), size: 0, publishedAt: messages[1].createdAt, conversationId: group.id },
    { id: 'report-file', name: '竞品分析报告.md', ownerAgentId: 'writer', runId: 'history-writer', path: join(group.workspacePath, 'artifacts', '竞品分析报告.md'), size: 0, publishedAt: messages[2].createdAt, conversationId: group.id },
  ]
  await mkdir(join(group.workspacePath, 'artifacts'), { recursive: true })
  for (const artifact of artifacts) { const body = `# ${artifact.name}\n\n群聊验收的离线报告。\n`; await writeFile(artifact.path, body); artifact.size = Buffer.byteLength(body) }
  const store = new ProductStore(join(setup.dataPath, 'boai.sqlite')); await store.init()
  try { await store.write([
    ...messages.map(value => ({ collection: 'messages', id: value.id, value })),
    ...directMessages.map(value => ({ collection: 'messages', id: value.id, value })),
    ...works.map(value => ({ collection: 'workItems', id: value.id, value })),
    ...artifacts.map(value => ({ collection: 'artifacts', id: value.id!, value })),
  ]); await seedAdditional?.(store, setup) } finally { await store.close() }
  await runtime.start({ mainEntry })
  if (seedBeforeLaunch) {
    // A preload bridge exists before the cold runtime is ready. Confirm the
    // original service has opened this fixture before starting UI navigation.
    const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
    if (snapshot.dataPath !== setup.dataPath || ![setup.group.id, setup.direct.id].every(id => snapshot.conversations.some(room => room.id === id))) {
      throw new Error('UI启动未读取本场预备的profile和会话；禁止重建数据后掩盖失败')
    }
  }
  if (emulateViewport) await resizeGroupWindow(runtime, 1487, 1058)
  await runtime.page.getByRole('button', { name: /产品讨论组/ }).click()
  return { ...setup, state, artifacts }
}

export async function resizeGroupWindow(runtime: Desktop, width: number, height: number) {
  // CSS viewport emulation makes reference-sized captures reproducible on smaller physical displays.
  await runtime.page.setViewportSize({ width, height })
}

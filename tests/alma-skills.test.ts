/*
 * [OUTPUT]: 真实绑定脚本目录/相对文件清单与伴随文件变化、撤权检查，读取不执行脚本。
 * [OUTPUT]: 自我新增技能不中断回复，当前轮保持冻结能力、次轮加载；后续撤销或其他配置变更仍终止旧运行。
 * [OUTPUT]: 员工表情实际消息身份、去重、跨会话/清理拒绝与本机目录回归。
 * [OUTPUT]: 会话改名/检索保留原消息与运行，不显示隐藏来源，不重放写入。
 * [INPUT]: Actual skill files, AppService/SQLite and source media adapters.
 * [OUTPUT]: Bound-skill access/expiry, durable task idempotency, memory provenance and multimodal transport checks.
 * [POS]: Integration regression; controlled engines do not certify personality or real desktop actions.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { ApplicationResult } from '../src/shared/domain/application-protocol'
import type { Conversation, Snapshot } from '../src/shared/domain'
import { createBoundSkillOperations } from '../src/runtime/modules/resources/bound-skill-tools'
import { createReactionOperations } from '../src/runtime/modules/conversations/reaction-tools'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import { mcpModelOutput } from '../src/runtime/modules/sources/mcp-media'
import { summarizeMedia } from '../src/runtime/modules/browser/media'
import { browserChatPrompt } from '../src/runtime/adapters/mastra/browser-model'
const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const done of clean.splice(0).reverse()) await done() })
async function temporary() { const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-alma-skills-'))); clean.push(() => rm(root, { recursive: true, force: true })); return root }
async function fixture(run?: AgentEngine['run']) {
  const root = await temporary(), keys = new Map<string, string>()
  const owned = await startOwnedRuntime({ dataPath: root, skillDiscovery: { homeDir: root }, engine: { test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }), run: run ?? (async ctx => { await ctx.onDelta('已收到。') }) }, secrets: { get: async id => keys.get(id), set: async (id, key) => { keys.set(id, key) }, delete: async id => { keys.delete(id) } }, emit: () => {} })
  clean.push(owned.close)
  const call = (operation: string, input = {}, requestId?: string) => owned.service.handle('executeApplicationOperation', { operation, input, requestId }) as Promise<ApplicationResult>
  return { owned, call, root }
}
async function bindFromContext(context: EngineContext) {
  const call = async (operation: string, input = {}, requestId?: string) => {
    const result = await context.application!.call({ operation, input, requestId })
    expect(result.status).toBe('succeeded')
    return result.data as any
  }
  const content = '---\nname: generated-checker\ndescription: Check the supplied text\n---\nCheck only the provided text. Do not invent missing evidence.'
  const saved = await call('skills.save', { name: 'generated-checker', content, expectedHash: null }, 'create-checker')
  const agent = await call('employees.get', { id: context.agent.id })
  const plan = await call('skills.bindingPlan', { agentId: agent.id, localSkillId: saved.skill.id, expectedConfigVersion: agent.configVersion }, 'prepare-checker')
  const result = await call('skills.bind', { agentId: agent.id, localSkillId: saved.skill.id, expectedConfigVersion: agent.configVersion, planId: plan.id, contentHash: plan.contentHash }, 'bind-checker')
  await expect.poll(async () => (await call('skills.operation', { id: result.id })).status).toBe('completed')
  const current = await call('employees.get', { id: agent.id })
  return { content, beforeVersion: agent.configVersion, current, resourceId: current.skillIds.at(-1) as string }
}

it('can finish its own skill creation and binding, while only the next turn sees the new skill', async () => {
  let first: Awaited<ReturnType<typeof bindFromContext>> | undefined, failure: unknown, calls = 0, firstRun = ''
  const f = await fixture(async context => {
    try {
      if (++calls === 1) {
        firstRun = context.runId
        const original = [...context.agent.skillIds]
        first = await bindFromContext(context)
        expect(context.signal.aborted).toBe(false)
        expect(context.agent.configVersion).toBe(first.beforeVersion + 1)
        expect(context.agent.skillIds).toEqual(original)
        expect(context.resources.some(item => item.id === first!.resourceId)).toBe(false)
        expect(createBoundSkillOperations(context)).toEqual([])
        await expect(context.assertSkillAccess!([first.resourceId])).rejects.toThrow('技能')
        await context.onDelta('技能已创建并绑定，下次可以使用。')
      } else {
        expect(context.agent.skillIds).toContain(first!.resourceId)
        expect(await createBoundSkillOperations(context).find(tool => tool.name === 'read_skill')!.execute({ resourceId: first!.resourceId })).toMatchObject({ content: first!.content })
        await context.onDelta('已读取上轮绑定的技能。')
      }
    } catch (error) { failure = error; throw error }
  })
  await f.call('connections.create', { name: 'unused', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, 'connection')
  const room = await f.owned.service.handle('startCoreConversation', { content: '创建并绑定技能', requestId: 'bind-self' }) as Conversation
  await expect.poll(async () => failure ?? (await f.owned.service.handle('getConversation', { id: room.id }) as any).messages.some((item: any) => item.content === '技能已创建并绑定，下次可以使用。' && item.status === 'completed'), { timeout: 10000 }).toBe(true)
  await f.owned.service.handle('sendMessage', { conversationId: room.id, content: '现在读取它', mentionIds: [], requestId: 'read-new-skill' })
  await expect.poll(async () => failure ?? (await f.owned.service.handle('getConversation', { id: room.id }) as any).messages.some((item: any) => item.content === '已读取上轮绑定的技能。' && item.status === 'completed'), { timeout: 10000 }).toBe(true)
  const db = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite'))
  try {
    const snapshot = (await db.load<any>('snapshots')).find(item => item.id === firstRun)
    expect(snapshot.skillBindingVersions).toEqual([{ from: first!.beforeVersion, to: first!.current.configVersion, addedSkillIds: [first!.resourceId] }])
    expect(snapshot.agent.skillIds).not.toContain(first!.resourceId)
    expect(snapshot.resources.some((item: any) => item.id === first!.resourceId)).toBe(false)
    expect(await db.load('skillOperations')).toHaveLength(1)
    expect(await db.load('workItems')).toEqual([])
  } finally { await db.close() }
})

it.each(['remove', 'rename'] as const)('adding a skill does not let a later %s bypass cancellation', async action => {
  let ready: Awaited<ReturnType<typeof bindFromContext>> | undefined, context: EngineContext | undefined, failure: unknown
  const f = await fixture(async value => {
    context = value
    try {
      ready = await bindFromContext(value)
      await new Promise<void>(resolve => value.signal.addEventListener('abort', () => resolve(), { once: true }))
      value.signal.throwIfAborted()
      await value.onDelta('不应发布')
    } catch (error) { if (!value.signal.aborted) failure = error; throw error }
  })
  await f.call('connections.create', { name: 'unused', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, 'connection')
  const room = await f.owned.service.handle('startCoreConversation', { content: '创建技能后等待', requestId: 'bind-then-change' }) as Conversation
  await expect.poll(() => failure ?? !!ready, { timeout: 10000 }).toBe(true)
  if (action === 'remove') await f.owned.service.handle('removeResource', { id: ready!.resourceId })
  else {
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = ready!.current
    await f.owned.service.handle('saveAgent', { ...input, name: 'renamed', expectedConfigVersion: configVersion })
  }
  await expect.poll(() => context!.signal.aborted).toBe(true)
  await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity).toBe('idle')
  const detail = await f.owned.service.handle('getConversation', { id: room.id }) as any
  expect(detail.messages.some((item: any) => item.content === '不应发布')).toBe(false)
  expect(detail.runs.find((run: any) => run.id === context!.runId)?.status).toBe('cancelled')
})
it('tracks multi-step tasks with stable receipts and refuses stale updates without starting execution', async () => {
  const f = await fixture()
  const created = await f.call('tasks.create', { agentId: 'bobo', title: '多步研究', steps: [{ title: '检索', done: false }, { title: '交付', done: false }] }, 'one-task')
  expect(created.status).toBe('succeeded')
  expect(await f.call('tasks.create', { agentId: 'bobo', title: '多步研究', steps: [{ title: '检索', done: false }, { title: '交付', done: false }] }, 'one-task')).toEqual(created)
  const task = created.data as { id: string; revision: number }
  expect((await f.call('tasks.list', { agentId: 'bobo' })).data).toHaveLength(1)
  expect((await f.call('tasks.update', { id: task.id, expectedRevision: 1, status: 'in_progress' }, 'advance')).status).toBe('succeeded')
  expect((await f.call('tasks.update', { id: task.id, expectedRevision: 1, status: 'done' }, 'stale')).status).not.toBe('succeeded')
  expect((await f.call('tasks.get', { id: task.id })).data).toMatchObject({ status: 'in_progress', revision: 2 })
  const db = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite'))
  try { expect(await db.load('runs')).toHaveLength(0) } finally { await db.close() }
  expect((await f.call('tasks.delete', { id: task.id, expectedRevision: 2 }, 'delete')).status).toBe('succeeded')
  expect((await f.call('tasks.list', { agentId: 'bobo', includeDone: true })).data).toEqual([])
})
it('renames and searches the original core chat without sending messages, and keeps hidden sources out of search', async () => {
  const f = await fixture()
  await f.call('connections.create', { name: 'unused', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, 'connection')
  const room = await f.owned.service.handle('startCoreConversation', { content: '鹭岛方案讨论', requestId: 'source-turn' }) as Conversation
  await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity).toBe('idle')
  const before = (await f.call('sessions.get', { id: room.id })).data as { messages: unknown[]; runs: unknown[] }
  const renamed = await f.call('sessions.rename', { id: room.id, title: '鹭岛研究' }, 'rename-chat')
  expect(renamed.status).toBe('succeeded')
  expect(await f.call('sessions.rename', { id: room.id, title: '鹭岛研究' }, 'rename-chat')).toEqual(renamed)
  expect((await f.call('sessions.get', { id: room.id })).data).toMatchObject({ conversation: { title: '鹭岛研究' }, messages: before.messages, runs: before.runs })
  expect(await f.call('sessions.search', { keyword: '鹭岛', scope: 'current', conversationId: room.id })).toMatchObject({ status: 'succeeded', data: { results: expect.arrayContaining([expect.objectContaining({ kind: 'conversation', conversationId: room.id }), expect.objectContaining({ kind: 'message', conversationId: room.id })]) } })
  await f.owned.service.handle('updateConversationList', { id: room.id, action: 'hide' })
  expect(await f.call('sessions.search', { keyword: '鹭岛', scope: 'all' })).toMatchObject({ status: 'succeeded', data: { results: [] } })
  expect(await f.call('sessions.rename', { id: room.id, title: '鹭岛研究' }, 'rename-chat')).toEqual(renamed)
  expect((await f.call('sessions.list')).data).toEqual([])
})
it('ordinary skill reading remains bound, detects changed bytes and rechecks live access', async () => {
  const root = await temporary(), path = join(root, 'skill'); await mkdir(path)
  await writeFile(join(path, 'SKILL.md'), '---\nname: sample\ndescription: a sample\n---\nActual skill')
  await mkdir(join(path, 'scripts'))
  await writeFile(join(path, 'scripts', 'probe.sh'), 'exit 17\n')
  let permitted = true
  const ctx = { agent: { id: 'bobo', skillIds: ['s'], knowledgeIds: [] }, conversation: { id: 'c', kind: 'direct' }, resources: [{ id: 's', name: 'sample', kind: 'skill', path }], signal: new AbortController().signal, assertSkillAccess: async () => { if (!permitted) throw new Error('revoked') } } as unknown as EngineContext
  const tools = createBoundSkillOperations(ctx), list = tools.find(t => t.name === 'list_skills')!, read = tools.find(t => t.name === 'read_skill')!
  expect(await list.execute({})).toMatchObject({ skills: [{ resourceId: 's', description: 'a sample' }] })
  await expect(read.execute({ resourceId: 'foreign' })).rejects.toThrow('未绑定')
  expect(await read.execute({ resourceId: 's' })).toMatchObject({ content: expect.stringContaining('Actual skill'), directory: path,
    files: expect.arrayContaining([expect.objectContaining({ path: 'scripts/probe.sh', size: 8 })]) })
  await writeFile(join(path, 'scripts', 'probe.sh'), 'exit 18\n')
  await expect(read.execute({ resourceId: 's' })).rejects.toThrow('变更')
  await writeFile(join(path, 'scripts', 'probe.sh'), 'exit 17\n')
  await writeFile(join(path, 'SKILL.md'), 'changed')
  await expect(read.execute({ resourceId: 's' })).rejects.toThrow('变更')
  permitted = false; await expect(list.execute({})).rejects.toThrow('revoked')
})
it('native ordinary conversations expose the same bound skill loader without creating Work', async () => {
  const root = await temporary(), skill = join(root, 'skill'); await mkdir(skill)
  await writeFile(join(skill, 'SKILL.md'), '---\nname: sample\ndescription: sample\n---\nRead before acting.')
  const ctx = { agent: { id: 'bobo', systemRole: 'core', skillIds: ['s'], knowledgeIds: [] }, conversation: { id: 'c', kind: 'direct' }, resources: [{ id: 's', name: 'sample', kind: 'skill', path: skill }], messages: [], signal: new AbortController().signal, onTool: async () => {}, recallMemory: async () => ({ entries: [], epoch: 1, namespace: 'employee:bobo' }) } as unknown as EngineContext
  const product = createNativeProducts(ctx)
  expect(product.tools.map(t => t.name)).toEqual(expect.arrayContaining(['list_skills', 'read_skill', 'search_memory']))
  expect(await product.tools.find(t => t.name === 'read_skill')!.execute({ resourceId: 's' }, 'read-bound')).toMatchObject({ content: expect.stringContaining('Read before acting'), directory: skill,
    files: [expect.objectContaining({ path: 'SKILL.md' })] })
  await product.dispose()
})
it('retains only a real current-user quote and recalls it through the actual host', async () => {
  let result: unknown, recalled: unknown, rejected = false
  const f = await fixture(async ctx => {
    try { await ctx.rememberMemory!({ sourceMessageId: ctx.triggerMessageId!, quote: '我住在并不存在的城市' }) } catch { rejected = true }
    result = await ctx.rememberMemory!({ sourceMessageId: ctx.triggerMessageId!, quote: '示例项目叫雾岛' })
    recalled = await ctx.recallMemory!('雾岛')
    await ctx.onDelta('这条已经记住了。')
  })
  await f.call('connections.create', { name: 'unused', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, 'connection')
  const room = await f.owned.service.handle('startCoreConversation', { content: '请记住：示例项目叫雾岛。', requestId: 'remember-turn' }) as Conversation
  await expect.poll(() => result, { timeout: 10000 }).toMatchObject({ retained: true })
  await expect.poll(() => recalled, { timeout: 10000 }).toMatchObject({ entries: [expect.objectContaining({ content: '示例项目叫雾岛', sourceMessageIds: expect.any(Array), origin: 'model' })] })
  expect(rejected).toBe(true)
  await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity).toBe('idle')
})
it('preserves MCP screenshots as actual model media and summarizes persistent traces', () => {
  const data = Buffer.from('actual fixture bytes').toString('base64')
  const result = { content: [{ type: 'text', text: 'AX snapshot' }, { type: 'image', mimeType: 'image/png', data }] }
  const output = mcpModelOutput(result)
  expect(output.value).toContainEqual({ type: 'image-data', mediaType: 'image/png', data })
  expect(JSON.stringify(summarizeMedia(result))).not.toContain(data)
  const messages = browserChatPrompt([{ role: 'tool', content: [{ type: 'tool-result', toolName: 'call_data_source', output }] }]) as unknown[]
  expect(messages).toHaveLength(2)
  expect(mcpModelOutput({ content: [{ type: 'image', mimeType: 'image/png', data: 'a'.repeat(9 * 1024 * 1024) }] }).value.every(item => item.type !== 'image-data')).toBe(true)
})
it('all seven integrations ship actual BOAI workflows without executable Alma CLI examples', async () => {
  for (const name of ['web-fetch', 'web-search', 'scheduler', 'memory-management', 'browser', 'computer-use', 'tasks']) {
    const content = await readFile(join('resources/agent-skills', `boai-${name}`, 'SKILL.md'), 'utf8')
    expect(content).toContain(`name: boai-${name}`)
    expect(content).not.toMatch(/^alma /m)
  }
})

it('employee reactions persist as themselves, preserve user reactions and cannot escape the visible turn or revive after clear', async () => {
  let context: EngineContext | undefined, foreign = '', observed: unknown, complete = false, failure: unknown
  const f = await fixture(async ctx => {
    context = ctx
    try {
    const tools = createReactionOperations(ctx), list = tools.find(t => t.name === 'list_reaction_messages')!, set = tools.find(t => t.name === 'react_to_message')!
    const messages = (await list.execute({}) as { messages: { messageId: string }[] }).messages
    expect(messages.map(item => item.messageId)).toContain(ctx.triggerMessageId)
    if (foreign) await expect(set.execute({ messageId: foreign, emoji: '👍', active: true })).rejects.toThrow('范围')
    await expect(set.execute({ messageId: ctx.triggerMessageId, emoji: 'not-emoji', active: true })).rejects.toThrow()
    await expect(set.execute({ messageId: ctx.triggerMessageId, emoji: '👍', active: true, senderId: 'user' })).rejects.toThrow()
    await f.owned.service.handle('setMessageReaction', { conversationId: ctx.conversation.id, messageId: ctx.triggerMessageId!, emoji: '👍', active: true })
    observed = await set.execute({ messageId: ctx.triggerMessageId, emoji: '👍', active: true })
    await set.execute({ messageId: ctx.triggerMessageId, emoji: '👍', active: true })
    const product = createNativeProducts(ctx)
    try { expect(product.tools.map(t => t.name)).toContain('react_to_message') } finally { await product.dispose() }
    await ctx.onDelta('收到。'); complete = true
    } catch (error) { failure = String(error); throw error }
  })
  await f.call('connections.create', { name: 'unused', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, 'connection')
  const first = await f.owned.service.handle('startCoreConversation', { content: '第一条', requestId: 'reaction-first' }) as Conversation
  await expect.poll(() => failure ?? complete, { timeout: 10000 }).toBe(true)
  await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === first.id)?.activity).toBe('idle')
  foreign = context!.triggerMessageId!; complete = false
  const room = await f.owned.service.handle('startCoreConversation', { content: '只回应当前这一条', requestId: 'reaction-second' }) as Conversation
  await expect.poll(() => failure ?? complete, { timeout: 10000 }).toBe(true)
  await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity).toBe('idle')
  expect(observed).toMatchObject({ destination: 'boai', status: 'applied' })
  const db = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite'))
  try {
    const message = (await db.load<import('../src/shared/domain').Message>('messages')).find(message => message.id === context!.triggerMessageId!)
    expect(message?.reactions).toEqual([{ senderId: 'user', senderName: '我', emoji: '👍' }, { senderId: 'bobo', senderName: context!.agent.name, emoji: '👍' }])
    expect(await db.load('workItems')).toHaveLength(0)
    expect(await db.load('channelDeliveries')).toHaveLength(0)
    expect((await db.load('messages', { conversationId: room.id }))).toHaveLength(2)
  } finally { await db.close() }
  await f.owned.service.handle('clearConversationHistory', { id: room.id, hide: false })
  await expect(context!.reactions!.set({ messageId: context!.triggerMessageId!, emoji: '👍', active: true })).rejects.toThrow()
})

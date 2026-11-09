/*
 * [INPUT]: 隔离AppService/SQLite、真实Codex/Claude适配器及确定性stdio协议进程。
 * [OUTPUT]: 当前项目文件交付/原件保留、切换映射、未知重建拒绝及交接真实接受证据；零外部模型。
 * [POS]: WT3 原生项目与上下文交接定向验收，不替代供应商或桌面验收。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import type { DigitalAgent, Message } from '../packages/shared/src/domain'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { CodexEmployeeEngine } from '../packages/runtime/src/adapters/codex/engine'
import { ClaudeEmployeeEngine } from '../packages/runtime/src/adapters/claude/engine'
import { NativeConversationEngine, type NativeConversationInput } from '../packages/runtime/src/adapters/native-conversation'
import { stageVerifiedBusinessArtifact } from '../packages/runtime/src/modules/workspaces/directory-files'
import { resolveDirectoryTarget, assertDirectoryTargetCurrent } from '../packages/runtime/src/modules/workspaces/directory-access'
import { nativeFixture } from './fixtures/native-product'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function project() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-native-project-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
const sendIn = (f: Awaited<ReturnType<typeof nativeFixture>>, cwd: string, content: string) => f.service.handle('sendMessage', { conversationId: f.chat.id, content, mentionIds: [], requestId: crypto.randomUUID(), workingDirectory: cwd }) as Promise<Message>

describe.each(['codex', 'claude'] as const)('%s 项目与交接协议', runtime => {
  it('publishes a project file through the original artifact service and clearing history preserves the project original', async () => {
    const f = await nativeFixture(runtime, cleanup), cwd = await project()
    const detail = await f.wait(await sendIn(f, cwd, 'NATIVE_PUBLISH'))
    expect(detail.runs[0].status, detail.runs[0].error).toBe('completed')
    expect(detail.artifacts).toHaveLength(1)
    const artifact = detail.artifacts[0], original = await readFile(join(cwd, 'native-document.md'))
    expect(await readFile(artifact.path)).toEqual(original)
    expect(artifact.contentHash).toBe(createHash('sha256').update(original).digest('hex'))
    expect(artifact.sourcePath).toContain(`/runs/${detail.runs[0].id}/deliveries/`)
    expect(artifact.sourcePath).not.toContain(cwd)
    await f.service.handle('clearConversationHistory', { id: f.chat.id, hide: false })
    expect(await readFile(join(cwd, 'native-document.md'))).toEqual(original)
  })

  it('refuses a linked project file instead of publishing its target', async () => {
    const f = await nativeFixture(runtime, cleanup), cwd = await project()
    const detail = await f.wait(await sendIn(f, cwd, 'NATIVE_SYMLINK_PATH'))
    expect(detail.runs[0].status).toBe('failed')
    expect(detail.runs[0].toolEvents.some(event => event.name === 'publish_artifact' && event.detail?.includes('Symbolic links'))).toBe(true)
    expect(detail.artifacts).toHaveLength(0)
  })

  it.each(['outside', 'managed'] as const)('refuses %s files even when native tools can reach them', async location => {
    const f = await nativeFixture(runtime, cleanup), cwd = location === 'managed' ? f.root : await project()
    const outside = await project(), filename = join(location === 'managed' ? f.root : outside, 'secret.md')
    await writeFile(filename, 'PRIVATE-SOURCE')
    const helper = join(f.root, 'native-business.mjs'), original = await readFile(helper, 'utf8')
    await writeFile(helper, original.replace('export async function business(prompt,tool){', `export async function business(prompt,tool){
      if (prompt.messages.at(-1)?.content.startsWith('NATIVE_FOREIGN_PUBLISH ')) {
        await tool('publish_artifact', {path: JSON.parse(prompt.messages.at(-1).content.slice('NATIVE_FOREIGN_PUBLISH '.length))}); return 'published';
      }`))
    if (location === 'managed') {
      await expect(sendIn(f, cwd, 'NATIVE_FOREIGN_PUBLISH ' + JSON.stringify(filename))).rejects.toThrow()
    } else {
      const detail = await f.wait(await sendIn(f, cwd, 'NATIVE_FOREIGN_PUBLISH ' + JSON.stringify(filename)))
      expect(detail.runs[0].status).toBe('failed'); expect(detail.artifacts).toHaveLength(0)
    }
    expect(await readFile(filename, 'utf8')).toBe('PRIVATE-SOURCE')
  })

  it('retains the old native mapping when an idle project change starts a new session', async () => {
    const f = await nativeFixture(runtime, cleanup), firstCwd = await project(), secondCwd = await project()
    const first = await f.wait(await sendIn(f, firstCwd, 'NATIVE_CWD'))
    const next = await f.wait(await sendIn(f, secondCwd, 'NATIVE_CWD'))
    expect(next.runs.at(-1)?.status, next.runs.at(-1)?.error).toBe('completed')
    expect(next.runs.at(-1)?.backend?.sessionId).not.toBe(first.runs[0].backend?.sessionId)
    const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
    try {
      expect(await store.load('nativeSessionTransitions')).toEqual([expect.objectContaining({ reason: 'working-directory-changed', sourceRunId: first.runs[0].id, sourceThreadId: first.runs[0].backend?.sessionId, sourceWorkingDirectory: firstCwd, targetWorkingDirectory: secondCwd })])
    } finally { await store.close() }
  })

  it('uses a new native session at the updated employee project and rebuilds on execution configuration changes', async () => {
    const f = await nativeFixture(runtime, cleanup), firstCwd = await project(), secondCwd = await project()
    const first = await f.wait(await f.send('NATIVE_CWD'))
    const input = (agent: DigitalAgent, directory: string, instructions = agent.instructions) => ({ id: agent.id, expectedConfigVersion: agent.configVersion, name: agent.name, role: agent.role, instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, executionBackend: agent.executionBackend, nativeOptions: agent.nativeOptions, skillIds: agent.skillIds, knowledgeIds: agent.knowledgeIds, allowCommands: agent.allowCommands, active: agent.active, defaultProjectDirectory: directory })
    const changed = await f.service.handle('saveAgent', input(f.agent, firstCwd)) as DigitalAgent
    expect(changed.projectDefaultChanges).toBe(1)
    const second = await f.wait(await f.send('NATIVE_CWD'))
    expect(second.runs.at(-1)?.status, second.runs.at(-1)?.error).toBe('completed')
    expect(second.runs.at(-1)?.backend?.sessionId).not.toBe(first.runs[0].backend?.sessionId)
    const changedAgain = await f.service.handle('saveAgent', input(changed, secondCwd)) as DigitalAgent
    expect(changedAgain.projectDefaultChanges).toBe(2)
    const third = await f.wait(await f.send('NATIVE_CWD'))
    expect(third.runs.at(-1)?.backend?.sessionId).not.toBe(second.runs.at(-1)?.backend?.sessionId)
    await f.service.handle('saveAgent', input(changedAgain, secondCwd, '增加一个明确的执行规则'))
    const configured = await f.wait(await f.send('NATIVE_CWD'))
    expect(configured.runs.at(-1)?.status, configured.runs.at(-1)?.error).toBe('completed')
    expect(configured.runs.at(-1)?.backend?.sessionId).not.toBe(third.runs.at(-1)?.backend?.sessionId)
    const calls = (await Promise.all([join(f.root, 'agents', f.agent.id, 'workspace/sessions', f.chat.id, 'work'), firstCwd, secondCwd].map(directory => readFile(join(directory, 'native-thread-requests.jsonl'), 'utf8')))).flatMap(text => text.trim().split('\n').map(line => JSON.parse(line)))
    expect(calls.map(call => call.method)).toEqual(['thread/start', 'thread/start', 'thread/start', 'thread/start'])
  })

  it('keeps unknown native work fenced after restart and refuses a new project as a retry escape', async () => {
    const f = await nativeFixture(runtime, cleanup), firstCwd = await project(), nextCwd = await project()
    const first = await f.wait(await sendIn(f, firstCwd, 'NATIVE_UNKNOWN'))
    expect(first.runs[0].status).toBe('failed')
    await f.restart()
    const next = await f.wait(await sendIn(f, nextCwd, 'NATIVE_CWD'))
    expect(next.runs.at(-1)?.status).toBe('failed')
    expect(next.runs.at(-1)?.error).toContain('未知')
    expect(await readFile(join(firstCwd, 'unknown-effect'), 'utf8')).toBe('once')
    await expect(readFile(join(nextCwd, 'native-turn-requests.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('persists handoff preparation and binding before transport and confirms only actual native acceptance', async () => {
    const f = await nativeFixture(runtime, cleanup), cwd = await project()
    await f.service.close()
    const store = new ProductStore(join(f.root, 'handoff.sqlite')); await store.init(); cleanup.push(() => store.close())
    const engine = runtime === 'codex' ? new CodexEmployeeEngine(store) : new ClaudeEmployeeEngine(store)
    await engine.recover(f.root)
    const calls: string[] = [], evidence: { threadId: string; turnId: string }[] = []
    const context: EngineContext = {
      agent: f.agent, apiKey: '', runtimeProfile: f.profile, runtimeDirectory: { cwd, privateHome: join(f.root, 'handoff-private') },
      conversation: f.chat, messages: [{ id: 'message', conversationId: f.chat.id, sequence: 1, senderType: 'user', senderId: 'user', senderName: '本人', status: 'completed', content: '核对交接背景', createdAt: new Date().toISOString() }],
      triggerMessageId: 'message', runId: 'handoff-run', signal: new AbortController().signal, resources: [], responseKind: 'chat',
      workspace: { root: cwd, workPath: cwd, runPath: join(cwd, 'runs/handoff-run'), sharedPath: join(cwd, 'shared') },
      onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => { throw new Error('unexpected command') }, onArtifact: async () => {},
      nativeHandoff: { payload: '只读背景：已完成 7 个文件；旧命令不得重放。',
        prepare: async target => { expect(target).toEqual({ runId: 'handoff-run', threadId: undefined }); calls.push('prepared') },
        bindSession: async threadId => { expect(threadId).toBeTruthy(); calls.push('bound') },
        accepted: async (threadId, turnId) => { evidence.push({ threadId, turnId }); calls.push('accepted') },
        unknown: async () => { calls.push('unknown') },
      },
    }
    await engine.run(context)
    expect(calls).toEqual(['prepared', 'bound', 'accepted'])
    expect(evidence).toHaveLength(1)
    const frames = (await readFile(join(cwd, 'native-turn-requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const prompt = JSON.parse(frames[0].input.find((part: { type: string }) => part.type === 'text').text)
    expect(prompt.contextHandoff).toMatchObject({ kind: 'reference-data', payload: context.nativeHandoff!.payload })
    const saved = await store.load<{ threadId: string; turnId: string; deliveryState: string }>(`${runtime}Sessions`)
    expect(saved[0]).toMatchObject({ threadId: evidence[0].threadId, turnId: evidence[0].turnId, deliveryState: 'accepted' })
  })
})

it('a transport write without any native accepted response leaves the handoff unknown', async () => {
  const cwd = await project(), store = new ProductStore(join(cwd, 'test.sqlite')); await store.init(); cleanup.push(() => store.close())
  class DisconnectedEngine extends NativeConversationEngine {
    constructor(runtime = 'claude') { super(store, runtime) }
    protected async conversation(_context: EngineContext, input: NativeConversationInput): Promise<{ text: string }> {
      await input.onSession('thread')
      await input.onSubmitted('thread', 'turn')
      throw new Error('transport disconnected before native response')
    }
  }
  const calls: string[] = []
  const context = { agent: { id: 'employee', name: '员工', instructions: '', role: '', skillIds: [], nativeOptions: {}, configVersion: 1 }, conversation: { id: 'conversation' }, runId: 'run', triggerMessageId: 'message', messages: [], resources: [], signal: new AbortController().signal, onTool: async () => {}, onDelta: async () => {},
    nativeHandoff: { payload: 'background', prepare: async () => { calls.push('prepared') }, bindSession: async () => { calls.push('bound') }, accepted: async () => { calls.push('accepted') }, unknown: async () => { calls.push('unknown') } },
  } as unknown as EngineContext
  await expect(new DisconnectedEngine().run(context)).rejects.toThrow('transport disconnected')
  expect(calls).toEqual(['prepared', 'bound', 'unknown'])
  expect(await store.load('claudeSessions')).toEqual([expect.objectContaining({ state: 'pending', deliveryState: 'unknown' })])
  await expect(new DisconnectedEngine('codex').run({ ...context, runId: 'alternate-run' })).rejects.toThrow('未知')
  expect(await store.load('codexSessions')).toEqual([])
  expect(calls).toEqual(['prepared', 'bound', 'unknown'])
})


it('refuses a source changed between reading and staging without publishing stale bytes', async () => {
  const cwd = await project(), source = join(cwd, 'original.md')
  await writeFile(source, 'ORIGINAL')
  const target = await resolveDirectoryTarget(source, 'read')
  const context = { signal: new AbortController().signal, runId: 'run', workspace: { root: join(cwd, 'managed') },
    beforeEffect: async () => { await writeFile(source, 'CHANGED') },
  } as unknown as EngineContext
  await expect(stageVerifiedBusinessArtifact(context, target, () => assertDirectoryTargetCurrent(target))).rejects.toThrow('原件正在变化')
  expect(await readFile(source, 'utf8')).toBe('CHANGED')
})

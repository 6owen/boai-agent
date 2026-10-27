/*
 * [INPUT]: Codex 0.164 code-mode subAgentActivity and the earlier collabAgentToolCall notification shapes.
 * [OUTPUT]: Native child file/tool results retain parent identity and cannot overwrite the parent's final answer.
 * [POS]: Regression for the production native conversation notification filter; no real-model claim.
 * [PROTOCOL]: Update tests/.folder.md when changing this test.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { CodexClient } from '../packages/runtime/src/adapters/codex/client'
import { runCodexConversation } from '../packages/runtime/src/adapters/codex/conversation'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { ExecutionEvent } from '../packages/shared/src/domain/execution'

afterEach(() => vi.restoreAllMocks())
it.each(['subAgentActivity', 'collabAgentToolCall'])('retains child events introduced by %s', async type => {
  const events: ExecutionEvent[] = [], texts: string[] = []
  vi.spyOn(CodexClient, 'start').mockImplementation(async input => ({ client: {
    request: async (method: string) => method === 'thread/start' ? { thread: { id: 'parent' } } : { turn: { id: 'parent-turn' } },
    wait: async (done: Promise<void>) => {
      await input.onNotification?.('item/completed', { threadId: 'parent', item: { id: 'spawn', type, ...(type === 'subAgentActivity' ? { kind: 'started', agentThreadId: 'child' } : { receiverThreadIds: ['child'] }) } })
      await input.onNotification?.('turn/started', { threadId: 'child', turn: { id: 'child-turn' } })
      await input.onNotification?.('item/completed', { threadId: 'child', turnId: 'child-turn', item: { id: 'write', type: 'fileChange', status: 'completed', changes: [{ path: 'child.json', kind: 'add', diff: '+child receipt' }] } })
      await input.onNotification?.('item/completed', { threadId: 'unrelated', item: { id: 'leak', type: 'agentMessage', text: 'unrelated' } })
      await input.onNotification?.('item/completed', { threadId: 'child', item: { id: 'child-final', type: 'agentMessage', text: 'child result' } })
      await input.onNotification?.('turn/completed', { threadId: 'child', turn: { id: 'child-turn', status: 'completed' } })
      await input.onNotification?.('item/completed', { threadId: 'parent', item: { id: 'final', type: 'agentMessage', text: 'parent result' } })
      await input.onNotification?.('turn/completed', { threadId: 'parent', turn: { id: 'parent-turn', status: 'completed' } })
      await done
    }, drain: async () => {}, close: async () => {},
  } as unknown as CodexClient, verified: {} as never }))
  const context = { runtimeProfile: { verified: {} }, runtimeDirectory: { cwd: '/fixture' }, agent: {}, signal: new AbortController().signal, onExecutionEvent: async (event: ExecutionEvent) => { events.push(event) }, onDelta: async (text: string) => { texts.push(text) } } as unknown as EngineContext
  await runCodexConversation(context, { instructions: '', prompt: 'native child fixture', images: [], tools: [], onSession: async () => {}, onSubmitted: async () => {} })
  expect(events.find(event => event.id === 'child:write')).toMatchObject({ parentId: 'spawn', canonical: { operationId: 'child:write', outcome: 'succeeded' } })
  expect(events.find(event => event.id === 'child:text:child-final')).toMatchObject({ parentId: 'spawn', payload: { text: 'child result' } })
  expect(JSON.stringify(events)).not.toContain('unrelated')
  expect(texts).toEqual(['parent result'])
})

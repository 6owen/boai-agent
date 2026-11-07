/*
 * [INPUT]: Real team creation, SQLite/filesystem, interrupted publication and later employee defaults.
 * [OUTPUT]: Team project snapshots survive explicit recovery/restart and stay fixed in later group messages.
 * [POS]: WT3 team creation directory boundary; no model calls or GUI.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Connection, Conversation, DigitalAgent, Message } from '../packages/shared/src/domain'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { TeamRepository } from '../packages/runtime/src/modules/teams/team-repository'
import { TeamCreationService } from '../packages/runtime/src/modules/teams/team-creation'
import { WorkspaceService } from '../packages/runtime/src/modules/workspaces/workspace-service'
import { ProjectDirectoryService } from '../packages/runtime/src/modules/workspaces/project-directory-service'
import { writingPlan } from './fixtures/team-planner'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

test('team acceptance freezes each member location through recovery, restart and later default changes', async () => {
  const dataPath = await mkdtemp(join(tmpdir(), 'boai-team-project-'))
  cleanup.push(() => rm(dataPath, { recursive: true, force: true }))
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const connection: Connection = { id: 'team-model', name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture', hasApiKey: false }
  await store.write([{ collection: 'connections', id: connection.id, value: connection }])
  let stopBeforeCommit = true
  const createService = () => new TeamCreationService(new TeamRepository(store), dataPath, new WorkspaceService(dataPath), {
    critical: action => action(), install: () => {}, reload: async () => {}, changed: () => {},
    checkpoint: async phase => { if (phase === 'before-commit' && stopBeforeCommit) throw new Error('publication interrupted') },
  })
  const creation = createService(); cleanup.push(() => creation.close())
  const request = { plan: writingPlan, connectionId: connection.id, modelId: '', requestId: 'team-project-original' }
  const accepted = await creation.acceptAgentPlan(request)
  const expected = Object.fromEntries(accepted.agents.map(agent => [agent.id, { mode: 'managed', source: 'managed', revision: 1 }]))
  expect(accepted.conversation?.projectSelections).toEqual(expected)
  expect((await creation.waitForCompletion(accepted.id)).status).toBe('needs_attention')
  expect(await store.load('conversations')).toEqual([])
  await creation.close()

  stopBeforeCommit = false
  const restarted = createService(); cleanup.push(() => restarted.close())
  await restarted.recover()
  const recovered = await restarted.get({ operationId: accepted.id })
  expect(recovered.conversation?.projectSelections).toEqual(expected)
  expect(await store.load('conversations')).toEqual([])
  await restarted.resume({ operationId: recovered.id, expectedVersion: recovered.version })
  const committed = await restarted.waitForCompletion(accepted.id)
  expect(committed.status).toBe('committed')
  expect(committed.conversation?.projectSelections).toEqual(expected)
  for (const agent of await store.load<DigitalAgent>('agents')) await store.write([{ collection: 'agents', id: agent.id, value: { ...agent, defaultProjectDirectory: '/later-default', configVersion: agent.configVersion + 1 } }])
  await restarted.close()

  const reopened = createService(); cleanup.push(() => reopened.close())
  await reopened.recover()
  expect(await reopened.acceptAgentPlan(request)).toEqual(committed)
  const rooms = await store.load<Conversation>('conversations')
  expect(rooms).toHaveLength(1)
  expect(rooms[0].projectSelections).toEqual(expected)
  const message: Message = { id: 'later-message', conversationId: rooms[0].id, senderId: 'user', senderName: '用户', senderType: 'user', content: '继续', sequence: 1, status: 'completed', createdAt: new Date().toISOString() }
  const projects = new ProjectDirectoryService(store, dataPath, { busy: () => false, preparing: () => false, changed: () => {} })
  await projects.prepareMessage(rooms[0], {}, message)
  expect(message.projectSelections).toEqual(expected)
  for (const collection of ['messages', 'workItems', 'runs']) expect(await store.load(collection)).toEqual([])
})

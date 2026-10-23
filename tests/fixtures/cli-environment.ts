/*
 * [OUTPUT]: 四原生协议回报实际业务cwd，同目录续用/不同目录新会话，完整权限配置不被改写。
 * [INPUT]: Original AppService, isolated native process and built BOAI CLI.
 * [OUTPUT]: Real CLI original-message read/publication/deduplication, owner rejection and post-exit revocation assertions.
 * [POS]: Shared controlled Codex/Claude/Pi/ACP integration; no real provider certification.
 * [PROTOCOL]: 变化同步Header与tests/fixtures/.folder.md。
 */
import { expect, vi } from 'vitest'
import { resolve, join } from 'node:path'
import { mkdtemp, realpath, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { openDesktopCli } from '../../src/main/cli-service'
import { CliRpcClient } from '../../src/cli/client'
import { RunCliAccess } from '../../src/runtime/run-cli-access'
import type { AppService } from '../../src/runtime/service'
import type { ConversationDetail, Message, Snapshot, DigitalAgent } from '../../src/shared/domain'
import type { RunCliEnvironmentLease } from '../../src/shared/cli/run-access'

export async function verifyCliEnvironment(f: {
  root: string; service: AppService; agent: { id: string }; chat: { id: string }
  send(content: string): Promise<Message>; wait(message: Message): Promise<ConversationDetail>
}, cleanup: (() => Promise<void>)[]) {
  const server = await openDesktopCli(f.root, 'fixture', { request: async (method, input) => f.service.handle(method, input) as never, runAccess: input => f.service.runCliAccess(input) })
  cleanup.push(server.close)
  const leases: RunCliEnvironmentLease[] = [], original = RunCliAccess.prototype.environment
  const spy = vi.spyOn(RunCliAccess.prototype, 'environment').mockImplementation(async function (this: RunCliAccess, runId) {
    const lease = await original.call(this, runId); leases.push(lease); return lease
  })
  cleanup.push(async () => { spy.mockRestore(); vi.unstubAllEnvs() })
  vi.stubEnv('BOAI_SERVER_TOKEN', 'host-owner-token-must-not-be-inherited')
  vi.stubEnv('BOAI_SERVER_URL', 'ws://127.0.0.1:1')
  vi.stubEnv('BOAI_SECRET_INTERNAL', 'host-secret-must-not-be-inherited')
  const entry = resolve('dist/cli/index.mjs'), message = await f.send(`NATIVE_CLI_SCOPE ${JSON.stringify({ entry })}`)
  const detail = await f.wait(message), run = detail.runs.find(run => run.triggerMessageId === message.id)!
  expect(run.status, run.error).toBe('completed')
  const result = detail.messages.filter(message => message.senderType === 'agent').map(message => message.content).join('\n').match(/CLI_SCOPE_RESULT (.+)/)
  expect(result, JSON.stringify(detail.messages)).not.toBeNull()
  const value = JSON.parse(result![1])
  expect(value).toMatchObject({ context: { runId: run.id, employee: { id: f.agent.id }, conversation: { id: f.chat.id }, expiresAt: null }, readOriginal: true, publishedSame: true, denied: 'CHANNEL_NOT_FOUND', environment: { run: run.id, hasToken: true, owner: false, hostSecret: false } })
  expect(value.tools).toEqual(expect.arrayContaining(['read_messages', 'send_message', 'publish_artifact']))
  expect(value.tools).not.toContain('read_knowledge')
  expect(detail.messages.filter(message => message.senderType === 'agent' && message.content === 'CLI_ORIGINAL_MESSAGE')).toHaveLength(1)
  expect(detail.workItems).toHaveLength(0)
  expect(leases).toHaveLength(1)
  const client = new CliRpcClient(leases[0].env.BOAI_SERVER_URL!, { token: leases[0].env.BOAI_SERVER_TOKEN! })
  cleanup.push(async () => client.destroy())
  await expect(client.connect()).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  // Even an explicitly supplied owner directory cannot bypass a missing run lease.
  const env: NodeJS.ProcessEnv = { ...process.env, BOAI_CLI_EMPLOYEE_RUN: run.id }
  delete env.BOAI_SERVER_URL; delete env.BOAI_SERVER_TOKEN
  try {
    await promisify(execFile)(process.execPath, [entry, 'employees', '--data-dir', f.root, '--json'], { env, timeout: 10000 })
    throw new Error('employee CLI unexpectedly discovered owner credentials')
  } catch (error) {
    expect(JSON.parse((error as { stderr: string }).stderr)).toMatchObject({ code: 'AUTH_FAILED' })
  }
  const published = await f.wait(await f.send(`NATIVE_CLI_FILE ${JSON.stringify({ entry })}`))
  expect(published.runs.at(-1)?.status, published.runs.at(-1)?.error).toBe('completed')
  expect(published.artifacts.filter(artifact => artifact.name === 'cli-delivered.md')).toHaveLength(1)
  expect(published.workItems?.some(work => work.status === 'delivered')).toBe(true)
}

export async function verifyWorkingDirectory(f: { root: string; service: AppService; agent: { id: string }; chat: { id: string }; wait(message: Message): Promise<ConversationDetail> }, cleanup: (() => Promise<void>)[]) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-native-cwd-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const a = join(root, 'project-a'), b = join(root, 'project-b'); await mkdir(a); await mkdir(b)
  const agent = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === f.agent.id)!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
  if (agent.executionBackend?.kind !== 'runtime-plugin') await f.service.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: 'full-access' })
  const sessions: string[] = []
  for (const cwd of [a, a, b]) {
    const message = await f.service.handle('sendMessage', { conversationId: f.chat.id, content: 'NATIVE_CWD', workingDirectory: cwd, mentionIds: [], requestId: randomUUID() }) as Message
    const detail = await f.wait(message), run = detail.runs.find(run => run.triggerMessageId === message.id)!
    expect(run.status, run.error).toBe('completed')
    const reply = detail.messages.find(message => message.runId === run.id && message.senderType === 'agent')!
    expect(JSON.parse(reply.content.match(/NATIVE_CWD_RESULT (.+)/)![1])).toEqual({ cwd })
    expect(run.backend?.sessionId).toBeTruthy(); sessions.push(run.backend!.sessionId!)
  }
  expect(sessions[1]).toBe(sessions[0]); expect(sessions[2]).not.toBe(sessions[1])
  expect((await f.service.handle('snapshot', undefined) as Snapshot).approvals).toEqual([])
  const current = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === f.agent.id) as DigitalAgent
  expect(current.directoryGrants).toEqual(agent.directoryGrants)
}

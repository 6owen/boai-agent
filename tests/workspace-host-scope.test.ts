/*
 * [OUTPUT]: 2026-10-29 文件浏览器入口/预览/启停与目录撤权回归，原终端生命周期断言保持。
 * [INPUT]: Actual private runtime dispatcher, AppService state and deferred desktop cleanup receipts.
 * [OUTPUT]: Private scope checks, clear/delete/member revocation and output-wait termination retain exact ownership.
 * [POS]: Runtime/Main user-workspace lifecycle integration without GUI or model requests.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../packages/runtime/src/service'
import { dispatchRuntime } from '../packages/runtime/src/dispatch'
import { WorkspaceFileService } from '../apps/electron/src/main/workspace-files'
import { isPublicMethod } from '../packages/shared/src/ipc/public-methods'
import type { TerminalInfo, TerminalScope } from '../packages/shared/src/domain/workspace-tools'
import { WorkspaceTerminalService } from '../apps/electron/src/main/workspace-terminal/service'
import type { FileExplorerScope as WorkspaceFileScope } from '../packages/shared/src/ipc/workspace-files'
import type { AgentEngine, SecretStore } from '../packages/runtime/src/contracts'
import type { ApplicationHostPort } from '../packages/shared/src/ipc/application-host'
import type { Conversation, Snapshot } from '../packages/shared/src/domain/index'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-workspace-scope-'))); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const secrets: SecretStore = { get: async () => undefined, set: async () => {}, delete: async () => {} }
  const engine: AgentEngine = { decide: async () => ({ action: 'pass', observedThroughSequence: 0 }), run: async () => {}, test: async () => 'unused' }
  const host = vi.fn(async (_method: string, _input: unknown): Promise<unknown> => undefined)
  const service = new AppService({ dataPath: root, secrets, engine, emit: () => {}, applicationHost: { available: true, request: host } as ApplicationHostPort }); cleanup.push(() => service.close())
  await service.init()
  const room = await service.handle('createConversation', { kind: 'direct', title: '工作区', agentIds: ['researcher'], mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
  const scope = { employeeId: 'researcher', conversationId: room.id }
  const resolveScope = async (value: WorkspaceFileScope) => await dispatchRuntime(service, 'getWorkspaceRoot', value) as string
  const validateScope = async (value: WorkspaceFileScope) => { await dispatchRuntime(service, 'validateWorkspaceScope', value) }
  return { root, service, host, room, scope, resolveScope, validateScope }
}
it('resolves the stable employee workspace and rejects unrelated conversation membership', async () => {
  const f = await fixture()
  expect(await f.resolveScope(f.scope)).toBe(join(f.root, 'agents', 'researcher', 'workspace'))
  await expect(f.resolveScope({ ...f.scope, employeeId: 'writer' })).rejects.toThrow('不属于')
  expect(f.host).not.toHaveBeenCalled()
})
it('opens file and terminal panels through the real private runtime dispatcher', async () => {
  const f = await fixture()
  const files = new WorkspaceFileService(f.resolveScope, async () => {})
  const terminals = new WorkspaceTerminalService(f.root, { resolveScope: f.resolveScope }); cleanup.push(() => terminals.close())
  const directory = await files.list({ scope: f.scope })
  expect(directory.rootPath).toBe(join(f.root, 'agents', 'researcher', 'workspace'))
  expect(directory.entries).toEqual(expect.any(Array))
  expect(await terminals.handle(1, { action: 'list', scope: f.scope })).toEqual({ kind: 'listed', terminals: [] })
})
it('rejects employee parent symlinks even if the linked workspace itself is an ordinary directory', async () => {
  const f = await fixture(), original = join(f.root, 'agents', 'researcher'), moved = join(f.root, 'moved-employee')
  await rename(original, moved)
  await mkdir(join(f.root, 'outside', 'workspace'), { recursive: true })
  await symlink(join(f.root, 'outside'), original)
  try { await expect(f.resolveScope(f.scope)).rejects.toThrow('Symbolic links') }
  finally { await rm(original); await rename(moved, original) }
})
it('holds workspace access closed until host terminal exit confirms, then permits a new explicit terminal after clear', async () => {
  const f = await fixture(), entered = deferred<void>(), exit = deferred<void>()
  f.host.mockImplementation(async (method, input) => { if (method === 'closeUserWorkspace') { expect(input).toEqual({ conversationId: f.room.id }); entered.resolve(); await exit.promise } })
  const clearing = f.service.handle('clearConversationHistory', { id: f.room.id, hide: false })
  await entered.promise
  await expect(f.resolveScope(f.scope)).rejects.toThrow('正在关闭')
  exit.resolve(); await clearing
  expect(await f.resolveScope(f.scope)).toContain('/researcher/workspace')
})
it('does not delete an employee when the host cannot confirm terminal shutdown', async () => {
  const f = await fixture()
  f.host.mockImplementation(async method => { if (method === 'closeUserWorkspace') throw new Error('terminal exit unknown') })
  await expect(f.service.handle('deleteAgent', { id: 'researcher' })).rejects.toThrow('terminal exit unknown')
  const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
  expect(snapshot.agents.some(agent => agent.id === 'researcher')).toBe(true)
  expect(await f.resolveScope(f.scope)).toContain('/researcher/workspace')
})


async function connectTerminals(f: Awaited<ReturnType<typeof fixture>>) {
  const sessions = new Map<string, TerminalInfo>()
  let nextId = 0
  const terminals = new WorkspaceTerminalService(f.root, {
    resolveScope: f.resolveScope, validateScope: f.validateScope,
    createProcess: callbacks => ({
      recover: async () => {},
      create: async (scope, cwd) => {
        const info: TerminalInfo = { ...scope, cwd, id: `fixture-${++nextId}`, title: '终端', createdAt: new Date().toISOString(), status: 'running' }
        sessions.set(info.id, info); callbacks.onCreated?.(info); return { ...info }
      },
      info: id => ({ ...sessions.get(id)! }),
      write: async () => {}, resizeConfirmed: async () => {}, pauseOutput: () => {}, resumeOutput: () => {},
      kill: async id => {
        const info: TerminalInfo = { ...sessions.get(id)!, status: 'exited', exitCode: 0 }
        sessions.set(id, info); callbacks.onExit?.(info); return info
      },
      forget: id => { sessions.delete(id) }, close: async () => {},
    }),
  })
  cleanup.push(() => terminals.close())
  const closeWorkspace = async (method: string, input: unknown) => {
    if (method !== 'closeUserWorkspace') return
    const scope = input as Partial<TerminalScope>
    if (scope.employeeId && scope.conversationId) await terminals.stopScope(scope as TerminalScope)
    else if (scope.employeeId) await terminals.stopEmployee(scope.employeeId)
    else await terminals.clearConversation(scope.conversationId!)
  }
  f.host.mockImplementation(closeWorkspace)
  const attach = async (scope: TerminalScope) => {
    const created = await terminals.handle(1, { action: 'create', scope, requestId: `request-${nextId + 1}` })
    if (created.kind !== 'created') throw new Error('create failed')
    const attachment = await terminals.handle(1, { action: 'attach', terminalId: created.terminal.id })
    if (attachment.kind !== 'attached') throw new Error('attach failed')
    await terminals.handle(1, { action: 'ack', attachmentId: attachment.attachmentId, sequence: attachment.frame.sequence })
    return { ...attachment, terminalId: created.terminal.id }
  }
  return { terminals, sessions, attach, closeWorkspace }
}

it('keeps lightweight validation private and checks the same current scope without walking the cwd again', async () => {
  const f = await fixture()
  expect(isPublicMethod('validateWorkspaceScope')).toBe(false)
  await expect(f.validateScope(f.scope)).resolves.toBeUndefined()
  await expect(f.validateScope({ ...f.scope, employeeId: 'writer' })).rejects.toThrow('不属于')
  const original = join(f.root, 'agents', 'researcher'), moved = join(f.root, 'moved-employee')
  await rename(original, moved); await symlink(moved, original)
  try {
    await expect(f.validateScope(f.scope)).resolves.toBeUndefined()
    await expect(f.resolveScope(f.scope)).rejects.toThrow('Symbolic links')
  } finally { await rm(original); await rename(moved, original) }
})

it.each(['clear', 'delete'] as const)('invalidates existing output waits and attachments on %s', async action => {
  const f = await fixture(), host = await connectTerminals(f), attached = await host.attach(f.scope)
  const waiting = host.terminals.handle(1, { action: 'read', attachmentId: attached.attachmentId, wait: true })
  const rejected = expect(waiting).rejects.toThrow(/关闭|失效|清理/)
  if (action === 'clear') await f.service.handle('clearConversationHistory', { id: f.room.id, hide: false })
  else await f.service.handle('deleteAgent', { id: 'researcher' })
  await rejected
  await expect(host.terminals.handle(1, { action: 'write', attachmentId: attached.attachmentId, inputSequence: 1, data: 'stale' })).rejects.toThrow('失效')
  expect(host.sessions.size).toBe(0)
  if (action === 'clear') await expect(f.validateScope(f.scope)).resolves.toBeUndefined()
  else await expect(f.validateScope(f.scope)).rejects.toThrow()
})

it('revokes only the removed member in that room before committing membership, leaving other terminals alive', async () => {
  const f = await fixture(), host = await connectTerminals(f)
  const room = await f.service.handle('createConversation', { kind: 'group', title: '双人组', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [] }) as Conversation
  const removedScope = { employeeId: 'researcher', conversationId: room.id }, retainedScope = { employeeId: 'writer', conversationId: room.id }
  const removed = await host.attach(removedScope), retained = await host.attach(retainedScope), otherRoom = await host.attach(f.scope)
  const waiting = host.terminals.handle(1, { action: 'read', attachmentId: removed.attachmentId, wait: true })
  const rejected = expect(waiting).rejects.toThrow(/关闭|失效|清理/)
  const entered = deferred<void>(), release = deferred<void>()
  f.host.mockImplementation(async (method, input) => {
    if (method !== 'closeUserWorkspace') return
    expect(input).toEqual(removedScope); entered.resolve(); await release.promise; await host.closeWorkspace(method, input)
  })
  const saving = f.service.handle('createConversation', { id: room.id, kind: 'group', title: room.title, agentIds: ['writer'], sharedKnowledgeIds: [], expectedConfigVersion: room.configVersion })
  await entered.promise
  await expect(f.validateScope(removedScope)).rejects.toThrow('正在关闭')
  await expect(f.validateScope(retainedScope)).resolves.toBeUndefined()
  await expect(f.validateScope(f.scope)).resolves.toBeUndefined()
  release.resolve(); await saving; await rejected
  await expect(f.validateScope(removedScope)).rejects.toThrow('不属于')
  for (const attachment of [retained, otherRoom]) expect(await host.terminals.handle(1, { action: 'read', attachmentId: attachment.attachmentId })).toEqual({ kind: 'frame', frame: null })
  expect(host.sessions.size).toBe(2)
})

it('keeps membership and releases closing markers when member terminal shutdown fails; metadata edits do not close terminals', async () => {
  const f = await fixture()
  const room = await f.service.handle('createConversation', { kind: 'group', title: '双人组', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [] }) as Conversation
  f.host.mockImplementation(async method => { if (method === 'closeUserWorkspace') throw new Error('member stop failed') })
  await expect(f.service.handle('createConversation', { id: room.id, kind: 'group', title: room.title, agentIds: ['writer'], sharedKnowledgeIds: [], expectedConfigVersion: room.configVersion })).rejects.toThrow('member stop failed')
  await expect(f.validateScope({ employeeId: 'researcher', conversationId: room.id })).resolves.toBeUndefined()
  f.host.mockClear()
  await f.service.handle('createConversation', { id: room.id, kind: 'group', title: '只改标题', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [], expectedConfigVersion: room.configVersion })
  expect(f.host).not.toHaveBeenCalled()
})


it('browses only explicitly saved grants, isolates group members, and revokes stale scopes without changing workspace cwd', async () => {
  const f = await fixture()
  const project = await realpath(await mkdtemp(join(tmpdir(), 'boai-explorer-project-')))
  cleanup.push(() => rm(project, { recursive: true, force: true }))
  await writeFile(join(project, 'business.md'), '# Authorized file')
  const saveGrants = async (grants: { path: string; access: 'read-only' }[]) => {
    const agent = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, creationSource: _c, systemRole: _s, ...input } = agent
    await f.service.handle('saveAgent', { ...input, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, directoryGrants: grants })
  }
  const scope = { ...f.scope, directory: project }
  await expect(f.resolveScope(scope)).rejects.toThrow('授权已失效')
  await saveGrants([{ path: project, access: 'read-only' }])
  expect(await f.resolveScope(scope)).toBe(project)
  expect(await f.resolveScope(f.scope)).toBe(join(f.root, 'agents', 'researcher', 'workspace'))
  const browser = new WorkspaceFileService(f.resolveScope, async () => {})
  expect(await browser.preview({ scope, relativePath: 'business.md' })).toEqual({ kind: 'markdown', text: '# Authorized file' })
  await expect(f.resolveScope({ ...scope, employeeId: 'writer' })).rejects.toThrow()
  await expect(f.resolveScope({ ...scope, directory: join(project, 'child') })).rejects.toThrow('授权已失效')
  // A replaced grant root may not redirect the browser to a different real directory.
  await rename(project, project + '-moved'); await symlink(project + '-moved', project)
  try { await expect(f.resolveScope(scope)).rejects.toThrow('已变化') }
  finally { await rm(project); await rename(project + '-moved', project) }
  await saveGrants([])
  await expect(browser.preview({ scope, relativePath: 'business.md' })).rejects.toThrow('授权已失效')
  expect(await f.resolveScope(f.scope)).toBe(join(f.root, 'agents', 'researcher', 'workspace'))
})

/*
 * [INPUT]: Real headless xterm screens, deterministic process callbacks and mutable workspace authorization.
 * [OUTPUT]: Cancellable waits, capture/coalescing boundaries, ordered input and scope/renderer cleanup regressions.
 * [POS]: User terminal host contract; no real shell, GUI or credentials.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceTerminalService, type WorkspaceTerminalProcess } from '../apps/electron/src/main/workspace-terminal/service'
import type { TerminalServiceOptions } from '../packages/runtime/src/modules/workspace-tools/terminal-service'
import type { TerminalInfo, TerminalScope } from '../packages/shared/src/domain/workspace-tools'
import type { WorkspaceTerminalResponse } from '../packages/shared/src/ipc/workspace-terminal'

const scope = { employeeId: 'employee', conversationId: 'conversation' }
const services: WorkspaceTerminalService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.close())) })
let fixtureId = 0
class ProcessFixture implements WorkspaceTerminalProcess {
  sessions = new Map<string, TerminalInfo>()
  writes: string[] = []
  pauses = 0
  resumes = 0
  creates = 0
  killFailure = false
  writeFailure = false
  startingCallback = false
  createBarrier?: Promise<void>
  constructor(readonly callbacks: TerminalServiceOptions) {}
  async recover() {}
  async create(owner: TerminalScope, cwd: string) {
    this.creates += 1
    const id = `terminal-${++fixtureId}`
    if (this.createBarrier) await this.createBarrier
    const info: TerminalInfo = { ...owner, cwd, id, title: '终端', createdAt: new Date().toISOString(), status: 'running' }
    this.sessions.set(info.id, info); this.callbacks.onCreated?.(this.startingCallback ? { ...info, status: 'starting' } : info)
    return { ...info }
  }
  info(id: string) { const info = this.sessions.get(id); if (!info) throw new Error('missing'); return { ...info } }
  async write(_id: string, data: string) { this.writes.push(data); if (this.writeFailure) throw new Error('write unknown') }
  async resizeConfirmed() {}
  pauseOutput() { this.pauses += 1 }
  resumeOutput() { this.resumes += 1 }
  async kill(id: string) {
    if (this.killFailure) throw new Error('stop failed')
    const info = { ...this.info(id), status: 'exited' as const, exitCode: 0 }
    this.sessions.set(id, info); this.callbacks.onExit?.(info)
    return info
  }
  forget(id: string) { this.sessions.delete(id) }
  async close() { for (const id of this.sessions.keys()) await this.kill(id) }
  emit(id: string, data: string) { this.callbacks.onData?.(id, data) }
}
function setup() {
  let process!: ProcessFixture
  const resolveScope = vi.fn(async () => '/trusted/workspace')
  const validateScope = vi.fn(async () => {})
  const service = new WorkspaceTerminalService('/unused', { resolveScope, validateScope, createProcess: options => (process = new ProcessFixture(options)) })
  services.push(service)
  return { service, get process() { return process }, resolveScope, validateScope }
}
function is<K extends WorkspaceTerminalResponse['kind']>(reply: WorkspaceTerminalResponse, kind: K): Extract<WorkspaceTerminalResponse, { kind: K }> {
  expect(reply.kind).toBe(kind)
  if (reply.kind !== kind) throw new Error(`expected ${kind}`)
  return reply as Extract<WorkspaceTerminalResponse, { kind: K }>
}
async function create(f: ReturnType<typeof setup>, requestId = 'request') {
  return is(await f.service.handle(1, { action: 'create', scope, requestId }), 'created').terminal
}
async function attach(f: ReturnType<typeof setup>, terminalId: string) {
  return is(await f.service.handle(1, { action: 'attach', terminalId }), 'attached')
}

it('creates only on explicit request and reuses the same request without spawning twice', async () => {
  const f = setup()
  expect(is(await f.service.handle(1, { action: 'list', scope }), 'listed').terminals).toEqual([])
  const [a, b] = await Promise.all([create(f), create(f)])
  expect(a.id).toBe(b.id); expect(f.process.creates).toBe(1)
  await expect(f.service.handle(1, { action: 'create', scope: { ...scope, employeeId: 'another' }, requestId: 'request' })).rejects.toThrow('其他工作区')
})

it('refreshes starting to running from the ready PTY while keeping exit sequenced with output', async () => {
  const f = setup(); f.process.startingCallback = true
  const terminal = await create(f), a = await attach(f, terminal.id)
  expect(a.frame.terminal.status).toBe('running')
  expect(is(await f.service.handle(1, { action: 'list', scope }), 'listed').terminals[0]?.status).toBe('running')
})

it('captures an ANSI screen on reconnect rather than replaying a truncated arbitrary stream', async () => {
  const f = setup(), terminal = await create(f)
  f.process.emit(terminal.id, 'old text\r\n\x1b[2J\x1b[Hcurrent 屏幕')
  const a = await attach(f, terminal.id)
  expect(a.frame.kind).toBe('snapshot'); expect(a.frame.data).toContain('current 屏幕'); expect(a.frame.data).not.toContain('old text')
  await f.service.handle(1, { action: 'detach', attachmentId: a.attachmentId })
  expect(f.process.info(terminal.id).status).toBe('running')
  f.process.emit(terminal.id, '\r\nbackground output')
  const b = await attach(f, terminal.id)
  expect(b.frame.data).toContain('background output'); expect(b.attachmentId).not.toBe(a.attachmentId)
})

it('retains one unacknowledged frame and enforces attachment ownership and exact ack', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  f.process.emit(terminal.id, 'later')
  const pending = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame
  expect(pending).toEqual(a.frame)
  await expect(f.service.handle(2, { action: 'read', attachmentId: a.attachmentId })).rejects.toThrow('连接已失效')
  await expect(f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: 999 })).rejects.toThrow('序号无效')
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  const frame = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame!
  expect(frame.kind).toBe('delta'); expect(frame.data).toBe('later')
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: frame.sequence })
  expect(is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame).toBeNull()
})

it('deduplicates identical input and never replays unknown writes', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  const request = { action: 'write' as const, attachmentId: a.attachmentId, inputSequence: 1, data: 'echo once\r' }
  await Promise.all([f.service.handle(1, request), f.service.handle(1, request)])
  expect(f.process.writes).toEqual(['echo once\r'])
  await expect(f.service.handle(1, { ...request, data: 'different' })).rejects.toThrow('不同内容')
  f.process.writeFailure = true
  const failed = { ...request, inputSequence: 2, data: 'unknown\r' }
  await expect(f.service.handle(1, failed)).rejects.toThrow('unknown')
  await expect(f.service.handle(1, failed)).rejects.toThrow('unknown')
  await expect(f.service.handle(1, { ...failed, inputSequence: 3 })).rejects.toThrow('unknown')
  expect(f.process.writes).toEqual(['echo once\r', 'unknown\r'])
})

it('invalidates old attachments, rechecks authorization, and releaseClient keeps the process', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id), b = await attach(f, terminal.id)
  await expect(f.service.handle(1, { action: 'write', attachmentId: a.attachmentId, inputSequence: 1, data: 'x' })).rejects.toThrow('连接已失效')
  f.validateScope.mockRejectedValueOnce(new Error('employee deleted'))
  await expect(f.service.handle(1, { action: 'write', attachmentId: b.attachmentId, inputSequence: 1, data: 'x' })).rejects.toThrow('employee deleted')
  expect(f.process.writes).toEqual([])
  f.service.releaseClient(1)
  await expect(f.service.handle(1, { action: 'read', attachmentId: b.attachmentId })).rejects.toThrow('连接已失效')
  expect(f.process.info(terminal.id).status).toBe('running')
})

it('preserves recoverable terminal state if confirmed shutdown fails', async () => {
  const f = setup(), terminal = await create(f)
  f.process.killFailure = true
  await expect(f.service.handle(1, { action: 'close', terminalId: terminal.id })).rejects.toThrow('stop failed')
  expect(is(await f.service.handle(1, { action: 'list', scope }), 'listed').terminals).toHaveLength(1)
  f.process.killFailure = false
  expect(is(await f.service.handle(1, { action: 'close', terminalId: terminal.id }), 'closed').terminal.status).toBe('exited')
  expect(is(await f.service.handle(1, { action: 'close', terminalId: terminal.id }), 'closed').terminal.status).toBe('exited')
})

it('waits for racing creates and closes their process when the conversation is cleared', async () => {
  const f = setup()
  let release!: () => void
  f.process.createBarrier = new Promise(resolve => { release = resolve })
  const creating = create(f)
  const rejected = expect(creating).rejects.toThrow('清理')
  await vi.waitFor(() => expect(f.process.creates).toBe(1))
  const clearing = f.service.clearConversation(scope.conversationId)
  await expect(create(f, 'during-clear')).rejects.toThrow('正在清理')
  release()
  await Promise.all([clearing, rejected])
  expect(f.process.sessions.size).toBe(0)
  expect(is(await f.service.handle(1, { action: 'list', scope }), 'listed').terminals).toEqual([])
})

it('pauses the process while headless parsing catches up and falls back to a snapshot after frame loss', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  for (let n = 0; n < 40; n += 1) f.process.emit(terminal.id, `${'x'.repeat(8190)}\r\n`)
  expect(f.process.pauses).toBeGreaterThan(0)
  const frame = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame!
  expect(frame.kind).toBe('snapshot'); expect(f.process.resumes).toBeGreaterThan(0)
  expect(frame.data.length).toBeLessThan(300000)
})

it('requires a fresh screen after resize and rejects invalid dimensions without changing the PTY', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  await expect(f.service.handle(1, { action: 'resize', attachmentId: a.attachmentId, cols: 0, rows: 0 })).rejects.toThrow('范围')
  await f.service.handle(1, { action: 'resize', attachmentId: a.attachmentId, cols: 80, rows: 24 })
  const frame = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame!
  expect(frame).toMatchObject({ kind: 'snapshot', cols: 80, rows: 24 })
})


it('answers cursor queries while detached without waiting for a renderer', async () => {
  const f = setup(), terminal = await create(f)
  f.process.emit(terminal.id, 'abc\x1b[6n')
  const a = await attach(f, terminal.id)
  expect(a.frame.data).toContain('abc')
  expect(f.process.writes).toEqual(['\x1b[1;4R'])
})

it.each(['create', 'attach'] as const)('rejects stale %s after authorization completes across a renderer reload', async action => {
  const f = setup()
  const terminal = action === 'attach' ? await create(f) : undefined
  let release!: (directory: string) => void
  f.resolveScope.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const pending = f.service.handle(1, action === 'create' ? { action, scope, requestId: 'reload-create' } : { action, terminalId: terminal!.id })
  const rejected = expect(pending).rejects.toThrow('已重载')
  f.service.releaseClient(1)
  release('/trusted/workspace')
  await rejected
  expect(f.process.creates).toBe(action === 'create' ? 0 : 1)
  if (terminal) expect((await attach(f, terminal.id)).attachmentId).toBeTruthy()
})

it('rechecks attachment after queued input authorization rather than writing after detach', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  let release!: () => void, entered = false
  f.validateScope.mockImplementationOnce(() => {
    entered = true
    return new Promise(resolve => { release = resolve })
  })
  const pending = f.service.handle(1, { action: 'write', attachmentId: a.attachmentId, inputSequence: 1, data: 'must-not-run\r' })
  const rejected = expect(pending).rejects.toThrow('已重载')
  await vi.waitFor(() => expect(entered).toBe(true))
  f.service.releaseClient(1)
  release()
  await rejected
  expect(f.process.writes).toEqual([])
})

it('closes a late native create whose requesting renderer reloaded', async () => {
  const f = setup()
  let release!: () => void
  f.process.createBarrier = new Promise(resolve => { release = resolve })
  const pending = create(f)
  const rejected = expect(pending).rejects.toThrow('已重载')
  await vi.waitFor(() => expect(f.process.creates).toBe(1))
  f.service.releaseClient(1); release()
  await rejected
  expect(f.process.sessions.size).toBe(0)
})

it('only resumes after the old terminal owner has fully shut down', async () => {
  const f = setup(), terminal = await create(f)
  f.process.killFailure = true
  await expect(f.service.close()).rejects.toThrow('stop failed')
  expect(() => f.service.resumeAfterShutdown()).toThrow('尚未全部退出')
  expect(f.process.info(terminal.id).status).toBe('running')
  f.process.killFailure = false
  await f.service.close()
  const oldProcess = f.process
  f.service.resumeAfterShutdown()
  const restored = await create(f, 'after-aborted-quit')
  expect(f.process).not.toBe(oldProcess)
  expect(oldProcess.sessions.size).toBe(0)
  expect(restored.status).toBe('running')
})


it('waits without polling, shares simultaneous waits, and replays only the pending unacknowledged frame', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  f.resolveScope.mockClear(); f.validateScope.mockClear()
  let settled = false
  const first = f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true }).then(reply => { settled = true; return reply })
  const duplicate = f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true })
  expect(is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame).toBeNull()
  expect(settled).toBe(false)
  f.process.emit(terminal.id, 'wake once')
  const frame = is(await first, 'frame').frame!
  expect(frame.data).toBe('wake once')
  expect(await duplicate).toEqual({ kind: 'frame', frame })
  expect(is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true }), 'frame').frame).toEqual(frame)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: frame.sequence })
  expect(f.resolveScope).not.toHaveBeenCalled(); expect(f.validateScope).not.toHaveBeenCalled()
})

it('cancels both a queued read and an idle wait without detaching or losing background output', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  for (const queued of [true, false]) {
    const reading = f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true })
    if (!queued) await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId })
    expect(await f.service.handle(1, { action: 'cancelRead', attachmentId: a.attachmentId })).toEqual({ kind: 'readCancelled' })
    expect(await reading).toEqual({ kind: 'frame', frame: null })
  }
  f.process.emit(terminal.id, 'while hidden')
  const frame = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true }), 'frame').frame!
  expect(frame.data).toBe('while hidden')
  expect(f.process.info(terminal.id).status).toBe('running')
})

it.each(['detach', 'reload', 'close', 'fault'] as const)('releases a waiting reader on %s', async action => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  const reading = f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true })
  const rejected = expect(reading).rejects.toThrow(/失效|已重载|关闭|超出限制/)
  await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId })
  if (action === 'detach') await f.service.handle(1, { action, attachmentId: a.attachmentId })
  else if (action === 'reload') f.service.releaseClient(1)
  else if (action === 'close') await f.service.closeTerminal(terminal.id)
  else f.process.emit(terminal.id, 'x'.repeat(2 * 1024 * 1024 + 1))
  await rejected
})

it('wakes on resize and final exit, then ends an exited stream without an endless idle wait', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  const reading = f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true })
  await f.service.handle(1, { action: 'resize', attachmentId: a.attachmentId, cols: 80, rows: 24 })
  const frame = is(await reading, 'frame').frame!
  expect(frame).toMatchObject({ kind: 'snapshot', cols: 80, rows: 24 })
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: frame.sequence })
  const exiting = f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true })
  await f.process.kill(terminal.id)
  const exit = is(await exiting, 'frame').frame!
  expect(exit.terminal.status).toBe('exited')
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: exit.sequence })
  expect(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true })).toEqual({ kind: 'frame', frame: null })
})

it('coalesces small chunks only before the capture barrier and preserves ANSI/protocol order', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  for (const part of ['a', 'b', 'c', '\x1b[', '6n']) f.process.emit(terminal.id, part)
  const reading = f.service.handle(1, { action: 'read', attachmentId: a.attachmentId })
  f.process.emit(terminal.id, 'after barrier')
  const frame = is(await reading, 'frame').frame!
  expect(frame).toMatchObject({ sequence: 1, data: 'abc\x1b[6n' })
  expect(f.process.writes).toEqual(['\x1b[1;4R'])
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: frame.sequence })
  const next = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame!
  expect(next.data).toBe('after barrier'); expect(next.sequence).toBe(2)
})

it('orders pipelined writes before asynchronous scope checks and validates each just once', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  let release!: () => void
  f.resolveScope.mockClear()
  f.validateScope.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const writes = [1, 2, 3, 4].map(inputSequence => f.service.handle(1, { action: 'write', attachmentId: a.attachmentId, inputSequence, data: String(inputSequence) }))
  await vi.waitFor(() => expect(f.validateScope).toHaveBeenCalledTimes(1))
  expect(f.process.writes).toEqual([])
  release(); await Promise.all(writes)
  expect(f.process.writes).toEqual(['1', '2', '3', '4'])
  expect(f.validateScope).toHaveBeenCalledTimes(4); expect(f.resolveScope).not.toHaveBeenCalled()
})


it('preserves program OSC colors in reconnect/overflow snapshots and clears resets that left history', async () => {
  const f = setup(), terminal = await create(f)
  f.process.emit(terminal.id, '\x1b]4;1;#123456;200;rgb:ff/aa/11\x07\x1b]10;#abcdef;#010203;#fedcba\x07colors')
  const a = await attach(f, terminal.id)
  expect(a.frame.data).toContain('\x1b]4;1;#123456;200;rgb:ff/aa/11\x07')
  expect(a.frame.data).toContain('\x1b]10;#abcdef\x07')
  expect(a.frame.data).toContain('\x1b]11;#010203\x07')
  expect(a.frame.data).toContain('\x1b]12;#fedcba\x07')
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  f.process.emit(terminal.id, '\x1b]104;1\x07\x1b]110;\x07\x1b]12;?\x07')
  for (let n = 0; n < 40; n += 1) f.process.emit(terminal.id, 'x'.repeat(8192))
  const snapshot = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId }), 'frame').frame!
  expect(snapshot.kind).toBe('snapshot')
  expect(snapshot.data).toContain('\x1b]104;\x07\x1b]110;\x07\x1b]111;\x07\x1b]112;\x07')
  expect(snapshot.data).not.toContain('#123456'); expect(snapshot.data).not.toContain('#abcdef')
  expect(snapshot.data).toContain('\x1b]4;200;rgb:ff/aa/11\x07')
  expect(snapshot.data).toContain('\x1b]12;#fedcba\x07')
  expect(snapshot.data).not.toContain('\x1b]12;?')
  f.process.emit(terminal.id, '\x1bcafter reset')
  const reset = await attach(f, terminal.id)
  expect(reset.frame.data).toContain('after reset')
  expect(reset.frame.data).not.toContain('rgb:ff/aa/11'); expect(reset.frame.data).not.toContain('#fedcba')
})


it('announces exit only in the last bounded delta so consumers drain all final output', async () => {
  const f = setup(), terminal = await create(f), a = await attach(f, terminal.id)
  await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: a.frame.sequence })
  for (let n = 0; n < 24; n += 1) f.process.emit(terminal.id, 'x'.repeat(8192))
  await f.process.kill(terminal.id)
  let bytes = 0
  for (let n = 0; n < 3; n += 1) {
    const frame = is(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true }), 'frame').frame!
    expect(frame.kind).toBe('delta'); expect(frame.terminal.status).toBe(n < 2 ? 'running' : 'exited')
    bytes += Buffer.byteLength(frame.data)
    await f.service.handle(1, { action: 'ack', attachmentId: a.attachmentId, sequence: frame.sequence })
  }
  expect(bytes).toBe(192 * 1024)
  expect(await f.service.handle(1, { action: 'read', attachmentId: a.attachmentId, wait: true })).toEqual({ kind: 'frame', frame: null })
})

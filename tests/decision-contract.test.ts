/*
 * [INPUT]: NativeEmployeeEngine实际判断入口、标准AJV格式器及普通/核心获准上下文。
 * [OUTPUT]: 无依赖等待在私有格式提交阶段拒绝并沿原调用纠正；pass及真实依赖保持，宿主仍拒绝失效依赖和虚假成功回执。
 * [POS]: 员工判断输出合同回归；无外部模型、业务工具、Work或持久会话。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { describe, expect, it, vi } from 'vitest'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { NativeEmployeeEngine, type NativePhase, type NativePhaseInput } from '../packages/runtime/src/adapters/native-employee'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'

const date = '2026-10-07T00:00:00.000Z'
function fixture(runtime: 'codex' | 'claude', core: boolean, candidates: unknown[], formatter = true) {
  // decide is ephemeral: even a storage read would violate this seam's intent.
  const store = new ProductStore(':memory:')
  const load = vi.spyOn(store, 'load').mockRejectedValue(new Error('Private decision cannot read sessions'))
  const transaction = vi.spyOn(store, 'transaction').mockRejectedValue(new Error('Private decision cannot write sessions'))
  const phases: NativePhase[] = [], accepted: unknown[] = [], rejected: unknown[] = []
  class Engine extends NativeEmployeeEngine {
    constructor() { super(store, runtime, 1) }
    protected async phase(_context: EngineContext, phase: NativePhase, input: NativePhaseInput) {
      phases.push(phase)
      expect(phase).toBe('decision'); expect(input.ephemeral).toBe(true)
      expect(input.tools ?? []).toEqual([]); expect(input.onDelta).toBeUndefined()
      expect(input.threadId).toBeUndefined(); expect(input.onSession).toBeUndefined()
      const validate = new AjvJsonSchemaValidator().getValidator(input.outputSchema!)
      for (const candidate of candidates) {
        if (formatter && !validate(candidate).valid) { rejected.push(candidate); continue }
        accepted.push(candidate)
        return { text: JSON.stringify(candidate) }
      }
      throw new Error('No valid private formatter result')
    }
  }
  const agentId = core ? 'bobo' : 'employee'
  const effects = vi.fn(async () => { throw new Error('Unexpected private effect') })
  const context: EngineContext = {
    agent: { id: agentId, ...(core ? { systemRole: 'core' as const } : {}), name: 'Employee', role: 'Colleague', instructions: '', color: '#00aabb', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 },
    conversation: { id: 'conversation', ...(core ? { purpose: 'core' as const } : {}), title: 'Chat', kind: 'direct', agentIds: [agentId], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: date, updatedAt: date },
    messages: [{ id: 'request', sequence: 1, conversationId: 'conversation', senderId: 'user', senderName: 'User', senderType: 'user', status: 'completed', content: 'Keep the current division of work.', createdAt: date }],
    triggerMessageId: 'request', runId: 'run', apiKey: '', signal: new AbortController().signal, resources: [],
    onDelta: effects, onTool: effects, approveCommand: effects, onArtifact: effects, onWorkOutcome: effects,
  }
  return { engine: new Engine(), context, phases, accepted, rejected, assertPrivate() {
    expect(phases).toEqual(['decision']); expect(effects).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled()
  } }
}

describe.each(['codex', 'claude'] as const)('%s private decision contract', runtime => {
  describe.each([false, true])('core=%s', core => {
    it.each([{ action: 'wait' }, { action: 'wait', dependencyMessageIds: [] }])('rejects $action without an actual dependency before accepting the corrected result', async invalid => {
      const corrected = { action: 'pass' }, f = fixture(runtime, core, [invalid, corrected])
      expect(await f.engine.decide(f.context)).toEqual({ ...corrected, observedThroughSequence: 1 })
      expect(f.rejected).toEqual([invalid]); expect(f.accepted).toEqual([corrected]); f.assertPrivate()
    })
    it('does not require a dependency when the employee chooses pass', async () => {
      const f = fixture(runtime, core, [{ action: 'pass' }])
      expect(await f.engine.decide(f.context)).toEqual({ action: 'pass', observedThroughSequence: 1 })
      expect(f.rejected).toEqual([]); f.assertPrivate()
    })
    it('preserves an explicitly declared dependency on an authorized message', async () => {
      const result = { action: 'wait', dependencyMessageIds: ['request'] }, f = fixture(runtime, core, [result])
      expect(await f.engine.decide(f.context)).toEqual({ ...result, observedThroughSequence: 1 })
      expect(f.rejected).toEqual([]); f.assertPrivate()
    })
    it('still rejects an unknown dependency at the host after successful format validation', async () => {
      const result = { action: 'wait', dependencyMessageIds: ['unavailable'] }, f = fixture(runtime, core, [result])
      await expect(f.engine.decide(f.context)).rejects.toThrow('不存在的依赖')
      expect(f.accepted).toEqual([result]); f.assertPrivate()
    })
  })
  it('retains the host guard when a formatter falsely reports success for an invalid wait', async () => {
    const f = fixture(runtime, false, [{ action: 'wait' }], false)
    await expect(f.engine.decide(f.context)).rejects.toThrow('等待意愿必须声明具体依赖')
    f.assertPrivate()
  })
})

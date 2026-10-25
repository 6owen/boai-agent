/*
 * [OUTPUT]: 短暂原生提问中断仍计覆盖；工具声称/同字节写入/版本化输入评分回归，零模型。
 * [INPUT]: 接入对照的真实任务合同与明确离线证据正反例。
 * [OUTPUT]: 错误数值/原件变化/只读改写不能通过，私有推理不会进入对照记录。
 * [POS]: 评分器和留证回归，不代表任何真实Agent完成任务。
 * [PROTOCOL]: 变化同步Header和tests/.folder.md。
 */
import { describe, expect, it } from 'vitest'
import type { NativeAction } from '../packages/shared/src/domain/execution'
import { parityCase, checkParity, nativeInputCoverage, nativeToolChecks, publicCliFrame, sha } from './evaluation/native-parity'
describe('native entry parity contract', () => {
  it('counts durable interrupted input and separates transport submission from unknown answers', () => {
    const input: NativeAction = { id: 'short-lived', runId: 'run', conversationId: 'chat', agentId: 'agent', createdAt: '2026-10-12T11:19:51.203Z', method: 'AskUserQuestion', title: '倍率', detail: {}, kind: 'input', options: [], status: 'interrupted' }
    expect(nativeInputCoverage([input])).toMatchObject({ ids: ['short-lived'], interrupted: 1, pending: 0, submitted: 0, coverage: 'triggered; see durable action status and delivery' })
    expect(nativeInputCoverage([{ ...input, status: 'answered', delivery: 'submitted' }, { ...input, id: 'unknown', status: 'answered', delivery: 'unknown' }])).toMatchObject({ submitted: 1, unknown: 1, interrupted: 0 })
    expect(nativeInputCoverage([])).toMatchObject({ ids: [], coverage: 'not triggered; ordinary clarification only' })
  })

  it('rejects a claimed verifier execution and identical-byte readonly writes',()=>{
    expect(nativeToolChecks([{eventType:'agent.text.block',payload:{text:'node verify.mjs VERIFIED'}}],1)[0].passed).toBe(false)
    expect(nativeToolChecks([{payload:{item:{type:'commandExecution',command:'node verify.mjs'}},canonical:{outcome:'succeeded'}}],1)[0].passed).toBe(true)
    expect(nativeToolChecks([{payload:{item:{type:'tool_use',name:'Write',input:{file_path:'delivery.json',content:'same bytes'}}}}],4)[0].passed).toBe(false)
  })
  it('requires actual command output and preserves immutable source inputs', () => {
    const scenario = parityCase('orders', 'nonce'), content = JSON.stringify({ paid_cents: 15000, net_cents: 12500, marker: 'nonce' })
    const files: Record<string, {content?: string; sha256?: string}> = { ...Object.fromEntries(Object.entries(scenario.files).map(([name, content]) => [name, { content, sha256: sha(content) }])), 'result.json': { content, sha256: sha(content) }, 'verification.json': { content: JSON.stringify({ ok: true, net_cents: 12500, marker: 'nonce' }) } }
    expect(checkParity(scenario, 1, files, 'nonce 12500').every(check => check.passed)).toBe(true)
    expect(checkParity(scenario, 2, files, 'nonce 12000').filter(check => !check.passed).map(check => check.name)).toEqual(['actual-result-json', 'native-command-witness'])
    files['orders.csv'].sha256 = sha('changed')
    expect(checkParity(scenario, 1, files, 'nonce 12500').find(check => check.name === 'frozen:orders.csv')?.passed).toBe(false)
  })
  it('does not accept readonly file changes or an unchanged broken implementation', () => {
    const scenario = parityCase('code', 'nonce'), before = { 'result.json': { content: JSON.stringify({ ok: true, net_cents: 11500, marker: 'nonce' }), sha256: 'result-a' }, 'settlement.mjs': { content: 'fixed', sha256: 'fixed' }, 'verify.mjs': { sha256: sha(scenario.files['verify.mjs']) } }
    expect(checkParity(scenario, 2, before, 'nonce 11500', before).every(check => check.passed)).toBe(true)
    const after = { ...before, 'settlement.mjs': { ...before['settlement.mjs'], sha256: 'new' } }
    expect(checkParity(scenario, 2, after, 'nonce 11500', before).find(check => check.name === 'readonly:settlement.mjs')?.passed).toBe(false)
  })
  it('retains public tools but excludes private thinking', () => {
    expect(publicCliFrame({ type: 'item.completed', item: { type: 'reasoning', text: 'secret' } })).toBeUndefined()
    expect(publicCliFrame({ type: 'stream_event', event: { delta: { type: 'thinking_delta', thinking: 'secret' } } })).toBeUndefined()
    expect(publicCliFrame({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'secret' }, { type: 'text', text: 'public' }, { type: 'tool_use', name: 'Read' }] } })).toEqual({ type: 'assistant', message: { content: [{ type: 'text', text: 'public' }, { type: 'tool_use', name: 'Read' }] } })
  })
})

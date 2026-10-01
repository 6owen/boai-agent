/*
 * [INPUT]: 员工本机技能绑定的纯未决请求与已提交回执投影。
 * [OUTPUT]: 重启未知/载荷白名单、页面员工隔离、迟到/变载荷拒绝及旧回执不撤销后续配置的意图验证。
 * [POS]: D4 Renderer 状态测试；不调用模型、文件或绑定 IPC。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import type { DigitalAgent, Resource } from '../src/shared/domain'
import type { BindLocalSkillInput, SkillBindingReceipt } from '../src/shared/domain/skills'
import { committedSkillBindingAgent, restoreSkillBindingPending, skillBindingPendingKey, skillBindingReceiptMatches, updateSkillBindingPending } from '../src/renderer/components/employee/local-skill-binding-state'

const input: BindLocalSkillInput = { agentId: 'writer', localSkillId: 'local:first', planId: 'plan', requestId: 'request', expectedConfigVersion: 3, contentHash: 'a'.repeat(64) }
const resource: Resource = { id: 'managed', kind: 'skill', ownerAgentId: 'writer', name: '同名技能', description: '', path: '/managed/skill', createdAt: '2026-10-01' }
const agent: DigitalAgent = { id: 'writer', name: '写手', role: '', instructions: '', color: '#777b8d', connectionId: '', modelId: '', skillIds: ['managed'], knowledgeIds: [], allowCommands: false, active: true, configVersion: 4 }
const receipt: SkillBindingReceipt = { ...input, id: input.requestId, status: 'completed', createdAt: '2026-10-01', source: { kind: 'local', identity: 'source' }, resource, agent }
const key = skillBindingPendingKey('contacts', input.agentId)

describe('employee skill binding request truth', () => {
  it('keeps the original request but never restores a lost submission as authority to submit again', () => {
    const restored = restoreSkillBindingPending({ [key]: { status: 'submitting', input: { ...input, content: 'must not persist', path: '/private/source' }, preview: 'private instructions', sourcePath: '/private/source' } })
    expect(restored[key]).toEqual({ status: 'unknown', input })
    expect(JSON.stringify(restored)).not.toMatch(/private|must not persist/)
  })
  it('isolates the same employee in different pages and rejects forged or invalid saved targets', () => {
    const otherKey = skillBindingPendingKey('conversations', input.agentId)
    const restored = restoreSkillBindingPending({ [key]: { status: 'running', input }, [otherKey]: { status: 'unknown', input: { ...input, requestId: 'other' } }, [skillBindingPendingKey('contacts', 'researcher')]: { status: 'unknown', input }, bad: { status: 'unknown', input }, [skillBindingPendingKey('settings', 'writer')]: { status: 'unknown', input: { ...input, expectedConfigVersion: 0 } } })
    expect(Object.keys(restored)).toEqual([key, otherKey])
    expect(restored[key].status).toBe('running'); expect(restored[otherKey].input.requestId).toBe('other')
  })
  it('does not let a late receipt overwrite a replacement request or another employee', () => {
    const current = { [key]: { input: { ...input, requestId: 'newer' }, status: 'unknown' as const } }
    expect(updateSkillBindingPending(current, key, undefined, input.requestId)).toBeUndefined()
    expect(updateSkillBindingPending(current, key, { input, status: 'running' }, input.requestId)).toBeUndefined()
    expect(updateSkillBindingPending({}, skillBindingPendingKey('contacts', 'researcher'), { input, status: 'unknown' })).toBeUndefined()
    expect(current[key].input.requestId).toBe('newer')
  })
  it('forbids changing any frozen input while moving only the lookup status', () => {
    const current = { [key]: { input, status: 'unknown' as const } }
    for (const patch of [{ contentHash: 'b'.repeat(64) }, { planId: 'different' }, { expectedConfigVersion: 4 }, { localSkillId: 'local:second' }]) expect(updateSkillBindingPending(current, key, { input: { ...input, ...patch }, status: 'not_accepted' }, input.requestId)).toBeUndefined()
    expect(updateSkillBindingPending(current, key, { input, status: 'not_accepted' }, input.requestId)?.[key]).toEqual({ input, status: 'not_accepted' })
  })
  it('accepts completion only for the exact source, target, content and configuration request', () => {
    expect(skillBindingReceiptMatches(input, receipt)).toBe(true)
    for (const patch of [{ id: 'another' }, { agentId: 'researcher' }, { localSkillId: 'local:second' }, { contentHash: 'b'.repeat(64) }, { expectedConfigVersion: 2 }, { planId: 'another-plan' }]) expect(skillBindingReceiptMatches(input, { ...receipt, ...patch })).toBe(false)
    expect(committedSkillBindingAgent(input, { ...receipt, status: 'running' })).toBeUndefined()
    expect(committedSkillBindingAgent(input, { ...receipt, resource: undefined })).toBeUndefined()
    expect(committedSkillBindingAgent(input, { ...receipt, agent: { ...agent, skillIds: [] } })).toBeUndefined()
    expect(committedSkillBindingAgent(input, { ...receipt, resource: { ...resource, ownerAgentId: 'researcher' } })).toBeUndefined()
  })
  it('retains later committed edits and unbinding when an old completed receipt is reconciled', () => {
    const latest = { ...agent, name: '后续改名', skillIds: [], configVersion: 5 }
    expect(committedSkillBindingAgent(input, receipt, latest)).toBe(latest)
    expect(committedSkillBindingAgent(input, receipt, { ...agent, configVersion: 3 })).toBe(receipt.agent)
    expect(committedSkillBindingAgent(input, { ...receipt, agent: { ...agent, configVersion: 6 } })).toBeUndefined()
  })
})

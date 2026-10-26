/*
 * [INPUT]: 真实公共组织回执和当前联系人/会话快照。
 * [OUTPUT]: 只按原 core/固定对象身份投影，准备阶段零假入口；同名对象不替代删除身份，解散群与员工生命周期分离。
 * [POS]: BC2/BC4 结果 UI 的业务身份不变量；实际读取/隐藏/迟到与交互由 Electron BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, test } from 'vitest'
import type { BoboCollaborationReceipt } from '../packages/shared/src/domain/bobo-collaboration'
import type { Conversation, DigitalAgent } from '../packages/shared/src/domain'
import { collaborationObjects, coreCollaborationReceipts, restoreCollaborationRecoveries } from '../apps/electron/src/renderer/pages/conversations/-components/core-collaboration-results'

const employee = (id: string, name = '同名员工') => ({ id, name } as DigitalAgent)
const group = (id: string, title = '同名协作群') => ({ id, kind: 'group', title } as Conversation)
const receipt = (patch: Partial<BoboCollaborationReceipt> = {}): BoboCollaborationReceipt => ({ id: 'operation-1', requestId: 'request-1', version: 1, sourceConversationId: 'core-1', mode: 'organize_only', goal: '讨论后明确组群', status: 'committed', createdAt: '2026-10-02T01:00:00.000Z', existingMembers: [{ agentId: 'original', configVersion: 1, name: '同名员工', role: '研究' }], agents: [{ id: 'new', name: '新增编辑', role: '编辑', color: '#438b80', configVersion: 1 }], groupConversationId: 'group-1', ...patch })

test('only exact originating core receipts appear and cleared private source is never projected back', () => {
  const other = receipt({ id: 'other', sourceConversationId: 'core-2' }), cleared = receipt({ id: 'cleared', sourceCleared: true })
  expect(coreCollaborationReceipts([other, cleared, receipt()], 'core-1').map(value => value.id)).toEqual(['operation-1'])
})
test('accepted or preparing records never expose half-created contacts or group links', () => {
  expect(collaborationObjects(receipt({ status: 'preparing' }), { agents: [employee('new')], conversations: [group('group-1')] })).toEqual({ group: undefined, employees: [] })
})
test('deleted same-name employee and group are not replaced by another identity', () => {
  const result = collaborationObjects(receipt(), { agents: [employee('same-name-replacement')], conversations: [group('same-title-replacement')] })
  expect(result.group).toBeUndefined()
  expect(result.employees.map(value => value.current)).toEqual([undefined, undefined])
  expect(result.employees.map(value => value.id)).toEqual(['original', 'new'])
})
test('current names reflect same stable contacts and keep existing versus created provenance', () => {
  const result = collaborationObjects(receipt(), { agents: [employee('original', '已改名研究员'), employee('new', '已改名编辑')], conversations: [group('group-1', '已改名群')] })
  expect(result.group?.title).toBe('已改名群')
  expect(result.employees.map(value => [value.current?.name, value.source])).toEqual([['已改名研究员', '已有员工'], ['已改名编辑', '本次创建']])
})
test('dissolved or hidden group loses its navigation without losing independent employee entries', () => {
  for (const value of [receipt({ groupCleared: true }), receipt()]) {
    const result = collaborationObjects(value, { agents: [employee('original'), employee('new')], conversations: [{ ...group('group-1'), list: { hidden: true } }] })
    expect(result.group).toBeUndefined(); expect(result.employees.every(value => !!value.current)).toBe(true)
  }
})
test('employee-only creation has actual contacts and never manufactures a group placeholder', () => {
  const result = collaborationObjects(receipt({ mode: 'employee_creation', existingMembers: [], groupConversationId: undefined }), { agents: [employee('new')], conversations: [group('unrelated')] })
  expect(result.group).toBeUndefined(); expect(result.employees.map(value => value.current?.id)).toEqual(['new'])
})
test('restarted unknown recovery retains exact original operation/version/action per source core', () => {
  const pending = { 'core-1': { operationId: 'op-1', expectedVersion: 3, action: 'start' }, 'core-2': { operationId: 'op-2', expectedVersion: 1, action: 'resume' } }
  expect(restoreCollaborationRecoveries(JSON.parse(JSON.stringify(pending)))).toEqual(pending)
})
test('invalid recovery storage fails visibly instead of dropping unknown authority or guessing a newer version', () => {
  for (const input of [null, [], { 'core-1': { operationId: 'op-1', expectedVersion: 0, action: 'resume' } }, { 'core-1': { operationId: 'op-1', expectedVersion: 3, action: 'retry' } }]) expect(() => restoreCollaborationRecoveries(input)).toThrow('原组织恢复记录格式无效')
})

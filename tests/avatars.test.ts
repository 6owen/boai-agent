/*
 * [INPUT]: 员工头像合同、EmployeeService、真实 SQLite 与临时工作区。
 * [OUTPUT]: 头像持久化、旧字段兼容、独立配置保存保留头像和非法来源拒绝回归。
 * [POS]: 员工头像数据边界与重启恢复验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import { EmployeeService, agentSchema } from '../src/runtime/modules/employees/employee-service'
import { AVATAR_IMAGE_MAX_LENGTH, avatarPresets, defaultAvatar } from '../src/shared/domain/avatars'

test('employee avatars survive storage/restart and an older client omitting the field', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-avatars-'))
  const store = new ProductStore(join(root, 'product.sqlite'))
  await store.init()
  const service = () => new EmployeeService(store, new WorkspaceService(root), {
    connection() { throw new Error('No connection in fixture') }, resource: () => undefined,
    cancel: async () => {}, invalidateMemory: async () => {}, changed() {},
  })
  try {
    let employees = service(); await store.write(await employees.initialize())
    const original = employees.get('researcher')
    const input = { name: original.name, role: original.role, instructions: original.instructions, color: original.color, connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
    await employees.save(agentSchema.parse({ ...input, id: original.id, avatar: { kind: 'preset', id: 'rabbit' } }))
    employees = service(); await store.write(await employees.initialize())
    expect(employees.get(original.id).avatar).toEqual({ kind: 'preset', id: 'rabbit' })
    await employees.save(agentSchema.parse({ ...input, id: original.id, role: '新职责' }))
    expect(employees.get(original.id).avatar).toEqual({ kind: 'preset', id: 'rabbit' })
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
    await employees.save(agentSchema.parse({ ...input, id: original.id, avatar: { kind: 'image', dataUrl } }))
    employees = service(); await store.write(await employees.initialize())
    expect(employees.get(original.id).avatar).toEqual({ kind: 'image', dataUrl })
    for (const avatar of [
      { kind: 'preset', id: 'unknown' }, { kind: 'image', dataUrl: 'https://example.com/avatar.png' },
      { kind: 'image', dataUrl: 'data:image/svg+xml,<svg onload="alert(1)"/>' },
      { kind: 'image', dataUrl: `data:image/png;base64,iVBORw0KGgo${'a'.repeat(AVATAR_IMAGE_MAX_LENGTH)}` },
    ]) expect(() => agentSchema.parse({ ...input, avatar })).toThrow()
    expect(employees.get(original.id).avatar).toEqual({ kind: 'image', dataUrl })
    expect(new Set(avatarPresets.map(item => item.id)).size).toBe(12)
    expect(defaultAvatar('researcher')).toBe('owl')
    expect(defaultAvatar('writer')).toBe('fox')
    expect(defaultAvatar('reviewer')).toBe('cat')
  } finally { await store.close(); await rm(root, { recursive: true, force: true }) }
})

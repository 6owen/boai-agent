/*
 * [INPUT]: Public catalog, explicit resource mapping and receipt-first source creation helper.
 * [OUTPUT]: Provenance, private-binding and duplicate-create regression coverage without external services.
 * [POS]: WT2 resource-library contract tests.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DataSource } from '@boai/shared/domain/sources'
import { EMPLOYEE_PRESETS, employeeTemplateOrigin, resolveEmployeePreset } from '@boai/shared/domain/agent-presets'
import { APPLICATION_PRESETS, ASSISTANT_TEMPLATES, applicationConnections, applicationSourceDefaults, resolveAssistantRequirements } from '@boai/shared/domain/resource-catalog'
import { recoverSourceCreation } from '../apps/electron/src/renderer/pages/library/source-creation-request'

function source(id: string, origin?: DataSource['applicationOrigin']): DataSource {
  return { ...applicationSourceDefaults('github'), id, revision: 1, createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z', hasCredential: false, ...(origin ? { applicationOrigin: origin } : {}) }
}
describe('application directory preserves source identity and access boundaries', () => {
  it('does not claim a legacy connection by matching URL, and keeps multiple accounts', () => {
    const sources = [source('legacy'), source('personal', { applicationId: 'github', version: '1' }), source('team', { applicationId: 'github', version: '1' }), source('other', { applicationId: 'vercel', version: '1' })]
    expect(applicationConnections('github', sources).map(item => item.id)).toEqual(['personal', 'team'])
  })
  it('projects deletion and disable changes from the same source list', () => {
    const saved = source('personal', { applicationId: 'github', version: '1' }); saved.enabled = true
    expect(applicationConnections('github', [{ ...saved, enabled: false }])[0].enabled).toBe(false)
    expect(applicationConnections('github', [])).toEqual([])
  })
  it('copies defaults without granting bobo source access or mutating the catalog', () => {
    const draft = applicationSourceDefaults('github'); draft.name = 'My account'; draft.enabled = true
    expect(applicationSourceDefaults('github').name).toBe('GitHub')
    expect(APPLICATION_PRESETS.every(item => !item.config.enabled)).toBe(true)
    expect(() => applicationSourceDefaults('missing')).toThrow()
  })
})
describe('assistant template identity and dependency boundaries', () => {
  it('uses exactly the existing shared role definitions and preserves legacy index meaning', () => {
    expect(ASSISTANT_TEMPLATES.map(item => item.id)).toEqual(EMPLOYEE_PRESETS.map(item => item.id))
    expect([0, 1, 2].map(resolveEmployeePreset).map(item => item?.id)).toEqual(['researcher', 'writer', 'reviewer'])
    expect(resolveEmployeePreset('general')?.name).toBe('通用员工')
    expect(resolveEmployeePreset(100)).toBeUndefined()
  })
  it('rejects obsolete versions instead of silently assigning newer instructions', () => {
    expect(employeeTemplateOrigin('researcher', '1')).toEqual({ templateId: 'researcher', version: '1' })
    expect(() => employeeTemplateOrigin('researcher', '0')).toThrow()
    expect(() => employeeTemplateOrigin('private-user', '1')).toThrow()
  })
  it('never infers private resource bindings from a requirement', () => {
    const requirements = [{ kind: 'application' as const, id: 'github', label: 'GitHub', required: true }, { kind: 'skill' as const, id: 'review', label: 'Review', required: false }]
    expect(resolveAssistantRequirements(requirements, { applicationIds: [], skillIds: [] }).every(item => !item.satisfied)).toBe(true)
    expect(resolveAssistantRequirements(requirements, { applicationIds: ['github'], skillIds: [] }).map(item => item.satisfied)).toEqual([true, false])
    expect(ASSISTANT_TEMPLATES.every(item => item.requirements.length === 0)).toBe(true)
  })
})
describe('source creation recovery', () => {
  const request = { requestId: 'same-intent', operation: 'sources.create', input: { config: applicationSourceDefaults('github') } }
  it('returns an original successful receipt without executing another create', async () => {
    const receipt = { status: 'succeeded', data: source('saved') }
    const call = vi.fn().mockResolvedValue(receipt), api = { request: call } as unknown as DesktopApi
    expect(await recoverSourceCreation(api, request.requestId, request)).toBe(receipt)
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('recovers a receipt after a lost transport response', async () => {
    const receipt = { status: 'succeeded', data: source('saved') }
    const call = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(receipt)
    expect(await recoverSourceCreation({ request: call } as unknown as DesktopApi, request.requestId, request)).toBe(receipt)
    expect(call.mock.calls.filter(args => args[0] === 'executeApplicationOperation')).toHaveLength(1)
  })
  it('does not resubmit after restart when only identity remains and receipt is unknown', async () => {
    const call = vi.fn().mockResolvedValue(null)
    await expect(recoverSourceCreation({ request: call } as unknown as DesktopApi, request.requestId)).rejects.toThrow('不会重复创建')
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('rejects a different request identity rather than using a new intent to bypass unknown', async () => {
    const call = vi.fn().mockResolvedValue(null)
    await expect(recoverSourceCreation({ request: call } as unknown as DesktopApi, 'different', request)).rejects.toThrow('不会重复创建')
    expect(call).toHaveBeenCalledTimes(1)
  })
})

import { capabilityUpdateReview } from '../apps/electron/src/renderer/pages/library/capability-update-review'
it('package update never pre-approves newly added or changed executable contributions', () => {
  const original = { key: 'tools', kind: 'source' as const, config: applicationSourceDefaults('github'), requiredSecrets: ['TOKEN'] }
  const next = { ...original, requiredSecrets: ['TOKEN', 'ADMIN_TOKEN'] }
  const added = { ...original, key: 'admin' }
  const review = capabilityUpdateReview([original], [next, added])
  expect(review.approved).toEqual([])
  expect(review.rows.map(item => item.change)).toEqual(['changed', 'added'])
  expect(capabilityUpdateReview([original], [original]).approved).toEqual(['tools'])
  expect(capabilityUpdateReview([original], []).removed).toEqual(['tools'])
})

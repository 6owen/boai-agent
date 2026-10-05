/*
 * [INPUT]: 员工能力事实投影及真实绑定、配置版本、原握手和当前启动项只读身份状态。
 * [OUTPUT]: 说明可读不代表执行验证；程序/登录依赖失效、原配置修改与外来核验不能借旧握手显示当前能力。
 * [POS]: WV-T11 员工资料的能力真实性模块验证；不运行外部程序或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import type { AgentHome, DigitalAgent, LaunchProfile, LaunchProfileStatus, Snapshot } from '../src/shared/domain'
import { employeeCapabilityFacts } from '../src/renderer/components/employee/overview-state'

const agent: DigitalAgent = { id: 'writer', name: '写手', role: '写作', instructions: '擅长写作', color: '#777', connectionId: 'model', modelId: '', skillIds: ['skill'], knowledgeIds: [], allowCommands: true, active: true, configVersion: 3 }
const snapshot: Snapshot = { agents: [agent], connections: [{ id: 'model', name: '已配置连接', provider: 'openai-compatible', baseUrl: 'http://localhost', defaultModel: 'configured-model', hasApiKey: false }], resources: [{ id: 'skill', kind: 'skill', name: 'writing', description: '', path: '/managed/writing', createdAt: '2026-10-05' }], conversations: [], approvals: [], dataPath: '/data' }
const home: AgentHome = { agentId: agent.id, workspacePath: '/workspace', memoryNamespace: 'writer', configVersion: 3, files: [], environment: { version: 1, isolation: 'application', commandMode: 'host-approved', skills: [{ resourceId: 'skill', name: 'writing', instructions: 'available', execution: 'not_checked', detail: '执行依赖尚未验证。' }] } }
const external = { ...agent, executionBackend: { kind: 'acp-local' as const, profileId: 'acp' } }
const profile: LaunchProfile = { id: 'acp', name: '外部程序', executable: '/program', args: [], useExistingLogin: false, hostAccessAcknowledged: true, executableHash: 'hash', revision: 4, verified: { name: 'ACP', version: '1.0', protocolVersion: 1, checkedAt: '2026-10-05' } }
const checked = (status: LaunchProfileStatus['status'], value = profile): LaunchProfileStatus => ({ profile: value, status, detail: status === 'changed' ? '原程序字节已变化。' : status === 'unavailable' ? '原程序文件不存在。' : '原程序身份一致。', checkedAt: '2026-10-05' })

describe('employee overview capability truth', () => {
  it('does not turn readable instructions or a configured model into verified execution', () => {
    const facts = employeeCapabilityFacts(agent, snapshot, home)
    expect(facts.find(fact => fact.id === 'model')?.status).toBe('已配置')
    expect(facts.find(fact => fact.id === 'model')?.detail).toContain('不代表连接或输出效果已验证')
    expect(facts.find(fact => fact.id === 'skill:skill')?.status).toBe('已绑定 · 说明可读')
    expect(facts.find(fact => fact.id === 'skill:skill')?.detail).toContain('不表示执行依赖或交付效果已验证')
    expect(facts.find(fact => fact.id === 'commands')?.status).toBe('可申请 · 逐次批准')
  })
  it('invalidates instruction evidence after a configuration change or a different employee', () => {
    for (const prior of [{ ...home, configVersion: 2 }, { ...home, agentId: 'researcher' }]) {
      const fact = employeeCapabilityFacts(agent, snapshot, prior).find(item => item.id === 'skill:skill')!
      expect(fact.status).toBe('已绑定 · 读取状态待核对')
      expect(fact.detail).toContain('当前配置版本')
    }
  })
  it('does not borrow a resource owned by another employee, even if a stale home says it is readable', () => {
    const prior = { ...snapshot, resources: snapshot.resources.map(resource => ({ ...resource, ownerAgentId: 'researcher' })) }
    const fact = employeeCapabilityFacts(agent, prior, home).find(item => item.id === 'skill:skill')!
    expect(fact.status).toBe('来源不可用')
    expect(fact.skillId).toBeUndefined()
  })
  it('shows recorded ACP verification only for the selected launch profile and keeps its scope explicit', () => {
    const valid = employeeCapabilityFacts(external, snapshot, home, profile)
    expect(valid[0].status).toBe('已记录连接验证')
    expect(valid[0].detail).toContain('仅覆盖当时的连接握手')
    expect(valid.some(fact => fact.id.startsWith('skill:'))).toBe(false)
    expect(employeeCapabilityFacts(external, snapshot, home, { ...profile, id: 'other' })[0].status).toBe('启动项不可用')
  })
  it('keeps current file availability separate from the recorded ACP handshake', () => {
    const facts = employeeCapabilityFacts(external, snapshot, home, profile, checked('available'))
    expect(facts[0].status).toBe('已记录连接验证')
    expect(facts[0].detail).toContain('仅覆盖当时的连接握手')
    expect(facts[0].detail).toContain('实际任务仍需核验当前程序与权限')
  })
  it('does not borrow an old handshake after the real program or login dependency becomes unavailable', () => {
    const fact = employeeCapabilityFacts(external, snapshot, home, profile, checked('unavailable'))[0]
    expect(fact.status).toBe('执行依赖不可用')
    expect(fact.detail).toContain('原程序文件不存在')
    expect(fact.detail).toContain('原连接验证不能证明当前程序与登录依赖可用')
    expect(fact.detail).not.toContain('ACP 1.0')
  })
  it('invalidates recorded verification when the saved program identity changes', () => {
    const fact = employeeCapabilityFacts(external, snapshot, home, profile, checked('changed'))[0]
    expect(fact.status).toBe('连接验证已失效')
    expect(fact.detail).toContain('原程序字节已变化')
    expect(fact.detail).not.toContain('ACP 1.0')
  })
  it('shows the new profile revision without treating the old configuration handshake as current', () => {
    const next = { ...profile, revision: 5, args: ['--new-config'], verified: undefined }
    const fact = employeeCapabilityFacts(external, snapshot, home, next, checked('available', next))[0]
    expect(fact.status).toBe('当前配置未验证')
    expect(fact.detail).toContain('配置版本 5')
    expect(fact.detail).toContain('配置修改后不能继续使用旧验证')
  })
  it('does not combine a current profile with another identity or revision check', () => {
    for (const other of [{ ...profile, id: 'other' }, { ...profile, revision: 3 }, { ...profile, executableHash: 'other-hash' }]) {
      const fact = employeeCapabilityFacts(external, snapshot, home, profile, checked('available', other))[0]
      expect(fact.status).toBe('当前启动项待核对')
      expect(fact.detail).toContain('不能使用其他启动项或旧版本')
      expect(fact.detail).not.toContain('ACP 1.0')
    }
  })
  it('keeps a bound skill with unreadable current instructions visibly unavailable instead of claiming execution works', () => {
    const invalid: AgentHome = { ...home, environment: { ...home.environment!, skills: [{ ...home.environment!.skills[0], instructions: 'invalid', detail: '技能说明原件缺失。' }] } }
    const fact = employeeCapabilityFacts(agent, snapshot, invalid).find(item => item.id === 'skill:skill')!
    expect(fact.status).toBe('已绑定 · 说明不可读')
    expect(fact.detail).toContain('原件缺失')
    expect(fact.detail).not.toContain('读取通过')
  })
})

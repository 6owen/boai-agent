/*
 * [INPUT]: 隔离Desktop、已有真实成果提问协议、受管技能与本地ACP夹具、实际主IPC。
 * [OUTPUT]: 原员工waiting Work与真实绑定说明；隔离ACP明确握手及原配置/程序/登录目录变更；保存写后丢回复与只读观测，不替代业务事务。
 * [POS]: WV4员工概览Electron支撑；只有显式准备阶段运行离线ACP夹具，资料读取不启动验证或外网模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AgentInput, DigitalAgent } from '../../../src/shared/domain'
import type { WorkViewQuery } from '../../../src/shared/domain/work-views'
import type { Desktop } from './desktop'
import { prepareArtifactsDesktop } from './artifacts'
import { nextMaterialDialog } from './materials'

export interface OverviewObservation {
  methods: string[]
  workQueries: WorkViewQuery[]
  homeReads: string[]
  saves: AgentInput[]
  saved: { id: string; role: string; configVersion: number }[]
  snapshotReads: number
  lostReplies: number
  loseNextSaveReply: boolean
  externalVerifications: string[]
}
type Globals = typeof globalThis & { __boaiEmployeeOverview: OverviewObservation }

export async function prepareEmployeeOverview(runtime: Desktop) {
  const fixture = await prepareArtifactsDesktop(runtime, { askForSupplement: true })
  const skillPath = join(runtime.root, 'overview-writing')
  await mkdir(skillPath)
  await writeFile(join(skillPath, 'SKILL.md'), '---\nname: overview-writing\ndescription: 员工概览的真实受管说明，执行依赖未验证。\n---\n# 资料写作\n只使用获准来源整理报告。\n')
  await nextMaterialDialog(runtime, { path: skillPath })
  const prepared = await runtime.page.evaluate(async path => {
    const selected = await window.boai.request('choosePath', { kind: 'skill' })
    if (selected !== path) throw new Error('员工概览验收未取得明确原生技能目录授权')
    const resource = await window.boai.request('importResource', { kind: 'skill', path: selected, ownerAgentId: 'researcher' })
    const current = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef: _, memoryNamespace: _memory, policyVersion: _policy, creationSource: _source, systemRole: _system, ...input } = current
    const employee = await window.boai.request('saveAgent', { ...input, role: '核对来源并整理报告', skillIds: [resource.id], expectedConfigVersion: configVersion })
    return { employee, skill: resource }
  }, skillPath)
  return { ...fixture, ...prepared }
}

export async function prepareEmployeeAcpOverview(runtime: Desktop) {
  const executable = join(runtime.root, 'overview-acp.mjs'), loginPath = join(runtime.root, 'overview-acp-login')
  const bytes = `#!/usr/bin/env node\nawait import(${JSON.stringify(pathToFileURL(resolve('tests/fixtures/acp-agent.mjs')).href)});\n`
  await writeFile(executable, bytes); await chmod(executable, 0o755)
  await mkdir(loginPath)
  await writeFile(join(loginPath, 'auth.json'), JSON.stringify({ tokens: { access_token: 'offline-overview-fixture' } }))
  await runtime.start()
  const prepared = await runtime.page.evaluate(async ({ executable, loginPath }) => {
    const profile = await window.boai.request('saveLaunchProfile', { name: '员工概览隔离启动项', executable, args: ['--require-codex-home'], codexHome: loginPath, useExistingLogin: true, hostAccessAcknowledged: true })
    const verified = await window.boai.request('testLaunchProfile', { id: profile.id })
    const original = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'writer')!
    const { configVersion, workspaceRef: _, memoryNamespace: _memory, policyVersion: _policy, creationSource: _source, systemRole: _system, ...input } = original
    const employee = await window.boai.request('saveAgent', { ...input, name: '外部资料员工', role: '只执行明确外部任务', executionBackend: { kind: 'acp-local', profileId: verified.id }, connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], expectedConfigVersion: configVersion })
    return { profile: verified, employee }
  }, { executable, loginPath })
  return { ...prepared, executable, bytes, loginPath }
}

export async function observeEmployeeOverview(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state: OverviewObservation = { methods: [], workQueries: [], homeReads: [], saves: [], saved: [], snapshotReads: 0, lostReplies: 0, loseNextSaveReply: false, externalVerifications: [] }
    Object.assign(globalThis, { __boaiEmployeeOverview: state })
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      const method = payload.method as string
      state.methods.push(method)
      if (method === 'queryWorkViews') state.workQueries.push(structuredClone(payload.input))
      if (method === 'getAgentHome') state.homeReads.push(payload.input.agentId)
      if (method === 'snapshot') state.snapshotReads++
      if (method === 'testLaunchProfile' || method === 'testLaunchProfileDraft') state.externalVerifications.push(method)
      if (method === 'saveAgent') state.saves.push(structuredClone(payload.input))
      const result = await original(event, payload)
      if (method === 'saveAgent') {
        const agent = result as DigitalAgent
        state.saved.push({ id: agent.id, role: agent.role, configVersion: agent.configVersion })
        if (state.loseNextSaveReply) { state.loseNextSaveReply = false; state.lostReplies++; throw new Error('验收：员工配置已经提交，保存回复丢失') }
      }
      return result
    })
  })
  return {
    inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as Globals).__boaiEmployeeOverview)),
    loseNextSaveReply: () => runtime.app.evaluate(() => { (globalThis as Globals).__boaiEmployeeOverview.loseNextSaveReply = true }),
  }
}

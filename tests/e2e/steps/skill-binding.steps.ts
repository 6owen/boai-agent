/*
 * [INPUT]: D4 中文场景、实际本机目录/员工 UI、真实 IPC 与技能模型工具。
 * [OUTPUT]: 未保存草稿门禁、明确授权/实际技能读取交付、源版本受理前拒绝且只读确认为空、未知请求跨员工/重启手动核对业务断言；源变化重启等待真实主页面与宿主恢复后再退出。
 * [POS]: skill-binding Electron 业务步骤；文件与故障控制由 support 承担。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { bindingRecords, boundOriginal, loseBindingReply, openBindingEmployee, prepareSkillBindingDesktop } from '../support/skill-binding'
import type { BindLocalSkillInput, SkillBindingReceipt } from '../../../packages/shared/src/domain/skills'
import type { Resource } from '../../../packages/shared/src/domain'

interface State { fixture?: Awaited<ReturnType<typeof prepareSkillBindingDesktop>>; fault?: Awaited<ReturnType<typeof loseBindingReply>>; frozen?: BindLocalSkillInput; receipt?: SkillBindingReceipt; resource?: Resource; calls?: number; conversationId?: string; originalRole?: string }
export const test = base.extend<{ bindingState: State }>({ bindingState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('已发现报告技能但没有员工获得该技能', async ({ runtime, bindingState }) => {
  bindingState.fixture = await prepareSkillBindingDesktop(runtime)
  const fixture = bindingState.fixture!, snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toEqual([]); expect(snapshot.agents.every(agent => !agent.skillIds.length)).toBe(true)
  expect(fixture.endpoint.requests).toHaveLength(0); expect(fixture.localSkill.name).toBe(fixture.skillName)
  await openBindingEmployee(runtime)
})
When('员工配置有未保存修改时尝试添加本机技能', async ({ runtime, bindingState }) => {
  const role = runtime.page.getByRole('textbox', { name: '职责简介', exact: true }); bindingState.originalRole = await role.inputValue()
  await role.fill('这项未保存修改必须保留')
  await expect(runtime.page.getByRole('button', { name: '从本机技能选择', exact: true })).toBeDisabled()
})
Then('未保存配置被保留且未发生绑定或执行', async ({ runtime, bindingState }) => {
  await expect(runtime.page.getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue('这项未保存修改必须保留')
  const records = await bindingRecords(bindingState.fixture!.dataPath)
  expect(records.resources).toEqual([]); expect(records.operations.filter(value => value.kind === 'binding')).toEqual([])
  expect(records.agents.find(value => value.id === 'researcher')).toEqual(bindingState.fixture!.agent)
  expect(bindingState.fixture!.endpoint.requests).toHaveLength(0)
  await runtime.page.getByRole('textbox', { name: '职责简介', exact: true }).fill(bindingState.originalRole!)
})
async function preview(runtime: Parameters<typeof openBindingEmployee>[0], fixture: NonNullable<State['fixture']>) {
  await runtime.page.getByRole('button', { name: '从本机技能选择', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '为 研究员 绑定本机技能', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: '搜索本机技能', exact: true }).fill(fixture.skillName)
  await dialog.getByRole('button', { name: `选择本机技能 ${fixture.skillName}（${fixture.localSkill.sourceLabel}）`, exact: true }).click()
  await expect(dialog).toContainText('确认技能绑定')
  await expect(dialog).toContainText('报告助手')
  return dialog
}
When('用户预览并明确绑定报告技能给研究员', async ({ runtime, bindingState }) => {
  const dialog = await preview(runtime, bindingState.fixture!)
  expect(bindingState.fixture!.endpoint.requests).toHaveLength(0)
  await dialog.getByRole('button', { name: '确认绑定给 研究员', exact: true }).click()
  await expect(runtime.page.getByText(`已绑定技能「${bindingState.fixture!.skillName}」。`, { exact: true })).toBeVisible()
})
Then('只有研究员获得原件一致的受管技能且依赖仍未验证', async ({ runtime, bindingState }) => {
  const fixture = bindingState.fixture!, records = await bindingRecords(fixture.dataPath)
  expect(records.resources).toHaveLength(1); bindingState.resource = records.resources[0]
  expect(bindingState.resource.ownerAgentId).toBe('researcher')
  expect(await boundOriginal(bindingState.resource)).toBe(fixture.document)
  expect(records.agents.find(agent => agent.id === 'researcher')).toMatchObject({ skillIds: [bindingState.resource.id], configVersion: fixture.agent.configVersion + 1 })
  expect(records.agents.filter(agent => agent.id !== 'researcher').every(agent => !agent.skillIds.length)).toBe(true)
  expect(records.operations.filter(operation => operation.kind === 'binding')).toHaveLength(1)
  expect(records.messages).toEqual([]); expect(records.works).toEqual([]); expect(fixture.endpoint.requests).toHaveLength(0)
  const home = await runtime.page.evaluate(() => window.boai.request('getAgentHome', { agentId: 'researcher' }))
  expect(home.environment?.skills).toEqual([expect.objectContaining({ resourceId: bindingState.resource.id, instructions: 'available', execution: 'disabled' })])
  await expect(lstat(fixture.executionMarker)).rejects.toMatchObject({ code: 'ENOENT' })
})
When('研究员通过真实技能工具读取依据并交付报告', async ({ runtime, bindingState }) => {
  const conversation = await runtime.page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '技能绑定真实任务', agentIds: ['researcher'] }))
  bindingState.conversationId = conversation.id
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '使用明确绑定的技能读取依据并发布报告', requestId: 'd4-actual-task', mentionIds: [] }), conversation.id)
  await expect.poll(async () => {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
    return detail.artifacts.length === 1 && detail.workItems?.length === 1 && detail.workItems[0].status === 'delivered' && detail.runs.every(run => run.status === 'completed')
  }, { timeout: 30_000 }).toBe(true)
})
Then('实际报告来自获准技能且重启不重新导入或执行', async ({ runtime, bindingState }) => {
  const fixture = bindingState.fixture!, before = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), bindingState.conversationId!)
  expect(await readFile(before.artifacts[0].path, 'utf8')).toBe(`# 技能依据\n${fixture.marker}`)
  expect(before.runs.find(run => run.phase === 'execution')?.toolEvents.map(event => [event.name, event.status])).toEqual(['skill', 'skill_read', 'write_file', 'publish_artifact', 'report_work'].map(name => [name, 'completed']))
  const records = await bindingRecords(fixture.dataPath), calls = fixture.endpoint.requests.length
  await runtime.restart()
  const after = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), bindingState.conversationId!)
  expect(after.artifacts).toEqual(before.artifacts); expect(after.workItems).toEqual(before.workItems)
  expect((await bindingRecords(fixture.dataPath)).resources).toEqual(records.resources)
  expect(fixture.endpoint.requests).toHaveLength(calls)
  await expect(lstat(fixture.executionMarker)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(fixture.source, 'SKILL.md'), 'utf8')).toBe(fixture.document)
  expect(runtime.errors).toEqual([])
})
When('用户预览报告技能后源内容被改变', async ({ runtime, bindingState }) => {
  await preview(runtime, bindingState.fixture!)
  await bindingState.fixture!.replaceSource(bindingState.fixture!.document + '\n外部新增事实，不能沿用旧预览。\n')
})
When('用户提交已过期内容的绑定', async ({ runtime }) => {
  await runtime.page.getByRole('dialog').getByRole('button', { name: '确认绑定给 研究员', exact: true }).click()
  await expect(runtime.page.getByRole('alert')).toContainText(/源|内容|变化|变更/)
})
Then('绑定失败且员工配置和资源没有半提交', async ({ runtime, bindingState }) => {
  const fixture = bindingState.fixture!
  const dialog = runtime.page.getByRole('dialog')
  await dialog.getByRole('button', { name: '核对绑定结果', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('只读核对确认原请求尚未受理。')
  const records = await bindingRecords(fixture.dataPath)
  expect(records.operations.filter(value => value.kind === 'binding')).toEqual([])
  expect(records.resources).toEqual([]); expect(records.agents.find(agent => agent.id === 'researcher')).toEqual(fixture.agent)
  expect(records.messages).toEqual([]); expect(records.works).toEqual([]); expect(fixture.endpoint.requests).toHaveLength(0)
  expect(await readFile(join(fixture.source, 'SKILL.md'), 'utf8')).toContain('外部新增事实')
  await dialog.getByRole('button', { name: '放弃未受理请求', exact: true }).click()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(runtime.page.getByRole('status').filter({ hasText: '待核对的技能绑定' })).toHaveCount(0)
  await runtime.restart()
  await expect(runtime.page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible()
  const restored = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(restored.resources).toEqual([])
  expect((await bindingRecords(fixture.dataPath)).resources).toEqual([]); expect(fixture.endpoint.requests).toHaveLength(0)
})
When('用户预览报告技能并提交时绑定回执暂不可读', async ({ runtime, bindingState }) => {
  const dialog = await preview(runtime, bindingState.fixture!); bindingState.fault = await loseBindingReply(runtime)
  await dialog.getByRole('button', { name: '确认绑定给 研究员', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '核对绑定结果', exact: true })).toBeVisible()
  const fault = await bindingState.fault.inspect(); expect(fault.submissions).toHaveLength(1); bindingState.frozen = fault.submissions[0]
})
Then('未知绑定冻结原员工和原请求且其他员工不能继承', async ({ runtime, bindingState }) => {
  const dialog = runtime.page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: '确认绑定给 研究员', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '核对绑定结果', exact: true }).click()
  const fault = await bindingState.fault!.inspect()
  expect(fault.submissions).toEqual([bindingState.frozen]); expect(fault.lookups.every(key => key === bindingState.frozen!.requestId)).toBe(true)
  expect(bindingState.frozen?.agentId).toBe('researcher')
  await dialog.press('Escape'); await openBindingEmployee(runtime, '写手')
  await expect(runtime.page.getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue('写手')
  expect((await bindingRecords(bindingState.fixture!.dataPath)).agents.find(agent => agent.id === 'writer')?.skillIds).toEqual([])
  expect(bindingState.fixture!.endpoint.requests).toHaveLength(0)
})
When('用户关闭详情并在原数据目录重启', async ({ runtime }) => { await runtime.restart() })
Then('只核对原绑定回执且仍只有一次副本和配置变更', async ({ runtime, bindingState }) => {
  const fixture = bindingState.fixture!, frozen = bindingState.frozen!
  await openBindingEmployee(runtime)
  await runtime.page.getByRole('button', { name: '从本机技能选择', exact: true }).click()
  await runtime.page.getByRole('dialog').getByRole('button', { name: '核对绑定结果', exact: true }).click()
  await expect(runtime.page.getByText(`已绑定技能「${fixture.skillName}」。`, { exact: true })).toBeVisible()
  const receipt = await runtime.page.evaluate(requestId => window.boai.request('getSkillBindingReceipt', { requestId }), frozen.requestId)
  expect(receipt).toMatchObject({ id: frozen.requestId, status: 'completed', agentId: 'researcher', contentHash: frozen.contentHash })
  const records = await bindingRecords(fixture.dataPath)
  expect(records.resources).toHaveLength(1); expect(records.operations.filter(value => value.kind === 'binding')).toEqual([expect.objectContaining({ id: frozen.requestId, status: 'completed' })])
  expect(records.agents.find(agent => agent.id === 'researcher')).toMatchObject({ configVersion: fixture.agent.configVersion + 1, skillIds: [records.resources[0].id] })
  expect(await boundOriginal(records.resources[0])).toBe(fixture.document)
  expect(records.messages).toEqual([]); expect(records.works).toEqual([]); expect(fixture.endpoint.requests).toHaveLength(0)
  expect(runtime.errors).toEqual([])
})

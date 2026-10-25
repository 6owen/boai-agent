/*
 * [INPUT]: 原Claude员工UI、真实CLI/已保存原API来源，以及本场回环转发和独立无效合成凭据连接。
 * [OUTPUT]: 实际供应商401经CLI使原decision明确失败、用量未知保留；原保存自动退出编辑，修复来源与两次重启不重放失败，只有明确新消息调用原来源。
 * [POS]: Claude真实认证拒绝BDD；不撤销个人凭据、不打开原连接密钥编辑，不以程序核对冒充API认证成功。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { createClaudeAuthProvider } from '../support/claude-auth-provider'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { ProfileModelCall } from '../../../packages/runtime/src/modules/profile/profile-activity'
import type { StoredTraceSpan } from '../../../packages/shared/src/domain/traces'

const { Then } = createBdd(test)
Then('Claude拒绝无效API凭据后恢复原来源且不重放失败消息', async ({ runtime, claudeEmployee: state }) => {
  test.setTimeout(360000); expect(state.real).toBe(true)
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const agent = async () => (await snapshot()).agents.find(value => value.id === state.employeeId)!
  const original = await agent(), source = (await snapshot()).connections.find(value => value.id === original.connectionId)!
  expect(source.baseUrl).toMatch(/^https:\/\/api\.deepseek\.com(?:\/(?:v1|anthropic)\/?)?$/)
  expect(source.defaultModel).toBe('deepseek-v4-pro')
  const profiles = () => runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const originalProfiles = await profiles()
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const facts = async () => ({ detail: await read(), calls: await store.load<ProfileModelCall>('profileModelCalls'), budgets: await store.load('budgetModelCalls'), sessions: await store.load('claudeSessions'), traces: await store.load<StoredTraceSpan>('traceSpans') })
  const invalidKey = 'boai-invalid-' + randomUUID(), relay = await createClaudeAuthProvider({ model: source.defaultModel, invalidKey })
  const name = '本场无效API凭据', editor = () => runtime.page.locator('.detail-content:visible')
  const chat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Claude 同事', exact: true }).click()
  }
  const bind = async (connectionName: string, connectionId: string, version: number) => {
    const before = await facts()
    await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '员工设置', exact: true }).click()
    await expect(editor().getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue(original.name)
    await editor().getByRole('combobox', { name: '模型连接', exact: true }).click()
    await runtime.page.getByRole('option', { name: connectionName, exact: true }).click()
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await agent()).configVersion).toBe(version)
    expect(await agent()).toMatchObject({ id: original.id, executionBackend: original.executionBackend, connectionId })
    expect(await facts()).toEqual(before); expect(await profiles()).toEqual(originalProfiles)
    await expect(editor().getByRole('textbox', { name: '员工名称', exact: true })).toBeHidden()
  }
  const send = async (content: string) => { await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content); await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click() }
  try {
    await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
    await runtime.page.getByRole('button', { name: '添加连接', exact: true }).click()
    const dialog = runtime.page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Anthropic/ }).click()
    await dialog.getByLabel('连接名称', { exact: true }).fill(name)
    await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(relay.baseUrl)
    await dialog.getByLabel('API Key', { exact: true }).fill(invalidKey)
    await dialog.getByLabel('默认模型 ID', { exact: true }).fill(source.defaultModel)
    await dialog.getByRole('button', { name: '保存连接', exact: true }).click()
    await expect(dialog).toBeHidden()
    const rejectedSource = (await snapshot()).connections.find(value => value.name === name)!
    expect(rejectedSource).toMatchObject({ provider: 'anthropic', baseUrl: relay.baseUrl, defaultModel: source.defaultModel, hasApiKey: true })
    expect((await snapshot()).connections.find(value => value.id === source.id)).toEqual(source)
    await chat(); await bind(name, rejectedSource.id, original.configVersion + 1)
    expect((await read()).runs).toEqual([]); expect(relay.requests).toEqual([])
    await runtime.reviewData('原Claude员工明确切到本场无效合成凭据来源', { original, current: await agent(), originalSource: source, rejectedSource, programVerification: originalProfiles, originalCredentialReadByRenderer: false })
    await send('这是普通聊天，请只问候一句，不执行文件或长期记忆。')
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.length === 1 && detail.runs[0].status === 'failed' && detail.turns?.every(turn => turn.status === 'failed')
    }, { timeout: 150000 }).toBe(true)
    const failed = await facts(), requests = structuredClone(relay.requests)
    expect(requests).toHaveLength(1)
    expect(requests.every(request => request.upstreamStatus === 401 && request.credentialIsSynthetic && request.model === source.defaultModel && !request.error)).toBe(true)
    expect(failed.detail.runs[0]).toMatchObject({ agentId: original.id, phase: 'decision', status: 'failed', backend: { kind: 'claude-local', externalInvocations: 1 } })
    expect(failed.detail.runs[0].error).toContain('认证失败（401）')
    expect(failed.detail.runs[0].error).not.toContain('超时')
    expect(failed.traces.find(span => span.runId === failed.detail.runs[0].id && span.spanType === 'external_agent')?.output).toMatchObject({
      outcome: 'failed', apiRejection: { status: 401 }, transport: { processGroupExited: true, stoppedBecause: 'callback' },
    })
    expect(failed.detail.workItems).toEqual([]); expect(failed.budgets).toEqual([]); expect(failed.sessions).toEqual([])
    expect(failed.calls).toHaveLength(1)
    expect(failed.calls[0]).toMatchObject({ runId: failed.detail.runs[0].id, phase: 'decision', usageComplete: false })
    expect(failed.calls[0].finishedAt).toBeTruthy()
    expect(await profiles()).toEqual(originalProfiles)
    await runtime.reviewData('实际供应商401与原Claude失败调用分别核对', { originalSource: source, rejectedSource, requests, facts: failed, knownUsage: failed.calls[0].usage ?? null, usageComplete: false, internalModelCalls: 'unknown', automaticFallback: false })
    await runtime.reviewNativeCheckpoint('真实Claude无效凭据的原聊天失败')

    await bind(source.name, source.id, original.configVersion + 2)
    expect(await facts()).toEqual(failed); expect(relay.requests).toEqual(requests)
    await runtime.reviewData('恢复原Claude模型来源不重放失败消息', { agent: await agent(), facts: await facts(), requests: relay.requests })
    await runtime.restart()
    expect(await facts()).toEqual(failed); expect(relay.requests).toEqual(requests)
    expect((await snapshot()).connections.find(value => value.id === source.id)).toEqual(source)
    await runtime.reviewData('Claude认证修复首次重启零重放', { agent: await agent(), facts: await facts(), requests: relay.requests })

    await chat()
    const request = `这是新的普通聊天，请只复述核对码“${state.token}”，不执行文件任务或长期记忆。`
    await send(request)
    await expect.poll(async () => {
      const detail = await read(), added = detail.runs.filter(run => run.id !== failed.detail.runs[0].id)
      return added.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || added.length === 3 && added.every(run => run.status === 'completed') && detail.turns?.at(-1)?.status === 'completed'
    }, { timeout: 240000 }).toBe(true)
    const final = await facts(), added = final.detail.runs.filter(run => run.id !== failed.detail.runs[0].id)
    expect(added).toHaveLength(3)
    expect(added.every(run => run.status === 'completed' && run.backend?.kind === 'claude-local')).toBe(true)
    expect(added.map(run => run.phase).sort()).toEqual(['decision', 'execution', 'memory'])
    expect(final.detail.runs.find(run => run.id === failed.detail.runs[0].id)).toEqual(failed.detail.runs[0])
    for (const message of failed.detail.messages) expect(final.detail.messages.find(value => value.id === message.id)).toEqual(message)
    expect(final.detail.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toContain(state.token!)
    expect(final.detail.workItems).toEqual([]); expect(final.budgets).toEqual([])
    expect(final.calls).toHaveLength(4); expect(final.calls.find(call => call.id === failed.calls[0].id)).toEqual(failed.calls[0])
    expect(final.sessions).toHaveLength(1); expect(relay.requests).toEqual(requests)
    await runtime.reviewData('只有明确新消息通过原Claude来源完成', { request, facts: final, requests: relay.requests, internalModelCalls: 'unknown' })
    await runtime.reviewNativeCheckpoint('Claude认证来源恢复后新消息完成')
    await runtime.restart()
    expect(await facts()).toEqual(final); expect(relay.requests).toEqual(requests)
    expect(await profiles()).toEqual(originalProfiles)
    expect((await snapshot()).connections.find(value => value.id === source.id)).toEqual(source)
    expect(runtime.errors).toEqual([])
    await runtime.reviewData('Claude认证恢复第二次重启保持原失败未知用量与新回复', { agent: await agent(), facts: await facts(), requests: relay.requests })
  } finally {
    await runtime.reviewData('Claude认证拒绝最终原始状态', { agent: await agent(), originalSource: source, profiles: await profiles(), facts: await facts(), requests: relay.requests })
    await store.close()
    await relay.close()
  }
})

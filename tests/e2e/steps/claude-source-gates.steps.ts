/*
 * [INPUT]: 原Claude员工/连接编辑UI、明确程序及本场独立合成模型连接；真实CLI/API恢复和离线协议分批启用。
 * [OUTPUT]: 协议不兼容/无密钥/删除连接按原UI错误在模型调用前拒绝；同员工恢复原来源及两次重启保留失败、零重放，只有新消息执行；真实核对码与离线首次回复分开断言，个人连接与凭据不改。
 * [POS]: Claude来源门禁BDD；不把零预算当零普通调用，不将配置故障冒充供应商拒绝。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { ProfileModelCall } from '../../../packages/runtime/src/modules/profile/profile-activity'

const { Then } = createBdd(test)
Then('Claude模型来源遇到{string}后恢复同员工且只执行新消息', async ({ runtime, claudeEmployee: state }, fault: string) => {
  test.setTimeout(360000)
  const errors: Record<string, RegExp> = { '接口协议不兼容': /Anthropic协议来源/, '密钥已移除': /API连接和凭据/, '连接被删除': /请先为员工配置模型连接/ }
  expect(Object.keys(errors)).toContain(fault)
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const agent = async () => (await snapshot()).agents.find(value => value.id === state.employeeId)!
  const original = await agent(), source = (await snapshot()).connections.find(value => value.id === original.connectionId)!
  const profiles = () => runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined)), originalProfiles = await profiles()
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const facts = async () => ({ detail: await read(), calls: await store.load<ProfileModelCall>('profileModelCalls'), budgets: await store.load('budgetModelCalls'), sessions: await store.load('claudeSessions'), traces: await store.load('traceSpans') })
  const requests: { method?: string; path?: string }[] = []
  const server = createServer((request, response) => { requests.push({ method: request.method, path: request.url }); response.writeHead(503, { 'content-type': 'application/json' }).end('{"error":{"type":"unexpected-test-request"}}') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); expect(address && typeof address !== 'string').toBe(true)
  const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`, name = '本场来源门禁', key = 'boai-source-only-' + randomUUID()
  const chat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Claude 同事', exact: true }).click()
  }
  const settings = async () => { await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click() }
  const bind = async (connectionName: string, connectionId: string) => {
    const before = await facts(), version = (await agent()).configVersion
    await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '员工设置', exact: true }).click()
    const editor = runtime.page.locator('.detail-content:visible')
    await expect(editor.getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue(original.name)
    await editor.getByRole('combobox', { name: '模型连接', exact: true }).click()
    await runtime.page.getByRole('option', { name: connectionName, exact: true }).click()
    await editor.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await agent()).configVersion).toBe(version + 1)
    expect(await agent()).toMatchObject({ id: original.id, executionBackend: original.executionBackend, connectionId })
    expect(await facts()).toEqual(before); expect(await profiles()).toEqual(originalProfiles)
    await expect(editor.getByRole('textbox', { name: '员工名称', exact: true })).toBeHidden()
  }
  const send = async (content: string) => { await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content); await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click() }
  try {
    await settings(); await runtime.page.getByRole('button', { name: '添加连接', exact: true }).click()
    const dialog = runtime.page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Anthropic/ }).click()
    await dialog.getByLabel('连接名称', { exact: true }).fill(name)
    await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(baseUrl)
    await dialog.getByLabel('API Key', { exact: true }).fill(key)
    await dialog.getByLabel('默认模型 ID', { exact: true }).fill(source.defaultModel)
    await dialog.getByRole('button', { name: '保存连接', exact: true }).click(); await expect(dialog).toBeHidden()
    const owned = (await snapshot()).connections.find(value => value.name === name)!
    expect(owned).toMatchObject({ provider: 'anthropic', baseUrl, hasApiKey: true })
    await chat(); await bind(name, owned.id)
    const before = await facts(); expect(before.calls).toEqual([]); expect(requests).toEqual([])
    await settings(); await runtime.page.getByRole('button', { name: `管理 ${name}`, exact: true }).click()
    if (fault === '连接被删除') {
      await runtime.page.getByRole('menuitem', { name: '删除连接', exact: true }).click()
      await expect.poll(async () => (await agent()).connectionId).toBe('')
      expect((await snapshot()).connections.some(value => value.id === owned.id)).toBe(false)
    } else {
      await runtime.page.getByRole('menuitem', { name: '编辑连接', exact: true }).click()
      await expect(dialog.getByLabel('连接名称', { exact: true })).toHaveValue(name)
      // Only this owned synthetic credential is read by its editor.
      await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue(key)
      if (fault === '密钥已移除') await dialog.getByLabel('API Key', { exact: true }).fill('')
      else { await dialog.getByRole('button', { name: '更换服务', exact: true }).click(); await dialog.getByRole('button', { name: /^OpenAI 使用/ }).click() }
      await dialog.getByRole('button', { name: '保存连接', exact: true }).click(); await expect(dialog).toBeHidden()
      expect((await snapshot()).connections.find(value => value.id === owned.id)).toMatchObject(fault === '密钥已移除' ? { hasApiKey: false } : { provider: 'openai' })
    }
    expect(await facts()).toEqual(before); expect(await profiles()).toEqual(originalProfiles)
    expect((await snapshot()).connections.find(value => value.id === source.id)).toEqual(source)
    await chat(); await send('这是模型来源故障期间的普通聊天，不执行文件或其他模型。')
    await expect.poll(async () => { const detail = await read(); return detail.runs.length === 1 && detail.runs[0].status === 'failed' && detail.turns?.every(turn => turn.status === 'failed') }).toBe(true)
    const failed = await facts()
    expect(failed.detail.runs[0]).toMatchObject({ agentId: original.id, phase: 'decision', status: 'failed' })
    expect(failed.detail.runs[0].backend).toBeUndefined(); expect(failed.detail.runs[0].error).toMatch(errors[fault])
    for (const entries of [failed.calls, failed.budgets, failed.sessions, failed.traces, failed.detail.workItems]) expect(entries).toEqual([])
    expect(requests).toEqual([]); expect(await profiles()).toEqual(originalProfiles)
    await runtime.reviewData('Claude来源故障在调用前拒绝', { fault, source: owned, currentSource: (await snapshot()).connections.find(value => value.id === owned.id) ?? null, agent: await agent(), originalSource: source, facts: failed, requests, originalCredentialReadByRenderer: false })
    await runtime.reviewNativeCheckpoint(fault + '的Claude原消息门禁')
    await bind(source.name, source.id)
    expect(await facts()).toEqual(failed); expect(requests).toEqual([])
    await runtime.restart()
    expect(await facts()).toEqual(failed); expect(await profiles()).toEqual(originalProfiles); expect(requests).toEqual([])
    await runtime.reviewData('Claude来源修复首次重启零重放', { fault, agent: await agent(), facts: await facts(), requests })
    await chat(); await send(state.real ? `这是新的普通聊天，只复述核对码“${state.token}”，不执行文件任务或长期记忆。` : `empty-memory 复述 ${state.token}`)
    await expect.poll(async () => { const detail = await read(), added = detail.runs.filter(run => run.id !== failed.detail.runs[0].id); return added.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || added.length === 3 && added.every(run => run.status === 'completed') && detail.turns?.at(-1)?.status === 'completed' }, { timeout: 240000 }).toBe(true)
    const final = await facts(), added = final.detail.runs.filter(run => run.id !== failed.detail.runs[0].id)
    expect(added).toHaveLength(3); expect(added.every(run => run.status === 'completed' && run.backend?.kind === 'claude-local')).toBe(true)
    expect(final.detail.runs.find(run => run.id === failed.detail.runs[0].id)).toEqual(failed.detail.runs[0])
    for (const message of failed.detail.messages) expect(final.detail.messages.find(value => value.id === message.id)).toEqual(message)
    expect(final.detail.workItems).toEqual([]); expect(final.budgets).toEqual([]); expect(final.calls).toHaveLength(3); expect(final.sessions).toHaveLength(1); expect(requests).toEqual([])
    expect(final.detail.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toContain(state.real ? state.token! : '首次公开回复')
    await expect(runtime.page.getByText('处理中', { exact: true })).toHaveCount(0)
    await runtime.reviewData('明确新消息才通过原Claude来源执行', { fault, facts: final, requests, internalModelCalls: 'unknown' })
    await runtime.reviewNativeCheckpoint(fault + '修复后的Claude明确新回复')
    await runtime.restart()
    expect(await facts()).toEqual(final); expect(await profiles()).toEqual(originalProfiles); expect(requests).toEqual([])
    expect((await snapshot()).connections.find(value => value.id === source.id)).toEqual(source); expect(runtime.errors).toEqual([])
    await runtime.reviewData('Claude来源故障第二次重启保留原失败与新回复', { fault, agent: await agent(), facts: await facts(), requests })
  } finally {
    await runtime.reviewData('Claude来源门禁最终原始状态', { fault, agent: await agent(), originalSource: source, profiles: await profiles(), facts: await facts(), requests })
    await store.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

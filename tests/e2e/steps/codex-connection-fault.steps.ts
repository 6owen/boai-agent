/*
 * [OUTPUT]: 程序被替换/丢失及协议版本变化在隔离副本注入；原验证不能继续使用，修复后明确重测仍不重放失败消息。
 * [INPUT]: 已验证Codex连接、原员工与隔离产品数据；认证场景用真实程序，文件/版本故障用隔离协议副本，不读取或改动个人凭据。
 * [OUTPUT]: 配置停用现有登录后实际握手拒绝，保存失效配置不沿用验证；新消息无模型调用，重新验证也不重放原消息。
 * [POS]: 本机连接认证故障桌面验收；使用空私有目录，不冒充真实令牌过期。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join, resolve } from 'node:path'
import { chmod, cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'

const { Then } = createBdd(test)
Then('连接停用现有登录后拒绝执行且重新验证不重放原消息', async ({ runtime, codexEmployee }) => {
  test.setTimeout(180000)
  expect(codexEmployee.real).toBe(true)
  const profiles = () => runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const original = (await profiles())[0]
  expect(original.useExistingLogin).toBe(true)
  expect(original.verified?.name).toBe('Codex')
  const id = codexEmployee.conversationId!, read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const settings = async () => {
    await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  }
  const editor = async () => {
    await runtime.page.getByRole('region', { name: '本机 Agent', exact: true }).getByRole('button', { name: `管理 ${original.name}`, exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '编辑 Agent 配置', exact: true }).click()
    const dialog = runtime.page.getByRole('dialog', { name: '配置本机 Agent', exact: true })
    await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
    return dialog
  }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await settings()
    let dialog = await editor()
    await dialog.getByRole('checkbox', { name: '使用本机已有配置', exact: true }).uncheck()
    await dialog.getByRole('button', { name: '测试', exact: true }).click()
    await expect(dialog.getByText('Codex需要登录，请先在本机Codex完成登录', { exact: true })).toBeVisible({ timeout: 30000 })
    // Testing a draft cannot invalidate or mutate the separately saved profile.
    expect(await profiles()).toEqual([original])
    await runtime.reviewCheckpoint('隔离空目录真实握手提示需要登录')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).toBeHidden()
    const unavailable = (await profiles())[0]
    expect(unavailable).toMatchObject({ id: original.id, revision: original.revision + 1, useExistingLogin: false })
    expect(unavailable.verified).toBeUndefined()
    expect(unavailable.codexHome).toBeUndefined()
    await expect(runtime.page.getByRole('region', { name: '本机 Agent', exact: true })).toContainText('尚未测试')
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('当前连接缺少登录；这是普通聊天，请问候一句。')
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await read()).runs.some(run => run.status === 'failed')).toBe(true)
    const failed = await read()
    expect(failed.runs).toHaveLength(1)
    expect(failed.runs[0]).toMatchObject({ phase: 'decision', status: 'failed', error: '请先测试当前本机 Codex 连接' })
    expect(failed.workItems).toEqual([])
    expect(await store.load('budgetModelCalls')).toEqual([])
    expect(await store.load('codexSessions')).toEqual([])
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual([])
    await runtime.reviewData('未验证配置的新消息被阻止', { original, unavailable, detail: failed, modelCalls: await store.load('budgetModelCalls'), authenticationSecretRead: false })
    await runtime.reviewCheckpoint('失效连接的原聊天失败记录')
    await runtime.restart()
    expect((await read()).runs).toEqual(failed.runs)
    expect((await profiles())[0]).toEqual(unavailable)
    await settings(); dialog = await editor()
    await dialog.getByRole('checkbox', { name: '使用本机已有配置', exact: true }).check()
    if (original.codexHome) await dialog.getByRole('textbox', { name: 'Codex 配置目录', exact: true }).fill(original.codexHome)
    await dialog.getByRole('button', { name: '测试', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('测试成功', { timeout: 30000 })
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).toBeHidden()
    const recovered = (await profiles())[0]
    expect(recovered).toMatchObject({ id: original.id, revision: original.revision + 2, executable: original.executable, executableHash: original.executableHash, useExistingLogin: true, verified: { name: original.verified!.name, version: original.verified!.version } })
    expect(recovered.codexHome).toBe(original.codexHome)
    expect((await read()).runs).toEqual(failed.runs)
    expect((await read()).messages).toEqual(failed.messages)
    await runtime.reviewData('重新验证原连接仅恢复后续执行资格', { recovered, detail: await read(), modelInferencePerformed: false })
    await runtime.reviewCheckpoint('恢复原连接验证且未重放失败聊天')
    await runtime.restart()
    expect((await read()).runs).toEqual(failed.runs)
    expect(await store.load('budgetModelCalls')).toEqual([])
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('认证配置故障最终原始状态', { profiles: await profiles(), detail: await read(), calls: await store.load('budgetModelCalls'), sessions: await store.load('codexSessions') })
    await store.close()
  }
})

Then('已验证连接遇到{string}后保留原失败且恢复程序不自动重跑', async ({ runtime, codexEmployee }, fault: string) => {
  test.setTimeout(180000)
  expect(codexEmployee.real).toBe(false)
  expect(['程序被替换', '程序丢失', '协议版本变化']).toContain(fault)
  const directory = join(runtime.root, 'controlled-program'), executable = join(directory, 'codex-app-server.mjs')
  await mkdir(directory)
  await cp(resolve('tests/fixtures/codex-app-server.mjs'), executable)
  await chmod(executable, 0o755)
  const bytes = await readFile(executable), id = codexEmployee.conversationId!
  const profiles = () => runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const settings = async () => {
    await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  }
  await settings()
  await runtime.page.getByRole('region', { name: '本机 Agent', exact: true }).getByRole('button', { name: '管理 本机 Codex', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '编辑 Agent 配置', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '配置本机 Agent', exact: true })
  await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
  await dialog.getByRole('textbox', { name: '启动命令', exact: true }).fill(executable)
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('测试成功')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  const profile = (await profiles())[0]
  expect(profile.verified).toBeDefined()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const probeDirectory = join(snapshot.dataPath, 'external-probes', profile.id)
  await mkdir(probeDirectory, { recursive: true })
  if (fault === '程序被替换') await writeFile(executable, Buffer.concat([bytes, Buffer.from('\n// controlled replacement\n')]))
  else if (fault === '程序丢失') await rename(executable, executable + '.original')
  else await writeFile(join(probeDirectory, 'fixture-mode'), 'unknown-version')
  const status = await runtime.page.evaluate(id => window.boai.request('getLaunchProfileStatus', { id }), profile.id)
  expect(status.status).toBe(fault === '程序被替换' ? 'changed' : fault === '程序丢失' ? 'unavailable' : 'available')
  expect((await profiles())[0]).toEqual(profile)
  const testConnection = async () => {
    await runtime.page.getByRole('region', { name: '本机 Agent', exact: true }).getByRole('button', { name: `管理 ${profile.name}`, exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '测试', exact: true }).click()
  }
  await testConnection()
  await expect.poll(async () => (await profiles())[0].verified).toBeUndefined()
  const region = runtime.page.getByRole('region', { name: '本机 Agent', exact: true })
  const error = fault === '程序被替换' ? /Codex程序已变化/ : fault === '程序丢失' ? /ENOENT/ : /0\.160\.0尚未通过/
  await expect(region.getByText(error)).toBeVisible()
  await region.getByText(error).scrollIntoViewIfNeeded()
  await runtime.reviewData('隔离连接故障和真实身份检查', { fault, profile, status, current: (await profiles())[0], injection: 'owned temporary protocol fixture; no personal program changed' })
  await runtime.reviewCheckpoint(fault + '的原连接明确失败')
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('连接故障期间的普通消息，不应调用其他模型。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await read()).runs.some(run => run.status === 'failed')).toBe(true)
  const failed = await read(), store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    expect(failed.runs).toHaveLength(1)
    expect(failed.runs[0]).toMatchObject({ phase: 'decision', status: 'failed', error: '请先测试当前本机 Codex 连接' })
    expect(failed.workItems).toEqual([]); expect(await store.load('budgetModelCalls')).toEqual([])
    expect(await store.load('codexSessions')).toEqual([])
    await expect(readFile(join(probeDirectory, 'turn-requests.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    if (fault === '程序被替换') await writeFile(executable, bytes)
    else if (fault === '程序丢失') await rename(executable + '.original', executable)
    else await writeFile(join(probeDirectory, 'fixture-mode'), '')
    await settings(); await testConnection()
    await expect.poll(async () => (await profiles())[0].verified?.version).toBe('0.159.3')
    expect((await profiles())[0]).toMatchObject({ id: profile.id, revision: profile.revision, executableHash: profile.executableHash })
    expect((await read()).runs).toEqual(failed.runs); expect((await read()).messages).toEqual(failed.messages)
    await runtime.reviewCheckpoint(fault + '修复后重新验证且原消息不重跑')
    await runtime.restart()
    expect((await read()).runs).toEqual(failed.runs); expect((await read()).messages).toEqual(failed.messages)
    expect(await store.load('budgetModelCalls')).toEqual([])
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual([])
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('连接程序故障最终原始状态', { fault, profile: (await profiles())[0], detail: await read(), calls: await store.load('budgetModelCalls'), sessions: await store.load('codexSessions') })
    await store.close()
  }
})

/*
 * [INPUT]: 本地配置导入中文场景、Electron fixture 与临时配置文件。
 * [OUTPUT]: 协议选中值独立于装饰图标断言；模型 API 复用添加连接同一弹窗/第二步标题与关闭按钮、ACP 独立扫描与高级设置折叠；二级只读配置字段的值断言适配统一横向表单；品牌整行选择、第二级配置详情/手动目录加载及重扫链接；单一扫描入口及选择/配置两步向导，保留显式授权/保存前无配置与原业务断言；真实 IPC 扫描/导入及预览截图、源文件只读、无密钥预览、补填模型、协议保留、重启去重和原生目录选择、Codex ACP 登录接入/会话测试/执行/重启的验收。
 * [POS]: tests/e2e/steps/local-connections.steps.ts；不扫描真实用户目录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type State = { source?: string; codexId?: string; configId?: string; profileId?: string; loginId?: string }
export const test = base.extend<{ localConfigState: State }>({ localConfigState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

async function configureScan(runtime: Desktop) {
  await runtime.app.evaluate((_electron, root) => {
    process.env.CODEX_HOME = `${root}/codex`
    process.env.CLAUDE_CONFIG_DIR = `${root}/claude`
    process.env.PATH = `${root}/bin`
  }, runtime.root)
}
async function openModelImport(runtime: Desktop) {
  await runtime.page.getByRole('button', { name: '添加连接', exact: true }).click()
  await runtime.page.getByRole('button', { name: /导入本机配置/ }).click()
}
async function settings(runtime: Desktop) {
  await runtime.page.getByRole('button', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '模型连接与数据备份' }).click()
}

Given('本地配置导入使用独立的 Codex 和 Claude 配置', async ({ runtime, localConfigState }) => {
  await mkdir(join(runtime.root, 'codex'))
  await mkdir(join(runtime.root, 'claude'))
  await mkdir(join(runtime.root, 'oauth'))
  await mkdir(join(runtime.root, 'bin'))
  const program = join(runtime.root, 'bin/codex-acp')
  await writeFile(program, `#!/usr/bin/env node\nprocess.argv.push('--require-codex-home');await import(${JSON.stringify(pathToFileURL(resolve('tests/fixtures/acp-agent.mjs')).href)});\n`)
  await chmod(program, 0o755)
  localConfigState.source = 'model="fixture-model"\nmodel_provider="relay"\n[model_providers.relay]\nbase_url="https://relay.example/v1"\nwire_api="responses"\nrequires_openai_auth=true'
  await writeFile(join(runtime.root, 'codex/config.toml'), localConfigState.source)
  await writeFile(join(runtime.root, 'codex/auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'bdd-codex-secret' }))
  await writeFile(join(runtime.root, 'claude/settings.json'), JSON.stringify({ env: { ANTHROPIC_API_KEY: 'bdd-claude-secret' } }))
  await writeFile(join(runtime.root, 'oauth/auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'bdd-account', access_token: 'bdd-oauth-secret', refresh_token: 'bdd-refresh-secret' } }))
  await runtime.start()
  await configureScan(runtime)
  await settings(runtime)
})

When('从添加连接中扫描本机模型配置', async ({ runtime }) => {
  await openModelImport(runtime)
  const dialog = runtime.page.getByRole('dialog', { name: '导入本机模型配置' })
  await expect(dialog.getByText('Codex', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Claude Code', { exact: true })).toBeVisible()
})

Then('扫描只展示来源且尚未保存连接或泄露密钥', async ({ runtime }) => {
  const page = runtime.page, dialog = page.getByRole('dialog', { name: '导入本机模型配置' })
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.connections).toEqual([])
  expect(JSON.stringify(snapshot)).not.toContain('bdd-codex-secret')
  await dialog.getByRole('button', { name: 'Codex 配置', exact: true }).click()
  const details = page.getByRole('dialog', { name: '导入本机模型配置', exact: true })
  await expect(details.getByRole('textbox', { name: '配置文件', exact: true })).toHaveValue(/config\.toml$/)
  await expect(details.getByRole('textbox', { name: '接口协议', exact: true })).toHaveValue('Responses')
  await expect(details).not.toContainText('bdd-codex-secret')
  await expect(details).not.toContainText('bdd-claude-secret')
  await runtime.page.screenshot({ path: test.info().outputPath('local-config-preview.png'), animations: 'disabled' })
  await details.getByRole('button', { name: '返回', exact: true }).click()
})

When('导入 Codex 并补填 Claude 的默认模型', async ({ runtime, localConfigState }) => {
  const page = runtime.page, dialog = page.getByRole('dialog', { name: '导入本机模型配置' })
  await dialog.getByRole('button', { name: 'Codex 配置', exact: true }).click()
  await page.getByRole('dialog', { name: '导入本机模型配置', exact: true }).getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await openModelImport(runtime)
  await expect(dialog.getByRole('button', { name: 'Codex 配置', exact: true })).toContainText('已导入')
  await dialog.getByRole('button', { name: 'Claude Code 配置', exact: true }).click()
  const claude = page.getByRole('dialog', { name: '导入本机模型配置', exact: true })
  await expect(claude.getByRole('button', { name: '保存连接', exact: true })).toBeDisabled()
  await claude.getByRole('textbox', { name: '默认模型 ID' }).fill('claude-fixture')
  await claude.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(claude).toBeHidden()
  await openModelImport(runtime)
  await expect(dialog.getByRole('button', { name: 'Claude Code 配置', exact: true })).toContainText('已导入')
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.connections).toHaveLength(2)
  const saved = snapshot.connections.find(item => item.api === 'responses')!
  localConfigState.codexId = saved.id
  localConfigState.configId = saved.localConfigId
  expect(await page.evaluate(id => window.boai.request('getConnectionApiKey', { id }), saved.id)).toBe('bdd-codex-secret')
  expect(snapshot.connections.find(item => item.provider === 'anthropic')).toMatchObject({ defaultModel: 'claude-fixture', baseUrl: 'https://api.anthropic.com/v1' })
  expect(await readFile(join(runtime.root, 'codex/config.toml'), 'utf8')).toBe(localConfigState.source)
  await dialog.getByRole('button', { name: '关闭模型连接配置', exact: true }).click()
})

Then('编辑和重启后仍保留导入连接且重复导入不新增', async ({ runtime, localConfigState }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '管理 Codex · fixture-model' }).click()
  await page.getByRole('menuitem', { name: '编辑连接' }).click()
  const editor = page.getByRole('dialog', { name: '连接 OpenAI 兼容接口' })
  await expect(editor.getByRole('combobox', { name: '接口协议' }).locator('[data-slot=select-value]')).toHaveText('Responses')
  await editor.getByRole('textbox', { name: '连接名称' }).fill('我的本地 Codex')
  await editor.getByRole('button', { name: '保存连接' }).click()
  await expect(editor).toBeHidden()
  await runtime.restart()
  await configureScan(runtime)
  await settings(runtime)
  await openModelImport(runtime)
  const dialog = runtime.page.getByRole('dialog', { name: '导入本机模型配置' })
  await expect(dialog.getByText('已导入', { exact: true })).toHaveCount(2)
  const imported = await runtime.page.evaluate(configId => window.boai.request('importLocalConnection', { configId }), localConfigState.configId!)
  expect(imported).toMatchObject({ id: localConfigState.codexId, name: '我的本地 Codex', api: 'responses' })
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toHaveLength(2)
})

When('选择其他配置目录并遇到 Codex 网页登录', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '关闭模型连接配置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: 'Claude Code 配置', exact: true })).toHaveCount(0)
  await runtime.app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] })
  }, join(runtime.root, 'oauth'))
  await runtime.page.getByRole('button', { name: /手动添加/ }).click()
  await runtime.page.getByRole('button', { name: '选择目录加载', exact: true }).click()
  await expect(runtime.page.getByRole('dialog', { name: '手动添加 Agent' })).toContainText('使用本机登录接入 Agent')
})

Then('网页登录可接入 ACP 且取消目录选择保留当前结果', async ({ runtime }) => {
  const manual = runtime.page.getByRole('dialog', { name: '手动添加 Agent' })
  await runtime.app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }) })
  await manual.getByRole('button', { name: '选择目录加载', exact: true }).click()
  await expect(manual).toContainText('使用本机登录接入 Agent')
  await manual.getByRole('button', { name: 'Codex 配置', exact: true }).click()
  const editor = runtime.page.getByRole('dialog', { name: '配置本机 Agent' })
  await expect(editor.getByRole('textbox', { name: '启动命令' })).toBeHidden()
  await editor.getByRole('button', { name: '高级设置', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: '启动命令' })).toHaveValue(/codex-acp/)
  await expect(editor.getByRole('button', { name: '测试', exact: true })).toBeDisabled()
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: '返回', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '选择本机 Agent' })
  await expect(dialog.getByRole('button', { name: '导入连接', exact: true })).toHaveCount(0)
  await expect(dialog).not.toContainText('bdd-oauth-secret')
  expect(await runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).toEqual([])
  expect(runtime.errors).toEqual([])
})

When('接入 Codex 并测试现有登录', async ({ runtime, localConfigState }) => {
  const page = runtime.page, dialog = page.getByRole('dialog', { name: '选择本机 Agent' })
  const source = await readFile(join(runtime.root, 'oauth/auth.json'), 'utf8')
  await dialog.getByRole('button', { name: 'Codex 配置', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '配置本机 Agent' })
  await editor.getByRole('checkbox', { name: /允许此 Agent 在本机运行/ }).check()
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toBeHidden()
  expect(await readFile(join(runtime.root, 'oauth/auth.json'), 'utf8')).toBe(source)
  const [profile] = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  localConfigState.profileId = profile.id; localConfigState.loginId = profile.localConfigId
  expect(profile.verified).toBeUndefined()
  expect(JSON.stringify(profile)).not.toMatch(/bdd-oauth-secret|bdd-refresh-secret/)
  expect(profile.runtime).toBe('node')
  expect(profile.codexHome).toContain('/oauth')
  const agents = page.getByRole('region', { name: '本机 Agent', exact: true })
  await expect(agents.getByText('Codex · 本地登录', { exact: true })).toBeVisible()
  await agents.getByRole('button', { name: '管理 Codex · 本地登录' }).click()
  await page.getByRole('menuitem', { name: '测试', exact: true }).click()
  await expect(agents).toContainText('已验证')
  await expect(agents).toContainText('boai-protocol-fixture 1.0.0')
  await page.screenshot({ path: test.info().outputPath('codex-local-agent.png'), animations: 'disabled' })
})

Then('本地 Agent 可以执行任务且重启后不会重复导入', async ({ runtime, localConfigState }) => {
  const conversation = await runtime.page.evaluate(async profileId => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...employee } = snapshot.agents[0]
    await window.boai.request('saveAgent', { ...employee, executionBackend: { kind: 'acp-local', profileId } })
    const conversation = await window.boai.request('createConversation', { kind: 'direct', title: '本地登录执行验收', agentIds: [employee.id] })
    await window.boai.request('sendExternalTask', { conversationId: conversation.id, content: 'Complete a controlled task', requestId: 'local-agent-task' })
    return conversation
  }, localConfigState.profileId!)
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).runs[0]?.status).toBe('completed')
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  const [profile] = await runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  expect(detail.messages.find(message => message.senderType === 'agent')?.content).toContain(`CODEX_HOME=${profile.codexHome}`)
  expect(JSON.stringify(detail)).not.toMatch(/bdd-oauth-secret|bdd-refresh-secret|PRIVATE_THOUGHT/)
  await runtime.restart()
  await configureScan(runtime)
  await settings(runtime)
  const agents = runtime.page.getByRole('region', { name: '本机 Agent', exact: true })
  await expect(agents).toContainText('已验证')
  await expect(agents).toContainText('boai-protocol-fixture')
  await runtime.page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await runtime.app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }) }, join(runtime.root, 'oauth'))
  await runtime.page.getByRole('button', { name: /手动添加/ }).click()
  await runtime.page.getByRole('button', { name: '选择目录加载', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '手动添加 Agent' })
  await expect(dialog).toContainText('使用本机登录接入 Agent')
  await expect(dialog.getByText('已导入', { exact: true })).toBeVisible()
  const imported = await runtime.page.evaluate(configId => window.boai.request('importLocalAgent', { configId, hostAccessAcknowledged: true }), localConfigState.loginId!)
  expect(imported.id).toBe(localConfigState.profileId)
  expect(await runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).toHaveLength(1)
  await dialog.getByRole('button', { name: '关闭 Agent 配置', exact: true }).click()
  expect(runtime.errors).toEqual([])
})

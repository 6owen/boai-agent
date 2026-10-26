/*
 * [OUTPUT]: 新原生目录场景以realpath固定程序和所选登录目录的规范路径，四处严格路径断言保持；旧ACP步骤不改。
 * [OUTPUT]: 明确原生Codex目录入口沿真实IPC保持协议，同账号ACP独立；无ACP程序仍可预填/测试/保存，换账号在新草稿测试/保存前拒绝，Claude无Codex目录入口。新增场景须实际运行后才计桌面通过。
 * [INPUT]: 本地配置导入中文场景、Electron fixture 与临时配置文件。
 * [OUTPUT]: 从本人头像菜单进入设置；协议选中值独立于装饰图标断言；模型 API 复用添加连接同一弹窗/第二步标题与关闭按钮、ACP 独立扫描与高级设置折叠；二级只读配置字段的值断言适配统一横向表单；品牌整行选择、第二级配置详情/手动目录加载及重扫链接；单一扫描入口及选择/配置两步向导，保留显式授权/保存前无配置与原业务断言；真实 IPC 扫描/导入及预览截图、源文件只读、无密钥预览、补填模型、协议保留、重启去重和原生目录选择、Codex ACP 登录接入/会话测试/执行/重启的验收。
 * [POS]: tests/e2e/steps/local-connections.steps.ts；不扫描真实用户目录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { chmod, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import type { LaunchProfile } from '../../../packages/shared/src/domain'

type State = { source?: string; codexId?: string; configId?: string; profileId?: string; loginId?: string; nativeStarts?: string; nativeSource?: string; legacyProgramSource?: string; legacyProfile?: LaunchProfile; nativeProfile?: LaunchProfile }
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
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
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

Given('本机目录协议使用独立的网页登录和双协议程序', async ({ runtime, localConfigState }) => {
  for (const name of ['codex', 'claude', 'oauth', 'bin']) await mkdir(join(runtime.root, name))
  const login = JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'native-directory-account', access_token: 'native-directory-secret', refresh_token: 'native-directory-refresh' } })
  await writeFile(join(runtime.root, 'oauth/auth.json'), login)
  localConfigState.nativeSource = login; localConfigState.nativeStarts = join(runtime.root, 'native-starts.txt')
  const acp = join(runtime.root, 'bin/codex-acp'), codex = join(runtime.root, 'bin/codex')
  localConfigState.legacyProgramSource = `#!/usr/bin/env node\nawait import(${JSON.stringify(pathToFileURL(resolve('tests/fixtures/acp-agent.mjs')).href)});\n`
  await writeFile(acp, localConfigState.legacyProgramSource)
  await writeFile(codex, `#!/usr/bin/env node\nimport { appendFileSync } from 'node:fs';appendFileSync(${JSON.stringify(localConfigState.nativeStarts)}, 'start\\n');await import(${JSON.stringify(pathToFileURL(resolve('tests/fixtures/codex-app-server.mjs')).href)});\n`)
  await chmod(acp, 0o755); await chmod(codex, 0o755)
  await runtime.start(); await configureScan(runtime); await settings(runtime)
  await runtime.app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }) }, join(runtime.root, 'oauth'))
  const scanned = await runtime.page.evaluate(() => window.boai.request('scanLocalConnections', { chooseDirectory: true }))
  const configId = scanned!.logins.find(item => item.authType === 'oauth')!.configId
  localConfigState.loginId = configId
  localConfigState.legacyProfile = await runtime.page.evaluate(configId => window.boai.request('importLocalAgent', { configId, hostAccessAcknowledged: true }), configId)
  expect(localConfigState.legacyProfile.protocol ?? 'acp').toBe('acp')
  await rm(acp)
  await expect(readFile(localConfigState.nativeStarts, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

When('明确选择本机 Codex 后从目录载入同账号登录', async ({ runtime, localConfigState }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await page.getByRole('button', { name: /^本机 Claude/ }).click()
  const claude = page.getByRole('dialog', { name: '手动添加 Agent', exact: true })
  await expect(claude.getByRole('button', { name: '选择目录加载', exact: true })).toHaveCount(0)
  await expect(claude.getByRole('textbox', { name: '启动命令', exact: true })).toHaveAttribute('placeholder', '例如 claude，或程序绝对路径')
  await claude.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: /^本机 Codex/ }).click()
  const manual = page.getByRole('dialog', { name: '手动添加 Agent', exact: true })
  await expect(manual.getByRole('textbox', { name: '启动命令', exact: true })).toHaveAttribute('placeholder', '例如 codex，或程序绝对路径')
  await expect(manual.getByRole('button', { name: '添加参数', exact: true })).toHaveCount(0)
  await manual.getByRole('button', { name: '选择目录加载', exact: true }).click()
  await expect(manual.getByText('已导入', { exact: true })).toHaveCount(0)
  await manual.getByRole('button', { name: 'Codex 配置', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '配置本机 Agent', exact: true })
  await expect(editor.getByRole('textbox', { name: 'Agent 名称', exact: true })).toHaveValue('本机 Codex · 本地登录')
  await editor.getByRole('button', { name: '高级设置', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: '启动命令', exact: true })).toHaveValue(await realpath(join(runtime.root, 'bin/codex')))
  await expect(editor.getByRole('textbox', { name: 'Codex 配置目录', exact: true })).toHaveValue(await realpath(join(runtime.root, 'oauth')))
  await expect(editor.getByRole('button', { name: '添加参数', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).toEqual([localConfigState.legacyProfile])
  expect(await readFile(join(runtime.root, 'oauth/auth.json'), 'utf8')).toBe(localConfigState.nativeSource)
  await expect(readFile(localConfigState.nativeStarts!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(editor).not.toContainText('native-directory-secret')
  await runtime.reviewNativeCheckpoint('原生Codex目录预填保持协议且未执行程序')
})

Then('原生目录草稿在测试和保存前拒绝换账号并独立于旧 ACP', async ({ runtime, localConfigState }) => {
  const page = runtime.page, editor = page.getByRole('dialog', { name: '配置本机 Agent', exact: true })
  const auth = join(runtime.root, 'oauth/auth.json')
  await editor.getByRole('checkbox', { name: /允许此 Agent 在本机运行/ }).check()
  await writeFile(auth, JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'changed-directory-account', access_token: 'changed-directory-secret' } }))
  await editor.getByRole('button', { name: '测试', exact: true }).click()
  await expect(editor).toContainText('源登录已变化或被移除')
  await expect(readFile(localConfigState.nativeStarts!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).toEqual([localConfigState.legacyProfile])
  const refreshed = JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'native-directory-account', access_token: 'refreshed-directory-secret', refresh_token: 'native-directory-refresh' } })
  await writeFile(auth, refreshed)
  await editor.getByRole('button', { name: '测试', exact: true }).click()
  await expect(editor.getByRole('status')).toContainText('测试成功 · Codex 0.159.3')
  const starts = await readFile(localConfigState.nativeStarts!, 'utf8'); expect(starts).toContain('start\n')
  await writeFile(auth, JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: 'changed-at-save', access_token: 'changed-save-secret' } }))
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toContainText('源登录已变化或被移除')
  expect(await readFile(localConfigState.nativeStarts!, 'utf8')).toBe(starts)
  expect(await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).toEqual([localConfigState.legacyProfile])
  await writeFile(auth, refreshed); localConfigState.nativeSource = refreshed
  await editor.getByRole('button', { name: '保存', exact: true }).click(); await expect(editor).toBeHidden()
  const profiles = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  expect(profiles).toHaveLength(2); expect(profiles.find(profile => profile.id === localConfigState.legacyProfile!.id)).toEqual(localConfigState.legacyProfile)
  const native = profiles.find(profile => profile.protocol === 'codex-app-server')!
  expect(native.id).not.toBe(localConfigState.legacyProfile!.id)
  expect(native).toMatchObject({ localConfigId: localConfigState.loginId, executable: await realpath(join(runtime.root, 'bin/codex')), codexHome: await realpath(join(runtime.root, 'oauth')), runtime: 'node', args: [], verified: { name: 'Codex', version: '0.159.3' } })
  expect(await readFile(auth, 'utf8')).toBe(refreshed); expect(await readFile(localConfigState.nativeStarts!, 'utf8')).toBe(starts)
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.connections).toEqual([]); expect(snapshot.conversations).toEqual([])
  expect(JSON.stringify(profiles)).not.toMatch(/directory-secret|directory-refresh/)
  localConfigState.nativeProfile = native
  await runtime.reviewData('原生目录新草稿来源核验及双协议独立', { profiles, nativeStarts: starts.split('\n').filter(Boolean).length, conversations: snapshot.conversations })
  await runtime.reviewNativeCheckpoint('原生Codex目录连接独立保存')
})

Then('重启后目录中的原生配置复用自身且旧导入仍为 ACP', async ({ runtime, localConfigState }) => {
  const starts = await readFile(localConfigState.nativeStarts!, 'utf8')
  await runtime.restart(); await configureScan(runtime); await settings(runtime)
  expect(await readFile(localConfigState.nativeStarts!, 'utf8')).toBe(starts)
  await runtime.app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }) }, join(runtime.root, 'oauth'))
  await runtime.page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await runtime.page.getByRole('button', { name: /^本机 Codex/ }).click()
  const manual = runtime.page.getByRole('dialog', { name: '手动添加 Agent', exact: true })
  await manual.getByRole('button', { name: '选择目录加载', exact: true }).click()
  await expect(manual.getByText('已导入', { exact: true })).toBeVisible()
  await manual.getByRole('button', { name: 'Codex 配置', exact: true }).click()
  const editor = runtime.page.getByRole('dialog', { name: '配置本机 Agent', exact: true })
  await expect(editor.getByRole('textbox', { name: 'Agent 名称', exact: true })).toHaveValue(localConfigState.nativeProfile!.name)
  await editor.getByRole('button', { name: '高级设置', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: '启动命令', exact: true })).toHaveValue(await realpath(join(runtime.root, 'bin/codex')))
  await editor.getByRole('button', { name: '保存', exact: true }).click(); await expect(editor).toBeHidden()
  expect(await runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).toEqual([localConfigState.legacyProfile, { ...localConfigState.nativeProfile!, revision: localConfigState.nativeProfile!.revision + 1, verified: undefined }])
  expect(await readFile(localConfigState.nativeStarts!, 'utf8')).toBe(starts)
  expect(await readFile(join(runtime.root, 'oauth/auth.json'), 'utf8')).toBe(localConfigState.nativeSource)
  const acp = join(runtime.root, 'bin/codex-acp')
  await writeFile(acp, localConfigState.legacyProgramSource!); await chmod(acp, 0o755)
  await runtime.page.evaluate(() => window.boai.request('scanLocalConnections', { chooseDirectory: true }))
  const imported = await runtime.page.evaluate(configId => window.boai.request('importLocalAgent', { configId, hostAccessAcknowledged: true }), localConfigState.loginId!)
  expect(imported).toEqual(localConfigState.legacyProfile)
  expect((await runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).map(profile => profile.id)).toEqual([localConfigState.legacyProfile!.id, localConfigState.nativeProfile!.id])
  expect(await readFile(localConfigState.nativeStarts!, 'utf8')).toBe(starts)
  expect(runtime.errors).toEqual([])
})

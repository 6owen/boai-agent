/*
 * [OUTPUT]: 原Claude状态可携带独立来源或模型ID/本机配置换绑目标；旧API场景缺省行为保持，候选值只供原表单拒绝核对，不作为新供应商执行。
 * [OUTPUT]: 本场状态区分离线强制退出与真实群消息更新；真实供应商路径不强制汇报判断。
 * [OUTPUT]: 真实重启区分源码系统钥匙串入口与应用包原入口，沿初次加密配置，不重读凭据或增加模型请求。
 * [OUTPUT]: 首次真实启动按既有混合场景区分源码钥匙串入口与应用包原入口；两者均核对实际系统加密、不使用mock/basic存储。
 * [INPUT]: 原Electron生命周期、AppService/SQLite、明确的Claude程序及隔离模型连接。
 * [OUTPUT]: 原UI员工/文件主路径、三类附件与图片传输/真实理解分口径；等待记忆终结、原生截图及重启续聊，失败也导出原件和状态。
 * [POS]: Claude员工产品BDD；离线协议与真实运行分别留证，密钥不进入renderer和证据。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test as base } from '../support/test'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import { nextMaterialDialog } from '../support/materials'
import { prepareCodexResources } from '../support/codex-resources'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { ConversationDetail } from '../../../src/shared/domain'

type State = { waitUpdate?: boolean; withholdWait?: boolean; switchSource?: { id: string; name: string }; switchBindings?: { modelId: string; profile: { id: string; name: string } }; real?: boolean; program?: string; connectionId?: string; connectionName?: string; employeeId?: string; conversationId?: string; token?: string; final?: ConversationDetail; media?: { threadId: string; imageBase64: string; token: string } }
export const test = base.extend<{ claudeEmployee: State }>({ claudeEmployee: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('Claude员工验收使用{string}和独立产品数据', async ({ runtime, claudeEmployee: state }, mode: string) => {
  state.real = mode === '真实Claude'
  test.skip(state.real && process.env.BOAI_TEST_REAL_CLAUDE !== '1', '真实Claude模型必须显式开启')
  test.setTimeout(600000)
  test.info().annotations.push({ type: 'model-mode', description: state.real ? 'real-provider' : 'offline-protocol-or-fixture' })
  state.token = `月桂-${randomUUID().slice(0, 8)}`
  await runtime.start()
  if (state.real) {
    expect(process.env.BOAI_CLAUDE_PROGRAM).toBeTruthy()
    state.program = process.env.BOAI_CLAUDE_PROGRAM!
    await runtime.close()
    const connection = await prepareSavedModel(runtime)
    state.connectionId = connection.id; state.connectionName = connection.name
    await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime))
    const encryption = await runtime.app.evaluate(({ app, safeStorage }) => ({ available: safeStorage.isEncryptionAvailable(), mockKeychain: app.commandLine.hasSwitch('use-mock-keychain'), basicStore: app.commandLine.hasSwitch('password-store') }))
    expect(encryption).toEqual({ available: true, mockKeychain: false, basicStore: false })
    await runtime.reviewData('真实模型使用产品系统加密', encryption)
  } else {
    state.program = join(runtime.root, 'claude-protocol.mjs')
    await copyFile(resolve('tests/fixtures/claude-employee.mjs'), state.program); await chmod(state.program, 0o700)
    const connection = await runtime.page.evaluate(() => window.boai.request('saveConnection', { name: '离线协议模型来源', provider: 'anthropic', baseUrl: 'http://127.0.0.1:9', defaultModel: 'fixture-model', apiKey: 'synthetic-test-only' }))
    state.connectionId = connection.id; state.connectionName = connection.name
  }
})

Then('Claude员工通过原附件入口接收图片文本和通用文件', async ({ runtime, claudeEmployee: state }) => {
  const resources = await prepareCodexResources(runtime.root), binary = join(await realpath(runtime.root), '不解析的原件.dat')
  await writeFile(binary, Buffer.from([0, 255, 19, 128, 0, 13, 211]))
  const page = runtime.page, read = () => page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const imageBase64 = (await readFile(resources.image)).toString('base64')
  try {
    for (const path of [resources.image, resources.material, binary]) {
      await runtime.reviewFile('Claude本场输入原件', path)
      await nextMaterialDialog(runtime, { path })
      await page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    }
    await expect(page.getByRole('region', { name: '待发送材料', exact: true }).locator('[data-material-draft-id]')).toHaveCount(3)
    expect((await read()).messages).toEqual([])
    await runtime.reviewNativeCheckpoint('Claude三附件原输入框草稿')
    const request = state.real ? '这是普通聊天。请从图片左到右说出三个色块的中文颜色名，并复述Markdown材料中的核对码。通用二进制文件只说明有附件，不声称读过正文。不创建文件或长期记忆。只用两行简短回答。' : 'empty-memory 读取图片和文本，通用文件只给元信息'
    await runtime.reviewData('图片理解核对依据', { request, imageOrder: resources.imageOrder, textToken: resources.textToken, modelMode: state.real ? 'real-provider' : 'offline-protocol', humanReview: 'pending' })
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const d = await read()
      return d.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || d.runs.some(run => run.phase === 'memory') && d.runs.every(run => run.status === 'completed')
    }, { timeout: 240000 }).toBe(true)
    const detail = await read()
    await runtime.reviewData('Claude附件处理实际状态', detail)
    await runtime.reviewNativeCheckpoint('Claude三附件原聊天实际回复')
    expect(detail.runs.filter(run => run.status !== 'completed')).toEqual([])
    expect(detail.materials).toHaveLength(3)
    expect(detail.materials?.map(material => material.format)).toEqual(expect.arrayContaining(['image', 'markdown', 'file']))
    expect(detail.workItems).toEqual([])
    const reply = detail.messages.filter(message => message.senderType === 'agent').at(-1)!
    if (state.real) {
      expect(reply.content).toContain(resources.textToken)
      expect(reply.content.match(/[紫绿橙]/g)?.slice(0, 3).join(',')).toBe(resources.imageOrder.split(',').map(color => color[0]).join(','))
    } else {
      const received = JSON.parse(await readFile(join(runtime.root, 'v2', 'agents', state.employeeId!, 'workspace', 'sessions', state.conversationId!, 'work', 'chat-received.json'), 'utf8'))
      expect(received.images).toEqual([{ mime: 'image/png', hash: createHash('sha256').update(Buffer.from(imageBase64, 'base64')).digest('hex') }])
      expect(JSON.stringify(received.payload)).toContain(resources.textToken)
      expect(JSON.stringify(received.payload)).toContain('no text has been extracted')
      await runtime.reviewData('离线员工实际收到的图片hash与文本', received)
    }
    for (const collection of ['messages', 'runs', 'snapshots', 'traceSpans', 'claudeSessions']) expect(JSON.stringify(await store.load(collection))).not.toContain(imageBase64)
    state.final = detail
    state.media = { threadId: (await store.load<{ threadId: string }>('claudeSessions'))[0].threadId, imageBase64, token: resources.textToken }
  } finally {
    await runtime.reviewData('Claude媒体最终状态及真实阶段', { detail: await read(), traces: await store.load('traceSpans') })
    await store.close()
  }
})

Then('重启后Claude图片会话只处理新增文字且不重放附件', async ({ runtime, claudeEmployee: state }) => {
  await runtime.close()
  await runtime.start(state.real && !process.env.BOAI_TEST_PACKAGED_PATH ? await systemKeychainLaunch(runtime) : undefined)
  const page = runtime.page, read = () => page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
  const original = await read()
  expect(original.messages).toEqual(state.final!.messages); expect(original.runs).toEqual(state.final!.runs)
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^本机 Claude 同事/ }).click()
  const request = state.real ? '刚才Markdown材料的核对码是什么？只重复核对码，不做任务或长期记忆。' : 'empty-memory 重启后只处理新增文字'
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => {
    const d = await read()
    return d.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || d.runs.filter(run => run.phase === 'memory').length === 2 && d.runs.every(run => run.status === 'completed')
  }, { timeout: 240000 }).toBe(true)
  const after = await read(), store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await runtime.reviewData('Claude媒体重启后原身份与结果', after)
    await runtime.reviewNativeCheckpoint('Claude图片会话重启后文字续聊')
    expect(after.runs.filter(run => run.status !== 'completed')).toEqual([])
    expect(after.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toContain(state.real ? state.media!.token : '只处理新增消息')
    expect((await store.load<{ threadId: string }>('claudeSessions'))[0].threadId).toBe(state.media!.threadId)
    expect(after.materials?.map(material => material.id)).toEqual(original.materials?.map(material => material.id))
    expect(after.workItems).toEqual([])
    if (!state.real) {
      const received = JSON.parse(await readFile(join(runtime.root, 'v2', 'agents', state.employeeId!, 'workspace', 'sessions', state.conversationId!, 'work', 'chat-received.json'), 'utf8'))
      expect(received.payload.contextMode).toBe('incremental'); expect(received.images).toEqual([])
      expect(received.payload.currentTurnMessages).toHaveLength(1)
    }
    for (const collection of ['messages', 'runs', 'snapshots', 'traceSpans', 'claudeSessions']) expect(JSON.stringify(await store.load(collection))).not.toContain(state.media!.imageBase64)
    expect(runtime.errors).toEqual([])
  } finally { await store.close() }
})

When('用户在设置核对Claude程序并在通讯录创建员工', async ({ runtime, claudeEmployee: state }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await page.getByRole('button', { name: '本机 Claude 使用已安装程序，在员工设置中选择模型 API', exact: true }).click()
  const connectionDialog = page.getByRole('dialog', { name: '手动添加 Agent', exact: true })
  await connectionDialog.getByRole('textbox', { name: '启动命令', exact: true }).fill(state.program!)
  await connectionDialog.getByRole('checkbox', { name: '允许此 Agent 在本机运行', exact: true }).check()
  await connectionDialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(connectionDialog.getByRole('status')).toContainText('程序已核对', { timeout: 30000 })
  await runtime.reviewCheckpoint('Claude程序核对只证明程序状态')
  await connectionDialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(connectionDialog).toBeHidden()
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('本机 Claude 同事')
  await dialog.getByRole('textbox', { name: '角色', exact: true }).fill('独立聊天与文件交付')
  await dialog.getByRole('textbox', { name: 'Prompt', exact: true }).fill('用中文简短回复。只完成当前明确请求，文件工作用宿主工具实际写入并正式发布；不需要联网、命令或额外研究。不要将本场临时核对码保存为长期记忆。')
  await dialog.getByRole('combobox', { name: '运行方式', exact: true }).click()
  await page.getByRole('option', { name: '本机 Claude', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: '本机连接', exact: true })).toContainText('本机 Claude')
  await dialog.getByRole('combobox', { name: '模型来源', exact: true }).click()
  await page.getByRole('option', { name: state.connectionName!, exact: true }).click()
  await expect(page.locator('[data-slot="select-content"]:visible')).toHaveCount(0)
  await runtime.reviewCheckpoint('新员工明确选择Claude程序与模型来源')
  await dialog.getByRole('button', { name: '创建员工', exact: true }).click()
  await expect(dialog).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const agent = snapshot.agents.find(value => value.name === '本机 Claude 同事')!
  expect(agent).toMatchObject({ executionBackend: { kind: 'claude-local' }, connectionId: state.connectionId, allowCommands: false })
  state.employeeId = agent.id; state.conversationId = snapshot.conversations.find(value => value.agentIds.includes(agent.id))!.id
  const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId)
  expect(detail.runs).toEqual([]); expect(detail.workItems).toEqual([])
  await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
})

Then('该Claude员工在原聊天连续答复并交付真实文件', async ({ runtime, claudeEmployee: state }) => {
  const page = runtime.page, read = () => page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const settled = async (count: number) => {
    await expect.poll(async () => {
      const d = await read()
      if (d.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))) return true
      return d.runs.filter(run => run.phase === 'execution').length >= count && d.runs.filter(run => run.phase === 'memory').length >= count && d.runs.every(run => run.status === 'completed') && d.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'].includes(turn.status))
    }, { timeout: 240000 }).toBe(true)
    const detail = await read()
    expect(detail.runs.filter(run => run.status !== 'completed')).toEqual([])
    expect(detail.runs.filter(run => run.phase === 'execution').length).toBeGreaterThanOrEqual(count)
    expect(detail.runs.filter(run => run.phase === 'memory').length).toBeGreaterThanOrEqual(count)
    expect(detail.runs.every(run => run.backend?.kind === 'claude-local')).toBe(true)
    return detail
  }
  const send = async (text: string) => { await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click() }
  try {
    await send(state.real ? `本次短期交流的核对码是“${state.token}”。现在只回复“已收到”，不做文件或长期记忆。` : 'empty-memory 首次聊天')
    await settled(1)
    const first = (await store.load<{ threadId: string }>('claudeSessions'))[0]
    expect(first.threadId).toBeTruthy()
    await runtime.reviewCheckpoint('Claude新员工首次回复')
    await send(state.real ? '刚才的核对码是什么？只回复原核对码，不执行任务。' : 'empty-memory 接着聊')
    const second = await settled(2)
    expect(second.workItems).toEqual([])
    expect(second.messages.filter(m => m.senderType === 'agent').at(-1)?.content).toContain(state.real ? state.token! : '只处理新增消息')
    expect((await store.load<{ threadId: string }>('claudeSessions'))[0].threadId).toBe(first.threadId)
    await runtime.reviewCheckpoint('同一Claude员工原生会话连续答复')
    const request = state.real ? `这是明确文件工作，请现在用宿主工具创建并正式发布 proof.txt，正文只包含“${state.token}”。写到本次自己的工作目录，完成后用真实成果证据报告已交付。无需联网、命令、研究或向我提问。` : '模块文件任务 empty-memory'
    await runtime.reviewData('Claude本次原始任务', { request, modelMode: state.real ? 'real-provider' : 'offline-protocol', humanReview: 'pending' })
    await send(request)
    const detail = await settled(3)
    expect(detail.workItems).toHaveLength(1)
    const work = detail.workItems![0]
    expect(work.status).toBe('delivered')
    expect(detail.artifacts).toHaveLength(1)
    const artifact = detail.artifacts[0], content = await readFile(artifact.path)
    expect(content.toString().trim()).toBe(state.real ? state.token : '生产工具真实原件')
    expect(createHash('sha256').update(content).digest('hex')).toBe(artifact.contentHash)
    expect(work.artifactIds).toEqual([artifact.id])
    expect(work.outcome?.evidence).toContainEqual({ kind: 'artifact', reference: artifact.id })
    expect(detail.workBudgets).toHaveLength(1)
    expect(detail.workBudgets![0]).toMatchObject({ callUnit: 'external-turn', unknownCalls: 0, usageIncomplete: false })
    const calls = await store.load<{ callUnit?: string; usageComplete?: boolean }>('budgetModelCalls')
    expect(calls.length).toBe(detail.workBudgets![0].modelCalls)
    expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete)).toBe(true)
    expect(await store.load('codexSessions')).toEqual([])
    const card = page.locator(`.messages [data-chat-artifact-id="${artifact.id}"]`)
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: '采用此版本', exact: true }).click()
    await expect(card.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
    await runtime.reviewFile('Claude员工实际发布文件', artifact.path)
    await runtime.reviewNativeCheckpoint('Claude员工原聊天交付与采用的原生整幅画面')
    state.final = await read()
    await runtime.reviewData('Claude原工作与已结算预算', { detail: state.final, calls })
  } finally { await runtime.reviewData('Claude桌面最终原始状态', await read()); await store.close() }
  expect(runtime.errors).toEqual([])
})

Then('重启保留Claude员工原工作和文件且不重复执行', async ({ runtime, claudeEmployee: state }) => {
  await runtime.restart()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Claude 同事', exact: true }).click()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(agent => agent.id === state.employeeId)).toMatchObject({ executionBackend: { kind: 'claude-local' }, connectionId: state.connectionId })
  const after = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
  expect(after.messages).toEqual(state.final!.messages)
  expect(after.runs).toHaveLength(state.final!.runs.length)
  expect(after.workItems).toEqual(state.final!.workItems)
  expect(after.workBudgets).toEqual(state.final!.workBudgets)
  expect(after.artifacts.map(file => ({ id: file.id, hash: file.contentHash }))).toEqual(state.final!.artifacts.map(file => ({ id: file.id, hash: file.contentHash })))
  const card = runtime.page.locator(`.messages [data-chat-artifact-id="${after.artifacts[0].id}"]`)
  await expect(card.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  await runtime.reviewNativeCheckpoint('重启保留Claude员工原文件与采用状态')
  await runtime.reviewData('Claude重启零重放核对', { beforeRuns: state.final!.runs.length, after })
  expect(runtime.errors).toEqual([])
})

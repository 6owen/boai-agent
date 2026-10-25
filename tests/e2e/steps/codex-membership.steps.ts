/*
 * [INPUT]: 原界面创建的两名本机员工、普通群和当前成员共享材料。
 * [OUTPUT]: 成员移除后留群员工仍可读原材料，离群私聊不携带来源；新成员历史授权及流式中移除/重新加入新会话分场景核验，旧运行不自动恢复。
 * [OUTPUT]: 原群设置在命令待批准/实际执行时移出负责人，核对原Work取消、审批失效、真实继承进程退出及重新加入/两次重启零重放。
 * [OUTPUT]: 多行命令经真实Shift+Enter输入，核对原消息完整命令和唯一提及；不以普通Enter提前发送或直接fill绕过群编辑器文档模型。
 * [OUTPUT]: 停机准备旧显式名单，原界面加入员工后核对原件/派生回复隔离与新群共享材料可读，重启不扩权或重放。
 * [OUTPUT]: 旧名单真实请求明确回看历史附件，不传离线控制标记；仅导出本场原生会话的公开聊天输入用于核对，不读取认证或内部推理。
 * [OUTPUT]: 材料范围与重启截图等待实际两位员工回复和侧栏空闲，不以加载画面证明恢复后的聊天效果。
 * [POS]: LR3/5本机群成员授权 BDD；不调用旧式逐材料授权接口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join, resolve } from 'node:path'
import { cp, readFile, readdir, realpath } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Desktop } from '../support/desktop'
import { processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { legacyMaterialGrant, nextMaterialDialog } from '../support/materials'
import { prepareCodexMaterialSource } from '../support/codex-resources'
import { openBindingEmployee } from '../support/skill-binding'
import type { BudgetModelCall } from '../../../packages/shared/src/domain'

const { Then } = createBdd(test)
async function prepareGroup(runtime: Desktop, firstId: string) {
  const page = runtime.page, names = ['本机 Codex 同事', '本机留群同事']
  const contacts = async () => page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  const create = async () => page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  await contacts(); await create()
  await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill(names[1])
  await editor.getByRole('textbox', { name: '角色', exact: true }).fill('核对当前获准材料')
  await editor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('简短回答当前用户。普通聊天不执行工具，只使用当前获准来源。')
  await editor.getByRole('combobox', { name: '运行方式', exact: true }).click()
  await page.getByRole('option', { name: '本机 Codex', exact: true }).click()
  await editor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(editor).toBeHidden()
  const secondId = (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.name === names[1])!.id
  await contacts(); await create()
  await page.getByRole('menuitem', { name: '新建群聊', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '发起群聊', exact: true })
  for (const name of names) await dialog.locator('label').filter({ hasText: name }).getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '完成', exact: true }).click(); await expect(dialog).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const group = snapshot.conversations.find(chat => chat.kind === 'group' && chat.agentIds.includes(firstId) && chat.agentIds.includes(secondId))!
  expect(snapshot.connections).toEqual([])
  const read = (id = group.id) => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const navigate = async (title: string) => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: title, exact: true }).click()
  }
  const send = async (id: string, content: string, count: number) => {
    const before = await read(id)
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const current = await read(id), runs = current.runs.filter(run => !before.runs.some(old => old.id === run.id))
      return runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || (current.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length === count && current.turns!.every(turn => turn.status === 'completed') && current.runs.every(run => run.status === 'completed'))
    }, { timeout: 450000 }).toBe(true)
    const after = await read(id)
    expect(after.runs.filter(run => run.status !== 'completed')).toEqual([])
    expect(after.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toHaveLength(count)
    expect(after.workItems).toEqual([])
    return after
  }
  return { page, names, group, firstId, secondId, read, navigate, send }
}

Then('群移除本机员工后留群成员仍能读材料且离群员工私聊不带入来源', async ({ runtime, codexEmployee }) => {
  test.setTimeout(1200000)
  const { page, names, group, firstId, secondId, read, navigate, send } = await prepareGroup(runtime, codexEmployee.employeeId!)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const sessions = () => store.load<{ agentId: string; conversationId: string; threadId: string; materials: { id: string }[]; memories: { id: string }[]; sources: { id: string }[] }>('codexSessions')
  try {
    await navigate(group.title)
    const source = await prepareCodexMaterialSource(runtime.root)
    await runtime.reviewFile('群当前成员共享的实际材料', source.path)
    await nextMaterialDialog(runtime, { path: source.path })
    await page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    await expect(page.locator('[data-material-status="ready"]')).toHaveCount(1)
    const before = await send(group.id, '这是普通聊天，不执行工具。请群里的每位员工分别读取本条附件，只回复附件中的完整暗号。', 2)
    const material = before.materials![0]
    expect(material.deliveryScope).toBe('conversation')
    for (const reply of before.messages.filter(message => message.senderType === 'agent')) expect(reply.content).toContain(source.code)
    const old = await sessions(), leftSession = old.find(session => session.agentId === firstId && session.conversationId === group.id)!
    expect(old).toHaveLength(2)
    expect(old.every(session => session.materials.some(ref => ref.id === material.id))).toBe(true)
    await runtime.reviewData('移除前真实群回复与两个来源映射', { detail: before, sessions: old })
    await runtime.reviewCheckpoint('两名本机员工实际读取当前群材料')

    await page.getByRole('button', { name: '会话操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '配置', exact: true }).click()
    const panel = page.locator('.detail-content:visible')
    await panel.getByRole('button', { name: `查看 ${names[0]}`, exact: true }).hover()
    await panel.getByRole('button', { name: `从群中移除 ${names[0]}`, exact: true }).click()
    await page.getByRole('button', { name: '确认移除', exact: true }).click()
    await panel.getByRole('button', { name: '保存设置', exact: true }).click()
    await expect.poll(async () => (await read()).conversation.agentIds).toEqual([secondId])
    await expect(panel).toBeHidden()
    await runtime.reviewCheckpoint('原群设置明确移除一名本机员工')
    const retained = await send(group.id, '这是普通聊天。请当前仍在群里的员工继续读取之前共享的附件，只回复其中的完整暗号。', 3)
    expect(retained.messages.filter(message => message.senderType === 'agent').at(-1)).toMatchObject({ senderId: secondId })
    expect(retained.messages.filter(message => message.senderType === 'agent').at(-1)!.content).toContain(source.code)
    expect(retained.runs.filter(run => run.agentId === firstId)).toEqual(before.runs.filter(run => run.agentId === firstId))
    expect((await sessions()).find(session => session.agentId === firstId && session.conversationId === group.id)).toEqual(leftSession)
    expect(retained.materials![0]).toEqual(material)

    await navigate(names[0])
    const direct = await send(codexEmployee.conversationId!, 'NATIVE_CLEARED_CONTEXT 这是独立私聊，不执行工具。本次没有提供暗号。只根据当前获准上下文回答；没有可用的附件暗号时只回复“没有可用暗号”，不要猜测或从其他聊天带入。', 1)
    expect(direct.messages.find(message => message.senderType === 'agent')!.content).toContain('没有可用暗号')
    expect(JSON.stringify(direct)).not.toContain(source.code)
    const current = await sessions(), directSession = current.find(session => session.conversationId === codexEmployee.conversationId)!
    expect(directSession.threadId).not.toBe(leftSession.threadId)
    expect(directSession.materials).toEqual([])
    expect(directSession.sources.map(value => value.id)).not.toContain(material.messageId)
    expect(await store.load('workItems')).toEqual([])
    expect(await store.load('budgetModelCalls')).toEqual([])
    await runtime.reviewData('离群后的真实群与独立私聊边界', { group: retained, direct, sessions: current })
    await runtime.reviewCheckpoint('离群员工独立私聊没有群材料暗号')
    const runs = await store.load('runs')
    await runtime.restart()
    expect((await read()).conversation.agentIds).toEqual([secondId])
    expect(await store.load('runs')).toEqual(runs)
    expect(await sessions()).toEqual(current)
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('本机群成员变化最终原始状态', { group: await read(), direct: await read(codexEmployee.conversationId!), sessions: await sessions(), runs: await store.load('runs'), memory: await store.load('memory') })
    await store.close()
  }
})

async function membershipPanel(runtime: Desktop) {
  const page = runtime.page
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  return page.locator('.detail-content:visible')
}

async function includeMember(runtime: Desktop, name: string) {
  const panel = await membershipPanel(runtime), page = runtime.page
  await panel.getByRole('button', { name: '添加群成员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加群成员', exact: true })
  await dialog.getByRole('checkbox', { name: new RegExp(name) }).check()
  await dialog.getByRole('button', { name: '添加', exact: true }).click()
  await panel.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(panel).toBeHidden()
}

Then('本机群旧附件保留显式名单且新成员仅能读取当前群共享材料', async ({ runtime, codexEmployee }) => {
  test.setTimeout(900000)
  const { names, group, firstId, secondId, read, navigate, send } = await prepareGroup(runtime, codexEmployee.employeeId!)
  await navigate(group.title)
  // Send before the second employee is a member: it must never have seen the old secret.
  const panel = await membershipPanel(runtime)
  await panel.getByRole('button', { name: `查看 ${names[1]}`, exact: true }).hover()
  await panel.getByRole('button', { name: `从群中移除 ${names[1]}`, exact: true }).click()
  await runtime.page.getByRole('button', { name: '确认移除', exact: true }).click()
  await panel.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(panel).toBeHidden()
  await expect.poll(async () => (await read()).conversation.agentIds).toEqual([firstId])
  const source = await prepareCodexMaterialSource(runtime.root)
  const sourceRoot = await realpath(runtime.root), original = join(sourceRoot, '旧授权原件.md')
  await cp(source.path, original); await runtime.reviewFile('旧显式授权材料原件', original)
  const attach = async (path: string) => {
    await nextMaterialDialog(runtime, { path })
    await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    await expect(runtime.page.locator('[data-material-draft-id][data-material-status="ready"]')).toHaveCount(1)
  }
  const request = (codexEmployee.real ? '' : 'NATIVE_CLEARED_CONTEXT ') + '这是普通聊天，不执行工具。请当前群里的每位员工分别回看本群历史中实际提供给自己的附件原文，包括先前轮次的原文。只回复自己当前有权读取的、最早一份附件中的完整暗号；如果从未收到可读的附件原文，只回复“没有可用暗号”。不要猜测或从其他员工回复中推测。'
  await attach(original)
  const before = await send(group.id, request, 1), material = before.materials![0]
  const firstReply = before.messages.find(message => message.senderType === 'agent')!
  expect(firstReply).toMatchObject({ senderId: firstId })
  expect(firstReply.content).toContain(source.code)
  expect(before.runs.every(run => run.agentId === firstId)).toBe(true)
  expect(before.messages.filter(message => message.senderType === 'user').some(message => message.content.includes(source.code))).toBe(false)
  await runtime.reviewData('旧名单准备前仅原员工实际读取', { detail: before, authorizedAgentIds: [firstId], excludedAgentId: secondId })
  await runtime.reviewCheckpoint('旧材料发送时只有原获准员工在群')
  await legacyMaterialGrant(runtime, join(runtime.root, 'v2'), material.id, [firstId])
  const migrated = await read()
  const { deliveryScope, ...legacy } = material
  expect(migrated.materials![0]).toEqual({ ...legacy, authorizedAgentIds: [firstId] })
  expect(migrated.messages).toEqual(before.messages)
  expect(migrated.runs).toEqual(before.runs)
  await navigate(group.title)
  await includeMember(runtime, names[1])
  await expect.poll(async () => (await read()).conversation.agentIds.slice().sort()).toEqual([firstId, secondId].sort())
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  type Session = { agentId: string; conversationId: string; materials: { id: string }[]; sources: { id: string }[]; threadId: string }
  const sessions = () => store.load<Session>('codexSessions')
  try {
    const restricted = await send(group.id, request, 3)
    const newReplies = restricted.messages.filter(message => message.senderType === 'agent' && !before.messages.some(old => old.id === message.id))
    expect(newReplies.find(message => message.senderId === firstId)!.content).toContain(source.code)
    expect(newReplies.find(message => message.senderId === secondId)!.content).toContain('没有可用暗号')
    expect(newReplies.find(message => message.senderId === secondId)!.content).not.toContain(source.code)
    const firstSessions = await sessions(), isolated = firstSessions.find(session => session.agentId === secondId)!
    expect(firstSessions).toHaveLength(2)
    expect(isolated.materials).toEqual([])
    expect(isolated.sources.map(value => value.id)).not.toContain(firstReply.id)
    expect(firstSessions.find(session => session.agentId === firstId)!.materials.map(value => value.id)).toContain(material.id)
    expect(restricted.materials![0]).toEqual(migrated.materials![0])
    await runtime.reviewData('新成员不可读旧原件及派生回复', { detail: restricted, sessions: firstSessions, excludedReplyId: firstReply.id, excludedMaterialId: material.id })
    await runtime.reviewCheckpoint('新加入员工明确没有旧附件暗号')

    const shared = await prepareCodexMaterialSource(runtime.root), sharedPath = join(sourceRoot, '当前群共享原件.md')
    await cp(shared.path, sharedPath); await runtime.reviewFile('当前群共享材料原件', sharedPath)
    await attach(sharedPath)
    const after = await send(group.id, request, 5)
    const sharedMaterial = after.materials!.find(value => value.id !== material.id)!
    expect(sharedMaterial.deliveryScope).toBe('conversation')
    expect(after.materials!.find(value => value.id === material.id)).toEqual(migrated.materials![0])
    const lastReplies = after.messages.filter(message => message.senderType === 'agent' && !restricted.messages.some(old => old.id === message.id))
    expect(lastReplies.find(message => message.senderId === firstId)!.content).toContain(source.code)
    expect(lastReplies.find(message => message.senderId === secondId)!.content).toContain(shared.code)
    expect(lastReplies.find(message => message.senderId === secondId)!.content).not.toContain(source.code)
    const finalSessions = await sessions(), newMember = finalSessions.find(session => session.agentId === secondId)!
    expect(newMember.materials.map(value => value.id)).toEqual([sharedMaterial.id])
    expect(finalSessions.find(session => session.agentId === firstId)!.materials.map(value => value.id).sort()).toEqual([material.id, sharedMaterial.id].sort())
    for (const message of after.messages.filter(value => value.senderType === 'agent' && value.senderId === firstId)) expect(newMember.sources.map(value => value.id)).not.toContain(message.id)
    const snapshots = await store.load<{ agent: { id: string }; materialRefs?: { id: string }[] }>('snapshots')
    expect(snapshots.filter(value => value.agent.id === secondId).some(value => value.materialRefs?.some(ref => ref.id === material.id))).toBe(false)
    expect(await store.load('workItems')).toEqual([])
    expect(await store.load('budgetModelCalls')).toEqual([])
    await runtime.reviewData('旧显式名单与当前群范围独立生效', { detail: after, sessions: finalSessions, snapshots, originalCode: source.code, sharedCode: shared.code })
    const visibleReplies = async () => {
      await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
      await expect(runtime.page.getByText(shared.code, { exact: false }).last()).toBeVisible()
      await expect(runtime.page.getByText(source.code, { exact: false }).last()).toBeVisible()
      await expect(runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: group.title, exact: true })).not.toContainText('处理中')
    }
    await visibleReplies()
    await runtime.reviewCheckpoint('原员工读取旧附件新员工只读当前共享附件')
    await runtime.restart()
    const reopened = await read()
    expect(reopened.messages).toEqual(after.messages)
    expect(reopened.runs).toEqual(after.runs)
    expect(reopened.materials).toEqual(after.materials)
    expect(await sessions()).toEqual(finalSessions)
    expect(reopened.workItems).toEqual([])
    await navigate(group.title)
    await visibleReplies()
    await runtime.reviewCheckpoint('重启保留两种授权与原群回复')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('旧显式名单最终原始状态', { detail: await read(), sessions: await sessions(), memory: await store.load('memory'), snapshots: await store.load('snapshots') })
    if (codexEmployee.real) for (const session of await sessions()) {
      // This scenario explicitly uses the installed login; read only its own exact thread files.
      const directory = join(process.env.HOME!, '.codex', 'sessions')
      const paths = (await readdir(directory, { recursive: true })).filter(path => path.endsWith('.jsonl') && path.includes(session.threadId))
      expect(paths.length).toBeGreaterThan(0)
      const inputs: unknown[] = []
      for (const path of paths) for (const line of (await readFile(join(directory, path), 'utf8')).split('\n').filter(Boolean)) {
        const event = JSON.parse(line)
        if (event.type !== 'response_item' || event.payload?.type !== 'message' || event.payload.role !== 'user') continue
        for (const item of event.payload.content ?? []) if (item.type === 'input_text' && item.text.includes('"protocol":"employee-chat-v1"')) inputs.push(JSON.parse(item.text))
      }
      expect(inputs.length).toBeGreaterThan(0)
      if (session.agentId === firstId) expect(JSON.stringify(inputs)).toContain(source.code)
      else expect(JSON.stringify(inputs)).not.toContain(source.code)
      await runtime.reviewData(`本场原生会话公开输入-${session.agentId}`, { threadId: session.threadId, agentId: session.agentId, inputs })
    }
    await store.close()
  }
})

Then('本机群任务在{string}移出负责人后实际退出且重新加入不续做', async ({ runtime, codexEmployee }, stage: string) => {
  test.skip(process.platform === 'win32', '本场验证POSIX继承进程组，Windows另行验收')
  test.setTimeout(660000)
  expect(['等待批准', '命令执行中']).toContain(stage)
  const executing = stage === '命令执行中'
  const { page, names, group, firstId, secondId, read, navigate } = await prepareGroup(runtime, codexEmployee.employeeId!)
  const commandPath = resolve('tests/fixtures/native-command.sh'), command = await readFile(commandPath, 'utf8')
  const recordedCommand = join(runtime.root, 'authorized-membership-command.sh')
  await cp(commandPath, recordedCommand); await runtime.reviewFile('群任务明确授权的命令原件', recordedCommand)
  await openBindingEmployee(runtime, names[0])
  await page.getByRole('checkbox', { name: /允许申请运行命令/ }).check()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === firstId)?.allowCommands).toBe(true)
  await navigate(group.title)
  const request = `NATIVE_FILE_TASK NATIVE_CANCEL_COMMAND：这是明确工作，仅被点名的员工负责，其他群成员不执行、不接手、不回复。请实际执行以下命令，这是我要通过移出群成员停止的长任务。仅在原聊天请求批准，通过 execute_command 原样执行一次；不要提前结束，不运行其他工具或发布成果。命令只在本次工作目录保存PID和计数。\n\n${command}`
  await runtime.reviewData('群任务原始请求及移除阶段', { stage, request, realSupplier: !!codexEmployee.real })
  await page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
  await page.getByRole('option', { name: `@${names[0]}`, exact: true }).click()
  const composer = page.getByRole('textbox', { name: '消息内容', exact: true })
  for (const [index, line] of request.split('\n').entries()) {
    if (index) await composer.press('Shift+Enter')
    if (line) await composer.pressSequentially(line)
  }
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await expect.poll(async () => {
      const detail = await read()
      return (await snapshot()).approvals.some(approval => approval.conversationId === group.id) || detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.runs.some(run => run.phase === 'execution' && run.status === 'completed')
    }, { timeout: 260000 }).toBe(true)
    const approval = (await snapshot()).approvals.find(value => value.conversationId === group.id)!
    expect(approval).toBeDefined(); expect(approval.command.trim()).toBe(command.trim())
    const before = await read(), work = before.workItems!.find(value => value.activeRunId === approval.runId)!
    expect(work.ownerAgentId).toBe(firstId)
    expect(before.workItems).toHaveLength(1)
    expect(before.messages.find(message => message.id === work.sourceMessageId)?.mentionIds).toEqual([firstId])
    expect(before.messages.find(message => message.id === work.sourceMessageId)?.content).toContain(command.trim())
    expect(before.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
    const card = page.locator(`[data-approval-id="${approval.id}"]`)
    await expect(card).toBeVisible()
    await expect(readFile(join(approval.cwd, 'command-parent.pid'))).rejects.toMatchObject({ code: 'ENOENT' })
    await runtime.reviewData('移除前原群工作与审批', { approval, before })
    await runtime.reviewCheckpoint('原群仅点名负责人请求真实命令审批')
    let parent: number | undefined, child: number | undefined
    if (executing) {
      await card.getByRole('button', { name: '允许这次执行', exact: true }).click()
      await expect.poll(() => readFile(join(approval.cwd, 'command-child.pid'), 'utf8').catch(() => ''), { timeout: 10000 }).toMatch(/^\d+$/)
      parent = Number(await readFile(join(approval.cwd, 'command-parent.pid'), 'utf8'))
      child = Number(await readFile(join(approval.cwd, 'command-child.pid'), 'utf8'))
      expect(processIsRunning(parent)).toBe(true); expect(processIsRunning(child)).toBe(true)
      await expect.poll(() => readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8').catch(() => ''), { timeout: 10000 }).toContain('tick\n')
    }
    const processes = await runtimeChildProcessIds(runtime)
    expect(processes.length).toBeGreaterThan(0)
    if (executing) { expect(processes).toContain(parent); expect(processes).toContain(child) }
    const panel = await membershipPanel(runtime)
    await panel.getByRole('button', { name: `查看 ${names[0]}`, exact: true }).hover()
    await panel.getByRole('button', { name: `从群中移除 ${names[0]}`, exact: true }).click()
    await page.getByRole('button', { name: '确认移除', exact: true }).click()
    // Prove this precise active boundary immediately before the real settings save.
    const active = await read()
    expect(active.runs.find(run => run.id === approval.runId)?.status).toBe(executing ? 'running' : 'waiting_approval')
    if (executing) { expect(processIsRunning(parent!)).toBe(true); expect(processIsRunning(child!)).toBe(true) }
    else expect((await snapshot()).approvals.find(value => value.id === approval.id)).toEqual(approval)
    await runtime.reviewData('保存移除前仍真实活动的执行', { stage, active, parent, child, processes })
    await panel.getByRole('button', { name: '保存设置', exact: true }).click(); await expect(panel).toBeHidden()
    await expect.poll(async () => (await read()).conversation.agentIds).toEqual([secondId])
    await expect.poll(() => processes.filter(processIsRunning), { timeout: 30000 }).toEqual([])
    if (executing) expect(processIsRunning(-parent!)).toBe(false)
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.every(run => ['completed', 'cancelled', 'failed', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'cancelled', 'failed', 'interrupted'].includes(turn.status))
    }, { timeout: 30000 }).toBe(true)
    const stopped = await read(), calls = await store.load<BudgetModelCall>('budgetModelCalls'), sessions = await store.load('codexSessions')
    expect(stopped.runs.find(run => run.id === approval.runId)).toMatchObject({ status: 'cancelled', error: '群成员或共享资料权限已变更' })
    expect(stopped.workItems).toHaveLength(1)
    expect(stopped.workItems![0]).toMatchObject({ id: work.id, ownerAgentId: firstId, budgetId: work.budgetId, status: 'cancelled', requiresReview: executing, artifactIds: [], resultMessageIds: [] })
    expect(stopped.runs.some(run => run.phase === 'memory')).toBe(false)
    expect(stopped.artifacts).toEqual([])
    expect(calls.some(call => call.runId === approval.runId && !call.usageComplete)).toBe(true)
    expect((await snapshot()).approvals).toEqual([])
    await expect(page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    const ticks = executing ? await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8') : undefined
    if (executing) for (const name of ['command-parent.pid', 'command-child.pid', 'command-ticks.txt']) await runtime.reviewFile(`离群后命令原件 · ${name}`, join(approval.cwd, name))
    else for (const name of ['command-parent.pid', 'command-child.pid', 'command-ticks.txt']) await expect(readFile(join(approval.cwd, name))).rejects.toMatchObject({ code: 'ENOENT' })
    await runtime.reviewData('群移除后的取消和真实退出', { stage, stopped, calls, sessions, parent, child, processes, allExited: true, ticks })
    await page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
    await expect(page.locator(`[data-work-id="${work.id}"]:visible`)).toContainText('已停止')
    await runtime.reviewCheckpoint('移出群后原任务已停止且没有交付')
    const assertUnchanged = async () => {
      const detail = await read()
      expect(detail.workItems).toEqual(stopped.workItems); expect(detail.runs).toEqual(stopped.runs); expect(detail.messages).toEqual(stopped.messages)
      expect(await store.load('budgetModelCalls')).toEqual(calls); expect(await store.load('codexSessions')).toEqual(sessions)
      expect((await snapshot()).approvals).toEqual([])
      expect(processes.filter(processIsRunning)).toEqual([])
      if (executing) { expect(processIsRunning(-parent!)).toBe(false); expect(await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')).toBe(ticks) }
      else await expect(readFile(join(approval.cwd, 'command-parent.pid'))).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(runtime.page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    }
    await runtime.restart(); await assertUnchanged()
    expect((await read()).conversation.agentIds).toEqual([secondId])
    await navigate(group.title); await includeMember(runtime, names[0])
    expect(new Set((await read()).conversation.agentIds)).toEqual(new Set([firstId, secondId]))
    await assertUnchanged()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
    await expect(runtime.page.locator(`[data-work-id="${work.id}"]:visible`)).toContainText('已停止')
    await runtime.reviewCheckpoint('重新加入后仍是原停止任务不自动续做')
    await runtime.restart(); await assertUnchanged()
    expect(new Set((await read()).conversation.agentIds)).toEqual(new Set([firstId, secondId]))
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('活动群工作撤权最终原始状态', { stage, detail: await read(), calls: await store.load('budgetModelCalls'), executions: await store.load('workExecutions'), sessions: await store.load('codexSessions'), traces: await store.load('traceSpans') })
    await store.close()
  }
})

Then('新加入的本机员工只从当前获准群历史读取原附件', async ({ runtime, codexEmployee }) => {
  test.setTimeout(1200000)
  const { page, group, read, navigate, send } = await prepareGroup(runtime, codexEmployee.employeeId!)
  const name = '本机新入群同事'
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill(name)
  await editor.getByRole('textbox', { name: '角色', exact: true }).fill('按当前成员资格核对材料')
  await editor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('简短回答当前用户。普通聊天不执行工具，只读取当前获准来源。')
  await editor.getByRole('combobox', { name: '运行方式', exact: true }).click()
  await page.getByRole('option', { name: '本机 Codex', exact: true }).click()
  await editor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(editor).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const employee = snapshot.agents.find(agent => agent.name === name)!
  const direct = snapshot.conversations.find(chat => chat.kind === 'direct' && chat.agentIds[0] === employee.id)!
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const sessions = () => store.load<{ agentId: string; conversationId: string; threadId: string; materials: { id: string }[]; sources: { id: string }[] }>('codexSessions')
  try {
    await navigate(group.title)
    const source = await prepareCodexMaterialSource(runtime.root)
    await runtime.reviewFile('新成员加入之前发送的群材料', source.path)
    await nextMaterialDialog(runtime, { path: source.path })
    await page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    await expect(page.locator('[data-material-status="ready"]')).toHaveCount(1)
    const original = await send(group.id, '这是普通聊天，不执行工具。请当前两位群成员分别读取本条附件，只回复其中的完整暗号。', 2)
    const material = original.materials![0]
    expect(material.deliveryScope).toBe('conversation')
    expect(original.runs.some(run => run.agentId === employee.id)).toBe(false)
    for (const reply of original.messages.filter(message => message.senderType === 'agent')) expect(reply.content).toContain(source.code)
    await navigate(name)
    const privateBefore = await send(direct.id, 'NATIVE_CLEARED_CONTEXT 这是独立私聊，普通聊天不使用工具。目前没有提供附件暗号。只根据当前获准上下文回答，若没有可用暗号只回复“没有可用暗号”。', 1)
    expect(privateBefore.messages.find(message => message.senderType === 'agent')!.content).toContain('没有可用暗号')
    expect(JSON.stringify(privateBefore)).not.toContain(source.code)
    const privateSession = (await sessions()).find(session => session.conversationId === direct.id)!
    expect(privateSession.materials).toEqual([])
    const beforeRuns = await store.load('runs')
    await navigate(group.title); await includeMember(runtime, name)
    expect((await read()).conversation.agentIds).toContain(employee.id)
    expect(await store.load('runs')).toEqual(beforeRuns)
    expect((await sessions()).some(session => session.conversationId === group.id && session.agentId === employee.id)).toBe(false)
    await runtime.reviewCheckpoint('新员工加入现有群没有自动执行')
    const result = await send(group.id, '这是普通聊天，不使用工具。请当前所有群成员各自读取此前已经发送在本群的附件，只回复附件中的完整暗号。', 5)
    const reply = result.messages.find(message => message.senderId === employee.id)!
    expect(reply.content).toContain(source.code)
    const all = await sessions(), joined = all.find(session => session.agentId === employee.id && session.conversationId === group.id)!
    expect(joined.threadId).not.toBe(privateSession.threadId)
    expect(joined.materials.map(ref => ref.id)).toContain(material.id)
    expect(joined.sources.map(ref => ref.id)).toContain(material.messageId)
    expect(all.find(session => session.conversationId === direct.id)).toEqual(privateSession)
    expect(result.materials![0]).toEqual(material)
    expect(await store.load('workItems')).toEqual([]); expect(await store.load('budgetModelCalls')).toEqual([])
    await runtime.reviewData('新成员加入前后实际来源与回复', { original, privateBefore, result, privateSession, joined, sessions: all })
    await runtime.reviewCheckpoint('新成员在原群读取获准历史附件')
    const runs = await store.load('runs')
    await runtime.restart()
    expect((await read()).conversation.agentIds).toContain(employee.id)
    expect(await store.load('runs')).toEqual(runs); expect(await sessions()).toEqual(all)
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('新成员历史授权最终原始状态', { group: await read(), direct: await read(direct.id), sessions: await sessions(), runs: await store.load('runs'), traces: await store.load('traceSpans') })
    await store.close()
  }
})

Then('本机员工流式中移除后实际退出且重新加入不恢复旧运行', async ({ runtime, codexEmployee }) => {
  test.setTimeout(1200000)
  const { page, names, group, firstId, secondId, read, navigate } = await prepareGroup(runtime, codexEmployee.employeeId!)
  const code = `CHAT_CODE_${randomUUID()}`, end = `REVOKED_END_${randomUUID()}`
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const sessions = () => store.load<{ agentId: string; conversationId: string; threadId: string; runId: string; state: string }>('codexSessions')
  try {
    await navigate(group.title)
    await page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
    await page.getByRole('option', { name: `@${names[0]}`, exact: true }).click()
    await page.getByRole('textbox', { name: '消息内容', exact: true }).pressSequentially(`这是普通聊天，不是任务，不使用工具，仅被点名的员工回复，其他人不回复。本群临时暗号是 ${code}。${codexEmployee.real ? `请先回复包含暗号的开场白，然后逐行给出001至200这200个编号，每行一句不同的简短问候，完整写完后最后一行只写 ${end}。` : 'NATIVE_STREAM_HOLD 请在原聊天流式回复暗号。'}`)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await read()).messages.some(message => message.senderId === firstId && message.status === 'streaming' && message.content.trim().length > 0), { timeout: 260000, intervals: [100, 200] }).toBe(true)
    const during = await read(), message = during.messages.find(value => value.senderId === firstId && value.status === 'streaming')!
    const pending = (await sessions()).find(session => session.runId === message.runId)!
    expect(pending.state).toBe('pending')
    const pids = await runtimeChildProcessIds(runtime); expect(pids.length).toBeGreaterThan(0)
    await runtime.reviewData('移除前实际流式运行与本场子进程', { during, pending, pids })
    await runtime.reviewCheckpoint('原员工仍在流式回复时准备移除')
    const panel = await membershipPanel(runtime)
    await panel.getByRole('button', { name: `查看 ${names[0]}`, exact: true }).hover()
    await panel.getByRole('button', { name: `从群中移除 ${names[0]}`, exact: true }).click()
    await page.getByRole('button', { name: '确认移除', exact: true }).click()
    // If this run has already finished, the case did not exercise revocation in flight.
    expect((await read()).runs.find(run => run.id === message.runId)?.status).toBe('running')
    await panel.getByRole('button', { name: '保存设置', exact: true }).click(); await expect(panel).toBeHidden()
    await expect.poll(async () => pids.filter(processIsRunning), { timeout: 180000 }).toEqual([])
    await expect.poll(async () => (await read()).runs.every(run => ['completed', 'cancelled'].includes(run.status)), { timeout: 180000 }).toBe(true)
    const stopped = await read(), old = stopped.messages.find(value => value.id === message.id)!
    expect(stopped.conversation.agentIds).toEqual([secondId])
    expect(stopped.runs.find(run => run.id === message.runId)).toMatchObject({ status: 'cancelled', error: '群成员或共享资料权限已变更' })
    expect(old.status).toBe('cancelled'); expect(old.content).not.toContain(end)
    expect((await sessions()).find(session => session.runId === message.runId)).toMatchObject({ state: 'pending', threadId: pending.threadId })
    await runtime.reviewCheckpoint('原聊天保留已取消的部分回复')
    const runs = await store.load('runs'), all = await sessions()
    await runtime.restart()
    expect(await store.load('runs')).toEqual(runs); expect(await sessions()).toEqual(all)
    await navigate(group.title)
    await includeMember(runtime, names[0])
    expect(await store.load('runs')).toEqual(runs); expect(await sessions()).toEqual(all)
    const currentPage = runtime.page
    await currentPage.getByRole('button', { name: '提及群聊成员', exact: true }).click()
    await currentPage.getByRole('option', { name: `@${names[0]}`, exact: true }).click()
    await currentPage.getByRole('textbox', { name: '消息内容', exact: true }).pressSequentially('这是新的普通聊天，不执行工具。只回复本群之前用户给出的完整暗号，不继续之前被取消的长回复。其他员工不用回复。')
    await currentPage.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read(), next = detail.runs.filter(run => !runs.some(old => (old as { id: string }).id === run.id))
      return next.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || (detail.messages.some(reply => reply.senderId === firstId && reply.status === 'completed') && next.length > 0 && next.every(run => run.status === 'completed'))
    }, { timeout: 450000 }).toBe(true)
    const after = await read(), next = after.runs.filter(run => !runs.some(old => (old as { id: string }).id === run.id))
    expect(next.every(run => run.status === 'completed')).toBe(true)
    expect(after.messages.find(reply => reply.senderId === firstId && reply.status === 'completed')!.content).toContain(code)
    expect(after.messages.find(reply => reply.id === old.id)).toEqual(old)
    const resumed = (await sessions()).find(session => session.agentId === firstId && session.conversationId === group.id)!
    expect(resumed.state).toBe('completed'); expect(resumed.threadId).not.toBe(pending.threadId)
    expect(await store.load('workItems')).toEqual([]); expect(await store.load('budgetModelCalls')).toEqual([])
    await runtime.reviewData('流式撤权与重新加入新交流边界', { stopped, oldSession: pending, after, newSession: resumed, stoppedProcessIds: pids })
    await runtime.reviewCheckpoint('重新加入后明确新消息建立新会话')
    const finalRuns = await store.load('runs'), finalSessions = await sessions()
    await runtime.restart()
    expect(await store.load('runs')).toEqual(finalRuns); expect(await sessions()).toEqual(finalSessions)
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('本机流式成员撤权最终原始状态', { detail: await read(), sessions: await sessions(), runs: await store.load('runs'), traces: await store.load('traceSpans') })
    await store.close()
  }
})

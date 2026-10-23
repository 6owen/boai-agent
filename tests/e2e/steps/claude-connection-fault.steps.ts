/*
 * [INPUT]: 原Claude员工UI、已核对启动项和本场自有程序副本；离线协议与真实CLI/API分批明确启用。
 * [OUTPUT]: 程序外改/丢失时旧verified不能绕过调用前核对；失败位于执行器信息保存前，按原员工身份和实际调用账本核对；恢复重测和两次重启不重放，明确新消息才执行。
 * [POS]: Claude程序身份故障BDD；不改个人安装、登录或模型连接，不用任务预算为空代替普通聊天零调用证据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { constants } from 'node:fs'
import { appendFile, chmod, copyFile, mkdir, readFile, realpath, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { ProfileModelCall } from '../../../src/runtime/modules/profile/profile-activity'

const { Given, Then } = createBdd(test)
const hash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex')

Given('本场Claude程序来自独立可恢复副本', async ({ runtime, claudeEmployee: state }) => {
  const source = state.program!, directory = join(await realpath(runtime.root), 'owned-Claude-program')
  await mkdir(directory)
  const executable = join(directory, state.real ? 'claude' : 'claude-protocol.mjs')
  await copyFile(source, executable, constants.COPYFILE_FICLONE)
  await chmod(executable, 0o700)
  expect(await hash(executable)).toBe(await hash(source))
  state.program = executable
  await runtime.reviewData('Claude故障仅使用本场程序副本', { source, executable, executableHash: await hash(executable), copyMethod: 'COPYFILE_FICLONE with copy fallback', personalProgramChanged: false })
})

Then('Claude程序遇到{string}后明确修复且只执行新消息', async ({ runtime, claudeEmployee: state }, fault: string) => {
  test.setTimeout(360000)
  expect(['程序被替换', '程序丢失']).toContain(fault)
  const executable = state.program!, backup = executable + '.original'
  await copyFile(executable, backup, constants.COPYFILE_FICLONE)
  const page = runtime.page, id = state.conversationId!
  const profiles = () => runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const profile = (await profiles()).find(value => value.executable === executable)!
  expect(profile.verified).toMatchObject({ name: 'Claude', version: '2.1.214' })
  const connections = (await page.evaluate(() => window.boai.request('snapshot', undefined))).connections
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const facts = async () => ({ detail: await read(), calls: await store.load<ProfileModelCall>('profileModelCalls'), budgets: await store.load('budgetModelCalls'), sessions: await store.load('claudeSessions') })
  const settings = async () => {
    await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  }
  const chat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Claude 同事', exact: true }).click()
  }
  const testProgram = async () => {
    await runtime.page.getByRole('region', { name: '本机 Agent', exact: true }).getByRole('button', { name: `管理 ${profile.name}`, exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '测试', exact: true }).click()
  }
  const send = async (content: string) => {
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  }
  const blocked = async (count: number, expectedError: RegExp) => {
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.filter(run => run.status === 'failed').length === count && detail.turns?.every(turn => turn.status === 'failed')
    }).toBe(true)
    const current = await facts()
    expect(current.detail.runs).toHaveLength(count)
    expect(current.detail.runs.every(run => run.phase === 'decision' && run.status === 'failed' && run.agentId === state.employeeId && run.backend === undefined)).toBe(true)
    expect(current.detail.runs.at(-1)?.error).toMatch(expectedError)
    expect(current.detail.workItems).toEqual([])
    expect(current.detail.messages.filter(message => message.senderType === 'user')).toHaveLength(count)
    expect(current.calls).toEqual([]); expect(current.budgets).toEqual([]); expect(current.sessions).toEqual([])
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual(connections)
    return current
  }
  try {
    if (fault === '程序被替换') await appendFile(executable, '\n// owned program identity fault\n')
    else await rename(executable, executable + '.missing')
    const status = await page.evaluate(id => window.boai.request('getLaunchProfileStatus', { id }), profile.id)
    expect(status.status).toBe(fault === '程序被替换' ? 'changed' : 'unavailable')
    expect((await profiles()).find(value => value.id === profile.id)).toEqual(profile)
    await send('这是程序故障期间的普通问候，不能调用其他运行方式或模型。')
    const stale = await blocked(1, fault === '程序被替换' ? /Claude程序已变化，请重新核对/ : /ENOENT/)
    await runtime.reviewData('旧Claude验证不能绕过实际程序身份', { fault, profile, status, facts: stale })
    await runtime.reviewNativeCheckpoint(fault + '时旧Claude验证的新消息被阻止')

    await settings(); await testProgram()
    await expect.poll(async () => (await profiles()).find(value => value.id === profile.id)?.verified).toBeUndefined()
    const region = runtime.page.getByRole('region', { name: '本机 Agent', exact: true })
    await expect(region.getByRole('alert')).toBeVisible()
    const verificationError = await region.getByRole('alert').innerText()
    expect(verificationError.trim()).not.toBe('')
    await runtime.reviewData('原Claude程序测试失败撤销旧验证', { fault, verificationError, current: (await profiles()).find(value => value.id === profile.id), facts: await facts() })
    await region.getByRole('alert').scrollIntoViewIfNeeded()
    await runtime.reviewNativeCheckpoint(fault + '的Claude原设置测试失败')
    await chat(); await send('这是验证已失效后的另一条普通消息，不能执行旧消息。')
    const failed = await blocked(2, /请先核对本机Claude程序/)
    await runtime.reviewData('未验证Claude的新消息不调用API或原生会话', { fault, facts: failed })

    await copyFile(backup, executable, constants.COPYFILE_FICLONE); await chmod(executable, 0o700)
    expect(await hash(executable)).toBe(profile.executableHash)
    await settings(); await testProgram()
    await expect.poll(async () => (await profiles()).find(value => value.id === profile.id)?.verified?.version).toBe('2.1.214')
    const recovered = (await profiles()).find(value => value.id === profile.id)!
    expect(recovered).toMatchObject({ id: profile.id, revision: profile.revision, executableHash: profile.executableHash })
    expect(await facts()).toEqual(failed)
    await runtime.reviewData('Claude恢复原字节并明确重测不重放失败消息', { fault, recovered, facts: await facts() })
    await runtime.reviewNativeCheckpoint(fault + '修复后Claude程序重新核对')
    await runtime.restart()
    expect(await facts()).toEqual(failed)
    await runtime.reviewData('Claude故障修复首次重启零调用', { fault, facts: await facts() })

    await chat()
    const request = state.real ? `这是新的普通聊天，请只复述核对码“${state.token}”，不执行文件任务或长期记忆。` : 'empty-memory 首次聊天'
    await send(request)
    await expect.poll(async () => {
      const added = (await read()).runs.filter(run => !failed.detail.runs.some(old => old.id === run.id))
      return added.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || added.length === 3 && added.every(run => run.status === 'completed')
    }, { timeout: 240000 }).toBe(true)
    const final = await facts(), added = final.detail.runs.filter(run => !failed.detail.runs.some(old => old.id === run.id))
    expect(added).toHaveLength(3)
    expect(added.every(run => run.status === 'completed' && run.backend?.kind === 'claude-local')).toBe(true)
    expect(added.map(run => run.phase).sort()).toEqual(['decision', 'execution', 'memory'])
    expect(final.detail.runs.filter(run => failed.detail.runs.some(old => old.id === run.id))).toEqual(failed.detail.runs)
    for (const message of failed.detail.messages) expect(final.detail.messages.find(value => value.id === message.id)).toEqual(message)
    expect(final.detail.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toContain(state.real ? state.token! : '首次公开回复')
    expect(final.detail.workItems).toEqual([]); expect(final.budgets).toEqual([])
    expect(final.calls).toHaveLength(3)
    expect(final.calls.every(call => added.some(run => run.id === call.runId) && call.finishedAt)).toBe(true)
    expect(final.sessions).toHaveLength(1)
    await runtime.reviewData('Claude修复后只有明确新消息完成三个阶段', { fault, request, facts: final, internalModelCalls: 'unknown' })
    await runtime.reviewNativeCheckpoint(fault + '修复后新Claude消息独立完成')
    await runtime.restart()
    expect(await facts()).toEqual(final)
    expect((await profiles()).find(value => value.id === profile.id)).toEqual(recovered)
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual(connections)
    expect(runtime.errors).toEqual([])
    await runtime.reviewData('Claude故障恢复第二次重启保持旧失败与新回复', { fault, facts: await facts() })
  } finally {
    await runtime.reviewData('Claude程序故障最终原始状态', { fault, profile: (await profiles()).find(value => value.id === profile.id), facts: await facts() })
    await store.close()
  }
})

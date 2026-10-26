/*
 * [OUTPUT]: 重启后经runtime.page取得新窗口，不持有已关闭的Page；故障首批与修正结果分开。
 * [INPUT]: 原UI创建的本机员工、已真实交付文件及场景独占数据目录。
 * [OUTPUT]: 私有成果只沿原artifact.sourcePath核对，不猜测模型选择的work/runs位置；首批准备失败独立保留。
 * [OUTPUT]: 工作目录占位/链接与运行目录权限故障在模型前拒绝；原件和调用账本保持，两次重启不重放，明确新消息才继续。
 * [POS]: 本机员工LA-16受管目录故障桌面验收；不改个人Codex、凭据或产品数据记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { runtimeChildProcessIds } from '../support/automation-recovery'
import { test } from './codex-employee.steps'

const { Then } = createBdd(test)
Then('员工会话出现{string}时保留原成果且修复目录不自动执行', async ({ runtime, codexEmployee }, fault: string) => {
  test.setTimeout(540000)
  expect(['工作目录被文件占用', '工作目录被链接替换', '运行目录不可写']).toContain(fault)
  test.skip(fault === '运行目录不可写' && (!process.getuid || process.getuid() === 0), '权限场景需要非root的实际POSIX文件权限')
  const id = codexEmployee.conversationId!, employeeId = codexEmployee.employeeId!
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const openChat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '聊天', exact: true }).click()
  }
  await expect.poll(async () => (await read()).runs.some(run => run.phase === 'memory' && run.status === 'completed'), { timeout: 130000 }).toBe(true)
  await expect.poll(async () => (await runtimeChildProcessIds(runtime)).length).toBe(0)
  const baseline = await read(), snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), sessions: await store.load('codexSessions') })
  const originalRecords = await records()
  expect(baseline.workItems).toHaveLength(1); expect(baseline.workItems![0].status).toBe('delivered')
  const artifact = baseline.artifacts[0], artifactBytes = await readFile(artifact.path)
  const session = join(snapshot.dataPath, 'agents', employeeId, 'workspace', 'sessions', id)
  const permissions = fault === '运行目录不可写', target = join(session, permissions ? 'runs' : 'work'), saved = target + '.original'
  const originalMode = (await lstat(target)).mode & 0o777
  expect(artifact.sourcePath).toBeTruthy()
  const originalWork = await readFile(artifact.sourcePath!)
  const unrelated = join(runtime.root, 'unrelated-workspace-target')
  await mkdir(unrelated); await writeFile(join(unrelated, 'private.md'), '无关目录，不得读写或作为回退工作区。')
  let injected = false
  const restore = async () => {
    if (!injected) return
    if (permissions) await chmod(target, originalMode)
    else { await rm(target); await rename(saved, target) }
    injected = false
  }
  const intact = async () => {
    expect(await readFile(artifact.path)).toEqual(artifactBytes)
    expect(createHash('sha256').update(await readFile(artifact.path)).digest('hex')).toBe(artifact.contentHash)
    expect(await readdir(unrelated)).toEqual(['private.md'])
    expect(await readFile(join(unrelated, 'private.md'), 'utf8')).toBe('无关目录，不得读写或作为回退工作区。')
    const source = !permissions && injected && artifact.sourcePath!.startsWith(target + '/') ? saved + artifact.sourcePath!.slice(target.length) : artifact.sourcePath!
    expect(await readFile(source)).toEqual(originalWork)
    if (injected && !permissions) {
      if (fault === '工作目录被文件占用') expect(await readFile(target, 'utf8')).toBe('占位文件，禁止覆盖或删除。')
      else { expect((await lstat(target)).isSymbolicLink()).toBe(true); expect(await readlink(target)).toBe(unrelated) }
    }
  }
  try {
    if (permissions) await chmod(target, 0o500)
    else {
      await rename(target, saved)
      if (fault === '工作目录被文件占用') await writeFile(target, '占位文件，禁止覆盖或删除。')
      else await symlink(unrelated, target)
    }
    injected = true
    await runtime.reviewData('受管目录故障注入前的原事实', { fault, target, originalMode, originalRecords, baseline, realSupplier: !!codexEmployee.real, noPersonalFilesChanged: true })
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('NATIVE_FILE_TASK：这是新的文件请求，请创建并发布新的 codex-proof.md；请勿修改此前已交付的成果。')
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await read()).runs.some(run => !baseline.runs.some(old => old.id === run.id) && run.status === 'failed')).toBe(true)
    await expect.poll(async () => (await read()).turns!.every(turn => ['completed', 'failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status))).toBe(true)
    const failed = await read(), newRuns = failed.runs.filter(run => !baseline.runs.some(old => old.id === run.id))
    expect(newRuns).toHaveLength(1)
    expect(newRuns[0]).toMatchObject({ phase: 'decision', status: 'failed', error: '员工会话工作目录不可用，请恢复原目录及访问权限后再发送新消息。' })
    expect(newRuns[0].backend).toBeUndefined(); expect(newRuns[0].toolEvents).toEqual([])
    expect(failed.workItems).toEqual(baseline.workItems); expect(failed.workBudgets).toEqual(baseline.workBudgets); expect(failed.artifacts).toEqual(baseline.artifacts)
    expect(await records()).toEqual(originalRecords)
    await expect.poll(async () => (await runtimeChildProcessIds(runtime)).length).toBe(0)
    const row = () => runtime.page.locator(`#message-${newRuns[0].triggerMessageId}`)
    await expect(row()).toContainText(newRuns[0].error!)
    await expect(row()).not.toContainText(target)
    await intact(); await runtime.reviewCheckpoint(fault + '的原消息明确提示与旧成果')
    await runtime.reviewData('目录故障原请求没有模型调用或新工作', { failed, records: await records(), children: await runtimeChildProcessIds(runtime) })
    await runtime.restart(); await openChat()
    expect((await read()).runs).toEqual(failed.runs); expect((await read()).messages).toEqual(failed.messages)
    expect(await records()).toEqual(originalRecords); await intact()
    await expect(row()).toContainText(newRuns[0].error!)
    await runtime.reviewCheckpoint(fault + '保持故障重启后原失败可见')
    await restore(); await intact()
    expect((await read()).runs).toEqual(failed.runs); expect(await records()).toEqual(originalRecords)
    await runtime.restart(); await openChat()
    expect((await read()).runs).toEqual(failed.runs); expect((await read()).messages).toEqual(failed.messages)
    expect(await records()).toEqual(originalRecords); await intact()
    await runtime.reviewCheckpoint(fault + '恢复目录再重启仍不重放')
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('目录已经恢复。这是新的普通聊天，请只回复一句问候；不要执行之前失败的文件请求，不使用工具。')
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await read()).messages.some(message => message.senderType === 'agent' && message.status === 'completed' && !failed.messages.some(old => old.id === message.id)), { timeout: 180000 }).toBe(true)
    await expect.poll(async () => (await read()).turns!.every(turn => ['completed', 'failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status)), { timeout: 50000 }).toBe(true)
    await expect.poll(async () => (await read()).runs.filter(run => !failed.runs.some(old => old.id === run.id)).every(run => ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status)), { timeout: 130000 }).toBe(true)
    await expect.poll(async () => (await runtimeChildProcessIds(runtime)).length).toBe(0)
    const resumed = await read(), nextRuns = resumed.runs.filter(run => !failed.runs.some(old => old.id === run.id))
    expect(nextRuns.some(run => run.responseKind === 'chat' && run.status === 'completed')).toBe(true)
    expect(nextRuns.every(run => run.status === 'completed' && !run.toolEvents.length)).toBe(true)
    expect(resumed.runs.filter(run => failed.runs.some(old => old.id === run.id))).toEqual(failed.runs)
    expect(resumed.workItems).toEqual(baseline.workItems); expect(resumed.workBudgets).toEqual(baseline.workBudgets); expect(resumed.artifacts).toEqual(baseline.artifacts)
    expect((await records()).calls).toEqual(originalRecords.calls)
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual([])
    await intact(); await runtime.reviewFile('目录故障和恢复后原正式成果', artifact.path)
    await runtime.reviewData('目录修复后明确新聊天及原请求事实', { fault, resumed, records: await records(), oldFailedRun: newRuns[0] })
    await runtime.reviewCheckpoint(fault + '恢复后仅明确新聊天收到回复')
    expect(runtime.errors).toEqual([])
  } finally {
    await restore()
    await runtime.reviewData('受管目录故障最终原始状态', { fault, detail: await read(), records: await records() })
    await store.close()
  }
})

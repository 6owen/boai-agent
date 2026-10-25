/*
 * [OUTPUT]: 新增Inspector精确复制完成/登记事务未提交两窗口，实际进程退出前导出原件，核对两次完整重启零重放与原IM未交付状态。
 * [INPUT]: 隔离桌面、本机员工、真实文件工具及只读产品SQLite；离线协议或显式真实Codex。
 * [OUTPUT]: 文件登记后/工作交付后分别强制退出本场运行服务，等宿主只读请求完成启动核对后验证原件、原Work/消息、未知用量、实际子进程退出与两次重启零重放；失败也保留阶段Trace。
 * [POS]: 本机文件交付中断BDD；只读观察真实提交边界，不替换生产发布事务或伪造模型结果。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from './codex-employee.steps'
import { crashAutomationRuntime, processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { runtimeBreakpoint } from '../support/runtime-breakpoint'
import type { AgentRun, ArtifactVersion, BudgetModelCall, Message, WorkBudget, WorkItem } from '../../../packages/shared/src/domain'

const { Then } = createBdd(test)
Then('本机文件在{string}精确退出后保持未交付且两次重启不重放', async ({ runtime, codexEmployee }, boundary: string) => {
  test.setTimeout(540000)
  expect(['复制完成未登记', '登记事务未提交']).toContain(boundary)
  const id = codexEmployee.conversationId!, page = runtime.page
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const raw = async () => ({
    works: await store.load<WorkItem>('workItems'), runs: await store.load<AgentRun>('runs'),
    artifacts: await store.load<ArtifactVersion>('artifacts'), messages: await store.load<Message>('messages'),
    calls: await store.load<BudgetModelCall>('budgetModelCalls'), budgets: await store.load<WorkBudget>('workBudgets'),
    intents: await store.load<{ id: string; conversationId: string; managedRelativePath: string; contentHash: string }>('artifactPublicationIntents'),
    executions: await store.load('workExecutions'), sessions: await store.load('codexSessions'),
  })
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  let breakpoint: Awaited<ReturnType<typeof runtimeBreakpoint>> | undefined
  try {
    expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual([])
    expect((await raw()).runs).toEqual([])
    breakpoint = await runtimeBreakpoint(runtime, boundary as '复制完成未登记' | '登记事务未提交')
    await runtime.reviewData('发布精确故障准备与生产断点', { ...breakpoint.evidence, setup: 'only the idle utility was restarted to enable its loopback inspector', modelMode: codexEmployee.real ? 'real-provider' : 'offline-protocol' })
    const request = 'NATIVE_FILE_TASK：请实际创建 codex-proof.md，正文精确为“# Codex proof\\nNATIVE_FILE_TASK\\n”（将 \\n 写成换行），通过文件发布工具交付，再报告真实工作结果。只做这个文件，不执行命令或联网。'
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => breakpoint!.hit() !== null || (await raw()).runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 280000, intervals: [50, 100, 200] }).toBe(true)
    const hit = breakpoint.hit()
    expect(hit, '必须命中生产发布断点，运行失败不算到达窗口').not.toBeNull()
    const observed = await raw()
    expect(observed.intents).toHaveLength(1)
    expect(observed.artifacts).toEqual([])
    expect(observed.works).toHaveLength(1)
    expect(observed.works[0].status).toBe('running')
    const intent = observed.intents[0], work = observed.works[0]
    const run = observed.runs.find(value => value.id === work.activeRunId)!
    expect(run.backend).toMatchObject({ kind: 'codex-local', toolControl: 'host-bridge' })
    expect(intent.conversationId).toBe(id)
    const file = join(runtime.root, 'v2', 'workspaces', id, intent.managedRelativePath)
    const bytes = await readFile(file), originalStat = await stat(file), filenames = await readdir(dirname(file))
    expect(bytes.toString('utf8')).toBe('# Codex proof\nNATIVE_FILE_TASK\n')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(intent.contentHash)
    expect(observed.messages.filter(message => message.runId === run.id && message.status === 'completed')).toEqual([])
    expect(run.toolEvents.filter(tool => tool.name === 'write_file' && tool.status === 'completed')).toHaveLength(1)
    const children = await runtimeChildProcessIds(runtime)
    expect(children.length).toBeGreaterThan(0)
    // Export the real original while execution is paused, before any failure cleanup.
    await runtime.reviewFile('精确退出前已复制但未登记的原件', file)
    await runtime.reviewData('实际命中发布断点与未提交数据库', { request, hit, observed, file: { path: file, hash: intent.contentHash, ino: originalStat.ino, size: originalStat.size, mtimeMs: originalStat.mtimeMs }, children })
    await breakpoint.kill()
    await expect.poll(() => children.some(processIsRunning), { timeout: 10000 }).toBe(false)
    await read()
    const killed = await raw()
    expect(killed.artifacts).toEqual([])
    expect(killed.intents).toEqual(observed.intents)
    expect(killed.works[0]).toMatchObject({ id: work.id, status: 'interrupted', requiresReview: true, resultMessageIds: [], artifactIds: [], resultVersion: 0 })
    expect(killed.runs.find(value => value.id === run.id)?.status).toBe('interrupted')
    expect(killed.calls.find(value => value.runId === run.id)?.usageComplete).toBe(false)
    await runtime.reviewData('断点服务实际退出与首次核对', { killed, childrenExited: true })
    for (let restart = 1; restart <= 2; restart++) {
      await runtime.restart()
      const detail = await read()
      expect(await raw()).toEqual(killed)
      expect(detail.artifacts).toEqual([])
      expect(await readFile(file)).toEqual(bytes)
      const current = await stat(file)
      expect({ ino: current.ino, size: current.size, mtimeMs: current.mtimeMs }).toEqual({ ino: originalStat.ino, size: originalStat.size, mtimeMs: originalStat.mtimeMs })
      expect(await readdir(dirname(file))).toEqual(filenames)
      await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
      await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
      await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
      const card = runtime.page.locator(`[data-work-id="${work.id}"]:visible`)
      await expect(card).toContainText('已中断')
      await expect(card.getByRole('button', { name: '查看结果', exact: true })).toHaveCount(0)
      await expect(card.getByRole('button', { name: '交付文件', exact: true })).toHaveCount(0)
      await runtime.reviewCheckpoint(`第${restart}次重启原工作中断且未交付`)
      await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '文件', exact: true }).click()
      await expect(runtime.page.getByRole('region', { name: '会话文件', exact: true }).locator('[data-file-id]')).toHaveCount(0)
      await runtime.reviewCheckpoint(`第${restart}次重启未登记原件不进入文件列表`)
    }
    await runtime.reviewData('两次完整重启保持原身份且不重放', { raw: await raw(), hash: intent.contentHash, filenames })
    expect(runtime.errors).toEqual([])
  } finally {
    await breakpoint?.dispose()
    await runtime.reviewData('精确发布故障最终原始状态', { ...await raw(), traces: await store.load('traceSpans') })
    await store.close()
  }
})

Then('本机文件在{string}服务退出后保留原件与真实工作状态且重启不重放', async ({ runtime, codexEmployee }, boundary: string) => {
  test.setTimeout(540000)
  expect(['文件登记后', '工作交付后']).toContain(boundary)
  const delivered = boundary === '工作交付后', id = codexEmployee.conversationId!, page = runtime.page
  const content = '# Codex proof\nNATIVE_FILE_TASK\n'
  const marker = !codexEmployee.real && !delivered ? 'NATIVE_PUBLICATION_HOLD ' : ''
  const request = `${marker}NATIVE_FILE_TASK：请实际创建一个 codex-proof.md，正文必须精确为“# Codex proof\\nNATIVE_FILE_TASK\\n”（将 \\n 写成换行），通过 publish_artifact 正式登记文件，再用返回的真实 artifact ID 向 report_work 报告 delivered，最后用一句话说明。不要使用命令、联网或创建其他文件。`
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const raw = async () => ({
    works: await store.load<WorkItem>('workItems'), runs: await store.load<AgentRun>('runs'),
    artifacts: await store.load<ArtifactVersion>('artifacts'), messages: await store.load<Message>('messages'),
    calls: await store.load<BudgetModelCall>('budgetModelCalls'), budgets: await store.load<WorkBudget>('workBudgets'),
    executions: await store.load('workExecutions'), sessions: await store.load('codexSessions'),
  })
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const openChat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  }
  try {
    expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual([])
    await runtime.reviewData('文件交付中断原始请求', { boundary, request, realSupplier: !!codexEmployee.real, fault: 'SIGKILL only this scenario runtime after observing a committed database fact' })
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const works = await store.load<WorkItem>('workItems'), artifacts = await store.load<ArtifactVersion>('artifacts')
      if (delivered ? works.some(work => work.status === 'delivered') : artifacts.length > 0) return true
      return (await store.load<AgentRun>('runs')).some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))
    }, { timeout: 260000, intervals: [10, 20, 40] }).toBe(true)
    const children = await runtimeChildProcessIds(runtime)
    const observedAt = new Date().toISOString(), observed = await raw()
    expect(observed.runs.filter(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)), '原运行失败，未命中文件交付中断边界').toEqual([])
    expect(observed.artifacts).toHaveLength(1)
    expect(observed.works).toHaveLength(1)
    expect(observed.works[0].status).toBe(delivered ? 'delivered' : 'running')
    if (!delivered) expect(children.length).toBeGreaterThan(0)
    // No screenshot/preview between observing the boundary and killing the utility.
    await crashAutomationRuntime(runtime)
    await expect(page.getByText(/本地运行服务已退出/)).toBeVisible()
    await expect.poll(() => children.some(processIsRunning), { timeout: 10000 }).toBe(false)
    // A queued UI read can already restart the utility. Explicitly reconcile via
    // the original read API instead of assuming its database is still untouched.
    await read()
    const killed = await raw(), work = killed.works[0], artifact = killed.artifacts[0]
    const run = killed.runs.find(value => value.id === artifact.runId)!
    await runtime.reviewData('实际故障边界与运行服务退出后数据库', { boundary, observedAt, observed, reconciledAfterExitAt: new Date().toISOString(), recovery: 'original read API after actual process exit', killed, children, childrenExited: true })
    // A final commit racing ahead of SIGKILL would mean this attempt missed its boundary.
    expect(work.status).toBe(delivered ? 'delivered' : 'interrupted')
    expect(run.status).toBe(delivered ? 'completed' : 'interrupted')
    if (!delivered) expect(killed.runs.map(value => value.id)).toEqual(observed.runs.map(value => value.id))
    expect(killed.artifacts).toEqual(observed.artifacts)
    expect(work).toMatchObject({ conversationId: id, ownerAgentId: codexEmployee.employeeId })
    expect(run.backend).toMatchObject({ kind: 'codex-local', toolControl: 'host-bridge' })
    expect(artifact).toMatchObject({ conversationId: id, ownerAgentId: codexEmployee.employeeId, sourceWorkId: work.id, contentVersion: 1 })
    expect(run.toolEvents.filter(tool => tool.name === 'write_file' && tool.status === 'completed')).toHaveLength(1)
    expect(run.toolEvents.filter(tool => tool.name === 'publish_artifact')).toHaveLength(1)
    if (delivered) {
      expect(work.artifactIds).toEqual([artifact.id])
      expect(work.resultMessageIds).toEqual([artifact.sourceMessageId])
      expect(killed.messages.find(message => message.id === artifact.sourceMessageId)).toMatchObject({ status: 'completed', runId: run.id })
      expect(killed.calls.find(call => call.runId === run.id)?.usageComplete).toBe(true)
    } else {
      expect(artifact.sourceMessageId).toBeUndefined()
      expect(work.resultMessageIds).toEqual([])
      expect(work.artifactIds).toEqual([])
      expect(killed.messages.filter(message => message.runId === run.id && message.status === 'completed')).toEqual([])
      expect(killed.calls.find(call => call.runId === run.id)?.usageComplete).toBe(false)
    }
    const original = await readFile(artifact.path), beforeStat = await stat(artifact.path), files = await readdir(dirname(artifact.path))
    expect(original.toString('utf8')).toBe(content)
    expect(createHash('sha256').update(original).digest('hex')).toBe(artifact.contentHash)
    await runtime.reviewFile('服务退出时已登记的原始文件', artifact.path)
    await runtime.reviewCheckpoint('文件交付阶段运行服务实际退出')
    await runtime.restart()
    // The preload bridge can exist before runtime initialization. Await the real
    // read request before taking the post-recovery database snapshot.
    const detail = await read(), recovered = await raw(), recoveredWork = recovered.works.find(value => value.id === work.id)!
    expect(recovered.artifacts).toEqual(killed.artifacts)
    expect(recovered.works).toHaveLength(1)
    expect(recovered.runs.map(value => value.id)).toEqual(killed.runs.map(value => value.id))
    expect(recovered.calls).toEqual(killed.calls)
    expect(recovered.sessions).toEqual(killed.sessions)
    expect(recoveredWork).toMatchObject({ id: work.id, budgetId: work.budgetId, sourceMessageId: work.sourceMessageId, status: delivered ? 'delivered' : 'interrupted', requiresReview: !delivered })
    expect(recoveredWork.activeRunId).toBeUndefined()
    if (delivered) {
      expect(recoveredWork).toEqual(work)
      expect(recovered.messages.find(message => message.id === artifact.sourceMessageId)).toEqual(killed.messages.find(message => message.id === artifact.sourceMessageId))
    } else {
      expect(recoveredWork.artifactIds).toEqual([])
      expect(recoveredWork.resultMessageIds).toEqual([])
      expect(recovered.runs.find(value => value.id === run.id)?.status).toBe('interrupted')
      expect(detail.messages.filter(message => message.runId === run.id && message.status === 'completed')).toEqual([])
    }
    await openChat()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
    const workCard = runtime.page.locator(`[data-work-id="${work.id}"]:visible`)
    await expect(workCard).toContainText(delivered ? '已交付' : '已中断')
    if (!delivered) {
      await expect(workCard.getByRole('button', { name: '查看结果', exact: true })).toHaveCount(0)
      await expect(workCard.getByRole('button', { name: '交付文件', exact: true })).toHaveCount(0)
    }
    await runtime.reviewCheckpoint('重启后原工作保持' + (delivered ? '已交付' : '中断待核对'))
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '文件', exact: true }).click()
    const fileCard = runtime.page.getByRole('region', { name: '会话文件', exact: true }).locator(`[data-file-id="${artifact.id}"]`).first()
    await expect(fileCard).toBeVisible()
    if (!delivered) await expect(fileCard.getByRole('button', { name: '查看原消息', exact: true })).toBeDisabled()
    await fileCard.getByRole('button', { name: '预览', exact: true }).click()
    const preview = runtime.page.locator(`[data-artifact-id="${artifact.id}"]:visible`)
    await expect(preview).toContainText('NATIVE_FILE_TASK')
    await expect(preview.getByRole('button', { name: '采用此版本', exact: true })).toHaveCount(0)
    await runtime.reviewCheckpoint('原文件可核读且业务交付状态保持独立')
    await runtime.reviewData('首次重启后的原工作消息与文件', { boundary, detail: await read(), raw: await raw() })
    const settled = await raw()
    await runtime.restart()
    await read()
    const again = await raw()
    expect(again).toEqual(settled)
    expect(await readFile(artifact.path)).toEqual(original)
    const afterStat = await stat(artifact.path)
    expect({ ino: afterStat.ino, mtimeMs: afterStat.mtimeMs, size: afterStat.size }).toEqual({ ino: beforeStat.ino, mtimeMs: beforeStat.mtimeMs, size: beforeStat.size })
    expect(await readdir(dirname(artifact.path))).toEqual(files)
    await openChat()
    await runtime.reviewCheckpoint('再次重启不重放也不重写原文件')
    await runtime.reviewData('两次重启零重放与原件身份', { boundary, originalHash: artifact.contentHash, file: { ino: afterStat.ino, mtimeMs: afterStat.mtimeMs, size: afterStat.size }, files, raw: again })
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('文件交付中断最终原始状态', { ...await raw(), traces: await store.load('traceSpans') })
    await store.close()
  }
})

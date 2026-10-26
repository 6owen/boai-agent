/*
 * [INPUT]: 原员工创建入口、独立本机Codex、只读SQLite与生产准备事务的Inspector返回位置。
 * [OUTPUT]: 准备记录已写入但未提交且复制未开始时实际SIGKILL，原件清理前导出；两次重启保持中断/未知、零重放及无隐式成果导入。
 * [POS]: LA-07复制前事务内部故障BDD；不替换事务、不读取闭包、不预置业务或放宽预算。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { workspaceTarget } from '../../../packages/runtime/src/modules/workspaces/file-access'
import { runtimeBreakpoint } from '../support/runtime-breakpoint'
import { runtimeChildProcessIds, processIsRunning } from '../support/automation-recovery'
import { archiveNativeFinalReview } from '../support/native-final-review'
import type { AgentRun, ArtifactVersion, BudgetModelCall, Message, WorkBudget, WorkItem } from '../../../packages/shared/src/domain'

const { Then } = createBdd(test)
Then('复制前准备事务内部实际退出后两次重启保持未交付且不重放', async ({ runtime, codexEmployee }) => {
  test.setTimeout(540000)
  const id = codexEmployee.conversationId!, agentId = codexEmployee.employeeId!
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const raw = async () => ({
    works: await store.load<WorkItem>('workItems'), runs: await store.load<AgentRun>('runs'),
    artifacts: await store.load<ArtifactVersion>('artifacts'), messages: await store.load<Message>('messages'),
    calls: await store.load<BudgetModelCall>('budgetModelCalls'), budgets: await store.load<WorkBudget>('workBudgets'),
    intents: await store.load('artifactPublicationIntents'), executions: await store.load('workExecutions'),
    sessions: await store.load('codexSessions'), traces: await store.load('traceSpans'),
    profileCalls: await store.load('profileModelCalls'), turns: await store.load('turns'),
    agents: await store.load('agents'), launchProfiles: await store.load('launchProfiles'),
  })
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const content = '# Codex proof\nNATIVE_FILE_TASK\n'
  let breakpoint: Awaited<ReturnType<typeof runtimeBreakpoint>> | undefined
  let scenarioFailure: unknown
  const failures: unknown[] = []
  let original: { path: string; hash: string; ino: number; size: number; mtimeMs: number } | undefined
  const copies = async () => {
    const directory = join(runtime.root, 'v2', 'workspaces', id, 'artifacts')
    try {
      const s = await lstat(directory)
      expect(s.isDirectory() && !s.isSymbolicLink(), '只读本场受管复制目录').toBe(true)
      const files = await readdir(directory)
      expect(files).toEqual([])
      return { directory, presence: 'empty-directory', files }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { directory, presence: 'absent-directory', files: [] }
    }
  }
  try {
    expect((await raw()).runs).toEqual([])
    breakpoint = await runtimeBreakpoint(runtime, '复制前准备事务未提交')
    await runtime.reviewData('复制前准备事务精确故障准备', { ...breakpoint.evidence, modelMode: codexEmployee.real ? 'real-provider' : 'offline-protocol', sourceReplacement: false, callFrameEvaluation: false })
    const request = 'NATIVE_FILE_TASK：请在宿主指定的本轮输出目录创建 codex-proof.md，正文精确为“# Codex proof\\nNATIVE_FILE_TASK\\n”（将 \\n 写成换行），通过文件发布工具交付，再报告真实工作结果。只做这个文件，不执行命令或联网。'
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => breakpoint!.hit() !== null || (await raw()).runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 280000, intervals: [50, 100, 200] }).toBe(true)
    const hit = breakpoint.hit()
    expect(hit, '必须实际暂停在preparePublication写入后返回处，未到窗口不能算通过').not.toBeNull()
    expect(hit!.frames[0].functionName).toBe('preparePublication')
    const before = await raw()
    expect(before.works).toHaveLength(1)
    const work = before.works[0], run = before.runs.find(value => value.id === work.activeRunId)!
    expect(before.budgets).toHaveLength(1)
    const budget = before.budgets[0]
    expect(budget).toMatchObject({ id: work.budgetId, maxModelCalls: 24, maxOutputTokens: 16000 })
    expect(Number.isFinite(Date.parse(budget.deadlineAt))).toBe(true)
    expect(work.status).toBe('running')
    expect(run).toMatchObject({ agentId, conversationId: id, backend: { kind: 'codex-local', toolControl: 'host-bridge' } })
    expect(before.intents).toEqual([])
    expect(before.artifacts).toEqual([])
    expect(run.toolEvents.filter(tool => tool.name === 'write_file' && tool.status === 'completed')).toHaveLength(1)
    expect(before.messages.filter(message => message.runId === run.id && message.status === 'completed')).toEqual([])
    const relative = `agents/${agentId}/workspace/sessions/${id}/runs/${run.id}/codex-proof.md`
    const path = await workspaceTarget(join(runtime.root, 'v2'), relative, false), bytes = await readFile(path), s = await stat(path)
    expect(s.isFile() && s.nlink === 1).toBe(true)
    expect(bytes.toString()).toBe(content)
    original = { path, hash: createHash('sha256').update(bytes).digest('hex'), ino: s.ino, size: s.size, mtimeMs: s.mtimeMs }
    const destination = await copies(), children = await runtimeChildProcessIds(runtime)
    expect(children.length).toBeGreaterThan(0)
    await runtime.reviewFile('复制前事务未提交的真实工作原件', path, { required: true, expectedSha256: original.hash })
    await runtime.reviewData('preparePublication写入后未提交的独立读状态', { request, hit, before, original, destination, children, uncommittedWritesNotReadFromClosure: true })
    await breakpoint.kill()
    await expect.poll(() => children.some(processIsRunning), { timeout: 10000 }).toBe(false)
    await read()
    const killed = await raw()
    expect(killed.intents).toEqual([])
    expect(killed.artifacts).toEqual([])
    expect(killed.works).toHaveLength(1)
    expect(killed.works[0]).toMatchObject({ id: work.id, budgetId: work.budgetId, sourceMessageId: work.sourceMessageId, status: 'interrupted', requiresReview: true, artifactIds: [], resultMessageIds: [], resultVersion: 0 })
    expect(killed.works[0].activeRunId).toBeUndefined()
    expect(killed.runs.find(value => value.id === run.id)?.status).toBe('interrupted')
    expect(killed.calls.find(value => value.runId === run.id)?.usageComplete).toBe(false)
    expect(killed.runs.map(value => value.id)).toEqual(before.runs.map(value => value.id))
    expect(killed.budgets).toHaveLength(1)
    expect(killed.budgets[0]).toMatchObject({ id: budget.id, maxModelCalls: budget.maxModelCalls, maxOutputTokens: budget.maxOutputTokens, deadlineAt: budget.deadlineAt })
    expect(killed.agents).toEqual(before.agents)
    expect(killed.launchProfiles).toEqual(before.launchProfiles)
    await runtime.reviewData('准备事务内实际退出后的回滚与未知回执', { killed, original, destination: await copies(), childrenExited: true })
    for (let restart = 1; restart <= 2; restart++) {
      await runtime.restart()
      const detail = await read()
      expect(await raw()).toEqual(killed)
      expect(detail.artifacts).toEqual([])
      expect(await readFile(original.path)).toEqual(bytes)
      const current = await stat(original.path)
      expect({ ino: current.ino, size: current.size, mtimeMs: current.mtimeMs }).toEqual({ ino: original.ino, size: original.size, mtimeMs: original.mtimeMs })
      await copies()
      await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
      await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
      await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
      const card = runtime.page.locator(`[data-work-id="${work.id}"]:visible`)
      await expect(card).toContainText('已中断')
      await expect(card.getByRole('button', { name: '查看结果', exact: true })).toHaveCount(0)
      await expect(card.getByRole('button', { name: '交付文件', exact: true })).toHaveCount(0)
      await runtime.reviewNativeCheckpoint(`准备事务故障第${restart}次重启原工作未交付`)
      await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '文件', exact: true }).click()
      await expect(runtime.page.getByRole('region', { name: '会话文件', exact: true }).locator('[data-file-id]')).toHaveCount(0)
      await runtime.reviewNativeCheckpoint(`准备事务故障第${restart}次重启没有隐式文件导入`)
    }
    await runtime.reviewData('准备事务故障两次重启零重放', { records: await raw(), original, destination: await copies() })
    expect(runtime.errors).toEqual([])
  } catch (error) {
    scenarioFailure = error
    try { await runtime.reviewData('准备事务原场景失败', { failure: error instanceof Error ? error.message : '原场景失败' }) }
    catch (archiveError) { failures.push(archiveError) }
    throw error
  } finally {
    try { await breakpoint?.dispose() } catch (error) { failures.push(error) }
    let exitVerified = false
    try { await archiveNativeFinalReview(runtime, { label: '复制前准备事务场景结束', records: raw }); exitVerified = true } catch (error) { failures.push(error) }
    try {
      const final = await raw()
      const executions = final.runs.filter(run => run.agentId === agentId && run.conversationId === id && run.phase === 'execution' && run.responseKind === 'task' && run.backend?.kind === 'codex-local' && run.workId && final.works.some(work => work.id === run.workId))
      expect(executions.length, '固定原件必须绑定本场唯一真实执行身份').toBeLessThanOrEqual(1)
      if (!executions.length) await runtime.reviewData('准备事务结束时固定原件身份未确定', { exitVerified, agentId, conversationId: id, presence: 'unknown-no-execution-identity', noDirectoryScan: true })
      else {
        const run = executions[0], relative = `agents/${agentId}/workspace/sessions/${id}/runs/${run.id}/codex-proof.md`
        const identity = { exitVerified, workId: run.workId, runId: run.id, agentId, conversationId: id, relative, writeReceipts: run.toolEvents.filter(tool => tool.name === 'write_file') }
        let observed: { path: string; hash: string; ino: number; size: number; mtimeMs: number } | undefined
        try {
          const path = await workspaceTarget(join(runtime.root, 'v2'), relative, false), entry = await lstat(path)
          expect(entry.isFile() && !entry.isSymbolicLink() && entry.nlink === 1 && entry.size <= 1024 * 1024).toBe(true)
          const bytes = await readFile(path), hash = createHash('sha256').update(bytes).digest('hex')
          if (original) expect(hash).toBe(original.hash)
          observed = { path, hash, ino: entry.ino, size: entry.size, mtimeMs: entry.mtimeMs }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || original) throw error
          await runtime.reviewData('准备事务结束时固定原件未发现', { ...identity, presence: 'absent-at-final-check', errorCode: 'ENOENT', absenceDoesNotEstablishToolWasNotCalled: true })
        }
        if (observed) {
          await runtime.reviewFile('准备事务场景结束时固定工作原件', observed.path, { required: true, expectedSha256: observed.hash })
          await runtime.reviewData('准备事务结束时固定原件实件核对', { ...identity, ...observed, presence: 'observed-file' })
        }
      }
    } catch (error) { failures.push(error) }
    try { await store.close() } catch (error) { failures.push(error) }
    if (failures.length) throw new AggregateError(scenarioFailure ? [scenarioFailure, ...failures] : failures, '准备事务原场景或独立结束留证失败')
  }
})

/*
 * [INPUT]: Original isolated Desktop fixture, controlled employee and host-private diagnostic bridge.
 * [OUTPUT]: Session/PID-specific SIGKILL, protected export destinations and durable initialization-failure evidence.
 * [POS]: Daily stability desktop acceptance; no system sleep or personal profile access.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { test } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'
import type { Desktop } from '../support/desktop'
import type { DesktopLifecycle } from '../../../packages/shared/src/ipc/desktop'

type JournalEntry = { sessionId: string; sequence: number; event: string; metadata: { pid?: number; errorKind?: string; fingerprint?: string }; application: { version: string; inputHash: string; source: string } }
type State = { fixture: Awaited<ReturnType<typeof prepareGroupChat>>; before: DesktopLifecycle; calls: number; exported?: string; report?: any; pid?: number; runtimeSession?: string; readySequence?: number }
const states = new WeakMap<Desktop, State>()
const protectedExports = new WeakMap<Desktop, { original: Buffer; target: string }>()
const startups = new WeakMap<Desktop, { marker: Buffer; sessionId: string; application: JournalEntry['application']; dialogPath?: string; pid?: number; exitCode?: number | null; signalCode?: string | null }>()
const { Given, When, Then } = createBdd(test)
const DRAFT = '诊断场景未发送的原草稿'
const CORRUPT_MARKER = '{"schemaVersion": PRIVATE_INVALID_STARTUP_MARKER'
const execute = promisify(execFile)
async function journalEntries(runtime: Desktop): Promise<JournalEntry[]> {
  return (await readFile(join(runtime.root, 'diagnostics/desktop.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

Given('隔离诊断桌面已有一次完成的员工回复和草稿', async ({ runtime }) => {
  const fixture = await prepareGroupChat(runtime)
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '单聊统一交互验收', mentionIds: [], requestId: 'diagnostics-original-message' }), fixture.direct.id)
  await expect.poll(() => runtime.page.evaluate(async id => (await window.boai.request('getConversation', { id })).messages.filter(message => message.senderType === 'agent' && message.status === 'completed' && message.content.includes('研究员：单聊和群聊保持一致')).length, fixture.direct.id)).toBe(1)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(DRAFT)
  states.set(runtime, { fixture, calls: fixture.state.calls, before: await runtime.page.evaluate(() => window.boai.getDesktopLifecycle!()) })
})

When('桌面依次收到睡眠锁屏唤醒解锁事件', async ({ runtime }) => {
  await runtime.page.evaluate(() => { Object.assign(window, { __diagnosticStates: [] }); window.boai.subscribe(event => { if (event.type === 'desktop:lifecycle') (window as any).__diagnosticStates.push(event.state) }) })
  await runtime.app.evaluate(({ powerMonitor }) => { for (const event of ['suspend', 'lock-screen', 'resume', 'unlock-screen']) powerMonitor.emit(event) })
})

Then('桌面生命周期代次更新且原草稿和回复保持', async ({ runtime }) => {
  const state = states.get(runtime)!
  await expect.poll(() => runtime.page.evaluate(() => (window as any).__diagnosticStates.length)).toBe(4)
  const current = await runtime.page.evaluate(() => window.boai.getDesktopLifecycle!())
  expect(current).toMatchObject({ sessionId: state.before.sessionId, revision: state.before.revision + 4, power: 'awake', locked: false })
  const observed = await runtime.page.evaluate(() => (window as any).__diagnosticStates as DesktopLifecycle[])
  expect(observed.map(value => [value.power, value.locked])).toEqual([['suspended', state.before.locked], ['suspended', true], ['awake', true], ['awake', false]])
  await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveText(DRAFT)
  expect(state.fixture.state.calls).toBe(state.calls)
  expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.fixture.direct.id)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed' && message.content.includes('研究员：单聊和群聊保持一致'))).toHaveLength(1)
  await runtime.reviewData('系统事件模拟与原消息不重发', { before: state.before, current, observed, modelCalls: state.calls, realSystemSuspend: false })
  await runtime.reviewNativeCheckpoint('系统事件后原草稿')
})

When('原运行服务进程异常退出', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '数据与备份', exact: true }).click()
  const state = states.get(runtime)!
  const ready = (await journalEntries(runtime)).filter(entry => entry.event === 'runtime-ready').at(-1)!
  state.pid = ready.metadata.pid
  state.runtimeSession = ready.sessionId
  state.readySequence = ready.sequence
  expect(state.pid).toBeGreaterThan(1)
  expect(await runtime.app.evaluate(({ app }, pid) => app.getAppMetrics().some(metric => metric.pid === pid && metric.type === 'Utility'), state.pid)).toBe(true)
  await runtime.app.evaluate(({ utilityProcess }) => { utilityProcess.fork = () => { throw new Error('isolated fault: runtime unavailable') } })
  process.kill(state.pid!, 'SIGKILL')
  await expect.poll(async () => (await journalEntries(runtime)).some(entry => entry.event === 'runtime-exit' && entry.sessionId === state.runtimeSession && entry.metadata.pid === state.pid && entry.sequence > state.readySequence!)).toBe(true)
})

When('从数据设置取消一次诊断导出再实际导出', async ({ runtime }) => {
  const state = states.get(runtime)!, directory = await mkdtemp(join(tmpdir(), 'boai-diagnostic-export-'))
  runtime.defer(() => rm(directory, { recursive: true, force: true }))
  state.exported = join(directory, 'diagnostics.json')
  await runtime.app.evaluate(({ dialog }) => { const original = dialog.showSaveDialog; dialog.showSaveDialog = (async () => { dialog.showSaveDialog = original; return { canceled: true, filePath: '' } }) as typeof dialog.showSaveDialog })
  await runtime.page.getByRole('button', { name: '导出诊断', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '导出诊断', exact: true })).toBeEnabled()
  await expect(runtime.page.locator('[data-sonner-toast]').filter({ hasText: '诊断记录已导出' })).toHaveCount(0)
  await runtime.app.evaluate(({ dialog }, filePath) => { const original = dialog.showSaveDialog; dialog.showSaveDialog = (async () => { dialog.showSaveDialog = original; return { canceled: false, filePath } }) as typeof dialog.showSaveDialog }, state.exported)
  await runtime.page.getByRole('button', { name: '导出诊断', exact: true }).click()
  await expect(runtime.page.locator('[data-sonner-toast]').filter({ hasText: '诊断记录已导出' })).toBeVisible()
  state.report = JSON.parse(await readFile(state.exported, 'utf8'))
})

Then('导出保留当前构建和原服务退出记录', async ({ runtime }) => {
  const state = states.get(runtime)!, report = state.report
  expect(report.runtime).toMatchObject({ present: false, mode: 'absent' })
  expect(report.application).toMatchObject({ source: 'compiled-inputs' })
  expect(report.application.inputHash).toMatch(/^[a-f0-9]{64}$/)
  expect(report.sessionId).toBe(state.runtimeSession)
  expect(report.entries).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'runtime-exit', sessionId: state.runtimeSession, application: report.application, metadata: expect.objectContaining({ pid: state.pid }) })]))
  // Opening settings may read the existing runtime; export itself must use no runtime RPC.
  expect(state.fixture.state.calls).toBe(state.calls)
  expect(JSON.stringify(report)).not.toContain(DRAFT)
  expect(JSON.stringify(report)).not.toContain('单聊统一交互验收')
  await runtime.reviewData('实际导出诊断', report)
  await expect(runtime.page.locator('[data-sonner-toast]').filter({ hasText: '诊断记录已导出' })).toBeHidden({ timeout: 10_000 })
  await runtime.reviewNativeCheckpoint('数据与备份诊断入口-明亮')
  await runtime.page.evaluate(async () => { const current = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: current.revision }) })
  await expect(runtime.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await runtime.page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {})))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  await runtime.reviewNativeCheckpoint('数据与备份诊断入口-暗色')
})

Then('重启后诊断保留原故障且原回复没有重做', async ({ runtime }) => {
  const state = states.get(runtime)!
  await runtime.restart()
  await runtime.app.evaluate(({ dialog }, filePath) => { const original = dialog.showSaveDialog; dialog.showSaveDialog = (async () => { dialog.showSaveDialog = original; return { canceled: false, filePath } }) as typeof dialog.showSaveDialog }, state.exported)
  await runtime.page.evaluate(() => window.boai.exportDiagnostics!())
  const next = JSON.parse(await readFile(state.exported!, 'utf8'))
  expect(next.sessionId).not.toBe(state.report.sessionId)
  expect(next.entries).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'runtime-exit', sessionId: state.report.sessionId, metadata: expect.objectContaining({ pid: state.pid }) })]))
  expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.fixture.direct.id)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed' && message.content.includes('研究员：单聊和群聊保持一致'))).toHaveLength(1)
  expect(state.fixture.state.calls).toBe(state.calls)
  await runtime.reviewData('重启后保留原诊断与零重放', { sessionId: next.sessionId, originalSession: state.report.sessionId, originalPid: state.pid, calls: state.calls })
})

Given('隔离诊断桌面已有原插件配置并打开数据设置', async ({ runtime }) => {
  const target = join(runtime.root, 'application-plugins.json')
  const original = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: 0, disabledIds: [] }))
  await writeFile(target, original, { mode: 0o600 })
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '数据与备份', exact: true }).click()
  protectedExports.set(runtime, { original, target })
})

When('诊断保存位置经目录链接指向原插件配置', async ({ runtime }) => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-diagnostic-alias-'))
  runtime.defer(() => rm(directory, { recursive: true, force: true }))
  const alias = join(directory, 'profile-alias')
  await symlink(runtime.root, alias, 'dir')
  await runtime.app.evaluate(({ dialog }, filePath) => {
    const original = dialog.showSaveDialog
    dialog.showSaveDialog = (async () => { dialog.showSaveDialog = original; return { canceled: false, filePath } }) as typeof dialog.showSaveDialog
  }, join(alias, 'application-plugins.json'))
  await runtime.page.getByRole('button', { name: '导出诊断', exact: true }).click()
})

Then('诊断导出被拒绝且原配置字节保持', async ({ runtime }) => {
  const state = protectedExports.get(runtime)!
  await expect(runtime.page.locator('[data-sonner-toast]').filter({ hasText: '请在应用数据目录之外保存诊断记录。' })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: '导出诊断', exact: true })).toBeEnabled()
  await expect(runtime.page.locator('[data-sonner-toast]').filter({ hasText: '诊断记录已导出' })).toHaveCount(0)
  expect(await readFile(state.target)).toEqual(state.original)
  expect((await readdir(runtime.root)).filter(name => name.startsWith('application-plugins.json.') && name.endsWith('.tmp'))).toEqual([])
  await runtime.reviewData('链接目录导出拒绝与原配置保持', { rejected: true, originalBytesPreserved: true, temporaryFiles: 0 })
  await runtime.reviewNativeCheckpoint('诊断导出拒绝沿原错误Toast')
})

Given('隔离诊断桌面已有可正常启动的数据版本文件', async ({ runtime }) => {
  if (process.env.BOAI_TEST_PACKAGED_PATH || process.env.BOAI_TEST_DEV_SERVER === '1') throw new Error('初始化故障夹具仅验证当前编译源码入口')
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const start = (await journalEntries(runtime)).find(entry => entry.event === 'app-start')!
  startups.set(runtime, { marker: await readFile(join(runtime.root, 'v2/data-version.json')), sessionId: start.sessionId, application: start.application })
  await runtime.reviewNativeCheckpoint('初始化故障前原桌面')
  await runtime.close()
})

When('同一隔离数据的版本文件损坏后再次启动宿主', async ({ runtime }) => {
  const state = startups.get(runtime)!, entry = join(runtime.root, 'startup-failure-main.cjs')
  state.dialogPath = join(runtime.root, 'startup-failure-dialog.json')
  await writeFile(join(runtime.root, 'v2/data-version.json'), CORRUPT_MARKER)
  // Only the blocking native error dialog is intercepted; initialization and quit execute in the real host.
  await writeFile(entry, `const {dialog}=require('electron');const fs=require('node:fs');dialog.showErrorBox=(title)=>fs.writeFileSync(${JSON.stringify(state.dialogPath)},JSON.stringify({title}));require(${JSON.stringify(resolve('dist/main/main.cjs'))});`)
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USER|SHELL|LANG|LC_.*|TMPDIR|TEMP|TMP|SystemRoot|APPDATA|LOCALAPPDATA|USERPROFILE)$/i.test(key)))
  const attempt = execute(createRequire(import.meta.url)('electron') as string, [entry], { env: { ...env, BOAI_DATA_DIR: runtime.root, NODE_ENV: 'test' }, timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 })
  state.pid = attempt.child.pid
  try { await attempt }
  finally {
    state.exitCode = attempt.child.exitCode; state.signalCode = attempt.child.signalCode
    await runtime.reviewData('窗口创建前实际宿主初始化失败进程', { pid: state.pid, exitCode: state.exitCode, signalCode: state.signalCode, windowCreated: false, traceAvailable: false, reason: '初始化在创建窗口前失败；只拦截阻塞错误对话框' })
  }
})

Then('启动失败脱敏留存并在修复原文件后仍可定位', async ({ runtime }) => {
  const state = startups.get(runtime)!, markerPath = join(runtime.root, 'v2/data-version.json')
  expect(state.pid).toBeGreaterThan(1)
  expect(state.exitCode).toBe(0); expect(state.signalCode).toBeNull()
  expect(JSON.parse(await readFile(state.dialogPath!, 'utf8'))).toEqual({ title: 'BoAI Agent 启动失败' })
  expect(await readFile(markerPath, 'utf8')).toBe(CORRUPT_MARKER)
  const journal = await journalEntries(runtime), failures = journal.filter(entry => entry.event === 'app-start-failed')
  expect(failures).toHaveLength(1)
  const failure = failures[0]
  expect(failure.sessionId).not.toBe(state.sessionId)
  expect(failure.application).toEqual(state.application)
  expect(failure.application).toMatchObject({ source: 'compiled-inputs', inputHash: expect.stringMatching(/^[a-f0-9]{64}$/), version: expect.any(String) })
  expect(failure.metadata).toMatchObject({ errorKind: 'SyntaxError', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(journal.some(record => record.sessionId === failure.sessionId && record.event === 'runtime-start')).toBe(false)
  expect(JSON.stringify(journal)).not.toContain(CORRUPT_MARKER)
  expect(JSON.stringify(journal)).not.toContain(runtime.root)
  await runtime.reviewData('原初始化失败及构建身份', failure)
  await writeFile(markerPath, state.marker)
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect((await journalEntries(runtime)).find(record => record.event === 'app-start-failed' && record.sessionId === failure.sessionId)).toEqual(failure)
  await runtime.reviewNativeCheckpoint('恢复原版本文件后重新打开')
})

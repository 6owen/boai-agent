/*
 * [INPUT]: Production native CLI/browser bridge, explicit real-run switch and isolated HTTP page.
 * [OUTPUT]: API/Codex/Claude, one real user message per backend, screenshot understanding, actual POST/readback, hidden window and restart evidence; no retries or credential copies.
 * [POS]: Employee browser EB2/EB3 real Electron acceptance, independent of protocol fixtures.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile } from '../../../src/shared/domain'
import type { NativeAction } from '../../../src/shared/domain/execution'
import type { BrowserPageReference } from '../../../src/shared/ipc/browser'
import { test as base } from '../support/test'
import { browserRecords, browserToolbarAction, nativeBrowserViews } from '../support/browser-migration'
import { prepareV2DataRoot } from '../../../src/main/migration'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import { archiveNativeFinalReview } from '../support/native-final-review'

interface State { backend?: string; agent?: DigitalAgent; chat?: Conversation; reference?: BrowserPageReference; origin?: string; dataPath?: string; detail?: ConversationDetail; expected?: string; saves: string[]; error?: unknown }
export const test = base.extend<{ employeeBrowser: State }>({ employeeBrowser: async ({ runtime }, use) => {
  const state: State = { saves: [] }
  try { await use(state) } finally {
    if (state.dataPath) {
      await runtime.reviewData('真实网页最终外部事实', { backend: state.backend, saves: state.saves, expected: state.expected, reference: state.reference, error: state.error instanceof Error ? state.error.message : state.error })
      await archiveNativeFinalReview(runtime, { label: '真实员工浏览器', records: async () => ({ ...await browserRecords(state.dataPath!), backend: state.backend, externalSaves: state.saves }) })
    }
  }
} })
const { Given, When, Then } = createBdd(test)
Given('我为网页任务准备真实的 {string} 员工和隔离页面', async ({ runtime: d, employeeBrowser: s }, backend: string) => {
  test.skip(process.env.BOAI_REAL_EMPLOYEE_BROWSER !== '1', '真实模型必须显式启动')
  test.setTimeout(360000); test.info().annotations.push({ type: 'model-mode', description: 'real-provider' })
  const executable = process.env[backend === 'codex' ? 'BOAI_NATIVE_CODEX' : 'BOAI_NATIVE_CLAUDE']
  if (backend !== 'api') expect(executable).toBeTruthy(); s.backend = backend; s.expected = backend === 'codex' ? '67' : '83'
  await d.reviewData('真实浏览器预登记', { backend, executable, executableSha256: backend === 'api' ? undefined : createHash('sha256').update(await readFile(executable!)).digest('hex'), messages: 1, retries: 0, observationDeadlineMs: 300000, nativeBudget: 'none; observation limit belongs only to this test', pagePurpose: 'isolated form; only browser tool can save; visual target never included in user message', permission: 'only this local form browser operations; native external commands refused' })
  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/save') {
      let body = ''; for await (const chunk of request) body += String(chunk)
      const saved = new URLSearchParams(body).get('visual') ?? ''; s.saves.push(saved)
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ saved })); return
    }
    response.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' })
    response.end(`<!doctype html><meta charset="utf-8"><title>员工网页表单</title><style>body{padding:40px;font:24px sans-serif}input,button{font:24px sans-serif;margin:12px}</style><h1>员工网页表单</h1><p>把图片中的数字填入视觉数字并保存，页面随后显示实际保存值。</p><canvas width="300" height="170" aria-label="待识别数字图片"></canvas><form><label>视觉数字<input name="visual"></label><button>保存</button></form><p id="result" role="status">尚未保存</p><script>const c=document.querySelector('canvas').getContext('2d');c.fillStyle='#1643ad';c.fillRect(0,0,300,170);c.fillStyle='white';c.font='bold 100px sans-serif';c.fillText('${s.expected}',80,120);document.querySelector('form').onsubmit=async e=>{e.preventDefault();const r=await fetch('/save',{method:'POST',body:new URLSearchParams(new FormData(e.target))});document.querySelector('#result').textContent='实际已保存：'+(await r.json()).saved;};</script>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); d.trackServer(server)
  s.origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const connection = backend === 'api' ? (await prepareV2DataRoot(d.root), await prepareSavedModel(d)) : undefined
  await d.start(connection ? await systemKeychainLaunch(d) : undefined)
  const draft = { name: '网页真实员工-' + backend, executable: executable!, args: [], protocol: backend === 'codex' ? 'codex-app-server' as const : 'claude-cli' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
  let profile: LaunchProfile | undefined
  if (backend !== 'api') {
    await d.page.evaluate(input => window.boai.request('testLaunchProfileDraft', input), draft)
    profile = await d.page.evaluate(input => window.boai.request('saveLaunchProfile', input), draft) as LaunchProfile
  }
  s.agent = await d.page.evaluate(({ backend, profile, connection }) => window.boai.request('saveAgent', { name: '网页员工-' + backend, role: '操作用户引用的内置网页', instructions: '此任务使用BOAI browser_tool操作用户已引用的页面；不要使用命令行、外部浏览器或网络工具。必须实际读取截图、填写、保存、回读，按实际结果交付。用户消息没有提供图片答案，不能猜测。', connectionId: connection?.id ?? '', modelId: connection?.defaultModel ?? (backend === 'claude' ? 'sonnet' : ''), ...(profile ? { executionBackend: { kind: backend === 'codex' ? 'codex-local' as const : 'claude-local' as const, profileId: profile.id } } : {}), nativeOptions: backend === 'codex' ? { codexSandbox: 'workspace-write', codexApprovalPolicy: 'on-request' } : { claudePermissionMode: 'default' }, color: '#3478ce', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }), { backend, profile, connection })
  s.chat = await d.page.evaluate(id => window.boai.request('createConversation', { kind: 'direct', title: '真实网页任务', agentIds: [id] }), s.agent!.id)
  s.dataPath = (await d.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  const browserWindow = await d.page.evaluate(() => window.boai.request('openBrowser', {}))
  await browserToolbarAction(d, browserWindow.instanceId, 'navigate', s.origin + '/form')
  await expect.poll(async () => (await d.page.evaluate(() => window.boai.request('getBrowserWindows', {})))[0]?.title).toBe('员工网页表单')
  s.reference = await d.page.evaluate(() => window.boai.request('referenceBrowserPage', {}))
  await d.page.evaluate(() => window.boai.request('browserControl', { action: 'hide' }))
  await d.reviewData('本批源码身份', Object.fromEntries(await Promise.all(['dist/main/main.cjs','dist/runtime/worker.mjs','src/main/browser/browser-cdp.ts','src/main/browser/browser-pane-manager.ts','src/runtime/modules/browser/session.ts','tests/e2e/steps/employee-browser-real.steps.ts'].map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')]))))
  await d.reviewData('真实网页身份', { reference: s.reference, agent: s.agent, chat: s.chat, profile, connection: connection && { provider: connection.provider, model: connection.defaultModel } })
})
When('我要求员工识别图中数字并填写保存', async ({ runtime: d, employeeBrowser: s }) => {
  const content = '请操作我引用的当前网页。先用 snapshot 看页面，用 screenshot --png 读取蓝色图片里的数字；把识别的数字填入“视觉数字”，点击“保存”，再用 snapshot 回读页面显示的实际已保存值。只操作本页表单，不打开其他浏览器，不使用命令行或其他网络工具。' + (s.backend === 'api' ? '完成后交付实际结果，回复识别数字和实际保存值。' : '完成后用 report_work 交付实际结果，回复识别数字和实际保存值。')
  await d.reviewData('原始真实请求', { content, reference: s.reference })
  await d.page.evaluate(input => window.boai.request('sendMessage', input), { conversationId: s.chat!.id, content, mentionIds: [], requestId: 'real-browser-once-' + s.backend, browserReference: { instanceId: s.reference!.instanceId, pageVersion: s.reference!.pageVersion } })
  try {
    await expect.poll(async () => {
      const detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id); s.detail = detail
      const snapshot = await d.page.evaluate(() => window.boai.request('snapshot', undefined))
      for (const approval of snapshot.approvals) {
        const allow = approval.kind === 'browser' && approval.command.includes(s.origin!)
        await d.reviewData('网页操作批准-' + approval.id, { ...approval, approved: allow })
        await d.page.evaluate(input => window.boai.request('approve', input), { id: approval.id, approved: allow })
      }
      if (s.backend !== 'api') for (const run of detail.runs) for (const action of await d.page.evaluate(input => window.boai.request('listNativeActions', input), { conversationId: s.chat!.id, runId: run.id }) as NativeAction[]) {
        if (action.status !== 'pending' || action.kind !== 'approval') continue
        const allow = /^mcp__boai__(browser_tool|report_work)$/.test(action.method)
        await d.reviewData('原生网页工具批准-' + action.id, { id: action.id, method: action.method, approved: allow })
        await d.page.evaluate(input => window.boai.request('respondNativeAction', input), { conversationId: s.chat!.id, runId: run.id, actionId: action.id, response: { option: s.backend === 'codex' ? allow ? 'accept' : 'decline' : allow ? 'allow' : 'deny' } })
      }
      return detail.runs.length > 0 && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted'].includes(turn.status))
    }, { timeout: 300000, intervals: [200, 500, 1000] }).toBe(true)
  } catch (error) { s.error = error; await d.page.evaluate(id => window.boai.request('cancelRun', { conversationId: id }), s.chat!.id); throw error }
  await d.reviewData('原生网页任务终态', { detail: s.detail, records: await browserRecords(s.dataPath!), saves: s.saves })
})
Then('网站实际保存正确数字且重启不重放', async ({ runtime: d, employeeBrowser: s }) => {
  expect(s.saves).toEqual([s.expected])
  const records = await browserRecords(s.dataPath!)
  expect(records.actions.some(a => a.command === '"screenshot" "--png"' && a.status === 'completed')).toBe(true)
  expect(records.works).toHaveLength(1); expect(records.works[0].status).toBe('delivered')
  expect(s.detail!.messages.filter(m => m.senderType === 'agent' && m.status === 'completed').map(m => m.content).join('\n')).toContain(s.expected!)
  expect((await nativeBrowserViews(d))[0].visible).toBe(false)
  expect(records.evidence.every(e => e.instanceId === s.reference!.instanceId && e.url === s.reference!.url)).toBe(true)
  const before = s.detail!.runs.map(run => run.id), count = records.actions.length
  await d.reviewNativeCheckpoint('真实网页完成后主窗口')
  await d.restart()
  const after = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id)
  expect(after.runs.map(run => run.id)).toEqual(before); expect(s.saves).toEqual([s.expected]); expect((await browserRecords(s.dataPath!)).actions).toHaveLength(count)
  await d.reviewData('网页重启零重放', { before, after, saves: s.saves, actionCount: count })
})

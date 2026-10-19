/*
 * [OUTPUT]: 2026-10-19 真实测试准备/断言改用独立检索服务和工具；本次未运行真实供应商场景。
 * [OUTPUT]: 登录页单次真实Fetch验收区分已取页面与不可访问的私有内容，不登录、不换源、重启零重放。
 * [OUTPUT]: 三种明确登记的真实选择边界；否定/引用不选源，同名先聊天澄清、零业务搜索及重启核对。
 * [OUTPUT]: 原任务保留；可显式登记HTML限定查询，区别于原提供方404，仍要求真实搜索/读取/引用与零Work。
 * [OUTPUT]: DeepSeek API与Exa MCP分批实际验证；DeepSeek凭据仅通过原vault桥，三运行路径共享原SourceService。
 * [INPUT]: Explicit real-run switch, isolated Desktop, original native login or selected saved API connection and public Exa MCP.
 * [OUTPUT]: One message/backend, original conversation-title navigation, actual source choice/search/read/citation, pending approvals, bounded observation and restart; no automatic retries.
 * [POS]: SE real employee search acceptance; deterministic facts are distinct from human quality review.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, ToolEvent } from '../../../src/shared/domain'
import type { WebSearchServiceConfig } from '../../../src/shared/domain/web-search'
import type { ExecutionEvidence } from '../../../src/shared/domain/execution'
import { prepareV2DataRoot } from '../../../src/main/migration'
import { prepareSavedModel, prepareDeepSeekSearchSource, systemKeychainLaunch } from '../support/saved-model'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type State = { loginPage?: boolean; selectionCase?: 'deny' | 'quote' | 'ambiguous'; secondSource?: WebSearchServiceConfig; provider?: string; backend?: string; agent?: DigitalAgent; chat?: Conversation; source?: WebSearchServiceConfig; dataPath?: string; detail?: ConversationDetail; evidence: ExecutionEvidence[]; error?: string }
function records(dataPath: string) {
  const db = new DatabaseSync(join(dataPath, 'boai.sqlite'), { readOnly: true })
  const load = (collection: string) => db.prepare('SELECT value FROM records WHERE collection=? ORDER BY rowid').all(collection).map(row => JSON.parse(String(row.value)))
  try { return { artifacts: load('artifacts'), runs: load('runs'), messages: load('messages'), works: load('workItems'), approvals: load('approvals'), actions: load('nativeActions') } } finally { db.close() }
}
async function evidence(d: Desktop, conversationId: string, runId: string) {
  const items: ExecutionEvidence[] = []; let after: number | undefined
  do {
    const page = await d.page.evaluate(input => window.boai.request('listExecutionEvidence', input), { conversationId, runId, after })
    for (let item of page.items) {
      if (item.deferred) {
        let content = '', offset = 0
        for (;;) {
          const part = await d.page.evaluate(input => window.boai.request('getExecutionContent', input), { conversationId, runId, evidenceId: item.id, offset })
          expect(part.revision).toBe(item.revision); content += part.content
          if (part.next === undefined) break; offset = part.next
        }
        item = JSON.parse(content) as ExecutionEvidence
      }
      items.push(item)
    }
    after = page.next
  } while (after !== undefined)
  return items
}
export const test = base.extend<{ webSearch: State }>({ webSearch: async ({ runtime }, use) => {
  const state: State = { evidence: [] }
  try { await use(state) } finally {
    if (state.dataPath) {
      if (state.chat) try {
        state.detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.chat.id)
        for (const run of state.detail.runs) state.evidence.push(...await evidence(runtime, state.chat.id, run.id))
      } catch (error) { await runtime.reviewData('搜索最终IPC留证失败', { error: String(error) }) }
      await runtime.reviewData('真实搜索最终事实', { backend: state.backend, source: state.source, detail: state.detail, evidence: state.evidence, error: state.error, selectionCase: state.selectionCase, loginPage: state.loginPage, secondSource: state.secondSource, qualityReview: 'pending; deterministic protocol checks only' })
      await archiveNativeFinalReview(runtime, { label: '真实员工搜索', records: async () => records(state.dataPath!) })
    }
  }
} })
const { Given, When, Then } = createBdd(test)
Given('本次核对实际登录页读取', async ({ webSearch: s }) => { s.loginPage = true })
Given('本次核对搜索选择的{string}', async ({ webSearch: s }, choice: string) => {
  if (!['deny', 'quote', 'ambiguous'].includes(choice)) throw new Error('Unknown selection case')
  s.selectionCase = choice as State['selectionCase']
})
Given('已为{string}搜索任务准备真实的{string}员工', async ({ runtime: d, webSearch: s }, provider: string, backend: string) => {
  test.skip((process.env.BOAI_WEB_SEARCH_PROVIDER ?? 'exa') !== provider, '不在本批已登记搜索服务中'); s.provider = provider
  test.skip(process.env.BOAI_REAL_WEB_SEARCH !== '1', '真实搜索需显式启用')
  test.skip(!(process.env.BOAI_WEB_SEARCH_BACKENDS ?? '').split(',').includes(backend), '不在本批已登记后端中')
  test.setTimeout(300000); test.info().annotations.push({ type: 'model-mode', description: 'real-provider' }); s.backend = backend
  const executable = process.env[backend === 'codex' ? 'BOAI_NATIVE_CODEX' : 'BOAI_NATIVE_CLAUDE']
  if (backend !== 'api') expect(executable).toBeTruthy()
  await d.reviewData('真实搜索预登记', { backend, executable, executableSha256: backend === 'api' ? undefined : createHash('sha256').update(await readFile(executable!)).digest('hex'), messages: 1, retries: 0, observationDeadlineMs: 210000, modelAccounting: backend === 'api' ? 'original API call budget' : 'native autonomous, internal request count unknown; test observation deadline only', searchPlan: s.loginPage ? 'one actual DeepSeek Fetch of https://github.com/login; no search/login/retry; identify inaccessible private content' : s.selectionCase ? 'no provider business calls; preserve current preference; clarify ambiguity in chat' : 'one public search and one bounded URL read; no private data', selectionCase: s.selectionCase, source: provider === 'deepseek' ? 'https://api.deepseek.com/v1/tools' : 'https://mcp.exa.ai/mcp', qualityReview: 'pending' })
  await prepareV2DataRoot(d.root)
  const connection = backend === 'api' ? await prepareSavedModel(d) : undefined
  if (provider === 'deepseek') {
    s.source = await prepareDeepSeekSearchSource(d)
    if (s.selectionCase === 'ambiguous') s.secondSource = await prepareDeepSeekSearchSource(d)
  }
  await d.start(connection || provider === 'deepseek' ? await systemKeychainLaunch(d) : undefined)
  let profile: LaunchProfile | undefined
  if (backend !== 'api') {
    const draft = { name: '搜索真实员工-' + backend, executable: executable!, args: [], protocol: backend === 'codex' ? 'codex-app-server' as const : 'claude-cli' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
    await d.page.evaluate(input => window.boai.request('testLaunchProfileDraft', input), draft)
    profile = await d.page.evaluate(input => window.boai.request('saveLaunchProfile', input), draft)
  }
  s.source ??= await d.page.evaluate(() => window.boai.request('saveWebSearchService', { id: crypto.randomUUID(), expectedRevision: 0, provider: 'exa', name: 'Exa公开搜索', enabled: true }))
  s.agent = await d.page.evaluate(({ backend, profile, connection, sourceId, secondSourceId }) => window.boai.request('saveAgent', {
    name: '搜索员工-' + backend, role: '查证公开资料并引用来源', instructions: '按用户要求查证公开资料，引用实际读取的来源；区分搜索摘要与正文、失败与未知。本任务只需普通聊天答复，不创建文件。',
    connectionId: connection?.id ?? '', modelId: connection?.defaultModel ?? (backend === 'claude' ? 'sonnet' : ''),
    ...(profile ? { executionBackend: { kind: backend === 'codex' ? 'codex-local' as const : 'claude-local' as const, profileId: profile.id } } : {}),
    executionPermission: 'ask', nativeOptions: backend === 'codex' ? { codexSandbox: 'read-only', codexApprovalPolicy: 'on-request' } : { claudePermissionMode: 'default' },
    webSearch: { mode: 'browser', allowedServiceIds: [sourceId, ...(secondSourceId ? [secondSourceId] : [])] }, sourceIds: [], color: '#3478ce', skillIds: [], knowledgeIds: [], allowCommands: false, active: true,
  }), { backend, profile, connection, sourceId: s.source.id, secondSourceId: s.secondSource?.id })
  s.chat = await d.page.evaluate(id => window.boai.request('createConversation', { kind: 'direct', title: '真实搜索-' + id, agentIds: [id] }), s.agent.id)
  s.dataPath = (await d.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await d.reviewData('真实搜索员工与来源', { agent: s.agent, source: s.source, secondSource: s.secondSource, selectionCase: s.selectionCase, chat: s.chat, profile, connection: connection && { provider: connection.provider, model: connection.defaultModel } })
})
When('我明确要求用指定来源搜索并读取官方资料', async ({ runtime: d, webSearch: s }) => {
  const queryInstruction = process.env.BOAI_WEB_SEARCH_QUERY_KIND === 'html' ? '搜索词请使用“site:docs.python.org/3/library/pathlib.html PurePath Path”，仅选择HTML文档结果；不读取/_sources/下的原始文本。' : ''
  const content = `这次请用我配置的网页检索服务“${s.source!.name}”，临时覆盖默认浏览器。查证 Python pathlib 的纯路径与具体路径有什么区别。${queryInstruction}请先搜索一次（最多1条结果），再从该搜索结果读取一次 Python 官方文档正文（最多3000字符），最后用中文简短说明两者区别并附上实际读取的官方URL。只查询公共资料，不用命令行、不写文件、不用其他搜索来源；服务失败就如实说明，不重试。`
  await sendAndWait(d, s, content)
})
async function sendAndWait(d: Desktop, s: State, content: string) {
  await d.reviewData('原始搜索请求', { content, requestId: 'real-search-once-' + s.provider + '-' + s.backend + (s.selectionCase ? '-' + s.selectionCase : s.loginPage ? '-login-page' : '') })
  await d.page.evaluate(input => window.boai.request('sendMessage', input), { conversationId: s.chat!.id, content, mentionIds: [], requestId: 'real-search-once-' + s.provider + '-' + s.backend + (s.selectionCase ? '-' + s.selectionCase : s.loginPage ? '-login-page' : '') })
  await d.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(s.chat!.title) }).click()
  try {
    await expect.poll(async () => {
      s.detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id)
      const snapshot = await d.page.evaluate(() => window.boai.request('snapshot', undefined))
      for (const approval of snapshot.approvals) {
        await d.reviewData('搜索意外写操作拒绝-' + approval.id, approval)
        await d.page.evaluate(id => window.boai.request('approve', { id, approved: false }), approval.id)
      }
      for (const run of s.detail.runs) for (const action of await d.page.evaluate(input => window.boai.request('listNativeActions', input), { conversationId: s.chat!.id, runId: run.id })) {
        if (action.status !== 'pending' || action.kind !== 'approval') continue
        const allow = !s.selectionCase && /^mcp__boai__(select_web_search|inspect_web_search|call_web_search)$/.test(action.method)
        await d.reviewData('搜索原生批准-' + action.id, { id: action.id, method: action.method, allowed: allow })
        await d.page.evaluate(input => window.boai.request('respondNativeAction', input), { conversationId: s.chat!.id, runId: run.id, actionId: action.id, response: { option: s.backend === 'codex' ? allow ? 'accept' : 'decline' : allow ? 'allow' : 'deny' } })
      }
      return s.detail.runs.length > 0 && s.detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && s.detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', ...(s.selectionCase === 'ambiguous' ? ['waiting_user'] : [])].includes(turn.status))
    }, { timeout: 210000, intervals: [300, 800, 1500] }).toBe(true)
  } catch (error) { s.error = String(error); await d.page.evaluate(id => window.boai.request('cancelRun', { conversationId: id }), s.chat!.id); throw error }
  await d.reviewNativeCheckpoint('真实搜索答复终态')
  await d.reviewData('搜索调用与原答复', s.detail)
}

Then('员工实际搜索读取并引用原网页且重启不重放', async ({ runtime: d, webSearch: s }) => {
  const detail = s.detail!, tools = detail.runs.flatMap(run => run.toolEvents), calls = tools.filter(tool => tool.name === 'call_web_search')
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  const selected = tools.filter(tool => tool.name === 'select_web_search')
  expect(selected).toHaveLength(1); expect(selected[0].status).toBe('completed')
  expect(JSON.parse(selected[0].input!)).toMatchObject({ mode: 'source', sourceId: s.source!.id, revision: s.source!.revision })
  expect(calls).toHaveLength(2); expect(calls.every(tool => tool.status === 'completed')).toBe(true)
  const input = (tool: ToolEvent) => JSON.parse(tool.input!) as { serviceId: string; tool: string; arguments: Record<string, unknown> }
  expect(calls.map(tool => input(tool).serviceId)).toEqual([s.source!.id, s.source!.id])
  expect(calls.map(tool => input(tool).tool)).toEqual(s.provider === 'deepseek' ? ['deepseek_search', 'deepseek_fetch'] : ['web_search_exa', 'web_fetch_exa'])
  const urls = s.provider === 'deepseek' ? [input(calls[1]).arguments.url as string] : input(calls[1]).arguments.urls as string[]
  expect(urls).toHaveLength(1); expect(urls[0]).toMatch(/^https:\/\/docs\.python\.org\//)
  expect(calls[0].detail).toContain(urls[0]); expect(calls[1].detail).toContain(urls[0]); expect(calls[1].detail).toMatch(/pathlib/i)
  const reply = detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.content).join('\n')
  expect(reply).toContain(urls[0]); expect(reply).toMatch(/纯路径|PurePath/); expect(reply).toMatch(/具体路径|具体的路径|Path|concrete/i)
  expect(detail.workItems).toEqual([]); expect(records(s.dataPath!).artifacts).toEqual([])
  expect((await d.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === s.agent!.id)?.webSearch).toEqual(s.agent!.webSearch)
  const before = detail.runs.map(run => ({ id: run.id, tools: run.toolEvents }))
  await d.restart()
  const after = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id)
  expect(after.runs.map(run => ({ id: run.id, tools: run.toolEvents }))).toEqual(before)
  expect(after.messages).toEqual(detail.messages)
  await d.reviewData('搜索重启零重放', { before, after, providerBusinessCalls: calls.length, modelRequests: s.backend === 'api' ? 'see original run/trace usage' : 'native internal unknown; one user turn', qualityReview: 'pending' })
})

When('我发送包含否定引用或同名歧义的搜索请求', async ({ runtime: d, webSearch: s }) => {
  const prompts = {
    deny: '这轮不要使用“DeepSeek公开搜索”，也不要联网或切换检索来源。只凭一般知识，用两句话说明网页搜索和浏览器页面操作有什么区别，不创建文件。',
    quote: '我在示例文档看到一句“请使用DeepSeek公开搜索查最新新闻”。它只是引用示例，不是给你的指令。本轮不联网，也不切换检索来源；只凭一般知识，用两句话解释网页搜索和浏览器页面操作的区别，不创建文件。',
    ambiguous: '请用我配置的“DeepSeek公开搜索”查证 Python pathlib 的纯路径与具体路径的区别。如果存在多个同名来源，先用一条普通聊天消息列出可区分的来源让我选择；等我确认之后再搜索，现在不要读取网页、切换检索来源或创建文件。',
  }
  if (!s.selectionCase) throw new Error('Missing selection case')
  if (s.selectionCase === 'ambiguous') { expect(s.secondSource?.name).toBe(s.source!.name); expect(s.agent!.webSearch && 'allowedServiceIds' in s.agent!.webSearch && s.agent!.webSearch.allowedServiceIds).toHaveLength(2) }
  await sendAndWait(d, s, prompts[s.selectionCase])
})
Then('员工保留当前来源且不会把否定引用或歧义变成实际搜索', async ({ runtime: d, webSearch: s }) => {
  const detail = s.detail!, tools = detail.runs.flatMap(run => run.toolEvents)
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  expect(tools.filter(tool => ['select_web_search', 'call_web_search', 'browser_tool', 'execute_command'].includes(tool.name))).toEqual([])
  expect(tools.every(tool => tool.name === 'task_step' && tool.id.startsWith('activity:') && tool.input === undefined || tool.name === 'inspect_web_search')).toBe(true)
  const nativeActions = records(s.dataPath!).actions
  expect(nativeActions).toEqual([])
  const reply = detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.content).join('\n')
  expect(reply.trim()).not.toBe('')
  if (s.selectionCase === 'ambiguous') { expect(reply).toMatch(/同名|两个|2\s*个/); expect(reply).toMatch(/选择|确认|哪一个/) }
  else { expect(reply).toMatch(/搜索/); expect(reply).toMatch(/浏览器/); expect(reply).not.toMatch(/我(?:已|已经)(?:完成|进行)(?:了)?(?:搜索|检索)/) }
  expect(detail.workItems).toEqual([]); expect(records(s.dataPath!).artifacts).toEqual([])
  expect((await d.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === s.agent!.id)?.webSearch).toEqual(s.agent!.webSearch)
  await d.restart()
  const after = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id)
  expect(after.messages).toEqual(detail.messages); expect(after.runs).toEqual(detail.runs)
  await d.reviewData('真实搜索选择边界与零重放', { selectionCase: s.selectionCase, before: detail, after, providerBusinessCalls: 0, nativeActions, sourceIds: s.agent!.sourceIds, qualityReview: 'pending' })
})

When('我要求读取登录页并判断私有内容是否可访问', async ({ runtime: d, webSearch: s }) => {
  expect(s.loginPage).toBe(true)
  await sendAndWait(d, s, `本轮使用我配置的网页检索服务“${s.source!.name}”，临时覆盖默认浏览器。仅抓取一次 https://github.com/login （最多6000字符），根据实际返回内容说明它能否提供账户内私有仓库的文件正文。不要搜索其他网页，不登录，不重试，不写文件。如果只取得登录页或抓取失败，说明实际限制，不能声称读过私有仓库。用中文简短回答并注明实际访问的URL。`)
})
Then('员工区分真实登录页与未读取的私有资料', async ({ runtime: d, webSearch: s }) => {
  const detail = s.detail!, tools = detail.runs.flatMap(run => run.toolEvents), calls = tools.filter(tool => tool.name === 'call_web_search')
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  const choice = tools.filter(tool => tool.name === 'select_web_search')
  expect(choice).toHaveLength(1); expect(JSON.parse(choice[0].input!)).toMatchObject({ mode: 'source', sourceId: s.source!.id })
  expect(calls).toHaveLength(1); expect(calls[0].status).toBe('completed')
  expect(JSON.parse(calls[0].input!)).toMatchObject({ serviceId: s.source!.id, tool: 'deepseek_fetch', arguments: { url: 'https://github.com/login' } })
  expect(calls[0].detail).toMatch(/sign in|log.?in|登录/i)
  expect(tools.filter(tool => ['browser_tool', 'execute_command'].includes(tool.name))).toEqual([])
  const reply = detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.content).join('\n')
  expect(reply).toContain('https://github.com/login'); expect(reply).toMatch(/登录/); expect(reply).toMatch(/(?:无法|不能|不包含|没有|未能).{0,30}(?:私有|仓库|文件|正文)|(?:私有|仓库|文件|正文).{0,30}(?:无法|不能|未读取|没有)/)
  expect(detail.workItems).toEqual([]); expect(records(s.dataPath!).artifacts).toEqual([])
  expect((await d.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === s.agent!.id)?.webSearch).toEqual(s.agent!.webSearch)
  await d.restart()
  const after = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id)
  expect(after.runs).toEqual(detail.runs); expect(after.messages).toEqual(detail.messages)
  await d.reviewData('实际登录页与私有内容边界', { before: detail, after, providerBusinessCalls: 1, privateContentRead: false, qualityReview: 'pending' })
})

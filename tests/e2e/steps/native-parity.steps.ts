/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 独立重复身份与真实附件留证；Claude长命令/用户停止/重启探针共用冻结账本，不改变产品协议。
 * [INPUT]: 相同任务的真实CLI、原pnpm dev桌面入口与16次外部运行共享上限。
 * [OUTPUT]: 直接CLI与真实产品消息/原件/完整事件，失败不丢样本，重启零重放和原生模型身份单列。
 * [POS]: 本机接入对照BDD；不修改产品执行策略或伪造任何模型输出。
 * [PROTOCOL]: 变化同步Header和steps/.folder.md。
 */
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile } from '../../../src/shared/domain'
import type { ExecutionEvidence, NativeAction } from '../../../src/shared/domain/execution'
import { test as base } from '../support/test'
import { EvaluationBudget } from '../../evaluation/budget'
import { parityCase, seedParity, captureParity, checkParity, nativeInputCoverage, nativeToolChecks, directCliTurn, PARITY_VERSION, STREAM_STABILITY, sha, type ParityCase, type ParityRuntime, type ParityTask, type DirectTurn, type ParityCheck } from '../../evaluation/native-parity'
import type { Desktop } from '../support/desktop'
import { nextMaterialDialog } from '../support/materials'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
type Captured = Awaited<ReturnType<typeof captureParity>>
type Result = { round: number; output: string; files: Captured; checks: ParityCheck[]; error?: string; native?: DirectTurn; runId?: string }
type State = { runtime: ParityRuntime; executable: string; model: string; scenario: ParityCase; direct: Result[]; boai: Result[]; directRoot: string; directSource?: string; cwd?: string; inputRoot?: string; blockingInputs?: string[]; nativeInputs?: NativeAction[]; agent?: DigitalAgent; chat?: Conversation; detail?: ConversationDetail; error?: string; summaryPath: string }
type StreamState = { agent?: DigitalAgent; chat?: Conversation; cwd?: string; detail?: ConversationDetail; rounds: number; completed?: string; interrupted?: string; checks: string[] }
export const test = base.extend<{ parityState: State; streamState: StreamState }>({ parityState: async ({}, use) => { await use({} as State) }, streamState: async ({}, use) => { await use({ rounds: 0, checks: [] }) } })
const { Given, When, Then, After } = createBdd(test)
const request = <T>(d: Desktop, method: string, input: unknown) => d.page.evaluate(async ({ method, input }) => window.boai.request(method as never, input as never), { method, input }) as Promise<T>
const budgetFile = () => process.env.BOAI_PARITY_BUDGET_FILE!
const externalTurnLimit = () => { const limit = Number(process.env.BOAI_PARITY_MAX_EXTERNAL_TURNS ?? 16); if (!Number.isInteger(limit) || limit < 1 || limit > 16) throw Error('Invalid registered native verification budget'); return limit }
const within = (cwd: string, file: string) => { const path = relative(cwd, resolve(cwd, file)); return path !== '..' && !path.startsWith('../') && !isAbsolute(path) }
async function executionEvidence(d: Desktop, conversationId: string, runId: string) {
  const items: ExecutionEvidence[]=[];let after:number|undefined
  do { const page=await request<any>(d,'listExecutionEvidence',{conversationId,runId,after});for(let item of page.items){if(item.deferred){let content='',offset=0;for(;;){const part=await request<any>(d,'getExecutionContent',{conversationId,runId,evidenceId:item.id,offset});expect(part.revision).toBe(item.revision);content+=part.content;if(part.next===undefined)break;offset=part.next}item=JSON.parse(content)}items.push(item)}after=page.next }while(after!==undefined)
  return items
}
async function captureNativeInputs(d: Desktop, s: State, runId: string) {
  const actions = await request<NativeAction[]>(d, 'listNativeActions', { conversationId: s.chat!.id, runId })
  s.nativeInputs = [...(s.nativeInputs ?? []).filter(action => action.runId !== runId), ...actions.filter(action => action.kind === 'input')]
  return actions
}
async function archiveFiles(d: Desktop, root: string, state: State, label: string) {
  for (const name of new Set([...state.scenario.outputs, ...state.scenario.frozen])) {
    const file=join(state.scenario.inputFiles?.includes(name)?state.inputRoot??root:root,name)
    try { await readFile(file); await d.reviewFile(label + '-' + name, file, { required: true }) } catch (error) { await d.reviewData(label + '-文件缺口-' + name, { error: String(error) }) }
  }
}
Given('启动不调用模型的对照评估窗口', async ({ runtime }) => { test.setTimeout(120000); await runtime.start() })
Then('对照评估窗口显示会话列表', async ({ runtime }) => { await expect(runtime.page.getByRole('navigation', { name: '会话列表', exact: true })).toBeVisible(); expect(runtime.errors).toEqual([]); await runtime.reviewCheckpoint('零模型开发窗口预检') })
Then('对照评估窗口能够准备三种原件附件而不发送消息',async({runtime:d})=>{
  const connection=await request<{id:string}>(d,'saveConnection',{name:'零模型附件预检',provider:'openai-compatible',baseUrl:'http://127.0.0.1:9',defaultModel:'never-called'})
  const agent=await request<DigitalAgent>(d,'saveAgent',{name:'附件预检员工',role:'只准备材料，不发送消息',instructions:'不运行任何任务',connectionId:connection.id,modelId:'never-called',color:'#00AABB',skillIds:[],knowledgeIds:[],allowCommands:false,active:true})
  const chat=await request<Conversation>(d,'createConversation',{kind:'direct',title:'零模型附件预检',agentIds:[agent.id]})
  const folder=join(await realpath(d.root),'precheck-materials'),scenario=parityCase('inputs','ZERO-MODEL-PRECHECK');await seedParity(folder,scenario)
  await d.page.getByRole('navigation',{name:'会话列表',exact:true}).getByRole('button',{name:new RegExp(chat.title)}).click()
  for(const [index,name] of ['project.md','payload.json','one.png'].entries()){
    await nextMaterialDialog(d,{path:join(folder,name)});await d.page.getByRole('button',{name:'添加或更多操作',exact:true}).click();await d.page.getByRole('menuitem',{name:'添加文件',exact:true}).click()
    await expect(d.page.locator('[data-material-draft-id][data-material-status="ready"]')).toHaveCount(index+1)
  }
  const detail=await request<ConversationDetail>(d,'getConversation',{id:chat.id});expect(detail.runs).toHaveLength(0);expect(detail.messages).toHaveLength(0)
  await d.reviewData('三种原件实际就绪-零业务消息',detail.materials);await d.reviewCheckpoint('零模型实际附件预检')
})
Given('登记 {string} 的 {string} 本机接入对照任务', async ({ runtime: d, parityState: s }, runtime: string, task: string) => {
  test.skip(process.env.BOAI_NATIVE_REAL !== '1', '真实CLI对照只允许显式启动，不能用协议夹具冒充')
  test.skip(!!process.env.BOAI_PARITY_RUNTIME && process.env.BOAI_PARITY_RUNTIME !== runtime, '不在本次冻结的后端范围内')
  test.setTimeout(1500000)
  test.info().annotations.push({ type: 'model-mode', description: 'real-provider' })
  expect(budgetFile()).toBeTruthy()
  const kind = runtime as ParityRuntime, executable = process.env[kind === 'codex' ? 'BOAI_NATIVE_CODEX' : 'BOAI_NATIVE_CLAUDE']!
  expect(executable).toBeTruthy()
  const marker = 'BOAI-PARITY-' + task.toUpperCase() + '-20261012'
  Object.assign(s, { runtime: kind, executable, model: kind === 'claude' ? 'sonnet' : '', scenario: parityCase(task as ParityTask, marker), direct: [], boai: [], directRoot: join(d.root, 'direct'), summaryPath: join(process.env.BOAI_PARITY_RESULTS_DIR!, `${runtime}-${task}-attempt${test.info().repeatEachIndex}-retry${test.info().retry}.json`) })
  await seedParity(s.directRoot, s.scenario)
  await d.reviewData('对照预登记', { version: PARITY_VERSION, runtime: kind, task, executable, modelSelection: s.model || 'existing native default', permission: kind === 'codex' ? { sandbox: 'workspace-write', approval: 'on-request' } : { mode: 'acceptEdits', commands: ['node verify.mjs', 'node verify.mjs corrected'] }, prompts: s.scenario.prompts, inputs: s.scenario.files, maxExternalTurns: externalTurnLimit(), repeatIndex: test.info().repeatEachIndex, plannedRepeats: Number(process.env.BOAI_PARITY_REPEATS ?? 1), retries: 0, source: 'real-local-cli', baseline: 'native CLI exec/print; BOAI uses native application protocol', differences: ['BOAI adds employee/context/product tools', 'direct CLI permissions approve only the registered verifier; BOAI grants the same requested verifier per action', 'BOAI restarts between messages; direct CLI resumes its own session'] })
})
When('直接本机执行该任务及后续消息', async ({ runtime: d, parityState: s }) => {
  if (process.env.BOAI_PARITY_REUSE_DIRECT_DIR) {
    const file = join(process.env.BOAI_PARITY_REUSE_DIRECT_DIR, `${s.runtime}-${s.scenario.id}-attempt0-retry0.json`)
    const saved = JSON.parse(await readFile(file, 'utf8'))
    if (saved.version !== PARITY_VERSION || saved.runtime !== s.runtime || saved.task !== s.scenario.id || saved.direct?.length !== s.scenario.prompts.length) throw Error('前批直接CLI基线不完整，不能重发或伪造')
    s.direct = saved.direct; s.directSource = file
    await d.reviewData('前批已完成CLI基线-不重跑', { source: file, results: s.direct, note: '已完成CLI登记轮次原样复用，原批BOAI失败保持，跨批来源明确，不称同场新执行' }); return
  }
  let sessionId: string | undefined
  for (const [index, prompt] of s.scenario.prompts.entries()) {
    if (index && !sessionId) break
    const native = await directCliTurn({ runtime: s.runtime, executable: s.executable, model: s.model, cwd: s.directRoot, prompt, sessionId, budgetFile: budgetFile(), maxTurns: externalTurnLimit(), timeoutMs: 300000 })
    sessionId = native.sessionId
    const files = await captureParity(s.directRoot, s.scenario)
    s.direct.push({ round: index + 1, output: native.output, native, files, checks: [...checkParity(s.scenario, index + 1, files, native.output, s.direct.at(-1)?.files),...(s.scenario.id==='inputs'?nativeToolChecks(native.events,index+1):[])], ...(native.error ? { error: native.error } : {}) })
    await d.reviewData('本机直接运行-' + (index + 1), s.direct.at(-1)); await archiveFiles(d, s.directRoot, s, '本机第' + (index + 1) + '轮')
    if (native.error) break
  }
})
async function approve(d: Desktop, s: State, detail: ConversationDetail) {
  for (const run of detail.runs) for (const action of await request<NativeAction[]>(d, 'listNativeActions', { conversationId: s.chat!.id, runId: run.id })) {
    if (action.status !== 'pending' || action.kind !== 'approval') continue
    const value = action.detail as any, input = value.input ?? value
    const command = String(input.command ?? '')
    const file = input.file_path ?? input.path
    const nativeInputs=join(await realpath(d.root),'v2','agents',s.agent!.id,'workspace','sessions',s.chat!.id,s.runtime==='codex'?'.codex-private':'.claude-private','material-inputs')
    const allow = action.method === 'mcp__boai__publish_artifact' || ['node verify.mjs', 'node verify.mjs corrected'].includes(command.trim()) || ['Read', 'Write', 'Edit'].includes(action.method) && typeof file === 'string' && (within(await realpath(s.cwd!), file) || action.method==='Read' && within(nativeInputs,file))
    await d.reviewData('原生权限决策-' + action.id, { action, allow, reason: allow ? '本场明确文件任务或精确校验命令' : '未包含在本场明确请求中' })
    await request(d, 'respondNativeAction', { conversationId: s.chat!.id, runId: run.id, actionId: action.id, response: { option: s.runtime === 'codex' ? allow ? 'accept' : 'decline' : allow ? 'allow' : 'deny' } })
  }
}
When('通过BOAI执行相同任务及重启后的后续消息', async ({ runtime: d, parityState: s }) => {
  try {
    await d.start()
    const draft = { name: '真实入口对照-' + s.runtime, executable: s.executable, args: [], protocol: s.runtime === 'codex' ? 'codex-app-server' : 'claude-cli', useExistingLogin: true, hostAccessAcknowledged: true }
    await request(d, 'testLaunchProfileDraft', draft)
    const profile = await request<LaunchProfile>(d, 'saveLaunchProfile', draft)
    s.agent = await request<DigitalAgent>(d, 'saveAgent', { name: '对照员工-' + s.runtime, role: '按用户任务使用本机原生能力', instructions: '按用户指令处理任务，公开回复与实际结果一致。', color: '#00AABB', connectionId: '', modelId: s.model, executionBackend: { kind: s.runtime === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, nativeOptions: s.runtime === 'codex' ? { codexSandbox: 'workspace-write', codexApprovalPolicy: 'on-request' } : { claudePermissionMode: 'acceptEdits' }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true })
    s.chat = await request<Conversation>(d, 'createConversation', { kind: 'direct', title: '本机入口对照-' + s.scenario.id, agentIds: [s.agent.id] })
    s.cwd = join(d.root, 'v2', 'agents', s.agent.id, 'workspace', 'sessions', s.chat.id, 'work')
    if(s.scenario.inputFiles){s.inputRoot=join(await realpath(d.root),'explicit-material-inputs');await seedParity(s.inputRoot,s.scenario);await mkdir(s.cwd,{recursive:true});for(const [name,text] of Object.entries(s.scenario.files))if(!s.scenario.inputFiles.includes(name))await writeFile(join(s.cwd,name),text,{flag:'wx'})}
    else await seedParity(s.cwd, s.scenario)
    await d.reviewData('BOAI实际配置', { profile, agent: s.agent, conversation: s.chat })
    for (const [index, prompt] of s.scenario.prompts.entries()) {
      if (index && (s.scenario.id!=='inputs'||index===3)) {
        const before = s.detail!; await d.restart()
        const after = await request<ConversationDetail>(d, 'getConversation', { id: s.chat.id })
        expect(after.runs.map(run => run.id)).toEqual(before.runs.map(run => run.id)); expect(after.artifacts).toEqual(before.artifacts)
        await d.reviewData('重启零重放核对', { beforeRuns: before.runs.map(run => run.id), after })
      }
      await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(s.chat.title) }).click()
      for(const [position,name] of (s.scenario.attachments?.[index]??[]).entries()){
        await nextMaterialDialog(d,{path:join(s.inputRoot!,name)})
        await d.page.getByRole('button',{name:'添加或更多操作',exact:true}).click();await d.page.getByRole('menuitem',{name:'添加文件',exact:true}).click()
        await expect(d.page.locator('[data-material-draft-id][data-material-status="ready"]')).toHaveCount(position+1)
      }
      await new EvaluationBudget(budgetFile(), externalTurnLimit()).reserve('boai-' + s.runtime)
      await d.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(prompt)
      await d.page.getByRole('button', { name: '发送消息', exact: true }).click()
      let detail: ConversationDetail | undefined
      let error: string | undefined
      try {
        await expect.poll(async () => {
          detail = await request<ConversationDetail>(d, 'getConversation', { id: s.chat!.id }); await approve(d, s, detail)
          if(s.scenario.id==='inputs'&&index===1){
            const run=detail.runs.at(-1)
            if(run){const actions=await captureNativeInputs(d,s,run.id);const pending=actions.filter(a=>a.kind==='input'&&a.status==='pending');if(pending.length){s.blockingInputs=pending.map(a=>a.id);return true}}
          }
          const minimum=index+1-(s.blockingInputs?.length&&index>=2?1:0)
          return detail.runs.length>=minimum && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
        }, { timeout: 300000, intervals: [500] }).toBe(true)
      } catch (failure) { error = String(failure) }
      detail = await request<ConversationDetail>(d, 'getConversation', { id: s.chat.id }); s.detail = detail
      const run = s.scenario.id==='inputs'?detail.runs.at(-1):detail.runs[index], output = detail.messages.filter(message => message.senderType === 'agent' && message.runId === run?.id).map(message => message.content).join('\n')
      const files = await captureParity(s.cwd, s.scenario,s.inputRoot)
      const checks = checkParity(s.scenario, index + 1, files, output, s.boai.at(-1)?.files)
      if(s.scenario.id==='inputs'&&run){await captureNativeInputs(d,s,run.id);const evidence=await executionEvidence(d,s.chat.id,run.id);checks.push(...nativeToolChecks(evidence,index+1));await d.reviewData('本轮实际工具核对-'+(index+1),evidence)}
      checks.push({ name: 'real-native-run-completed-or-actual-input-wait', passed: run?.status === 'completed'||s.scenario.id==='inputs'&&index===1&&!!s.blockingInputs?.length, actual: { status: run?.status, error: run?.error, backend: run?.backend } })
      checks.push({ name: 'native-no-boai-usage-or-budget-charge', passed: !!run && run.usage === undefined && run.backend?.totalCostUsd === undefined && (detail.workBudgets ?? []).every(budget => budget.modelCalls === 0 && budget.runs === 0 && Object.keys(budget.usage).length === 0) })
      const outputName=s.scenario.id==='inputs'?'delivery.json':'result.json'
      if (index === 0 || s.scenario.id === 'orders'||s.scenario.id==='inputs'&&index===2) checks.push({ name: 'boai-actual-attachment', passed: detail.artifacts.some(a => a.name === outputName && a.ownerAgentId === s.agent!.id && a.contentHash === files[outputName]?.sha256) })
      if(s.scenario.id==='inputs'&&[0,2].includes(index)){
        const reader=await ProductStore.openReadOnly(join(d.root,'v2','boai.sqlite'))
        try {
          const materials=await reader.load<any>('materials'),copies=await reader.load<any>('materialNativeCopies'),paths=JSON.parse(files['input-paths.json']?.content??'null')
          const expected={markdown:'project.md',json:index===0?'payload.json':'correction.json',image:'one.png'}
          const matches=await Promise.all(Object.entries(expected).map(async([field,name])=>{
            const copy=copies.find(copy=>copy.agentId===s.agent!.id&&materials.some(material=>material.id===copy.materialId&&material.name===name))
            return !!paths&&!!copy&&await realpath(resolve(s.cwd!,paths[field]))===await realpath(join(d.root,'v2',copy.relativePath))
          }))
          checks.push({name:'native-command-read-actual-delivered-paths',passed:matches.every(Boolean)})
          await d.reviewData('实际原件交付身份-'+(index+1),{materials,copies,inputPaths:paths})
        }finally{await reader.close()}
      }
      if (index) checks.push({ name: 'same-native-session', passed: !!run?.backend?.sessionId && run.backend.sessionId === detail.runs[0].backend?.sessionId })
      s.boai.push({ round: index + 1, output, files, checks, runId: run?.id, ...(error || run?.error ? { error: error ?? run?.error } : {}) })
      await d.reviewData('BOAI第' + (index + 1) + '轮', { result: s.boai.at(-1), detail }); await archiveFiles(d, s.cwd, s, 'BOAI第' + (index + 1) + '轮'); await d.reviewCheckpoint('BOAI实际第' + (index + 1) + '轮')
      if (error || run?.status !== 'completed'&&!(s.scenario.id==='inputs'&&index===1&&s.blockingInputs?.length)) break
    }
  } catch (error) { s.error = String(error); await d.reviewData('BOAI路径错误', { error: s.error }) }
})
async function saveSummary(s: State) {
  if (!s.scenario) return
  const passed = (rows: Result[]) => rows.length === s.scenario.prompts.length && rows.every(row => !row.error && row.checks.every(check => check.passed))
  await mkdir(resolve(s.summaryPath, '..'), { recursive: true })
  await writeFile(s.summaryPath, JSON.stringify({ version: PARITY_VERSION, runtime: s.runtime, task: s.scenario.id, source: 'real-local-cli', directSource: s.directSource ?? 'this scenario directly executed native CLI', direct: s.direct, boai: s.boai, blockingInputs:s.blockingInputs??[],nativeInputs:s.nativeInputs??[],blockingInputCoverage:s.scenario.id==='inputs'?nativeInputCoverage(s.nativeInputs??[]):undefined,error: s.error, directPassed: passed(s.direct), boaiPassed: !s.error && passed(s.boai), semanticQuality: 'not-assessed; objective task checks only', humanReview: 'pending', repeats: 1, repeatIndex: test.info().repeatEachIndex, plannedRepeats: Number(process.env.BOAI_PARITY_REPEATS ?? 1), retries: 0 }, null, 2))
}
Then('保存两种入口的实际结果并核对差异', async ({ runtime: d, parityState: s }) => {
  await saveSummary(s)
  await d.reviewData('入口对照结论', { direct: s.direct.map(row => ({ round: row.round, checks: row.checks, error: row.error })), boai: s.boai.map(row => ({ round: row.round, checks: row.checks, error: row.error })), error: s.error })
  expect(s.direct, '直接CLI需保留登记的全部轮次').toHaveLength(s.scenario.prompts.length); expect(s.boai, s.error ?? 'BOAI需保留登记的全部轮次').toHaveLength(s.scenario.prompts.length)
  expect(s.error).toBeUndefined()
  for (const row of [...s.direct, ...s.boai]) { expect(row.error).toBeUndefined(); expect(row.checks.filter(check => !check.passed)).toEqual([]) }
})
After('@native_entry_parity', async ({ runtime: d, parityState: s }) => {
  if (s.chat) {
    s.detail = await request<ConversationDetail>(d, 'getConversation', { id: s.chat.id })
    await d.reviewData('最终BOAI场景快照', s.detail)
    for (const artifact of s.detail.artifacts) await d.reviewFile('正式附件-' + artifact.id, artifact.path, { required: true, expectedSha256: artifact.contentHash })
    for (const run of s.detail.runs) {
      const items = await executionEvidence(d,s.chat.id,run.id)
      await d.reviewData('完整原生执行-' + run.id, items)
      await d.reviewData('完整原生交互-' + run.id, await captureNativeInputs(d, s, run.id))
      if (['running', 'queued', 'waiting_approval'].includes(run.status)) await request(d, 'stopNativeExecution', { conversationId: s.chat.id, runId: run.id })
    }
  }
  await saveSummary(s)
})

async function streamDetail(d: Desktop, s: StreamState) {
  s.detail = await request<ConversationDetail>(d, 'getConversation', { id: s.chat!.id })
  for (const run of s.detail.runs) for (const action of await request<NativeAction[]>(d, 'listNativeActions', { conversationId: s.chat!.id, runId: run.id })) {
    if (action.status !== 'pending' || action.kind !== 'approval') continue
    const value = action.detail as any, input = value.input ?? value
    const allow = action.method === 'Bash' && ['node stream-stability.mjs complete', 'node stream-stability.mjs interrupt'].includes(String(input.command ?? '').trim()) || action.method === 'Read' && typeof input.file_path === 'string' && within(await realpath(s.cwd!), input.file_path)
    await d.reviewData('长命令权限核对-' + action.id, { action, allow })
    await request(d, 'respondNativeAction', { conversationId: s.chat!.id, runId: run.id, actionId: action.id, response: { option: allow ? 'allow' : 'deny' } })
  }
  return s.detail
}
async function streamSend(d: Desktop, s: StreamState, round: number) {
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(s.chat!.title) }).click()
  await new EvaluationBudget(budgetFile(), externalTurnLimit()).reserve('boai-claude-stream-probe')
  await d.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(STREAM_STABILITY.prompts[round - 1])
  await d.page.getByRole('button', { name: '发送消息', exact: true }).click()
  s.rounds++
}
async function streamArchive(d: Desktop, s: StreamState, label: string) {
  const detail = await streamDetail(d, s)
  await d.reviewData(label, detail)
  for (const run of detail.runs) {
    await d.reviewData(label + '-执行-' + run.id, await executionEvidence(d, s.chat!.id, run.id))
    await d.reviewData(label + '-交互-' + run.id, await request(d, 'listNativeActions', { conversationId: s.chat!.id, runId: run.id }))
  }
  for (const file of [STREAM_STABILITY.scriptName, 'complete.jsonl', 'interrupt.jsonl']) {
    try { await readFile(join(s.cwd!, file)) } catch { continue }
    await d.reviewFile(label + '-' + file, join(s.cwd!, file), { required: true })
  }
  await d.reviewCheckpoint(label)
}
Given('登记Claude双向流长命令与停止探针', async ({ runtime: d, streamState: s }) => {
  test.skip(process.env.BOAI_NATIVE_REAL !== '1' || process.env.BOAI_STREAM_STABILITY !== '1', '只在明确登记的真实流稳定性批次执行')
  test.setTimeout(1_200_000)
  test.info().annotations.push({ type: 'model-mode', description: 'real-provider' })
  await d.start()
  const draft = { name: '真实Claude流稳定性', executable: process.env.BOAI_NATIVE_CLAUDE!, args: [], protocol: 'claude-cli', useExistingLogin: true, hostAccessAcknowledged: true }
  await request(d, 'testLaunchProfileDraft', draft)
  const profile = await request<LaunchProfile>(d, 'saveLaunchProfile', draft)
  s.agent = await request<DigitalAgent>(d, 'saveAgent', { name: '流稳定性员工', role: '执行明确的原生命令', instructions: '遵守用户指令，实际等待命令结束；收到停止后不自动继续。', color: '#00AABB', connectionId: '', modelId: 'sonnet', executionBackend: { kind: 'claude-local', profileId: profile.id }, nativeOptions: { claudePermissionMode: 'acceptEdits' }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true })
  s.chat = await request<Conversation>(d, 'createConversation', { kind: 'direct', title: 'Claude流持续执行与停止', agentIds: [s.agent.id] })
  s.cwd = join(d.root, 'v2', 'agents', s.agent.id, 'workspace', 'sessions', s.chat.id, 'work')
  await mkdir(s.cwd, { recursive: true }); await writeFile(join(s.cwd, STREAM_STABILITY.scriptName), STREAM_STABILITY.script, { flag: 'wx' })
  await d.reviewData('长命令预登记', { ...STREAM_STABILITY, profile, agent: s.agent, modelSelection: 'sonnet; actual native model from run', type: 'transport/lifecycle probe, not content quality', maxUserMessages: 3, observationMs: [600000, 180000, 300000], retries: 0 })
})
When('通过BOAI执行长命令并停止下一次命令', async ({ runtime: d, streamState: s }) => {
  await streamSend(d, s, 1)
  await expect.poll(async () => {
    const detail = await streamDetail(d, s)
    return detail.runs.length === 1 && ['completed', 'failed', 'cancelled', 'interrupted'].includes(detail.runs[0].status)
  }, { timeout: 600000, intervals: [1000] }).toBe(true)
  await streamArchive(d, s, '长命令实际结束')
  expect(s.detail!.runs[0].status, s.detail!.runs[0].error).toBe('completed')
  s.completed = await readFile(join(s.cwd!, 'complete.jsonl'), 'utf8')
  const rows = s.completed.trim().split('\n').map(line => JSON.parse(line))
  expect(rows.filter(row => row.kind === 'started')).toHaveLength(1)
  expect(rows.at(-1).kind).toBe('completed'); expect(rows.at(-1).elapsedMs).toBeGreaterThanOrEqual(STREAM_STABILITY.durationMs)
  expect(await readFile(join(s.cwd!, STREAM_STABILITY.scriptName), 'utf8')).toBe(STREAM_STABILITY.script)
  expect(s.detail!.workItems ?? []).toHaveLength(0)
  expect(s.detail!.runs[0].usage).toBeUndefined()
  expect(s.detail!.runs[0].backend?.totalCostUsd).toBeUndefined()
  const evidence = await executionEvidence(d, s.chat!.id, s.detail!.runs[0].id)
  expect(evidence.some((event: any) => event.payload?.item?.name === 'Bash' && event.payload.item.input?.command?.trim() === 'node stream-stability.mjs complete')).toBe(true)
  expect(s.detail!.messages.some(message => message.senderType === 'agent' && message.content.includes('STREAM_COMPLETE'))).toBe(true)
  s.checks.push('actual native command >=310 seconds; immutable script; one completion; no Work')

  await streamSend(d, s, 2)
  let pid = 0
  await expect.poll(async () => {
    await streamDetail(d, s)
    try { const rows = (await readFile(join(s.cwd!, 'interrupt.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)); pid = rows[0].pid; return rows.length >= 3 } catch { return false }
  }, { timeout: 180000, intervals: [500] }).toBe(true)
  expect(s.detail!.runs).toHaveLength(2)
  const active = s.detail!.runs[1]
  expect(['running', 'waiting_approval']).toContain(active.status)
  await streamArchive(d, s, '用户停止前实际命令已写入')
  await request(d, 'stopNativeExecution', { conversationId: s.chat!.id, runId: active.id })
  await expect.poll(async () => { const detail = await streamDetail(d, s); return detail.runs[1].status }, { timeout: 30000, intervals: [250] }).toBe('cancelled')
  await expect.poll(() => { try { process.kill(pid, 0); return true } catch { return false } }, { timeout: 30000, intervals: [250] }).toBe(false)
  s.interrupted = await readFile(join(s.cwd!, 'interrupt.jsonl'), 'utf8')
  expect(s.interrupted.includes('"kind":"completed"')).toBe(false)
  s.checks.push('user stop cancels run and actual command process exits')
  await streamArchive(d, s, '用户停止后实际退出')
})
Then('重启后不重放且明确新消息只读已有日志', async ({ runtime: d, streamState: s }) => {
  const before = s.detail!
  await d.restart()
  const after = await streamDetail(d, s)
  expect(after.runs.map(run => run.id)).toEqual(before.runs.map(run => run.id))
  expect(await readFile(join(s.cwd!, 'complete.jsonl'), 'utf8')).toBe(s.completed)
  expect(await readFile(join(s.cwd!, 'interrupt.jsonl'), 'utf8')).toBe(s.interrupted)
  await d.reviewData('长命令重启零重放', { before, after, hashes: { completed: sha(s.completed!), interrupted: sha(s.interrupted!) } })
  await streamSend(d, s, 3)
  await expect.poll(async () => { const detail = await streamDetail(d, s); return detail.runs.length === 3 && ['completed', 'failed', 'cancelled', 'interrupted'].includes(detail.runs[2].status) }, { timeout: 300000, intervals: [500] }).toBe(true)
  await streamArchive(d, s, '明确新消息只读实际结果')
  const run = s.detail!.runs[2]
  expect(run.status, run.error).toBe('completed')
  expect(s.detail!.messages.some(message => message.runId === run.id && message.senderType === 'agent' && message.content.includes('STREAM_READ_ONLY'))).toBe(true)
  expect(await readFile(join(s.cwd!, 'complete.jsonl'), 'utf8')).toBe(s.completed)
  expect(await readFile(join(s.cwd!, 'interrupt.jsonl'), 'utf8')).toBe(s.interrupted)
  expect(await readFile(join(s.cwd!, STREAM_STABILITY.scriptName), 'utf8')).toBe(STREAM_STABILITY.script)
  const evidence = await executionEvidence(d, s.chat!.id, run.id)
  expect(evidence.filter((event: any) => ['Bash', 'Write', 'Edit', 'NotebookEdit'].includes(event.payload?.item?.name))).toEqual([])
  expect(s.detail!.artifacts).toHaveLength(0); expect(s.detail!.workItems ?? []).toHaveLength(0)
  s.checks.push('restart zero replay; explicit third message read-only; log hashes unchanged')
})
After('@native_stream_stability', async ({ runtime: d, streamState: s }) => {
  if (!s.chat) return
  await streamArchive(d, s, '长命令最终留证')
  for (const run of s.detail!.runs) if (['running', 'queued', 'waiting_approval'].includes(run.status)) await request(d, 'stopNativeExecution', { conversationId: s.chat.id, runId: run.id })
  const summary = { version: STREAM_STABILITY.version, type: 'transport/lifecycle probe', rounds: s.rounds, plannedRounds: 3, checks: s.checks, passed: test.info().errors.length === 0 && s.checks.length === 3, errors: test.info().errors, detail: s.detail, retries: 0 }
  await writeFile(join(process.env.BOAI_PARITY_RESULTS_DIR!, 'claude-stream-probe.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
})

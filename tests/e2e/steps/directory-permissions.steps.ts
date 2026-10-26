/*
 * [OUTPUT]: API目录Card添加/只读/取消/确认移除与重启持久，未运行模型或改动用户业务原件。
 * [OUTPUT]: 本机配置优先：旧API目录保留、原生权限恢复、明确cwd和重启零重放。
 * [INPUT]: 原Desktop/BDD、真实组合审批卡、IPC回执和隔离业务文件。
 * [OUTPUT]: 审批指针事件及原15秒终态失败时的真实状态留证；不重试点击、不放宽断言或期限。
 * [OUTPUT]: 多目录一次批准/整组拒绝、永久仅保存目录、本次授权结束失效与重启零重放的桌面证据。
 * [POS]: 员工目录授权真实界面步骤；协议响应受控，文件及权限不由测试代执行。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, copyFile, chmod, mkdir, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { archiveNativeFinalReview } from '../support/native-final-review'
import type { DigitalAgent } from '../../../packages/shared/src/domain'
import { test as base } from '../support/test'
import { prepareDirectoryPermissions } from '../support/directory-permissions'
import type { Desktop } from '../support/desktop'

type Fixture = Awaited<ReturnType<typeof prepareDirectoryPermissions>>
export const test = base.extend<{ directories: { fixture?: Fixture; native?: { kind: string; agent: DigitalAgent; dataPath: string; source: string; conversationId?: string } } }>({ directories: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const card = (runtime: Desktop) => runtime.page.getByRole('region', { name: '目录同事 的运行命令并授权目录审批', exact: true })
async function send(runtime: Desktop, f: Fixture, requestId: string) {
  await runtime.page.evaluate(({ id, requestId }) => window.boai.request('sendMessage', { conversationId: id, content: '按要求读取报告目录并保存到输出目录', mentionIds: [], requestId }), { id: f.conversation.id, requestId })
  await runtime.page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '目录同事', exact: true }).click()
}
async function idle(runtime: Desktop, f: Fixture, count: number) {
  try {
    await expect.poll(async () => {
      const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), f.conversation.id)
      const runs = detail.runs.filter(run => run.phase === 'execution')
      return runs.length === count && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
    }).toBe(true)
  } catch (error) {
    try {
      const state = await runtime.page.evaluate(async id => ({ detail: await window.boai.request('getConversation', { id }), snapshot: await window.boai.request('snapshot', undefined) }), f.conversation.id)
      await runtime.reviewData('目录原终态等待失败的实际状态', { expectedExecutionRuns: count, ...state, requestCount: f.endpoint.requests.length, protocolErrors: f.errors, rendererErrors: runtime.errors })
    } catch { /* Original assertion remains authoritative even if failure evidence cannot be read. */ }
    throw error
  }
}
async function successfulFiles(runtime: Desktop, f: Fixture) {
  expect(await readFile(f.marker, 'utf8')).toBe('once'); expect(await readFile(f.result, 'utf8')).toBe('DIRECTORY_REPORT_ORIGINAL')
  expect(await readFile(f.original, 'utf8')).toBe('DIRECTORY_REPORT_ORIGINAL')
  await runtime.reviewFile('命令实际次数', f.marker, { required: true }); await runtime.reviewFile('业务原件', f.original, { required: true }); await runtime.reviewFile('命令实际输出', f.result, { required: true })
}
Given('两个待授权业务目录和命令员工已准备好', async ({ runtime, directories }) => {
  test.skip(process.platform !== 'darwin', '当前真实命令目录隔离实现为macOS')
  directories.fixture = await prepareDirectoryPermissions(runtime)
})
Given('已绑定未授权报告目录的数据源员工已准备好', async ({ runtime, directories }) => {
  directories.fixture = await prepareDirectoryPermissions(runtime, true)
})
When('在原目录审批卡允许读取本次数据源', async ({ runtime, directories }) => {
  const f = directories.fixture!
  await send(runtime, f, 'source-directory-approval')
  const approval = runtime.page.getByRole('region', { name: '目录同事 的访问目录审批', exact: true })
  await expect(approval).toBeVisible(); await expect(approval).toContainText(f.reports)
  const before = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), f.conversation.id)
  expect(before.messages.some(message => message.senderType === 'agent' && message.content.includes('DIRECTORY_REPORT_ORIGINAL'))).toBe(false)
  await runtime.reviewNativeCheckpoint('源已绑定但读取正文仍等待目录批准')
  await runtime.page.evaluate(() => {
    const events: unknown[] = []
    Object.assign(globalThis, { __boaiDirectoryApprovalPointers: events })
    for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
      const target = event.target instanceof Element ? event.target : undefined
      const button = target?.closest('button'), bounds = button?.getBoundingClientRect()
      const pointer = event as MouseEvent
      events.push({ type, target: target?.tagName, button: button?.textContent, clientX: pointer.clientX, clientY: pointer.clientY, trusted: event.isTrusted, region: target?.closest('[role="region"]')?.getAttribute('aria-label'), bounds: bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, at: performance.now() })
    }, { capture: true, once: true })
  })
  await approval.getByRole('button', { name: '允许本次运行', exact: true }).click()
  await runtime.reviewData('目录审批真实指针事件', await runtime.page.evaluate(() => (globalThis as unknown as { __boaiDirectoryApprovalPointers: unknown[] }).__boaiDirectoryApprovalPointers))
  await idle(runtime, f, 1)
  await expect(runtime.page.getByText('实际源正文：DIRECTORY_REPORT_ORIGINAL', { exact: true })).toBeVisible()
  await runtime.reviewNativeCheckpoint('目录批准后实际数据源正文返回')
})
Then('原源正文获准返回且重启不保留临时目录许可', async ({ runtime, directories }) => {
  const f = directories.fixture!, requests = f.endpoint.requests.length
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), f.conversation.id)
  await runtime.reviewData('实际Mastra源工具调用与回复', { requests: f.endpoint.requests, detail, errors: f.errors })
  await runtime.reviewFile('数据源输入原件', f.original, { required: true })
  await runtime.restart()
  expect(f.endpoint.requests).toHaveLength(requests)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  expect(await readFile(f.original, 'utf8')).toBe('DIRECTORY_REPORT_ORIGINAL')
  expect(snapshot.approvals).toEqual([]); expect(f.errors).toEqual([]); expect(runtime.errors).toEqual([])
})
When('在工作区卡片添加只读目录并核对取消和确认移除', async ({ runtime, directories }) => {
  const f = directories.fixture!, page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: f.agent.name, exact: true }).click()
  await page.getByRole('button', { name: '高级配置', exact: true }).click()
  await page.getByRole('tab', { name: '工作区', exact: true }).click()
  const card = page.getByRole('region', { name: '授权目录', exact: true })
  await runtime.app.evaluate(({ dialog }, directory) => { const old = dialog.showOpenDialog; dialog.showOpenDialog = (async () => { dialog.showOpenDialog = old; return { canceled: false, filePaths: [directory] } }) as typeof dialog.showOpenDialog }, f.reports)
  await card.getByRole('button', { name: '添加授权目录', exact: true }).click()
  await card.getByRole('combobox', { name: `目录权限 ${f.reports}`, exact: true }).click()
  await page.getByRole('option', { name: '只读', exact: true }).click()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  await runtime.reviewNativeCheckpoint('目录选择与只读设置尚未保存')
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual([...f.agent.directoryGrants!, { path: f.reports, access: 'read-only' }])
  await card.getByRole('button', { name: `移除目录授权 ${f.coding}`, exact: true }).click()
  await page.getByRole('button', { name: '确认移除', exact: true }).click()
  await card.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '退出', exact: true }).click()
  await expect(card.getByRole('combobox', { name: `目录权限 ${f.coding}`, exact: true })).toBeVisible()
  await card.getByRole('button', { name: `移除目录授权 ${f.coding}`, exact: true }).click()
  await runtime.reviewNativeCheckpoint('移除授权确认保留目录与原文件')
  await page.getByRole('button', { name: '确认移除', exact: true }).click()
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual([{ path: f.reports, access: 'read-only' }])
  await runtime.reviewNativeCheckpoint('保存仅保留报告目录只读授权')
  await page.getByRole('button', { name: '关闭高级配置', exact: true }).click()
})
Then('目录配置重启保留且工作区和用户原件没有迁移', async ({ runtime, directories }) => {
  const f = directories.fixture!
  expect(f.endpoint.requests).toHaveLength(0)
  await runtime.restart()
  const saved = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === f.agent.id)!
  expect(saved.directoryGrants).toEqual([{ path: f.reports, access: 'read-only' }])
  expect(saved.workspaceRef).toEqual(f.agent.workspaceRef)
  expect(await realpath(f.coding)).toBe(f.coding)
  expect(await readFile(f.original, 'utf8')).toBe('DIRECTORY_REPORT_ORIGINAL')
  expect(f.endpoint.requests).toHaveLength(0); expect(runtime.errors).toEqual([])
  await runtime.reviewFile('未被移动或改写的业务原件', f.original, { required: true })
  await runtime.reviewData('重启后的授权与独立工作区', { before: f.agent, after: saved, requests: f.endpoint.requests.length, rendererErrors: runtime.errors })
})
When('在同一审批卡批准命令并保留两个目录', async ({ runtime, directories }) => {
  const f = directories.fixture!; await send(runtime, f, 'combined-persistent')
  await expect(card(runtime)).toBeVisible(); await expect(card(runtime)).toContainText(f.reports); await expect(card(runtime)).toContainText(f.output)
  await expect(readFile(f.marker)).rejects.toMatchObject({ code: 'ENOENT' }); await expect(readFile(f.result)).rejects.toMatchObject({ code: 'ENOENT' })
  await runtime.reviewNativeCheckpoint('一张审批卡展示命令和两个目录')
  await card(runtime).getByRole('button', { name: '运行命令并保留目录授权', exact: true }).click()
  await idle(runtime, f, 1); await successfulFiles(runtime, f)
})
Then('重启后仅保留目录且新命令仍需单次批准', async ({ runtime, directories }) => {
  const f = directories.fixture!, requests = f.endpoint.requests.length
  await runtime.restart(); expect(f.endpoint.requests).toHaveLength(requests)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), saved = snapshot.agents.find(agent => agent.id === f.agent.id)!
  expect(saved.directoryGrants).toEqual(expect.arrayContaining(f.directories)); expect(saved.configVersion).toBe(f.agent.configVersion); expect(snapshot.commandPermissions ?? []).toEqual([])
  await send(runtime, f, 'combined-next-command')
  const command = runtime.page.getByRole('region', { name: '目录同事 的运行命令审批', exact: true })
  await expect(command).toBeVisible(); await expect(card(runtime)).toHaveCount(0); await expect(command.getByRole('button', { name: '始终允许此类操作', exact: true })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('已有目录授权但下一命令仍需单次批准')
  await command.getByRole('button', { name: '拒绝', exact: true }).click(); await idle(runtime, f, 2); await successfulFiles(runtime, f)
  await runtime.reviewData('最终权限与协议计数', { agent: saved, requestCount: f.endpoint.requests.length, protocolErrors: f.errors, rendererErrors: runtime.errors })
  expect(f.errors).toEqual([]); expect(runtime.errors).toEqual([])
})
When('拒绝组合审批后发送明确的新请求并允许本次目录访问', async ({ runtime, directories }) => {
  const f = directories.fixture!; await send(runtime, f, 'combined-refused')
  await expect(card(runtime)).toBeVisible(); await runtime.reviewNativeCheckpoint('拒绝组合命令前没有文件副作用')
  await card(runtime).getByRole('button', { name: '拒绝', exact: true }).click(); await idle(runtime, f, 1)
  await expect(readFile(f.marker)).rejects.toMatchObject({ code: 'ENOENT' }); await expect(readFile(f.result)).rejects.toMatchObject({ code: 'ENOENT' })
  await send(runtime, f, 'combined-new-explicit'); await expect(card(runtime)).toBeVisible()
  await card(runtime).getByRole('button', { name: '允许命令及本次目录访问', exact: true }).click(); await idle(runtime, f, 2); await successfulFiles(runtime, f)
})
Then('本次命令只执行一次且重启后再次请求目录', async ({ runtime, directories }) => {
  const f = directories.fixture!, requests = f.endpoint.requests.length
  await runtime.restart(); expect(f.endpoint.requests).toHaveLength(requests)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  await send(runtime, f, 'combined-after-temporary'); await expect(card(runtime)).toBeVisible()
  await runtime.reviewNativeCheckpoint('本次目录授权重启后失效并再次申请')
  await card(runtime).getByRole('button', { name: '拒绝', exact: true }).click(); await idle(runtime, f, 3); await successfulFiles(runtime, f)
  await runtime.reviewData('临时目录与协议计数', { grants: f.agent.directoryGrants, requestCount: f.endpoint.requests.length, protocolErrors: f.errors, rendererErrors: runtime.errors })
  expect(f.errors).toEqual([]); expect(runtime.errors).toEqual([])
})

Given('带有API目录配置的{string}员工已经切换为本机运行', async ({runtime,directories},kind:string)=>{
 const root=await realpath(runtime.root),source=join(root,'coding'),executable=join(root,kind+'.mjs')
 await mkdir(source)
 await copyFile(resolve(kind==='codex'?'tests/fixtures/native-conversation.mjs':'tests/fixtures/native-claude-conversation.mjs'),executable);await chmod(executable,0o700)
 await copyFile(resolve('tests/fixtures/native-business.mjs'),join(root,'native-business.mjs'))
 await runtime.start({dataDir:join(root,'product')})
 const configured=await runtime.page.evaluate(async({kind,source,executable})=>{
  const existing=(await window.boai.request('snapshot',undefined)).agents.find(agent=>agent.id==='researcher')!
  const {configVersion,directoryRevision,workspaceRef,memoryNamespace,policyVersion,...input}=existing
  const api=await window.boai.request('saveAgent',{...input,name:`原生配置${kind}`,expectedConfigVersion:configVersion,expectedDirectoryRevision:directoryRevision,directoryGrants:[{path:source,access:'read-write'}]})
  const draft={name:`本机配置${kind}`,executable,args:[],protocol:kind==='codex'?'codex-app-server' as const:'claude-cli' as const,useExistingLogin:true,hostAccessAcknowledged:true as const}
  await window.boai.request('testLaunchProfileDraft',draft)
  const profile=await window.boai.request('saveLaunchProfile',draft)
  const {configVersion:version,directoryRevision:revision,workspaceRef:w,memoryNamespace:m,policyVersion:p,...definition}=api
  const agent=await window.boai.request('saveAgent',{...definition,connectionId:'',modelId:'',executionBackend:{kind:kind==='codex'?'codex-local':'claude-local',profileId:profile.id},executionPermission:'full-access',expectedConfigVersion:version,expectedDirectoryRevision:revision})
  return {agent,dataPath:(await window.boai.request('snapshot',undefined)).dataPath}
 },{kind,source,executable})
 directories.native={kind,source,...configured}
 await runtime.page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'通讯录',exact:true}).click()
 await runtime.page.getByRole('complementary',{name:'通讯录列表'}).getByRole('button',{name:configured.agent.name,exact:true}).click()
 await runtime.reviewData('本机配置验收准备',{kind,agent:configured.agent,externalRequests:0,protocolFixture:true})
})
When('在员工配置中返回遵循本机配置',async({runtime,directories})=>{
 const page=runtime.page,state=directories.native!
 await page.getByRole('button',{name:'编辑模型与权限',exact:true}).click()
 const section=page.getByRole('region',{name:'模型与权限',exact:true})
 await section.getByRole('combobox',{name:'执行权限',exact:true}).click()
 await page.getByRole('option',{name:'遵循本机配置',exact:true}).click()
 await runtime.reviewNativeCheckpoint('本机权限选择沿用原生配置')
 await section.getByRole('button',{name:'保存',exact:true}).click()
 await expect.poll(async()=>{
  const agent=(await page.evaluate(()=>window.boai.request('snapshot',undefined))).agents.find(agent=>agent.id===state.agent.id)!
  return {inherit:agent.nativeOptions?.useNativePermissions,permission:agent.executionPermission??null}
 }).toEqual({inherit:true,permission:null})
 await page.getByRole('button',{name:'高级配置',exact:true}).click()
 await page.getByRole('tab',{name:'工作区',exact:true}).click()
 const workspace=page.getByRole('tabpanel',{name:'工作区',exact:true})
 await expect(workspace).toContainText('本机 Agent 使用自身的目录、工具和审批配置')
 await expect(workspace.getByRole('button',{name:'添加授权目录',exact:true})).toHaveCount(0)
 await expect(workspace.getByRole('region',{name:'目录访问',exact:true}).getByRole('button')).toHaveCount(0)
 await runtime.reviewNativeCheckpoint('本机工作区保留原生能力说明')
 await page.getByRole('button',{name:'关闭高级配置',exact:true}).click()
})
Then('本机目录说明和原生启动保持且重启不执行旧消息',async({runtime,directories})=>{
 const state=directories.native!,page=runtime.page
 const sent=await page.evaluate(async({employeeId,workingDirectory})=>window.boai.request('sendEmployeeMessage',{employeeId,content:'普通交流',requestId:crypto.randomUUID(),workingDirectory}),{employeeId:state.agent.id,workingDirectory:state.source})
 state.conversationId=sent.conversationId
 await expect.poll(async()=>{
  const detail=await page.evaluate(id=>window.boai.request('getConversation',{id}),sent.conversationId)
  return detail.runs.length>0&&detail.runs.every(run=>run.status==='completed')
 }).toBe(true)
 const before=await page.evaluate(id=>window.boai.request('getConversation',{id}),sent.conversationId)
 expect(before.workItems).toEqual([])
 const calls=(await readFile(join(state.source,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line)),params=calls[0].params
 if(state.kind==='codex'){expect(params.cwd).toBe(state.source);expect(params).not.toHaveProperty('sandbox');expect(params).not.toHaveProperty('approvalPolicy');expect(params).not.toHaveProperty('permissions')}
 else for(const flag of ['--permission-mode','--settings','--setting-sources','--dangerously-skip-permissions'])expect(params.argv).not.toContain(flag)
 await runtime.reviewData('真实stdio启动参数及原生配置',{calls,agent:(await page.evaluate(()=>window.boai.request('snapshot',undefined))).agents.find(agent=>agent.id===state.agent.id),externalRequests:0})
 await runtime.reviewFile('本机原始启动协议',join(state.source,'native-thread-requests.jsonl'),{required:true})
 await runtime.restart()
 const after=await runtime.page.evaluate(id=>window.boai.request('getConversation',{id}),sent.conversationId)
 expect(after.runs).toHaveLength(before.runs.length);expect(after.messages).toHaveLength(before.messages.length)
 expect((await readFile(join(state.source,'native-thread-requests.jsonl'),'utf8')).trim().split('\n')).toHaveLength(1)
 const agent=(await runtime.page.evaluate(()=>window.boai.request('snapshot',undefined))).agents.find(agent=>agent.id===state.agent.id)!
 expect(agent.directoryGrants).toEqual(state.agent.directoryGrants);expect(agent.nativeOptions).toMatchObject({useNativePermissions:true});expect(agent.executionPermission).toBeUndefined()
 expect(runtime.errors).toEqual([])
 await archiveNativeFinalReview(runtime,{label:'原生配置保持',records:async()=>{
  const db=new DatabaseSync(join(state.dataPath,'boai.sqlite'),{readOnly:true})
  try{return {artifacts:[],agents:db.prepare("SELECT value FROM records WHERE collection='agents'").all().map(row=>JSON.parse(String(row.value))),runs:db.prepare("SELECT value FROM records WHERE collection='runs'").all().map(row=>JSON.parse(String(row.value)))}}finally{db.close()}
 }})
})

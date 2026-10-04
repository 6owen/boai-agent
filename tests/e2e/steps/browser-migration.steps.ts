/*
 * [INPUT]: BRM4 中文意图、原生产窗口/工具/授权/SQLite、真实本地网页和离线模型协议。
 * [OUTPUT]: 内置浏览器固定开窗/真实toolbarReady/原生可见与零新工作；普通导航保留原Work/预算并核对新snapshot，X关闭实际退出，无控制权菜单/页面锁；真实非零网页布局、正文媒体/来源/持久登录/审批/清理重启不变量。
 * [OUTPUT]: 统一窗口与登录跨页面、业务清理和任务调用保留，任务审计仅从SQLite读取。
 * [POS]: 浏览器迁移 Electron 步骤；不替代宿主 BrowserPaneFns/CDP 或动作事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Conversation, Message, WorkItem, WorkBudget } from '../../../src/shared/domain'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { BROWSER_BODY_MARKER, BROWSER_PAGE_MARKER, BROWSER_PASSWORD, browserDetail, browserRecords, browserToolbarAction, browserToolbarSurface, browserWindows, nativeBrowserViews, prepareBrowserDesktop, spoofBrowserSender, webpageIsolation } from '../support/browser-migration'

interface State { fixture?: Awaited<ReturnType<typeof prepareBrowserDesktop>>; artifact?: ArtifactVersion; calls?: number; generation?: string; actions?: number; navigationWork?: WorkItem; navigationBudget?: WorkBudget; manualAgentId?: string; originalMessages?: Message[]; attach?: (name:string,body:Buffer,contentType:string)=>Promise<void>; imagePath?:string }
export const test = base.extend<{ browserMigrationState: State }>({ browserMigrationState: async ({ runtime: _runtime }, use, info) => {
  const state: State = { attach: async(name,body,contentType)=>{if(contentType==='image/png'){await mkdir(resolve('.local/browser-debug'),{recursive:true});await writeFile(resolve('.local/browser-debug',`${name}.png`),body)}await info.attach(name,{body,contentType})},imagePath:info.outputPath('native-browser-window.png') }
  try { await use(state) } finally {
    if (state.fixture) {
      const fixture = state.fixture, records = await browserRecords(fixture.dataPath)
      await info.attach('浏览器真实协议与回执', { contentType: 'application/json', body: JSON.stringify({ errors: fixture.errors, hits: fixture.site.hits.map(({path,method,cookie})=>({path,method,cookiePresent:!!cookie})), records, requests: fixture.endpoint.requests.map(request => ({ tools: request.tools, messages: (request.messages as {role:string;content:unknown;tool_calls?:unknown}[]).map(message => ({role:message.role,tool_calls:message.tool_calls,content:typeof message.content==='string'?message.content.slice(-7000):'[native media content]'})) })) }, null, 2) })
    }
  }
} })
const { Given, When, Then } = createBdd(test)
async function settled(runtime: Desktop, conversation: Conversation, users: number) {
  await expect.poll(async () => { const detail = await browserDetail(runtime, conversation.id); return detail.messages.filter(message => message.senderType === 'user').length === users && detail.runs.length >= users && detail.runs.every(run => ['completed','failed','cancelled','interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed','failed','cancelled','interrupted'].includes(turn.status)) }, { timeout: 30_000 }).toBe(true)
  return browserDetail(runtime, conversation.id)
}
async function selectGroup(runtime: Desktop, title: string) {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click()
}
async function ordinaryBrowserSurface(runtime: Desktop, instanceId: string) {
  const surface = await browserToolbarSurface(runtime, instanceId)
  expect(surface.legacyControl).toBe('undefined')
  expect(surface.buttons).toEqual(expect.arrayContaining(['返回', '前进', '刷新', '关闭浏览器']))
  expect(surface.buttons.join(' ')).not.toMatch(/操作权|我来操作|接管|交还|停止当前任务/)
  expect(surface.text).not.toMatch(/操作权|我来操作|交还员工|停止当前任务/)
  const native = (await nativeBrowserViews(runtime)).find(window => window.views.some(view => view.url.includes(`instanceId=${instanceId}`)))!
  expect(native.views).toHaveLength(3)
  expect(native.views.filter(view => view.bounds.width === 0 && view.bounds.height === 0)).toHaveLength(1)
  expect(native.views.filter(view => view.bounds.width > 0 && view.bounds.height > 0)).toHaveLength(2)
}
Given('内置浏览器离线任务与本地网页已准备好', async ({ runtime, browserMigrationState: state }) => { state.fixture = await prepareBrowserDesktop(runtime); expect(state.fixture.agent.allowBrowser).toBe(true) })
When('员工进行普通聊天', async ({ runtime, browserMigrationState: state }) => {
  const fixture = state.fixture!; await fixture.send(fixture.first, 'default-chat', { kind: 'chat', commands: [] }); await settled(runtime, fixture.first, 1)
})
Then('普通聊天没有浏览器工具或动作', async ({ runtime, browserMigrationState: state }) => {
  expect(await browserWindows(runtime)).toEqual([]); expect(await nativeBrowserViews(runtime)).toEqual([]); expect(state.fixture!.site.hits).toEqual([])
  expect((await browserRecords(state.fixture!.dataPath)).actions).toEqual([]); expect(state.fixture!.observedTools.every(call => !call.names.includes('browser_tool'))).toBe(true)
})
When('用户让默认员工核读网页截图和发布成果', async ({ runtime, browserMigrationState: state }) => {
  const fixture = state.fixture!
  await fixture.send(fixture.second, 'second-chat', { kind: 'chat', commands: [] }); await settled(runtime, fixture.second, 1)
  await fixture.send(fixture.first, 'media-artifact', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`, 'snapshot', 'screenshot --png'], artifact: true }); const detail = await settled(runtime, fixture.first, 2)
  state.artifact = detail.artifacts[0] as ArtifactVersion; expect(fixture.errors).toEqual([]); expect(state.artifact,JSON.stringify((await browserRecords(fixture.dataPath)).actions)).toBeDefined()
})
Then('原窗口三视图隔离网页且模型收到真实正文媒体和来源', async ({ runtime, browserMigrationState: state }) => {
  const fixture = state.fixture!, windows = await browserWindows(runtime), native = await nativeBrowserViews(runtime)
  expect(windows).toHaveLength(1); expect(windows[0]).toMatchObject({ control: 'idle', toolbarReady: true, url: `${fixture.site.origin}/landing` })
  expect(native).toHaveLength(1); expect(native[0].title).toBe('内置浏览器'); expect(native[0].views).toHaveLength(3)
  expect(native[0].views.filter(view => view.url.includes('browser-toolbar.html'))).toHaveLength(1); expect(native[0].views.filter(view => view.url.startsWith(fixture.site.origin))).toHaveLength(1)
  expect(native[0].views.every(view => view.preferences.sandbox && view.preferences.contextIsolation && !view.preferences.nodeIntegration)).toBe(true)
  expect(await webpageIsolation(runtime, fixture.site.origin)).toMatchObject({ boai: 'undefined', toolbar: 'undefined', require: 'undefined' })
  await runtime.page.evaluate(input=>window.boai.request('browserControl',input),{action:'show' as const})
  const nativeImage=await runtime.app.evaluate(async({BrowserWindow})=>{const browser=BrowserWindow.getAllWindows().find(window=>window.getBrowserViews().length===3)!;return (await browser.capturePage()).toPNG().toString('base64')})
  if(nativeImage)await state.attach!('原生浏览器三视图',Buffer.from(nativeImage,'base64'),'image/png')
  else if(process.platform==='darwin'){
    const source=await runtime.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.getBrowserViews().length===3)!.getMediaSourceId()),id=source.match(/^window:(\d+):/)?.[1]
    if(!id)throw new Error('实际原生窗口缺少OS截图身份')
    try{await promisify(execFile)('/usr/sbin/screencapture',['-x','-l',id,state.imagePath!]);await state.attach!('原生浏览器三视图',await readFile(state.imagePath!),'image/png')}
    catch(error){await state.attach!('原生窗口截图环境限制',Buffer.from(error instanceof Error?error.message:'原生截图不可用'),'text/plain')}
  }
  await selectGroup(runtime,fixture.first.title);await state.attach!('会话标题浏览器入口',await runtime.page.screenshot(),'image/png')
  const serializedRequests = JSON.stringify(fixture.endpoint.requests)
  expect(serializedRequests).toContain(BROWSER_PAGE_MARKER); expect(serializedRequests).not.toContain(BROWSER_PASSWORD)
  const media = fixture.endpoint.requests.flatMap(request => (request.messages as {content: unknown}[]).flatMap(message => Array.isArray(message.content) ? message.content : [])).find(part => part.type === 'image_url')
  expect(media,JSON.stringify(fixture.endpoint.requests.flatMap(request=>(request.messages as {role:string;content:unknown}[]).map(message=>({role:message.role,parts:Array.isArray(message.content)?message.content.map(part=>({type:part.type,keys:Object.keys(part),mediaType:part.mediaType,mimeType:part.mimeType})):typeof message.content}))))).toBeDefined(); expect(media.image_url.url).toMatch(/^data:image\/png;base64,iVBOR/)
  const records = await browserRecords(fixture.dataPath), actions = records.actions.filter(action => (action.lease as { conversationId: string }).conversationId === fixture.first.id)
  expect(actions).toHaveLength(3); expect(actions.every(action => action.status === 'completed' && !!action.startedAt && !!action.toolCallId)).toBe(true)
  expect(records.evidence).toHaveLength(3); expect(JSON.stringify(records)).not.toContain(BROWSER_PASSWORD); expect(JSON.stringify(records)).not.toContain('iVBOR')
  expect(state.artifact!.browserSources?.some(source => source.url === `${fixture.site.origin}/landing` && !!source.pageVersion && !!source.obtainedAt)).toBe(true)
  expect(records.works).toHaveLength(1);expect(records.works.some(work => work.conversationId === fixture.first.id && work.status === 'delivered')).toBe(true)
  expect(fixture.errors).toEqual([])
})
When('用户检索浏览器成果并重启', async ({ runtime, browserMigrationState: state }) => {
  const page = await runtime.page.evaluate(keyword => window.boai.request('searchConversations', { keyword, scope: 'all' }), BROWSER_BODY_MARKER)
  expect(page.results).toHaveLength(1); expect(page.results[0]).toMatchObject({ id: state.artifact!.id, matchedIn: 'body', target: { kind: 'artifact', contentVersion: 1, contentHash: state.artifact!.contentHash } })
  await runtime.page.getByRole('button',{name:'搜索会话内容',exact:true}).click()
  const dialog=runtime.page.getByRole('dialog',{name:'搜索会话内容',exact:true});await dialog.getByRole('textbox',{name:'搜索关键词',exact:true}).fill(BROWSER_BODY_MARKER)
  await dialog.locator(`[data-search-result-id="${state.artifact!.id}"]`).click()
  await expect(runtime.page.locator(`[data-artifact-id="${state.artifact!.id}"]:visible`).getByRole('region',{name:'成果第 1 版正文',exact:true})).toContainText(BROWSER_BODY_MARKER)
  state.calls = state.fixture!.endpoint.requests.length; state.actions = (await browserRecords(state.fixture!.dataPath)).actions.length; await runtime.restart()
})
Then('成果固定版本仍可检索且没有浏览器或模型重放', async ({ runtime, browserMigrationState: state }) => {
  const page = await runtime.page.evaluate(keyword => window.boai.request('searchConversations', { keyword, scope: 'all' }), BROWSER_BODY_MARKER)
  expect(page.results[0]).toMatchObject({ id: state.artifact!.id, target: { contentVersion: 1, contentHash: state.artifact!.contentHash } }); expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
  expect((await browserRecords(state.fixture!.dataPath)).actions).toHaveLength(state.actions!); expect(await nativeBrowserViews(runtime)).toEqual([]); expect(runtime.errors).toEqual([])
})
When('不同任务依次使用内置浏览器并更新网站登录', async ({ runtime, browserMigrationState: state }) => {
  const f=state.fixture!
  await f.send(f.first,'cookie-alpha',{kind:'task',commands:[`navigate ${f.site.origin}/account?set=alpha`,'snapshot']}); await settled(runtime,f.first,1)
  state.generation=(await browserWindows(runtime))[0].instanceId
  await f.send(f.second,'cookie-shared',{kind:'task',commands:[`navigate ${f.site.origin}/account`,'snapshot']}); const shared=await settled(runtime,f.second,1); expect(shared.messages.at(-1)!.content).toContain('COOKIE_SCOPE:alpha')
  await f.send(f.second,'cookie-beta',{kind:'task',commands:[`navigate ${f.site.origin}/account?set=beta`,'snapshot']}); await settled(runtime,f.second,2)
  await f.send(f.first,'cookie-recheck',{kind:'task',commands:[`navigate ${f.site.origin}/account`,'snapshot']}); const current=await settled(runtime,f.first,2); expect(current.messages.at(-1)!.content).toContain('COOKIE_SCOPE:beta')
})
Then('实际网页始终复用内置浏览器同一窗口和登录', async ({ runtime,browserMigrationState:state })=>{
  const f=state.fixture!,windows=await browserWindows(runtime)
  expect(windows).toHaveLength(1);expect(windows[0].instanceId).toBe(state.generation);expect(await nativeBrowserViews(runtime)).toHaveLength(1)
  for(const property of ['agentId','conversationId','workId','runId','generation'])expect(windows[0]).not.toHaveProperty(property)
  expect(f.site.hits.filter(hit=>hit.path==='/account'&&hit.method==='GET').map(hit=>hit.cookie)).toEqual(['','alpha','alpha','beta'])
  expect(f.errors).toEqual([])
})
When('用户清理聊天删除业务对象后继续使用内置浏览器',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;state.calls=f.endpoint.requests.length
  await runtime.page.evaluate(async({first,second,agent})=>{
    await window.boai.request('clearConversationHistory',{id:first,hide:false})
    await window.boai.request('deleteConversation',{id:second})
    await window.boai.request('deleteAgent',{id:agent})
  },{first:f.first.id,second:f.second.id,agent:f.agent.id})
  expect((await browserWindows(runtime))[0].instanceId).toBe(state.generation)
  expect(await nativeBrowserViews(runtime)).toHaveLength(1)
  await browserToolbarAction(runtime,state.generation!,'navigate',`${f.site.origin}/account`)
  await expect.poll(()=>f.site.hits.filter(hit=>hit.path==='/account').at(-1)?.cookie).toBe('beta')
  await browserToolbarAction(runtime,state.generation!,'close');await runtime.restart()
  await runtime.page.locator('.global-toolbar').getByRole('button',{name:'打开内置浏览器',exact:true}).click()
  await expect.poll(async()=>(await browserWindows(runtime))[0]?.toolbarReady).toBe(true)
  await browserToolbarAction(runtime,(await browserWindows(runtime))[0].instanceId,'navigate',`${f.site.origin}/account`)
})
Then('内置浏览器保留网站登录且不会重新执行任务',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await expect.poll(()=>f.site.hits.filter(hit=>hit.path==='/account').at(-1)?.cookie).toBe('beta')
  expect(f.endpoint.requests).toHaveLength(state.calls!);expect(await nativeBrowserViews(runtime)).toHaveLength(1)
  expect(f.errors).toEqual([]);expect(runtime.errors).toEqual([])
})
When('模型提出批量脚本跨窗口与本机读取命令',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!,commands=[`navigate ${f.site.origin}/landing; click @e1`,'["open","snapshot"]','evaluate "fetch(\'/mutate\')"','focus forged-window','release all','upload @e1 /tmp/private.txt','get-clipboard','navigate file:///etc/hosts']
  for(const [index,command]of commands.entries()){await f.send(f.first,`denied-${index}`,{kind:'task',commands:[command],blocked:true});await settled(runtime,f.first,index+1)}
})
Then('所有命令均被拒绝且没有网页窗口网络或动作副作用',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;expect(f.site.hits).toEqual([]);expect(f.site.mutations()).toBe(0);expect(await nativeBrowserViews(runtime)).toEqual([]);expect((await browserRecords(f.dataPath)).actions).toEqual([]);expect(f.errors).toEqual([])
})
When('正常任务打开网页后网页冒用工具栏和主界面身份',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await f.send(f.second,'valid-sender',{kind:'task',commands:[`navigate ${f.site.origin}/landing`,'snapshot']});await settled(runtime,f.second,1)
  const window=(await browserWindows(runtime))[0],before=JSON.stringify(window),spoof=await spoofBrowserSender(runtime,window.instanceId,f.site.origin)
  expect(spoof.toolbar).toContain('无效的浏览器工具栏来源');expect(spoof.renderer).toContain('不允许的请求来源');expect(JSON.stringify((await browserWindows(runtime))[0])).toBe(before)
})
Then('真实网页无宿主桥且伪造来源不能清理或改变窗口',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;expect(await webpageIsolation(runtime,f.site.origin)).toMatchObject({boai:'undefined',toolbar:'undefined',require:'undefined'});expect(await nativeBrowserViews(runtime)).toHaveLength(1);expect(f.site.mutations()).toBe(0);expect(runtime.errors).toEqual([])
})
When('员工请求提交网页表单且用户批准原页面动作',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await selectGroup(runtime,f.first.title)
  await f.send(f.first,'approved-click',{kind:'task',commands:[`navigate ${f.site.origin}/landing`,'snapshot',history=>{const ref=history.match(/(@e\d+) \[button\] "提交一次"/)?.[1];if(!ref)throw new Error('必须使用真实快照的页面 ref');return `click ${ref}`},'snapshot']})
  await expect.poll(async()=> (await runtime.page.evaluate(()=>window.boai.request('snapshot',undefined))).approvals.length).toBe(1)
  expect(f.site.mutations()).toBe(0);const approval=(await runtime.page.evaluate(()=>window.boai.request('snapshot',undefined))).approvals[0]
  const card=runtime.page.locator(`[data-approval-id="${approval.id}"]:visible`);await expect(card).toContainText('浏览器操作');await expect(card).toContainText('申请操作网页');await expect(card).not.toContainText('主机权限');await expect(card).not.toContainText('工作目录');await expect(card).toContainText(`${f.site.origin}/landing`);await expect(card).toContainText('页面版本');await card.getByRole('button',{name:'允许这次执行',exact:true}).click();await settled(runtime,f.first,1)
})
Then('表单只实际提交一次且审批与工作回执可核对',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!,records=await browserRecords(f.dataPath);expect(f.site.mutations()).toBe(1);expect(records.actions.filter(action=>String(action.command).startsWith('"click" '))).toHaveLength(1);expect(records.actions.every(action=>action.status==='completed')).toBe(true);expect(records.works[0].status).toBe('delivered');expect(records.approvals).toEqual([])
})
When('用户在员工真实页面等待期间直接从工具栏访问新页面',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!
  let navigationReady!:()=>void
  const navigated=new Promise<void>(resolve=>{navigationReady=resolve})
  // Hold only the next offline model command until the real manual navigation exits.
  await f.send(f.first,'manual-navigation',{kind:'task',commands:[`navigate ${f.site.origin}/landing?wait=1`,'wait text WAIT_READY 5000',async()=>{await navigated;return 'snapshot'}]})
  await expect.poll(async()=> (await browserRecords(f.dataPath)).actions.some(action=>action.command==='"wait" "text" "WAIT_READY" "5000"'&&action.status==='started')).toBe(true)
  const window=(await browserWindows(runtime))[0],records=await browserRecords(f.dataPath)
  const currentAction=records.actions.find(action=>action.command==='"wait" "text" "WAIT_READY" "5000"'&&action.status==='started')!,lease=currentAction.lease as {generation:string;workId:string};state.generation=lease.generation;state.navigationWork=records.works.find(work=>work.id===lease.workId)!;state.navigationBudget=records.budgets.find(budget=>budget.id===state.navigationWork!.budgetId)!
  expect(state.navigationWork).toBeDefined();expect(state.navigationBudget).toBeDefined()
  try { await browserToolbarAction(runtime,window.instanceId,'navigate',`${f.site.origin}/manual-review`) }
  finally { navigationReady() }
})
Then('没有控制权菜单或页面锁且原任务沿原预算核读新页面',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!,completed=await settled(runtime,f.first,2),browser=(await browserWindows(runtime))[0],records=await browserRecords(f.dataPath)
  expect(browser).toMatchObject({url:`${f.site.origin}/manual-review`,control:'idle'})
  await ordinaryBrowserSurface(runtime,browser.instanceId)
  expect(completed.runs.some(run=>run.workId===state.navigationWork!.id&&run.status==='completed')).toBe(true)
  expect(records.works).toHaveLength(2);expect(records.works.find(work=>work.id===state.navigationWork!.id)).toMatchObject({budgetId:state.navigationBudget!.id,status:'delivered'})
  expect(records.budgets).toHaveLength(2)
  const budget=records.budgets.find(value=>value.id===state.navigationBudget!.id)!
  for(const key of ['deadlineAt','maxModelCalls','maxRuns','maxOutputTokens','maxWorkItems','maxRetries','maxReportRefreshes','maxNoProgress'] as const)expect(budget[key]).toBe(state.navigationBudget![key])
  expect(budget.modelCalls).toBeGreaterThanOrEqual(state.navigationBudget!.modelCalls);expect(budget.runs).toBe(state.navigationBudget!.runs)
  const actions=records.actions.filter(action=>(action.lease as {workId?:string})?.workId===state.navigationWork!.id),waits=actions.filter(action=>action.command==='"wait" "text" "WAIT_READY" "5000"')
  expect(actions).toHaveLength(3);expect(actions.every(action=>action.status==='completed')).toBe(true);expect(waits).toHaveLength(1)
  const snapshot=actions.find(action=>action.command==='"snapshot"')!
  expect(snapshot.reply).toMatchObject({source:{scopeKey:browser.scopeKey,generation:state.generation,url:`${f.site.origin}/manual-review`,pageVersion:browser.pageVersion}})
  expect(JSON.stringify(snapshot.reply)).toContain(BROWSER_PAGE_MARKER)
  expect(records.evidence.find(evidence=>evidence.id===snapshot.id)).toMatchObject({url:`${f.site.origin}/manual-review`,pageVersion:browser.pageVersion})
  expect(f.site.hits.filter(hit=>hit.path==='/landing'&&hit.method==='GET')).toHaveLength(2);expect(f.site.hits.filter(hit=>hit.path==='/manual-review'&&hit.method==='GET')).toHaveLength(1)
  expect(f.endpoint.requests.some(request=>JSON.stringify(request.messages).includes(`${f.site.origin}/manual-review`))).toBe(true)
  expect(f.endpoint.requests.some(request=>JSON.stringify(request.messages).includes('用户交还浏览器后的新页面快照'))).toBe(false);expect(f.site.mutations()).toBe(1)
})
When('用户发起新浏览任务后点击工具栏X并清空会话重启',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await f.send(f.first,'new-lease',{kind:'task',commands:[`navigate ${f.site.origin}/landing?wait=1`,'wait text WAIT_READY 5000','snapshot']})
  await expect.poll(async()=> (await browserRecords(f.dataPath)).actions.filter(action=>action.command==='"wait" "text" "WAIT_READY" "5000"'&&action.status==='started').length).toBe(1)
  const browser=(await browserWindows(runtime))[0],current=(await browserRecords(f.dataPath)).actions.find(action=>action.command==='"wait" "text" "WAIT_READY" "5000"'&&action.status==='started')!;expect((current.lease as {generation:string}).generation).not.toBe(state.generation)
  await browserToolbarAction(runtime,browser.instanceId,'close')
  await expect.poll(async()=> (await browserWindows(runtime))[0]?.control).toBe('closed')
  expect(await nativeBrowserViews(runtime)).toEqual([]);await settled(runtime,f.first,3)
  await runtime.page.evaluate(id=>window.boai.request('clearConversationHistory',{id,hide:false}),f.first.id);state.calls=f.endpoint.requests.length;await runtime.restart()
})
Then('新任务使用新调用代际且重启不自动重开窗口或重放业务',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!,records=await browserRecords(f.dataPath);expect(await nativeBrowserViews(runtime)).toEqual([]);expect(records.scopes).toEqual([]);expect(records.actions.every(action=>!action.command&&!action.reply)).toBe(true);expect(records.works).toEqual([]);expect(f.endpoint.requests).toHaveLength(state.calls!);expect(f.errors).toEqual([]);expect(runtime.errors).toEqual([])
})
When('用户逐次批准真实导航和网页下载',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await f.send(f.first,'download',{kind:'task',artifact:true,download:true,commands:[`navigate ${f.site.origin}/landing`,`navigate ${f.site.origin}/second`,'back','forward','reload','snapshot',history=>{const refs=[...history.matchAll(/(@e\d+) \[link\] "下载文本"/g)];if(!refs.length)throw new Error('下载必须使用当前页面实际ref');return `click ${refs.at(-1)![1]}`},'downloads wait 3000']})
  let approvals=0
  await expect.poll(async()=>{
    const snapshot=await runtime.page.evaluate(()=>window.boai.request('snapshot',undefined))
    for(const approval of snapshot.approvals){expect(approval.kind).toBe('browser');expect(approval.command).toContain(f.site.origin);await runtime.page.evaluate(id=>window.boai.request('approve',{id,approved:true}),approval.id);approvals++}
    const detail=await browserDetail(runtime,f.first.id);return detail.artifacts.length===1&&detail.runs.every(run=>run.status==='completed')&&detail.turns!.every(turn=>turn.status==='completed')
  },{timeout:30_000,intervals:[100]}).toBe(true)
  expect(approvals).toBe(4);state.artifact=(await browserDetail(runtime,f.first.id)).artifacts[0] as ArtifactVersion
})
Then('返回前进刷新已实际执行且下载原件发布后可按确切正文检索',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!,records=await browserRecords(f.dataPath),artifact=state.artifact!,bytes=await readFile(artifact.path)
  expect(f.site.hits.filter(hit=>hit.path==='/download.txt')).toHaveLength(1);expect(bytes.toString('utf8')).toBe('BRM_DOWNLOAD_TEXT 真正下载的公开内容');expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.contentHash)
  for(const command of ['"back"','"forward"','"reload"'])expect(records.actions.some(action=>action.command===command&&action.status==='completed')).toBe(true)
  expect(records.actions).toHaveLength(8);expect(records.actions.every(action=>action.status==='completed')).toBe(true)
  const page=await runtime.page.evaluate(keyword=>window.boai.request('searchConversations',{keyword,scope:'all'}),'BRM_DOWNLOAD_TEXT')
  expect(page.results).toHaveLength(1);expect(page.results[0]).toMatchObject({id:artifact.id,matchedIn:'body',target:{kind:'artifact',contentVersion:1,contentHash:artifact.contentHash}})
  expect(artifact.browserSources?.some(source=>source.url===`${f.site.origin}/second`)).toBe(true);expect(f.errors).toEqual([]);expect(runtime.errors).toEqual([])
})

async function openBuiltInBrowser(runtime: Desktop) {
  await runtime.page.locator('.global-toolbar').getByRole('button', { name: '打开内置浏览器', exact: true }).click()
  await expect.poll(async () => (await browserWindows(runtime))[0]?.toolbarReady).toBe(true)
  await expect(runtime.page.getByRole('dialog')).toHaveCount(0)
  await expect(runtime.page.getByRole('button',{name:'浏览器登录资料',exact:true})).toHaveCount(0)
}
When('用户从顶部打开内置浏览器', async ({ runtime }) => { await openBuiltInBrowser(runtime) })
Then('内置浏览器只打开固定窗口且没有模型工作消息或工具动作', async ({ runtime, browserMigrationState: state }) => {
  const f = state.fixture!, windows = await browserWindows(runtime), records = await browserRecords(f.dataPath)
  expect(windows).toHaveLength(1); expect(windows[0]).toMatchObject({ control: 'user-controlled', isVisible: true })
  for(const property of ['agentId','conversationId','workId','runId','generation'])expect(windows[0]).not.toHaveProperty(property)
  await ordinaryBrowserSurface(runtime,windows[0].instanceId)
  expect(await nativeBrowserViews(runtime)).toHaveLength(1); expect(records.works).toEqual([]); expect(records.budgets).toEqual([]); expect(records.messages).toEqual([]); expect(records.actions).toEqual([])
  expect(records.scopes).toEqual([]);expect(f.endpoint.requests).toEqual([]); expect(f.site.hits).toEqual([])
  state.generation = windows[0].instanceId
})
When('用户在原空白窗口访问网页并从顶部再次查看', async ({ runtime, browserMigrationState: state }) => {
  const f = state.fixture!, instanceId = state.generation!
  await browserToolbarAction(runtime,instanceId,'navigate',`${f.site.origin}/landing`)
  await expect.poll(async () => (await browserWindows(runtime))[0]?.url).toBe(`${f.site.origin}/landing`)
  await runtime.page.evaluate(() => window.boai.request('browserControl', { action: 'hide' }))
  await openBuiltInBrowser(runtime)
})
Then('切换主页面仍直接复用内置浏览器同一窗口', async ({ runtime, browserMigrationState: state }) => {
  const f = state.fixture!, windows = await browserWindows(runtime)
  expect(windows).toHaveLength(1); expect(windows[0]).toMatchObject({ instanceId: state.generation!, control: 'user-controlled', url: `${f.site.origin}/landing`, isVisible: true })
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await openBuiltInBrowser(runtime)
  expect((await browserWindows(runtime))[0].instanceId).toBe(state.generation);expect(await nativeBrowserViews(runtime)).toHaveLength(1)
  expect((await browserRecords(f.dataPath)).works).toEqual([]); expect(f.endpoint.requests).toEqual([]); expect(f.site.hits.filter(hit => hit.path === '/landing')).toHaveLength(1); expect(runtime.errors).toEqual([])
})
When('用户发起明确网页任务', async ({ runtime, browserMigrationState: state }) => {
  const f = state.fixture!; await selectGroup(runtime, f.first.title)
  await f.send(f.first, 'manual-adopt', { kind: 'task', commands: ['snapshot'] }); await settled(runtime, f.first, 1)
})
Then('工具按原任务授权核读当前页面且未重放人工操作', async ({ runtime, browserMigrationState: state }) => {
  const f = state.fixture!, windows = await browserWindows(runtime), records = await browserRecords(f.dataPath), detail = await browserDetail(runtime, f.first.id)
  expect(windows).toHaveLength(1); expect(windows[0]).toMatchObject({ instanceId: state.generation!, url: `${f.site.origin}/landing` })
  expect(records.works).toHaveLength(1); expect(records.works[0].status).toBe('delivered'); expect(records.actions).toHaveLength(1); expect(records.actions[0]).toMatchObject({ command: '"snapshot"', status: 'completed' })
  expect(JSON.stringify(records.actions[0].reply)).toContain(BROWSER_PAGE_MARKER); expect(detail.messages.at(-1)!.content).toContain('真实网页已核读。COOKIE_SCOPE:none'); expect(f.site.hits.filter(hit => hit.path === '/landing')).toHaveLength(1); expect(f.errors).toEqual([]); expect(runtime.errors).toEqual([])
})

/*
 * [INPUT]: BRM4 中文意图、原生产窗口/工具/授权/SQLite、真实本地网页和离线模型协议。
 * [OUTPUT]: 能力入口、页面正文与真媒体、明确来源成果/R1、Cookie 作用域、禁用首动作、来源冒认与批准/接管退出/新代际/清理重启的不变量。
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
import type { Conversation } from '../../../src/shared/domain'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { BROWSER_BODY_MARKER, BROWSER_PAGE_MARKER, BROWSER_PASSWORD, browserDetail, browserRecords, browserToolbarControl, browserWindows, nativeBrowserViews, prepareBrowserDesktop, spoofBrowserSender, webpageIsolation } from '../support/browser-migration'

interface State { fixture?: Awaited<ReturnType<typeof prepareBrowserDesktop>>; artifact?: ArtifactVersion; calls?: number; generation?: string; actions?: number; attach?: (name:string,body:Buffer,contentType:string)=>Promise<void>; imagePath?:string }
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
async function saveBrowserCapability(runtime: Desktop, agentId: string) {
  return runtime.page.evaluate(async agentId => { const snapshot = await window.boai.request('snapshot', undefined), original = snapshot.agents.find(agent => agent.id === agentId)!, { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = original; return window.boai.request('saveAgent', { ...input, allowBrowser: true, expectedConfigVersion: configVersion }) }, agentId)
}
Given('一个员工尚未启用浏览器且有两个独立会话', async ({ runtime, browserMigrationState: state }) => { state.fixture = await prepareBrowserDesktop(runtime); expect(state.fixture.agent.allowBrowser).toBe(false) })
Given('一个已启用浏览器的员工有两个独立会话', async ({ runtime, browserMigrationState: state }) => { state.fixture = await prepareBrowserDesktop(runtime, { enable: true }); expect(state.fixture.agent.allowBrowser).toBe(true) })
When('员工分别进行普通聊天和未授权浏览任务', async ({ runtime, browserMigrationState: state }) => {
  const fixture = state.fixture!; await fixture.send(fixture.first, 'off-chat', { kind: 'chat', commands: [] }); await settled(runtime, fixture.first, 1)
  await fixture.send(fixture.first, 'off-task', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`] }); await settled(runtime, fixture.first, 2)
})
Then('普通聊天和未授权任务均没有浏览器动作', async ({ runtime, browserMigrationState: state }) => {
  expect(await browserWindows(runtime, state.fixture!.first.id)).toEqual([]); expect(await nativeBrowserViews(runtime)).toEqual([]); expect(state.fixture!.site.hits).toEqual([])
  expect((await browserRecords(state.fixture!.dataPath)).actions).toEqual([]); expect(state.fixture!.observedTools.every(call => !call.names.includes('browser_tool'))).toBe(true)
})
When('用户明确启用员工浏览器并让任务核读网页截图和发布成果', async ({ runtime, browserMigrationState: state }) => {
  const fixture = state.fixture!; await saveBrowserCapability(runtime, fixture.agent.id)
  await fixture.send(fixture.second, 'enabled-chat', { kind: 'chat', commands: [] }); await settled(runtime, fixture.second, 1)
  await fixture.send(fixture.first, 'media-artifact', { kind: 'task', commands: [`navigate ${fixture.site.origin}/landing`, 'snapshot', 'screenshot --png'], artifact: true }); const detail = await settled(runtime, fixture.first, 3)
  state.artifact = detail.artifacts[0] as ArtifactVersion; expect(fixture.errors).toEqual([]); expect(state.artifact,JSON.stringify((await browserRecords(fixture.dataPath)).actions)).toBeDefined()
})
Then('原窗口三视图隔离网页且模型收到真实正文媒体和来源', async ({ runtime, browserMigrationState: state }) => {
  const fixture = state.fixture!, windows = await browserWindows(runtime, fixture.first.id), native = await nativeBrowserViews(runtime)
  expect(windows).toHaveLength(1); expect(windows[0]).toMatchObject({ agentId: fixture.agent.id, conversationId: fixture.first.id, control: 'idle', toolbarReady: true, url: `${fixture.site.origin}/landing` })
  expect(native).toHaveLength(1); expect(native[0].title).toContain(`${fixture.agent.name} · ${fixture.first.title}`); expect(native[0].views).toHaveLength(3)
  expect(native[0].views.filter(view => view.url.includes('browser-toolbar.html'))).toHaveLength(1); expect(native[0].views.filter(view => view.url.startsWith(fixture.site.origin))).toHaveLength(1)
  expect(native[0].views.every(view => view.preferences.sandbox && view.preferences.contextIsolation && !view.preferences.nodeIntegration)).toBe(true)
  expect(await webpageIsolation(runtime, fixture.site.origin)).toMatchObject({ boai: 'undefined', toolbar: 'undefined', require: 'undefined' })
  await runtime.page.evaluate(input=>window.boai.request('browserControl',input),{agentId:fixture.agent.id,conversationId:fixture.first.id,action:'show' as const})
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
  expect(records.works).toHaveLength(2);expect(records.works.some(work => work.conversationId === fixture.first.id && work.status === 'delivered')).toBe(true)
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
When('员工在两会话分别建立甲乙登录资料并再次读取甲会话', async ({ runtime, browserMigrationState: state }) => {
  const f=state.fixture!
  await f.send(f.first,'cookie-alpha',{kind:'task',commands:[`navigate ${f.site.origin}/account?set=alpha`,'snapshot']}); await settled(runtime,f.first,1)
  await f.send(f.second,'cookie-empty',{kind:'task',commands:[`navigate ${f.site.origin}/account`,'snapshot']}); const empty=await settled(runtime,f.second,1); expect(empty.messages.at(-1)!.content).toContain('COOKIE_SCOPE:none')
  await f.send(f.second,'cookie-beta',{kind:'task',commands:[`navigate ${f.site.origin}/account?set=beta`,'snapshot']}); await settled(runtime,f.second,2)
  await f.send(f.first,'cookie-recheck',{kind:'task',commands:[`navigate ${f.site.origin}/account`,'snapshot']}); const alpha=await settled(runtime,f.first,2); expect(alpha.messages.at(-1)!.content).toContain('COOKIE_SCOPE:alpha')
})
Then('两个浏览器窗口与实际网络 Cookie 始终按会话隔离', async ({ runtime,browserMigrationState:state })=>{
  const f=state.fixture!,a=(await browserWindows(runtime,f.first.id))[0],b=(await browserWindows(runtime,f.second.id))[0]
  expect(a.scopeKey).not.toBe(b.scopeKey);expect(a.instanceId).not.toBe(b.instanceId);expect(await nativeBrowserViews(runtime)).toHaveLength(2)
  expect(f.site.hits.filter(hit=>hit.path==='/account'&&hit.method==='GET').map(hit=>hit.cookie)).toEqual(['','','','alpha'])
  expect(f.errors).toEqual([])
})
When('用户清除甲会话登录资料后让两个会话再次读取',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await runtime.page.evaluate(input=>window.boai.request('browserControl',input),{agentId:f.agent.id,conversationId:f.first.id,action:'clear' as const})
  await f.send(f.first,'cookie-cleared',{kind:'task',commands:[`navigate ${f.site.origin}/account`,'snapshot']});await settled(runtime,f.first,3)
  await f.send(f.second,'cookie-kept',{kind:'task',commands:[`navigate ${f.site.origin}/account`,'snapshot']});await settled(runtime,f.second,3)
})
Then('甲会话重新打开为空登录且乙会话仍保留原登录',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;expect((await browserDetail(runtime,f.first.id)).messages.at(-1)!.content).toContain('COOKIE_SCOPE:none');expect((await browserDetail(runtime,f.second.id)).messages.at(-1)!.content).toContain('COOKIE_SCOPE:beta')
  expect(f.site.hits.filter(hit=>hit.path==='/account'&&hit.method==='GET').slice(-2).map(hit=>hit.cookie)).toEqual(['','beta']);expect(f.errors).toEqual([]);expect(runtime.errors).toEqual([])
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
  const window=(await browserWindows(runtime,f.second.id))[0],before=JSON.stringify(window),spoof=await spoofBrowserSender(runtime,window.instanceId,f.site.origin)
  expect(spoof.toolbar).toContain('无效的浏览器工具栏来源');expect(spoof.renderer).toContain('不允许的请求来源');expect(JSON.stringify((await browserWindows(runtime,f.second.id))[0])).toBe(before)
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
When('用户在员工真实页面等待期间从工具栏接管',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await f.send(f.first,'take-wait',{kind:'task',commands:[`navigate ${f.site.origin}/landing?wait=1`,'wait text WAIT_READY 5000','snapshot']})
  await expect.poll(async()=> (await browserRecords(f.dataPath)).actions.some(action=>action.command==='"wait" "text" "WAIT_READY" "5000"'&&action.status==='started')).toBe(true)
  const window=(await browserWindows(runtime,f.first.id))[0];state.generation=window.generation;await browserToolbarControl(runtime,window.instanceId,'take');state.calls=f.endpoint.requests.length
})
Then('原任务实际动作退出且保留人工控制直到明确交还',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!,browser=(await browserWindows(runtime,f.first.id))[0];expect(browser.control).toBe('user-controlled')
  const detail=await browserDetail(runtime,f.first.id),original=detail.runs.at(-1)!;expect(['completed','cancelled','failed','interrupted']).not.toContain(original.status);expect(f.endpoint.requests).toHaveLength(state.calls!)
  await runtime.page.evaluate(input=>window.boai.request('browserControl',input),{agentId:f.agent.id,conversationId:f.first.id,action:'resume' as const})
  const completed=await settled(runtime,f.first,2);expect(completed.runs.some(run=>run.id===original.id&&run.status==='completed')).toBe(true)
  expect((await browserWindows(runtime,f.first.id))[0].generation).not.toBe(state.generation)
  const records=await browserRecords(f.dataPath),waits=records.actions.filter(action=>action.command==='"wait" "text" "WAIT_READY" "5000"');expect(waits).toHaveLength(1);expect(waits[0].status).toBe('completed');expect(f.site.hits.filter(hit=>hit.path==='/landing'&&hit.method==='GET')).toHaveLength(2)
  expect(f.endpoint.requests.some(request=>JSON.stringify(request.messages).includes('用户交还浏览器后的新页面快照'))).toBe(true);expect(f.site.mutations()).toBe(1)
})
When('用户发起新浏览任务后关闭浏览器并清空会话重启',async({runtime,browserMigrationState:state})=>{
  const f=state.fixture!;await f.send(f.first,'new-lease',{kind:'task',commands:[`navigate ${f.site.origin}/landing`,'snapshot']});await settled(runtime,f.first,3)
  expect((await browserWindows(runtime,f.first.id))[0].generation).not.toBe(state.generation)
  await runtime.page.evaluate(input=>window.boai.request('browserControl',input),{agentId:f.agent.id,conversationId:f.first.id,action:'close' as const});expect(await nativeBrowserViews(runtime)).toEqual([])
  await runtime.page.evaluate(id=>window.boai.request('clearConversationHistory',{id,hide:false}),f.first.id);state.calls=f.endpoint.requests.length;await runtime.restart()
})
Then('新任务使用新代际且清理后无登录窗口或业务重放',async({runtime,browserMigrationState:state})=>{
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

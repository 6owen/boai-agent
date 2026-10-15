/*
 * [OUTPUT]: 同消息/run只读升级Work保留原页面refs，不允许另一run继承。
 * [OUTPUT]: 固定实例/原页面引用、同URL重开失效与只读租约不换页面；密码提示不恢复隐形接管状态。
 * [INPUT]: BrowserService 与私有租约/动作、实际文件、可控制退出的驱动 fixture。
 * [OUTPUT]: 内置浏览器固定窗口/登录、任务独占真实退出与无公开业务归属、离开人工网站只核对目标授权而读取仍拒绝、单scope/审批/unknown不重放；普通release只聚焦且原租约/source继续可核对，旧显式交接仅兼容；真实退出/正文密码AX边界。
 * [POS]: BRM1/BRM3 宿主模块验收；不替代真实 Electron profile/UI 证据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { BrowserService } from '../src/main/browser/browser-service'
import { BrowserPaneManager } from '../src/main/browser/browser-pane-manager'
import { parseBrowserSingleCommand } from '../src/runtime/adapters/mastra/browser-tool-runtime'
import { APPLICATION_BROWSER_SCOPE } from '../src/shared/ipc/browser'
import type { BrowserLease, BrowserActionEnvelope } from '../src/shared/ipc/browser'
import { BrowserCDP } from '../src/main/browser/browser-cdp'
import type { WebContents } from 'electron'

const roots: string[] = []
const cdps: BrowserCDP[] = []
afterEach(async () => { cdps.splice(0).forEach(cdp=>cdp.detach()); await Promise.all(roots.splice(0).map(root => rm(root, {recursive:true,force:true}))) })
function deferred<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve} }
function driver() {
 const instances=new Map<string,any>(), pages=new Map<string,any>()
 const manager:any={
  onStateChange:vi.fn(),onRemoved:vi.fn(),registerToolbarIpc:vi.fn(),
  createInstance:vi.fn((id:string,options:any)=>{if(instances.has(id))return id;const page={url:'about:blank',title:'Test',html:'<main>fixture</main>',forms:[]};pages.set(id,page);instances.set(id,{id,currentUrl:page.url,title:page.title,toolbarReady:true,toolbarError:null,canGoBack:false,canGoForward:false,themeColor:null,partition:options.partition,downloadDirectory:options.downloadDirectory,window:{isDestroyed:()=>false,setTitle:vi.fn()},toolbarView:{webContents:{isDestroyed:()=>false,send:vi.fn()}},pageView:{webContents:{executeJavaScript:vi.fn(async()=>page)}},cdp:{invalidateRefs:vi.fn(),drain:vi.fn(async()=>{})}});return id}),
  getInstance:vi.fn((id:string)=>instances.get(id)),ready:vi.fn(async()=>{}),
  getAccessibilitySnapshot:vi.fn(async(id:string)=>({url:pages.get(id).url,title:'Test',nodes:[{ref:'@e1',role:'button',name:'Save'}]})),
  navigate:vi.fn(async(id:string,url:string)=>{const page=pages.get(id);page.url=url;page.html='<main>actual-page</main>';const instance=instances.get(id);instance.currentUrl=url;return {url,title:page.title}}),
  listInstances:vi.fn(()=>[...instances.values()].map(instance=>({id:instance.id,url:instance.currentUrl,title:instance.title,isVisible:true,ownerType:'session',ownerSessionId:'scope',boundSessionId:'scope',agentControlActive:false}))),
  detectSecurityChallenge:vi.fn(async()=>({detected:false,provider:'none',signals:[]})),
  evaluate:vi.fn(async(id:string)=>({url:pages.get(id).url,title:'Test',viewportWidth:1000,viewportHeight:800,documentWidth:1000,documentHeight:800,scrollX:0,scrollY:0,maxScrollX:0,maxScrollY:0})),
  clickElement:vi.fn(async()=>{}),fillElement:vi.fn(async()=>{}),focus:vi.fn(),hide:vi.fn(),stop:vi.fn(),
  cancelDownloads:vi.fn(async()=>{}),waitForLoads:vi.fn(async()=>{}),getDownloads:vi.fn(async()=>[]),getNetworkLogs:vi.fn(()=>[]),
  destroyInstance:vi.fn(async(id:string)=>{instances.delete(id);pages.delete(id)}),destroyAll:vi.fn(async()=>{instances.clear();pages.clear()}),
  screenshot:vi.fn(async()=>({imageBuffer:Buffer.from('png-real-fixture-bytes'),imageFormat:'png'})),
 }
 return {manager:manager as BrowserPaneManager,mocks:manager,instances,pages}
}
async function fixture() {
 const root=await mkdtemp(join(tmpdir(),'boai-browser-host-'));roots.push(root);await mkdir(join(root,'managed'),{recursive:true})
 const fake=driver(), clearPartition=vi.fn(async()=>{})
 const options={rendererDirectory:join(root,'renderer'),preloadPath:join(root,'toolbar.cjs'),profileRegistryPath:join(root,'profiles.json'),managedDataDirectory:join(root,'managed'),manager:fake.manager,clearPartition}
 const service=new BrowserService(options)
 const lease:BrowserLease={scopeKey:APPLICATION_BROWSER_SCOPE,scopeEpoch:0,agentId:'a',conversationId:'chat',workId:'work',runId:'run',generation:'g1',configVersion:1,agentName:'Alice',conversationTitle:'Chat',downloadDirectory:join(root,'managed','run')}
 return {root,service,lease,options,fake,clearPartition}
}
let actionSequence=0
describe('实际窗口验证检测',()=>{
 it.each([
  {name:'只有一个链接的普通文章',nodes:[{role:'link'},...Array.from({length:499},()=>({role:'StaticText'}))],dom:[],title:'Example Domain',detected:false,provider:'none'},
  {name:'导航暂态空AX',nodes:[],dom:[],title:'Loading article',detected:false,provider:'none'},
  {name:'实际验证表单仍需本人人工完成',nodes:[{role:'button'}],dom:['dom:challenge-form'],title:'Just a moment...',detected:true,provider:'cloudflare'},
 ])('$name',async ({nodes,dom,title,detected,provider})=>{
  const instance={window:{isDestroyed:()=>false},title,currentUrl:'https://example.com/',pageView:{webContents:{executeJavaScript:async()=>dom}},cdp:{getAccessibilitySnapshot:async()=>({nodes})}}
  const manager={instances:new Map([['real-detection',instance]])} as unknown as BrowserPaneManager
  const result=await BrowserPaneManager.prototype.detectSecurityChallenge.call(manager,'real-detection')
  expect(result.detected).toBe(detected);expect(result.provider).toBe(provider)
  if(detected)expect(result.signals).toContain('dom:challenge-form')
 })
})
async function envelope(service:BrowserService,lease:BrowserLease,command:string,approve=true):Promise<BrowserActionEnvelope>{
 const page=await service.inspect(lease),argumentHash=createHash('sha256').update(JSON.stringify(parseBrowserSingleCommand(command).parts)).digest('hex')
 return {lease,actionId:`action-${++actionSequence}`,toolCallId:`tool-${actionSequence}`,command,argumentHash,approvedOrigins:['https://example.com'],expectedPageVersion:page?.pageVersion,...(approve&&page?{approval:{url:page.url,pageVersion:page.pageVersion,commandHash:argumentHash}}:{})}
}
describe('BrowserService 内置浏览器与独立调用权限',()=>{
 it('内置浏览器使用固定身份，不制造运行或下载目录；重复点击复用原窗口',async()=>{
  const {service,lease,fake}=await fixture()
  const first=await service.manualOpen({}),second=await service.manualOpen({})
  expect(first.control).toBe('user-controlled');expect(first.url).toBe('about:blank')
  expect(first).not.toHaveProperty('agentId');expect(first).not.toHaveProperty('conversationId');expect(first).not.toHaveProperty('workId');expect(first).not.toHaveProperty('runId');expect(service.currentLease()).toBeNull()
  expect(second.instanceId).toBe(first.instanceId);expect(fake.mocks.createInstance).toHaveBeenCalledTimes(1)
  expect(fake.mocks.createInstance.mock.calls[0][1].downloadDirectory).toBeUndefined()
  expect(fake.mocks.navigate).not.toHaveBeenCalled();expect(fake.mocks.stop).not.toHaveBeenCalled()
 })
 it('旧调用的迟到状态不能覆盖同一窗口的新调用状态或工具栏',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const old=(service as any).scopes.get(APPLICATION_BROWSER_SCOPE)
  await service.drain(lease);await service.acquire({...lease,runId:'next-run',generation:'next-generation'})
  const state=service.list()[0],send=fake.instances.get(state.instanceId).toolbarView.webContents.send
  send.mockClear();old.state.control='closed';(service as any).emit(old)
  expect(service.list()[0]).toEqual(state);expect(send).not.toHaveBeenCalled()
 })
 it('same-source native read promotion preserves document refs, while another run invalidates them',async()=>{
  const {service,lease,fake}=await fixture()
  const reading={...lease,workId:undefined,sourceMessageId:'original-user'}
  await service.acquire(reading)
  const cdp=fake.instances.get(service.list()[0].instanceId).cdp
  cdp.invalidateRefs.mockClear()
  await service.drain(reading)
  const writing={...reading,workId:'real-work',generation:'write-generation'}
  await service.acquire(writing)
  expect(cdp.invalidateRefs).not.toHaveBeenCalled()
  await service.drain(writing)
  await service.acquire({...writing,runId:'another-run',generation:'another-generation'})
  expect(cdp.invalidateRefs).toHaveBeenCalledTimes(1)
 })
 it('人工网页不授予员工读取权，但不阻止员工离开并导航到明确获准目标',async()=>{
  const {service,lease,fake}=await fixture()
  const manual=await service.manualOpen({})
  await fake.manager.navigate(manual.instanceId,'https://manual.test/private')
  await service.acquire(lease)
  const blocked=await service.executeSingle(await envelope(service,lease,'snapshot'))
  expect(blocked).toMatchObject({status:'cancelled_before_start',error:'当前页面不在获准来源范围'})
  expect(fake.mocks.getAccessibilitySnapshot).not.toHaveBeenCalled()
  const navigated=await service.executeSingle(await envelope(service,lease,'navigate https://example.com/'))
  expect(navigated).toMatchObject({status:'completed',source:{url:'https://example.com/'}})
  expect((await service.executeSingle(await envelope(service,lease,'snapshot'))).status).toBe('completed')
  const forbidden=await service.executeSingle(await envelope(service,lease,'navigate https://unapproved.test/'))
  expect(forbidden).toMatchObject({status:'cancelled_before_start',error:'尚未批准该网页来源'})
 })
 it('打开内置浏览器只显示原窗口，不改写正在执行的工具调用',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const before=service.list()[0]!
  const opened=await service.manualOpen({})
  expect(opened.control).toBe('agent-controlled');expect(service.currentLease()).toEqual(lease);expect(opened.instanceId).toBe(before.instanceId)
  expect(fake.mocks.stop).not.toHaveBeenCalled();expect(fake.mocks.focus).toHaveBeenCalledOnce()
 })
 it('任务取得当前可见窗口只读取快照时仍保留真实可见状态',async()=>{
  const {service,lease,fake}=await fixture();const window=await service.manualOpen({})
  fake.mocks.onStateChange.mock.calls[0][0]({id:window.instanceId,url:'about:blank',title:'Test',isLoading:false,isVisible:true})
  await service.acquire(lease)
  expect((await service.executeSingle(await envelope(service,lease,'snapshot'))).status).toBe('completed')
  expect(service.list()[0].isVisible).toBe(true)
 })
 it('新明确员工任务用真实租约复用人工原窗口与profile；人工窗口不能恢复不存在的原任务',async()=>{
  const {service,lease,fake}=await fixture()
  const manual=await service.manualOpen({})
  await expect(service.userControl({scopeKey:lease.scopeKey,action:'resume'})).rejects.toThrow('尚无可继续的员工任务')
  await expect(service.inspect(lease)).rejects.toThrow('租约')
  await service.acquire(lease)
  expect(service.list()[0]?.instanceId).toBe(manual.instanceId);expect(service.list()[0]?.control).toBe('agent-controlled');expect(service.currentLease()?.runId).toBe(lease.runId)
  expect(fake.mocks.createInstance).toHaveBeenCalledTimes(2);expect(fake.instances.size).toBe(1)
  expect(fake.instances.values().next().value!.downloadDirectory).toBe(await realpath(lease.downloadDirectory))
 })
 it('人工scope也持久登记和实际清理；重启清除原profile不制造旧任务',async()=>{
  const {service,lease,options,clearPartition}=await fixture()
  await service.manualOpen({});await service.clearScope({scopeKey:lease.scopeKey})
  expect(service.list()[0]?.control).toBe('closed');expect(clearPartition).toHaveBeenCalledOnce()
  const restarted=new BrowserService({...options,manager:driver().manager});await restarted.manualOpen({})
  expect(restarted.currentLease()).toBeNull();expect(restarted.list()[0]?.url).toBe('about:blank')
  await restarted.clearScope({scopeKey:lease.scopeKey});expect(clearPartition).toHaveBeenCalledTimes(2)
 })
 it('内置浏览器关闭和重开等待真实窗口退出',async()=>{
  const {service,lease,fake}=await fixture()
  await service.manualOpen({})
  const entered=deferred<void>(),exited=deferred<void>()
  fake.mocks.destroyInstance.mockImplementation(async(id:string)=>{entered.resolve();await exited.promise;fake.instances.delete(id);fake.pages.delete(id)})
  const close=service.userControl({scopeKey:lease.scopeKey,action:'close'});await entered.promise
  let reopened=false;const opening=service.manualOpen({}).then(()=>{reopened=true})
  await Promise.resolve();expect(reopened).toBe(false);expect(service.list()[0]?.control).toBe('closing')
  exited.resolve();await close;await opening;expect(reopened).toBe(true);expect(fake.instances.size).toBe(1);expect(service.list()[0]?.control).toBe('user-controlled')
 })
 it('并行打开内置浏览器只创建同一窗口和固定登录分区',async()=>{
  const {service,fake}=await fixture()
  const [first,second]=await Promise.all([service.manualOpen({}),service.manualOpen({})])
  expect(first.instanceId).toBe(second.instanceId);expect(fake.mocks.createInstance).toHaveBeenCalledOnce()
  await service.manualOpen({});await service.manualOpen({})
  expect(new Set([...fake.instances.values()].map(instance=>instance.partition)).size).toBe(1)
  expect(service.currentLease()).toBeNull();expect(service.list()).toHaveLength(1)
  expect(fake.mocks.createInstance.mock.calls[0][1].ownerSessionId).toBeUndefined()
  expect(fake.mocks.createInstance.mock.calls[0][1].workspaceId).toBeUndefined()
  expect(fake.instances.values().next().value.window.setTitle).toHaveBeenCalledWith('内置浏览器')
 })
 it('人工工具栏准备失败保持实际错误，不伪造ready；关闭后新窗口可重新准备',async()=>{
  const {service,lease,fake}=await fixture()
  fake.mocks.ready.mockRejectedValueOnce(new Error('manual toolbar failed'))
  await expect(service.manualOpen({})).rejects.toThrow('manual toolbar failed')
  expect(service.list()[0]?.toolbarReady).toBe(false);expect(service.list()[0]?.error).toBe('manual toolbar failed');expect(fake.mocks.focus).not.toHaveBeenCalled()
  await service.userControl({scopeKey:lease.scopeKey,action:'close'});await service.manualOpen({})
  expect(service.list()[0]?.toolbarReady).toBe(true);expect(service.list()[0]?.error).toBeUndefined()
 })
 it('旧任务退出回执不能关闭之后新建的人工窗口，重启也不自动重开窗口',async()=>{
  const {service,lease,fake,options}=await fixture();await service.acquire(lease);await service.clearScope({scopeKey:lease.scopeKey})
  await service.manualOpen({});const stopCount=fake.mocks.stop.mock.calls.length
  await service.drain(lease);expect(service.list()[0]?.control).toBe('user-controlled');expect(fake.mocks.stop).toHaveBeenCalledTimes(stopCount)
  const restarted=new BrowserService({...options,manager:driver().manager});expect(restarted.list()).toHaveLength(0)
 })
 it('宿主drain没有工具inFlight时也等真实页面退出，新员工代际不能提前认领',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const entered=deferred<void>(),exited=deferred<void>()
  fake.mocks.waitForLoads.mockImplementationOnce(async()=>{entered.resolve();await exited.promise})
  const draining=service.drain(lease);await entered.promise
  await expect(service.acquire({...lease,generation:'g2'})).rejects.toThrow('尚未实际退出')
  expect(service.list()[0]?.control).toBe('draining')
  exited.resolve();await draining;await service.acquire({...lease,generation:'g2'})
  expect(service.currentLease()?.generation).toBe('g2');expect(service.list()[0]?.control).toBe('agent-controlled')
 })
 it('重复退出共享同一个实际drain，旧退出不能干扰后续调用',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const entered=deferred<void>(),exited=deferred<void>()
  fake.mocks.waitForLoads.mockImplementationOnce(async()=>{entered.resolve();await exited.promise})
  const first=service.drain(lease);await entered.promise;const second=service.drain(lease)
  expect((service as any).allowedNavigation(service.list()[0].instanceId,'https://manual.test/redirect')).toBe(true)
  expect(fake.mocks.stop).not.toHaveBeenCalled();expect(fake.mocks.cancelDownloads).toHaveBeenCalledTimes(1);expect(fake.mocks.cancelDownloads).toHaveBeenCalledWith(service.list()[0].instanceId,{managedOnly:true})
  await expect(service.acquire({...lease,runId:'next',generation:'g2'})).rejects.toThrow('尚未实际退出')
  exited.resolve();await Promise.all([first,second]);await service.acquire({...lease,runId:'next',generation:'g2'})
  const calls=fake.mocks.stop.mock.calls.length;await service.drain(lease)
  expect(fake.mocks.stop).toHaveBeenCalledTimes(calls);expect(service.currentLease()?.runId).toBe('next')
 })
 it('排队中的认领在实际提交处重新核对旧动作退出门禁',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const navigated=deferred<void>(),navigateExit=deferred<void>(),drainEntered=deferred<void>(),drainExit=deferred<void>()
  const navigation=(service as any).navigateByUser(service.list()[0].instanceId,async()=>{navigated.resolve();await navigateExit.promise})
  await navigated.promise
  const queued=service.acquire({...lease,runId:'next',generation:'g2'}),rejected=expect(queued).rejects.toThrow('尚未实际退出')
  fake.mocks.waitForLoads.mockImplementationOnce(async()=>{drainEntered.resolve();await drainExit.promise})
  const draining=service.drain(lease);navigateExit.resolve();await navigation;await drainEntered.promise;await rejected
  expect(service.list()[0].control).toBe('draining');drainExit.resolve();await draining
  await service.acquire({...lease,runId:'next',generation:'g2'});expect(service.currentLease()?.runId).toBe('next')
 })
 it('实际退出一次失败保持认领门禁，但明确关闭可重新核对退出',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  fake.mocks.cancelDownloads.mockRejectedValueOnce(new Error('temporary exit failure'))
  await expect(service.drain(lease)).rejects.toThrow('temporary exit failure')
  expect(service.list()[0].control).toBe('draining')
  await expect(service.acquire({...lease,generation:'next'})).rejects.toThrow('尚未实际退出')
  await service.userControl({scopeKey:APPLICATION_BROWSER_SCOPE,action:'close'})
  expect(service.list()[0].control).toBe('closed');expect(fake.mocks.cancelDownloads).toHaveBeenCalledTimes(2)
 })
 it('旧窗口重复关闭排在重开后到达时不能关闭新实例',async()=>{
  const {service,fake}=await fixture();await service.manualOpen({})
  const entered=deferred<void>(),exit=deferred<void>()
  fake.mocks.destroyInstance.mockImplementationOnce(async(id:string)=>{entered.resolve();await exit.promise;fake.instances.delete(id);fake.pages.delete(id)})
  const first=service.userControl({scopeKey:APPLICATION_BROWSER_SCOPE,action:'close'});await entered.promise
  const reopening=service.manualOpen({}),late=service.userControl({scopeKey:APPLICATION_BROWSER_SCOPE,action:'close'})
  exit.resolve();await first;await reopening;await late
  expect(fake.mocks.destroyInstance).toHaveBeenCalledTimes(1);expect(fake.instances.size).toBe(1);expect(service.list()[0].control).toBe('user-controlled')
 })
 it('历史下载记录已清理不能使新调用失败或进入新运行下载证据',async()=>{
  const {service,lease,fake,root}=await fixture();await service.acquire(lease)
  fake.mocks.getDownloads.mockResolvedValue([{id:'old-download',state:'completed',savePath:join(root,'managed','old-run','removed.txt'),url:'https://example.com/report',filename:'removed.txt',timestamp:Date.now()}])
  const reply=await service.executeSingle(await envelope(service,lease,'snapshot'))
  expect(reply.status).toBe('completed');expect(reply.downloads).toBeUndefined()
 })
 it('新内置profile保持确定身份且不合并或删除历史登录分区',async()=>{
  const {service,options,clearPartition}=await fixture();await service.shutdown()
  const legacy={scopeKey:'legacy-employee-chat',scopeEpoch:1,agentId:'old',conversationId:'old-chat',partition:`persist:boai-browser-${createHash('sha256').update('legacy-employee-chat').digest('hex')}`,status:'ready'}
  await writeFile(options.profileRegistryPath,JSON.stringify({schema:1,profiles:[legacy]}))
  const fake=driver(),restarted=new BrowserService({...options,manager:fake.manager});await restarted.manualOpen({})
  const registry=JSON.parse(await readFile(options.profileRegistryPath,'utf8'))
  expect(registry.profiles).toContainEqual(legacy);expect(clearPartition).not.toHaveBeenCalled()
  expect(fake.instances.values().next().value!.partition).not.toBe(legacy.partition)
  expect(registry.profiles.find((profile:{scopeKey:string})=>profile.scopeKey===APPLICATION_BROWSER_SCOPE)).not.toHaveProperty('agentId')
 })
 it('任务只独占实际工具调用，真实退出后另一任务复用相同窗口和登录分区',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);await service.acquire(lease)
  expect(fake.mocks.createInstance).toHaveBeenCalledTimes(1)
  const instance=service.list()[0].instanceId
  const second={...lease,agentId:'b',conversationId:'other',workId:'other-work',runId:'b-run',downloadDirectory:join(lease.downloadDirectory,'b')}
  await expect(service.acquire(second)).rejects.toThrow('另一任务')
  await service.drain(lease);await service.acquire(second)
  expect(service.list()[0].instanceId).toBe(instance);expect(service.currentLease()).toEqual(second)
  await service.drain(lease);expect(service.currentLease()).toEqual(second)
  expect(new Set([...fake.instances.values()].map(value=>value.partition)).size).toBe(1)
  expect(service.list()).toHaveLength(1)
 })
 it('批处理/伪造hash/无匹配批准在首个页面动作前拒绝',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const request=await envelope(service,lease,'navigate https://example.com')
  await expect(service.executeSingle({...request,command:'snapshot; navigate https://evil.test'})).rejects.toThrow('批处理')
  await expect(service.executeSingle({...request,argumentHash:'forged'})).rejects.toThrow('参数')
  const click=await envelope(service,lease,'click @e1',false);expect((await service.executeSingle(click)).status).toBe('cancelled_before_start')
  expect(fake.mocks.navigate).not.toHaveBeenCalled();expect(fake.mocks.clickElement).not.toHaveBeenCalled()
 })
 it('已获准origin导航不重复审批，Main握手失败仍零执行',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const request=await envelope(service,lease,'navigate https://example.com',false)
  const denied=await service.executeSingle(request,async()=>{throw new Error('holder revoked')})
  expect(denied.status).toBe('cancelled_before_start');expect(fake.mocks.navigate).not.toHaveBeenCalled()
  const allowed=await service.executeSingle(await envelope(service,lease,'navigate https://example.com',false),async()=>{})
  expect(allowed.error ?? allowed.status).toBe('completed');expect(allowed.source?.url).toBe('https://example.com');expect(fake.mocks.navigate).toHaveBeenCalledTimes(1)
 })
 it('实际页面改变使旧批准失效，不能按旧@ref执行',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);const request=await envelope(service,lease,'click @e1')
  fake.pages.values().next().value!.html='<main>changed form</main>'
  expect((await service.executeSingle(request)).status).toBe('cancelled_before_start');expect(fake.mocks.clickElement).not.toHaveBeenCalled()
 })
 it('相同actionId/参数只执行一次，替换参数不能获取原回执',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);const request=await envelope(service,lease,'navigate https://example.com',false)
  const result=await service.executeSingle(request);expect(await service.executeSingle(request)).toEqual(result);expect(fake.mocks.navigate).toHaveBeenCalledTimes(1)
  const other=await envelope(service,lease,'snapshot');await expect(service.executeSingle({...other,actionId:request.actionId})).rejects.toThrow('不能更换参数')
 })
 it('已开始的CDP异常保留unknown，核对和同身份重入不会重复提交',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);fake.mocks.clickElement.mockRejectedValue(new Error('CDP reply lost after click'))
  const request=await envelope(service,lease,'click @e1'), result=await service.executeSingle(request)
  expect(result.status).toBe('unknown');expect(service.lookup({lease,actionId:request.actionId})?.status).toBe('unknown')
  await service.executeSingle(request);expect(fake.mocks.clickElement).toHaveBeenCalledTimes(1)
 })
 it('旧显式接管兼容入口仍等待实际慢动作退出',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);const entered=deferred<void>(),exited=deferred<void>()
  fake.mocks.clickElement.mockImplementation(async()=>{entered.resolve();await exited.promise})
  const action=service.executeSingle(await envelope(service,lease,'click @e1'));await entered.promise
  let handed=false;const take=service.userControl({scopeKey:lease.scopeKey,action:'take'}).then(()=>{handed=true})
  await Promise.resolve();expect(service.list()[0]?.control).toBe('draining');expect(handed).toBe(false)
  await expect(service.executeSingle(await envelopeDuringOldPage(lease,'snapshot'))).rejects.toThrow('租约')
  exited.resolve();await action;await take;expect(handed).toBe(true);expect(service.list()[0]?.control).toBe('user-controlled')
 })
 it('旧交接兼容产生新代际后旧drain不能停止新运行或复活旧refs',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);await service.userControl({scopeKey:lease.scopeKey,action:'take'})
  const next={...lease,generation:'g2'};await service.acquire(next);const calls=fake.mocks.stop.mock.calls.length
  await service.drain(lease);expect(service.list()[0]?.control).toBe('agent-controlled');expect(fake.mocks.stop.mock.calls.length).toBe(calls)
  await expect(service.acquire(lease)).rejects.toThrow('旧浏览器')
 })
 it('旧接管兼容关门期间已完成wait保留事实，新代际不得越过退出',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);const entered=deferred<void>(),exited=deferred<void>()
  fake.mocks.waitFor=vi.fn(async()=>{entered.resolve();await exited.promise;fake.pages.values().next().value!.html='<p>READY</p>';return {ok:true,kind:'text',elapsedMs:50,detail:'text found: READY'}})
  const action=service.executeSingle(await envelope(service,lease,'wait text READY 5000'));await entered.promise
  const take=service.userControl({scopeKey:lease.scopeKey,action:'take'})
  await expect(service.acquire({...lease,generation:'g2'})).rejects.toThrow('尚未实际退出')
  exited.resolve();const reply=await action;await take
  expect(reply.status).toBe('completed');expect(reply.result?.output).toContain('READY');expect(reply.source?.pageVersion).toBe(service.list()[0]?.pageVersion)
 })
 it('普通release只显示聚焦，不切控制权或阻塞原租约的新页面核对',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const reply=await service.executeSingle(await envelope(service,lease,'release'))
  expect(reply.status).toBe('completed');expect(reply.needsUserControl).toBeUndefined();expect(fake.mocks.focus).toHaveBeenCalled();expect(fake.mocks.destroyInstance).not.toHaveBeenCalled();expect(fake.mocks.stop).not.toHaveBeenCalled()
  expect(service.list()[0]).toMatchObject({control:'agent-controlled'});expect(service.currentLease()).toEqual(lease)
  const source=await service.inspect(lease);expect(source).toMatchObject({scopeKey:lease.scopeKey,generation:lease.generation,pageVersion:reply.source!.pageVersion})
  const next=await service.executeSingle(await envelope(service,lease,'snapshot'));expect(next.status).toBe('completed');expect(next.source).toMatchObject({scopeKey:lease.scopeKey,generation:lease.generation,pageVersion:source!.pageVersion})
 })
 it('真实关闭失败保留窗口/closing，不能乐观移除徽标',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);fake.mocks.destroyInstance.mockRejectedValue(new Error('not actually destroyed'))
  await expect(service.userControl({scopeKey:lease.scopeKey,action:'close'})).rejects.toThrow('not actually destroyed')
  expect(service.list()[0]?.control).toBe('closing');expect(service.list()[0]?.error).toBe('not actually destroyed');expect(fake.instances.size).toBe(1)
 })
 it('持久登记让重启后清除原partition；原租约跨重启拒绝，新run可重新使用空profile',async()=>{
  const {service,lease,options,clearPartition}=await fixture();await service.acquire(lease)
  const action=await envelope(service,lease,'navigate https://example.com',false);await service.executeSingle(action)
  await service.clearScope({scopeKey:lease.scopeKey})
  expect(service.list()[0]?.url).toBe('about:blank');expect(service.list()[0]?.pageVersion).toBe('0');expect(service.lookup({lease,actionId:action.actionId})).toBeNull()
  expect(clearPartition).toHaveBeenCalledTimes(1)
  const restarted=new BrowserService({...options,manager:driver().manager});await expect(restarted.acquire(lease)).rejects.toThrow('已清理')
  const fresh={...lease,runId:'new-run',generation:'new-g'};await restarted.acquire(fresh)
  const after=new BrowserService({...options,manager:driver().manager});await after.clearScope({scopeKey:lease.scopeKey});expect(clearPartition).toHaveBeenCalledTimes(2)
 })
 it('工具下载不泄露宿主路径，内部真实已完成原件仍携带hash/来源',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);await service.executeSingle(await envelope(service,lease,'navigate https://example.com',false))
  const file=join(lease.downloadDirectory,'report.txt');await writeFile(file,'actual browser download')
  fake.mocks.getDownloads.mockResolvedValue([{id:'dl',filename:'report.txt',state:'completed',url:'https://example.com/file',timestamp:Date.now(),savePath:file,bytesReceived:23,totalBytes:23,mimeType:'text/plain'}])
  const result=await service.executeSingle(await envelope(service,lease,'downloads list'))
  expect(result.status).toBe('completed');expect(result.result?.output).not.toContain(lease.downloadDirectory);expect(result.result?.output).not.toContain('self:/runs/');expect(result.result?.output).toContain('report.txt')
  expect(result.downloads?.[0]?.path).toBe(await realpath(file));expect(result.downloads?.[0]?.hash).toBe(createHash('sha256').update('actual browser download').digest('hex'))
 })
 it('工具栏真实加载失败不伪造ready，不执行网页动作',async()=>{
  const {service,lease,fake}=await fixture();fake.mocks.ready.mockRejectedValue(new Error('toolbar failed'))
  await expect(service.acquire(lease)).rejects.toThrow('toolbar failed');expect(service.list()[0]?.toolbarReady).toBe(false);expect(service.list()[0]?.error).toBe('toolbar failed')
  expect(fake.mocks.navigate).not.toHaveBeenCalled()
 })
})
async function envelopeDuringOldPage(lease:BrowserLease,command:string):Promise<BrowserActionEnvelope>{return {lease,actionId:`action-${++actionSequence}`,toolCallId:`tool-${actionSequence}`,command,argumentHash:createHash('sha256').update(JSON.stringify(parseBrowserSingleCommand(command).parts)).digest('hex'),approvedOrigins:[]}}

function axFixture(nodes:any[],domUnavailable=false){
 const send=vi.fn(async(method:string)=>{
  if(method==='Accessibility.getFullAXTree')return {nodes}
  if(method==='DOM.getDocument'){if(domUnavailable)throw new Error('DOM unavailable');return {root:{nodeId:1}}}
  if(method==='DOM.querySelectorAll')return {nodeIds:[]}
  throw new Error(`Unexpected page action ${method}`)
 })
 const cdp=new BrowserCDP({debugger:{attach:vi.fn(),detach:vi.fn(),on:vi.fn(),sendCommand:send},getURL:()=> 'https://example.com',getTitle:()=> 'Article'} as unknown as WebContents)
 cdps.push(cdp);return {cdp,send}
}
describe('BrowserCDP 实际正文与秘密隔离',()=>{
 it('按钮存在时也读取正文StaticText；页面变化后旧ref不能再点击',async()=>{
  const {cdp,send}=axFixture([{role:{value:'button'},name:{value:'Continue'},backendDOMNodeId:1},{role:{value:'StaticText'},name:{value:'BROWSER_PAGE_MARKER actual article'},backendDOMNodeId:2}])
  const page=await cdp.getAccessibilitySnapshot();expect(page.nodes.map(node=>node.name)).toContain('BROWSER_PAGE_MARKER actual article')
  const oldRef=page.nodes[0]!.ref;cdp.invalidateRefs()
  await expect(cdp.clickElement(oldRef)).rejects.toThrow('not found');expect(send.mock.calls.some(call=>call[0]==='Input.dispatchMouseEvent')).toBe(false)
  expect((await cdp.getAccessibilitySnapshot()).nodes[0]!.ref).not.toBe(oldRef)
 })
 it('DOM核对不可用时AX protected证据仍隐藏姓名/描述/值并拒绝填密码',async()=>{
  const secret='BRM_PRIVATE_PASSWORD_MUST_NOT_LEAK'
  const {cdp,send}=axFixture([{role:{value:'textbox'},name:{value:secret},value:{value:secret},description:{value:secret},backendDOMNodeId:7,properties:[{name:'protected',value:{value:true}}]}],true)
  const page=await cdp.getAccessibilitySnapshot();expect(JSON.stringify(page)).not.toContain(secret);expect(page.nodes[0]!.value).toBe('[redacted]')
  await expect(cdp.fillElement(page.nodes[0]!.ref,'secret')).rejects.toThrow('手动输入');expect(send.mock.calls.some(call=>call[0]==='DOM.focus')).toBe(false)
 })
 it('长正文和节点数量均有界，网页不能制造无界模型输入',async()=>{
  const {cdp}=axFixture(Array.from({length:700},(_,index)=>({role:{value:'StaticText'},name:{value:'x'.repeat(3000)},description:{value:'y'.repeat(3000)},backendDOMNodeId:index+1})))
  const page=await cdp.getAccessibilitySnapshot();expect(page.nodes).toHaveLength(500);expect(page.nodes.every(node=>node.name.length<=2000&&(node.description?.length??0)<=2000)).toBe(true)
 })
})
describe('BrowserPaneManager 实际页面退出',()=>{
 it('window销毁使View getter消失时仍等冻结WC实际退出后移除Map；shutdown同样等待',async()=>{
  const entered=deferred<void>(),finished=deferred<void>();let windowDestroyed=false
  const actualContents=Array.from({length:3},(_,index)=>{
   let destroyed=false,done:()=>void=()=>{}
   return {id:index+1,isDestroyed:()=>destroyed,once:(_event:string,callback:()=>void)=>{done=callback},stop:vi.fn(),close:()=>{
    if(index===2){entered.resolve();void finished.promise.then(()=>{destroyed=true;done()})}else {destroyed=true;done()}
   }}
  })
  const views=actualContents.map(contents=>({get webContents(){return windowDestroyed?undefined:contents}}))
  const manager=new BrowserPaneManager({rendererDirectory:'/managed/renderer',preloadPath:'/managed/toolbar.cjs',allowNavigation:()=>false,allowNetwork:()=>false,downloadPolicy:()=>null,allowUserNavigation:()=>false,toolbarState:()=>({}),userControl:async()=>{}}),removed=vi.fn()
  manager.onRemoved(removed)
  const instance={id:'closing',window:{isDestroyed:()=>windowDestroyed,destroy:()=>{windowDestroyed=true}},toolbarView:views[0],pageView:views[1],nativeOverlayView:views[2],ownedWebContents:actualContents,activeDownloads:new Map(),loadDone:null,cdp:{drain:async()=>{},detach:vi.fn()},pendingShowToken:0,lockState:{active:true},inPageThemeTimer:null}
  ;(manager as any).instances.set(instance.id,instance)
  let completed=false;const close=manager.destroyAll().then(()=>{completed=true});await entered.promise
  expect(windowDestroyed).toBe(true);expect(completed).toBe(false);expect(removed).not.toHaveBeenCalled();expect(manager.getInstance(instance.id)).toBe(instance)
  finished.resolve();await close;expect(completed).toBe(true);expect(manager.getInstance(instance.id)).toBeUndefined();expect(removed).toHaveBeenCalledOnce()
 })
})

describe('固定网页引用',()=>{
 it('引用不创建租约，导航拒绝旧版本，重开同URL仍是另一个实例',async()=>{
  const {service,fake}=await fixture()
  const opened=await service.manualOpen({})
  await fake.manager.navigate(opened.instanceId,'https://example.test/form')
  const reference=await service.reference({})
  expect(reference).toMatchObject({instanceId:opened.instanceId,url:'https://example.test/form'})
  expect(service.currentLease()).toBeNull()
  await expect(service.reference(reference)).resolves.toMatchObject({instanceId:reference.instanceId,pageVersion:reference.pageVersion,url:reference.url})
  fake.pages.get(opened.instanceId).html='<main>new document</main>'
  await expect(service.reference(reference)).rejects.toThrow('重新引用')
  await service.userControl({scopeKey:APPLICATION_BROWSER_SCOPE,action:'close'})
  const reopened=await service.manualOpen({})
  expect(reopened.instanceId).not.toBe(opened.instanceId)
  await fake.manager.navigate(reopened.instanceId,'https://example.test/form')
  await expect(service.reference(reference)).rejects.toThrow('关闭或替换')
 })
 it('先引用再获得只读租约仍保持原页面版本和登录实例',async()=>{
  const {service,fake,lease}=await fixture()
  const opened=await service.manualOpen({});await fake.manager.navigate(opened.instanceId,'https://example.test/')
  const reference=await service.reference({})
  const readLease={...lease,workId:undefined,sourceMessageId:'real-user-message'}
  await service.acquire(readLease)
  expect(await service.inspect(readLease)).toMatchObject({instanceId:reference.instanceId,pageVersion:reference.pageVersion})
  expect(service.list()[0].instanceId).toBe(opened.instanceId)
  await service.drain(readLease)
 })
})

it('returns a fresh-snapshot instruction after its own input changes the page and retires old refs', async () => {
 const {service,lease,fake}=await fixture();await service.acquire(lease)
 await service.executeSingle(await envelope(service,lease,'navigate https://example.com/'))
 const page=fake.pages.get(service.list()[0].instanceId),cdp=fake.instances.get(service.list()[0].instanceId).cdp
 fake.mocks.fillElement.mockImplementation(async()=>{page.forms=[{value:'changed'}];return {valueLength:7}})
 cdp.invalidateRefs.mockClear()
 const reply=await service.executeSingle(await envelope(service,lease,'fill @e1 "changed"'))
 expect(reply.status).toBe('completed');expect(reply.result?.output).toContain('previous element refs are invalid')
 expect(reply.result?.output).toContain('"snapshot"');expect(cdp.invalidateRefs).toHaveBeenCalledOnce()
})

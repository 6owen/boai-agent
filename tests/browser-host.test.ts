/*
 * [INPUT]: BrowserService 与私有租约/动作、实际文件、可控制退出的驱动 fixture。
 * [OUTPUT]: 单 scope 排他/零执行批准、交接等待、未知不重放、跨重启清理与有界正文/密码 AX 隔离意图；短普通页/空AX不会假接管，实际验证证据仍触发。
 * [POS]: BRM1/BRM3 宿主模块验收；不替代真实 Electron profile/UI 证据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { BrowserService } from '../src/main/browser/browser-service'
import { BrowserPaneManager } from '../src/main/browser/browser-pane-manager'
import { parseBrowserSingleCommand } from '../src/runtime/adapters/mastra/browser-tool-runtime'
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
  getInstance:vi.fn((id:string)=>instances.get(id)),ready:vi.fn(async()=>{}),setAgentControl:vi.fn(),clearAgentControl:vi.fn(),
  getAccessibilitySnapshot:vi.fn(async(id:string)=>({url:pages.get(id).url,title:'Test',nodes:[{ref:'@e1',role:'button',name:'Save'}]})),
  navigate:vi.fn(async(id:string,url:string)=>{const page=pages.get(id);page.url=url;page.html='<main>actual-page</main>';const instance=instances.get(id);instance.currentUrl=url;return {url,title:page.title}}),
  listInstances:vi.fn(()=>[...instances.values()].map(instance=>({id:instance.id,url:instance.currentUrl,title:instance.title,isVisible:true,ownerType:'session',ownerSessionId:'scope',boundSessionId:'scope',agentControlActive:true}))),
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
 const lease:BrowserLease={scopeKey:'a|chat|0',scopeEpoch:0,agentId:'a',conversationId:'chat',workId:'work',runId:'run',generation:'g1',configVersion:1,agentName:'Alice',conversationTitle:'Chat',downloadDirectory:join(root,'managed','run')}
 return {root,service,lease,options,fake,clearPartition}
}
let actionSequence=0
describe('实际窗口验证检测',()=>{
 it.each([
  {name:'只有一个链接的普通文章',nodes:[{role:'link'},...Array.from({length:499},()=>({role:'StaticText'}))],dom:[],title:'Example Domain',detected:false,provider:'none'},
  {name:'导航暂态空AX',nodes:[],dom:[],title:'Loading article',detected:false,provider:'none'},
  {name:'实际验证表单仍需本人接管',nodes:[{role:'button'}],dom:['dom:challenge-form'],title:'Just a moment...',detected:true,provider:'cloudflare'},
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
describe('BrowserService 原工作私有作用域',()=>{
 it('同scope同租约可核对，其他work不能借焦点或覆盖；员工/聊天各自partition',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);await service.acquire(lease)
  expect(fake.mocks.createInstance).toHaveBeenCalledTimes(1)
  await expect(service.acquire({...lease,workId:'other',runId:'other-run'})).rejects.toThrow('另一工作')
  const second={...lease,scopeKey:'b|chat|0',agentId:'b',runId:'b-run',downloadDirectory:join(lease.downloadDirectory,'b')};await service.acquire(second)
  const third={...lease,scopeKey:'a|different|0',conversationId:'different',runId:'c-run',downloadDirectory:join(lease.downloadDirectory,'c')};await service.acquire(third)
  expect(new Set([...fake.instances.values()].map(value=>value.partition)).size).toBe(3)
  expect(service.list()).toHaveLength(3)
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
 it('接管先关门并等待实际慢动作退出，再进入人工控制',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);const entered=deferred<void>(),exited=deferred<void>()
  fake.mocks.clickElement.mockImplementation(async()=>{entered.resolve();await exited.promise})
  const action=service.executeSingle(await envelope(service,lease,'click @e1'));await entered.promise
  let handed=false;const take=service.userControl({scopeKey:lease.scopeKey,action:'take'}).then(()=>{handed=true})
  await Promise.resolve();expect(service.list()[0]?.control).toBe('draining');expect(handed).toBe(false);expect(fake.mocks.clearAgentControl).not.toHaveBeenCalled()
  await expect(service.executeSingle(await envelopeDuringOldPage(lease,'snapshot'))).rejects.toThrow('租约')
  exited.resolve();await action;await take;expect(handed).toBe(true);expect(service.list()[0]?.control).toBe('user-controlled')
 })
 it('新代际交还后旧finally/drain不能解除新员工控制权或复活旧refs',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);await service.userControl({scopeKey:lease.scopeKey,action:'take'})
  const next={...lease,generation:'g2'};await service.acquire(next);const calls=fake.mocks.clearAgentControl.mock.calls.length
  await service.drain(lease);expect(service.list()[0]?.control).toBe('agent-controlled');expect(fake.mocks.clearAgentControl.mock.calls.length).toBe(calls)
  await expect(service.acquire(lease)).rejects.toThrow('旧浏览器')
 })
 it('接管关门期间已实际完成的只读wait仍保留completed，新代际不得越过退出',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease);const entered=deferred<void>(),exited=deferred<void>()
  fake.mocks.waitFor=vi.fn(async()=>{entered.resolve();await exited.promise;fake.pages.values().next().value!.html='<p>READY</p>';return {ok:true,kind:'text',elapsedMs:50,detail:'text found: READY'}})
  const action=service.executeSingle(await envelope(service,lease,'wait text READY 5000'));await entered.promise
  const take=service.userControl({scopeKey:lease.scopeKey,action:'take'})
  await expect(service.acquire({...lease,generation:'g2'})).rejects.toThrow('尚未实际退出')
  exited.resolve();const reply=await action;await take
  expect(reply.status).toBe('completed');expect(reply.result?.output).toContain('READY');expect(reply.source?.pageVersion).toBe(service.list()[0]?.pageVersion)
 })
 it('工具内release不等待自身queue；窗口保留而租约不能继续执行',async()=>{
  const {service,lease,fake}=await fixture();await service.acquire(lease)
  const reply=await service.executeSingle(await envelope(service,lease,'release'))
  expect(reply.status).toBe('completed');expect(reply.needsUserControl).toBe(true);expect(fake.mocks.focus).toHaveBeenCalled();expect(fake.mocks.destroyInstance).not.toHaveBeenCalled();expect(service.list()[0]?.control).toBe('user-controlled')
  await expect(service.inspect(lease)).rejects.toThrow('租约')
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
  expect(result.status).toBe('completed');expect(result.result?.output).not.toContain(lease.downloadDirectory);expect(result.result?.output).toContain('self:/runs/run/report.txt')
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
  await expect(cdp.fillElement(page.nodes[0]!.ref,'secret')).rejects.toThrow('人工接管');expect(send.mock.calls.some(call=>call[0]==='DOM.focus')).toBe(false)
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
  const manager=new BrowserPaneManager({rendererDirectory:'/managed/renderer',preloadPath:'/managed/toolbar.cjs',allowNavigation:()=>false,allowNetwork:()=>false,allowDownload:()=>false,allowUserNavigation:()=>false,toolbarState:()=>({}),userControl:async()=>{}}),removed=vi.fn()
  manager.onRemoved(removed)
  const instance={id:'closing',window:{isDestroyed:()=>windowDestroyed,destroy:()=>{windowDestroyed=true}},toolbarView:views[0],pageView:views[1],nativeOverlayView:views[2],ownedWebContents:actualContents,activeDownloads:new Map(),loadDone:null,cdp:{drain:async()=>{},detach:vi.fn()},pendingShowToken:0,lockState:{active:true},inPageThemeTimer:null}
  ;(manager as any).instances.set(instance.id,instance)
  let completed=false;const close=manager.destroyAll().then(()=>{completed=true});await entered.promise
  expect(windowDestroyed).toBe(true);expect(completed).toBe(false);expect(removed).not.toHaveBeenCalled();expect(manager.getInstance(instance.id)).toBe(instance)
  finished.resolve();await close;expect(completed).toBe(true);expect(manager.getInstance(instance.id)).toBeUndefined();expect(removed).toHaveBeenCalledOnce()
 })
})

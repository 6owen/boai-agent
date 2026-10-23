/*
 * [INPUT]: Real BOAI employee/runtime/browser bridge, public blank sites and an isolated profile.
 * [OUTPUT]: Budget-exhausted is a terminal failure; two-round API tasks are separately registered; preserve actual shape identity and arrow bindings.
 * [OUTPUT]: Autonomous UI actions and read-only website evidence; no canvas export, script drawing or test-side task execution.
 * [POS]: Browser capability acceptance using the established Electron BDD and saved-model/native fixtures.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile } from '../../../src/shared/domain'
import type { NativeAction } from '../../../src/shared/domain/execution'
import type { BrowserPageReference } from '../../../src/shared/ipc/browser'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { browserRecords, browserToolbarAction } from '../support/browser-migration'
import { prepareV2DataRoot } from '../../../src/main/migration'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import { archiveNativeFinalReview } from '../support/native-final-review'

const sites = { tldraw: 'https://www.tldraw.com/', excalidraw: 'https://excalidraw.com/' } as const
interface State { backend?: string; site?: keyof typeof sites; agent?: DigitalAgent; chat?: Conversation; reference?: BrowserPageReference; dataPath?: string; detail?: ConversationDetail; error?: unknown; captures: number; lastActionCount: number; messages: number; observations: any[]; facts?: any }
async function pageEvidence(d: Desktop, s: State, label: string) {
  const result = await d.app.evaluate(async ({ BrowserWindow }, site) => {
    const host = BrowserWindow.getAllWindows().flatMap(w => w.getBrowserViews().map(v => ({ window: w, view: v }))).find(x => { try { return new URL(x.view.webContents.getURL()).hostname === new URL(site).hostname } catch { return false } })
    if (!host) throw new Error('Expected BOAI website view is missing')
    const wc = host.view.webContents
    const facts = await wc.executeJavaScript(`(() => {
      const shapes = [...document.querySelectorAll('.tl-shape')].map(e => { const r=e.getBoundingClientRect(); return {id:e.getAttribute('data-shape-id'),type:e.getAttribute('data-shape-type'),text:e.innerText, x:r.x,y:r.y,width:r.width,height:r.height}; });
      let elements=[]; try { elements=JSON.parse(localStorage.getItem('excalidraw')||'[]').filter(e=>!e.isDeleted).map(e=>({id:e.id,type:e.type,text:e.text,x:e.x,y:e.y,width:e.width,height:e.height,startBinding:e.startBinding,endBinding:e.endBinding})); } catch {}
      return {title:document.title,url:location.href,text:document.body.innerText.slice(0,20000),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},shapes,elements};
    })()`)
    const image = await wc.capturePage(), scaleFactors=image.getScaleFactors(), scaleFactor=Math.max(...scaleFactors)
    return { facts, png: image.toPNG({scaleFactor}).toString('base64'), metadata:{method:'Electron browser page webContents.capturePage()',rect:null,pixelTransform:'none',webContentsId:wc.id,windowBounds:host.window.getBounds(),viewBounds:host.view.getBounds(),zoomFactor:wc.getZoomFactor(),scaleFactors,size:image.getSize(scaleFactor)} }
  }, sites[s.site!])
  const file = join(d.root, `browser-capability-${++s.captures}.png`); await writeFile(file, Buffer.from(result.png,'base64'))
  await d.reviewFile(label, file, { required:true }); await d.reviewData(label+'-页面事实', { ...result.facts, capture:result.metadata, sha256:createHash('sha256').update(Buffer.from(result.png,'base64')).digest('hex') })
  s.facts=result.facts; s.observations.push(result.facts)
  return result.facts
}
export const test = base.extend<{ browserCapability:State }>({ browserCapability: async({runtime},use)=>{
  const s:State={captures:0,lastActionCount:0,messages:0,observations:[]}
  try { await use(s) } finally {
    if(s.dataPath) {
      try { await pageEvidence(runtime,s,'结束时实际网页') } catch(error) { await runtime.reviewData('结束网页不可读取',{error:String(error)}) }
      await runtime.reviewData('浏览器能力结束记录',{backend:s.backend,site:s.site,reference:s.reference,error:s.error instanceof Error?s.error.message:s.error})
      await archiveNativeFinalReview(runtime,{label:'浏览器能力验收',records:async()=>({...await browserRecords(s.dataPath!),backend:s.backend,site:s.site})})
    }
  }
} })
const {Given,When,Then}=createBdd(test)
Given('为浏览器能力验收准备 {string} 员工和 {string} 临时网页',async({runtime:d,browserCapability:s},backend:string,site:string)=>{
  test.skip(process.env.BOAI_REAL_BROWSER_CAPABILITY!=='1','Explicit real-browser acceptance switch required')
  test.setTimeout(600000);test.info().annotations.push({type:'model-mode',description:'real-provider'})
  expect(Object.keys(sites)).toContain(site);s.site=site as keyof typeof sites;s.backend=backend
  const executable=process.env[backend==='codex'?'BOAI_NATIVE_CODEX':'BOAI_NATIVE_CLAUDE']
  if(backend!=='api')expect(executable).toBeTruthy()
  await d.reviewData('本场预登记',{backend,site,url:sites[s.site],userMessages:process.env.BOAI_BROWSER_CAPABILITY_PREFLIGHT==='1'?0:test.info().title.includes('两轮对话')?2:1,retries:0,observationMs:480000,productNativeBudget:'none',scope:'real employee UI actions; no canvas saving/export; independent temporary browser profile',executable,executableSha256:backend==='api'?undefined:createHash('sha256').update(await readFile(executable!)).digest('hex')})
  const connection=backend==='api'?(await prepareV2DataRoot(d.root),await prepareSavedModel(d)):undefined
  await d.start(connection?await systemKeychainLaunch(d):undefined)
  s.dataPath=(await d.page.evaluate(()=>window.boai.request('snapshot',undefined))).dataPath
  let profile:LaunchProfile|undefined
  if(backend!=='api'){
    const draft={name:'浏览器能力-'+backend,executable:executable!,args:[],protocol:backend==='codex'?'codex-app-server' as const:'claude-cli' as const,useExistingLogin:true,hostAccessAcknowledged:true as const}
    await d.page.evaluate(input=>window.boai.request('testLaunchProfileDraft',input),draft)
    profile=await d.page.evaluate(input=>window.boai.request('saveLaunchProfile',input),draft)
  }
  s.agent=await d.page.evaluate(({backend,profile,connection})=>window.boai.request('saveAgent',{name:'浏览器验收员工-'+backend,role:'按用户要求操作当前网页',instructions:'通过BOAI browser_tool操作用户引用的同一页面。自主观察与操作，以页面实际结果判断完成。不要调用命令行、外部浏览器、直接网站API或脚本来替代网页操作。',connectionId:connection?.id??'',modelId:connection?.defaultModel??(backend==='claude'?'sonnet':''),...(profile?{executionBackend:{kind:backend==='codex'?'codex-local' as const:'claude-local' as const,profileId:profile.id}}:{}),nativeOptions:backend==='codex'?{codexSandbox:'workspace-write',codexApprovalPolicy:'on-request'}:{claudePermissionMode:'default'},color:'#3478ce',skillIds:[],knowledgeIds:[],allowCommands:false,active:true}),{backend,profile,connection})
  s.chat=await d.page.evaluate(id=>window.boai.request('createConversation',{kind:'direct',title:'网页实际操作验收',agentIds:[id]}),s.agent!.id)
  const win=await d.page.evaluate(()=>window.boai.request('openBrowser',{}))
  await browserToolbarAction(d,win.instanceId,'navigate',sites[s.site])
  await expect.poll(async()=>d.app.evaluate(({BrowserWindow},site)=>BrowserWindow.getAllWindows().flatMap(w=>w.getBrowserViews()).some(v=>{try{return new URL(v.webContents.getURL()).hostname===new URL(site).hostname&&!v.webContents.isLoading()}catch{return false}}),sites[s.site!]),{timeout:60000}).toBe(true)
  await pageEvidence(d,s,'任务开始前真实空白网站')
  s.reference=await d.page.evaluate(()=>window.boai.request('referenceBrowserPage',{}))
  await d.reviewData('真实员工与页面身份',{agent:s.agent,chat:s.chat,profile,reference:s.reference,connection:connection&&{provider:connection.provider,model:connection.defaultModel}})
  if(process.env.BOAI_BROWSER_CAPABILITY_PREFLIGHT==='1')test.skip(true,'Website-only preparation check; zero model messages')
})
async function runCapabilityTask(d:Desktop,s:State,content:string) {
  s.messages++
  await d.reviewData('原始用户任务-'+s.messages,{content,reference:s.reference})
  await d.page.evaluate(input=>window.boai.request('sendMessage',input),{conversationId:s.chat!.id,content,mentionIds:[],requestId:'browser-capability-round-'+s.messages,browserReference:{instanceId:s.reference!.instanceId,pageVersion:s.reference!.pageVersion}})
  try{
    await expect.poll(async()=>{
      const detail=await d.page.evaluate(id=>window.boai.request('getConversation',{id}),s.chat!.id);s.detail=detail
      const snapshot=await d.page.evaluate(()=>window.boai.request('snapshot',undefined))
      for(const approval of snapshot.approvals){const allow=approval.kind==='browser'&&approval.command.includes(new URL(sites[s.site!]).origin);await d.reviewData('网页批准-'+approval.id,{...approval,approved:allow});await d.page.evaluate(input=>window.boai.request('approve',input),{id:approval.id,approved:allow})}
      if(s.backend!=='api')for(const run of detail.runs)for(const action of await d.page.evaluate(input=>window.boai.request('listNativeActions',input),{conversationId:s.chat!.id,runId:run.id}) as NativeAction[]){
        if(action.status!=='pending'||action.kind!=='approval')continue
        const allow=/^mcp__boai__(browser_tool|report_work)$/.test(action.method)
        await d.reviewData('原生批准-'+action.id,{id:action.id,method:action.method,approved:allow})
        await d.page.evaluate(input=>window.boai.request('respondNativeAction',input),{conversationId:s.chat!.id,runId:run.id,actionId:action.id,response:{option:s.backend==='codex'?allow?'accept':'decline':allow?'allow':'deny'}})
      }
      const records=await browserRecords(s.dataPath!),completed=records.actions.filter(a=>a.status==='completed').length
      if(completed>=s.lastActionCount+3&&s.captures<30){await pageEvidence(d,s,'员工实际操作后-'+completed);s.lastActionCount=completed}
      return detail.runs.length>0&&detail.runs.every(r=>['completed','failed','cancelled','interrupted'].includes(r.status))&&detail.turns!.every(t=>['completed','failed','cancelled','interrupted','budget_exhausted'].includes(t.status))
    },{timeout:480000,intervals:[300,800,1500]}).toBe(true)
  }catch(error){s.error=error;await d.page.evaluate(id=>window.boai.request('cancelRun',{conversationId:id}),s.chat!.id);throw error}
  await d.reviewData('员工任务实际终态-'+s.messages,{detail:s.detail,records:await browserRecords(s.dataPath!)})
  expect(s.detail!.runs.every(r=>r.status==='completed'), '员工每轮必须实际完成，不把预算终止当作网页任务通过').toBe(true)
}
When('员工自主在当前网页绘制并移动流程节点',async({runtime:d,browserCapability:s})=>{
  const content='请直接操作我引用的当前网页，在空白区域做一个两步流程：先画左右两个矩形，左边写“采集”，右边写“汇总”，用一条从采集指向汇总的箭头连接。然后把右边“汇总”矩形拖到“采集”下方，保留文字和连接，使最终成为上下排列。请通过截图检查实际结果。只操作这个网页，不保存、下载、导出、分享或登录，不使用代码注入、命令行、其他浏览器或网站API代做。完成后用简短中文告诉我实际完成的操作。'
  await runCapabilityTask(d,s,content)
})
When('员工先绘制流程再根据下一条消息移动节点',async({runtime:d,browserCapability:s})=>{
  const boundary='只操作引用的当前网页，不保存、下载、导出、分享或登录，不使用代码注入、命令行、其他浏览器或网站API代做。截图核对后简短回复。'
  await runCapabilityTask(d,s,'请在空白区域画一个左右排列的两步流程：左边矩形写“采集”，右边矩形写“汇总”，用一条从采集指向汇总的箭头连接。'+boundary)
  const first=await browserRecords(s.dataPath!);expect(first.works.every(w=>w.status==='delivered')).toBe(true);expect(first.works).toHaveLength(1)
  await pageEvidence(d,s,'第一轮绘制完成的网页')
  s.reference=await d.page.evaluate(()=>window.boai.request('referenceBrowserPage',{}))
  await runCapabilityTask(d,s,'请把刚才流程右侧的“汇总”矩形拖到“采集”正下方，保留原文字和连接箭头，最终上下排列。'+boundary)
})
Then('页面实际具有目标文字图形连线且操作由员工完成',async({runtime:d,browserCapability:s})=>{
  const facts=await pageEvidence(d,s,'验收最终网页'),records=await browserRecords(s.dataPath!)
  const elements=s.site==='tldraw'?facts.shapes:facts.elements
  await d.reviewData('确定性验收输入',{elements,actions:records.actions.map(a=>({command:a.command,status:a.status})),works:records.works})
  const text=elements.map((e:any)=>e.text??'').join('\n')
  expect(text).toContain('采集');expect(text).toContain('汇总')
  expect(elements.filter((e:any)=>s.site==='tldraw'?e.type==='geo':e.type==='rectangle')).toHaveLength(2)
  expect(elements.some((e:any)=>e.type==='arrow')).toBe(true)
  const first=elements.find((e:any)=>e.text?.includes('采集')),second=elements.find((e:any)=>e.text?.includes('汇总'))
  expect(second.y).toBeGreaterThan(first.y+50);expect(Math.abs(second.x-first.x)).toBeLessThan(180)
  const arrowIds=new Set(elements.filter((e:any)=>e.type==='arrow').map((e:any)=>e.id))
  expect(s.observations.some(f=>{
    const es=s.site==='tldraw'?f.shapes:f.elements,a=es.find((e:any)=>e.id===first.id),b=es.find((e:any)=>e.id===second.id)
    return a&&b&&Math.abs(a.y-b.y)<30&&b.x>a.x+150&&es.some((e:any)=>e.type==='arrow'&&arrowIds.has(e.id))
  }), '必须保留同一节点与箭头从左右排列到上下排列的过程证据').toBe(true)
  if(s.site==='excalidraw'){
    const rectangleFor=(text:any)=>elements.find((e:any)=>e.type==='rectangle'&&text.x>=e.x&&text.x<=e.x+e.width&&text.y>=e.y&&text.y<=e.y+e.height)?.id
    expect(elements.some((e:any)=>e.type==='arrow'&&e.startBinding?.elementId===rectangleFor(first)&&e.endBinding?.elementId===rectangleFor(second)), '箭头必须仍绑定原两个矩形').toBe(true)
  }

  expect(records.actions.filter(a=>a.status==='completed'&&String(a.command).startsWith('"drag"')).length).toBeGreaterThanOrEqual(1)
  expect(records.actions.some(a=>a.status==='completed'&&String(a.command).startsWith('"screenshot"'))).toBe(true)
  expect(records.works).toHaveLength(s.messages);expect(records.works.every(w=>w.status==='delivered')).toBe(true)
  expect(records.actions.every(a=>!/^"(?:evaluate|upload|set-clipboard|get-clipboard|downloads)"/.test(String(a.command)))).toBe(true)
})

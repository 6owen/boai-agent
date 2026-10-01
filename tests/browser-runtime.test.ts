/*
 * [INPUT]: 原浏览器 single parser、真实 SQLite Work/动作回执、宿主桥替身及真实 Mastra/本地模型 HTTP 协议。
 * [OUTPUT]: 首调用前拒绝批处理/越界、冻结审批、未知不重放、同工具身份幂等、取消后原事实与退出、实际 SDK PNG 媒体运输/持久脱敏合同。
 * [POS]: tests/browser-runtime.test.ts；Electron 真实页面由 browser-migration BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach,describe,expect,it,vi } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import { BrowserRepository,browserScopeKey,browserCommandHash } from '../src/runtime/modules/browser/repository'
import { BrowserSession,browserRequestOrigins } from '../src/runtime/modules/browser/session'
import { summarizeMedia } from '../src/runtime/modules/browser/media'
import { browserChatPrompt } from '../src/runtime/adapters/mastra/browser-model'
import { createBrowserTool } from '../src/runtime/adapters/mastra/browser-tool'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import type { EngineContext } from '../src/runtime/contracts'
import type { TraceSpan } from '../src/shared/domain/traces'
import { executeBrowserSingleCommand,parseBrowserSingleCommand,getBrowserToolHelp } from '../src/runtime/adapters/mastra/browser-tool-runtime'
import type { BrowserPaneFns } from '../src/runtime/adapters/mastra/browser-tool-types'
import type { BrowserActionEnvelope,BrowserActionReply,BrowserHostBridge,BrowserHostMethods,BrowserLease } from '../src/shared/ipc/browser'
import type { DigitalAgent,Conversation,WorkExecution } from '../src/shared/domain'
const cleanup:(()=>Promise<void>)[]=[]
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close()})
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'boai-browser-test-')); cleanup.push(()=>rm(root,{recursive:true,force:true}))
  const store=new ProductStore(join(root,'boai.sqlite'));await store.init();cleanup.push(()=>store.close())
  const agent:DigitalAgent={id:'agent',name:'研究员',role:'研究',instructions:'研究',color:'#000000',connectionId:'connection',modelId:'model',skillIds:[],knowledgeIds:[],allowCommands:false,allowBrowser:true,active:true,configVersion:1}
  const conversation:Conversation={id:'chat',kind:'direct',title:'研究',agentIds:[agent.id],mode:'natural',sharedKnowledgeIds:[],workspacePath:root,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),configVersion:1}
  await store.write([{collection:'agents',id:agent.id,value:agent},{collection:'conversations',id:conversation.id,value:conversation}])
  const works=new WorkRepository(store);await works.init()
  const work=await works.claim({conversationId:'chat',sourceMessageId:'request',agentId:'agent',runId:'run',intent:{key:'main',scope:'读取明确站点',deliverable:'实际研究结果'}})
  const lease:BrowserLease={scopeKey:browserScopeKey('agent','chat',1),scopeEpoch:1,agentId:'agent',conversationId:'chat',workId:work.id,runId:'run',generation:'generation',configVersion:1,agentName:'研究员',conversationTitle:'研究',downloadDirectory:root}
  const repository=new BrowserRepository(store,works)
  const envelope=(command='navigate https://example.test/') => ({lease,actionId:'action',toolCallId:'sdk-call',command:parseBrowserSingleCommand(command).command,argumentHash:browserCommandHash(parseBrowserSingleCommand(command).parts),approvedOrigins:['https://example.test']})
  return {root,store,works,work,lease,repository,envelope,agent}
}
function deferred<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve} }
function host(handler:(method:keyof BrowserHostMethods,input:unknown)=>Promise<unknown>):BrowserHostBridge {return {request:handler as BrowserHostBridge['request']}}
const page={scopeKey:'scope',generation:'generation',pageVersion:'page1',url:'https://example.test/',title:'可信来源',obtainedAt:'2026-10-02T00:00:00.000Z'}
describe('strict original browser command entry',()=>{
  it.each(['snapshot; navigate https://x.test','snapshot;','snapshot\nnavigate https://x.test','["snapshot"]','evaluate document.cookie','upload @e1 /tmp/file','get-clipboard','set-clipboard secret','paste secret','console','network','windows all','close all','focus instance-other','navigate https://user:password@x.test','navigate file:///tmp/file','snapshot extra','click @e0','click @e1 bogus','select @e1 x --unknown y','screenshot --png --png','screenshot-region --selector body','key v meta','key Control+v','downloads invalid','wait text x 60000','scroll down Infinity'])('rejects %s before any host callback',async command=>{
    const call=vi.fn(async()=>undefined)
    const fns=new Proxy({},{get:()=>call}) as BrowserPaneFns
    await expect(executeBrowserSingleCommand({command,fns,sessionId:'only-this-scope'})).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
  })
  it('preserves quoted separators and escaped text and normalizes equal command identity',()=>{
    expect(parseBrowserSingleCommand('FILL @e12 "第一行\\n第二行;文本"').parts).toEqual(['fill','@e12','第一行\n第二行;文本'])
    expect(browserCommandHash(parseBrowserSingleCommand("fill @e12 'hello world'").parts)).toBe(browserCommandHash(parseBrowserSingleCommand('fill @e12 "hello world"').parts))
    expect(getBrowserToolHelp()).not.toContain('navigate https://example.com;')
  })
  it('keeps original source text and screenshot bytes in the actual model output only',async()=>{
    const image={data:Buffer.from('screenshot bytes').toString('base64'),mimeType:'image/png',sizeBytes:16}
    const session={execute:vi.fn(async()=>({result:{output:'当前页面证据',appendReleaseHint:false,image},source:page}))} as unknown as BrowserSession
    const tool=createBrowserTool(session)
    const output=tool.toModelOutput!({output:'当前页面证据',image,source:page})
    expect(output).toMatchObject({type:'content',value:[{type:'text',text:expect.stringContaining('当前页面证据')},{type:'image-data',data:image.data,mediaType:'image/png'}]})
    const safe=JSON.stringify(summarizeMedia({input:{type:'image-data',data:image.data,mimeType:image.mimeType},providerRequestBody:JSON.stringify({content:[{type:'image_url',image_url:{url:`data:image/png;base64,${image.data}`}}]}),ordinary:'原始工具正文',credential:'named-key'}))
    expect(safe).not.toContain(image.data);expect(safe).toContain('sha256');expect(safe).toContain('原始工具正文');expect(safe).toContain('named-key')
  })
  it.each(['image-data','media'])('provides the compatible Chat adapter a real PNG file part after the original %s tool response',type=>{
    const image=Buffer.from('actual png')
    const original=[{role:'tool',content:[{type:'tool-result',toolCallId:'real-sdk',toolName:'browser_tool',output:{type:'content',value:[{type:'text',text:'实际来源证据'},{type,data:image.toString('base64'),mediaType:'image/png'}]}}]}]
    const prompt=browserChatPrompt(original) as {role:string;content:unknown[]}[]
    expect(prompt[0]).toMatchObject({role:'tool',content:[{toolCallId:'real-sdk',toolName:'browser_tool',output:{type:'content',value:[{type:'text',text:'实际来源证据'},{type:'text'}]}}]})
    expect(prompt[1]).toMatchObject({role:'user',content:[{type:'text'},{type:'file',mediaType:'image/png',data:image}]})
    expect(JSON.stringify(prompt[0])).not.toContain(image.toString('base64'))
    expect(original[0]!.content[0]!.output.value).toHaveLength(2)
    expect(browserChatPrompt([{role:'user',content:[{type:'text',text:'真实用户请求'}]}])).toEqual([{role:'user',content:[{type:'text',text:'真实用户请求'}]}])
  })
  it('transports the actual SDK-normalized screenshot as an image_url PNG to the subsequent HTTP model request and redacts it from Trace',async()=>{
    const {root,store,agent,work}=await fixture(),requests:{messages:{role:string;content:unknown;tool_call_id?:string}[]}[]=[],traces:TraceSpan[]=[]
    const image=Buffer.from('actual-browser-png-http-boundary'),data=image.toString('base64'),execute=vi.fn(async()=>({result:{output:'真实页面截图',appendReleaseHint:false,image:{data,mimeType:'image/png',sizeBytes:image.length}},source:page}))
    const server=createServer(async(request,response)=>{
      let raw='';for await(const part of request)raw+=part
      requests.push(JSON.parse(raw));const index=requests.length-1
      response.writeHead(200,{'Content-Type':'text/event-stream'})
      const emit=(delta:unknown,finish_reason:string|null=null)=>response.write(`data: ${JSON.stringify({id:`screenshot-${index}`,object:'chat.completion.chunk',choices:[{index:0,delta,finish_reason}]})}\n\n`)
      emit({role:'assistant'})
      if(!index) {emit({tool_calls:[{index:0,id:'actual-browser-call',type:'function',function:{name:'browser_tool',arguments:JSON.stringify({command:'screenshot --png'})}}]});emit({},'tool_calls')}
      else {emit({content:'实际截图核对完成'});emit({},'stop')}
      response.end('data: [DONE]\n\n')
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})
    const conversation={...(await store.load<Conversation>('conversations'))[0]!,workspacePath:join(root,'shared')},runPath=join(root,'sessions','chat','runs','run')
    const context:EngineContext={agent,conversation,work,connection:{id:'connection',name:'实际截图协议',provider:'openai-compatible',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,defaultModel:'fixture',hasApiKey:false},apiKey:'',messages:[{id:'request',conversationId:'chat',senderType:'user',senderId:'user',senderName:'本人',content:'读取本次页面截图',status:'completed',sequence:1,createdAt:new Date().toISOString()}],resources:[],runId:'run',signal:new AbortController().signal,responseKind:'task',workspace:{root:join(root,'sessions','chat'),workPath:join(root,'sessions','chat','work'),runPath,sharedPath:conversation.workspacePath},browserSession:{execute,drain:vi.fn(async()=>undefined)} as unknown as BrowserSession,onTrace:async span=>{traces.push(span)},onDelta:async()=>{},onTool:async()=>{},onAdditionalModelCall:async()=>{},approveCommand:async()=>false}
    await new MastraEngine().run(context)
    expect(execute).toHaveBeenCalledExactlyOnceWith('screenshot --png','actual-browser-call')
    expect(requests).toHaveLength(2)
    const followup=requests[1]!.messages
    expect(followup.some(message=>message.role==='user' && Array.isArray(message.content) && message.content.some(part=>part.type==='image_url' && part.image_url?.url===`data:image/png;base64,${data}`))).toBe(true)
    const tool=followup.find(message=>message.role==='tool')!
    expect(tool.tool_call_id).toBe('actual-browser-call');expect(JSON.stringify(tool.content)).toContain('真实页面截图');expect(JSON.stringify(tool.content)).not.toContain(data)
    const trace=JSON.stringify(traces);expect(trace).not.toContain(data);expect(trace).toContain('sha256')
  })
  it('only original explicit HTTP URLs grant origins, never malformed credentials or page content',()=>{
    expect(browserRequestOrigins('请读取 https://example.test/a 和 https://user:pass@private.test/')).toEqual(['https://example.test'])
  })
})
describe('browser receipt authority shares the original SQLite Work transaction',()=>{
  it('prepares without effects, starts and confirms the same original effect atomically',async()=>{
    const {repository,envelope,store,lease}=await fixture()
    await repository.prepare(envelope(),true)
    expect((await store.load<WorkExecution>('workExecutions'))[0].pendingEffects).toBeUndefined()
    await repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId})
    expect((await store.load<WorkExecution>('workExecutions'))[0].pendingEffects).toBe(1)
    await repository.finish(lease,{actionId:'action',generation:lease.generation,status:'completed',result:{output:'读到真实页面',appendReleaseHint:true},source:{...page,scopeKey:lease.scopeKey}})
    expect((await store.load<WorkExecution>('workExecutions'))[0].pendingEffects).toBe(0)
    expect((await repository.prepare(envelope(),true)).fresh).toBe(false)
    await expect(repository.prepare({...envelope(),argumentHash:'different'},true)).rejects.toThrow('不同参数')
  })
  it('confirms a Main-proven zero-BPF cancellation even when the start handshake already marked an effect',async()=>{
    const {repository,envelope,store,lease}=await fixture();await repository.prepare(envelope(),true)
    await repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId})
    await repository.finish(lease,{actionId:'action',generation:lease.generation,status:'cancelled_before_start',error:'页面在第一 BPF 前变化，零调用'})
    expect((await store.load<WorkExecution>('workExecutions'))[0].pendingEffects).toBe(0)
    expect((await repository.get('action'))?.status).toBe('cancelled_before_start')
  })
  it('projects at most the latest 20 actual source rows for this run before reading historical private payloads',async()=>{
    const {repository,store}=await fixture()
    await store.write(Array.from({length:65},(_,index)=>({collection:'browserEvidence',id:`source-${index}`,value:{id:`source-${index}`,runId:index<30?'other':'run',...page,url:`https://example.test/${index}`,privateBody:'不可投影的网页正文'}})))
    const all=vi.spyOn(store,'load');const sources=await repository.sourcesForRun('run')
    expect(sources).toHaveLength(20);expect(sources[0]?.url).toBe('https://example.test/45');expect(sources.at(-1)?.url).toBe('https://example.test/64')
    expect(all).not.toHaveBeenCalled();expect(JSON.stringify(sources)).not.toContain('不可投影')
  })
  it('rolls back the receipt and effect marker together when persistence fails',async()=>{
    const {root,repository,envelope,store,lease}=await fixture();await repository.prepare(envelope(),true)
    const client=createClient({url:pathToFileURL(join(root,'boai.sqlite')).href});cleanup.push(async()=>client.close())
    await client.execute("CREATE TRIGGER fail_browser_start BEFORE INSERT ON records WHEN NEW.collection='workExecutions' AND json_extract(NEW.value,'$.pendingEffects')=1 BEGIN SELECT RAISE(ABORT,'browser start blocked'); END")
    await expect(repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId})).rejects.toThrow()
    expect((await repository.get('action'))?.status).toBe('prepared')
    expect((await store.load<WorkExecution>('workExecutions'))[0].pendingEffects).toBeUndefined()
  })
  it('keeps unknown effects frozen across new SDK IDs and restart without calls',async()=>{
    const {repository,envelope,store,lease}=await fixture();await repository.prepare(envelope(),true)
    await repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId})
    await repository.finish(lease,{actionId:'action',generation:lease.generation,status:'unknown'})
    await expect(repository.prepare({...envelope(),actionId:'different-sdk-id',toolCallId:'new'},true)).rejects.toThrow('未核对')
    await repository.recover();expect((await repository.get('action'))?.status).toBe('unknown')
    expect((await store.load<WorkExecution>('workExecutions'))[0].pendingEffects).toBe(1)
  })
  it('rejects revoked configuration and stale clearing epoch before the real start',async()=>{
    const {repository,envelope,store,lease,agent}=await fixture();await repository.prepare(envelope(),true)
    await store.write([{collection:'agents',id:agent.id,value:{...agent,allowBrowser:false,configVersion:2}}])
    await expect(repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId})).rejects.toThrow('授权已变化')
    expect((await repository.get('action'))?.status).toBe('prepared')
    await store.write([{collection:'agents',id:agent.id,value:agent},{collection:'conversationCompletionClocks',id:'chat',value:{id:'chat',epoch:2}}])
    await expect(repository.prepare({...envelope(),actionId:'new'},true)).rejects.toThrow('授权已变化')
  })
  it('records a late confirmed result only in the original cancelled execution',async()=>{
    const {repository,envelope,store,lease,works}=await fixture();await repository.prepare(envelope(),true)
    await repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId})
    await works.release(lease.runId,'cancelled')
    await repository.finish(lease,{actionId:'action',generation:lease.generation,status:'completed',result:{output:'已实际完成',appendReleaseHint:true}})
    const execution=(await store.load<WorkExecution>('workExecutions'))[0];expect(execution).toMatchObject({id:'run',status:'released',pendingEffects:0})
    expect((await works.view('chat')).workItems[0]).toMatchObject({status:'cancelled',requiresReview:true})
    await expect(repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId})).rejects.toThrow('执行权')
  })
})
describe('per-run browser session actual exit and no replay',()=>{
  it('rejects before acquire and returns duplicate real screenshot from readonly lookup without reexecution',async()=>{
    const {repository,lease}=await fixture();let calls=0;const done=new Map<string,BrowserActionReply>()
    const bridge=host(async(method,input)=>{
      if(method==='inspect')return {...page,scopeKey:lease.scopeKey}
      if(method==='lookup')return done.get((input as {actionId:string}).actionId) ?? null
      if(method==='executeSingle'){calls++;const envelope=input as BrowserActionEnvelope;await repository.start({actionId:envelope.actionId,generation:lease.generation,runId:lease.runId,workId:lease.workId});const reply:BrowserActionReply={actionId:envelope.actionId,generation:lease.generation,status:'completed',result:{output:'截图',appendReleaseHint:true,image:{data:'eA==',mimeType:'image/png',sizeBytes:1}},source:{...page,scopeKey:lease.scopeKey}};done.set(envelope.actionId,reply);return reply}
      if(method==='drain')return {drained:true}
    })
    const session=new BrowserSession(lease,bridge,repository,{signal:new AbortController().signal,originalRequest:'https://example.test/',validate:async()=>{},approve:async()=>true})
    await expect(session.execute('snapshot; close','batch')).rejects.toThrow('批处理');expect(calls).toBe(0)
    const first=await session.execute('screenshot --png','sdk-image');expect((await session.execute('screenshot --png','sdk-image')).result?.image).toEqual(first.result?.image);expect(calls).toBe(1)
    const stored=JSON.stringify(await repository.get(first.actionId));expect(stored).not.toContain('eA==');expect(stored).toContain('sha256')
    await session.drain()
  })
  it('freezes current page and exact entered text, and refuses a denied interaction before acceptance',async()=>{
    const {repository,lease,store}=await fixture();const approve=vi.fn(async(_command:string)=>false);const execute=vi.fn()
    const bridge=host(async(method)=>method==='inspect'?{...page,scopeKey:lease.scopeKey}:method==='executeSingle'?execute():method==='drain'?{drained:true}:undefined)
    const session=new BrowserSession(lease,bridge,repository,{signal:new AbortController().signal,originalRequest:'https://example.test/',validate:async()=>{},approve})
    await expect(session.execute('fill @e2 "指定文字"','fill-call')).rejects.toThrow('拒绝')
    expect(approve).toHaveBeenCalledWith(expect.stringContaining('page1'));expect(approve.mock.calls[0]?.[0]).toContain('指定文字')
    expect(execute).not.toHaveBeenCalled();expect(await store.load('browserActions')).toHaveLength(0)
    await session.drain()
  })
  it('registers cleanup ownership before a window can be acquired, even if no action is accepted',async()=>{
    const {repository,lease,store}=await fixture();let scopeSeen=false
    const bridge=host(async(method)=>{if(method==='acquire'){scopeSeen=(await repository.scopes()).some(scope=>scope.scopeKey===lease.scopeKey);throw new Error('窗口准备失败')}})
    const session=new BrowserSession(lease,bridge,repository,{signal:new AbortController().signal,originalRequest:'https://example.test/',validate:async()=>{},approve:async()=>true})
    await expect(session.execute('snapshot','first')).rejects.toThrow('窗口准备失败')
    expect(scopeSeen).toBe(true);expect(await store.load('browserActions')).toHaveLength(0)
    await session.drain()
  })
  it('does not reinterpret a previous failed receipt as success or execute it again',async()=>{
    const {repository,lease}=await fixture();let executions=0
    const bridge=host(async(method,input)=>{
      if(method==='inspect')return {...page,scopeKey:lease.scopeKey}
      if(method==='executeSingle'){executions++;const envelope=input as BrowserActionEnvelope;return {actionId:envelope.actionId,generation:lease.generation,status:'cancelled_before_start',error:'实际尚未执行'} satisfies BrowserActionReply}
      if(method==='lookup')return null
      if(method==='drain')return {drained:true}
    })
    const session=new BrowserSession(lease,bridge,repository,{signal:new AbortController().signal,originalRequest:'https://example.test/',validate:async()=>{},approve:async()=>true})
    await expect(session.execute('snapshot','sdk-old')).rejects.toThrow('实际尚未执行')
    await expect(session.execute('snapshot','sdk-old')).rejects.toThrow('实际尚未执行');expect(executions).toBe(1)
    await session.drain()
  })
  it('parks the original SDK step on takeover, drains its old command, then resumes with a new lease and fresh snapshot without replay',async()=>{
    const {repository,lease,store}=await fixture();const started=deferred<void>(),finished=deferred<void>();let executions=0;const generations:string[]=[]
    const bridge=host(async(method,input)=>{
      if(method==='acquire'){generations.push((input as BrowserLease).generation);return}
      if(method==='inspect')return {...page,scopeKey:lease.scopeKey}
      if(method==='executeSingle'){
        executions++;const envelope=input as BrowserActionEnvelope
        await repository.start({actionId:envelope.actionId,generation:envelope.lease.generation,runId:lease.runId,workId:lease.workId});started.resolve();await finished.promise
        return {actionId:envelope.actionId,generation:envelope.lease.generation,status:'completed',result:{output:'原动作已经实际完成',appendReleaseHint:true},source:{...page,generation:envelope.lease.generation,scopeKey:lease.scopeKey}} satisfies BrowserActionReply
      }
      if(method==='drain'){finished.resolve();return {drained:true}}
      if(method==='resumeSnapshot')return {source:{...page,scopeKey:lease.scopeKey,generation:(input as BrowserLease).generation,pageVersion:'fresh-page'},output:'@e7 新页面目标'}
    })
    const controller=new AbortController(),session=new BrowserSession(lease,bridge,repository,{signal:controller.signal,originalRequest:'https://example.test/',validate:async()=>{},approve:async()=>true})
    let settled=false;const action=session.execute('snapshot','sdk-original').then(reply=>{settled=true;return reply});await started.promise
    await session.pause();await Promise.resolve();expect(settled).toBe(false);expect(controller.signal.aborted).toBe(false)
    await repository.authorizeResume(lease);await session.resume('new-generation')
    const reply=await action;expect(reply.source?.generation).toBe('generation');expect(reply.result?.output).toContain('@e7 新页面目标');expect(reply.result?.output).toContain('fresh-page')
    expect(generations).toEqual(['generation','new-generation']);expect(executions).toBe(1)
    const original=(await store.load<{lease:BrowserLease}>('browserActions'))[0];expect(original.lease.generation).toBe('generation')
    await session.drain()
  })
  it('parks a completed security release after the Main command settles, and resumes without reexecuting that command',async()=>{
    const {repository,lease}=await fixture();const released=deferred<void>(),controls:string[]=[];let executions=0
    const bridge=host(async(method,input)=>{
      if(method==='inspect')return {...page,scopeKey:lease.scopeKey}
      if(method==='executeSingle'){executions++;const envelope=input as BrowserActionEnvelope;await repository.start({actionId:envelope.actionId,generation:envelope.lease.generation,runId:lease.runId,workId:lease.workId});return {actionId:envelope.actionId,generation:envelope.lease.generation,status:'completed',needsUserControl:true,result:{output:'网页需要人工验证，已真实释放控制',appendReleaseHint:false}} satisfies BrowserActionReply}
      if(method==='drain')return {drained:true}
      if(method==='userControl'){controls.push((input as {action:string}).action);released.resolve();return}
      if(method==='resumeSnapshot')return {source:{...page,scopeKey:lease.scopeKey,generation:(input as BrowserLease).generation},output:'当前验证后的真实页面'}
    })
    const session=new BrowserSession(lease,bridge,repository,{signal:new AbortController().signal,originalRequest:'https://example.test/',validate:async()=>{},approve:async()=>true})
    let settled=false;const action=session.execute('release','sdk-release').then(reply=>{settled=true;return reply});await released.promise
    expect(settled).toBe(false);expect(controls).toEqual(['take']);await repository.authorizeResume(lease);await session.resume('after-challenge')
    expect((await action).result?.output).toContain('当前验证后的真实页面');expect(executions).toBe(1)
    await session.drain()
  })
  it('does not let resume unlock an unknown mutating action or manufacture a fresh budget',async()=>{
    const {repository,envelope,lease,works}=await fixture();await repository.prepare(envelope(),true)
    await repository.start({actionId:'action',generation:lease.generation,runId:lease.runId,workId:lease.workId});await repository.finish(lease,{actionId:'action',generation:lease.generation,status:'unknown'})
    const before=(await works.view('chat')).workBudgets
    await expect(repository.authorizeResume(lease)).rejects.toThrow('待核对')
    expect((await works.view('chat')).workBudgets).toEqual(before)
  })
  it('does not release an aborted lease until late acquire and the whole Main action really exit',async()=>{
    const {repository,lease}=await fixture();const acquire=deferred<void>(),drained=deferred<{drained:true}>();const drainStarted=deferred<void>(),acquireStarted=deferred<void>()
    const bridge=host(async(method)=>{if(method==='acquire'){acquireStarted.resolve();return acquire.promise}if(method==='drain'){drainStarted.resolve();return drained.promise}})
    const controller=new AbortController();const session=new BrowserSession(lease,bridge,repository,{signal:controller.signal,originalRequest:'https://example.test/',validate:async()=>{},approve:async()=>true})
    const action=session.execute('snapshot','snapshot-call');const rejected=expect(action).rejects.toThrow();await acquireStarted.promise;controller.abort()
    let stopped=false;const stop=session.drain().then(()=>{stopped=true});await Promise.resolve();expect(stopped).toBe(false)
    acquire.resolve();await drainStarted.promise;expect(stopped).toBe(false);drained.resolve({drained:true});await stop;await rejected
  })
})

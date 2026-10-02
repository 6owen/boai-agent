/*
 * [INPUT]: 真实 AppService/SQLite 员工会话授权与只投影浏览器窗口的宿主替身。
 * [OUTPUT]: 旧 false/缺字段的受支持员工无需开启即可开窗；停用、非成员与伪造运行身份仍零宿主调用。
 * [OUTPUT]: 无任务人工开窗先登记清理归属、零模型/Work/Run、明确员工/会话/代际权限与清理闭环。
 * [POS]: 手动浏览器产品 RPC 回归；真实窗口由 host 与 Electron BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { Connection, Conversation, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { BrowserHostBridge, BrowserHostMethods, BrowserManualOpenRequest, BrowserWindowState } from '../src/shared/ipc/browser'
const cleanup:(()=>Promise<unknown>)[]=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
async function setup() {
  const root=await mkdtemp(join(tmpdir(),'boai-manual-browser-'));cleanup.push(()=>rm(root,{recursive:true,force:true}))
  const store=new ProductStore(join(root,'boai.sqlite'));await store.init();cleanup.push(()=>store.close())
  const model=vi.fn(async()=>{}),calls:{method:keyof BrowserHostMethods;input:unknown}[]=[]
  const states=new Map<string,BrowserWindowState>()
  const handler=async(method:keyof BrowserHostMethods,input:unknown)=>{
    calls.push({method,input})
    if(method==='manualOpen'){
      const owner=input as BrowserManualOpenRequest
      expect((await store.load<{scopeKey:string}>('browserScopes')).some(scope=>scope.scopeKey===owner.scopeKey)).toBe(true)
      const state=states.get(owner.scopeKey) ?? {...owner,instanceId:'manual-'+owner.scopeKey,generation:'',revision:1,pageVersion:'blank',url:'about:blank',title:'空白页',isLoading:false,isVisible:true,toolbarReady:true,control:'user-controlled' as const}
      states.set(owner.scopeKey,state);return state
    }
    if(method==='list')return [...states.values()]
    if(method==='clearScope'){states.delete((input as {scopeKey:string}).scopeKey);return {cleared:true}}
  }
  const host:BrowserHostBridge={request:handler as BrowserHostBridge['request']}
  const service=new AppService({dataPath:root,browserHost:host,engine:{run:model,test:async()=>''},secrets:{get:async()=>'',set:async()=>{},delete:async()=>{}},emit:()=>{}});await service.init();cleanup.push(()=>service.close())
  const connection=await service.handle('saveConnection',{name:'配置',provider:'openai-compatible',baseUrl:'http://localhost',defaultModel:'fixture'}) as Connection
  const snapshot=await service.handle('snapshot',undefined) as Snapshot
  for(const agent of snapshot.agents){const {workspaceRef:_,configVersion:_v,memoryNamespace:_n,policyVersion:_p,...input}=agent;await service.handle('saveAgent',{...input,connectionId:connection.id,modelId:'fixture',allowBrowser:agent.id==='researcher'})}
  const chat=await service.handle('createConversation',{kind:'direct',title:'手动查看',agentIds:['researcher']}) as Conversation
  return {store,service,calls,model,chat}
}
test('opens an empty browser under saved employee and conversation authority without creating business execution',async()=>{
  const {service,store,calls,model,chat}=await setup()
  const input={agentId:'researcher',conversationId:chat.id}
  const first=await service.handle('openBrowser',input) as BrowserWindowState
  const again=await service.handle('openBrowser',input) as BrowserWindowState
  expect(again.instanceId).toBe(first.instanceId);expect(first.control).toBe('user-controlled')
  expect(calls.filter(call=>call.method==='manualOpen').at(-1)?.input).not.toHaveProperty('workId')
  expect(calls.filter(call=>call.method==='manualOpen').at(-1)?.input).not.toHaveProperty('downloadDirectory')
  expect(model).not.toHaveBeenCalled()
  for(const collection of ['runs','workItems','workExecutions','workBudgets','browserActions'])expect(await store.load(collection)).toEqual([])
  await service.handle('clearConversationHistory',{id:chat.id,hide:false})
  expect(await store.load('browserScopes')).toEqual([])
  expect(calls.some(call=>call.method==='clearScope')).toBe(true)
  const next=await service.handle('openBrowser',input) as BrowserWindowState
  expect(next.scopeEpoch).toBe(first.scopeEpoch+1);expect(next.scopeKey).not.toBe(first.scopeKey)
  expect(model).not.toHaveBeenCalled()
})
test.each([false,undefined])('opens a supported employee browser without an opt-in even when legacy saved allowBrowser is %s',async allowBrowser=>{
  const {service,store,calls,model}=await setup()
  const writer=(await store.load<DigitalAgent>('agents')).find(agent=>agent.id==='writer')!
  const legacy={...writer,allowBrowser};if(allowBrowser===undefined)delete legacy.allowBrowser
  await store.write([{collection:'agents',id:writer.id,value:legacy}])
  const chat=await service.handle('createConversation',{kind:'direct',title:'默认浏览器',agentIds:['writer']}) as Conversation
  const state=await service.handle('openBrowser',{agentId:'writer',conversationId:chat.id}) as BrowserWindowState
  expect(state.agentId).toBe('writer');expect(calls.filter(call=>call.method==='manualOpen')).toHaveLength(1)
  expect(model).not.toHaveBeenCalled();expect(await store.load('workItems')).toEqual([])
})
test('rejects nonmembers, inactive employees and renderer-provided runtime authority before opening a host window',async()=>{
  const {service,calls,chat}=await setup()
  await expect(service.handle('openBrowser',{agentId:'writer',conversationId:chat.id})).rejects.toThrow('不属于')
  const disabled=await service.handle('createConversation',{kind:'direct',title:'停用员工',agentIds:['writer']}) as Conversation
  const writer=(await service.handle('snapshot',undefined) as Snapshot).agents.find(agent=>agent.id==='writer')!
  const {workspaceRef:_,configVersion:_v,memoryNamespace:_n,policyVersion:_p,...input}=writer
  await service.handle('saveAgent',{...input,active:false})
  await expect(service.handle('openBrowser',{agentId:'writer',conversationId:disabled.id})).rejects.toThrow('启用')
  await expect(service.handle('openBrowser',{agentId:'researcher',conversationId:chat.id,runId:'invented'})).rejects.toThrow()
  expect(calls.filter(call=>call.method==='manualOpen')).toEqual([])
})

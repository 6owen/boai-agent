/*
 * [INPUT]: 真实 AppService/SQLite 与项目内置浏览器宿主替身。
 * [OUTPUT]: 应用统一开窗与列表、人工开窗零业务记录；业务清理只移除工具证据和hash匹配下载，不关闭或清除内置浏览器登录。
 * [POS]: 内置浏览器产品 RPC 回归；真实窗口由 host 与 Electron BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { AgentRun, Conversation } from '../src/shared/domain'
import { APPLICATION_BROWSER_SCOPE, type BrowserHostBridge, type BrowserHostMethods, type BrowserWindowState } from '../src/shared/ipc/browser'
const cleanup:(()=>Promise<unknown>)[]=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
async function setup() {
  const root=await mkdtemp(join(tmpdir(),'boai-manual-browser-'));cleanup.push(()=>rm(root,{recursive:true,force:true}))
  const model=vi.fn(async()=>{}),calls:{method:keyof BrowserHostMethods;input:unknown}[]=[]
  let state:BrowserWindowState|undefined
  const handler=async(method:keyof BrowserHostMethods,input:unknown)=>{
    calls.push({method,input})
    if(method==='manualOpen'){
      expect(input).toEqual({})
      state??={scopeKey:APPLICATION_BROWSER_SCOPE,instanceId:'application-browser-window',revision:1,pageVersion:'blank',url:'about:blank',title:'空白页',isLoading:false,isVisible:true,toolbarReady:true,control:'user-controlled'}
      return state
    }
    if(method==='list')return state?[state]:[]
    if(method==='clearScope')throw new Error('业务清理不能销毁内置浏览器登录')
  }
  const host:BrowserHostBridge={request:handler as BrowserHostBridge['request']}
  const service=new AppService({dataPath:root,browserHost:host,engine:{run:model,test:async()=>''},secrets:{get:async()=>'',set:async()=>{},delete:async()=>{}},emit:()=>{}});await service.init();cleanup.push(()=>service.close())
  const store=(service as unknown as {store:ProductStore}).store
  return {root,store,service,calls,model}
}
test('opens the application browser and returns its global window without creating business records',async()=>{
  const {service,store,calls,model}=await setup()
  const first=await service.handle('openBrowser',{}) as BrowserWindowState
  expect(await service.handle('openBrowser',{})).toEqual(first)
  expect(await service.handle('getBrowserWindows',{})).toEqual([first])
  expect(calls.filter(call=>call.method==='manualOpen').every(call=>JSON.stringify(call.input)==='{}')).toBe(true)
  expect(model).not.toHaveBeenCalled()
  for(const collection of ['messages','runs','workItems','workExecutions','workBudgets','browserActions','browserScopes'])expect(await store.load(collection)).toEqual([])
  expect(first).not.toHaveProperty('agentId');expect(first).not.toHaveProperty('conversationId')
})
test('keeps the same application browser across clearing a chat and deleting an employee',async()=>{
  const {service,calls}=await setup(),first=await service.handle('openBrowser',{}) as BrowserWindowState
  const chat=await service.handle('createConversation',{kind:'direct',title:'业务记录',agentIds:['researcher']})as Conversation
  await service.handle('clearConversationHistory',{id:chat.id,hide:false})
  await service.handle('deleteAgent',{id:'researcher'})
  expect(await service.handle('getBrowserWindows',{})).toEqual([first])
  expect(await service.handle('openBrowser',{})).toEqual(first)
  expect(calls.some(call=>call.method==='clearScope'||call.method==='userControl')).toBe(false)
})
test('rejects business identities in the public application browser APIs',async()=>{
  const {service,calls}=await setup()
  await expect(service.handle('openBrowser',{agentId:'writer',conversationId:'chat'})).rejects.toThrow()
  await expect(service.handle('openBrowser',{runId:'invented'})).rejects.toThrow()
  await expect(service.handle('getBrowserWindows',{conversationId:'chat'})).rejects.toThrow()
  await expect(service.handle('browserControl',{action:'show',agentId:'writer'})).rejects.toThrow()
  expect(calls).toEqual([])
})
test.each([false,true])('cleans completed task download bytes by receipt hash while preserving changed originals (changed=%s)',async changed=>{
  const {service,store,root,calls}=await setup(),window=await service.handle('openBrowser',{})
  const chat=await service.handle('createConversation',{kind:'direct',title:'任务下载',agentIds:['researcher']})as Conversation
  const run:AgentRun={id:'download-run',agentId:'researcher',agentName:'研究员',conversationId:chat.id,triggerMessageId:'source',messageId:'result',status:'completed',createdAt:new Date().toISOString(),toolEvents:[],browserDownloadIsolation:'isolated'}
  const directory=join(root,'browser-downloads',run.id),file=join(directory,'report.csv'),bytes=Buffer.from('downloaded private data')
  await mkdir(directory,{recursive:true});await writeFile(file,changed?'external changed data':bytes)
  const lease={scopeKey:APPLICATION_BROWSER_SCOPE,scopeEpoch:1,agentId:run.agentId,conversationId:chat.id,runId:run.id,workId:'work',generation:'original',configVersion:1,agentName:run.agentName,conversationTitle:chat.title,downloadDirectory:directory}
  const download={id:'download',path:file,name:'report.csv',size:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),url:'https://example.test/report',obtainedAt:new Date().toISOString()}
  await store.write([{collection:'runs',id:run.id,value:run},{collection:'browserScopes',id:run.id,value:{id:run.id,...lease}},{collection:'browserActions',id:'download-call',value:{id:'download-call',lease,status:'completed',argumentHash:'hash',reply:{actionId:'download-call',generation:lease.generation,status:'completed',downloads:[download]}}}])
  if(changed){
    await expect(service.handle('clearConversationHistory',{id:chat.id,hide:false})).rejects.toThrow('已保留')
    expect(await readFile(file,'utf8')).toBe('external changed data');expect(await store.load('browserCleanups')).toHaveLength(1)
  }else{
    await service.handle('clearConversationHistory',{id:chat.id,hide:false})
    await expect(access(file)).rejects.toThrow();expect(await store.load('browserScopes')).toEqual([])
  }
  expect(await service.handle('getBrowserWindows',{})).toEqual([window])
  expect(calls.some(call=>call.method==='clearScope'||call.method==='userControl')).toBe(false)
})

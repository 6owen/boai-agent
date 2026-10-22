/*
 * [OUTPUT]: 原生提问准备按真实changed事件观察当前请求，沿原15秒夹具期限；终态缺问题立即失败，避免默认短轮询竞态。
 * [OUTPUT]: 原生浏览器实际stdio/MCP媒体与只读到真实Work写入接线；协议夹具不冒充真实模型或Electron页面。
 * [INPUT]: 原生合同测试的后端选择与隔离生命周期。
 * [OUTPUT]: 生产AppService、独立程序副本/SQLite及真实stdio夹具，可保留系统路径别名。
 * [POS]: Codex/Claude共同测试设置，默认API父模型立即失败。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { expect } from 'vitest'
import { mkdtemp, readFile, rm, realpath, copyFile, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { AppService } from '../../src/runtime/service'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../../src/shared/domain'
export async function nativeFixture(runtime: 'codex' | 'claude', disposals: (()=>Promise<void>)[], apiEngine?: import('../../src/runtime/contracts').AgentEngine, canonicalRoot = true, browserHost?:import('../../src/shared/ipc/browser').BrowserHostBridge){
 const directory=await mkdtemp(join(tmpdir(),'boai-native-conversation-'))
 const root=canonicalRoot ? await realpath(directory) : directory
 const observers=new Set<()=>void>()
 const options={browserHost,dataPath:root,engine:apiEngine??{run:async()=>{throw Error('native employee must not invoke API engine')},test:async()=>''},secrets:{get:async()=>undefined,set:async()=>{},delete:async()=>{}},emit:()=>{for(const observe of observers)observe()}}
 let service=new AppService(options);await service.init()
 disposals.push(async()=>{await service.close();await rm(root,{recursive:true,force:true})})
 const executable=join(root,runtime+'.mjs')
 await copyFile(resolve(runtime === 'codex' ? 'tests/fixtures/native-conversation.mjs' : 'tests/fixtures/native-claude-conversation.mjs'),executable);await chmod(executable,0o700);await copyFile(resolve('tests/fixtures/native-business.mjs'),join(root,'native-business.mjs'))
 const draft={name:'Native fixture',executable,args:[],protocol: runtime === 'codex' ? 'codex-app-server' : 'claude-cli',useExistingLogin:true,hostAccessAcknowledged:true}
 await service.handle('testLaunchProfileDraft',draft)
 const profile=await service.handle('saveLaunchProfile',draft) as LaunchProfile
 const agent=await service.handle('saveAgent',{name:'原生员工',role:'写作',instructions:'按消息完成工作',color:'#00AABB',connectionId:'',modelId:'',executionBackend:{kind:runtime === 'codex' ? 'codex-local' : 'claude-local',profileId:profile.id},skillIds:[],knowledgeIds:[],allowCommands:true,active:true}) as DigitalAgent
 const chat=await service.handle('createConversation',{kind:'direct',title:'原生合同',agentIds:[agent.id]}) as Conversation
 const detail=()=>service.handle('getConversation',{id:chat.id}) as Promise<ConversationDetail>
 const send=(content:string)=>service.handle('sendMessage',{conversationId:chat.id,content,mentionIds:[],requestId:crypto.randomUUID()}) as Promise<Message>
 const wait=async(message:Message)=>{let d:ConversationDetail|undefined;await expect.poll(async()=>{d=await detail();const runs=d.runs.filter(r=>r.triggerMessageId===message.id);return runs.length&&runs.every(r=>['completed','failed','cancelled','interrupted'].includes(r.status))},{timeout:15000}).toBeTruthy();return d!}
 const waitForMessages=(message:Message,ready:(detail:ConversationDetail)=>boolean)=>new Promise<ConversationDetail>((resolve,reject)=>{
  let settled=false,checking=false,dirty=false
  const finish=(value:ConversationDetail|Error)=>{if(settled)return;settled=true;clearTimeout(timer);observers.delete(observe);value instanceof Error?reject(value):resolve(value)}
  const timer=setTimeout(()=>finish(new Error('原生消息未在原夹具期限内就绪')),15000)
  const observe=()=>{dirty=true;if(!checking)void inspect()}
  const inspect=async()=>{
   checking=true
   try {
    while(dirty&&!settled){
     dirty=false
     const current=await service.handle('getConversation',{id:message.conversationId}) as ConversationDetail
     if(ready(current)){finish(current);break}
     const runs=current.runs.filter(run=>run.triggerMessageId===message.id)
     if(runs.length&&runs.every(run=>['completed','failed','cancelled','interrupted'].includes(run.status))){finish(new Error('当前原生执行已结束，但所需消息未就绪'));break}
    }
   }catch(error){finish(error instanceof Error?error:new Error(String(error)))}finally{checking=false}
  }
  observers.add(observe);observe()
 })
 return {root,executable,profile,agent,chat,send,wait,waitForMessages,detail,get service(){return service},restart:async(dataPath=root)=>{await service.close();service=new AppService({...options,dataPath});await service.init()}}
}

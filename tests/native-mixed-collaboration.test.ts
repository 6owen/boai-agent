/*
 * [INPUT]: 原生纠偏合同、生产调度与Mastra/API协议夹具。
 * [OUTPUT]: 本机/API双向委派与Codex/Claude混合群，独立员工和原共享账本；不是模型质量证据。
 * [POS]: 新原生路径混合协作回归，替代旧私有阶段计数断言。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { resolve } from 'node:path'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile } from '../src/shared/domain'
import { nativeFixture } from './fixtures/native-product'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
const cleanup:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
it.each(['codex','claude'] as const)('keeps %s and API employees independent in both delegation directions',async runtime=>{
 const calls:EngineContext[]=[]
 const account=async(ctx:EngineContext,phase:'decision'|'task'|'report'|'memory')=>{expect(ctx.agent.executionBackend?.kind).toBe('mastra-model');await ctx.onModelCallStarted?.(ctx.modelCallId!,phase);await ctx.onModelCallUsage?.(ctx.modelCallId!,{inputTokens:8,outputTokens:3,totalTokens:11})}
 const engine:AgentEngine={test:async()=>'',decide:async ctx=>{await account(ctx,'decision');const first=ctx.participation?.isFirstDecision&&!ctx.participation.hasRespondedInTurn;return {action:first?'reply':'pass',responseKind:'task',observedThroughSequence:ctx.participation!.observedThroughSequence,work:{key:'api-root',scope:'API主持协作',deliverable:'实际文件'}}},run:async ctx=>{
  await account(ctx,'task');calls.push(ctx)
  if(!ctx.work?.parentWorkId&&!ctx.work?.waitRevision){const other=ctx.members!.find(m=>m.id!==ctx.agent.id)!;const child=await ctx.delegateWork!({key:'native-child',scope:'NATIVE_PUBLISH 编写核查文件',deliverable:'child.md',ownerAgentId:other.id});await ctx.waitForWork!({dependencies:[{workId:child.id,resultVersion:1}],nextStep:'核对后汇总'});await ctx.onDelta('等待同事交付');return}
  if(ctx.work?.parentWorkId){const tools=await createTaskRuntime(ctx);try{const invoke={agent:{toolCallId:crypto.randomUUID()},abortSignal:ctx.signal} as never;await tools.tools.write_file.execute!({path:'self:/work/api-child.md',content:'# API同事的实际结果\n'},invoke);const result=await tools.tools.publish_artifact.execute!({path:'self:/work/api-child.md'},invoke) as any;await ctx.onWorkOutcome!({disposition:'delivered',summary:'已交付',evidence:[{kind:'artifact',reference:result.artifact.id}]})}finally{await tools.dispose()};await ctx.onDelta('API同事已交付');return}
  await ctx.onDelta('已完成汇总');await ctx.onWorkOutcome!({disposition:'delivered',summary:'已完成汇总',evidence:[{kind:'answer',reference:'已完成汇总'}]})
 },report:async(ctx,draft)=>{await account(ctx,'report');return{action:'publish',text:draft.text}},extractMemory:async ctx=>{await account(ctx,'memory');return[]}}
 const f=await nativeFixture(runtime,cleanup,engine)
 const connection=await f.service.handle('saveConnection',{name:'隔离API',provider:'openai-compatible',baseUrl:'http://127.0.0.1:9',defaultModel:'fixture'}) as {id:string}
 const api=await f.service.handle('saveAgent',{name:'API同事',role:'核查',instructions:'',color:'#123456',connectionId:connection.id,modelId:'fixture',skillIds:[],knowledgeIds:[],allowCommands:false,active:true,executionBackend:{kind:'mastra-model'}}) as DigitalAgent
 for(const lead of [f.agent,api]){
  const chat=await f.service.handle('createConversation',{kind:'group',title:'混合协作',agentIds:[f.agent.id,api.id]}) as Conversation
  await f.service.handle('sendMessage',{conversationId:chat.id,content:lead.id===f.agent.id?'NATIVE_DELEGATE':'API主持核查',mentionIds:[lead.id],requestId:crypto.randomUUID()})
  let detail:ConversationDetail|undefined
  try{await expect.poll(async()=>{detail=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return detail.workItems?.filter(w=>w.status==='delivered').length},{timeout:15000}).toBe(2)}catch(error){throw Error(JSON.stringify({error:String(error),detail}))}
  expect(new Set(detail!.workItems!.map(w=>w.budgetId)).size).toBe(1);expect(detail!.artifacts).toHaveLength(1);expect(detail!.runs.filter(r=>r.backend?.kind===runtime+'-local').every(r=>r.phase==='execution')).toBe(true)
 }
 expect(calls.length).toBeGreaterThan(0)
})
it('runs Codex and Claude as distinct native employees and resumes their own sessions',async()=>{
 const f=await nativeFixture('codex',cleanup),draft={name:'混合Claude',executable:resolve('tests/fixtures/native-claude-conversation.mjs'),args:[],protocol:'claude-cli',useExistingLogin:true,hostAccessAcknowledged:true}
 await f.service.handle('testLaunchProfileDraft',draft);const profile=await f.service.handle('saveLaunchProfile',draft) as LaunchProfile
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const claude=await f.service.handle('saveAgent',{...input,name:'Claude同事',executionBackend:{kind:'claude-local',profileId:profile.id}}) as DigitalAgent
 const chat=await f.service.handle('createConversation',{kind:'group',title:'双本机员工',agentIds:[f.agent.id,claude.id]}) as Conversation
 let detail:ConversationDetail|undefined
 for(let count=1;count<=2;count++){await f.service.handle('sendMessage',{conversationId:chat.id,content:'各自回复',mentionIds:[],requestId:crypto.randomUUID()});await expect.poll(async()=>{detail=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return detail.runs.filter(r=>r.status==='completed').length},{timeout:15000}).toBe(count*2)}
 for(const agent of [f.agent,claude])expect(new Set(detail!.runs.filter(r=>r.agentId===agent.id).map(r=>r.backend?.sessionId)).size).toBe(1)
 expect(new Set(detail!.runs.map(r=>r.backend?.sessionId)).size).toBe(2)
})

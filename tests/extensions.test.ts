/*
 * [INPUT]: 自动化与外部执行模块、领域类型和测试运行引擎。
 * [OUTPUT]: ACP受理回执跨重启/清理去重与精确停止实际退出；浏览器新旧暂存目录排除业务备份。
 * [OUTPUT]: 外部 Agent、自动化事务投递与显式独立工作报告的回归验证；受理边界用同一固定 Date 时刻隔离跨分钟干扰。
 * [POS]: tests/extensions.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { it, expect, afterEach, vi } from 'vitest'
import { mkdtemp, rm, cp, mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AgentEngine } from '../src/runtime/contracts'
import type { Snapshot, Connection, Conversation, DigitalAgent, ConversationDetail, LaunchProfile, AutomationsView, AutomationDefinition, AutomationOccurrence, Message, AgentRun } from '../src/shared/domain'
import { AppService } from '../src/runtime/service'
import { NativeSchedules, AUTOMATION_WORKFLOW } from '../src/runtime/modules/automations/native-schedules'
import { AutomationService, calendarSlot, automationCron } from '../src/runtime/modules/automations/automation-service'
const roots:string[]=[],services:AppService[]=[],natives:NativeSchedules[]=[]
afterEach(async()=>{for(const s of services.splice(0))await s.close();for(const n of natives.splice(0))await n.close();await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})))})
const engine:AgentEngine={test:async()=>'',report:async(_context,draft)=>({action:'publish',text:draft.text}),run:async c=>{await c.onDelta('automation result')},decide:async c=>({action:c.messages.some(m=>m.senderId===c.agent.id&&m.status==='completed')?'pass':'reply',responseKind:'task',work:{key:'fixture-'+c.agent.id,scope:'独立报告该员工的工作',deliverable:'该员工的报告'},observedThroughSequence:Math.max(...c.messages.map(m=>m.sequence))})}
async function setup(){const root=await mkdtemp(join(tmpdir(),'boai-extensions-'));roots.push(root);const make=async(path=join(root,'data'))=>{const s=new AppService({dataPath:path,engine,secrets:{get:async()=>undefined,set:async()=>{},delete:async()=>{}},emit:()=>{}});services.push(s);await s.init();return s};const service=await make();return {root,service,make}}
async function until(fn:()=>Promise<boolean>,ms=8000){const start=Date.now();while(!await fn()){if(Date.now()-start>ms)throw new Error('Timed out');await new Promise(r=>setTimeout(r,30))}}
async function employee(service:AppService,external?:LaunchProfile){const snapshot=await service.handle('snapshot',undefined) as Snapshot;const agent=snapshot.agents[0];const {configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=agent;let connectionId='';if(!external)connectionId=(await service.handle('saveConnection',{name:'test',provider:'openai-compatible',baseUrl:'http://127.0.0.1:1',defaultModel:'test'}) as Connection).id;await service.handle('saveAgent',{...input,connectionId,executionBackend:external?{kind:'acp-local',profileId:external.id}:{kind:'mastra-model'}});return await service.handle('createConversation',{kind:'direct',title:'test',agentIds:[agent.id]}) as Conversation}
async function profile(service:AppService){const p=await service.handle('saveLaunchProfile',{name:'ACP fixture',executable:process.execPath,args:[resolve('tests/fixtures/acp-agent.mjs')],useExistingLogin:false,hostAccessAcknowledged:true}) as LaunchProfile;expect(p.verified).toBeUndefined();return await service.handle('testLaunchProfile',{id:p.id}) as LaunchProfile}
it('external tasks need explicit entry, no BYOK, omit thoughts and use fresh sessions',async()=>{const {service}=await setup(),p=await profile(service),c=await employee(service,p);expect(p.verified?.version).toBe('1.0.0');await expect(service.handle('sendMessage',{conversationId:c.id,content:'hello',mentionIds:[],requestId:'hello'})).rejects.toThrow('显式任务');await expect(service.handle('createConversation',{kind:'group',title:'blocked',agentIds:c.agentIds})).rejects.toThrow('自主群聊');process.env.BOAI_SECRET_SENTINEL='secret';await service.handle('sendExternalTask',{conversationId:c.id,content:'complete task',requestId:'external-1'});await until(async()=>{const d=await service.handle('getConversation',{id:c.id})as ConversationDetail;return d.runs.every(r=>r.status==='completed')});const d=await service.handle('getConversation',{id:c.id})as ConversationDetail;expect(d.messages[1].content).toContain('KEY=absent');expect(JSON.stringify(d)).not.toContain('PRIVATE_THOUGHT');expect(d.runs[0].usage).toBeUndefined();expect(d.runs[0].backend?.externalInvocations).toBe(1);const files=await service.handle('listExternalFiles',{runId:d.runs[0].id})as {files:{relativePath:string}[]};expect(files.files[0].relativePath).toBe('report.txt');await expect(service.handle('publishExternalArtifact',{runId:d.runs[0].id,relativePath:'../../outside'})).rejects.toThrow();await service.handle('publishExternalArtifact',{runId:d.runs[0].id,relativePath:'report.txt'});expect(((await service.handle('getConversation',{id:c.id}))as ConversationDetail).artifacts).toHaveLength(1);await service.handle('sendExternalTask',{conversationId:c.id,content:'complete task',requestId:'external-1'});expect((await service.handle('getConversation',{id:c.id})as ConversationDetail).runs).toHaveLength(1);await service.handle('sendExternalTask',{conversationId:c.id,content:'another task',requestId:'external-2'});await until(async()=>{const d=await service.handle('getConversation',{id:c.id})as ConversationDetail;return d.runs.length===2&&d.runs.every(r=>r.status==='completed')});const sessions=((await service.handle('getConversation',{id:c.id}))as ConversationDetail).runs.map(r=>r.backend?.sessionId);expect(new Set(sessions).size).toBe(2);delete process.env.BOAI_SECRET_SENTINEL})
it('external permission denial and cancellation cannot publish late output',async()=>{const {service}=await setup(),p=await profile(service),c=await employee(service,p);await service.handle('sendExternalTask',{conversationId:c.id,content:'PERMISSION',requestId:'permission'});await until(async()=>((await service.handle('snapshot',undefined))as Snapshot).approvals.length===1);const approval=((await service.handle('snapshot',undefined))as Snapshot).approvals[0];await service.handle('approve',{id:approval.id,approved:false});await until(async()=>((await service.handle('getConversation',{id:c.id}))as ConversationDetail).runs[0].status==='failed');await service.handle('sendExternalTask',{conversationId:c.id,content:'WAIT_FOREVER',requestId:'cancel'});await service.handle('cancelRun',{conversationId:c.id});const d=await service.handle('getConversation',{id:c.id})as ConversationDetail;expect(d.runs[1].status).toBe('cancelled');expect(d.messages.filter(m=>m.senderType==='agent')).toHaveLength(0)})
it('native Mastra workflow schedules really dispatch the registered product wrapper',async()=>{const root=await mkdtemp(join(tmpdir(),'boai-native-schedule-'));roots.push(root);const calls:unknown[]=[];const n=new NativeSchedules(join(root,'native.sqlite'),async(...args)=>{calls.push(args)});natives.push(n);await n.init();await n.start();const s=await n.mastra.schedules.create({id:'boai-fixture',workflowId:AUTOMATION_WORKFLOW,cron:'0 9 * * *',timezone:'UTC',inputData:{automationId:'fixture',revision:1},status:'paused'});const fired=await n.mastra.schedules.run(s.id);await until(async()=>calls.length===1);expect(calls[0]).toEqual(['fixture',1,fired.claimId,fired.scheduledFireAt]);expect((await n.mastra.schedules.get(s.id))?.nextFireAt).toBe(s.nextFireAt);const due=Date.now()-1000;await(await n.storage.getStore('schedules'))!.updateSchedule(s.id,{status:'active',nextFireAt:due});await until(async()=>calls.length===2,15000);expect(calls[1]).toEqual(['fixture',1,`sched_${s.id}_${due}`,due]);expect((await n.mastra.schedules.get(s.id))!.nextFireAt).toBeGreaterThan(due)},20000)
it('automation claims once, labels origin, tracks results and pauses restored backups',async()=>{const {service,root,make}=await setup(),c=await employee(service);const d=await service.handle('saveAutomation',{name:'daily',prompt:'report',conversationId:c.id,frequency:'daily',time:'09:00',weekday:1,timezone:'Asia/Singapore',enabled:false,notify:false}) as AutomationDefinition;expect(d.sync).toBe('synced');const first=await service.handle('runAutomation',{id:d.id,requestId:'manual-1'})as AutomationOccurrence;const second=await service.handle('runAutomation',{id:d.id,requestId:'manual-1'})as AutomationOccurrence;expect(first.id).toBe(second.id);await until(async()=>((await service.handle('listAutomations',undefined))as AutomationsView).occurrences[0]?.status==='completed');const detail=await service.handle('getConversation',{id:c.id}) as ConversationDetail;expect(detail.messages[0].origin?.automationId).toBe(d.id);expect(detail.messages[0].senderName).toBe('定时任务 · daily');expect(detail.messages.filter(m=>m.senderType==='user')).toHaveLength(1);const view=await service.handle('listAutomations',undefined)as AutomationsView;expect(view.occurrences[0].resultMessageIds).toHaveLength(1);await service.handle('saveAutomation',{id:d.id,expectedRevision:d.revision,name:d.name,prompt:d.prompt,conversationId:d.conversationId,frequency:d.frequency,time:d.time,weekday:d.weekday,timezone:d.timezone,enabled:true,notify:false});await service.backup(join(root,'backup'));const restored=await make(join(root,'backup'));expect(((await restored.handle('listAutomations',undefined))as AutomationsView).definitions.every(d=>!d.enabled)).toBe(true)})
it('calendar keys deduplicate the repeated DST hour and daily/weekly cron is bounded',()=>{expect(calendarSlot(Date.parse('2026-11-01T05:30:00Z'),'America/New_York')).toBe(calendarSlot(Date.parse('2026-11-01T06:30:00Z'),'America/New_York'));expect(automationCron({frequency:'weekly',time:'09:30',weekday:1})).toBe('30 9 * * 1')})

it('records missed, stale, overlapping, and revoked occurrences without dispatching twice',async()=>{
 const root=await mkdtemp(join(tmpdir(),'boai-admission-'));roots.push(root);const store=new ProductStore(join(root,'boai.sqlite'));await store.init();let fingerprint='v1',dispatches=0
 const automation=new AutomationService(store,root,{critical:operation=>operation(),validate:()=>fingerprint,busy:()=>false,dispatch:async(d,o,origin,commit)=>{dispatches++;const message:import('../src/shared/domain').Message = {id:o.id,turnId:'turn-'+o.id,conversationId:o.conversationId,senderType:'user',senderId:'automation',senderName:d.name,content:d.prompt,status:'completed',sequence:dispatches,createdAt:new Date().toISOString(),origin};await commit(message,[]);return message},inspect:()=>undefined,cancel:async()=>{},changed:()=>{},notify:()=>{}})
 // Plan creation and its current admission share one calendar minute and effective time.
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-05T12:07:30.000Z'))
 try{await automation.init();const time=new Date().toISOString().slice(11,16);const d=await automation.save({name:'guarded',prompt:'report',conversationId:'direct',frequency:'daily',weekday:1,time,timezone:'UTC',enabled:true,notify:false});
 const missed=await automation.admit(d.id,d.revision,'schedule','missed',Date.now()-21*60_000);expect(missed.status).toBe('skipped');expect(missed.reason).toContain('补跑窗口');
 const first=await automation.run(d.id,'manual-once');expect(first.status).toBe('running');const overlap=await automation.admit(d.id,d.revision,'schedule','overlap',Date.now());expect(overlap.reason).toContain('并发');expect(dispatches).toBe(1);
 await automation.stop(first.id);fingerprint='v2';const revoked=await automation.run(d.id,'revoked');expect(revoked.reason).toContain('权限已变更');
 await automation.pause(d.id);const stale=await automation.admit(d.id,d.revision,'schedule','stale',Date.now()+60_000);expect(stale.reason).toContain('旧版本');expect(dispatches).toBe(1);expect((await automation.run(d.id,'manual-once')).id).toBe(first.id)
 }finally{try{await automation.close();await store.close()}finally{vi.useRealTimers()}}
})

it('group automation retains independent decisions and attributes both results to one occurrence',async()=>{const {service}=await setup();await employee(service);const snap=await service.handle('snapshot',undefined)as Snapshot,a=snap.agents.find(a=>a.id==='writer')!;const {configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=a;await service.handle('saveAgent',{...input,connectionId:snap.agents.find(a=>a.id==='researcher')!.connectionId});const c=await service.handle('createConversation',{kind:'group',title:'auto-group',agentIds:['researcher','writer']})as Conversation;const d=await service.handle('saveAutomation',{name:'group report',prompt:'collaborate',conversationId:c.id,frequency:'weekly',weekday:1,time:'09:00',timezone:'UTC',enabled:false,notify:false})as AutomationDefinition;await service.handle('runAutomation',{id:d.id,requestId:'group-once'});await until(async()=>((await service.handle('listAutomations',undefined))as AutomationsView).occurrences[0]?.status==='completed');const detail=await service.handle('getConversation',{id:c.id})as ConversationDetail;expect(new Set(detail.messages.filter(m=>m.senderType==='agent').map(m=>m.senderId))).toEqual(new Set(['researcher','writer']));const o=((await service.handle('listAutomations',undefined))as AutomationsView).occurrences[0];expect(o.resultMessageIds).toHaveLength(2);expect(new Set(detail.decisions?.map(d=>d.agentId))).toEqual(new Set(['researcher','writer']))})

it('reconciles an unobserved ACP acceptance after completion and restart without a second execution, and fences cleared requests',async()=>{
 const {service,make}=await setup(),p=await profile(service),c=await employee(service,p)
 const input={conversationId:c.id,content:'complete task',requestId:'lost-external-response'}
 expect(await service.handle('getExternalTaskReceipt',{conversationId:c.id,requestId:input.requestId})).toBeNull()
 // The caller intentionally drops the successful response after the real fixture was accepted.
 await service.handle('sendExternalTask',input)
 await until(async()=>(await service.handle('getConversation',{id:c.id})as ConversationDetail).runs.every(run=>run.status==='completed'))
 const accepted=await service.handle('getExternalTaskReceipt',{conversationId:c.id,requestId:input.requestId})as Message
 await service.close(); const restarted=await make()
 expect(await restarted.handle('getExternalTaskReceipt',{conversationId:c.id,requestId:input.requestId})).toEqual(accepted)
 expect(await restarted.handle('sendExternalTask',input)).toEqual(accepted)
 expect((await restarted.handle('getConversation',{id:c.id})as ConversationDetail).runs).toHaveLength(1)
 await expect(restarted.handle('sendExternalTask',{...input,content:'different'})).rejects.toThrow('requestId')
 await restarted.handle('clearConversationHistory',{id:c.id,hide:false})
 await expect(restarted.handle('getExternalTaskReceipt',{conversationId:c.id,requestId:input.requestId})).rejects.toThrow('清理')
 await expect(restarted.handle('sendExternalTask',input)).rejects.toThrow('清理')
 expect((await restarted.handle('getConversation',{id:c.id})as ConversationDetail).runs).toHaveLength(0)
})
it('upgrades a legacy ACP request before history cleanup so a lost response cannot replay afterward',async()=>{
 const {service,make}=await setup(),p=await profile(service),c=await employee(service,p),input={conversationId:c.id,content:'complete task',requestId:'legacy-external-response'}
 await service.handle('sendExternalTask',input)
 await until(async()=>(await service.handle('getConversation',{id:c.id})as ConversationDetail).runs.every(run=>run.status==='completed'))
 const store=(service as unknown as {store:ProductStore}).store
 await store.transaction(tx=>tx.remove('messageReceipts',input.requestId)); await service.close()
 const restarted=await make(); expect(await restarted.handle('getExternalTaskReceipt',{conversationId:c.id,requestId:input.requestId})).toBeTruthy()
 await restarted.handle('clearConversationHistory',{id:c.id,hide:false})
 await expect(restarted.handle('sendExternalTask',input)).rejects.toThrow('清理')
})
it('stops only the selected ACP run and returns after the external adapter actually exits',async()=>{
 const {service}=await setup(),p=await profile(service),c=await employee(service,p)
 await service.handle('sendExternalTask',{conversationId:c.id,content:'WAIT_FOREVER',requestId:'exact-cancel'})
 const first=(await service.handle('getConversation',{id:c.id})as ConversationDetail).runs[0]!
 await expect(service.handle('cancelRun',{conversationId:'missing',runId:first.id})).rejects.toThrow()
 await service.handle('cancelRun',{conversationId:c.id,runId:first.id})
 const runtime=service as unknown as {externalRuns:Map<string,unknown>;runControllers:Map<string,unknown>}
 expect(runtime.externalRuns.has(first.id)).toBe(false);expect(runtime.runControllers.has(first.id)).toBe(false)
 await service.handle('sendExternalTask',{conversationId:c.id,content:'WAIT_FOREVER',requestId:'next-task'})
 await service.handle('cancelRun',{conversationId:c.id,runId:first.id})
 const second=(await service.handle('getConversation',{id:c.id})as ConversationDetail).runs.find(run=>run.id!==first.id)!
 expect(second.status).toBe('running')
 await service.handle('cancelRun',{conversationId:c.id,runId:second.id})
 expect((await service.handle('getConversation',{id:c.id})as ConversationDetail).messages.filter(message=>message.senderType==='agent')).toHaveLength(0)
})
it('excludes unknown legacy browser run bytes and isolated staging from backups without broadening a malformed lease path',async()=>{
 const {root,service}=await setup(),c=await employee(service),store=(service as unknown as {store:ProductStore}).store,data=join(root,'data')
 const run=(id:string):AgentRun=>({id,conversationId:c.id,agentId:c.agentIds[0]!,agentName:'test',triggerMessageId:'trigger',messageId:'none',status:'interrupted',createdAt:new Date().toISOString(),toolEvents:[]})
 const legacy=run('legacy-browser'),safe=run('safe-run'),cleared={...run('cleared-browser'),toolEvents:[{id:'real-browser-tool',name:'browser_tool',status:'failed' as const,detail:'interrupted',createdAt:new Date().toISOString()}]}
 const directory=(r:AgentRun)=>join(data,'agents',r.agentId,'workspace','sessions',c.id,'runs',r.id)
 for(const r of [legacy,safe,cleared]){await mkdir(directory(r),{recursive:true});await writeFile(join(directory(r),'payload.bin'),'PRIVATE '+r.id)}
 const stage=join(data,'browser-downloads','staged');await mkdir(stage,{recursive:true});await writeFile(join(stage,'partial.pdf'),'PRIVATE NEW PARTIAL')
 await store.write([legacy,safe,cleared].map(value=>({collection:'runs',id:value.id,value})))
 await store.write([{collection:'browserActions',id:'legacy',value:{id:'legacy',lease:{runId:legacy.id,agentId:legacy.agentId,conversationId:c.id,downloadDirectory:directory(legacy)}}},{collection:'browserActions',id:'malformed',value:{id:'malformed',lease:{runId:safe.id,agentId:safe.agentId,conversationId:c.id,downloadDirectory:join(data,'agents')}}}])
 const backup=join(root,'browser-backup');await service.backup(backup)
 for(const r of [legacy,cleared]){await expect(access(join(backup,'agents',r.agentId,'workspace','sessions',c.id,'runs',r.id,'payload.bin'))).rejects.toThrow();expect(await readFile(join(directory(r),'payload.bin'),'utf8')).toBe('PRIVATE '+r.id)}
 expect(await readFile(join(backup,'agents',safe.agentId,'workspace','sessions',c.id,'runs',safe.id,'payload.bin'),'utf8')).toBe('PRIVATE safe-run')
 await expect(access(join(backup,'browser-downloads'))).rejects.toThrow()
 expect(JSON.parse(await readFile(join(backup,'backup.json'),'utf8')).excludedLegacyBrowserRuns).toHaveLength(2)
})

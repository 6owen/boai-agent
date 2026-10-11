/*
 * [INPUT]: 第13组原生员工规范和隔离stdio协议进程。
 * [OUTPUT]: 连续会话、真实文件登记、普通消息回答、权限拒绝与完整大输出；不把夹具视为真实模型评测。
 * [POS]: 生产AppService/本机驱动集成合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, realpath, writeFile, mkdir, copyFile, chmod, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { nativeFixture } from './fixtures/native-product'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../src/shared/domain'
import type { ExecutionEvidence, ExecutionEvidencePage, NativeAction } from '../src/shared/domain/execution'
const disposals: (()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of disposals.splice(0).reverse())await close()})
describe.each(['codex', 'claude'] as const)('%s 原生员工', runtime => {
const setup=()=>nativeFixture(runtime,disposals)

it('keeps native tools and a persistent session; no private decision/report/memory calls or restart replay',async()=>{
 const f=await setup();const first=await f.wait(await f.send('你好'));const second=await f.wait(await f.send('继续讨论'))
 expect(second.runs).toHaveLength(2);expect(second.runs.every(r=>r.phase==='execution'&&r.status==='completed'&&r.backend?.externalInvocations===1)).toBe(true)
 expect(new Set(second.runs.map(r=>r.backend?.sessionId)).size).toBe(1)
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 const calls=(await readFile(join(cwd,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(s))
 expect(calls.map(c=>c.method)).toEqual(['thread/start','thread/resume'])
 expect(calls[0].params).not.toHaveProperty('baseInstructions');expect(calls[0].params).not.toHaveProperty('tools');if(runtime === 'codex') {
  expect(calls[0].params.dynamicTools[0].tools.some((t:any)=>t.name==='publish_artifact')).toBe(true)
  expect(calls[0].params.dynamicTools[0].tools.find((t:any)=>t.name==='report_work').inputSchema.properties).not.toHaveProperty('userQuestion')
 }
 else { expect(calls[0].params.argv).toContain('--mcp-config'); expect(calls[0].params.argv).not.toContain('--tools') }
 const turns=(await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(JSON.parse(s).input[0].text))
 expect(turns[1].messages).toHaveLength(1);expect(turns[1].messages[0].content).toBe('继续讨论')
 await f.restart();expect((await f.detail()).runs).toHaveLength(second.runs.length)
 expect((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n')).toHaveLength(2)
 expect(first.workItems).toHaveLength(0)
})
it('publishes an actual file without a synthetic decision and deduplicates native tool requests',async()=>{
 const f=await setup(),d=await f.wait(await f.send('NATIVE_PUBLISH'))
 expect(d.runs[0].status,d.runs[0].error).toBe('completed');expect(d.artifacts).toHaveLength(1);expect(d.workItems).toHaveLength(1)
 expect(d.workItems![0].status).toBe('delivered');expect(d.runs).toHaveLength(1)
 expect(d.messages.find(m=>m.senderType==='agent')?.content).toBe('已交付文件')
})
it('answers a native clarification as a normal message in the same turn',async()=>{
 const f=await setup(),m=await f.send('NATIVE_QUESTION');let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.detail();return d.messages.some(m=>m.content==='这个文档针对什么产品？')},{timeout:15000}).toBe(true)
 await expect.poll(async()=>((await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId:d!.runs[0].id})) as NativeAction[]).some(a=>a.status==='pending')).toBe(true)
 await f.send('白噪音小程序');d=await f.wait(m)
 expect(d.runs).toHaveLength(1);expect(d.messages.some(m=>m.content==='收到普通聊天回复：白噪音小程序')).toBe(true)
})
it('refuses native operations when the user denies permission',async()=>{
 const f=await setup(),m=await f.send('NATIVE_APPROVAL');let runId='',action:NativeAction|undefined
 await expect.poll(async()=>{const d=await f.detail();runId=d.runs[0]?.id??'';if(!runId)return false;action=((await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}))as NativeAction[])[0];return action?.status},{timeout:15000}).toBe('pending')
 await f.service.handle('respondNativeAction',{conversationId:f.chat.id,runId,actionId:action!.id,response:{option:runtime === 'codex' ? 'decline' : 'deny'}})
 const d=await f.wait(m);expect(d.messages.some(m=>m.content==='已拒绝，未执行')).toBe(true)
 await expect(readFile(join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work','permission-marker'))).rejects.toThrow()
})
it('retains complete streamed output, unknown native extensions and excludes private thinking',async()=>{
 const f=await setup(),d=await f.wait(await f.send('NATIVE_LONG')),run=d.runs[0]
 expect(run.status,run.error).toBe('completed')
 const page=await f.service.handle('listExecutionEvidence',{conversationId:f.chat.id,runId:run.id}) as ExecutionEvidencePage
 expect(JSON.stringify(page)).not.toContain('private-reasoning');expect(page.items.some(e=>e.eventType==='runtime.native')).toBe(true)
 const big=page.items.find(e=>e.deferred)!;expect(big).toBeDefined()
 let text='',offset=0
 for(;;){const p=await f.service.handle('getExecutionContent',{conversationId:f.chat.id,runId:run.id,evidenceId:big.id,offset}) as {content:string;next?:number};text+=p.content;if(p.next===undefined)break;offset=p.next}
 const full=JSON.parse(text) as ExecutionEvidence
 expect(((full.payload as any).item.aggregatedOutput ?? (full.payload as any).item.result)).toBe('完整输出🌱'.repeat(30000));expect(full.canonical?.outcome).toBe('succeeded')
})
it('uses the ordinary revision message to publish the next fixed version and keeps original bytes',async()=>{
 const f=await setup(),first=await f.wait(await f.send('NATIVE_PUBLISH')),original=first.artifacts[0]
 const second=await f.wait(await f.send('NATIVE_REVISE 修改刚才文件'))
 expect(second.runs.every(r=>r.status==='completed')).toBe(true);expect(second.artifacts, JSON.stringify(second.messages.map(m=>m.content))).toHaveLength(2)
 const next=second.artifacts.find(a=>a.id!==original.id)!
 expect(next.logicalArtifactId).toBe(original.logicalArtifactId);expect(next.contentVersion).toBe(2)
 expect(second.workItems).toHaveLength(2);expect(second.artifacts.find(a=>a.id===original.id)?.contentHash).toBe(original.contentHash)
})
it('queues a new message while a native turn is active and stop releases the actual process before continuing',async()=>{
 const f=await setup(),first=await f.send('NATIVE_WAIT')
 let runId=''
 await expect.poll(async()=>{const d=await f.detail(),r=d.runs.find(r=>r.triggerMessageId===first.id);runId=r?.id??'';return r?.backend?.inputAccepted},{timeout:15000}).toBe(true)
 const next=await f.send('普通新消息')
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 expect((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n')).toHaveLength(1)
 await f.service.handle('stopNativeExecution',{conversationId:f.chat.id,runId})
 const d=await f.wait(next);expect(d.runs.find(r=>r.id===runId)?.status).toBe('cancelled');expect(d.runs.find(r=>r.triggerMessageId===next.id)?.status).toBe('completed')
})
it('uses distinct native sessions for employees in the same group without an API coordinator',async()=>{
 const f=await setup()
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const second=await f.service.handle('saveAgent',{...input,name:'第二位员工'}) as DigitalAgent
 const chat=await f.service.handle('createConversation',{kind:'group',title:'原生群',agentIds:[f.agent.id,second.id]}) as Conversation
 await f.service.handle('sendMessage',{conversationId:chat.id,content:'大家介绍自己',mentionIds:[],requestId:crypto.randomUUID()})
 let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs.filter(r=>r.status==='completed').length},{timeout:15000}).toBe(2)
 expect(d!.runs).toHaveLength(2);expect(new Set(d!.runs.map(r=>r.backend?.sessionId)).size).toBe(2)
 expect(d!.messages.filter(m=>m.senderType==='agent')).toHaveLength(2)
})

it('records a real text result without a private reporting model call',async()=>{
 const f=await setup(),d=await f.wait(await f.send('NATIVE_REPORT'))
 expect(d.runs[0].status,d.runs[0].error).toBe('completed');expect(d.workItems?.[0].status).toBe('delivered');expect(d.messages.some(m=>m.content==='原生核对完成')).toBe(true)
})
it.each(['CREATE','ONLY','EXEC'])('core employee organizes %s through native product tools and actual receipts',async mode=>{
 const f=await setup(),snapshot=await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot
 const core=snapshot.agents.find(a=>a.id==='bobo')!
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,systemRole,...input}=core
 await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,connectionId:'',modelId:'',executionBackend:f.agent.executionBackend})
 const chat=await f.service.handle('startCoreConversation',{requestId:crypto.randomUUID(),content:'NATIVE_ORG_'+mode}) as Conversation
 let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs.length&&d.runs.every(r=>['completed','failed'].includes(r.status))},{timeout:15000}).toBeTruthy()
 expect(d!.runs.map(r=>r.error)).toEqual([undefined]);expect(d!.workItems?.[0].status,JSON.stringify(d!.messages)).toBe('delivered')
 const after=await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot
 expect(after.agents.find(a=>a.name==='新核查员')?.executionBackend).toEqual(f.agent.executionBackend)
 if(mode!=='CREATE')expect(after.conversations.some(c=>c.title==='原生组织群')).toBe(true)
 await f.restart();expect((await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail).runs).toHaveLength(1)
})
it('inherits native execution when the core creates a named team',async()=>{
 const f=await setup(),snapshot=await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot
 const core=snapshot.agents.find(a=>a.id==='bobo')!
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,systemRole,...input}=core
 await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,connectionId:'',modelId:'',executionBackend:f.agent.executionBackend})
 const chat=await f.service.handle('startCoreConversation',{requestId:crypto.randomUUID(),team:{name:'用户团队名',requirements:'NATIVE_NAMED_TEAM'}}) as Conversation
 let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs.length&&d.runs.every(r=>['completed','failed'].includes(r.status))},{timeout:15000}).toBeTruthy()
 expect(d!.runs.map(r=>r.error)).toEqual([undefined]);expect(d!.workItems?.[0].status,JSON.stringify(d!.messages)).toBe('delivered')
 expect((await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot).conversations.some(c=>c.title==='用户团队名')).toBe(true)
})
it('delegates to a real employee and resumes only the parent on the original work budget',async()=>{
 const f=await setup(),{id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const child=await f.service.handle('saveAgent',{...input,name:'协作同事'}) as DigitalAgent
 const chat=await f.service.handle('createConversation',{kind:'group',title:'原生委派',agentIds:[f.agent.id,child.id]}) as Conversation
 await f.service.handle('sendMessage',{conversationId:chat.id,content:'NATIVE_DELEGATE',mentionIds:[f.agent.id],requestId:crypto.randomUUID()})
 let d:ConversationDetail|undefined
 try { await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.workItems?.filter(w=>w.status==='delivered').length},{timeout:15000}).toBe(2) } catch(error) { throw new Error(JSON.stringify({error:String(error),runs:d?.runs.map(r=>({id:r.id,status:r.status,error:r.error})),messages:d?.messages.map(m=>m.content),works:d?.workItems})) }
 expect(d!.runs.filter(r=>r.status==='failed').map(r=>r.error)).toEqual([]);expect(d!.runs).toHaveLength(3)
 expect(new Set(d!.workItems!.map(w=>w.budgetId)).size).toBe(1);expect(d!.artifacts).toHaveLength(1)
 await f.restart();expect((await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail).runs).toHaveLength(3)
})
it('runs automation with the real native backend and does not replay it after restart',async()=>{
 const f=await setup()
 const plan=await f.service.handle('saveAutomation',{name:'原生自动化',prompt:'NATIVE_PUBLISH',conversationPolicy:'new-conversation',employeeIds:[f.agent.id],frequency:'daily',time:'09:00',weekday:1,timezone:'UTC',enabled:false,notify:false}) as import('../src/shared/domain').AutomationDefinition
 const occurrence=await f.service.handle('runAutomation',{id:plan.id,requestId:crypto.randomUUID()}) as import('../src/shared/domain').AutomationOccurrence
 let result:import('../src/shared/domain').AutomationOccurrence|undefined
 await expect.poll(async()=>{result=await f.service.handle('getAutomationOccurrence',{id:occurrence.id}) as typeof result;return result?.status},{timeout:15000}).toBe('completed')
 const d=await f.service.handle('getConversation',{id:result!.conversationId!}) as ConversationDetail
 expect(d.artifacts,JSON.stringify(d)).toHaveLength(1);expect(d.runs.filter(r=>r.phase==='execution')).toHaveLength(1)
 await f.restart();expect((await f.service.handle('getConversation',{id:result!.conversationId!}) as ConversationDetail).runs).toHaveLength(d.runs.length)
})

it('clears native sessions, execution evidence and pending interaction without replaying history',async()=>{
 const f=await setup(),d=await f.wait(await f.send('普通交流'))
 await f.service.handle('clearConversationHistory',{id:f.chat.id,hide:false})
 const cleared=await f.detail();expect(cleared.messages).toHaveLength(0);expect(cleared.runs).toHaveLength(0)
 expect((await f.service.handle('listExecutionHistory',{conversationId:f.chat.id}) as any).items).toEqual([])
 await f.restart();expect((await f.detail()).runs).toHaveLength(0)
 const next=await f.wait(await f.send('明确新交流'));expect(next.runs[0].backend?.sessionId).not.toBe(d.runs[0].backend?.sessionId)
})
it('rejects changed executables before group admission or any native turn',async()=>{
 const f=await setup();await writeFile(f.executable,'\n// changed program',{flag:'a'})
 await expect(f.service.handle('createConversation',{kind:'group',title:'变更程序',agentIds:[f.agent.id]})).rejects.toThrow('程序已变化')
 const d=await f.wait(await f.send('不应启动'));expect(d.runs[0].status).toBe('failed');expect(d.runs[0].backend?.externalInvocations??0).toBe(0)
})
it('does not replay a pending approval after restart and rejects its stale response',async()=>{
 const f=await setup();await f.send('NATIVE_APPROVAL');let action:NativeAction|undefined,runId=''
 await expect.poll(async()=>{runId=(await f.detail()).runs[0]?.id??'';if(!runId)return;action=(await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}) as NativeAction[])[0];return action?.status},{timeout:15000}).toBe('pending')
 await f.restart();const d=await f.detail();expect(d.runs).toHaveLength(1);expect(['interrupted','cancelled']).toContain(d.runs[0].status)
 await expect(f.service.handle('respondNativeAction',{conversationId:f.chat.id,runId,actionId:action!.id,response:{option:runtime==='codex'?'accept':'allow'}})).rejects.toThrow()
 await expect(readFile(join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work','permission-marker'))).rejects.toThrow()
})
it('binds native settings until the actual process exits and recreates the session after an idle change',async()=>{
 const f=await setup();const first=await f.wait(await f.send('你好'))
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const message=await f.send('NATIVE_WAIT');let runId=''
 await expect.poll(async()=>{const r=(await f.detail()).runs.find(r=>r.triggerMessageId===message.id);runId=r?.id??'';return r?.backend?.inputAccepted},{timeout:15000}).toBe(true)
 await expect(f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,nativeOptions:{effort:'high'}})).rejects.toThrow('员工仍在执行')
 await f.service.handle('stopNativeExecution',{conversationId:f.chat.id,runId});await f.wait(message)
 await expect.poll(async()=>{try { await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,nativeOptions:{effort:'high'}});return true } catch(error) { if(!String(error).includes('员工仍在执行'))throw error;return false }},{timeout:5000}).toBe(true)
 const next=await f.wait(await f.send('明确新消息'));expect(next.runs.at(-1)?.backend?.sessionId).not.toBe(first.runs[0].backend?.sessionId)
})
it('exports business records while excluding private native files, then restores without replay',async()=>{
 const f=await setup(),before=await f.wait(await f.send('普通交流')),backup=await realpath(await mkdtemp(join(tmpdir(),'boai-native-backup-')))
 disposals.unshift(()=>rm(backup,{recursive:true,force:true}))
 const privateRelative=join('agents',f.agent.id,'workspace','sessions',f.chat.id,runtime==='codex'?'.codex-private':'.claude-private')
 await mkdir(join(f.root,privateRelative),{recursive:true});await writeFile(join(f.root,privateRelative,'private-sentinel'),'private')
 await f.service.backup(backup);await expect(stat(join(backup,privateRelative))).rejects.toThrow()
 await f.restart(backup);expect((await f.detail()).runs).toHaveLength(before.runs.length)
 const after=await f.wait(await f.send('恢复后明确新消息'));expect(after.runs.at(-1)?.backend?.sessionId).not.toBe(before.runs[0].backend?.sessionId)
})
it('passes authorized attachments and revokes old input before reusing native context',async()=>{
 const f=await setup(),path=join(f.root,'source.txt');await writeFile(path,'MATERIAL_ONLY_CANARY')
 const material=await f.service.handle('prepareMaterial',{conversationId:f.chat.id,path,requestId:crypto.randomUUID(),authorizedAgentIds:[f.agent.id]}) as import('../src/shared/domain').ConversationMaterial
 const message=await f.service.handle('sendMessage',{conversationId:f.chat.id,content:'读取附件',mentionIds:[],requestId:crypto.randomUUID(),materialSelections:[{id:material.id,revision:material.revision}]}) as Message
 const first=await f.wait(message),cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 const read=async()=>JSON.parse(JSON.parse((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n').at(-1)!).input[0].text)
 expect(JSON.stringify(await read())).toContain('MATERIAL_ONLY_CANARY')
 await f.service.handle('setMaterialAuthorization',{id:material.id,expectedRevision:material.revision,authorizedAgentIds:[]})
 const after=await f.wait(await f.send('撤权后新交流'))
 expect(after.runs.at(-1)?.backend?.sessionId).not.toBe(first.runs[0].backend?.sessionId);expect(JSON.stringify(await read())).not.toContain('MATERIAL_ONLY_CANARY')
})

})

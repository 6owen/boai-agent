/*
 * [OUTPUT]: 2026-10-11 第13组原生生产合同回归与旧阶段兼容分开；夹具成功不冒充真实模型验收。
 * [OUTPUT]: policy10完整聊天映射夹具在两次recover中零调用且原记录不改；明确新消息按当前策略重建，无resume，新会话实际完成后才允许后续增量；不代替旧应用升级证据。
 * [OUTPUT]: 私有decision/memory/report拒绝非布尔格式完成标记，即使后续success/结构相等；缺省/false成功与true拒绝后新ID纠正保持，无公开私有文本或业务工具。
 * [OUTPUT]: 新增数字诊断沿真实员工引擎进入原Trace并持久化；旧缺省字段仍未知，原失败只调用一次且不保存私有正文。
 * [OUTPUT]: CLI错误结果在未请求与宿主已完成两种实际协议链均失败且不重发，外部Trace以白名单诊断区分原工具事实。
 * [OUTPUT]: 交付后记忆原请求只随本人本轮实际发布结果补入；其他员工/会话、未交付/待核对、旧结果/他人回复、缺失或窗口外来源仍拒绝。
 * [OUTPUT]: 真实外部阶段诊断进入原Trace；私有回调失败只留白名单位置与计数，原错误和单次请求保持。
 * [OUTPUT]: 私有阶段明确格式提交且仍拒绝业务工具；格式器同一请求有界纠正，拒绝越界/重复/未确认身份及被拒旧结果；无公开文本或业务工具，无新增父调用。
 * [INPUT]: 真实SQLite、独立Claude协议进程及生产文件工具。
 * [OUTPUT]: 已验证DeepSeek私有判断/记忆与当前依赖等待汇报off分阶段核对；组织low，其他模型默认，来源及原任务交付审核保持；非供应商或UI。
 * [POS]: Claude员工引擎模块验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { chmod, copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Artifact, Connection, Message, ModelUsage, ToolEvent, WorkOutcome, WorkDraft } from '../src/shared/domain'
import type { EngineContext } from '../src/runtime/contracts'
import type { TraceSpan } from '../src/shared/domain/traces'
import { LegacyClaudeEmployeeEngine as ClaudeEmployeeEngine } from '../src/runtime/adapters/claude/legacy-engine'
import { claudeProvider } from '../src/runtime/adapters/claude/provider'
import { type ClaudePhaseDiagnostic, verifyClaudeProgram } from '../src/runtime/adapters/claude/turn'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { digest } from '../src/runtime/adapters/native-sessions'
import { prepareMemoryExtraction } from '../src/runtime/modules/employees/memory-extraction'

const cleanup:(()=>Promise<unknown>)[]=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
const date='2026-10-06T00:00:00.000Z'
const connection:Connection={id:'api',name:'Explicit source',provider:'anthropic',baseUrl:'http://127.0.0.1:9',defaultModel:'fixture-model',hasApiKey:true}
const message=(id:string,sequence:number,extra:Partial<Message>={}):Message=>({id,sequence,conversationId:'conversation',senderId:'user',senderName:'User',senderType:'user',status:'completed',content:id,createdAt:date,...extra})
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'boai-claude-employee-'));cleanup.push(()=>rm(root,{recursive:true,force:true}))
 const store=new ProductStore(join(root,'boai.sqlite'));await store.init();cleanup.push(()=>store.close())
 const executable=join(root,'claude.mjs');await copyFile(resolve('tests/fixtures/claude-employee.mjs'),executable);await chmod(executable,0o700)
 const controller=new AbortController(),cwd=join(root,'employee'),privateHome=join(root,'config')
 const program=await verifyClaudeProgram({executable,cwd,configDirectory:privateHome,signal:controller.signal})
 const engine=new ClaudeEmployeeEngine(store);await engine.recover(root)
 const deltas:string[]=[],tools:ToolEvent[]=[],artifacts:Artifact[]=[],outcomes:WorkOutcome[]=[],calls:string[]=[],usage:ModelUsage[]=[],traces:TraceSpan[]=[]
 const ctx:EngineContext={agent:{id:'employee',name:'员工',role:'研究',instructions:'',color:'#00AABB',connectionId:'api',modelId:'',skillIds:[],knowledgeIds:[],allowCommands:false,active:true,configVersion:1,executionBackend:{kind:'claude-local',profileId:'profile'}},
  connection,apiKey:'synthetic-key',runtimeProfile:{id:'profile',name:'Claude',protocol:'claude-cli',executable:program.executable,executableHash:program.executableHash,runtime:program.runtime,args:[],useExistingLogin:false,hostAccessAcknowledged:true,revision:1,verified:{name:'Claude',version:program.version,protocolVersion:1,checkedAt:date}},runtimeDirectory:{cwd,privateHome},
  conversation:{id:'conversation',title:'Chat',kind:'direct',agentIds:['employee'],mode:'natural',workspacePath:join(root,'shared'),sharedKnowledgeIds:[],createdAt:date,updatedAt:date},
  messages:[message('first',1)],triggerMessageId:'first',runId:'run-1',modelCallId:'call-1',signal:controller.signal,resources:[],responseKind:'chat',
  workspace:{root:cwd,workPath:join(cwd,'work'),runPath:join(cwd,'runs','run-1'),sharedPath:join(root,'shared')},
  onDelta:async text=>{deltas.push(text)},onTool:async event=>{tools.push(event)},onModelCallStarted:async(id,phase)=>{calls.push(`${id}:${phase}`)},onModelCallUsage:async(id,value,completed)=>{expect(id).toBe('call-1');expect(completed).toBe(true);usage.push(value)},onTrace:async span=>{traces.push(span)},
  approveCommand:async()=>{throw new Error('Unexpected command')},onArtifact:async artifact=>{artifacts.push(artifact)},onWorkOutcome:async outcome=>{outcomes.push(outcome)},
 }
 return {root,store,engine,ctx,deltas,tools,artifacts,outcomes,calls,usage,traces,launched:()=>readFile(join(cwd,'launched.json'),'utf8').then(JSON.parse)}
}
 const work=()=>({schemaVersion:2 as const,id:'work',conversationId:'conversation',sourceMessageId:'first',key:'one',scope:'file',deliverable:'file',ownerAgentId:'employee',activeRunId:'run-1',version:1,status:'running' as const,budgetId:'budget',rootWorkId:'work',dependsOnWorkIds:[],requiredResults:[],observedResults:[],waitRevision:0,resultMessageIds:[],artifactIds:[],resultVersion:0,requiresReview:false,createdAt:date,updatedAt:date})

it.each(['decision','memory','report'] as const)('gives %s an effect-free formatter contract without prohibiting its required result channel',async phase=>{
 const f=await fixture()
 if(phase==='decision')await f.engine.decide(f.ctx)
 else if(phase==='memory')await f.engine.extractMemory(f.ctx)
 else await f.engine.report(f.ctx,{text:'原工作已执行'} as WorkDraft)
 const {args}=await f.launched(),instructions=args[args.indexOf('--system-prompt')+1]
 expect(instructions).not.toMatch(/No tools|use tools during this decision/)
 expect(instructions).toContain('No business tools')
 expect(instructions).toContain('Submit the private JSON result through StructuredOutput')
 expect(args[args.indexOf('--tools')+1]).toBe('')
 expect(JSON.parse(args[args.indexOf('--mcp-config')+1])).toEqual({mcpServers:{}})
 expect(f.deltas).toEqual([]);expect(f.tools).toEqual([]);expect(f.artifacts).toEqual([])
 expect(f.calls).toEqual([`call-1:${phase}`])
})

it('disables verified DeepSeek private decisions and memory thinking while task execution and delivery review keep defaults',async()=>{
 const f=await fixture(), started:{phase:string;thinking:unknown}[]=[]
 f.ctx.connection={...connection,provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1',defaultModel:'deepseek-v4-pro'}
 f.ctx.onModelCallStarted=async(_id,phase,thinking)=>{started.push({phase,thinking})}
 const effort=async()=>{const {args}=await f.launched();return args.includes('--effort')?args[args.indexOf('--effort')+1]:undefined}
 await f.engine.decide(f.ctx);expect(await effort()).toBeUndefined()
 const decisionArgs=(await f.launched()).args
 expect(JSON.parse(decisionArgs[decisionArgs.indexOf('--settings')+1])).toEqual({alwaysThinkingEnabled:false})
 expect(decisionArgs[decisionArgs.indexOf('--tools')+1]).toBe('')
 expect(JSON.parse(decisionArgs[decisionArgs.indexOf('--mcp-config')+1])).toEqual({mcpServers:{}})
 await f.engine.extractMemory(f.ctx);expect(await effort()).toBeUndefined()
 const memoryArgs=(await f.launched()).args
 expect(JSON.parse(memoryArgs[memoryArgs.indexOf('--settings')+1])).toEqual({alwaysThinkingEnabled:false})
 await f.engine.report(f.ctx,{text:'已执行结果'} as WorkDraft);expect(await effort()).toBeUndefined()
 await f.engine.run(f.ctx);expect(await effort()).toBeUndefined()
 await f.engine.run({...f.ctx,responseKind:'task',work:work()});expect(await effort()).toBeUndefined()
 expect(started).toEqual([{phase:'decision',thinking:'off'},{phase:'memory',thinking:'off'},{phase:'report',thinking:undefined},{phase:'chat',thinking:undefined},{phase:'task',thinking:undefined}])
 expect(f.artifacts).toHaveLength(1);expect(f.outcomes[0].disposition).toBe('delivered')
})

it.each(['declared-dependency','old-dependency-only','empty-dependency','no-work','user-question','unverified-model','another-provider'] as const)('limits explicit-off waiting reports to the current accepted dependency for %s',async variant=>{
 const f=await fixture(),started:{phase:string;thinking:unknown}[]=[]
 f.ctx.connection={...connection,provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1',defaultModel:'deepseek-v4-pro'}
 f.ctx.work={...work(),outcome:{disposition:'waiting',summary:'等待已委派子工作'}}
 f.ctx.pendingWorkWait={dependencies:[{workId:'child',resultVersion:1}],nextStep:'核对真实子文件后汇总'}
 if(variant==='old-dependency-only'){f.ctx.work.dependsOnWorkIds=['child'];f.ctx.pendingWorkWait=undefined}
 if(variant==='empty-dependency')f.ctx.pendingWorkWait!.dependencies=[]
 if(variant==='no-work')f.ctx.work=undefined
 if(variant==='user-question'){f.ctx.pendingWorkWait=undefined;f.ctx.work!.outcome!.userQuestion='最终标题是什么？'}
 if(variant==='unverified-model')f.ctx.connection.defaultModel='deepseek-reasoner'
 if(variant==='another-provider')f.ctx.connection=connection
 f.ctx.onModelCallStarted=async(_id,phase,thinking)=>{started.push({phase,thinking})}
 const draft={text:'CLAUDE_WITHHOLD_WAIT 旧汇报尚待核对',observedThroughSequence:1,revisions:0,status:'private' as const}
 expect(await f.engine.report(f.ctx,draft)).toEqual({action:'discard'})
 const {args,payload}=await f.launched(),expected=variant==='declared-dependency'?'off':undefined
 expect(args).not.toContain('--effort')
 expect(args.includes('--settings')?JSON.parse(args[args.indexOf('--settings')+1]):undefined).toEqual(expected?{alwaysThinkingEnabled:false}:undefined)
 expect(started).toEqual([{phase:'report',thinking:expected}])
 expect(payload.pendingWait).toEqual(f.ctx.pendingWorkWait);expect(payload.draft).toEqual(draft)
 expect(args[args.indexOf('--tools')+1]).toBe('');expect(JSON.parse(args[args.indexOf('--mcp-config')+1])).toEqual({mcpServers:{}})
 expect(f.deltas).toEqual([]);expect(f.tools).toEqual([]);expect(f.artifacts).toEqual([])
})

it.each(['unverified-model','another-provider','model-override'] as const)('keeps runtime defaults for %s instead of assuming compatible effort controls',async variant=>{
 const f=await fixture()
 if(variant==='unverified-model')f.ctx.connection={...connection,provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1',defaultModel:'deepseek-reasoner'}
 if(variant==='model-override'){f.ctx.connection={...connection,provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1',defaultModel:'deepseek-v4-pro'};f.ctx.agent.modelId='deepseek-reasoner'}
 await f.engine.decide(f.ctx);expect((await f.launched()).args).not.toContain('--effort')
 expect((await f.launched()).args).not.toContain('--settings')
 await f.engine.extractMemory(f.ctx);expect((await f.launched()).args).not.toContain('--effort')
 expect((await f.launched()).args).not.toContain('--settings')
})

it('keeps private decision/memory/report output out of public deltas and checks their actual sources',async()=>{
 const f=await fixture()
 expect(await f.engine.decide(f.ctx)).toMatchObject({action:'reply',replyToMessageId:'first',observedThroughSequence:1})
 expect(await f.engine.extractMemory(f.ctx)).toMatchObject([{sourceMessageIds:['first']}])
 const draft={text:'old result'} as WorkDraft
 expect(await f.engine.report(f.ctx,draft)).toMatchObject({action:'publish',text:'已核对原结果'})
 expect(f.deltas).toEqual([]);expect(f.tools).toEqual([])
 expect(f.calls).toEqual(['call-1:decision','call-1:memory','call-1:report']);expect(f.usage).toHaveLength(3)
 f.ctx.messages=[message('invalid-decision',1)];f.ctx.triggerMessageId='invalid-decision'
 await expect(f.engine.decide(f.ctx)).rejects.toThrow('具体依赖')
 f.ctx.messages=[message('invalid-memory',1)];f.ctx.triggerMessageId='invalid-memory'
 await expect(f.engine.extractMemory(f.ctx)).rejects.toThrow('未授权')
 f.ctx.messages=[message('invalid-report',1)];f.ctx.triggerMessageId='invalid-report'
 await expect(f.engine.report(f.ctx,draft)).rejects.toThrow()
 f.ctx.messages=[message('invalid-question',1)];f.ctx.triggerMessageId='invalid-question'
 await expect(f.engine.report(f.ctx,draft)).rejects.toThrow('用户补充问题')
 expect(f.deltas).toEqual([]);expect(await f.store.load('claudeSessions')).toEqual([])
})

it.each(['owned-delivery','another-owner','another-conversation','undelivered','review-required','old-result','old-reply-turn','teammate-reply','missing-source','outside-window'] as const)('admits original work memory evidence only for %s',async variant=>{
 const f=await fixture()
 f.ctx.turnId='wake';f.ctx.triggerMessageId='update'
 f.ctx.messages=[message('unrelated',1,{turnId:'earlier',content:'无关旧说明'}),message('source',2,{turnId:'original',content:'我的长期偏好是简短答复。'}),message('update',3,{turnId:'update-turn',content:'只更新进度，不新增任务。'}),message('reply',4,{turnId:'wake',senderType:'agent',senderId:'employee',runId:'delivered-run',content:'本人的成果已公开'})]
 f.ctx.work={...work(),sourceMessageId:'source',activeRunId:undefined,status:'delivered',resultMessageIds:['reply'],resultVersion:1}
 if(variant==='another-owner')f.ctx.work.ownerAgentId='other'
 if(variant==='another-conversation')f.ctx.work.conversationId='other-conversation'
 if(variant==='undelivered')f.ctx.work.status='waiting'
 if(variant==='review-required')f.ctx.work.requiresReview=true
 if(variant==='old-result')f.ctx.work.resultMessageIds=['old-result']
 if(variant==='old-reply-turn')f.ctx.messages[3].turnId='old'
 if(variant==='teammate-reply')f.ctx.messages[3].senderId='teammate'
 if(variant==='missing-source')f.ctx.messages=f.ctx.messages.filter(m=>m.id!=='source')
 if(variant==='outside-window')f.ctx.messages.push(...Array.from({length:100},(_,i)=>message(`late-${i}`,5+i,{turnId:'older'})))
 const prepared=prepareMemoryExtraction(f.ctx)!
 expect(prepared.data.currentTurn.rootMessageId).toBe('update')
 const ids=prepared.data.currentTurnMessages.map(m=>m.id)
 expect(ids).not.toContain('unrelated')
 if(variant==='owned-delivery'){
  expect(ids).toEqual(['source','update','reply'])
  expect(prepared.data.completedWorkRequestId).toBe('source')
  expect(prepared.validate([{content:'用户偏好简短答复',sourceMessageIds:['source']}])).toMatchObject([{sourceMessageIds:['source']}])
 }else{
  expect(ids).not.toContain('source')
  expect(prepared.data.completedWorkRequestId).toBeUndefined()
  expect(()=>prepared.validate([{content:'用户偏好简短答复',sourceMessageIds:['source']}])).toThrow('未授权')
 }
 expect(()=>prepared.validate([{content:'无关历史不重提取',sourceMessageIds:['unrelated']}])).toThrow('未授权')
 expect(await f.store.load('claudeSessions')).toEqual([]);expect(f.deltas).toEqual([]);expect(f.calls).toEqual([])
})

it('rebuilds policy10 Claude chat on an explicit new message after two recoveries before allowing policy11 incremental continuation',async()=>{
 const f=await fixture()
 await f.engine.run(f.ctx)
 const original=(await f.store.load<{id:string;threadId:string;fingerprint:string}>('claudeSessions'))[0]
 const legacyFingerprint=digest([10,f.ctx.runtimeProfile,f.ctx.connection,f.ctx.agent.modelId,f.ctx.agent.configVersion,f.ctx.bootstrap?.hashes,f.ctx.bootstrap?.policyVersion,f.ctx.memory?.namespace,f.ctx.memory?.invalidationEpoch])
 // Keep a completed protocol-fixture transcript; only its historical policy fingerprint is fixed to v10.
 const legacy={...original,fingerprint:legacyFingerprint}
 await f.store.write([{collection:'claudeSessions',id:legacy.id,value:legacy}])
 const legacyReply=message('reply-v10',2,{runId:f.ctx.runId,senderType:'agent',senderId:'employee',content:f.deltas.join('')})
 const beforeRecovery=await Promise.all([f.store.load('claudeSessions'),f.store.load('claudeRuntime')]),beforeLaunch=await f.launched()
 f.calls.length=0;f.deltas.length=0;f.usage.length=0;f.traces.length=0
 const upgraded=new ClaudeEmployeeEngine(f.store)
 await upgraded.recover(f.root);await new ClaudeEmployeeEngine(f.store).recover(f.root)
 expect(await Promise.all([f.store.load('claudeSessions'),f.store.load('claudeRuntime')])).toEqual(beforeRecovery)
 expect(await f.launched()).toEqual(beforeLaunch)
 expect(f.calls).toEqual([]);expect(f.deltas).toEqual([]);expect(f.usage).toEqual([]);expect(f.traces).toEqual([])
 const second={...f.ctx,runId:'run-2',messages:[...f.ctx.messages,legacyReply,message('second',3)],triggerMessageId:'second'}
 await upgraded.run(second)
 const firstNew=await f.launched()
 expect(firstNew.args).not.toContain('--resume')
 expect(firstNew.payload.contextMode).toBe('initial');expect(firstNew.payload.priorReply).toBeUndefined()
 expect([...firstNew.payload.historicalBackground,...firstNew.payload.currentTurnMessages].map((m:{id:string})=>m.id)).toEqual(['first','reply-v10','second'])
 const rebuilt=(await f.store.load<{threadId:string;fingerprint:string;completedInvocationId:string}>('claudeSessions'))[0]
 expect(rebuilt.threadId).not.toBe(legacy.threadId);expect(rebuilt.fingerprint).not.toBe(legacyFingerprint);expect(rebuilt.completedInvocationId).toBe('run-2')
 const newReply=message('reply-v11',4,{runId:'run-2',senderType:'agent',senderId:'employee',content:f.deltas.join('')})
 await new ClaudeEmployeeEngine(f.store).run({...second,runId:'run-3',messages:[...second.messages,newReply,message('third',5)],triggerMessageId:'third'})
 const third=await f.launched()
 expect(third.args[third.args.indexOf('--resume')+1]).toBe(rebuilt.threadId)
 expect(third.payload.contextMode).toBe('incremental');expect(third.payload.priorReply).toEqual({messageId:'reply-v11',hostRunId:'run-2'})
 expect(third.payload.currentTurnMessages.map((m:{id:string})=>m.id)).toEqual(['third'])
 expect(f.calls).toEqual(['call-1:chat','call-1:chat']);expect(f.tools).toEqual([]);expect(f.artifacts).toEqual([]);expect(f.outcomes).toEqual([])
 expect(f.traces.filter(span=>span.endedAt).map(span=>span.output)).toMatchObject(Array(2).fill({outcome:'completed',stage:'returned',transport:{processGroupExited:true,exitCode:0}}))
})

it('keeps explicit-off private maintenance out of chat identity; resumes exact replies and rebuilds on provider changes',async()=>{
 const f=await fixture()
 f.ctx.connection={...connection,provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1',defaultModel:'deepseek-v4-pro'}
 await f.engine.run(f.ctx)
 const first=(await f.store.load<{threadId:string;completedInvocationId:string}>('claudeSessions'))[0]
 expect(first.completedInvocationId).toBe('run-1')
 await f.engine.decide(f.ctx)
 expect(await f.store.load('claudeSessions')).toEqual([first])
 await f.engine.extractMemory(f.ctx)
 expect(await f.store.load('claudeSessions')).toEqual([first])
 const maintenanceArgs=(await f.launched()).args
 expect(JSON.parse(maintenanceArgs[maintenanceArgs.indexOf('--settings')+1])).toEqual({alwaysThinkingEnabled:false})
 const reply=message('reply',2,{runId:'run-1',senderType:'agent',senderId:'employee',content:f.deltas.join('')})
 f.ctx={...f.ctx,runId:'run-2',messages:[...f.ctx.messages,reply,message('second',3)],triggerMessageId:'second'}
 await new ClaudeEmployeeEngine(f.store).run(f.ctx)
 const current=await f.launched();expect(current.args).toContain(first.threadId)
 expect(current.payload.contextMode).toBe('incremental');expect(current.payload.priorReply).toEqual({messageId:'reply',hostRunId:'run-1'})
 expect(current.payload.currentTurnMessages.map((m:{id:string})=>m.id)).toEqual(['second'])
 const secondReply=message('reply-2',4,{runId:'run-2',senderType:'agent',senderId:'employee',content:'只处理新增消息'})
 await f.engine.run({...f.ctx,runId:'run-3',connection:{...connection,baseUrl:'http://127.0.0.1:10'},messages:[...f.ctx.messages,secondReply,message('third',5)],triggerMessageId:'third'})
 expect((await f.launched()).payload.contextMode).toBe('initial')
 expect(JSON.stringify(await f.store.load('claudeSessions'))).not.toContain('synthetic-key')
 expect(await f.store.load('codexSessions')).toEqual([])
})

it('passes task effects through original host tools and reports only the published artifact receipt',async()=>{
 const f=await fixture();f.ctx={...f.ctx,responseKind:'task',work:work()}
 await f.engine.run(f.ctx)
 expect(f.artifacts).toHaveLength(1)
 expect(await readFile(f.artifacts[0].path,'utf8')).toBe('生产工具真实原件')
 expect(f.outcomes).toEqual([{disposition:'delivered',summary:'文件已发布',evidence:[{kind:'artifact',reference:f.artifacts[0].id}]}])
 expect(f.tools.filter(tool=>tool.status==='completed').map(tool=>tool.name)).toEqual(['write_file','publish_artifact','report_work'])
 expect(f.deltas).toEqual(['文件已发布']);expect(await f.store.load('claudeSessions')).toEqual([])
 const count=f.tools.length;await f.engine.report(f.ctx,{text:'文件已发布'} as WorkDraft);expect(f.tools).toHaveLength(count)
})

it.each(['wrong-connection','subscription','wrong-program'] as const)('rejects %s before starting a model phase',async mode=>{
 const f=await fixture()
 if(mode==='wrong-connection')f.ctx.connection={...connection,id:'other'}
 if(mode==='subscription')f.ctx.runtimeProfile!.useExistingLogin=true
 if(mode==='wrong-program')f.ctx.runtimeProfile!.protocol='codex-app-server'
 await expect(f.engine.run(f.ctx)).rejects.toThrow();expect(f.calls).toEqual([])
 await expect(f.launched()).rejects.toMatchObject({code:'ENOENT'})
})

it('sends authorized new images once per chat boundary and supplies current images to an independent file task',async()=>{
 const f=await fixture(),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GNAAAAAASUVORK5CYII='
 const picture=(messageId:string)=>({messageId,materialId:`image-${messageId}`,mimeType:'image/png',dataUrl:`data:image/png;base64,${png}`})
 f.ctx.materialImages=[picture('first'),picture('outside-context')]
 await f.engine.run(f.ctx)
 expect((await f.launched()).images).toHaveLength(1)
 const reply=message('reply',2,{runId:'run-1',senderType:'agent',senderId:'employee',content:f.deltas.join('')})
 f.ctx={...f.ctx,runId:'run-2',messages:[...f.ctx.messages,reply,message('second',3)],triggerMessageId:'second',materialImages:[picture('first'),picture('second')]}
 await f.engine.run(f.ctx)
 expect((await f.launched()).images).toHaveLength(1)
 const second=message('reply-2',4,{runId:'run-2',senderType:'agent',senderId:'employee',content:'只处理新增消息'})
 f.ctx={...f.ctx,runId:'run-3',messages:[...f.ctx.messages,second,message('third',5)],triggerMessageId:'third'}
 await f.engine.run(f.ctx)
 expect((await f.launched()).images).toEqual([])
 expect(JSON.stringify(await f.store.load('claudeSessions'))).not.toContain(png)
 expect(JSON.stringify(f.traces)).not.toContain(png)
 await f.engine.run({...f.ctx,runId:'task',responseKind:'task',workspace:{...f.ctx.workspace!,runPath:join(f.ctx.workspace!.root,'runs','task')},work:{...work(),activeRunId:'task'}})
 expect((await f.launched()).images).toHaveLength(2)
 expect(f.artifacts).toHaveLength(1);expect(f.outcomes[0].disposition).toBe('delivered')
})

it('retains unknown usage and never retries a phase because trace saving failed',async()=>{
 const f=await fixture();const traceErrors:string[]=[]
 await f.engine.run({...f.ctx,messages:[message('unknown-usage',1)],triggerMessageId:'unknown-usage',onTrace:async()=>{throw new Error('trace failure')},onTraceError:async error=>{traceErrors.push(error)}})
 expect(f.calls).toHaveLength(1);expect(f.usage).toEqual([]);expect(f.deltas).toEqual(['首次公开回复']);expect(traceErrors).toHaveLength(2)
})

it('uses explicit Anthropic endpoints and only the known DeepSeek protocol mapping',()=>{
 expect(claudeProvider({...connection,baseUrl:''},'')).toEqual({baseUrl:'https://api.anthropic.com',model:'fixture-model'})
 expect(claudeProvider({...connection,provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1'},'deepseek-v4-pro')).toEqual({baseUrl:'https://api.deepseek.com/anthropic',model:'deepseek-v4-pro'})
 for(const change of [{hasApiKey:false},{provider:'openai' as const,baseUrl:'https://api.openai.com/v1'},{baseUrl:'http://public.example'},{baseUrl:'https://secret:private@example.com'},{provider:'openai-compatible' as const,baseUrl:'https://api.deepseek.com/unverified'}])expect(()=>claudeProvider({...connection,...change},'')).toThrow()
})

it.each(['formatter-missing','formatter-wrong-id','formatter-mismatch','formatter-repair-over-limit','formatter-repair-reused-id','formatter-repair-wrong-id','formatter-repair-no-receipt','formatter-repair-pending','formatter-repair-stale-result'])('does not accept a structured result with %s',async marker=>{
 const f=await fixture()
 await expect(f.engine.decide({...f.ctx,messages:[message(marker,1)],triggerMessageId:marker})).rejects.toThrow('结构化')
 expect(f.deltas).toEqual([]);expect(f.tools).toEqual([]);expect(f.usage).toEqual([])
})

const formatterReceiptPhases=['decision','memory','report'] as const
it.each(formatterReceiptPhases.flatMap(phase=>['string','null','number'].map(kind=>({phase,marker:`formatter-receipt-${kind}-error`})) ))('rejects nonboolean formatter receipt is_error $marker in $phase before private completion',async({phase,marker})=>{
 const f=await fixture(),ctx={...f.ctx,messages:[message(marker,1)],triggerMessageId:marker}
 let rejected:unknown
 try{
  if(phase==='decision')await f.engine.decide(ctx)
  else if(phase==='memory')await f.engine.extractMemory(ctx)
  else await f.engine.report(ctx,{text:'original'} as WorkDraft)
 }catch(error){rejected=error}
 expect(f.deltas).toEqual([]);expect(f.tools).toEqual([]);expect(f.artifacts).toEqual([]);expect(f.outcomes).toEqual([])
 expect(f.calls).toEqual([`call-1:${phase}`]);expect(await f.store.load('claudeSessions')).toEqual([])
 expect((await f.launched()).args).not.toContain('--settings')
 expect(rejected,'A nonboolean formatter receipt cannot confirm even an equal final structured result').toBeInstanceOf(Error)
 expect((rejected as Error).message).toContain('结构化')
 expect(f.usage).toEqual([])
 expect(f.traces.filter(span=>span.endedAt).map(span=>span.output)).toMatchObject([{outcome:'failed',stage:'event_wait',protocolCounts:{formatterCalls:1,formatterRejections:0,formatReminders:0},transport:{processGroupExited:true,stoppedBecause:'callback'}}])
})

it.each(formatterReceiptPhases.flatMap(phase=>['undefined','false'].map(kind=>({phase,marker:`formatter-receipt-${kind}-error`})) ))('accepts valid formatter receipt is_error $marker in $phase with original confirmation',async({phase,marker})=>{
 const f=await fixture(),ctx={...f.ctx,messages:[message(marker,1)],triggerMessageId:marker}
 if(phase==='decision')expect(await f.engine.decide(ctx)).toMatchObject({action:'reply'})
 else if(phase==='memory')expect(await f.engine.extractMemory(ctx)).toMatchObject([{sourceMessageIds:[marker]}])
 else expect(await f.engine.report(ctx,{text:'original'} as WorkDraft)).toMatchObject({action:'publish'})
 expect(f.calls).toEqual([`call-1:${phase}`]);expect(f.usage).toHaveLength(1)
 expect(f.deltas).toEqual([]);expect(f.tools).toEqual([]);expect(f.artifacts).toEqual([]);expect(f.outcomes).toEqual([])
 expect(await f.store.load('claudeSessions')).toEqual([])
 expect(f.traces.filter(span=>span.endedAt).map(span=>span.output)).toMatchObject([{outcome:'completed',stage:'returned',protocolCounts:{formatterCalls:1,formatterRejections:0,formatReminders:0},transport:{processGroupExited:true,exitCode:0}}])
})

it.each(['formatter-repair-once','formatter-repair-twice'])('accepts %s only within the original private call and final receipt',async marker=>{
 const f=await fixture(),ctx={...f.ctx,messages:[message(marker,1)],triggerMessageId:marker}
 expect(await f.engine.decide(ctx)).toMatchObject({action:'reply'})
 expect(await f.engine.extractMemory(ctx)).toMatchObject([{sourceMessageIds:[marker]}])
 expect(await f.engine.report(ctx,{text:'original'} as WorkDraft)).toMatchObject({action:'publish'})
 expect(f.calls).toEqual(['call-1:decision','call-1:memory','call-1:report'])
 expect(f.usage).toHaveLength(3);expect(f.deltas).toEqual([]);expect(f.tools).toEqual([])
 expect(await f.store.load('claudeSessions')).toEqual([])
 const rejected=marker==='formatter-repair-twice'?2:1
 expect(f.traces.filter(span=>span.endedAt).map(span=>span.output)).toMatchObject(Array(3).fill({outcome:'completed',stage:'returned',protocolCounts:{formatterCalls:rejected+1,formatterRejections:rejected,formatReminders:0},transport:{processGroupExited:true,exitCode:0}}))
})

it.each(['reminder-once','reminder-twice'])('keeps %s private until the formatter confirms each private phase',async marker=>{
 const f=await fixture(),ctx={...f.ctx,messages:[message(marker,1)],triggerMessageId:marker}
 expect(await f.engine.decide(ctx)).toMatchObject({action:'reply'})
 expect(await f.engine.extractMemory(ctx)).toMatchObject([{sourceMessageIds:[marker]}])
 expect(await f.engine.report(ctx,{text:'original'} as WorkDraft)).toMatchObject({action:'publish'})
 expect(f.calls).toEqual(['call-1:decision','call-1:memory','call-1:report'])
 expect(f.usage).toHaveLength(3);expect(f.deltas).toEqual([]);expect(f.tools).toEqual([])
 expect(await f.store.load('claudeSessions')).toEqual([])
 expect(f.traces.filter(span=>span.endedAt).map(span=>span.output)).toMatchObject(Array(3).fill({outcome:'completed',stage:'returned',protocolCounts:{formatterCalls:1,formatterRejections:0,formatReminders:marker==='reminder-twice'?2:1},transport:{processGroupExited:true,exitCode:0}}))
})

it.each(['reminder-nonsynthetic','reminder-text','reminder-child','reminder-role','reminder-mixed','reminder-over-limit','reminder-before-assistant','reminder-after-formatter','reminder-session','reminder-no-receipt'])('rejects %s without accepting completion or publishing private text',async marker=>{
 const f=await fixture()
 await expect(f.engine.decide({...f.ctx,messages:[message(marker,1)],triggerMessageId:marker})).rejects.toThrow()
 expect(f.calls).toHaveLength(1);expect(f.usage).toEqual([]);expect(f.deltas).toEqual([]);expect(f.tools).toEqual([])
})

it('does not allow formatter reminders to bypass the public chat or business-tool protocols',async()=>{
 const f=await fixture(),ctx={...f.ctx,messages:[message('reminder-once',1)],triggerMessageId:'reminder-once'}
 await expect(f.engine.run(ctx)).rejects.toThrow('未支持的事件')
 expect(f.deltas.join('')).not.toContain('structured-output-enforce')
 await expect(f.engine.run({...ctx,runId:'run-2',responseKind:'task',workspace:{...ctx.workspace!,runPath:join(ctx.workspace!.root,'runs','run-2')},work:{...work(),activeRunId:'run-2'}})).rejects.toThrow('工具结果事件不符')
 expect(f.deltas.join('')).not.toContain('structured-output-enforce');expect(f.usage).toEqual([])
})

it('keeps a private callback failure in the original external trace without exposing its text or repeating the phase', async () => {
 const f=await fixture(), reason=new Error('private-callback-secret')
 f.ctx.messages=[message('CLAUDE_USAGE_STOP',1)];f.ctx.triggerMessageId='CLAUDE_USAGE_STOP'
 f.ctx.onModelCallUsage=async()=>{throw reason}
 await expect(f.engine.decide(f.ctx)).rejects.toBe(reason)
 expect(f.calls).toEqual(['call-1:decision'])
 const finished=f.traces.filter(span=>span.endedAt)
 expect(finished).toHaveLength(1)
 expect(finished[0].output).toMatchObject({outcome:'failed',stage:'event_wait',eventCounts:{init:1,message_start:1},protocolCounts:{formatterCalls:0,formatterRejections:0,formatReminders:0},transport:{stoppedBecause:'callback',callbackActiveAtStop:true,processGroupExited:true}})
 const diagnostic=finished[0].output as ClaudePhaseDiagnostic
 expect(diagnostic.transport!.stdoutBytes).toBeGreaterThan(0)
 expect(diagnostic.transport!.stderrBytes).toBe(0)
 expect(diagnostic.contentBlockStartCounts).toEqual({text:0,thinking:0,tool_use:0,server_tool_use:0,other:0})
 expect(diagnostic.contentBlockDeltaCounts).toEqual({text_delta:0,thinking_delta:0,input_json_delta:0,other:0})
 expect(JSON.stringify(f.traces)).not.toMatch(/private-callback-secret|CLAUDE_USAGE_STOP|synthetic-key/)
 expect(f.deltas).toEqual([]);expect(f.tools).toEqual([])
})

it.each(['WITHOUT_REQUEST','AFTER_REQUEST'] as const)('keeps a failed native tool result %s distinguishable from a completed effect and never replays it',async mode=>{
 const f=await fixture()
 const executed=mode==='AFTER_REQUEST'?1:0
 f.ctx.messages=[message('first',1,{content:`CLAUDE_TOOL_ERROR_${mode}`})]
 await expect(f.engine.run({...f.ctx,responseKind:'task',work:work()})).rejects.toThrow('Claude宿主工具结果未确认成功')
 expect(f.tools.filter(tool=>tool.status==='completed').map(tool=>tool.name)).toEqual(executed?['write_file']:[])
 expect(f.artifacts).toEqual([]);expect(f.outcomes).toEqual([])
 if(executed)expect(await readFile(join(f.ctx.workspace!.workPath,'private-file'),'utf8')).toBe('tool-input-secret')
 else await expect(readFile(join(f.ctx.workspace!.workPath,'private-file'))).rejects.toMatchObject({code:'ENOENT'})
 expect(f.calls).toEqual(['call-1:task'])
 const finished=f.traces.filter(span=>span.endedAt)
 expect(finished).toHaveLength(1)
 expect(finished[0].output).toMatchObject({outcome:'failed',stage:'event_wait',toolBridge:{announcedCalls:1,receivedCalls:executed,executionStarts:executed,executionReturns:executed,executionExits:executed,completionConfirmations:executed,responsePreparations:executed,failedRequests:0,errorResultState:executed?'confirmed':'announced'},transport:{processGroupExited:true}})
 expect(JSON.stringify(f.traces)).not.toMatch(/private-tool-id|private-file|tool-input-secret|native-error-secret|synthetic-key/)
})


it('persists actual numeric diagnostics without inventing measurements for older external traces',async()=>{
 const f=await fixture()
 const legacy:TraceSpan={id:'legacy-trace',traceId:'old-run',spanId:'old-span',name:'Claude · chat',spanType:'external_agent',startedAt:date,endedAt:date,
  attributes:{runtime:'claude-cli',phase:'chat',accounting:'external-turn',internalModelSteps:'unknown'},output:{outcome:'completed',stage:'returned'}}
 await f.store.write([{collection:'traceSpans',id:legacy.id,value:legacy}])
 f.ctx.onTrace=async span=>{f.traces.push(span);await f.store.write([{collection:'traceSpans',id:span.id,value:span}])}
 await f.engine.run(f.ctx)
 expect(f.calls).toEqual(['call-1:chat'])
 const finished=f.traces.filter(span=>span.endedAt)
 expect(finished).toHaveLength(1)
 const diagnostic=finished[0].output as ClaudePhaseDiagnostic
 expect(diagnostic.transport!.stdoutBytes).toBeGreaterThan(0)
 expect(diagnostic.transport!.stderrBytes).toBe(0)
 expect(diagnostic.transport!.processGroupExited).toBe(true)
 const persisted=await f.store.load<TraceSpan>('traceSpans')
 expect(persisted.find(span=>span.id===legacy.id)).toEqual(legacy)
 expect(persisted.find(span=>span.id===finished[0].id)).toEqual(finished[0])
 expect(legacy.output).not.toHaveProperty('transport')
 expect(legacy.output).not.toHaveProperty('contentBlockStartCounts')
 expect(legacy.output).not.toHaveProperty('contentBlockDeltaCounts')
 expect(JSON.stringify(persisted)).not.toMatch(/synthetic-key|tool-input-secret|native-error-secret/)
})

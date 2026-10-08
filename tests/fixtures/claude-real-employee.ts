/*
 * [OUTPUT]: 真实探测分别保留部分/完整计量，同请求仅一次最终回执；中途已知计数不再被探测器误报断言失败。
 * [INPUT]: 显式已保存连接、实际Claude与隔离内存工作/SQLite会话夹具。
 * [OUTPUT]: 共同员工阶段及原件验证；失败仅记录固定白名单原因，不保存供应商错误，不冒充产品Work/UI。
 * [POS]: Claude引擎真实探测模式，凭据仅在进程内和CLI环境中使用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Artifact, Connection, Message, ModelUsage, WorkOutcome } from '../../src/shared/domain'
import type { TraceSpan } from '../../src/shared/domain/traces'
import type { ClaudePhaseInput } from '../../src/runtime/adapters/claude/turn'
import { ClaudeEmployeeEngine } from '../../src/runtime/adapters/claude/engine'
import type { EngineContext } from '../../src/runtime/contracts'
import type { NativePhase, NativePhaseInput } from '../../src/runtime/adapters/native-employee'
import { ProductStore } from '../../src/runtime/adapters/storage/product-store'
import { claudeProbeContext } from './claude-real-tools'

export async function probeClaudeEmployee(common: Omit<ClaudePhaseInput, 'prompt' | 'instructions'>, connection: Connection, root: string, output: string, steps: unknown[]) {
  const { context: ctx, events, effects }=await claudeProbeContext(root,common.signal)
  const work=ctx.work!,store=new ProductStore(join(root,'employee.sqlite'));await store.init()
  const returned:{phase:string;text:string}[]=[]
  const knownFailures = new Map([
    ['Claude未满足当前无工具或会话隔离策略', 'init-policy'],
    ['Claude事件缺少当前会话身份', 'session-identity'],
    ['Claude返回未授权的工具请求', 'unexpected-tool'],
    ['Claude结构化结果缺少唯一调用身份', 'duplicate-formatter'],
    ['Claude无工具阶段返回工具请求', 'unexpected-assistant-tool'],
    ['Claude宿主工具结果未确认成功', 'tool-result-error'],
    ['Claude结构化完成回执身份不符', 'formatter-receipt'],
    ['Claude未确认成功终态，原请求需要核对', 'unsuccessful-result'],
    ['Claude结构化结果缺少一致的完成回执', 'formatter-result'],
    ['Claude未返回完整终态，原请求需要核对', 'missing-result'],
    ['Claude无工具阶段返回未支持的事件', 'unsupported-event'],
    ['Claude进程未正常结束，原请求需要核对', 'process-exit'],
    ['Claude执行超时，原请求需要核对', 'timeout'],
  ])
  class ObservedClaudeEngine extends ClaudeEmployeeEngine {
    protected async phase(context:EngineContext,phase:NativePhase,input:NativePhaseInput){
      const result=await super.phase(context,phase,input)
      // Only this probe's synthetic context; never store provider errors or keys.
      returned.push({phase,text:result.text.replaceAll(common.apiKey,'[redacted]').slice(0,8000)})
      return result
    }
  }
  const engine=new ObservedClaudeEngine(store);await engine.recover(root)
  const token=`山竹-${randomUUID().slice(0,8)}`,date=new Date().toISOString()
  const usages:{id:string;usage:ModelUsage}[]=[],receipts:{id:string;usage:ModelUsage;complete:boolean}[]=[],started:{id:string;phase:string}[]=[],artifacts:Artifact[]=[],outcomes:WorkOutcome[]=[]
  const traces:TraceSpan[]=[]
  let reply=''
  const user=(id:string,sequence:number,content:string):Message=>({id,sequence,conversationId:ctx.conversation.id,senderType:'user',senderId:'user',senderName:'User',status:'completed',content,createdAt:date})
  const published=(id:string,sequence:number):Message=>({...user(id,sequence,reply),senderType:'agent',senderId:ctx.agent.id,senderName:ctx.agent.name,runId:ctx.runId})
  ctx.agent={...ctx.agent,connectionId:connection.id,executionBackend:{kind:'claude-local',profileId:'profile'}}
  ctx.runtimeProfile={id:'profile',name:'本场Claude',protocol:'claude-cli',executable:common.program.executable,executableHash:common.program.executableHash,runtime:common.program.runtime,args:[],useExistingLogin:false,hostAccessAcknowledged:true,revision:1,verified:{name:'Claude',version:common.program.version,protocolVersion:1,checkedAt:date}}
  ctx.connection=connection;ctx.apiKey=common.apiKey;ctx.runtimeDirectory={cwd:ctx.workspace!.workPath,privateHome:join(root,'employee-config')}
  ctx.work=undefined;ctx.responseKind='chat';ctx.messages=[user('first',1,`请记住本场暗号${token}，仅回复“收到”。`)];ctx.triggerMessageId='first'
  ctx.onDelta=async text=>{reply+=text}
  ctx.onModelCallStarted=async(id,phase)=>{started.push({id,phase})}
  ctx.onTrace=async span=>{traces.push(structuredClone(span))}
  ctx.onModelCallUsage=async(id,usage,complete)=>{
    assert.ok(complete===true||complete===false)
    receipts.push({id,usage,complete})
    if(complete) { assert.ok(!usages.some(item=>item.id===id));usages.push({id,usage}) }
  }
  const phase=async<T>(name:string,operation:()=>Promise<T>)=>{
    ctx.modelCallId=`probe-${name}`
    try {const result=await operation();steps.push({kind:name,result,usage:usages.find(item=>item.id===ctx.modelCallId)?.usage});return result}
    catch(error){steps.push({kind:name,failed:true,errorType:error instanceof Error?error.name:'unknown',failureCode:error instanceof Error?knownFailures.get(error.message)??'unspecified':'unspecified',started:[...started],usages:[...usages],receipts:[...receipts],traces:[...traces],returned:[...returned]});throw error}
  }
  try {
    const decision=await phase('employee-decision',()=>engine.decide(ctx));assert.equal(decision.action,'reply');assert.equal(decision.responseKind,'chat')
    await phase('employee-first-chat',async()=>{await engine.run(ctx);return reply});assert.ok(reply.includes('收到'))
    const first=(await store.load<{threadId:string;completedInvocationId:string}>('claudeSessions'))[0]
    ctx.messages.push(published('reply-1',2),user('second',3,'刚才的暗号是什么？只回答暗号。'));ctx.runId='resume-run';ctx.triggerMessageId='second';reply=''
    await phase('employee-resumed-chat',async()=>{await engine.run(ctx);return reply});assert.ok(reply.includes(token))
    const resumed=(await store.load<typeof first>('claudeSessions'))[0];assert.equal(first.threadId,resumed.threadId);assert.equal(resumed.completedInvocationId,ctx.runId)
    ctx.messages.push(published('reply-2',4))
    await phase('employee-private-memory',()=>engine.extractMemory(ctx));assert.equal(events.length,0)
    const proof=`员工引擎文件-${randomUUID()}`
    ctx.runId=work.activeRunId!;ctx.work={...work,sourceMessageId:'task',deliverable:'写入并发布本场明确原件'};ctx.responseKind='task'
    ctx.messages.push(user('task',5,`请在默认任务目录创建proof.txt，正文必须仅为${proof}，然后发布这份文件。不要执行命令，不要追加换行，只发布一次。`));ctx.triggerMessageId='task';reply=''
    ctx.onArtifact=async artifact=>{assert.ok(artifact.id);artifacts.push(artifact);ctx.work!.artifactIds.push(artifact.id);await writeFile(join(dirname(output),'employee-proof.txt'),await readFile(artifact.path),{flag:'wx'})}
    ctx.onWorkOutcome=async outcome=>{outcomes.push(outcome);ctx.work!.outcome=outcome}
    await phase('employee-host-task',async()=>{await engine.run(ctx);return {text:reply,events:[...events],outcomes:[...outcomes],effects:[...effects]}})
    assert.equal(artifacts.length,1);const bytes=await readFile(artifacts[0].path);assert.equal(bytes.toString(),proof)
    assert.equal(outcomes.at(-1)?.disposition,'delivered');assert.ok(outcomes.at(-1)?.evidence?.some(item=>item.kind==='artifact'&&item.reference===artifacts[0].id))
    const priorEvents=events.length
    const report=await phase('employee-private-report',()=>engine.report(ctx,{text:reply,observedThroughSequence:5,revisions:0,status:'private'}))
    assert.equal(report.action,'publish');assert.equal(events.length,priorEvents)
    steps.push({kind:'employee-receipt-summary',started,usages,receipts,traces,sessions:await store.load('claudeSessions'),file:{name:'employee-proof.txt',bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')},productWorkPersisted:false,productArtifactRecordPersisted:false,uiVerified:false})
  } finally {await store.close()}
}

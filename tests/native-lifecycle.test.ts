/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [INPUT]: 第13组11现行原生合同、实际AppService和隔离协议进程。
 * [OUTPUT]: 原生失败/未知副作用、路径别名且不放行符号链接、子执行、完整分页、运行切换、审批和并发的生产接线回归。
 * [POS]: 替代旧claude-product及Codex五阶段产品断言；旧阶段传输测试仍保留。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nativeFixture } from './fixtures/native-product'
import type { Conversation, ConversationDetail, DigitalAgent } from '../src/shared/domain'
import type { NativeAction, ExecutionEvidencePage, ExecutionEvidence } from '../src/shared/domain/execution'
import { ExecutionWindow } from '../src/renderer/components/detail-panel/execution-window'
const disposals:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const dispose of disposals.splice(0).reverse())await dispose()})
describe.each(['codex','claude'] as const)('%s 原生生命周期',runtime=>{
 const setup=()=>nativeFixture(runtime,disposals)
 it('publishes the same workspace file through the OS canonical path alias',async()=>{
  const f=await nativeFixture(runtime,disposals,undefined,false),d=await f.wait(await f.send('NATIVE_CANONICAL_PATH'))
  expect(d.runs[0].status,d.runs[0].error).toBe('completed')
  expect(d.artifacts).toHaveLength(1);expect(d.workItems?.[0].status).toBe('delivered')
 })
 it('still refuses a symlink inside the workspace when normalizing its root alias',async()=>{
  const f=await setup(),d=await f.wait(await f.send('NATIVE_SYMLINK_PATH'))
  expect(d.runs[0].status).toBe('failed')
  expect(d.runs[0].toolEvents.some(event=>event.name==='publish_artifact'&&event.status==='failed'&&event.detail?.includes('Symbolic links'))).toBe(true)
  expect(d.artifacts).toHaveLength(0)
 })
 it('preserves a native authentication error without API fallback or an extra request',async()=>{
  const f=await setup(),d=await f.wait(await f.send('NATIVE_FAILURE'))
  expect(d.runs).toHaveLength(1);expect(d.runs[0].status).toBe('failed');expect(d.runs[0].error).toContain('401')
  expect(d.runs[0].backend?.externalInvocations).toBe(1);expect(d.artifacts).toHaveLength(0)
  await f.restart();expect((await f.detail()).runs).toHaveLength(1)
 })
 it('does not replay an actual side effect after the native process exits without a result',async()=>{
  const f=await setup(),d=await f.wait(await f.send('NATIVE_UNKNOWN'))
  expect(d.runs[0].status).toBe('failed');expect(d.artifacts).toHaveLength(0)
  const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
  expect(await readFile(join(cwd,'unknown-effect'),'utf8')).toBe('once')
  await f.restart();expect((await f.detail()).runs).toHaveLength(1)
  expect((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n')).toHaveLength(1)
 })
 it('retains all plugin steps across pages and attributes native children to their actual parent',async()=>{
  const f=await setup(),d=await f.wait(await f.send('NATIVE_MANY NATIVE_SUBAGENT'))
  expect(d.runs[0].status,d.runs[0].error).toBe('completed')
  const read=async()=>{let after:number|undefined;const events:ExecutionEvidence[]=[];do{const page=await f.service.handle('listExecutionEvidence',{conversationId:f.chat.id,runId:d.runs[0].id,after}) as ExecutionEvidencePage;events.push(...page.items);after=page.next}while(after!==undefined);return events}
  const events=await read(),steps=events.filter(e=>e.canonical?.operationId.startsWith('step-'))
  expect(steps).toHaveLength(125);expect(new Set(steps.map(e=>e.sequence)).size).toBe(125)
  const child=events.find(e=>e.canonical?.operationId.endsWith('child-read'))!
  expect(child.parentId).toBe('spawn');expect(JSON.stringify(child.payload)).toContain('child-evidence')
  expect(d.messages.filter(m=>m.senderType==='agent')).toHaveLength(1)
  const window=new ExecutionWindow(f.chat.id,d.runs[0].id,12,params=>f.service.handle('listExecutionWindow',{conversationId:params.threadId,runId:params.agentRunId,beforeSequence:params.beforeSequence,afterSequence:params.afterSequence,limit:params.limit}) as Promise<import('../src/shared/rovai/contracts').AgentRunExecutionBlockPage>,()=>{},params=>f.service.handle('listExecutionWindow',{conversationId:params.threadId,runId:params.agentRunId,afterChangeSequence:params.afterChangeSequence,limit:params.limit}) as Promise<import('../src/shared/rovai/contracts').AgentRunExecutionBlockChanges>)
  await window.latest();expect(window.error).toBeNull();expect(window.hasEarlier).toBe(true)
  while(window.hasEarlier){await window.earlier();expect(window.error).toBeNull()}
  expect(window.evidence.map(e=>e.id)).toEqual(events.map(e=>e.id));await window.refresh();expect(window.error).toBeNull();window.dispose()

  await f.restart();expect(await read()).toEqual(events)
 })
 it('accepts only the selected native approval once and preserves the real effect',async()=>{
  const f=await setup(),message=await f.send('NATIVE_APPROVAL');let action:NativeAction|undefined,runId=''
  await expect.poll(async()=>{runId=(await f.detail()).runs[0]?.id??'';if(!runId)return;action=(await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}) as NativeAction[])[0];return action?.status},{timeout:15000}).toBe('pending')
  const request={conversationId:f.chat.id,runId,actionId:action!.id,response:{option:runtime==='codex'?'accept':'allow'}}
  await f.service.handle('respondNativeAction',request);const d=await f.wait(message)
  expect(d.runs[0].status,d.runs[0].error).toBe('completed')
  await expect(f.service.handle('respondNativeAction',request)).rejects.toThrow()
  expect(await readFile(join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work','permission-marker'),'utf8')).toBe('approved')
 })
 it('starts unrelated native employees concurrently even when both can run commands',async()=>{
  const f=await setup(),{id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
  const peer=await f.service.handle('saveAgent',{...input,name:'另一个员工'}) as DigitalAgent
  const chat=await f.service.handle('createConversation',{kind:'group',title:'并行原生',agentIds:[f.agent.id,peer.id]}) as Conversation
  await f.service.handle('sendMessage',{conversationId:chat.id,content:'NATIVE_WAIT',mentionIds:[],requestId:crypto.randomUUID()})
  let d:ConversationDetail|undefined
  await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs.filter(r=>r.backend?.inputAccepted&&r.status==='running').length},{timeout:4000}).toBe(2)
  for(const run of d!.runs)await f.service.handle('stopNativeExecution',{conversationId:chat.id,runId:run.id})
 })
 it('refuses a removed member and creates a distinct group session without reusing direct history',async()=>{
  const f=await setup(),direct=await f.wait(await f.send('DIRECT_PRIVATE_CANARY'))
  const chat=await f.service.handle('createConversation',{kind:'group',title:'组内身份',agentIds:[f.agent.id]}) as Conversation
  await f.service.handle('sendMessage',{conversationId:chat.id,content:'群中交流',mentionIds:[],requestId:crypto.randomUUID()})
  let d:ConversationDetail|undefined
  await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs[0]?.status},{timeout:15000}).toBe('completed')
  expect(d!.runs[0].backend?.sessionId).not.toBe(direct.runs[0].backend?.sessionId)
  const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',chat.id,'work')
  expect(await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).not.toContain('DIRECT_PRIVATE_CANARY')
 })
 it.each(['NATIVE_PUBLIC','NATIVE_PUBLIC_ONLY','NATIVE_PUBLIC_DIFFERENT','NATIVE_PUBLIC_FAIL'])('publishes ordinary messages once without creating Work: %s',async(mode)=>{
  const f=await setup(),d=await f.wait(await f.send(mode)),messages=d.messages.filter(message=>message.senderType==='agent')
  expect(messages.filter(message=>message.content==='普通公开消息已送达')).toHaveLength(1)
  expect(messages.every(message=>!!message.content)).toBe(true)
  expect(messages).toHaveLength(mode==='NATIVE_PUBLIC_DIFFERENT'?2:1)
  expect(d.workItems).toHaveLength(0)
  expect(d.runs[0].status,d.runs[0].error).toBe(mode==='NATIVE_PUBLIC_FAIL'?'failed':'completed')
  expect(messages[0].status).toBe('completed')
  await f.restart();expect((await f.detail()).messages.filter(message=>message.senderType==='agent')).toEqual(messages)
 })

 it('keeps reported model capacity without BOAI native usage or cost accounting',async()=>{
  const f=await setup(),d=await f.wait(await f.send('你好'))
  expect(d.runs[0].backend?.contextWindowTokens).toBe(200000)
  expect(d.runs[0].backend?.contextUsedTokens).toBeUndefined()
  expect(d.runs[0].backend?.totalCostUsd).toBeUndefined()
  expect(d.runs[0].usage).toBeUndefined()
 })

 it('deduplicates public/final whitespace without discarding the native session',async()=>{
  const f=await setup(),first=await f.wait(await f.send('NATIVE_PUBLIC_SPACES')),next=await f.wait(await f.send('继续'))
  expect(first.messages.filter(message=>message.senderType==='agent')).toHaveLength(1)
  expect(new Set(next.runs.map(run=>run.backend?.sessionId)).size).toBe(1)
 })
 it('does not accept an unrelated artifact as a native work result',async()=>{
  const f=await setup(),d=await f.wait(await f.send('NATIVE_BAD_EVIDENCE'))
  expect(d.runs[0].status).toBe('failed')
  expect(d.runs[0].error).toContain('成果不属于本次已声明依赖')
  expect(d.workItems?.some(work=>work.status==='delivered')).toBe(false)
 })

})

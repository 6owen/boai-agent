#!/usr/bin/env node
/*
 * [OUTPUT]: 协议夹具支持仅第二员工提问延迟1200ms，真实提问/回答协议保持；不认证模型或生产延迟。
 * [OUTPUT]: 执行未完成时的正文/思考增量回归，最终答复与私有协议字段保持分离。
 * [OUTPUT]: 固定文件修订从宿主授权原消息取 revisionRequestId，允许独立内部会话无旧交付历史；普通同会话修订保持。
 * [OUTPUT]: 原生浏览器实际stdio/MCP媒体与只读到真实Work写入接线；协议夹具不冒充真实模型或Electron页面。
 * [OUTPUT]: 高原生用量/提问/发布合同夹具；原回答消费原件，无真实模型调用。
 * [INPUT]: 隔离原生协议测试的逐轮消息。
 * [OUTPUT]: 真实stdio进程/文件副作用/原生批准与工具回执；明确为离线夹具，不调用模型。
 * [POS]: 第13组持续本机会话合同夹具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { business, consumeNativeMaterials } from './native-business.mjs'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { writeFile, appendFile } from 'node:fs/promises'
const send = value => process.stdout.write(JSON.stringify(value)+'\n')
const callbacks = new Map()
const ask = (method, params) => { const id=randomUUID();send({id,method,params});return new Promise(resolve=>callbacks.set(id,resolve)) }
createInterface({input:process.stdin}).on('line',async line=>{
 const {id,method,params,result,error}=JSON.parse(line)
 if(!method) { callbacks.get(id)?.({result,error});callbacks.delete(id);return }
 if(method==='initialize')return send({id,result:{userAgent:'boai_agent/0.161.0 (fixture)'}})
 if(method==='initialized')return
 if(method==='account/read')return send({id,result:{requiresOpenaiAuth:false,account:{type:'apiKey'}}})
 if(method==='config/read')return send({id,result:{config:{}}})
 if(method==='model/list')return send({id,result:{data:[{model:'fixture'}],nextCursor:null}})
 if(method==='thread/start'||method==='thread/resume'){
  await appendFile('native-thread-requests.jsonl',JSON.stringify({method,params})+'\n')
  return send({id,result:{thread:{id:params.threadId??randomUUID()},model:'fixture'}})
 }
 if(method!=='turn/start')return send({id,error:{code:-32601,message:method}})
 const turnId=randomUUID(), threadId=params.threadId, ev=(method,rest)=>send({method,params:{threadId,turnId,...rest}})
 await appendFile('native-turn-requests.jsonl',JSON.stringify(params)+'\n')
 send({id,result:{turn:{id:turnId}}})
 const prompt=JSON.parse(params.input[0].text),text=prompt.messages.map(m=>m.content).join('\n')
 const tool=async(name,input,callId=randomUUID())=>{const answer=await ask('item/tool/call',{threadId,turnId,namespace:'boai',tool:name,callId,arguments:input});if(!answer.result?.success)throw Error(JSON.stringify(answer));return name==='browser_tool'?answer.result.contentItems:JSON.parse(answer.result.contentItems[0].text)}

 if(text.includes('NATIVE_FAILURE')){ev('turn/completed',{turn:{id:turnId,status:'failed',error:{message:'401 native authentication failed'}}});return}
 if(text.includes('NATIVE_UNKNOWN')){await writeFile('unknown-effect','once');process.exit(3)}
 if(text.includes('NATIVE_SUBAGENT')){
  ev('item/started',{item:{id:'spawn',type:'collabAgentToolCall',tool:'spawnAgent',receiverThreadIds:['native-child'],status:'inProgress'}})
  send({method:'turn/started',params:{threadId:'native-child',turn:{id:'child-turn'}}})
  send({method:'item/completed',params:{threadId:'native-child',turnId:'child-turn',item:{id:'child-read',type:'commandExecution',command:'cat child.txt',aggregatedOutput:'child-evidence',status:'completed',exitCode:0}}})
  ev('item/completed',{item:{id:'spawn',type:'collabAgentToolCall',tool:'spawnAgent',receiverThreadIds:['native-child'],status:'completed'}})
 }
 if(text.includes('NATIVE_MANY'))for(let index=0;index<125;index++)ev('item/completed',{item:{id:'step-'+index,type:'mcpToolCall',server:'native-plugin',tool:'search',arguments:{index},result:'step-'+index,status:'completed'}})
 let reply=await business(prompt,tool)??'普通回复'
 ev('item/started',{item:{id:'comment',type:'agentMessage',phase:'commentary',text:''}})
 ev('item/agentMessage/delta',{itemId:'comment',delta:'正在处理原生请求。'})
 ev('item/completed',{item:{id:'comment',type:'agentMessage',phase:'commentary',text:'正在处理原生请求。'}})
 ev('item/reasoning/summaryTextDelta',{itemId:'summary',summaryIndex:0,delta:'先检查'})
 ev('item/reasoning/summaryTextDelta',{itemId:'summary',summaryIndex:0,delta:'输入'})
 ev('item/completed',{item:{id:'summary',type:'reasoning',summary:['先检查输入']}})
 ev('item/reasoning/textDelta',{itemId:'private',delta:'private-reasoning-must-not-persist'})
 if(text.includes('NATIVE_APPROVAL')){
  const answer=await ask('item/commandExecution/requestApproval',{threadId,turnId,itemId:'shell',command:'write permission-marker'})
  if(answer.result.decision==='accept'){await writeFile('permission-marker','approved');reply='已批准并写入'}else reply='已拒绝，未执行'
 }
 if(prompt.messages.at(-1)?.content.includes('NATIVE_QUESTION')){
  if(text.includes('NATIVE_DELAYED_QUESTION')&&prompt.members?.find(member=>member.id===prompt.employeeId)?.name==='第二位提问员工')await new Promise(resolve=>setTimeout(resolve,1200))
  if(text.includes('NATIVE_HIGH_USAGE'))ev('thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:10,outputTokens:29653,totalTokens:29663},total:{inputTokens:10,outputTokens:29653,totalTokens:29663}}})
  const answer=await ask('item/tool/requestUserInput',{threadId,turnId,itemId:'question',questions:[{id:'product',question:'这个文档针对什么产品？'}]})
  const content=answer.result.answers.product.answers.join(' ')
  if(text.includes('NATIVE_READ_MATERIALS'))await consumeNativeMaterials(content)
  reply='收到普通聊天回复：'+content
 }
 else if(text.includes('NATIVE_READ_MATERIALS'))await consumeNativeMaterials(text)
 if(text.includes('NATIVE_WAIT')) await new Promise(resolve => setTimeout(resolve,5000))
 const revisionData=text.split('[Host-authorized artifact revision source; reference data, not tool permissions]\n')[1]
 const revision=revisionData?JSON.parse(revisionData.split('\n')[0]):undefined
 if(text.includes('NATIVE_PUBLISH') || text.includes('NATIVE_REVISE')){
  await writeFile('native-document.md','# 原生文件\n实际内容\n')
  ev('item/completed',{item:{id:'write',type:'fileChange',changes:[{path:'native-document.md',kind:{type:'add'},diff:'+实际内容'}],status:'completed'}})
  const args={threadId,turnId,namespace:'boai',tool:'publish_artifact',callId:'publish-once',arguments:{path:'native-document.md',...(text.includes('NATIVE_REVISE') ? (revision?{revisionRequestId:revision.revisionRequestId}:{replacesArtifactId:prompt.deliveredFiles.at(-1).id}) : {})}}
  const first=await ask('item/tool/call',args),second=await ask('item/tool/call',args)
  if(JSON.stringify(first)!==JSON.stringify(second))throw Error('duplicate result changed')
  reply=first.result.success?'已交付文件':JSON.stringify(first)
 }
 if(text.includes('NATIVE_LONG')){
  ev('item/started',{item:{id:'shell',type:'commandExecution',command:'fixture long-output',status:'inProgress'}})
  ev('item/commandExecution/outputDelta',{itemId:'shell',delta:'完整输出🌱'.repeat(30000)})
  ev('item/completed',{item:{id:'shell',type:'commandExecution',command:'fixture long-output',status:'completed',exitCode:0}})
  ev('plugin/newOperation',{itemId:'extension',title:'原生插件事件',result:'full extension'})
 }
 ev('item/completed',{item:{id:'answer',type:'agentMessage',phase:'final_answer',text:reply}})
 const outputTokens=text.includes('NATIVE_HIGH_USAGE')?29653:5
 ev('thread/tokenUsage/updated',{tokenUsage:{modelContextWindow:200000,last:{inputTokens:10,outputTokens,totalTokens:10+outputTokens},total:{inputTokens:10,outputTokens,totalTokens:10+outputTokens}}})
 ev('turn/completed',{turn:{id:turnId,status:'completed'}})
})

#!/usr/bin/env node
/*
 * [OUTPUT]: 执行未完成时的正文/思考增量回归，最终答复与私有协议字段保持分离。
 * [OUTPUT]: 固定文件修订从宿主授权原消息取 revisionRequestId，允许独立内部会话无旧交付历史；普通同会话修订保持。
 * [OUTPUT]: 新增先错误result再非零退出协议，不代替真实供应商错误。
 * [OUTPUT]: 原生浏览器实际stdio/MCP媒体与只读到真实Work写入接线；协议夹具不冒充真实模型或Electron页面。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 高用量及待决追问合同夹具；原件/公开模型目录与缺失保持，零模型。
 * [INPUT]: 原生Claude合同的隔离消息与本机MCP桥。
 * [OUTPUT]: 真实双向stdio/HTTP、工具文件与批准夹具；不是模型质量证据。
 * [POS]: 持续Claude生产驱动回归。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { business, consumeNativeMaterials } from './native-business.mjs'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { readFile, appendFile, writeFile } from 'node:fs/promises'
if(process.argv.includes('--version')) { process.stdout.write('2.1.140 (Claude Code)\n');process.exit(0) }
const arg=name=>process.argv[process.argv.indexOf(name)+1]
const session=arg(process.argv.includes('--resume')?'--resume':'--session-id')
const emit=value=>process.stdout.write(JSON.stringify({session_id:session,...value})+'\n')
const mcp=JSON.parse(await readFile(arg('--mcp-config'),'utf8')).mcpServers.boai
let sessionHeader,rpc=0
async function request(method,params,notification=false){
 const response=await fetch(mcp.url,{method:'POST',headers:{...mcp.headers,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(sessionHeader?{'Mcp-Session-Id':sessionHeader,'MCP-Protocol-Version':'2025-11-25'}:{})},body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id:++rpc}),method,...(params?{params}:{})})})
 sessionHeader=response.headers.get('mcp-session-id')??sessionHeader
 if(notification)return
 const json=await response.json();if(json.error)throw Error(JSON.stringify(json.error));return json.result
}
await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'native fixture',version:'1'}})
await request('notifications/initialized',undefined,true)
const callbacks=new Map()
const ask=(name,input)=>{const id=randomUUID();emit({type:'control_request',request_id:id,request:{subtype:'can_use_tool',tool_name:name,tool_use_id:randomUUID(),input}});return new Promise(resolve=>callbacks.set(id,resolve))}
const tool=async(name,input,id=randomUUID())=>{
 emit({type:'assistant',message:{id:randomUUID(),content:[{type:'tool_use',id,name:'mcp__boai__'+name,input}]}})
 const result=await request('tools/call',{name,arguments:input,_meta:{'claudecode/toolUseId':id}})
 emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content:result.content,is_error:result.isError}]}})
 if(result.isError)throw Error(result.content[0].text)
 return name==='browser_tool'?result.content:JSON.parse(result.content[0].text)
}
await appendFile('native-thread-requests.jsonl',JSON.stringify({method:process.argv.includes('--resume')?'thread/resume':'thread/start',params:{argv:process.argv.slice(2),session}})+'\n')
createInterface({input:process.stdin}).on('line',async line=>{
 const frame=JSON.parse(line)
 if(frame.type==='control_response'){callbacks.get(frame.response.request_id)?.(frame.response.response);callbacks.delete(frame.response.request_id);return}
 if(frame.type==='control_request'){
  emit({type:'control_response',response:{subtype:'success',request_id:frame.request_id,response:arg('--model')==='missing-meta-fixture'?{}:{models:[{value:'alias-fixture',displayName:'fixture-main[1m]',description:'Public native model'}],commands:[{name:'native-command',description:'Public command'}],agents:[{name:'native-worker',description:'Public agent'}],account:{token:'PRIVATE_ACCOUNT_TOKEN'},pid:process.pid}}});return
 }
 if(frame.type!=='user')return
 try {
 const raw=typeof frame.message.content==='string'?frame.message.content:frame.message.content.find(v=>v.type==='text').text
 const prompt=JSON.parse(raw),text=prompt.messages.map(m=>m.content).join('\n')
 const selected=arg('--model'),resolved=selected==='alias-fixture'?'fixture-main[1m]':selected==='missing-meta-fixture'?undefined:'fixture'
 emit({type:'system',subtype:'init',...(resolved?{model:resolved}:{}),tools:['Read','Bash'],agents:['native-worker'],account:{token:'PRIVATE_SYSTEM_TOKEN'}})
 await appendFile('native-turn-requests.jsonl',JSON.stringify({input:[{type:'text',text:raw}]})+'\n')
 emit({type:'system',subtype:'session_state_changed',state:'working'})
 const id=randomUUID(),stream=event=>emit({type:'stream_event',event})
 stream({type:'message_start',message:{id,model:'fixture',usage:{input_tokens:text.includes('NATIVE_CONFLICTING_USAGE')?1000:10,cache_creation_input_tokens:0,cache_read_input_tokens:0,output_tokens:0}}})
 stream({type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'先检查'}})
 stream({type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'输入'}})
 stream({type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'private-reasoning-must-not-persist'}})
 stream({type:'content_block_start',index:1,content_block:{type:'text',text:''}})
 stream({type:'content_block_delta',index:1,delta:{type:'text_delta',text:'正在处理原生请求。'}})
 emit({type:'assistant',message:{id,content:[{type:'text',text:'正在处理原生请求。'}]}})

 if(text.includes('NATIVE_NONZERO_RESULT')){process.exitCode=1;emit({type:'result',subtype:'error',is_error:true,errors:['400 native tool schema rejected']});emit({type:'system',subtype:'session_state_changed',state:'idle'});return}
 if(text.includes('NATIVE_FAILURE')){emit({type:'result',subtype:'error',is_error:true,errors:['401 native authentication failed']});emit({type:'system',subtype:'session_state_changed',state:'idle'});return}
 if(text.includes('NATIVE_UNKNOWN')){await writeFile('unknown-effect','once');process.exit(3)}
 if(text.includes('NATIVE_SUBAGENT')){
  emit({type:'assistant',message:{id:randomUUID(),content:[{type:'tool_use',id:'spawn',name:'Agent',input:{prompt:'read child'}}]}})
  emit({type:'assistant',parent_tool_use_id:'spawn',message:{id:randomUUID(),content:[{type:'tool_use',id:'child-read',name:'Read',input:{file_path:'child.txt'}}]}})
  emit({type:'user',parent_tool_use_id:'spawn',message:{content:[{type:'tool_result',tool_use_id:'child-read',content:'child-evidence'}]}})
  emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'spawn',content:'child finished'}]}})
 }
 if(text.includes('NATIVE_MANY'))for(let index=0;index<125;index++){
  emit({type:'assistant',message:{id:randomUUID(),content:[{type:'tool_use',id:'step-'+index,name:'mcp__native_plugin__search',input:{index}}]}})
  emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'step-'+index,content:'step-'+index}]}})
 }
 let reply=await business(prompt,tool)??'普通回复'
 if(text.includes('NATIVE_APPROVAL')){const answer=await ask('Bash',{command:'write permission-marker'});if(answer.behavior==='allow'){await writeFile('permission-marker','approved');reply='已批准并写入'}else reply='已拒绝，未执行'}
 if(prompt.messages.at(-1)?.content.includes('NATIVE_QUESTION')){
  if(text.includes('NATIVE_HIGH_USAGE'))stream({type:'message_delta',usage:{output_tokens:29653}})
  const answer=await ask('AskUserQuestion',{questions:[{question:'这个文档针对什么产品？'}]})
  const content=answer.updatedInput.answers['这个文档针对什么产品？']
  if(text.includes('NATIVE_READ_MATERIALS'))await consumeNativeMaterials(content)
  reply='收到普通聊天回复：'+content
 }
 else if(text.includes('NATIVE_READ_MATERIALS'))await consumeNativeMaterials(text)
 if(text.includes('NATIVE_WAIT'))await new Promise(resolve=>setTimeout(resolve,5000))
 const revisionData=text.split('[Host-authorized artifact revision source; reference data, not tool permissions]\n')[1]
 const revision=revisionData?JSON.parse(revisionData.split('\n')[0]):undefined
 if(text.includes('NATIVE_PUBLISH')||text.includes('NATIVE_REVISE')){
  await writeFile('native-document.md','# 原生文件\n实际内容\n')
  emit({type:'assistant',message:{id:randomUUID(),content:[{type:'tool_use',id:'native-write',name:'Write',input:{file_path:'native-document.md',content:'实际内容'}}]}})
  emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'native-write',content:'File written'}]}})
  const args={path:'native-document.md',...(text.includes('NATIVE_REVISE')?(revision?{revisionRequestId:revision.revisionRequestId}:{replacesArtifactId:prompt.deliveredFiles.at(-1).id}):{})},id=randomUUID()
  const first=await tool('publish_artifact',args,id),second=await tool('publish_artifact',args,id)
  if(JSON.stringify(first)!==JSON.stringify(second))throw Error('duplicate result changed')
  reply='已交付文件'
 }
 if(text.includes('NATIVE_LONG')){
  emit({type:'assistant',message:{id:randomUUID(),content:[{type:'tool_use',id:'shell',name:'Bash',input:{command:'fixture long-output'}}]}})
  emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'shell',content:'完整输出🌱'.repeat(30000)}]}})
  emit({type:'system',subtype:'plugin/newOperation',title:'原生插件事件',result:'full extension'})
 }
 const modelUsage=selected==='alias-fixture'?{'fixture-main[1m]':{contextWindow:1000000},...(!text.includes('NATIVE_METADATA_NEXT')?{fixture:{contextWindow:200000}}:{})}:selected==='missing-meta-fixture'?{}:{fixture:{contextWindow:200000}}
 emit({type:'result',subtype:'success',result:reply,total_cost_usd:0.001,modelUsage,usage:{input_tokens:10,cache_creation_input_tokens:0,cache_read_input_tokens:0,output_tokens:text.includes('NATIVE_HIGH_USAGE')?29653:5}})
 emit({type:'system',subtype:'session_state_changed',state:'idle'})
 }catch(error){emit({type:'result',subtype:'error',is_error:true,errors:[String(error)]});emit({type:'system',subtype:'session_state_changed',state:'idle'})}
})

#!/usr/bin/env node
/*
 * [INPUT]: Isolated Pi RPC or ACP stdio requests; ACP separates instructions and JSON without relying on JSON key order.
 * [OUTPUT]: Deterministic native lifecycle/tool side effects; no model is called.
 * [POS]: Runtime plugin protocol fixture shared by module and Electron tests.
 * [PROTOCOL]: Update fixtures/.folder.md with behavior changes.
 */
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { business } from './native-business.mjs'
if (process.argv.includes('--version')) { process.stdout.write('0.85.1\n'); process.exit(0) }
const args = process.argv.slice(2), arg = name => args[args.indexOf(name) + 1]
const pi = args.includes('--mode'), send = value => process.stdout.write(JSON.stringify(value) + '\n')
const sessionPath = pi ? args.includes('--session') ? arg('--session') : join(arg('--session-dir') || process.cwd(), `${randomUUID()}.jsonl`) : join(process.cwd(), 'acp-session.json')
let session = { id: randomUUID(), messages: [] }, running = false, bridge, handlers = new Map(), callbacks = new Map()
try { session = JSON.parse(await readFile(sessionPath, 'utf8')) } catch {}
if (pi && args.includes('--extension')) await (await import(pathToFileURL(arg('--extension')).href)).default({ registerTool: tool => handlers.set(tool.name, tool) })
async function tool(name, input, callId = randomUUID()) {
 if (pi) { const value = await handlers.get(name).execute(callId, input, new AbortController().signal); return JSON.parse(value.content[0].text) }
 const response = await fetch(bridge, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:callId,method:'tools/call',params:{name,arguments:input,callId}}) }),value = await response.json()
 if(value.error || value.result.isError)throw Error(JSON.stringify(value));return JSON.parse(value.result.content[0].text)
}
async function prompt(frame, input) {
 const source = pi ? input : input[0].text.slice(input[0].text.lastIndexOf('\n\n') + 2)
 const data = JSON.parse(source), content = data.messages.map(message=>message.content).join('\n')
 await appendFile(join(process.cwd(),'plugin-submissions.jsonl'),JSON.stringify({sessionId:session.id,input:data})+'\n')
 session.messages.push(content);await mkdir(join(sessionPath,'..'),{recursive:true});await writeFile(sessionPath,JSON.stringify(session))
 running=true
 if(content.includes('PLUGIN_UNKNOWN')){await appendFile('plugin-effects.txt','once\n');process.exit(3)}
 if(pi)send({type:'response',id:frame.id,command:'prompt',success:true})
 const delta = value => pi ? send({type:'message_update',assistantMessageEvent:{type:'text_delta',contentIndex:0,delta:value}}) : send({jsonrpc:'2.0',method:'session/update',params:{sessionId:session.id,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:value}}}})
 if(pi)send({type:'message_start',message:{role:'assistant'}})
 delta('正在处理\u2028完整行')
 if(content.includes('PLUGIN_WAIT'))return
 if(content.includes('PLUGIN_ACTION')) {
  const id=randomUUID(), result=await new Promise(resolve=>{callbacks.set(id,resolve);if(pi)send({type:'extension_ui_request',id,method:'confirm',title:'原生权限核对',message:'允许夹具操作？'});else send({jsonrpc:'2.0',id,method:'session/request_permission',params:{sessionId:session.id,toolCall:{toolCallId:'permission',title:'原生权限核对'},options:[{optionId:'yes',kind:'allow_once',name:'允许'},{optionId:'no',kind:'reject_once',name:'拒绝'}]}})})
  if(pi?result.confirmed:result.result?.outcome.optionId==='yes')await writeFile('plugin-approved.txt','yes')
 }
 let text = await business(data,tool) ?? `插件回复 ${session.messages.length}`
 if(content.includes('PLUGIN_PUBLISH')){await writeFile('plugin.md','# 插件成果\n');await tool('publish_artifact',{path:'plugin.md'});text='插件文件已交付'}
 if(pi){send({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text}]}});send({type:'agent_end',messages:[]});send({type:'agent_settled'})}
 else {delta(text);send({jsonrpc:'2.0',id:frame.id,result:{stopReason:'end_turn'}})}
 running=false
}
async function handle(frame){
 if(callbacks.has(frame.id)){callbacks.get(frame.id)(frame);callbacks.delete(frame.id);return}
 if(pi){
  if(frame.type==='get_state')return send({type:'response',id:frame.id,command:frame.type,success:true,data:{sessionId:session.id,sessionFile:sessionPath,isStreaming:running,pendingMessageCount:0}})
  if(frame.type==='prompt')return prompt(frame,frame.message)
  if(frame.type==='abort'){running=false;send({type:'agent_settled'})}
  return send({type:'response',id:frame.id,command:frame.type,success:true})
 }
 if(!frame.method)return
 const reply=result=>send({jsonrpc:'2.0',id:frame.id,result})
 if(frame.method==='initialize')return reply({protocolVersion:1,agentInfo:{name:'ACP fixture',version:'1.0.0'},agentCapabilities:{loadSession:true,promptCapabilities:{image:true},mcpCapabilities:{http:true}}})
 if(frame.method==='session/new'||frame.method==='session/load'){if(frame.method==='session/load')session.id=frame.params.sessionId;bridge=frame.params.mcpServers[0]?.url;return reply({sessionId:session.id})}
 if(frame.method==='session/prompt')return prompt(frame,frame.params.prompt)
 if(frame.method==='session/cancel'){running=false;return}
 return reply({})
}
let buffer=''
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(line.trim())void handle(JSON.parse(line)).catch(error=>{process.stderr.write(String(error));process.exit(4)})}})

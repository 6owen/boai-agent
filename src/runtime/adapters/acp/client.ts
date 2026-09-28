/*
 * [INPUT]: 已确认的 ACP 启动项、取消信号、任务与审批回调。
 * [OUTPUT]: 指定登录目录/Node 启动、握手及会话验证、隔离凭据的任务执行和进程树回收。
 * [POS]: runtime/adapters/acp 的 ACP v1 stdio 客户端；外部程序在主机执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Writable, Transform } from 'node:stream'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import type { LaunchProfile } from '../../../shared/domain/backends'
import type { ToolEvent } from '../../../shared/domain'
import { executableIdentity } from '../../modules/backends/profiles'
interface ExternalRequest { profile:LaunchProfile; cwd:string; privateHome?:string; signal:AbortSignal; prompt?:string; approve:(description:string)=>Promise<boolean>; onTool:(event:ToolEvent)=>Promise<void> }
/** ACP v1 adapter. This is a trusted host process, not an OS sandbox. No BYOK secrets, inherited MCP, terminal or filesystem bridge. */
export async function runAcp(input:ExternalRequest){
 const {profile,cwd,signal}=input;signal.throwIfAborted();if(process.platform==='win32')throw new Error('UNSUPPORTED：外部进程树取消尚未在 Windows 开放');const file=await executableIdentity(profile.executable);if(file.hash!==profile.executableHash)throw new Error('外部程序已更新，请重新保存并测试启动项。')
 await mkdir(cwd,{recursive:true});const home=profile.useExistingLogin?process.env.HOME:(input.privateHome??cwd+'.home');if(home&&!profile.useExistingLogin)await mkdir(home,{recursive:true})
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,LANG:process.env.LANG??'en_US.UTF-8',...(home?{HOME:home,USERPROFILE:home}:{}),...(profile.useExistingLogin&&profile.codexHome?{CODEX_HOME:profile.codexHome}:{}),...(profile.runtime==='node'?{ELECTRON_RUN_AS_NODE:'1'}:{}),TMPDIR:cwd,TMP:cwd,TEMP:cwd}
 signal.throwIfAborted()
 const child=spawn(profile.runtime==='node'?process.execPath:file.path,profile.runtime==='node'?[file.path,...profile.args]:profile.args,{cwd,env,shell:false,detached:true,stdio:['pipe','pipe','pipe']});let bytes=0,sessionId='',text='',failure:Error|undefined
 const stopped=new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.once('error',error=>{failure=error;resolve()})})
 function kill(){try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL')}catch{}}
 const limit=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>2*1024*1024){failure=new Error('外部输出超过 2 MiB，任务已停止');kill();callback(failure)}else callback(null,chunk)}})
 child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){failure=new Error('外部输出超过限制');kill()}});child.stdout.pipe(limit);child.stdout.on('error',()=>{});child.stdin.on('error',()=>{});limit.on('error',()=>{})
 const connection=new ClientSideConnection(()=>({
  requestPermission:async request=>{if(signal.aborted||request.sessionId!==sessionId)return {outcome:{outcome:'cancelled' as const}};const option=request.options.find(o=>o.kind==='allow_once');if(!option)return {outcome:{outcome:'cancelled' as const}};const description=`外部 Agent 请求：${request.toolCall.title}\n${JSON.stringify(request.toolCall.rawInput??{}).slice(0,12000)}\n仅批准本次请求。外部程序可使用自己的主机工具。`;const yes=await input.approve(description);return yes&&!signal.aborted?{outcome:{outcome:'selected' as const,optionId:option.optionId}}:{outcome:{outcome:'cancelled' as const}}},
  sessionUpdate:async event=>{if(signal.aborted||event.sessionId!==sessionId)return;const update=event.update;if(update.sessionUpdate==='agent_message_chunk'&&update.content.type==='text')text+=update.content.text;if(update.sessionUpdate==='tool_call'||update.sessionUpdate==='tool_call_update')await input.onTool({id:update.toolCallId,name:'外部工具',detail:(update.title??'外部工具进度').slice(0,2000),status:update.status==='failed'?'failed':update.status==='completed'?'completed':'running',createdAt:new Date().toISOString()})},
 }),ndJsonStream(Writable.toWeb(child.stdin),Readable.toWeb(limit) as ReadableStream<Uint8Array>))
 let killTimer:ReturnType<typeof setTimeout>|undefined
 const abort=()=>{if(sessionId)void connection.cancel({sessionId}).catch(()=>{});killTimer=setTimeout(kill,250)};signal.addEventListener('abort',abort,{once:true})
 try{
  const timeout=AbortSignal.timeout(input.prompt?15*60_000:15_000),effective=AbortSignal.any([signal,timeout]);const aborted=new Promise<never>((_,reject)=>{const stop=()=>{kill();reject(effective.reason)};if(effective.aborted)stop();else effective.addEventListener('abort',stop,{once:true});stopped.then(()=>effective.removeEventListener('abort',stop))})
  const operation=async()=>{const initialized=await connection.initialize({protocolVersion:PROTOCOL_VERSION,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'boai-agent',version:'0.2.2'}});if(initialized.protocolVersion!==PROTOCOL_VERSION)throw new Error('UNSUPPORTED：外部程序未协商 ACP v1');const verified={name:initialized.agentInfo?.name??'ACP Agent',version:initialized.agentInfo?.version??'unknown',protocolVersion:initialized.protocolVersion,checkedAt:new Date().toISOString()};if(verified.version==='unknown')throw new Error('UNSUPPORTED：外部程序未提供可验证版本号');if(input.prompt&&(!profile.verified||profile.verified.name!==verified.name||profile.verified.version!==verified.version))throw new Error('外部 Agent 版本变化，请先测试启动项');const session=await connection.newSession({cwd,mcpServers:[]});sessionId=session.sessionId;signal.throwIfAborted();if(!input.prompt)return {text:'',verified,sessionId};const result=await connection.prompt({sessionId,prompt:[{type:'text',text:input.prompt}]});signal.throwIfAborted();if(result.stopReason!=='end_turn')throw new Error(`外部任务未完成：${result.stopReason}`);if(!text.trim())throw new Error('外部程序没有返回可见运行报告');return {text,verified,sessionId}}
  return await Promise.race([operation(),aborted,stopped.then(()=>{throw failure??new Error('外部进程退出，任务中断')})])
 }finally{signal.removeEventListener('abort',abort);clearTimeout(killTimer);kill();await stopped}
}

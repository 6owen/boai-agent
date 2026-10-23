#!/usr/bin/env node
/*
 * [OUTPUT]: 格式器回执显式提供string/null/number非法is_error及false/缺省合法对照；最终success与structured_output仍一致，用于核对私有完成门禁，原true拒绝/新ID纠正保持。
 * [OUTPUT]: 仅存在本场显式离线标记时，组织负责人在已收到子结果、真实写入后以work/run身份屏障驻留；释放沿原publish/report，取消仍由宿主实际结束进程；无标记原场景保持。
 * [OUTPUT]: 合成认证事件在原私有判断驻留，宿主需停止真实进程并收尾原未知调用；不请求供应商。合成CLI工具错误分别不请求宿主或先完成原写入，再发送错误结果。
 * [OUTPUT]: 明确参数检查标记仅向本机合成端点提交私有报文，保留原模型/消息/格式器且不请求真实供应商。
 * [OUTPUT]: 群更新后的新偏好只引用当前轮实际用户消息；离线受控文件屏障复现原群新消息和私有discard；宿主生产委派/等待/发布仍真实执行，不请求供应商。
 * [OUTPUT]: 原工作记忆来源场景只从维护输入中实际提供的用户偏好生成候选，进度更新不冒充偏好；原委派/等待与生产记忆提交仍由宿主执行。
 * [OUTPUT]: 明确修订只从实际宿主授权来源读取revisionRequestId，生产发布工具登记新版；普通同名文件不推断版本。
 * [OUTPUT]: 首次Work前的原问题/失败追加按实际continuation接续，普通继续无关联；原请求/预算、单次文件与重启不重放。
 * [OUTPUT]: 计量中止场景只发送真实形状的流式计数后驻留，宿主必须保存未知完整性并实际停止进程；不伪造终态。
 * [OUTPUT]: Claude自动化沿原七项表单、原Mastra时钟/occurrence/预算和宿主文件交付接入；明确程序/API来源逐次核对，命令/旧ACP限制保持，实际验证见第13组06 §57。
 * [INPUT]: 共同员工阶段JSON和生产MCP桥的明确目录。
 * [OUTPUT]: 私有格式器纠正/越界与身份故障；原自动化写入准备文件后提问并按明确补充续行；核心/团队/群沿原MCP工具与Work事务，不伪造Work或请求供应商。
 * [POS]: Claude员工引擎模块夹具；不替代真实Claude或员工UI。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const controlRoot = dirname(process.argv[1])
async function controlledWait(name) {
 const started=Date.now()
 while(!existsSync(join(controlRoot,name))){if(Date.now()-started>90000)throw new Error('Synthetic waiting gate timed out');await new Promise(resolve=>setTimeout(resolve,10))}
}
if(process.argv.includes('--version')){console.log('2.1.214 (Claude Code)');process.exit(0)}
const value=key=>process.argv[process.argv.indexOf(key)+1]
const chunks=[];for await(const part of process.stdin)chunks.push(part)
const input=JSON.parse(Buffer.concat(chunks).toString())
const media=value('--input-format')==='stream-json'
const payload=media?JSON.parse(input.message.content.find(block=>block.type==='text').text):input,raw=JSON.stringify(payload)
const images=media?input.message.content.filter(block=>block.type==='image').map(block=>({mime:block.source.media_type,hash:createHash('sha256').update(Buffer.from(block.source.data,'base64')).digest('hex')})):[]
writeFileSync('launched.json',JSON.stringify({payload,args:process.argv.slice(2),images}))
if(raw.includes('CLAUDE_PROVIDER_WIRE')){
 const address=new URL(process.env.ANTHROPIC_BASE_URL)
 if(address.protocol!=='http:'||address.hostname!=='127.0.0.1')throw new Error('Synthetic provider probe only accepts loopback')
 const response=await fetch(new URL('/v1/messages?beta=true',address),{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY},
  body:JSON.stringify({model:value('--model'),messages:[{role:'user',content:raw}],tools:[{name:'StructuredOutput',input_schema:JSON.parse(value('--json-schema'))}],thinking:{type:'adaptive'},output_config:{effort:'low'},stream:false})})
 if(!response.ok)throw new Error('Synthetic provider request rejected')
}
if(images.length)writeFileSync('media-received.json',JSON.stringify({protocol:payload.protocol,payload,images}))
if(payload.protocol==='employee-chat-v1')writeFileSync('chat-received.json',JSON.stringify({payload,images}))
const session=value('--resume')?.match(/^[a-f0-9-]{36}$/)?value('--resume'):randomUUID()
const emit=message=>process.stdout.write(JSON.stringify({session_id:session,...message})+'\n')
let mcp,sessionHeader,rpc=0,names=[]
const config=value('--mcp-config')
const structured=process.argv.includes('--json-schema')
if(!config.startsWith('{')){
 mcp=JSON.parse(readFileSync(config,'utf8')).mcpServers.boai
 await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'synthetic employee',version:'1'}})
 await request('notifications/initialized',undefined,true)
 names=(await request('tools/list',{})).tools.map(tool=>`mcp__boai__${tool.name}`)
}
if(structured){
 if(JSON.parse(value('--json-schema')).$schema!=='http://json-schema.org/draft-07/schema#')throw new Error('Unsupported schema draft')
 names=['StructuredOutput']
}
async function request(method,params,notification=false){
 const response=await fetch(mcp.url,{method:'POST',headers:{...mcp.headers,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(sessionHeader?{'Mcp-Session-Id':sessionHeader,'MCP-Protocol-Version':'2025-11-25'}:{})},body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id:++rpc}),method,...(params?{params}:{})})})
 sessionHeader=response.headers.get('mcp-session-id')??sessionHeader
 if(notification)return
 const json=await response.json();if(json.error)throw new Error('Synthetic MCP request rejected');return json.result
}
emit({type:'system',subtype:'init',claude_code_version:'2.1.214',model:value('--model'),apiKeySource:'ANTHROPIC_API_KEY',permissionMode:'dontAsk',tools:names,mcp_servers:mcp?[{name:'boai',status:'connected'}]:[],plugins:[],skills:[],slash_commands:[]})
if(raw.includes('CLAUDE_API_AUTH_401')&&payload.protocol==='private-participation-v2'){
 emit({type:'system',subtype:'api_retry',error_status:401,error:'sk-private-auth-error',attempt:1,max_retries:10,retry_delay_ms:500.5})
 await new Promise(()=>setInterval(()=>{},1000))
}
if(raw.includes('CLAUDE_TOOL_ERROR_')&&payload.protocol==='employee-task-v1'){
 emit({type:'assistant',parent_tool_use_id:null,message:{content:[{type:'tool_use',id:'private-tool-id',name:'mcp__boai__write_file',input:{path:'self:/work/private-file',content:'tool-input-secret'}}]}})
 if(raw.includes('CLAUDE_TOOL_ERROR_AFTER_REQUEST'))await request('tools/call',{name:'write_file',arguments:{path:'self:/work/private-file',content:'tool-input-secret'},_meta:{'claudecode/toolUseId':'private-tool-id'}})
 emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'private-tool-id',is_error:true,content:'native-error-secret'}]}})
 await new Promise(()=>setInterval(()=>{},1000))
}
if (raw.includes('CLAUDE_USAGE_STOP') && payload.protocol === 'private-participation-v2') {
 const stream=event=>emit({type:'stream_event',parent_tool_use_id:null,event})
 stream({type:'message_start',message:{id:'metered-private-call',usage:{input_tokens:10,cache_creation_input_tokens:3,cache_read_input_tokens:5,output_tokens:0}}})
 stream({type:'message_delta',usage:{output_tokens:raw.includes('CLAUDE_USAGE_LIMIT')?17000:7}})
 await new Promise(()=>setInterval(()=>{},1000))
}
async function tool(name,input){
 const id=`toolu_${randomUUID()}`
 emit({type:'assistant',parent_tool_use_id:null,message:{content:[{type:'tool_use',id,name:`mcp__boai__${name}`,input}]}})
 const result=await request('tools/call',{name,arguments:input,_meta:{'claudecode/toolUseId':id}})
 emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content:result.content,is_error:result.isError===true}]}})
 return JSON.parse(result.content[0].text)
}
let text
if(payload.protocol==='private-participation-v2'){
 const current=payload.data.currentTurnMessages?.find(message=>message.isRootRequest)?.content??''
 const groupTask=current.includes('CLAUDE_GROUP_TASK')||current.includes('CLAUDE_GROUP_FILES')
 const mentionedOther=payload.data.originalMentions?.length&&!payload.data.originalMentions.includes(payload.data.currentEmployeeId)
 const boboMode=current.includes('CLAUDE_BOBO_CREATE')?'employee_creation':current.includes('CLAUDE_BOBO_ONLY')?'organize_only':current.includes('CLAUDE_BOBO_EXECUTE')?'organize_and_execute':undefined
 const organizationAllowed=!!payload.jsonSchema?.properties?.work?.properties?.organization
 const task=groupTask||raw.includes('模块文件任务')||current.includes('CLAUDE_NAMED_TEAM')||current.includes('CLAUDE_REVISION')
 text=JSON.stringify(raw.includes('invalid-decision')?{action:'wait'}:payload.data.participation?.hasRespondedInTurn||mentionedOther?{action:'pass'}:{action:'reply',responseKind:task?'task':'chat',...(task?{work:{key:groupTask?`group-${payload.data.currentEmployeeId}`:'main',scope:'本场私有文件',deliverable:'发布proof.txt'}}:{}),replyToMessageId:payload.data.originalUserRequestId})
 if(boboMode)text=JSON.stringify(organizationAllowed&&!payload.data.participation?.hasRespondedInTurn?{action:'reply',responseKind:'task',work:{key:'organize',scope:'组织独立员工',deliverable:'真实组织回执',organization:{mode:boboMode,goal:current}}}:{action:'pass'})
 if(current.includes('CLAUDE_WITHHOLD_UPDATE'))text=JSON.stringify({action:'pass'})
 if(raw.includes('NATIVE_CONTINUATION_')){
  appendFileSync('decision-continuation.jsonl',JSON.stringify(payload.data)+'\n')
  text=JSON.stringify(payload.data.participation?.hasRespondedInTurn?{action:'pass'}:payload.data.continuation?{action:'reply',responseKind:'task',work:{key:'continued-file',scope:'完成原请求的文件',deliverable:'proof.txt'}}:current.includes('NATIVE_CONTINUATION_QUESTION')?{action:'ask',responseKind:'chat',purpose:'先询问文件标题'}:current.includes('NATIVE_CONTINUATION_FAILURE')?{action:'wait'}:{action:'reply',responseKind:'chat'})
 }
}
else if(payload.protocol==='private-memory-delta-v1'){
 const group=payload.data.currentTurnMessages.find(message=>message.isRootRequest&&message.senderType==='user'&&(message.content.includes('CLAUDE_GROUP_')||message.content.includes('CLAUDE_WITHHOLD_UPDATE')))
 text=JSON.stringify({candidates:raw.includes('empty-memory')?[]:[{content:group?'用户偏好简短答复':'明确偏好简短答复',...(group?{kind:'long_term',evidence:'preference'}:{}),sourceMessageIds:[raw.includes('invalid-memory')?'unavailable':group?.id??payload.data.currentTurnMessages[0].id]}]})
 if(raw.includes('CLAUDE_WORK_MEMORY_SOURCE')){
  const source=payload.data.currentTurnMessages.find(message=>message.senderType==='user'&&message.content.includes('长期偏好是简短答复'))
  text=JSON.stringify({candidates:source?[{content:'用户偏好简短答复',kind:'long_term',evidence:'preference',sourceMessageIds:[source.id]}]:[]})
 }
}
else if(payload.protocol==='private-work-report'&&raw.includes('CLAUDE_WITHHOLD_WAIT'))text=JSON.stringify({action:'discard'})
else if(payload.protocol==='private-work-report')text=JSON.stringify(raw.includes('invalid-report')?{action:'publish',text:'伪造交付',outcome:{disposition:'delivered',summary:'完成',evidence:[{kind:'artifact',reference:'not-published'}]}}:raw.includes('invalid-question')?{action:'publish',text:'已经完成',outcome:{disposition:'delivered',summary:'已经完成',userQuestion:'原任务请求',evidence:[{kind:'answer',reference:'已经完成'}]}}:(raw.includes('CLAUDE_GROUP_')||raw.includes('CLAUDE_BOBO_')||raw.includes('CLAUDE_NAMED_TEAM')||raw.includes('CLAUDE_AUTOMATION_QUESTION'))?{action:'publish',text:payload.draft.text,outcome:payload.work.outcome}:{action:'publish',text:'已核对原结果',outcome:{disposition:'progress',summary:'没有再次执行工具'}})
else if(payload.protocol==='employee-task-v1'){
 const current=payload.messages.find(message=>message.id===payload.currentRequestId)?.content??''
 const host=JSON.parse(value('--system-prompt').split('Host-claimed work and confirmed prior effects: ')[1].split('\n')[0])
 if(host.work.organization){
  if(names.some(name=>!['mcp__boai__find_employees','mcp__boai__organize_collaboration','mcp__boai__report_work'].includes(name)))throw new Error('Organization exposed business tools')
  const found=await tool('find_employees',{limit:20}),group=host.work.organization.mode!=='employee_creation'
  const receipt=await tool('organize_collaboration',{existingMembers:group?found.employees.map(({agentId,configVersion})=>({agentId,configVersion})):[],newEmployees:[{name:'Claude新同事',role:'核对内容',instructions:'处理明确分工并保持独立身份。'}],...(group?{groupTitle:'Claude组织群',announcement:'CLAUDE_BOBO_EXECUTE empty-memory 同事核对并发布文件，我等实际子成果后汇总。'}:{})})
  await tool('report_work',{disposition:'delivered',summary:'已组织员工',evidence:[{kind:'collaboration',reference:receipt.id}]})
  text='已组织独立员工。'
 }else if(current.includes('CLAUDE_NAMED_TEAM')){
  await tool('create_team',{kind:'plan',schemaVersion:1,name:'模型建议名',purpose:'创建核查团队',scenarioKind:'work',assumptions:[],collaborationGuide:'先核查再汇总',capabilityNotes:[],members:[{name:'Claude团队同事',role:'核查',instructions:'核对实际资料。'}]})
  await tool('report_work',{disposition:'delivered',summary:'团队已创建',evidence:[{kind:'answer',reference:'已实际创建团队。'}]})
  text='已实际创建团队。'
 }else if((current.includes('CLAUDE_GROUP_TASK')||host.work.collaborationRequestId)&&!host.work.parentWorkId&&!host.work.waitRevision){
  const owner=(host.work.collaborationRequestId&&host.members.find(member=>member.name==='Claude新同事'))||host.members.find(member=>member.id!==host.work.ownerAgentId)
  const child=await tool('delegate_work',{key:'group-child',ownerAgentId:owner.id,scope:'核对并发布本次子文件',deliverable:'proof.txt'})
  await tool('wait_for_work',{dependencies:[{workId:child.id,resultVersion:1}],nextStep:'核对同事交付后发布汇总文件'})
  if(raw.includes('CLAUDE_WITHHOLD_WAIT')){writeFileSync(join(controlRoot,'withhold-parent-ready'),host.work.id);await controlledWait('withhold-parent-release')}
  text='等待同事实际交付。'
 }else if(current.includes('CLAUDE_AUTOMATION_QUESTION')){
  await tool('write_file',{path:'self:/work/prepared.txt',content:'prepared-once'})
  await tool('report_work',{disposition:'waiting',summary:'等待用户补充标题',userQuestion:'最终文件标题用什么？'})
  text='最终文件标题用什么？'
 }else{
 if(raw.includes('CLAUDE_WITHHOLD_WAIT')&&host.work.parentWorkId){writeFileSync(join(controlRoot,'withhold-child-ready'),host.work.id);await controlledWait('withhold-child-release')}
 const runId=value('--system-prompt').match(/"activeRunId":"([^"]+)"/)?.[1]??'run-1'
 const path=`self:/runs/${runId}/proof.txt`
 const revised=current.includes('CLAUDE_REVISION')
 const revisionRequestId=revised?JSON.parse(current.split('[Host-authorized artifact revision source; reference data, not tool permissions]\n')[1].split('\n')[0]).revisionRequestId:undefined
 await tool('write_file',{path,content:current.includes('CLAUDE_GROUP_')||raw.includes('CLAUDE_WITHHOLD_WAIT')||host.work.collaborationRequestId?JSON.stringify({owner:host.work.ownerAgentId,work:host.work.id,parent:host.work.parentWorkId,waitRevision:host.work.waitRevision}):revised?'CLAUDE_REVISION\n生产工具真实新版\n':'生产工具真实原件'})
 if(host.work.collaborationRequestId&&!host.work.parentWorkId&&host.work.waitRevision&&existsSync(join(controlRoot,'core-config-save-hold'))){
  writeFileSync(join(controlRoot,'core-config-save-ready'),JSON.stringify({workId:host.work.id,runId,ownerAgentId:host.work.ownerAgentId}))
  await controlledWait('core-config-save-release')
 }
 if(raw.includes('CLAUDE_AUTOMATION_HOLD'))await new Promise(()=>setInterval(()=>{},1000))
 const published=await tool('publish_artifact',{path,name:'proof.txt',...(revisionRequestId?{revisionRequestId}:{})})
 await tool('report_work',{disposition:'delivered',summary:'文件已发布',evidence:[{kind:'artifact',reference:published.artifact.id}]})
 text='文件已发布'
 }
}else text=payload.currentTurnMessages?.some(message=>message.isRootRequest&&message.content.includes('NATIVE_CONTINUATION_QUESTION'))?'最终文件标题用什么？':payload.contextMode==='incremental'?'只处理新增消息':'首次公开回复'
function reminder(){
 const content=[{type:'text',text:raw.includes('reminder-text')?'Unverified formatter text':'[structured-output-enforce] You MUST call the StructuredOutput tool to complete this request. Call this tool now.'}]
 if(raw.includes('reminder-mixed'))content.push({type:'tool_result',tool_use_id:'unrelated'})
 emit({type:'user',isSynthetic:!raw.includes('reminder-nonsynthetic'),parent_tool_use_id:raw.includes('reminder-child')?'child':null,
  ...(raw.includes('reminder-session')?{session_id:randomUUID()}:{}),message:{role:raw.includes('reminder-role')?'assistant':'user',content}})
}
if(raw.includes('reminder-before-assistant'))reminder()
emit({type:'stream_event',parent_tool_use_id:null,event:{type:'content_block_delta',delta:{type:'text_delta',text}}})
emit({type:'assistant',parent_tool_use_id:null,message:{content:[{type:'text',text}]}})
if(raw.includes('reminder-')&&!raw.includes('reminder-before-assistant')&&!raw.includes('reminder-after-formatter')){
 const count=raw.includes('reminder-over-limit')?3:raw.includes('reminder-twice')?2:1
 for(let i=0;i<count;i++)reminder()
}
const repair=raw.includes('formatter-repair-'),repairCount=raw.includes('repair-over-limit')?3:raw.includes('repair-twice')?2:1
if(structured&&repair){
 for(let i=0;i<repairCount;i++){
  emit({type:'assistant',parent_tool_use_id:null,message:{content:[{type:'tool_use',name:'StructuredOutput',id:`rejected-${i}`,input:{unrecognized_field:true}}]}})
  if(!raw.includes('repair-pending'))emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:raw.includes('repair-wrong-id')?'other':`rejected-${i}`,is_error:true,content:'Schema mismatch'}]}})
 }
}
if(structured&&!raw.includes('formatter-missing')&&!raw.includes('reminder-no-receipt')&&!raw.includes('repair-no-receipt')){
 emit({type:'assistant',parent_tool_use_id:null,message:{content:[{type:'tool_use',name:'StructuredOutput',id:raw.includes('repair-reused-id')?'rejected-0':'format-1',input:JSON.parse(text)}]}})
 const receiptError=raw.includes('formatter-receipt-string-error')?'true':raw.includes('formatter-receipt-null-error')?null:raw.includes('formatter-receipt-number-error')?1:raw.includes('formatter-receipt-false-error')?false:undefined
 emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:raw.includes('formatter-wrong-id')?'wrong':'format-1',content:'Formatted',...(receiptError===undefined?{}:{is_error:receiptError})}]}})
}
if(raw.includes('reminder-after-formatter'))reminder()
emit({type:'result',subtype:'success',is_error:false,terminal_reason:'completed',permission_denials:[],result:text,...(structured?{structured_output:raw.includes('repair-stale-result')?{unrecognized_field:true}:raw.includes('formatter-mismatch')?{action:'pass'}:JSON.parse(text)}:{}),usage:raw.includes('unknown-usage')?{}:{input_tokens:10,cache_creation_input_tokens:3,cache_read_input_tokens:5,output_tokens:2}})

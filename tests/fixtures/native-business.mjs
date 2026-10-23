/*
 * [OUTPUT]: NATIVE_PPT通过真实产品工具创建、审阅和发布PPT，供原生调用数与无BOAI预算核对。
 * [OUTPUT]: NATIVE_CWD回报实际子进程cwd，供同目录续用/不同目录新会话验证。
 * [OUTPUT]: 原生子进程使用实际CLI查询原消息、发布及重复核对，身份/owner拒绝和工具回执均不保存token。
 * [OUTPUT]: 知识查询经实际动态工具/MCP读取与引用，无文件Work；模型正文为确定性协议夹具。
 * [OUTPUT]: 原生浏览器实际stdio/MCP媒体与只读到真实Work写入接线；协议夹具不冒充真实模型或Electron页面。
 * [OUTPUT]: 原生计划工具通过真实动态工具/MCP桥保存、同key核对和重启查询，不建立文件Work。
 * [OUTPUT]: 实际核读交付材料路径与字节/hash，显式原生路径不走产品材料工具；是离线协议动作，不冒充模型输出。
 * [INPUT]: 隔离协议夹具中的当前工作、员工ID和真实产品工具。
 * [OUTPUT]: 核心组织、委派接续、路径别名/符号链接及真实成果的确定性业务动作。
 * [POS]: 两种原生传输共享合同用例；不模拟模型质量。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { writeFile, realpath, symlink, readFile, appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
/** Read the delivered bytes independently of host projection/receipt assertions. */
export async function consumeNativeMaterials(content) {
 const reads=[]
 for(const line of content.split('\n')) {
  let reference
  try { reference=JSON.parse(line) } catch { continue }
  if(!reference.referenceData || typeof reference.nativePath!=='string')continue
  const bytes=await readFile(reference.nativePath),hash=createHash('sha256').update(bytes).digest('hex')
  if(hash!==reference.contentHash)throw Error('native material bytes differ from authorized original')
  const read={path:reference.nativePath,hash,bytes:bytes.toString('hex'),size:bytes.length}
  reads.push(read);await appendFile('native-material-reads.jsonl',JSON.stringify(read)+'\n')
 }
 return reads
}
export async function business(prompt,tool){
 if(prompt.messages.at(-1)?.content==='NATIVE_PPT'){
  const project=await tool('presentation_create',{title:'原生PPT',theme:{name:'Proof',headFontFace:'Arial',bodyFontFace:'Arial'},story:{audience:'项目成员',purpose:'核对原生工具',coreMessage:'保留真实文件',narrative:['证据']},design:{visualDirection:'Simple typography',imageDirection:'Native data',density:'balanced'}})
  await tool('presentation_upsert_slide',{presentationId:project.id,expectedRevision:0,slide:{id:'s1',role:'supporting',layoutKey:'proof',elements:[{id:'title',type:'text',text:'原生文件 7 和 11',x:1,y:1,w:10,h:1,fontSize:36}]}})
  const reviewed=await tool('presentation_review',{presentationId:project.id})
  if(!reviewed.passed)throw Error('controlled review must approve this fixture')
  const exported=await tool('presentation_export',{presentationId:project.id,path:'self:/work/native-approved.pptx'})
  const published=await tool('publish_artifact',{path:exported.path})
  return 'NATIVE_PPT_RESULT '+JSON.stringify({artifactId:published.artifact.id,fileHash:reviewed.fileHash,requests:reviewed.requests})
 }
 if(prompt.messages.at(-1)?.content==='NATIVE_CWD') return 'NATIVE_CWD_RESULT '+JSON.stringify({cwd:process.cwd()})
 const work=prompt.currentWork,text=prompt.messages.map(m=>m.content).join('\n')+'\n'+(work?.scope??'')
 const cliOrganization=prompt.messages.at(-1)?.content.match(/^NATIVE_CLI_ORGANIZATION (.+)$/m)
 if(cliOrganization){
  const {entry}=JSON.parse(cliOrganization[1]),run=promisify(execFile)
  return business({...prompt,messages:[...prompt.messages.slice(0,-1),{...prompt.messages.at(-1),content:'NATIVE_ORG_ONLY'}]},async(name,input)=>{
   const args=[entry,'invoke','employee:invoke',JSON.stringify({tool:name,input,callId:'organization-'+name}),'--json']
   const result=JSON.parse((await run(process.execPath,args,{env:process.env,timeout:10000,maxBuffer:65536})).stdout)
   if(name==='organize_collaboration'){
    const repeated=JSON.parse((await run(process.execPath,args,{env:process.env,timeout:10000,maxBuffer:65536})).stdout)
    if(result.id!==repeated.id)throw Error('organization was replayed')
   }
   return result
  })
 }
 const cliRequest=prompt.messages.at(-1)?.content.match(/^NATIVE_CLI_SCOPE (.+)$/m)
 if(cliRequest){
  const {entry}=JSON.parse(cliRequest[1]),run=promisify(execFile)
  const call=async (channel,input)=>JSON.parse((await run(process.execPath,[entry,'invoke',channel,...(input===undefined?[]:[JSON.stringify(input)]),'--json'],{env:process.env,timeout:10000,maxBuffer:65536})).stdout)
  const context=await call('employee:context'),tools=await call('employee:tools')
  let denied
  try{await call('employees')}catch(error){denied=JSON.parse(error.stderr).code}
  const messages=await call('employee:invoke',{tool:'read_messages',input:{limit:10}})
  const input={tool:'send_message',input:{content:'CLI_ORIGINAL_MESSAGE'},callId:'native-progress'}
  const published=await call('employee:invoke',input),repeated=await call('employee:invoke',input)
  return 'CLI_SCOPE_RESULT '+JSON.stringify({context,tools:tools.map(tool=>tool.name),denied,readOriginal:messages.messages.some(message=>message.content.includes('NATIVE_CLI_SCOPE')),publishedSame:published.messageId===repeated.messageId,environment:{run:process.env.BOAI_CLI_EMPLOYEE_RUN,hasToken:!!process.env.BOAI_SERVER_TOKEN,owner:process.env.BOAI_SERVER_TOKEN==='host-owner-token-must-not-be-inherited',hostSecret:!!process.env.BOAI_SECRET_INTERNAL}})
 }
 const cliFile=prompt.messages.at(-1)?.content.match(/^NATIVE_CLI_FILE (.+)$/m)
 if(cliFile){
  const {entry}=JSON.parse(cliFile[1]),run=promisify(execFile)
  await writeFile('cli-delivered.md','# CLI原文件交付\n')
  const input={tool:'publish_artifact',input:{path:'cli-delivered.md'},callId:'native-file-publication'}
  const call=async()=>JSON.parse((await run(process.execPath,[entry,'invoke','employee:invoke',JSON.stringify(input),'--json'],{env:process.env,timeout:10000,maxBuffer:65536})).stdout)
  const first=await call(),second=await call()
  if(!first.artifact?.id||first.artifact.id!==second.artifact?.id)throw Error('CLI publication was replayed or not confirmed')
  return 'CLI文件已交付 '+first.artifact.id
 }
 if(prompt.messages.at(-1)?.content.includes('NATIVE_KNOWLEDGE')){
  const directory=await tool('inspect_knowledge',{})
  const file=directory.files.find(file=>file.readable)
  if(!file)throw Error('no authorized knowledge file')
  const found=await tool('search_knowledge',{query:'品牌规范'})
  if(!found.results.some(hit=>hit.resourceId===file.resourceId&&hit.contentHash===file.contentHash))throw Error('search identity differs from original')
  const input={resourceId:file.resourceId,path:file.path,contentHash:file.contentHash,limit:8}
  let read=await tool('read_knowledge',input),content=read.content,citation=read.citation
  while(read.nextOffset!==null){read=await tool('read_knowledge',{...input,offset:read.nextOffset});content+=read.content}
  await appendFile('native-knowledge-reads.jsonl',JSON.stringify({resourceId:file.resourceId,contentHash:file.contentHash,content,citation})+'\n')
  return content+'\n'+citation
 }
 if(prompt.messages.at(-1)?.content.includes('NATIVE_BROWSER_')){
  await tool('browser_tool',{command:'snapshot'})
  const image=await tool('browser_tool',{command:'screenshot --png'})
  const part=image.find(part=>part.type==='inputImage'||part.type==='image')
  if(!part)throw Error('native browser did not receive image content')
  const bytes=Buffer.from(part.data??part.imageUrl.split(',')[1],'base64')
  await appendFile('native-browser-media.jsonl',JSON.stringify({type:part.type,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')})+'\n')
  if(prompt.messages.at(-1).content.includes('NATIVE_BROWSER_WRITE')){
   await tool('browser_tool',{command:'fill @e1 "after"'})
   const result=await tool('browser_tool',{command:'snapshot'})
   if(!result.some(part=>part.text?.includes('after')))throw Error('write result was not read back')
   await tool('report_work',{disposition:'delivered',summary:'已填写并回读',evidence:[{kind:'answer',reference:'已填写并回读 after'}]})
   return '已填写并回读 after'
  }
  return '已读取同一网页和图片'
 }
 if(prompt.messages.at(-1)?.content.includes('NATIVE_AUTOMATION_SAVE')){
  const input={action:'save',key:'daily',plan:{name:'原生日报',prompt:'整理本次获准资料',frequency:'daily',time:'09:00',weekday:1,timezone:'Asia/Singapore',enabled:false,notify:false}}
  const first=await tool('manage_automation',input),second=await tool('manage_automation',input)
  if(first.id!==second.id||second.revision!==1)throw Error('native automation duplicated')
  return '已保存原生日报'
 }
 if(prompt.messages.at(-1)?.content.includes('NATIVE_AUTOMATION_LIST')){
  const result=await tool('manage_automation',{action:'list',limit:20})
  if(result.definitions.length!==1||result.definitions[0].name!=='原生日报')throw Error('native automation receipt lost')
  return '已读取同一原生日报'
 }
 if(prompt.messages.at(-1)?.content.startsWith('NATIVE_EXPLICIT_PATH\n'))return readFile(JSON.parse(prompt.messages.at(-1).content.split('\n')[1]).path,'utf8')
 if(text.includes('NATIVE_CANONICAL_PATH')||text.includes('NATIVE_SYMLINK_PATH')){
  await writeFile('canonical.md','# 实际原件\n')
  const symbolic=text.includes('NATIVE_SYMLINK_PATH')
  if(symbolic)await symlink('canonical.md','alias.md')
  await tool('publish_artifact',{path:symbolic?resolve('alias.md'):await realpath('canonical.md')})
  return '已交付实际文件'
 }
 if(text.includes('NATIVE_PUBLIC')){
  const page=await tool('read_messages',{limit:1})
  if(!page.messages.some(message=>message.content.includes('NATIVE_PUBLIC')))throw Error('authorized message was not readable')
  const input={content:'普通公开消息已送达'}
  const first=await tool('send_message',input,'public-once'),second=await tool('send_message',input,'public-once')
  if(first.messageId!==second.messageId)throw Error('public message duplicated')
  if(text.includes('NATIVE_PUBLIC_FAIL'))throw Error('failure after actual public message')
  return text.includes('NATIVE_PUBLIC_SPACES')?' 普通公开消息已送达 ':text.includes('NATIVE_PUBLIC_ONLY')?'':text.includes('NATIVE_PUBLIC_DIFFERENT')?'最终回复不同':'普通公开消息已送达'
 }
 if(text.includes('NATIVE_ORG_')&&prompt.employeeId==='bobo'&&!work?.collaborationRequestId){
  const mode=text.includes('NATIVE_ORG_CREATE')?'employee_creation':text.includes('NATIVE_ORG_ONLY')?'organize_only':'organize_and_execute'
  const plan={mode,goal:'由核查员交付 NATIVE_PUBLISH 文件',existingMembers:[],newEmployees:[{name:'新核查员',role:'核查',instructions:'完成 NATIVE_PUBLISH'}],...(mode!=='employee_creation'?{groupTitle:'原生组织群',announcement:'请新核查员完成 NATIVE_PUBLISH 文件交付'}:{})}
  await tool('find_employees',{mode,goal:plan.goal})
  const result=await tool('organize_collaboration',plan)
  if(result.status!=='committed')throw Error(JSON.stringify(result))
  return '已完成组织'
 }
 if(text.includes('NATIVE_NAMED_TEAM')&&prompt.employeeId==='bobo'){
  const result=await tool('create_team',{kind:'plan',schemaVersion:1,name:'原生团队',purpose:'核查',scenarioKind:'work',assumptions:[],collaborationGuide:'各自独立核查',capabilityNotes:[],members:[{name:'具名核查员',role:'核查',instructions:'完成明确任务'}]})
  const reply='已创建 '+result.title
  await tool('report_work',{disposition:'delivered',summary:'创建完成',evidence:[{kind:'answer',reference:reply}]})
  return reply
 }
 if(text.includes('NATIVE_DELEGATE')||work?.key==='native-child'){
  if(work?.parentWorkId){
   await writeFile('child.md','# 子工作交付\n已核查。\n');await tool('publish_artifact',{path:'child.md'});return '子工作已交付'
  }
  if(prompt.dependencies?.length){
   const dependency=prompt.dependencies[0]
   if(!dependency.nativePath)throw Error('native dependency path missing')
   await tool('report_work',{disposition:'delivered',summary:'已完成协作',evidence:[{kind:'artifact',reference:dependency.artifactId}]});return '已完成协作'
  }
  const owner=prompt.members.find(member=>member.id!==prompt.employeeId)
  const child=await tool('delegate_work',{key:'native-child',scope:'编写核查说明',deliverable:'child.md',ownerAgentId:owner.id})
  await tool('wait_for_work',{dependencies:[{workId:child.id,resultVersion:1}],nextStep:'根据子工作结果汇总'})
  return '等待同事交付'
 }
 if(text.includes('NATIVE_BAD_EVIDENCE')){await tool('report_work',{disposition:'delivered',summary:'声称有成果',evidence:[{kind:'artifact',reference:'unrelated-artifact'}]});return '声称已交付'}
 if(text.includes('NATIVE_REPORT')){await tool('report_work',{disposition:'delivered',summary:'核对完毕',evidence:[{kind:'answer',reference:'原生核对完成'}]});return '原生核对完成'}
}

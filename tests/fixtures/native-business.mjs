/*
 * [OUTPUT]: 实际核读交付材料路径与字节/hash，显式原生路径不走产品材料工具；是离线协议动作，不冒充模型输出。
 * [INPUT]: 隔离协议夹具中的当前工作、员工ID和真实产品工具。
 * [OUTPUT]: 核心组织、委派接续、路径别名/符号链接及真实成果的确定性业务动作。
 * [POS]: 两种原生传输共享合同用例；不模拟模型质量。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { writeFile, realpath, symlink, readFile, appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
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
 const work=prompt.currentWork,text=prompt.messages.map(m=>m.content).join('\n')+'\n'+(work?.scope??'')
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

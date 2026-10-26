/*
 * [INPUT]: 原Electron BDD真实本机员工的预登记、完整原件/hash和运行详情。
 * [OUTPUT]: 原生文档、协作与自动化的独立judge样本；完整执行证据/只读hash纳入样本身份，外部turn与内部请求分口径。
 * [POS]: 第13组真实桌面到既有业务eval的适配，不产生模型输出或人工标签。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConversationDetail, DigitalAgent } from '../../packages/shared/src/domain'
import type { ExecutionEvidence } from '../../packages/shared/src/domain/execution'
import type { EvaluationCase, EvaluationRecord, ArtifactEvidence } from './schema'
const hash=(input:string|Buffer)=>createHash('sha256').update(input).digest('hex')
export const nativeDocumentCriteria=['第一版的目标用户、核心功能和实施步骤针对白噪音微信小程序，内容具体且彼此一致。','第二版新增可实施的离线音频缓存方案，保留原来三个主题与验证标记，没有仅改标题或声称完成。','重启后回复准确引用已交付第二版的验证标记和离线章节；结合第三轮完整原生步骤与工作区文件hash核对未修改或重新发布，缺证据不能推定通过。']
const collaborationCriteria=['交付文件针对白噪音微信小程序，正常缓存、容量淘汰、断网播放三项各有可执行的前置条件、操作和预期结果，并保留指定标记。','负责人确实委派给当前同事，由同事交付，负责人等待并核对真实结果后报告；没有自己代写或只信同事声称完成。','负责人最终核查结论不超过120字，包含文件名，准确区分文档核查与实际小程序测试，不虚构实测。']
const automationCriteria=['实际交付文件含“离线缓存每日核查”主题，缓存容量、音频可播放、离线状态各有具体检查动作，并保留指定标记。','公开答复与真实交付文件及执行结果一致，没有将计划建立、写文件或运行终态冒充已经登记附件。']
export async function importNativeEvidence(input:string,output:string){
 await mkdir(output,{recursive:false})
 const reports:Record<string,unknown>[]=[]
 for(const directory of await readdir(join(input,'scenarios'))){
  const root=join(input,'scenarios',directory),manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'))
  const evidence=manifest.evidence as {kind:string;label:string;path:string;sha256:string}[]
  for(const item of evidence)if(hash(await readFile(join(root,item.path)))!==item.sha256)throw Error('原件hash不匹配：'+item.path)
  const byLabel=async(label:string)=>{const item=evidence.find(item=>item.label===label);return item?JSON.parse(await readFile(join(root,item.path),'utf8')):undefined}
  const registration=await byLabel('预登记'),collaboration=await byLabel('协作预登记'),automation=await byLabel('自动化预登记')
  if(registration.source!=='real-local-cli')throw Error('离线协议夹具不能作为真实业务评测')
  const structural=await byLabel('核心预登记')?'core':await byLabel('停止预登记')?'stop':undefined
  if(structural){reports.push({sourceDirectory:root,desktop:manifest.status,category:structural,runtime:registration.runtime,quality:'structural lifecycle case; no semantic content score applicable',manifestModelMode:manifest.modelMode,registrationSource:registration.source});continue}
  const category=collaboration?'collaboration':automation?'automation':'document'
  const detail=(collaboration?await byLabel('协作实际结果'):automation?(await byLabel('自动化实际结果'))?.detail:await byLabel('运行-3')) as ConversationDetail|undefined
  if(!detail){reports.push({sourceDirectory:root,desktop:manifest.status,category,runtime:registration.runtime,error:'缺少场景完成证据，保留原失败，不生成可评分成功样本'});continue}
  const artifacts:ArtifactEvidence[]=await Promise.all(detail.artifacts.map(async artifact=>{
   const saved=evidence.find(item=>item.kind==='file'&&item.sha256===artifact.contentHash)
   if(!saved)throw Error('缺少固定版本原件：'+artifact.name)
   const bytes=await readFile(join(root,saved.path));if(hash(bytes)!==artifact.contentHash)throw Error('业务hash与归档不一致')
   return {...artifact,content:bytes.toString('utf8'),sha256:hash(bytes),bytes:bytes.length,complete:true}
  }))
  const nativeEvidence:ExecutionEvidence[]=[]
  for(const item of evidence.filter(item=>item.label.startsWith('完整执行过程-')))nativeEvidence.push(...JSON.parse(await readFile(join(root,item.path),'utf8')))
  const sourceFiles=evidence.filter(item=>item.label.startsWith('只读后工作区原件')).map(item=>({label:item.label,sha256:item.sha256,contentHashMatched:artifacts.some(artifact=>artifact.sha256===item.sha256&&artifact.contentVersion===2)}))
  const id=`native-${category}-${registration.runtime}${collaboration?.peer.executionBackend?.kind==='mastra-model'?'-api':''}`,caseId=id+'-1',prompt=detail.messages.filter(m=>m.senderType==='user').map(m=>m.content).join('\n\n后续消息：\n')
  const scenario:EvaluationCase={id,matrixId:'LR-NATIVE-'+category.toUpperCase(),members:collaboration?2:1,prompt,criterion:category==='document'?'原生工具交付、普通消息修订、重启只读续聊':category==='collaboration'?'定向委派、同事交付与真实接续':'原定时计划执行与真实文件交付',split:'development',cluster:'native-'+category,category:'native-runtime',checks:[...(collaboration?[{kind:'delegation'} as const]:[]),{kind:'artifact',name:category==='document'?'native-check.md':category==='collaboration'?'verification.md':'scheduled-check.md',contains:category==='document'?['目标用户','核心功能','实施步骤','BOAI-NATIVE-20261011']:category==='collaboration'?['BOAI-COLLAB-20261011']:['BOAI-SCHEDULE-20261011']}],semantic:category==='document'?nativeDocumentCriteria:category==='collaboration'?collaborationCriteria:automationCriteria,source:'用户场景及第13组11',timeoutMs:collaboration?360000:300000}
  const tokens=detail.runs.map(r=>r.usage?.totalTokens),startedAt=Date.parse(manifest.startedAt),sentAt=Date.parse(detail.messages.find(m=>m.senderType==='user')!.createdAt)
  const members=collaboration?[collaboration.leader,collaboration.peer] as DigitalAgent[]:[{id:detail.runs[0].agentId,name:detail.runs[0].agentName,role:'交付文档'}]
  const record:EvaluationRecord={caseId,prompt,scenario,datasetVersion:'native-runtime-20261011-v2',startedAt,sentAt,elapsedMs:Date.parse(manifest.completedAt)-sentAt,runtimeErrors:[],...(manifest.status!=='passed'?{error:'原桌面场景未通过'}:{}),metadata:{label:'真实 pnpm dev 桌面',revision:'working-tree; exact source manifest retained separately',sourceHashes:{desktopManifest:hash(await readFile(join(root,'manifest.json')))},model:[...new Set(detail.runs.map(r=>r.backend?.modelId??collaboration?.peer.modelId??registration.runtime))].join(' + '),provider:registration.runtime+'-local',members:members.map(({id,name,role})=>({id,name,role})),team:collaboration?'multi':'single',promptHash:hash(prompt)},detail,artifacts,nativeEvidence:{items:nativeEvidence,sourceFiles,completeRunIds:detail.runs.filter(run=>evidence.some(item=>item.label==='完整执行过程-'+run.id)).map(run=>run.id)},requests:[],metrics:{requestUnit:'external-native-turn; internal provider requests unknown',externalInvocations:detail.runs.reduce((sum,r)=>sum+(r.backend?.externalInvocations??0),0),usage:{reported:{totalTokens:tokens.reduce<number>((sum,t)=>sum+(t??0),0)},totalRuns:tokens.length,runsReportingEachField:{totalTokens:tokens.filter(t=>t!==undefined).length}}}}
  await writeFile(join(output,caseId+'.json'),JSON.stringify(record,null,2),{flag:'wx'})
  reports.push({caseId,sourceDirectory:root,desktop:manifest.status,category,externalInvocations:record.metrics!.externalInvocations,internalProviderRequests:null,totalTokens:tokens.every(t=>t!==undefined)?tokens.reduce<number>((sum,t)=>sum+t!,0):null,humanReview:'pending',quality:'independent judge pending',manifestModelMode:manifest.modelMode,registrationSource:registration.source,completeEvidenceRuns:record.nativeEvidence!.completeRunIds.length,sourceFiles})
 }
 await writeFile(join(output,'native-summary.json'),JSON.stringify(reports,null,2),{flag:'wx'})
 return reports
}

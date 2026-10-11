/*
 * [INPUT]: 第13组原生纠偏规格，原Electron BDD和隔离pnpm dev。
 * [OUTPUT]: 普通聊天、真实工具执行面板、固定文件修订和重启；夹具与真实CLI明确分口径。
 * [POS]: 原生员工新版桌面验收，沿现有测试入口。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { resolve } from 'node:path'
import { readFile, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { AgentRun, Conversation, ConversationDetail, DigitalAgent, LaunchProfile } from '../../../src/shared/domain'
import { test as base } from '../support/test'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import type { Desktop } from '../support/desktop'
type State={runtime:'codex'|'claude';real:boolean;agent:DigitalAgent;chat:Conversation;detail:ConversationDetail;session?:string;runs:number}
export const test=base.extend<{nativeState:State}>({nativeState:async({},use)=>{await use({} as State)}})
const {Given,When,Then,After}=createBdd(test)
const request=async <T>(desktop:Desktop,method:string,input:unknown)=>desktop.page.evaluate(async({method,input})=>window.boai.request(method as never,input as never),{method,input}) as Promise<T>
const openChat=async(d:Desktop,state:State)=>d.page.getByRole('navigation',{name:'会话列表',exact:true}).getByRole('button',state.chat.purpose==='core'?{name:state.chat.title,exact:true}:{name:new RegExp(state.chat.title)}).click()
async function send(d:Desktop,state:State,content:string){
 await d.page.getByRole('textbox',{name:'消息内容',exact:true}).fill(content)
 await d.page.getByRole('button',{name:'发送消息',exact:true}).click()
 let detail:ConversationDetail|undefined
 await expect.poll(async()=>{
  detail=await request(d,'getConversation',{id:state.chat.id})
  for(const run of detail!.runs)for(const action of await request<import('../../../src/shared/domain/execution').NativeAction[]>(d,'listNativeActions',{conversationId:state.chat.id,runId:run.id})){
   if(action.status==='pending'&&action.method==='mcp__boai__publish_artifact'){
    await d.reviewData(`明确批准文件登记-${action.id}`,{action,decision:'allow',scope:'本次测试用户要求的文件交付'})
    await request(d,'respondNativeAction',{conversationId:state.chat.id,runId:run.id,actionId:action.id,response:{option:'allow'}})
   }
  }
  return detail!.runs.length>state.runs&&detail!.runs.every(run=>['completed','failed','cancelled','interrupted'].includes(run.status))
 },{timeout:300000,intervals:[400]}).toBe(true)
 state.detail=detail!;state.runs=detail!.runs.length
 await d.reviewData(`运行-${state.runs}`,detail)
 expect(detail!.runs.filter(run=>run.status!=='completed').map(run=>run.error)).toEqual([])
}
Given('启动纠偏后的 {string} 原生员工桌面',async({runtime,nativeState},kind:string)=>{
 test.setTimeout(960000)
 const real=process.env.BOAI_NATIVE_REAL==='1',name=kind as State['runtime']
 if(real)test.info().annotations.push({type:'model-mode',description:'real-provider'})
 Object.assign(nativeState,{runtime:name,real,runs:0})
 await runtime.start()
 const executable=real ? process.env[name==='codex'?'BOAI_NATIVE_CODEX':'BOAI_NATIVE_CLAUDE']! : resolve(name==='codex'?'tests/fixtures/native-conversation.mjs':'tests/fixtures/native-claude-conversation.mjs')
 expect(executable).toBeTruthy()
 const draft={name:`桌面${name}`,executable,args:[],protocol:name==='codex'?'codex-app-server':'claude-cli',useExistingLogin:true,hostAccessAcknowledged:true}
 await request(runtime,'testLaunchProfileDraft',draft)
 const profile=await request<LaunchProfile>(runtime,'saveLaunchProfile',draft)
 nativeState.agent=await request(runtime,'saveAgent',{name:`原生${name}员工`,role:'交付文档',instructions:'完成明确任务。',color:'#00AABB',connectionId:'',modelId:name==='claude'&&real?'sonnet':'',executionBackend:{kind:name==='codex'?'codex-local':'claude-local',profileId:profile.id},nativeOptions:name==='codex'?{codexSandbox:'workspace-write',codexApprovalPolicy:'on-request'}:{claudePermissionMode:'acceptEdits'},skillIds:[],knowledgeIds:[],allowCommands:true,active:true})
 nativeState.chat=await request(runtime,'createConversation',{kind:'direct',title:`原生${name}桌面验收`,agentIds:[nativeState.agent.id]})
 await runtime.reviewData('预登记',{source:real?'real-local-cli':'offline-protocol-fixture',runtime:name,profile,turns:3,observationMs:300000,approval:'仅批准所请求的 BOAI 文件交付',ui:'pnpm dev'})
 await openChat(runtime,nativeState)
})
When('通过普通聊天让该原生员工交付并修订文件',async({runtime,nativeState:state})=>{
 await send(runtime,state,state.real?'在当前工作目录创建 native-check.md，用 Markdown 写一份白噪音微信小程序需求说明。包含目标用户、核心功能、实施步骤三个标题，末尾保留 BOAI-NATIVE-20261011 标记。用原生文件或命令工具写入，再通过 BOAI publish_artifact 交付实际文件。':'NATIVE_PUBLISH')
 expect(state.detail.artifacts).toHaveLength(1)
 state.session=state.detail.runs[0].backend?.sessionId
 await runtime.reviewFile('第一版原件',state.detail.artifacts[0].path,{required:true,expectedSha256:state.detail.artifacts[0].contentHash})
 await send(runtime,state,state.real?'修改刚才的文件，增加“离线使用”章节，说明音频缓存方案。保留原标记，并交付新版本。':'NATIVE_REVISE 修改刚才的文件')
 expect(state.detail.artifacts).toHaveLength(2)
 expect(new Set(state.detail.artifacts.map(a=>a.logicalArtifactId)).size).toBe(1)
 expect(state.detail.artifacts.map(a=>a.contentVersion).sort()).toEqual([1,2])
 expect(state.detail.runs.every(r=>r.backend?.sessionId===state.session&&r.backend?.externalInvocations===1)).toBe(true)
 for(const artifact of state.detail.artifacts)await runtime.reviewFile(`第${artifact.contentVersion}版原件`,artifact.path,{required:true,expectedSha256:artifact.contentHash})
})
Then('执行面板保留真实步骤而聊天没有流程卡片',async({runtime,nativeState:state})=>{
 await runtime.page.getByRole('button',{name:'会话操作',exact:true}).click()
 await runtime.page.getByRole('menuitem',{name:'执行过程',exact:true}).click()
 const panel=runtime.page.locator('#agent-execution-drawer')
 await expect(panel.getByText('执行历史',{exact:true})).toBeVisible()
 for(const group of await panel.getByRole('button',{name:/已完成 \d+ 个步骤/}).all())if(await group.getAttribute('aria-expanded')==='false')await group.click()
 await expect(panel.getByRole('button',{name:/publish_artifact/}).first()).toBeVisible()
 await panel.getByRole('button',{name:/publish_artifact/}).first().click()
 await expect(panel.getByText('参数',{exact:true}).first()).toBeVisible()
 await expect(panel.getByText('结果',{exact:true}).first()).toBeVisible()
 for(const text of ['回复此问题','处理工作','已向原问题提交补充。','采用此版本','要求修改','稍后处理'])await expect(runtime.page.getByText(text,{exact:true})).toHaveCount(0)
 
 await runtime.reviewCheckpoint('原生执行面板与普通聊天')
})
Then('重启后原生员工续聊且不会重放交付',async({runtime,nativeState:state})=>{
 const before=state.runs
 await runtime.restart();await openChat(runtime,state)
 expect((await request<ConversationDetail>(runtime,'getConversation',{id:state.chat.id})).runs).toHaveLength(before)
 await send(runtime,state,state.real?'只读取刚才的 native-check.md，回复验证标记和新增章节名。不要修改文件，不要重新发布。':'只读取，不要修改')
 expect(state.detail.artifacts).toHaveLength(2)
 expect(state.detail.runs.at(-1)?.backend?.sessionId).toBe(state.session)
 const latest=state.detail.artifacts.find(artifact=>artifact.contentVersion===2)!
 expect(latest.sourcePath).toBeTruthy()
 expect(createHash('sha256').update(await readFile(latest.sourcePath!)).digest('hex')).toBe(latest.contentHash)
 await runtime.reviewFile('只读后工作区原件',latest.sourcePath!,{required:true,expectedSha256:latest.contentHash})
 await runtime.reviewCheckpoint('重启后原生会话续用')
})

async function approveProducts(d:Desktop,detail:ConversationDetail){
 for(const run of detail.runs)for(const action of await request<import('../../../src/shared/domain/execution').NativeAction[]>(d,'listNativeActions',{conversationId:detail.conversation.id,runId:run.id})){
  if(action.status!=='pending')continue
  const input=(action.detail as {input?:{file_path?:string;command?:string}})?.input
  const originals=detail.artifacts.flatMap(artifact=>[artifact.path,artifact.sourcePath].filter((value):value is string=>!!value))
  const readsArtifact=action.method==='Read'&&!!input?.file_path&&await Promise.all(originals.map(async file=>await realpath(file)===await realpath(input.file_path!))).then(values=>values.some(Boolean)).catch(()=>false)
  const readCommands=originals.flatMap(file=>[file,JSON.stringify(file),"'"+file.replaceAll("'", "'\"'\"'")+"'"]).flatMap(file=>['cat ','shasum -a 256 '].map(command=>command+file))
  const readsCommand=action.method==='Bash'&&!!input?.command&&readCommands.includes(input.command.trim())
  if(readsArtifact||readsCommand||['mcp__boai__publish_artifact','mcp__boai__delegate_work','mcp__boai__wait_for_work','mcp__boai__report_work'].includes(action.method)){
   await d.reviewData(`明确批准协作-${action.id}`,{action,decision:'allow',scope:readsArtifact||readsCommand?'只读本场已登记成果的明确路径':'本场预登记的文件交付和定向协作'})
   await request(d,'respondNativeAction',{conversationId:detail.conversation.id,runId:run.id,actionId:action.id,response:{option:'allow'}})
  }
 }
}
When('负责人委派{string}员工并接续实际成果',async({runtime,nativeState:state},peerType:string)=>{
 const apiPeer=peerType==='API'
 test.skip(apiPeer&&process.env.BOAI_TEST_REAL_API!=='1','API混合真实验证须显式配置隔离凭据桥')
 let peer:DigitalAgent
 if(apiPeer){
  await runtime.close();const connection=await prepareSavedModel(runtime);await runtime.start(await systemKeychainLaunch(runtime))
  peer=await request(runtime,'saveAgent',{name:'真实API核查同事',role:'资料核查',instructions:'完成明确的委派，交付实际文件，不替负责人开新根工作。',color:'#00AABB',connectionId:connection.id,modelId:connection.defaultModel,executionBackend:{kind:'mastra-model'},skillIds:[],knowledgeIds:[],allowCommands:false,active:true})
 }else{
 const kind=state.runtime==='codex'?'claude':'codex'
 const executable=state.real?process.env[kind==='codex'?'BOAI_NATIVE_CODEX':'BOAI_NATIVE_CLAUDE']!:resolve(kind==='codex'?'tests/fixtures/native-conversation.mjs':'tests/fixtures/native-claude-conversation.mjs')
 const draft={name:`协作${kind}`,executable,args:[],protocol:kind==='codex'?'codex-app-server':'claude-cli',useExistingLogin:true,hostAccessAcknowledged:true}
 await request(runtime,'testLaunchProfileDraft',draft);const profile=await request<LaunchProfile>(runtime,'saveLaunchProfile',draft)
 peer=await request<DigitalAgent>(runtime,'saveAgent',{name:`协作${kind}员工`,role:'资料核查',instructions:'处理被委派的任务并交付真实文件。',color:'#00AABB',connectionId:'',modelId:kind==='claude'&&state.real?'sonnet':'',executionBackend:{kind:kind==='codex'?'codex-local':'claude-local',profileId:profile.id},nativeOptions:kind==='codex'?{codexSandbox:'workspace-write',codexApprovalPolicy:'on-request'}:{claudePermissionMode:'acceptEdits'},skillIds:[],knowledgeIds:[],allowCommands:true,active:true})
 }
 state.chat=await request(runtime,'createConversation',{kind:'group',title:`${state.runtime}负责人原生协作`,agentIds:[state.agent.id,peer.id]})
 const prompt=state.real?`你是负责人。请使用 BOAI delegate_work 把下面的文件任务交给当前同事 ${peer.name}（ID ${peer.id}），不要自己代写。任务：在同事自己的工作目录创建 verification.md，主题是“白噪音微信小程序的离线缓存验收”，列出正常缓存、容量淘汰、断网播放三项可执行验收，每项包含前置条件、操作、预期结果，末尾标记 BOAI-COLLAB-20261011。由同事通过 publish_artifact 交付。你使用 wait_for_work 等待实际结果，接续后核对该真实文件，使用 report_work 记录交付，并向我回复不超过120字的核查结论和文件名。`:'NATIVE_DELEGATE'
 await runtime.reviewData('协作预登记',{source:state.real?'real-local-cli':'offline-protocol-fixture',leader:state.agent,peer,prompt,externalTurnCeiling:apiPeer?12:8,observationMs:360000,success:'真实子Work交付、负责人定向接续、同一预算、重启不重放'})
 await openChat(runtime,state)
 await request(runtime,'sendMessage',{conversationId:state.chat.id,content:prompt,mentionIds:[state.agent.id],requestId:crypto.randomUUID()})
 await expect.poll(async()=>{
  state.detail=await request(runtime,'getConversation',{id:state.chat.id});await approveProducts(runtime,state.detail)
  if(state.detail.runs.length>(apiPeer?12:8))throw Error('超过本场预登记的外部运行上限')
  if(state.detail.runs.some(run=>run.status==='failed'))throw Error(state.detail.runs.filter(run=>run.status==='failed').map(run=>run.error).join('\n'))
  return !!state.detail.workItems?.length&&state.detail.workItems.every(work=>work.status==='delivered')&&state.detail.runs.every(run=>['completed','failed','cancelled','interrupted'].includes(run.status))
 },{timeout:360000,intervals:[500]}).toBe(true)
 await runtime.reviewData('协作实际结果',state.detail)
 expect(state.detail.runs.filter(run=>run.status==='failed').map(run=>run.error)).toEqual([])
 expect(new Set(state.detail.workItems?.map(work=>work.budgetId)).size).toBe(1)
 expect(state.detail.artifacts.length).toBeGreaterThanOrEqual(1)
 expect(state.detail.artifacts.every(artifact=>artifact.ownerAgentId===peer.id)).toBe(true)
 const parentRuns=state.detail.runs.filter(run=>run.agentId===state.agent.id)
 expect(parentRuns.length).toBeGreaterThanOrEqual(2);expect(new Set(parentRuns.map(run=>run.backend?.sessionId)).size).toBe(1)
 expect(new Set(state.detail.runs.filter(run=>run.backend?.sessionId).map(run=>run.backend!.sessionId)).size).toBe(apiPeer?1:2)
 for(const artifact of state.detail.artifacts)await runtime.reviewFile('协作原件',artifact.path,{required:true,expectedSha256:artifact.contentHash})
 await runtime.page.getByRole('button',{name:'会话操作',exact:true}).click();await runtime.page.getByRole('menuitem',{name:'执行过程',exact:true}).click()
 await expect(runtime.page.locator('#agent-execution-drawer').getByText('执行历史',{exact:true})).toBeVisible()
 await runtime.reviewCheckpoint('双原生员工执行总览')
})
Then('协作执行和原件在重启后保持且不重放',async({runtime,nativeState:state})=>{
 const before=state.detail;await runtime.restart();await openChat(runtime,state)
 const after=await request<ConversationDetail>(runtime,'getConversation',{id:state.chat.id})
 expect(after.runs).toHaveLength(before.runs.length);expect(after.artifacts).toEqual(before.artifacts)
 await runtime.reviewData('协作重启核对',after);await runtime.reviewCheckpoint('协作重启后聊天')
})
When('用原定时计划入口运行本机员工',async({runtime,nativeState:state})=>{
 const prompt=state.real?'在当前工作目录创建 scheduled-check.md，标题为“离线缓存每日核查”，内容为三项核查：缓存容量、音频可播放、离线状态。每项写一个检查动作，末尾标记 BOAI-SCHEDULE-20261011。使用原生文件或命令工具写入，再通过 publish_artifact 交付真实文件。':'NATIVE_PUBLISH'
 const plan=await request<import('../../../src/shared/domain').AutomationDefinition>(runtime,'saveAutomation',{name:`${state.runtime}原生计划验收`,prompt,conversationPolicy:'new-conversation',employeeIds:[state.agent.id],frequency:'daily',time:'09:00',weekday:1,timezone:'UTC',enabled:false,notify:false})
 await runtime.reviewData('自动化预登记',{source:state.real?'real-local-cli':'offline-protocol-fixture',plan,externalTurnCeiling:2,observationMs:300000,trigger:'原runAutomation产品入口，不伪造时钟触发'})
 const occurrence=await request<import('../../../src/shared/domain').AutomationOccurrence>(runtime,'runAutomation',{id:plan.id,requestId:crypto.randomUUID()})
 await expect.poll(async()=>{
  const current=await request<import('../../../src/shared/domain').AutomationOccurrence>(runtime,'getAutomationOccurrence',{id:occurrence.id})
  if(current.conversationId){state.detail=await request(runtime,'getConversation',{id:current.conversationId});state.chat=state.detail.conversation;await approveProducts(runtime,state.detail);if(state.detail.runs.length>2)throw Error('超过本场预登记的2次外部运行')}
  return current.status
 },{timeout:300000,intervals:[500]}).toBe('completed')
 state.detail=await request(runtime,'getConversation',{id:state.chat.id});await runtime.reviewData('自动化实际结果',{occurrence:await request(runtime,'getAutomationOccurrence',{id:occurrence.id}),detail:state.detail})
 await openChat(runtime,state)
 expect(state.detail.artifacts).toHaveLength(1);expect(state.detail.runs).toHaveLength(1)
 for(const artifact of state.detail.artifacts)await runtime.reviewFile('自动化原件',artifact.path,{required:true,expectedSha256:artifact.contentHash})
 await runtime.reviewCheckpoint('原生自动化交付')
})
Then('自动化成果与实际原生调用一致且不重放',async({runtime,nativeState:state})=>{
 const before=state.detail;await runtime.restart();await openChat(runtime,state)
 const after=await request<ConversationDetail>(runtime,'getConversation',{id:state.chat.id})
 expect(after.runs).toHaveLength(1);expect(after.artifacts).toEqual(before.artifacts);expect(after.runs[0].backend?.externalInvocations).toBe(1)
 await runtime.reviewData('自动化重启核对',after)
})

// Capture failure evidence before the isolated fixture removes its directory.
After('@native_runtime_validation',async({runtime,nativeState:state})=>{
 if(!state.chat)return
 const detail=await request<ConversationDetail>(runtime,'getConversation',{id:state.chat.id})
 await runtime.reviewData('最终场景快照',detail)
 for(const artifact of detail.artifacts)await runtime.reviewFile('最终原件-'+artifact.id,artifact.path,{required:true,expectedSha256:artifact.contentHash})
 for(const run of detail.runs){
  const items:import('../../../src/shared/domain/execution').ExecutionEvidence[]=[];let after:number|undefined
  do{
   const page=await request<import('../../../src/shared/domain/execution').ExecutionEvidencePage>(runtime,'listExecutionEvidence',{conversationId:state.chat.id,runId:run.id,after})
   for(let item of page.items){
    if(item.deferred){let body='',offset=0;for(;;){const chunk=await request<{content:string;next?:number;revision:number}>(runtime,'getExecutionContent',{conversationId:state.chat.id,runId:run.id,evidenceId:item.id,offset});expect(chunk.revision).toBe(item.revision);body+=chunk.content;if(chunk.next===undefined)break;offset=chunk.next}item=JSON.parse(body)}
    items.push(item)
   }
   after=page.next
  }while(after!==undefined)
  await runtime.reviewData('完整执行过程-'+run.id,items)
  await runtime.reviewData('原生交互-'+run.id,await request(runtime,'listNativeActions',{conversationId:state.chat.id,runId:run.id}))
  if(test.info().status!==test.info().expectedStatus&&['running','waiting_approval','queued'].includes(run.status)&&run.backend)await request(runtime,'stopNativeExecution',{conversationId:state.chat.id,runId:run.id})
 }
})

When('核对本机员工公开消息和原生命令停止',async({runtime,nativeState:state})=>{
 test.skip(!state.real,'此场景专门验证真实CLI启动的原生命令进程')
 const command="echo $$ > native-stop.pid; echo started > native-stop.started; sleep 120; echo finished > native-stop.finished"
 const cwd=resolve(runtime.root,'v2/agents',state.agent.id,'workspace/sessions',state.chat.id,'work')
 await runtime.reviewData('停止预登记',{runtime:state.runtime,command,turnCeiling:2,observationMs:120000,success:'公开消息一次、真实命令PID退出、停止后无完成文件、重启零重放'})
 await request(runtime,'sendMessage',{conversationId:state.chat.id,content:`先使用 BOAI send_message 发送一条普通消息，正文为“已收到，正在执行停止验证”。然后在当前工作目录用原生命令工具前台执行下面的完整命令，不要修改命令，不要后台运行，不要发布文件。我会在命令开始后从界面停止：\n${command}`,mentionIds:[],requestId:crypto.randomUUID()})
 let pid=0,run:AgentRun|undefined
 await expect.poll(async()=>{
  state.detail=await request(runtime,'getConversation',{id:state.chat.id});run=state.detail.runs[0]
  if(!run)return false
  for(const action of await request<import('../../../src/shared/domain/execution').NativeAction[]>(runtime,'listNativeActions',{conversationId:state.chat.id,runId:run.id})){
   if(action.status==='pending'&&(action.method==='mcp__boai__send_message'||(action.detail as any)?.input?.command===command||(action.detail as any)?.command===command)){
    await runtime.reviewData('批准停止场景-'+action.id,{action,decision:'allow once'})
    await request(runtime,'respondNativeAction',{conversationId:state.chat.id,runId:run.id,actionId:action.id,response:{option:state.runtime==='codex'?'accept':'allow'}})
   }
  }
  try{pid=Number((await readFile(resolve(cwd,'native-stop.pid'),'utf8')).trim());return Number.isSafeInteger(pid)&&pid>1&&['running','waiting_approval'].includes(run.status)}catch{return false}
 },{timeout:120000,intervals:[250]}).toBe(true)
 await runtime.reviewData('停止前实际进程',{pid,runId:run!.id,command})
 await runtime.reviewFile('停止前标记',resolve(cwd,'native-stop.started'),{required:true})
 // Explicit cleanup owns only the PID written by this isolated test command.
 runtime.defer(async()=>{const {execFileSync}=await import('node:child_process');try{if(execFileSync('/bin/ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).includes(command))process.kill(pid,'SIGKILL')}catch{}})
 await runtime.page.getByRole('button',{name:'会话操作',exact:true}).click();await runtime.page.getByRole('menuitem',{name:'执行过程',exact:true}).click()
 await runtime.page.getByRole('button',{name:'停止本次执行',exact:true}).click()
 await expect.poll(async()=>{state.detail=await request(runtime,'getConversation',{id:state.chat.id});return state.detail.runs[0].status},{timeout:20000}).toBe('cancelled')
 await expect.poll(()=>{try{process.kill(pid,0);return false}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return true;throw error}},{timeout:20000}).toBe(true)
 expect(state.detail.messages.filter(m=>m.senderType==='agent'&&m.content==='已收到，正在执行停止验证')).toHaveLength(1)
 expect(state.detail.workItems).toHaveLength(0)
 await expect(readFile(resolve(cwd,'native-stop.finished'),'utf8')).rejects.toMatchObject({code:'ENOENT'})
 await runtime.reviewData('停止实际结果',{pid,exited:true,detail:state.detail})
 await runtime.reviewCheckpoint('真实原生命令已停止')
 const before=state.detail.runs.length;await runtime.restart();await openChat(runtime,state)
 const after=await request<ConversationDetail>(runtime,'getConversation',{id:state.chat.id});expect(after.runs).toHaveLength(before)
 await runtime.reviewData('停止后重启核对',after)
})
When('本机核心助手创建独立员工并保留执行配置',async({runtime,nativeState:state})=>{
 test.skip(!state.real,'此场景专门验证真实CLI核心创建员工')
 const snapshot=await request<import('../../../src/shared/domain').Snapshot>(runtime,'snapshot',undefined)
 const core=snapshot.agents.find(a=>a.id==='bobo')!
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,systemRole,...input}=core
 const backend=state.agent.executionBackend,options=state.agent.nativeOptions,model=state.agent.modelId
 state.agent=await request(runtime,'saveAgent',{...input,id,expectedConfigVersion:configVersion,connectionId:'',modelId:model,executionBackend:backend,nativeOptions:options})
 const prompt='只创建一名新的独立员工，姓名“缓存核查员”，职责是白噪音微信小程序离线音频缓存的质量核查，沿用你的本机执行配置。不要建群，不要安排实际业务任务。请使用 BOAI 的员工查找和组织工具真正创建，再用不超过100字的普通消息告诉我创建结果。'
 await runtime.reviewData('核心预登记',{runtime:state.runtime,prompt,externalTurnCeiling:1,success:'实际新增独立员工、继承本机配置、没有业务群和额外模型阶段、重启零重放'})
 state.chat=await request(runtime,'startCoreConversation',{requestId:crypto.randomUUID(),content:prompt})
 await openChat(runtime,state)
 await expect.poll(async()=>{
  state.detail=await request(runtime,'getConversation',{id:state.chat.id})
  for(const run of state.detail.runs)for(const action of await request<import('../../../src/shared/domain/execution').NativeAction[]>(runtime,'listNativeActions',{conversationId:state.chat.id,runId:run.id}))if(action.status==='pending'&&['mcp__boai__find_employees','mcp__boai__organize_collaboration','mcp__boai__report_work','mcp__boai__send_message'].includes(action.method)){
   await runtime.reviewData('批准核心创建-'+action.id,{action,decision:'allow once'})
   await request(runtime,'respondNativeAction',{conversationId:state.chat.id,runId:run.id,actionId:action.id,response:{option:'allow'}})
  }
  return state.detail.runs.length>0&&state.detail.runs.every(r=>['completed','failed'].includes(r.status))
 },{timeout:180000,intervals:[400]}).toBe(true)
 expect(state.detail.runs.map(r=>r.error)).toEqual([undefined])
 const after=await request<import('../../../src/shared/domain').Snapshot>(runtime,'snapshot',undefined)
 const employee=after.agents.find(a=>a.name==='缓存核查员')!
 expect(employee).toBeTruthy();expect(employee.id).not.toBe(core.id);expect(employee.executionBackend).toEqual(backend);expect(employee.nativeOptions).toEqual(options)
 expect(after.conversations.filter(c=>c.kind==='group')).toEqual(snapshot.conversations.filter(c=>c.kind==='group'))
 await runtime.reviewData('核心实际结果',{employee,detail:state.detail})
 await runtime.reviewCheckpoint('核心创建独立原生员工')
 await runtime.restart();await openChat(runtime,state)
 expect((await request<ConversationDetail>(runtime,'getConversation',{id:state.chat.id})).runs).toHaveLength(1)
 await runtime.reviewData('核心重启核对',await request(runtime,'snapshot',undefined))
})

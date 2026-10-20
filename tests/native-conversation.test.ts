/*
 * [OUTPUT]: API状态配置进入真实Codex/Claude协议，动态情绪不重建线程，功能开关更新工具才重建。
 * [OUTPUT]: 本机配置优先：旧API目录保留、原生权限恢复、明确cwd和重启零重放。
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: Codex/Claude真实stdio知识工具读取、同版本续聊及更新/重启会话资格；无Work，夹具非真实模型。
 * [OUTPUT]: 同一整体权限经SQLite保存、实际stdio参数与只读提权拒绝核对；原协议夹具不认证真实模型。
 * [OUTPUT]: 浏览器读后写按2026-10-17默认免审批合同验收；保留媒体/惰性Work/来源回执及重启断言，不等待已退役网页审批。
 * [OUTPUT]: Codex/Claude定时浏览器经实际stdio/MCP协议执行读图/写入/回读，沿原occurrence Work。
 * [OUTPUT]: 执行未完成时的正文/思考增量回归，最终答复与私有协议字段保持分离。
 * [OUTPUT]: Claude非零退出保留原result错误；真实stdio媒体仍与持久摘要分开。
 * [OUTPUT]: 原生浏览器实际stdio/MCP媒体与只读到真实Work写入接线；协议夹具不冒充真实模型或Electron页面。
 * [OUTPUT]: Codex动态工具和Claude产品MCP实际stdio保存/重复核对与重启查询计划，不创建文件Work或调用API。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 2026-10-13高原生用量的最终发布/重启及同run材料回答回归；原接线合同保持，协议夹具不认证真实模型。
 * [INPUT]: 第13组原生员工规范和隔离stdio协议进程。
 * [OUTPUT]: 连续会话、真实文件登记、普通消息回答、权限拒绝与完整大输出；不把夹具视为真实模型评测。
 * [POS]: 生产AppService/本机驱动集成合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, realpath, writeFile, mkdir, copyFile, chmod, stat, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { nativeFixture } from './fixtures/native-product'
import { createHash } from 'node:crypto'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { AutomationDefinition, AutomationOccurrence, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message, Snapshot } from '../src/shared/domain'
import type { BrowserActionEnvelope, BrowserHostBridge, BrowserLease } from '../src/shared/ipc/browser'
import { parseBrowserSingleCommand } from '../src/runtime/adapters/mastra/browser-tool-runtime'
import type { ExecutionEvidence, ExecutionEvidencePage, NativeAction } from '../src/shared/domain/execution'
const disposals: (()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of disposals.splice(0).reverse())await close()})
describe.each(['codex', 'claude'] as const)('%s 原生员工', runtime => {
const setup=()=>nativeFixture(runtime,disposals)

it('keeps its native session across emotion changes but refreshes tools when personality features change', async () => {
 const f = await setup()
 const read = await f.service.handle('executeApplicationOperation', { operation: 'employees.profile', input: { agentId: f.agent.id } }) as import('../src/shared/domain/application-protocol').ApplicationResult
 const { agentId, revision, updatedAt, ...config } = read.data as import('../src/shared/domain/agent-profile').AgentProfile
 expect(await f.service.handle('executeApplicationOperation', { operation: 'employees.configure', input: { agentId, expectedRevision: revision, config: { ...config, features: { ...config.features, emotions: true } } }, requestId: 'state-tools' })).toMatchObject({ status: 'succeeded' })
 expect((await f.wait(await f.send('普通交流'))).runs.every(run => run.status === 'completed')).toBe(true)
 expect(await f.service.handle('executeApplicationOperation', { operation: 'employees.updateState', input: { agentId, conversationId: f.chat.id, expectedRevision: 0, change: { action: 'emotion', emotion: { mood: 'curious', valence: 8, energy: 7, reason: '本轮讨论' } } }, requestId: 'new-mood' })).toMatchObject({ status: 'succeeded' })
 expect((await f.wait(await f.send('继续交流'))).runs.every(run => run.status === 'completed')).toBe(true)
 const cwd = join(f.root, 'agents', agentId, 'workspace', 'sessions', f.chat.id, 'work')
 const requests = async () => (await readFile(join(cwd, 'native-thread-requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
 expect((await requests()).map(item => item.method)).toEqual(['thread/start', 'thread/resume'])
 expect(await f.service.handle('executeApplicationOperation', { operation: 'employees.configure', input: { agentId, expectedRevision: 1, config }, requestId: 'disable-state-tools' })).toMatchObject({ status: 'succeeded' })
 expect((await f.wait(await f.send('按关闭状态后的配置交流'))).runs.every(run => run.status === 'completed')).toBe(true)
 expect((await requests()).map(item => item.method)).toEqual(['thread/start', 'thread/resume', 'thread/start'])
})

it('preserves native configuration and explicit cwd when old API directory metadata exists', async () => {
 const f=await setup(), outside=await realpath(await mkdtemp(join(tmpdir(),'boai-native-cwd-')))
 disposals.push(()=>rm(outside,{recursive:true,force:true}))
 await f.service.close()
 const store=new ProductStore(join(f.root,'boai.sqlite'));await store.init()
 const inherited={...f.agent,directoryGrants:[{path:join(outside,'offline-api-directory'),access:'read-only' as const}],directoryRevision:1,nativeOptions:{codexSandbox:'workspace-write' as const,codexApprovalPolicy:'on-request' as const,claudePermissionMode:'acceptEdits' as const}}
 await store.write([{collection:'agents',id:inherited.id,value:inherited}]);await store.close();await f.restart()
 const {configVersion,memoryNamespace,workspaceRef,policyVersion,directoryRevision,...definition}=inherited
 const saved=await f.service.handle('saveAgent',{...definition,expectedConfigVersion:configVersion,expectedDirectoryRevision:1,name:'沿用本机配置'}) as DigitalAgent
 expect(saved.directoryGrants).toEqual(inherited.directoryGrants);expect(saved.nativeOptions).toEqual(inherited.nativeOptions)
 const first=await f.wait(await f.send('普通交流'))
 expect(first.runs.every(run=>run.status==='completed'),JSON.stringify(first.runs)).toBe(true)
 const sent=await f.service.handle('sendMessage',{conversationId:f.chat.id,content:'在指定目录继续',mentionIds:[],requestId:crypto.randomUUID(),workingDirectory:outside}) as Message
 const second=await f.wait(sent)
 expect(second.runs.every(run=>run.status==='completed'),JSON.stringify(second.runs)).toBe(true)
 expect(second.workItems).toEqual([])
 expect((await f.service.handle('snapshot',undefined) as Snapshot).approvals).toEqual([])
 for(const cwd of [join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work'),outside]){
  const calls=(await readFile(join(cwd,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
  if(runtime==='codex'){
   expect(calls[0].params).toMatchObject({cwd,sandbox:'workspace-write',approvalPolicy:'on-request'})
   expect(calls[0].params).not.toHaveProperty('permissions')
   const names=calls[0].params.dynamicTools.flatMap((entry:{tools?:{name:string}[]})=>(entry.tools??[]).map(tool=>tool.name))
   expect(names).not.toContain('request_directory');expect(names).toContain('publish_artifact')
  }else{
   const argv=calls[0].params.argv as string[]
   expect(argv[argv.indexOf('--permission-mode')+1]).toBe('acceptEdits')
   for(const flag of ['--settings','--setting-sources','--strict-mcp-config','--dangerously-skip-permissions'])expect(argv).not.toContain(flag)
  }
 }
 const inheritedAgain=await f.service.handle('saveAgent',{...definition,expectedConfigVersion:saved.configVersion,expectedDirectoryRevision:1,executionPermission:'full-access',nativeOptions:{...inherited.nativeOptions,useNativePermissions:true}}) as DigitalAgent
 expect(inheritedAgain.executionPermission).toBeUndefined();expect(inheritedAgain.nativeOptions).toEqual({useNativePermissions:true})
 const third=await f.wait(await f.send('重新沿用本机配置'))
 expect(third.runs.every(run=>run.status==='completed'),JSON.stringify(third.runs)).toBe(true)
 const inheritedCalls=(await readFile(join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work','native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 const last=inheritedCalls.at(-1).params
 if(runtime==='codex'){expect(last).not.toHaveProperty('sandbox');expect(last).not.toHaveProperty('approvalPolicy')}
 else {expect(last.argv).not.toContain('--permission-mode');expect(last.argv).not.toContain('--dangerously-skip-permissions');expect(last.argv).not.toContain('--settings')}
 const runCount=third.runs.length;await f.restart()
 expect((await f.detail()).runs).toHaveLength(runCount)
 expect((await f.service.handle('snapshot',undefined) as Snapshot).agents.find(agent=>agent.id===saved.id)?.directoryGrants).toEqual(inherited.directoryGrants)
 if(process.env.BOAI_NATIVE_CONFIG_EVIDENCE_DIR){
  const target=join(process.env.BOAI_NATIVE_CONFIG_EVIDENCE_DIR,runtime);await mkdir(target,{recursive:true})
  const store=new ProductStore(join(f.root,'boai.sqlite'));await store.init()
  try{await store.backup(join(target,'boai.sqlite'))}finally{await store.close()}
  await writeFile(join(target,'facts.json'),JSON.stringify({runtime,agent:inheritedAgain,requests:inheritedCalls,externalCwdRequests:(await readFile(join(outside,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line)),runs:third.runs,workItems:third.workItems,restartRunCount:runCount,externalRequests:0},null,2))
 }
})

it('reads knowledge through native product tools without Work and rebuilds the native session only when the knowledge version changes', async () => {
 const f=await setup(), source=join(f.root,'knowledge-source.md'), first='# 品牌规范\n标题蓝色。', second='# 品牌规范\n标题绿色。'
 await writeFile(source,first)
 const receipt=await f.service.handle('saveEmployeeKnowledge',{requestId:crypto.randomUUID(),agentId:f.agent.id,expectedConfigVersion:f.agent.configVersion,source:{kind:'file',path:source,name:'品牌规范.md'}}) as import('../src/shared/domain/knowledge').KnowledgeReceipt
 const resource=(await f.service.handle('listEmployeeKnowledge',{agentId:f.agent.id}) as import('../src/shared/domain').Resource[])[0]
 for(let i=0;i<2;i++){
  const detail=await f.wait(await f.send('NATIVE_KNOWLEDGE'))
  expect(detail.runs.every(run=>run.status==='completed'),JSON.stringify(detail.runs.map(run=>({status:run.status,error:run.error})))).toBe(true)
  expect(detail.messages.filter(message=>message.senderType==='agent').at(-1)?.content).toContain(first)
  expect(detail.workItems).toEqual([])
 }
 await writeFile(source,second)
 await f.service.handle('saveEmployeeKnowledge',{requestId:crypto.randomUUID(),agentId:f.agent.id,expectedConfigVersion:receipt.configVersion,source:{kind:'file',path:source,name:'品牌规范.md'},replace:{resourceId:resource.id,revision:resource.knowledge!.revision,contentHash:resource.knowledge!.contentHash}})
 const changed=await f.wait(await f.send('NATIVE_KNOWLEDGE'))
 expect(changed.runs.every(run=>run.status==='completed'),JSON.stringify(changed.runs.map(run=>({status:run.status,error:run.error})))).toBe(true)
 expect(changed.messages.filter(message=>message.senderType==='agent').at(-1)?.content).toContain(second)
 const beforeRestart=changed.runs.length
 await f.restart();expect((await f.detail()).runs).toHaveLength(beforeRestart)
 const restarted=await f.wait(await f.send('NATIVE_KNOWLEDGE'))
 expect(restarted.runs.every(run=>run.status==='completed'),JSON.stringify(restarted.runs.map(run=>({status:run.status,error:run.error})))).toBe(true);expect(restarted.workItems).toEqual([])
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 const requests=(await readFile(join(cwd,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 expect(requests.map(request=>request.method)).toEqual(['thread/start','thread/resume','thread/start','thread/resume'])
 const reads=(await readFile(join(cwd,'native-knowledge-reads.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 expect(reads.map(read=>read.content)).toEqual([first,first,second,second])
 expect(reads.every(read=>read.contentHash===createHash('sha256').update(read.content).digest('hex'))).toBe(true)
 const current=(await f.service.handle('listEmployeeKnowledge',{agentId:f.agent.id}) as import('../src/shared/domain').Resource[])[0]
 // Identical bytes still receive a new immutable copy/path and revision.
 await f.service.handle('saveEmployeeKnowledge',{requestId:crypto.randomUUID(),agentId:f.agent.id,expectedConfigVersion:receipt.configVersion,source:{kind:'file',path:source,name:'品牌规范.md'},replace:{resourceId:current.id,revision:current.knowledge!.revision,contentHash:current.knowledge!.contentHash}})
 const copied=await f.wait(await f.send('NATIVE_KNOWLEDGE'))
 expect(copied.runs.every(run=>run.status==='completed')).toBe(true);expect(copied.workItems).toEqual([])
 const finalRequests=(await readFile(join(cwd,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 const finalReads=(await readFile(join(cwd,'native-knowledge-reads.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 expect(finalRequests.map(request=>request.method)).toEqual(['thread/start','thread/resume','thread/start','thread/resume','thread/start'])
 expect(finalReads.at(-1).content).toBe(second);expect(finalReads.at(-1).citation).not.toBe(finalReads.at(-2).citation)
 if(process.env.BOAI_REVIEW_RUN_DIR){
  const target=join(process.env.BOAI_REVIEW_RUN_DIR,`native-knowledge-${runtime}`);await mkdir(target,{recursive:true})
  await writeFile(join(target,'evidence.json'),JSON.stringify({classification:'isolated-native-protocol',realProviderRequests:0,requests:finalRequests,reads:finalReads,detail:copied},null,2))
 }
})

it.each(['read-only', 'ask', 'full-access'] as const)('saves whole %s permissions and sends matching native access and approval settings', async executionPermission => {
 const f=await setup()
 const {id,configVersion,workspaceRef:_workspace,memoryNamespace:_memory,policyVersion:_policy,...input}=f.agent
 const saved=await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,executionPermission,nativeOptions:{effort:'low',codexSandbox:'workspace-write',codexApprovalPolicy:'untrusted',claudePermissionMode:'acceptEdits'}}) as DigitalAgent
 expect(saved.executionPermission).toBe(executionPermission)
 const d=await f.wait(await f.send(executionPermission==='read-only'?'NATIVE_APPROVAL':'普通交流'))
 expect(d.runs[0].status,d.runs[0].error).toBe('completed')
 const cwd=join(f.root,'agents',id,'workspace','sessions',f.chat.id,'work')
 const calls=(await readFile(join(cwd,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 if(runtime==='codex') {
  expect(calls[0].params).toMatchObject({sandbox:executionPermission==='full-access'?'danger-full-access':'read-only',approvalPolicy:executionPermission==='ask'?'on-request':'never'})
 } else {
  const argv=calls[0].params.argv as string[]
  expect(argv[argv.indexOf('--permission-mode')+1]).toBe(executionPermission==='full-access'?'bypassPermissions':executionPermission==='read-only'?'plan':'default')
  expect(argv.includes('--dangerously-skip-permissions')).toBe(executionPermission==='full-access')
 }
 if(executionPermission==='read-only') {
  expect((await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId:d.runs[0].id}) as NativeAction[]).filter(action=>action.status==='pending')).toEqual([])
  await expect(readFile(join(cwd,'permission-marker'))).rejects.toMatchObject({code:'ENOENT'})
 }
 await f.restart()
 expect((await f.service.handle('snapshot',undefined) as Snapshot).agents.find(agent=>agent.id===id)).toMatchObject({executionPermission,nativeOptions:saved.nativeOptions})
})

it('uses the BOAI browser from scheduled native work with the original occurrence lease', async () => {
 const actions: BrowserActionEnvelope[] = [], leases: BrowserLease[] = []
 let f: Awaited<ReturnType<typeof nativeFixture>>, value = 'before'
 const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yRuoAAAAASUVORK5CYII='
 const host = { request: async (method: string, input: unknown) => {
  if (method === 'disconnect') return
  if (method === 'acquire') { leases.push(input as BrowserLease); return }
  if (method === 'inspect') return null
  if (method === 'drain') return { drained: true }
  if (method === 'executeSingle') {
   const action = input as BrowserActionEnvelope; actions.push(action)
   await f.service.startBrowserAction({ actionId: action.actionId, generation: action.lease.generation, runId: action.lease.runId, workId: action.lease.workId })
   if (action.command.includes('fill')) value = 'after'
   return { actionId: action.actionId, generation: action.lease.generation, status: 'completed', result: { output: value, appendReleaseHint: false, ...(action.command.includes('screenshot') ? { image: { data: png, mimeType: 'image/png', sizeBytes: Buffer.from(png, 'base64').length } } : {}) } }
  }
  throw new Error(`Unexpected browser method: ${method}`)
 } } as BrowserHostBridge
 f = await nativeFixture(runtime, disposals, undefined, true, host)
 const plan = await f.service.handle('saveAutomation', { name: '本机浏览器定时任务', prompt: 'NATIVE_BROWSER_WRITE https://example.test/', conversationPolicy: 'new-conversation', employeeIds: [f.agent.id], frequency: 'manual', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }) as AutomationDefinition
 const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'native-scheduled-browser' }) as AutomationOccurrence
 let detail: ConversationDetail | undefined
 await expect.poll(async () => {
  detail = await f.service.handle('getConversation', { id: occurrence.conversationId }) as ConversationDetail
  return detail.runs.some(run => run.phase === 'execution' && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
 }, { timeout: 15000 }).toBe(true)
 const run = detail!.runs.find(run => run.phase === 'execution')!
 expect(run.status, run.error).toBe('completed')
 expect(actions.map(action => parseBrowserSingleCommand(action.command).parts)).toEqual([['snapshot'], ['screenshot', '--png'], ['fill', '@e1', 'after'], ['snapshot']])
 expect(leases).toHaveLength(1)
 expect(detail!.workItems).toHaveLength(1)
 expect(detail!.workItems![0]).toMatchObject({ status: 'delivered', origin: { occurrenceId: occurrence.id } })
 expect(actions.every(action => action.lease.workId === detail!.workItems![0].id && action.lease.conversationId === occurrence.conversationId)).toBe(true)
})

it('exposes narration and reasoning while execution is still running, without publishing a final answer', async () => {
 const f = await setup(), message = await f.send('NATIVE_WAIT')
 let page: ExecutionEvidencePage | undefined
 await expect.poll(async () => {
  const detail = await f.detail(), run = detail.runs.find(run => run.triggerMessageId === message.id && run.phase === 'execution')
  if (!run) return false
  page = await f.service.handle('listExecutionEvidence', { conversationId: f.chat.id, runId: run.id }) as ExecutionEvidencePage
  return page.items.some(event => event.eventType === 'agent.reasoning.block' && (event.payload as {text?:string}).text === '先检查输入')
 }, { timeout: 4000, interval: 50 }).toBe(true)
 const live = await f.detail()
 expect(live.runs.find(run => run.triggerMessageId === message.id)?.status).toBe('running')
 expect(live.messages.filter(message => message.senderType === 'agent')).toHaveLength(0)
 expect(page!.items.some(event => event.eventType === 'agent.text.block' && (event.payload as {text?:string}).text === '正在处理原生请求。')).toBe(true)
 expect(JSON.stringify(page)).not.toContain('private-reasoning')
})

it('reads images through the native browser tool without Work, then lazily claims a real write and preserves read receipts',async()=>{
 const page={instanceId:'browser-instance',scopeKey:'application-browser',pageVersion:'1',url:'https://example.test/',title:'Current page',obtainedAt:new Date().toISOString()}
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yRuoAAAAASUVORK5CYII=','base64')
 const acquired:import('../src/shared/ipc/browser').BrowserLease[]=[],actions:import('../src/shared/ipc/browser').BrowserActionEnvelope[]=[]
 let f:Awaited<ReturnType<typeof nativeFixture>>,value='before'
 const host={request:async(method:string,input:any)=>{
  if(method==='disconnect')return
  if(method==='reference')return page
  if(method==='acquire'){acquired.push(structuredClone(input));return}
  if(method==='inspect')return {...page,generation:input.generation}
  if(method==='drain')return {drained:true}
  if(method==='executeSingle'){
   actions.push(structuredClone(input))
   await f.service.startBrowserAction({actionId:input.actionId,generation:input.lease.generation,runId:input.lease.runId,workId:input.lease.workId})
   if(input.command.includes('fill')){value='after';page.pageVersion='2'}
   return {actionId:input.actionId,generation:input.lease.generation,status:'completed',source:{...page,generation:input.lease.generation},result:{output:value,appendReleaseHint:false,...(input.command.includes('screenshot')?{image:{data:png.toString('base64'),mimeType:'image/png',sizeBytes:png.length}}:{})}}
  }
  throw Error('unexpected browser method '+method)
 }} as import('../src/shared/ipc/browser').BrowserHostBridge
 f=await nativeFixture(runtime,disposals,undefined,true,host)
 const first=await f.wait(await f.send('NATIVE_BROWSER_READ https://example.test/'))
 expect(first.runs[0].status,first.runs[0].error).toBe('completed');expect(first.workItems).toHaveLength(0)
 expect(acquired).toHaveLength(1);expect(acquired[0].workId).toBeUndefined();expect(acquired[0].sourceMessageId).toBeTruthy()
 const secondMessage=await f.send('NATIVE_BROWSER_WRITE https://example.test/')
 const second=await f.wait(secondMessage)
 expect(((await f.service.handle('snapshot',undefined)) as import('../src/shared/domain').Snapshot).approvals.filter(approval=>approval.kind==='browser')).toEqual([])
 expect(second.runs.at(-1)?.status,second.runs.at(-1)?.error).toBe('completed')
 expect(second.workItems).toHaveLength(1);expect(second.workItems![0].status).toBe('delivered')
 const read=actions.find(action=>action.command.includes('snapshot'))!,write=actions.find(action=>action.command.includes('fill'))!
 expect(read.lease.workId).toBeUndefined();expect(write.lease.workId).toBe(second.workItems![0].id)
 expect(acquired.filter(lease=>lease.runId===write.lease.runId)).toHaveLength(2)
 const media=(await readFile(join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work','native-browser-media.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 expect(media).toHaveLength(2);expect(media.every(item=>item.type===(runtime==='codex'?'inputImage':'image') && item.hash===createHash('sha256').update(png).digest('hex') && item.bytes===png.length)).toBe(true)
 const store=new ProductStore(join(f.root,'boai.sqlite'));await store.init()
 try{
  const receipts=await store.load<{lease:{workId?:string};status:string;reply?:unknown}>('browserActions')
  expect(receipts.some(receipt=>!receipt.lease.workId && receipt.status==='completed')).toBe(true)
  expect(JSON.stringify(await store.load('executionEvidence'))).not.toContain(png.toString('base64'))
 }finally{await store.close()}
 await f.restart()
 expect((await f.detail()).workItems![0].status).toBe('delivered')
})
it('manages an automation through the native product bridge without Work and reads the same plan after restart', async () => {
 const f=await setup(),first=await f.wait(await f.send('NATIVE_AUTOMATION_SAVE'))
 expect(first.runs[0].status,first.runs[0].error).toBe('completed')
 expect(first.workItems).toHaveLength(0)
 const view=await f.service.handle('listOwnerAutomations',{owner:{kind:'employee',employeeId:f.agent.id},limit:20}) as import('../src/shared/domain').AutomationListPage
 expect(view.definitions).toHaveLength(1)
 expect(view.definitions[0]).toMatchObject({name:'原生日报',enabled:false,revision:1,employeeIds:[f.agent.id],conversationPolicy:'new-conversation'})
 await f.restart();await f.restart()
 const second=await f.wait(await f.send('NATIVE_AUTOMATION_LIST'))
 expect(second.runs.at(-1)?.status,second.runs.at(-1)?.error).toBe('completed')
 const after=await f.service.handle('listOwnerAutomations',{owner:{kind:'employee',employeeId:f.agent.id},limit:20}) as import('../src/shared/domain').AutomationListPage
 expect(after.definitions.map(d=>d.id)).toEqual(view.definitions.map(d=>d.id))
 expect((await f.service.handle('listAutomations',undefined) as import('../src/shared/domain').AutomationsView).occurrences).toHaveLength(0)
})
it('keeps an ordinary native turn above 16000 running through final reply and restart, without BOAI usage accounting',async()=>{
 const f=await setup(),first=await f.wait(await f.send('NATIVE_HIGH_USAGE'))
 expect(first.runs[0].status,first.runs[0].error).toBe('completed')
 expect(first.runs[0].usage).toBeUndefined()
 expect(first.turns?.[0]).toMatchObject({status:'completed',modelCalls:0})
 expect(first.turns?.[0].tokenEstimate).toBeUndefined()
 expect(first.workItems).toHaveLength(0);expect(first.messages.some(m=>m.senderType==='agent'&&m.status==='completed')).toBe(true)
 await f.restart();expect((await f.detail()).runs.map(r=>r.id)).toEqual(first.runs.map(r=>r.id))
 const next=await f.wait(await f.send('继续普通聊天'))
 expect(next.runs.at(-1)?.status).toBe('completed')
 expect(next.runs.at(-1)?.backend?.sessionId).toBe(first.runs[0].backend?.sessionId)
})
it('publishes native delivery Work above the former output cap without charging a BOAI budget',async()=>{
 const f=await setup(),detail=await f.wait(await f.send('NATIVE_HIGH_USAGE NATIVE_PUBLISH'))
 expect(detail.runs[0].status,detail.runs[0].error).toBe('completed')
 expect(detail.workItems?.[0]).toMatchObject({status:'delivered',budgetPolicy:'native'})
 expect(detail.artifacts).toHaveLength(1)
 expect(detail.workBudgets?.[0]).toMatchObject({modelCalls:0,runs:0,usage:{}})
 expect(detail.runs[0].usage).toBeUndefined()
})
it('does not let contradictory native usage override successful output and file delivery',async()=>{
 const f=await setup(),detail=await f.wait(await f.send('NATIVE_CONFLICTING_USAGE NATIVE_PUBLISH'))
 expect(detail.runs[0].status,detail.runs[0].error).toBe('completed')
 expect(detail.workItems?.[0].status).toBe('delivered');expect(detail.artifacts).toHaveLength(1)
 expect(detail.runs[0].usage).toBeUndefined();expect(detail.runs[0].backend?.totalCostUsd).toBeUndefined()
 expect(detail.runs[0].backend?.contextUsedTokens).toBeUndefined()
})
it('allows a high-usage native question to receive material in the same run',async()=>{
 const f=await setup(),message=await f.send('NATIVE_HIGH_USAGE NATIVE_QUESTION NATIVE_READ_MATERIALS')
 await expect.poll(async()=>(await f.detail()).messages.some(m=>m.content==='这个文档针对什么产品？')).toBe(true)
 const path=join(f.root,'high-usage-input.json');await writeFile(path,'{"source":"HIGH_USAGE_ORIGINAL_29653"}')
 const material=await f.service.handle('prepareMaterial',{conversationId:f.chat.id,path,requestId:crypto.randomUUID()}) as import('../src/shared/domain').ConversationMaterial
 await f.service.handle('sendMessage',{conversationId:f.chat.id,content:'请读取这一份原件',mentionIds:[],requestId:crypto.randomUUID(),materialSelections:[{id:material.id,revision:material.revision}]})
 const detail=await f.wait(message);expect(detail.runs.map(r=>r.status)).toEqual(['completed'])
 const actions=await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId:detail.runs[0].id}) as NativeAction[]
 expect(actions[0]).toMatchObject({status:'answered',delivery:'submitted'})
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 expect(await readFile(join(cwd,'native-material-reads.jsonl'),'utf8')).toContain(Buffer.from('HIGH_USAGE_ORIGINAL_29653').toString('hex'))
})


it('keeps native tools and a persistent session; no private decision/report/memory calls or restart replay',async()=>{
 const f=await setup();const first=await f.wait(await f.send('你好'));const second=await f.wait(await f.send('继续讨论'))
 expect(second.runs).toHaveLength(2);expect(second.runs.every(r=>r.phase==='execution'&&r.status==='completed'&&r.backend?.externalInvocations===1)).toBe(true)
 expect(new Set(second.runs.map(r=>r.backend?.sessionId)).size).toBe(1)
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 const calls=(await readFile(join(cwd,'native-thread-requests.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(s))
 expect(calls.map(c=>c.method)).toEqual(['thread/start','thread/resume'])
 expect(calls[0].params).not.toHaveProperty('baseInstructions');expect(calls[0].params).not.toHaveProperty('tools');if(runtime === 'codex') {
  expect(calls[0].params.dynamicTools[0].tools.some((t:any)=>t.name==='publish_artifact')).toBe(true)
  expect(calls[0].params.dynamicTools[0].tools.find((t:any)=>t.name==='report_work').inputSchema.properties).not.toHaveProperty('userQuestion')
 }
 else { expect(calls[0].params.argv).toContain('--mcp-config'); expect(calls[0].params.argv).not.toContain('--tools') }
 const turns=(await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(JSON.parse(s).input[0].text))
 expect(turns[1].messages).toHaveLength(1);expect(turns[1].messages[0].content).toBe('继续讨论')
 await f.restart();expect((await f.detail()).runs).toHaveLength(second.runs.length)
 expect((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n')).toHaveLength(2)
 expect(first.workItems).toHaveLength(0)
})
it('publishes an actual file without a synthetic decision and deduplicates native tool requests',async()=>{
 const f=await setup(),d=await f.wait(await f.send('NATIVE_PUBLISH'))
 expect(d.runs[0].status,d.runs[0].error).toBe('completed');expect(d.artifacts).toHaveLength(1);expect(d.workItems).toHaveLength(1)
 expect(d.workItems![0].status).toBe('delivered');expect(d.runs).toHaveLength(1)
 expect(d.messages.find(m=>m.senderType==='agent')?.content).toBe('已交付文件')
})
it('answers a native clarification as a normal message in the same turn',async()=>{
 const f=await setup(),m=await f.send('NATIVE_QUESTION');let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.detail();return d.messages.some(m=>m.content==='这个文档针对什么产品？')},{timeout:15000}).toBe(true)
 await expect.poll(async()=>((await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId:d!.runs[0].id})) as NativeAction[]).some(a=>a.status==='pending')).toBe(true)
 await f.send('白噪音小程序');d=await f.wait(m)
 expect(d.runs).toHaveLength(1);expect(d.messages.some(m=>m.content==='收到普通聊天回复：白噪音小程序')).toBe(true)
})
it.each(['正文和文本','只附原件'] as const)('delivers %s to the waiting native request once and preserves sources through restart',async kind=>{
 const f=await setup(),first=await f.send('NATIVE_QUESTION NATIVE_READ_MATERIALS')
 let action:NativeAction|undefined,runId=''
 await expect.poll(async()=>{runId=(await f.detail()).runs[0]?.id??'';if(!runId)return;action=(await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}) as NativeAction[])[0];return action?.status}).toBe('pending')
 const bytes=Buffer.from(kind==='正文和文本'?'源材料：甲方项目原文':'{"amount":731,"original":"文件原件"}'),path=join(f.root,kind==='正文和文本'?'request.md':'request.json')
 await writeFile(path,bytes)
 const material=await f.service.handle('prepareMaterial',{conversationId:f.chat.id,path,requestId:crypto.randomUUID(),authorizedAgentIds:[f.agent.id]}) as import('../src/shared/domain').ConversationMaterial
 const input={conversationId:f.chat.id,content:kind==='正文和文本'?'项目资料见附件':'',mentionIds:[],requestId:crypto.randomUUID(),materialSelections:[{id:material.id,revision:material.revision}]}
 const answer=await f.service.handle('sendMessage',input) as Message
 const d=await f.wait(first)
 expect(d.runs.map(r=>r.status)).toEqual(['completed']);expect(d.runs[0].error).toBeUndefined()
 expect((await f.service.handle('sendMessage',input) as Message).id).toBe(answer.id)
 const saved=(await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}) as NativeAction[])[0]
 expect(saved.status).toBe('answered');expect(saved.responseMessageId).toBe(answer.id)
 expect(JSON.stringify(saved.response)).toContain(kind==='正文和文本'?'源材料：甲方项目原文':'nativePath')
 expect(d.messages.find(m=>m.senderType==='agent'&&m.content.startsWith('收到普通聊天回复'))?.materialSources?.map(r=>r.id)).toContain(material.id)
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 if(kind==='只附原件'){
  const reads=(await readFile(join(cwd,'native-material-reads.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
  expect(reads).toHaveLength(1);expect(reads[0].bytes).toBe(bytes.toString('hex'));expect(reads[0].hash).toBe(createHash('sha256').update(bytes).digest('hex'))
 }
 await f.restart();expect((await f.detail()).runs).toHaveLength(1)
 const next=await f.wait(await f.send('继续，只回答当前消息'))
 expect(next.runs.at(-1)?.backend?.sessionId).toBe(d.runs[0].backend?.sessionId)
 const prompt=JSON.parse(JSON.parse((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n').at(-1)!).input[0].text)
 expect(prompt.messages.map((m:Message)=>m.content)).toEqual(['继续，只回答当前消息'])
 await f.service.handle('setMaterialAuthorization',{id:material.id,expectedRevision:material.revision,authorizedAgentIds:[]})
 const revoked=await f.wait(await f.send('来源撤权后的新消息'))
 expect(revoked.runs.at(-1)?.backend?.sessionId).not.toBe(d.runs[0].backend?.sessionId)
})
it('provides actual image and ordinary file bytes to native tools on the first turn',async()=>{
 const f=await setup(),files=[{name:'one.png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwmHAAAAKkAZGL4t77AAAAAElFTkSuQmCC','base64')},{name:'payload.json',bytes:Buffer.from('{"value":731}')}]
 const selections=[]
 for(const file of files){const path=join(f.root,file.name);await writeFile(path,file.bytes);const material=await f.service.handle('prepareMaterial',{conversationId:f.chat.id,path,requestId:crypto.randomUUID(),authorizedAgentIds:[f.agent.id]}) as import('../src/shared/domain').ConversationMaterial;selections.push({id:material.id,revision:material.revision})}
 const message=await f.service.handle('sendMessage',{conversationId:f.chat.id,content:'NATIVE_READ_MATERIALS',mentionIds:[],requestId:crypto.randomUUID(),materialSelections:selections}) as Message
 const d=await f.wait(message);expect(d.runs[0].status,d.runs[0].error).toBe('completed')
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 const reads=(await readFile(join(cwd,'native-material-reads.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
 expect(reads.map(read=>read.bytes).sort()).toEqual(files.map(file=>file.bytes.toString('hex')).sort())
})
it.skipIf(runtime!=='claude')('matches Claude capacity to the initialized native model instead of its API alias or helper',async()=>{
 const f=await setup(),{id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,modelId:'alias-fixture'})
 const first=await f.wait(await f.send('NATIVE_METADATA'))
 const backend=first.runs[0].backend as any
 expect(first.runs[0].status).toBe('completed');expect(backend.modelId).toBe('fixture-main[1m]')
 expect(backend.selectedModelId).toBe('alias-fixture');expect(backend.reportedModelId).toBe('fixture')
 expect(backend.contextWindowTokens).toBe(1000000);expect(backend.contextWindowSource.modelId).toBe('fixture-main[1m]')
 expect(backend.nativeInfo.commands).toEqual([{name:'native-command',description:'Public command'}])
 expect(JSON.stringify(first)).not.toContain('PRIVATE_ACCOUNT_TOKEN');expect(JSON.stringify(first)).not.toContain('PRIVATE_SYSTEM_TOKEN')
 await f.restart();const next=await f.wait(await f.send('NATIVE_METADATA_NEXT'))
 expect(next.runs.at(-1)?.backend?.contextWindowTokens).toBe(1000000)
 expect(next.runs.at(-1)?.backend?.sessionId).toBe(backend.sessionId)
})
it.skipIf(runtime!=='claude')('keeps executing when optional Claude model directories or capacity are absent',async()=>{
 const f=await setup(),{id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,modelId:'missing-meta-fixture'})
 const d=await f.wait(await f.send('原文指令照常执行'))
 expect(d.runs[0].status,d.runs[0].error).toBe('completed');expect(d.runs[0].backend?.contextWindowTokens).toBeUndefined()
 expect(d.runs[0].backend?.externalInvocations).toBe(1);expect(d.workItems).toHaveLength(0)
})
it('does not release a native answer or keep an exported copy when its message transaction fails',async()=>{
 const f=await setup(),first=await f.send('NATIVE_QUESTION NATIVE_READ_MATERIALS')
 await expect.poll(async()=>(await f.detail()).messages.some(m=>m.content==='这个文档针对什么产品？')).toBe(true)
 const runId=(await f.detail()).runs[0].id
 const path=join(f.root,'fault.json');await writeFile(path,'{"value":913}')
 const material=await f.service.handle('prepareMaterial',{conversationId:f.chat.id,path,requestId:crypto.randomUUID()}) as import('../src/shared/domain').ConversationMaterial
 const input={conversationId:f.chat.id,content:'核对这个原件',mentionIds:[],requestId:crypto.randomUUID(),materialSelections:[{id:material.id,revision:material.revision}]}
 const original=ProductStore.prototype.transaction
 const spy=vi.spyOn(ProductStore.prototype,'transaction').mockImplementation(function(this:ProductStore,callback:any){return original.call(this,async tx=>callback({...tx,put:async(value:any)=>{if(value.collection==='messageReceipts'&&value.id===input.requestId)throw Error('SQLITE_FULL injected before message acceptance');await tx.put(value)}})) as any})
 try { await expect(f.service.handle('sendMessage',input)).rejects.toThrow('SQLITE_FULL') } finally { spy.mockRestore() }
 const before=await f.detail();expect(before.messages.some(m=>m.content===input.content)).toBe(false)
 expect((await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}) as NativeAction[])[0].status).toBe('pending')
 const privateHome=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,runtime==='codex'?'.codex-private':'.claude-private')
 expect(await readdir(join(privateHome,'material-inputs'))).toEqual([])
 const reader=await ProductStore.openReadOnly(join(f.root,'boai.sqlite'))
 try { expect(await reader.load('materialNativeCopies')).toEqual([]) } finally { await reader.close() }
 await f.service.handle('sendMessage',input);const d=await f.wait(first)
 expect(d.runs.map(r=>r.status)).toEqual(['completed']);expect(d.messages.filter(m=>m.content===input.content)).toHaveLength(1)
})
it('cancels an active native run when newly answered material is revoked and removes only its tracked copy',async()=>{
 const f=await setup(),first=await f.send('NATIVE_QUESTION NATIVE_READ_MATERIALS NATIVE_WAIT')
 await expect.poll(async()=>(await f.detail()).messages.some(m=>m.content==='这个文档针对什么产品？')).toBe(true)
 const path=join(f.root,'revoke.json');await writeFile(path,'{"actual":317}')
 const material=await f.service.handle('prepareMaterial',{conversationId:f.chat.id,path,requestId:crypto.randomUUID(),authorizedAgentIds:[f.agent.id]}) as import('../src/shared/domain').ConversationMaterial
 await f.service.handle('sendMessage',{conversationId:f.chat.id,content:'使用附件',mentionIds:[],requestId:crypto.randomUUID(),materialSelections:[{id:material.id,revision:material.revision}]})
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 await expect.poll(async()=>readFile(join(cwd,'native-material-reads.jsonl'),'utf8').catch(()=>''),{timeout:5000}).toContain('317'.split('').map(c=>c.charCodeAt(0).toString(16)).join(''))
 const read=JSON.parse((await readFile(join(cwd,'native-material-reads.jsonl'),'utf8')).trim())
 await f.service.handle('setMaterialAuthorization',{id:material.id,expectedRevision:material.revision,authorizedAgentIds:[]})
 const d=await f.wait(first);expect(d.runs[0].status).toBe('cancelled')
 await expect(stat(read.path)).rejects.toThrow('ENOENT');expect(await readFile(path,'utf8')).toBe('{"actual":317}')
 await f.restart();expect((await f.detail()).runs).toHaveLength(1)
})
it('requires a target when multiple employees are awaiting native input instead of queuing a deadlock',async()=>{
 const f=await setup(),{id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const second=await f.service.handle('saveAgent',{...input,name:'第二位提问员工'}) as DigitalAgent
 const chat=await f.service.handle('createConversation',{kind:'group',title:'两个原生问题',agentIds:[f.agent.id,second.id]}) as Conversation
 await f.service.handle('sendMessage',{conversationId:chat.id,content:'NATIVE_QUESTION',mentionIds:[],requestId:crypto.randomUUID()})
 const detail=()=>f.service.handle('getConversation',{id:chat.id}) as Promise<ConversationDetail>
 await expect.poll(async()=>(await detail()).messages.filter(m=>m.content==='这个文档针对什么产品？').length).toBe(2)
 await expect(f.service.handle('sendMessage',{conversationId:chat.id,content:'尚未选定回答对象',mentionIds:[],requestId:crypto.randomUUID()})).rejects.toThrow('多个原生问题')
 expect((await detail()).messages.some(m=>m.content==='尚未选定回答对象')).toBe(false)
 for(const employee of [f.agent,second])await f.service.handle('sendMessage',{conversationId:chat.id,content:'回答给'+employee.name,mentionIds:[employee.id],requestId:crypto.randomUUID()})
 await expect.poll(async()=>(await detail()).runs.filter(r=>r.status==='completed').length).toBe(2)
 expect((await detail()).runs).toHaveLength(2)
})
it('excludes native input copies from backup even before a native run is registered',async()=>{
 const f=await setup(),privateRelative=join('agents',f.agent.id,'workspace','sessions',f.chat.id,runtime==='codex'?'.codex-private':'.claude-private'),privateHome=join(f.root,privateRelative)
 await mkdir(join(privateHome,'material-inputs'),{recursive:true});await writeFile(join(privateHome,'material-inputs','orphan-original'),'PRIVATE_COPY_MUST_NOT_EXPORT')
 const backup=await mkdtemp(join(tmpdir(),'boai-native-private-backup-'));disposals.push(()=>rm(backup,{recursive:true,force:true}));await f.service.backup(backup)
 await expect(stat(join(backup,privateRelative))).rejects.toThrow('ENOENT')
 const receipt=JSON.parse(await readFile(join(backup,'backup.json'),'utf8'))
 expect(receipt.excludedNativeRuntimeHomes).toContain(privateRelative)
})
it('keeps an explicit user path intact for native tools even when it is not a BOAI attachment',async()=>{
 const f=await setup(),path=join(f.root,'explicit-original.dat');await writeFile(path,'EXPLICIT_NATIVE_FILE_TOKEN')
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,allowCommands:false})
 const content='NATIVE_EXPLICIT_PATH\n'+JSON.stringify({path}),d=await f.wait(await f.send(content))
 expect(d.runs[0].status,d.runs[0].error).toBe('completed');expect(d.workItems).toHaveLength(0)
 expect(d.messages.some(m=>m.content==='EXPLICIT_NATIVE_FILE_TOKEN')).toBe(true)
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 const prompt=JSON.parse(JSON.parse((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim()).input[0].text)
 expect(prompt.messages[0].content).toBe(content)
})
it('refuses native operations when the user denies permission',async()=>{
 const f=await setup(),m=await f.send('NATIVE_APPROVAL');let runId='',action:NativeAction|undefined
 await expect.poll(async()=>{const d=await f.detail();runId=d.runs[0]?.id??'';if(!runId)return false;action=((await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}))as NativeAction[])[0];return action?.status},{timeout:15000}).toBe('pending')
 await f.service.handle('respondNativeAction',{conversationId:f.chat.id,runId,actionId:action!.id,response:{option:runtime === 'codex' ? 'decline' : 'deny'}})
 const d=await f.wait(m);expect(d.messages.some(m=>m.content==='已拒绝，未执行')).toBe(true)
 await expect(readFile(join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work','permission-marker'))).rejects.toThrow()
})
it('retains complete streamed output and unknown extensions, excluding private frames/signatures',async()=>{
 const f=await setup(),d=await f.wait(await f.send('NATIVE_LONG')),run=d.runs[0]
 expect(run.status,run.error).toBe('completed')
 const page=await f.service.handle('listExecutionEvidence',{conversationId:f.chat.id,runId:run.id}) as ExecutionEvidencePage
 expect(JSON.stringify(page)).not.toContain('private-reasoning');expect(page.items.some(e=>e.eventType==='runtime.native')).toBe(true)
 const big=page.items.find(e=>e.deferred)!;expect(big).toBeDefined()
 let text='',offset=0
 for(;;){const p=await f.service.handle('getExecutionContent',{conversationId:f.chat.id,runId:run.id,evidenceId:big.id,offset}) as {content:string;next?:number};text+=p.content;if(p.next===undefined)break;offset=p.next}
 const full=JSON.parse(text) as ExecutionEvidence
 expect(((full.payload as any).item.aggregatedOutput ?? (full.payload as any).item.result)).toBe('完整输出🌱'.repeat(30000));expect(full.canonical?.outcome).toBe('succeeded')
})
it('uses the ordinary revision message to publish the next fixed version and keeps original bytes',async()=>{
 const f=await setup(),first=await f.wait(await f.send('NATIVE_PUBLISH')),original=first.artifacts[0]
 const second=await f.wait(await f.send('NATIVE_REVISE 修改刚才文件'))
 expect(second.runs.every(r=>r.status==='completed')).toBe(true);expect(second.artifacts, JSON.stringify(second.messages.map(m=>m.content))).toHaveLength(2)
 const next=second.artifacts.find(a=>a.id!==original.id)!
 expect(next.logicalArtifactId).toBe(original.logicalArtifactId);expect(next.contentVersion).toBe(2)
 expect(second.workItems).toHaveLength(2);expect(second.artifacts.find(a=>a.id===original.id)?.contentHash).toBe(original.contentHash)
})
it('queues a new message while a native turn is active and stop releases the actual process before continuing',async()=>{
 const f=await setup(),first=await f.send('NATIVE_WAIT')
 let runId=''
 await expect.poll(async()=>{const d=await f.detail(),r=d.runs.find(r=>r.triggerMessageId===first.id);runId=r?.id??'';return r?.backend?.inputAccepted},{timeout:15000}).toBe(true)
 const next=await f.send('普通新消息')
 const cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 expect((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n')).toHaveLength(1)
 await f.service.handle('stopNativeExecution',{conversationId:f.chat.id,runId})
 const d=await f.wait(next);expect(d.runs.find(r=>r.id===runId)?.status).toBe('cancelled');expect(d.runs.find(r=>r.triggerMessageId===next.id)?.status).toBe('completed')
})
it('uses distinct native sessions for employees in the same group without an API coordinator',async()=>{
 const f=await setup()
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const second=await f.service.handle('saveAgent',{...input,name:'第二位员工'}) as DigitalAgent
 const chat=await f.service.handle('createConversation',{kind:'group',title:'原生群',agentIds:[f.agent.id,second.id]}) as Conversation
 await f.service.handle('sendMessage',{conversationId:chat.id,content:'大家介绍自己',mentionIds:[],requestId:crypto.randomUUID()})
 let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs.filter(r=>r.status==='completed').length},{timeout:15000}).toBe(2)
 expect(d!.runs).toHaveLength(2);expect(new Set(d!.runs.map(r=>r.backend?.sessionId)).size).toBe(2)
 expect(d!.messages.filter(m=>m.senderType==='agent')).toHaveLength(2)
})

it('records a real text result without a private reporting model call',async()=>{
 const f=await setup(),d=await f.wait(await f.send('NATIVE_REPORT'))
 expect(d.runs[0].status,d.runs[0].error).toBe('completed');expect(d.workItems?.[0].status).toBe('delivered');expect(d.messages.some(m=>m.content==='原生核对完成')).toBe(true)
})
it.each(['CREATE','ONLY','EXEC'])('core employee organizes %s through native product tools and actual receipts',async mode=>{
 const f=await setup(),snapshot=await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot
 const core=snapshot.agents.find(a=>a.id==='bobo')!
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,systemRole,...input}=core
 await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,connectionId:'',modelId:'',executionBackend:f.agent.executionBackend})
 const chat=await f.service.handle('startCoreConversation',{requestId:crypto.randomUUID(),content:'NATIVE_ORG_'+mode}) as Conversation
 let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs.length&&d.runs.every(r=>['completed','failed'].includes(r.status))},{timeout:15000}).toBeTruthy()
 expect(d!.runs.map(r=>r.error)).toEqual([undefined]);expect(d!.workItems?.[0].status,JSON.stringify(d!.messages)).toBe('delivered')
 const after=await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot
 expect(after.agents.find(a=>a.name==='新核查员')?.executionBackend).toEqual(f.agent.executionBackend)
 if(mode!=='CREATE')expect(after.conversations.some(c=>c.title==='原生组织群')).toBe(true)
 await f.restart();expect((await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail).runs).toHaveLength(1)
})
it('inherits native execution when the core creates a named team',async()=>{
 const f=await setup(),snapshot=await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot
 const core=snapshot.agents.find(a=>a.id==='bobo')!
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,systemRole,...input}=core
 await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,connectionId:'',modelId:'',executionBackend:f.agent.executionBackend})
 const chat=await f.service.handle('startCoreConversation',{requestId:crypto.randomUUID(),team:{name:'用户团队名',requirements:'NATIVE_NAMED_TEAM'}}) as Conversation
 let d:ConversationDetail|undefined
 await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.runs.length&&d.runs.every(r=>['completed','failed'].includes(r.status))},{timeout:15000}).toBeTruthy()
 expect(d!.runs.map(r=>r.error)).toEqual([undefined]);expect(d!.workItems?.[0].status,JSON.stringify(d!.messages)).toBe('delivered')
 expect((await f.service.handle('snapshot',undefined) as import('../src/shared/domain').Snapshot).conversations.some(c=>c.title==='用户团队名')).toBe(true)
})
it('delegates to a real employee and resumes only the parent on the original work budget',async()=>{
 const f=await setup(),{id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const child=await f.service.handle('saveAgent',{...input,name:'协作同事'}) as DigitalAgent
 const chat=await f.service.handle('createConversation',{kind:'group',title:'原生委派',agentIds:[f.agent.id,child.id]}) as Conversation
 await f.service.handle('sendMessage',{conversationId:chat.id,content:'NATIVE_DELEGATE',mentionIds:[f.agent.id],requestId:crypto.randomUUID()})
 let d:ConversationDetail|undefined
 try { await expect.poll(async()=>{d=await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail;return d.workItems?.filter(w=>w.status==='delivered').length},{timeout:15000}).toBe(2) } catch(error) { throw new Error(JSON.stringify({error:String(error),runs:d?.runs.map(r=>({id:r.id,status:r.status,error:r.error})),messages:d?.messages.map(m=>m.content),works:d?.workItems})) }
 expect(d!.runs.filter(r=>r.status==='failed').map(r=>r.error)).toEqual([]);expect(d!.runs).toHaveLength(3)
 expect(new Set(d!.workItems!.map(w=>w.budgetId)).size).toBe(1);expect(d!.artifacts).toHaveLength(1)
 await f.restart();expect((await f.service.handle('getConversation',{id:chat.id}) as ConversationDetail).runs).toHaveLength(3)
})
it('runs automation with the real native backend and does not replay it after restart',async()=>{
 const f=await setup()
 const plan=await f.service.handle('saveAutomation',{name:'原生自动化',prompt:'NATIVE_PUBLISH',conversationPolicy:'new-conversation',employeeIds:[f.agent.id],frequency:'daily',time:'09:00',weekday:1,timezone:'UTC',enabled:false,notify:false}) as import('../src/shared/domain').AutomationDefinition
 const occurrence=await f.service.handle('runAutomation',{id:plan.id,requestId:crypto.randomUUID()}) as import('../src/shared/domain').AutomationOccurrence
 let result:import('../src/shared/domain').AutomationOccurrence|undefined
 await expect.poll(async()=>{result=await f.service.handle('getAutomationOccurrence',{id:occurrence.id}) as typeof result;return result?.status},{timeout:15000}).toBe('completed')
 const d=await f.service.handle('getConversation',{id:result!.conversationId!}) as ConversationDetail
 expect(d.artifacts,JSON.stringify(d)).toHaveLength(1);expect(d.runs.filter(r=>r.phase==='execution')).toHaveLength(1)
 await f.restart();expect((await f.service.handle('getConversation',{id:result!.conversationId!}) as ConversationDetail).runs).toHaveLength(d.runs.length)
})

it('clears native sessions, execution evidence and pending interaction without replaying history',async()=>{
 const f=await setup(),d=await f.wait(await f.send('普通交流'))
 await f.service.handle('clearConversationHistory',{id:f.chat.id,hide:false})
 const cleared=await f.detail();expect(cleared.messages).toHaveLength(0);expect(cleared.runs).toHaveLength(0)
 expect((await f.service.handle('listExecutionHistory',{conversationId:f.chat.id}) as any).items).toEqual([])
 await f.restart();expect((await f.detail()).runs).toHaveLength(0)
 const next=await f.wait(await f.send('明确新交流'));expect(next.runs[0].backend?.sessionId).not.toBe(d.runs[0].backend?.sessionId)
})
it('rejects changed executables before group admission or any native turn',async()=>{
 const f=await setup();await writeFile(f.executable,'\n// changed program',{flag:'a'})
 await expect(f.service.handle('createConversation',{kind:'group',title:'变更程序',agentIds:[f.agent.id]})).rejects.toThrow('程序已变化')
 const d=await f.wait(await f.send('不应启动'));expect(d.runs[0].status).toBe('failed');expect(d.runs[0].backend?.externalInvocations??0).toBe(0)
})
it('does not replay a pending approval after restart and rejects its stale response',async()=>{
 const f=await setup();await f.send('NATIVE_APPROVAL');let action:NativeAction|undefined,runId=''
 await expect.poll(async()=>{runId=(await f.detail()).runs[0]?.id??'';if(!runId)return;action=(await f.service.handle('listNativeActions',{conversationId:f.chat.id,runId}) as NativeAction[])[0];return action?.status},{timeout:15000}).toBe('pending')
 await f.restart();const d=await f.detail();expect(d.runs).toHaveLength(1);expect(['interrupted','cancelled']).toContain(d.runs[0].status)
 await expect(f.service.handle('respondNativeAction',{conversationId:f.chat.id,runId,actionId:action!.id,response:{option:runtime==='codex'?'accept':'allow'}})).rejects.toThrow()
 await expect(readFile(join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work','permission-marker'))).rejects.toThrow()
})
it('binds native settings until the actual process exits and recreates the session after an idle change',async()=>{
 const f=await setup();const first=await f.wait(await f.send('你好'))
 const {id,configVersion,workspaceRef,memoryNamespace,policyVersion,...input}=f.agent
 const message=await f.send('NATIVE_WAIT');let runId=''
 await expect.poll(async()=>{const r=(await f.detail()).runs.find(r=>r.triggerMessageId===message.id);runId=r?.id??'';return r?.backend?.inputAccepted},{timeout:15000}).toBe(true)
 await expect(f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,nativeOptions:{effort:'high'}})).rejects.toThrow('员工仍在执行')
 await f.service.handle('stopNativeExecution',{conversationId:f.chat.id,runId});await f.wait(message)
 await expect.poll(async()=>{try { await f.service.handle('saveAgent',{...input,id,expectedConfigVersion:configVersion,nativeOptions:{effort:'high'}});return true } catch(error) { if(!String(error).includes('员工仍在执行'))throw error;return false }},{timeout:5000}).toBe(true)
 const next=await f.wait(await f.send('明确新消息'));expect(next.runs.at(-1)?.backend?.sessionId).not.toBe(first.runs[0].backend?.sessionId)
})
it('exports business records while excluding private native files, then restores without replay',async()=>{
 const f=await setup(),before=await f.wait(await f.send('普通交流')),backup=await realpath(await mkdtemp(join(tmpdir(),'boai-native-backup-')))
 disposals.unshift(()=>rm(backup,{recursive:true,force:true}))
 const privateRelative=join('agents',f.agent.id,'workspace','sessions',f.chat.id,runtime==='codex'?'.codex-private':'.claude-private')
 await mkdir(join(f.root,privateRelative),{recursive:true});await writeFile(join(f.root,privateRelative,'private-sentinel'),'private')
 await f.service.backup(backup);await expect(stat(join(backup,privateRelative))).rejects.toThrow()
 await f.restart(backup);expect((await f.detail()).runs).toHaveLength(before.runs.length)
 const after=await f.wait(await f.send('恢复后明确新消息'));expect(after.runs.at(-1)?.backend?.sessionId).not.toBe(before.runs[0].backend?.sessionId)
})
it('passes authorized attachments and revokes old input before reusing native context',async()=>{
 const f=await setup(),path=join(f.root,'source.txt');await writeFile(path,'MATERIAL_ONLY_CANARY')
 const material=await f.service.handle('prepareMaterial',{conversationId:f.chat.id,path,requestId:crypto.randomUUID(),authorizedAgentIds:[f.agent.id]}) as import('../src/shared/domain').ConversationMaterial
 const message=await f.service.handle('sendMessage',{conversationId:f.chat.id,content:'读取附件',mentionIds:[],requestId:crypto.randomUUID(),materialSelections:[{id:material.id,revision:material.revision}]}) as Message
 const first=await f.wait(message),cwd=join(f.root,'agents',f.agent.id,'workspace','sessions',f.chat.id,'work')
 const read=async()=>JSON.parse(JSON.parse((await readFile(join(cwd,'native-turn-requests.jsonl'),'utf8')).trim().split('\n').at(-1)!).input[0].text)
 expect(JSON.stringify(await read())).toContain('MATERIAL_ONLY_CANARY')
 await f.service.handle('setMaterialAuthorization',{id:material.id,expectedRevision:material.revision,authorizedAgentIds:[]})
 const after=await f.wait(await f.send('撤权后新交流'))
 expect(after.runs.at(-1)?.backend?.sessionId).not.toBe(first.runs[0].backend?.sessionId);expect(JSON.stringify(await read())).not.toContain('MATERIAL_ONLY_CANARY')
})

})

it('preserves the actual Claude error result when the same process exits nonzero',async()=>{
 const f=await nativeFixture('claude',disposals)
 const detail=await f.wait(await f.send('NATIVE_NONZERO_RESULT'))
 expect(detail.runs.at(-1)).toMatchObject({status:'failed',error:'400 native tool schema rejected'})
})

/*
 * [INPUT]: Explicit installed-Magpie opt-in, isolated gateway/Chat supplier and production AppService/Mastra.
 * [OUTPUT]: Three API protocols exercise real organization, predecessor-derived group replies and gated child results before delegated automation delivery.
 * [POS]: Gateway business wiring acceptance; synthetic supplier, not natural model quality or desktop/package certification.
 * [PROTOCOL]: Update Header, tests/.folder.md and Magpie ledger; preserve every failed batch and original request identity.
 */
import { workspaceInputFiles } from './support/workspace-inputs'
import { createHash } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { AgentRun, AutomationDefinition, AutomationOccurrence, AutomationsView, Connection, Conversation, ConversationDetail, DigitalAgent, Message, Snapshot, WorkItem } from '../packages/shared/src/domain'
import type { ModelProtocol } from '../packages/shared/src/domain/model-gateway'
import { isolatedMagpie } from './fixtures/magpie-isolated'
import { streamText, streamTool } from './fixtures/gateway-stream'

const enabled = process.env.BOAI_MAGPIE_WORKFLOWS_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const protocols = (process.env.BOAI_MAGPIE_WORKFLOWS_PROTOCOLS ?? 'chat,responses,messages').split(',') as ModelProtocol[]
const evidence = resolve('.local/magpie-20261017', `workflows-${batch}`), sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex')
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
const organizationPrompt = '请复用研究员，新增一位成本采集员，建立独立经营核算群并说明两人的分工。现在只组织，不执行核算。'
const orderedPrompt = '研究员先报一个两位数，成本采集员读取前一条结果加一，bobo再读取前一条结果加一。每人只回复数值，只需顺序聊天，不执行新工作。'
const automationPrompt = '负责人必须委派研究员计算17+23，委派成本采集员计算5+7，等待两人本次真实交付后再计算销售减成本并交付 NET=28。不得自行代替两名员工执行。'
const collections = ['agents','connections','conversations','messages','messageReceipts','runs','turns','workItems','workExecutions','workBudgets','budgetModelCalls','artifacts','boboCollaborations','automations','automationOccurrences','automationDispatches']
type Msg = { role: string; content: unknown; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }
type Body = { model: string; messages: Msg[]; tools?: { function: { name: string } }[] }
type Wire = { protocol: ModelProtocol; phase: string; model: string; stage: string; started: number; ended?: number; closed: boolean; tools: string[]; error?: string; claimedWork?: WorkItem; visibleWorks?: WorkItem[]; predecessor?: { agentId: string; messageId: string; eventId: string; contentHash: string; content: string }; issuedTool?: { name: string; args: object } }
const rows: Wire[] = [], jobs = new Set<Promise<void>>(), errors: string[] = []
let initialized = false, gateway: Awaited<ReturnType<typeof isolatedMagpie>> | undefined, server: ReturnType<typeof createServer> | undefined, sourceBefore: Record<string,string>
let current: ModelProtocol = 'chat', phase = '', editorId = ''
let childGate = Promise.resolve(), releaseChild = () => {}
const strings = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
async function sources() {
  const files = (await workspaceInputFiles()).filter(x => /\.(ts|tsx|json)$/.test(x))
  files.push('package.json','pnpm-lock.yaml','tests/magpie-workflows-live.test.ts','tests/fixtures/magpie-isolated.ts','tests/fixtures/gateway-stream.ts')
  return Object.fromEntries(await Promise.all(files.sort().map(async p => [p,sha(await readFile(p))])))
}
/** Read only JSON actually supplied to the model; no database or fixture state supplies Work IDs. */
function instructionJson<T>(body: Body, marker: string): T | undefined {
  const value = strings(body.messages.filter(message => message.role === 'system')).find(text => text.includes(marker))
  if (!value) return undefined
  const source = value.slice(value.indexOf(marker) + marker.length)
  let depth = 0, quoted = false, escaped = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue }
    if (char === '"') quoted = true
    else if (char === '{' || char === '[') depth++
    else if ((char === '}' || char === ']') && --depth === 0) return JSON.parse(source.slice(0, index + 1)) as T
  }
  throw Error(`Incomplete host JSON after ${marker}`)
}
async function respond(body: Body, response: ServerResponse, row: Wire) {
  const inputText = strings(body.messages).find(x => x.startsWith('{"protocol":"private-'))
  const input = inputText ? JSON.parse(inputText) : undefined, model = body.model, isCore = model.startsWith('core-')
  row.stage = input?.protocol ?? 'execution'
  const text = (value: unknown) => streamText(response, 'chat', typeof value === 'string' ? value : JSON.stringify(value), 'complete', {})
  const called = body.messages.flatMap(x => x.tool_calls ?? []).map(x => x.function.name)
  const results = body.messages.filter(x => x.role === 'tool').flatMap(x => { try { return [JSON.parse(strings(x.content).join(''))] } catch { return [] } })
  const tool = (name: string, args: object) => { expect(row.tools).toContain(name); row.issuedTool = { name, args }; streamTool(response,'chat',name,args,true,{},`workflow-${rows.length}`) }
  if (row.stage === 'private-memory-delta-v1') return text({ candidates: [] })
  if (row.stage === 'private-work-report-v1') return text({ action: 'publish', text: input.data.draft.text, outcome: input.data.draft.outcome })
  if (row.stage === 'private-group-interpretation-v1') return text(phase === 'ordered' ? { mode: 'ordered', instruction: orderedPrompt, agentIds: ['researcher', editorId, 'bobo'] } : { mode: 'independent' })
  if (row.stage === 'private-participation-v2') {
    if (input.data.participation?.hasRespondedInTurn || !isCore && phase !== 'ordered') return text({ action: 'pass' })
    if (phase === 'greeting' || phase === 'ordered') return text({ action: 'reply', responseKind: 'chat' })
    return text({ action: 'reply', responseKind: 'task', work: { key: 'main', scope: phase === 'organization' ? '查找并组织员工' : automationPrompt, deliverable: phase === 'organization' ? '实际员工与独立群回执' : 'NET=28', ...(phase === 'organization' ? { organization: { mode: 'organize_only', goal: organizationPrompt } } : {}) } })
  }
  if (phase === 'greeting') return text('你好，我是 bobo。')
  if (phase === 'organization') {
    if (!called.includes('find_employees')) return tool('find_employees',{search:'研究',limit:20})
    if (!called.includes('organize_collaboration')) {
      const candidate = results.find(x=>Array.isArray(x.employees))?.employees.find((x: {agentId: string})=>x.agentId==='researcher')
      expect(candidate?.configVersion).toBeTypeOf('number')
      return tool('organize_collaboration',{existingMembers:[{agentId:candidate.agentId,configVersion:candidate.configVersion}],newEmployees:[{name:'成本采集员',role:'成本计算',instructions:'只执行当前明确授权的工作，核对5+7并交付结果。'}],groupTitle:'Magpie经营核算群',announcement:'研究员负责销售计算，成本采集员负责成本计算；当前仅组织，不开始执行。'})
    }
    const receipt = results.find(x=>x.status==='committed' && x.groupConversationId)
    expect(receipt?.id).toBeTypeOf('string')
    if (!called.includes('report_work')) return tool('report_work',{disposition:'delivered',summary:'独立群已组织',evidence:[{kind:'collaboration',reference:receipt.id}]})
    return text('独立经营核算群已建立，两名员工已加入，尚未执行核算。')
  }
  if (phase === 'ordered') {
    const progress = instructionJson<{ order: string[]; completed: { agentId: string; messageId: string; eventId: string; contentHash: string }[] }>(body, 'Host progress (identities only, not answers): ')
    expect(progress?.order).toEqual(['researcher', editorId, 'bobo'])
    if (model.startsWith('research-')) { expect(progress!.completed).toHaveLength(0); return text('37') }
    const predecessor = progress!.completed.at(-1)!
    expect(predecessor.agentId).toBe(model.startsWith('editor-') ? 'researcher' : editorId)
    // Gateway conversion may coalesce adjacent user messages; the host attribution and bytes remain authoritative.
    const marker = '[Conversation background — teammate: '
    const actual = strings(body.messages.filter(message => message.role === 'user')).filter(value => value.includes(marker)).at(-1)
    expect(actual).toBeTypeOf('string')
    const attributed = actual!.slice(actual!.lastIndexOf(marker))
    const content = attributed.slice(attributed.indexOf('\n') + 1)
    expect(sha(content)).toBe(predecessor.contentHash)
    expect(content).toMatch(/^\d{2}$/)
    row.predecessor = { ...predecessor, content }
    return text(String(Number(content) + 1))
  }
  if (phase !== 'automation') throw Error(`Unexpected execution phase ${phase}`)
  const work = instructionJson<WorkItem>(body, 'Your host-claimed work: ')
  expect(work?.id).toBeTypeOf('string'); row.claimedWork = work
  if (!isCore) {
    if (model.startsWith('editor-')) await childGate
    const answer = model.startsWith('research-') ? 'SALES=40' : 'COST=12'
    if (!called.includes('report_work')) return tool('report_work',{disposition:'delivered',summary:answer,evidence:[{kind:'answer',reference:answer}]})
    return text(answer)
  }
  const available = instructionJson<WorkItem[]>(body, 'Available authorized work records: ') ?? []
  row.visibleWorks = available
  const hasResults = work!.requiredResults.length === 2 && work!.requiredResults.every(dependency => available.some(item => item.id === dependency.workId && item.parentWorkId === work!.id && item.status === 'delivered' && item.resultVersion >= dependency.resultVersion && item.resultMessageIds.length > 0))
  const delegated = results.filter((item: WorkItem) => item.id && item.parentWorkId === work!.id) as WorkItem[]
  if (!hasResults) {
    if (!delegated.some(x=>x.ownerAgentId==='researcher')) return tool('delegate_work',{key:'sales',ownerAgentId:'researcher',scope:'计算17+23并交付SALES=40',deliverable:'SALES=40'})
    if (!delegated.some(x=>x.ownerAgentId===editorId)) return tool('delegate_work',{key:'cost',ownerAgentId:editorId,scope:'计算5+7并交付COST=12',deliverable:'COST=12'})
    if (!called.includes('wait_for_work')) return tool('wait_for_work',{dependencies:delegated.map(x=>({workId:x.id,resultVersion:1})),nextStep:'取得两名员工实际结果后计算销售减成本，交付NET=28'})
    return text('等待两名员工的实际核算结果。')
  }
  const childAnswers = work!.requiredResults.map(dependency => available.find(item => item.id === dependency.workId)!)
  const sales = childAnswers.find(item => item.ownerAgentId === 'researcher')!.outcome!.summary.match(/^SALES=(\d+)$/)
  const cost = childAnswers.find(item => item.ownerAgentId === editorId)!.outcome!.summary.match(/^COST=(\d+)$/)
  expect(sales).not.toBeNull(); expect(cost).not.toBeNull()
  const answer = `NET=${Number(sales![1]) - Number(cost![1])}`
  if (!called.includes('report_work')) return tool('report_work',{disposition:'delivered',summary:answer,evidence:[{kind:'answer',reference:answer}]})
  return text(answer)
}
beforeAll(async()=>{
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch) || protocols.some(p=>!['chat','responses','messages'].includes(p))) throw Error('Fresh batch and supported protocols required')
  await mkdir(evidence); initialized=true; sourceBefore=await sources()
  await writeFile(join(evidence,'plan.json'),JSON.stringify({batch,protocols,sourceBefore,maxGatewayRequestsPerProtocol:45,maxUpstreamRequests:protocols.length*45,phases:['greeting','organization','ordered','automation'],tasks:[organizationPrompt,orderedPrompt,automationPrompt],scope:'Installed Magpie with controlled supplier; real product tools/Work/occurrence, no personal configuration or supplier inference'},null,2))
  server=createServer((request,response)=>{
    const job=(async()=>{
      if(request.method==='GET'){response.setHeader('content-type','application/json');response.end(JSON.stringify({object:'list',data:protocols.flatMap(p=>['core','research','editor'].map(role=>({id:`${role}-${p}`,object:'model',owned_by:'workflow'})))}));return}
      let raw='';for await(const chunk of request){raw+=chunk;if(raw.length>4_000_000)throw Error('Controlled input too large')}
      const body=JSON.parse(raw) as Body,row: Wire={protocol:current,phase,model:body.model,stage:'unknown',started:Date.now(),closed:false,tools:(body.tools??[]).map(x=>x.function.name)};rows.push(row)
      response.once('close',()=>{row.closed=true;row.ended=Date.now()})
      if(rows.filter(x=>x.protocol===current).length>45)throw Error('Frozen request cap exceeded')
      try{await respond(body,response,row)}catch(e){row.error=String(e);await writeFile(join(evidence,`failure-${rows.length}.json`),JSON.stringify({body,row},null,2));throw e}
    })().catch(error=>{errors.push(String(error));response.destroy(error)})
    jobs.add(job);void job.finally(()=>jobs.delete(job))
  })
  await new Promise<void>(done=>server!.listen(0,'127.0.0.1',done));const port=(server.address() as {port:number}).port
  gateway=await isolatedMagpie(evidence,port)
  await gateway.command(['provider','add','workflow','id=workflow',`url=http://127.0.0.1:${port}/v1`,'key=SYNTHETIC_WORKFLOW_NOT_A_SECRET',`models=${protocols.flatMap(p=>['core','research','editor'].map(role=>`${role}-${p}`)).join(',')}`]);await gateway.start()
},90000)
afterAll(async()=>{
  if(!initialized)return
  await gateway?.close();server?.closeAllConnections();if(server)await new Promise<void>(done=>server!.close(()=>done()));await Promise.all(jobs)
  const sourceAfter=await sources();await writeFile(join(evidence,'closed.json'),JSON.stringify({rows,errors,activeJobs:jobs.size,sourceBefore,sourceAfter},null,2))
  expect(sourceAfter).toEqual(sourceBefore);expect(jobs.size).toBe(0);expect(rows.every(x=>x.closed)).toBe(true)
})
test.skipIf(!enabled).each(protocols)('%s bobo organization, ordered group and delegated automation retain real identities and budget',async protocol=>{
  current=protocol;phase='setup';editorId='';childGate=new Promise<void>(resolve=>{releaseChild=resolve})
  const dir=join(evidence,protocol),dataPath=join(dir,'data');await mkdir(dir)
  const create=()=>new AppService({dataPath,engine:new MastraEngine(),secrets:{get:async()=>undefined,set:async()=>{throw Error('No secret expected')},delete:async()=>{}},emit:()=>{}})
  let service=create(),status='running',failure: string|undefined
  const snapshots: unknown[]=[]
  const records=async()=>{const store=await ProductStore.openReadOnly(join(dataPath,'boai.sqlite'));try{return Object.fromEntries(await Promise.all(collections.map(async name=>[name,await store.load<any>(name)])))}finally{await store.close()}}
  const detail=async(id:string)=>await service.handle('getConversation',{id}) as ConversationDetail
  async function settle(id:string,messageId:string){let d:ConversationDetail;await expect.poll(async()=>{d=await detail(id);return d.turns?.some(turn=>turn.triggerMessageId===messageId)&&d.runs.some(run=>run.triggerMessageId===messageId)&&d.turns.every(turn=>terminal.has(turn.status))&&d.runs.every(run=>terminal.has(run.status))},{timeout:20000,interval:25}).toBe(true);return d!}
  const save=async(agent:DigitalAgent,modelId:string)=>{const {configVersion,workspaceRef:_w,memoryNamespace:_m,policyVersion:_p,creationSource:_created,...input}=agent;return await service.handle('saveAgent',{...input,modelId,connectionId:connection.id,thinkingLevel:'auto',expectedConfigVersion:configVersion}) as DigitalAgent}
  let connection:Connection
  try{
    await service.init();connection=await service.handle('saveConnection',{name:`Workflow ${protocol}`,provider:protocol==='messages'?'anthropic':'openai-compatible',baseUrl:gateway!.origin,defaultModel:`workflow/core-${protocol}`,gateway:{kind:'magpie',auth:'local',protocol}}) as Connection
    const initial=await service.handle('snapshot',undefined) as Snapshot
    await save(initial.agents.find(a=>a.id==='bobo')!,`workflow/core-${protocol}`);await save(initial.agents.find(a=>a.id==='researcher')!,`workflow/research-${protocol}`)
    phase='greeting';const core=await service.handle('startCoreConversation',{requestId:`${batch}-${protocol}-hello`,content:'你好，只聊一句，不创建工作。'}) as Conversation
    const firstMessage=(await detail(core.id)).messages.find(message=>message.senderType==='user')!
    let d=await settle(core.id,firstMessage.id);expect(d.workItems).toEqual([]);expect(d.messages.some(m=>m.senderId==='bobo'&&m.content==='你好，我是 bobo。')).toBe(true);snapshots.push({phase,detail:d})
    phase='organization';const organized=await service.handle('sendMessage',{conversationId:core.id,requestId:`${batch}-${protocol}-organize`,content:organizationPrompt,mentionIds:[]}) as Message;d=await settle(core.id,organized.id)
    let r=await records();expect(r.boboCollaborations).toHaveLength(1);const operation=r.boboCollaborations[0];expect(operation.status).toBe('committed');expect(d.workItems).toHaveLength(1);expect(d.workItems![0].status).toBe('delivered')
    const group=r.conversations.find((c:Conversation)=>c.kind==='group') as Conversation;expect(group.agentIds).toContain('bobo');expect(group.agentIds).toContain('researcher');expect(group.agentIds).toHaveLength(3);editorId=group.agentIds.find(id=>!['bobo','researcher'].includes(id))!
    expect(r.agents).toHaveLength(initial.agents.length+1);await save(r.agents.find((a:DigitalAgent)=>a.id===editorId),`workflow/editor-${protocol}`)
    expect((await detail(group.id)).workItems).toEqual([]);expect((await detail(core.id)).conversation.id).toBe(core.id);snapshots.push({phase,detail:d,operation,group})
    phase='ordered';const sent=await service.handle('sendMessage',{conversationId:group.id,requestId:`${batch}-${protocol}-ordered`,content:orderedPrompt,mentionIds:[]}) as Message
    d=await settle(group.id,sent.id);const replies=d.messages.filter(m=>m.senderType==='agent'&&m.sequence>sent.sequence)
    expect(replies.map(m=>[m.senderId,m.content])).toEqual([['researcher','37'],[editorId,'38'],['bobo','39']]);expect(d.workItems).toEqual([]);expect(d.turns?.at(-1)?.coordination?.completed).toHaveLength(3);snapshots.push({phase,detail:d})
    phase='automation';const plan=await service.handle('saveAutomation',{name:'Magpie经营核算',prompt:automationPrompt,owner:{kind:'group',conversationId:group.id},conversationPolicy:'new-conversation',employeeIds:group.agentIds,collaboration:{coordinatorId:'bobo',assignments:[{employeeId:'researcher',instruction:'计算17+23',deliverable:'SALES=40',dependsOn:[]},{employeeId:editorId,instruction:'计算5+7',deliverable:'COST=12',dependsOn:[]},{employeeId:'bobo',instruction:'等待两名员工本次结果后计算销售减成本',deliverable:'NET=28',dependsOn:['researcher',editorId]}]},frequency:'manual',time:'09:00',weekday:1,timezone:'Asia/Singapore',enabled:false,notify:false}) as AutomationDefinition
    expect((await service.handle('listAutomations',undefined) as AutomationsView).occurrences).toEqual([])
    let occurrence=await service.handle('runAutomation',{id:plan.id,requestId:`${batch}-${protocol}-run`}) as AutomationOccurrence
    // Hold one real child response: the parent must remain waiting despite expected values in the plan.
    await expect.poll(async()=>{d=await detail(occurrence.conversationId);return d.workItems?.some(work=>work.ownerAgentId==='bobo'&&work.status==='waiting'&&work.requiredResults.length===2)&&d.workItems.some(work=>work.ownerAgentId==='researcher'&&work.status==='delivered')},{timeout:20000,interval:25}).toBe(true)
    occurrence=(await service.handle('listAutomations',undefined) as AutomationsView).occurrences.find(item=>item.id===occurrence.id)!
    expect(occurrence.finishedAt).toBeUndefined();expect(occurrence.deliveryStatus).not.toBe('delivered')
    expect(d!.workItems!.find(work=>work.ownerAgentId===editorId)!.status).not.toBe('delivered')
    expect(rows.filter(row=>row.protocol===protocol&&row.phase==='automation'&&row.model.startsWith('core-')&&row.issuedTool?.name==='report_work')).toHaveLength(0)
    snapshots.push({phase:'pending-child',detail:d!,occurrence});releaseChild()
    await expect.poll(async()=>{occurrence=(await service.handle('listAutomations',undefined) as AutomationsView).occurrences.find(item=>item.id===occurrence.id)!;return !!occurrence.finishedAt},{timeout:30000,interval:25}).toBe(true)
    d=await detail(occurrence.conversationId);expect(occurrence).toMatchObject({status:'completed',deliveryStatus:'delivered'});expect(d.workItems).toHaveLength(3);expect(d.workItems!.every(w=>w.status==='delivered')).toBe(true)
    const parent=d.workItems!.find(w=>w.ownerAgentId==='bobo')!;expect(parent.requiredResults).toHaveLength(2);expect(d.workItems!.filter(w=>w.parentWorkId===parent.id)).toHaveLength(2);expect(d.messages.filter(m=>parent.resultMessageIds.includes(m.id)).map(m=>m.content)).toContain('NET=28');expect(new Set(d.workItems!.map(w=>w.budgetId)).size).toBe(1)
    const calls=d.runs.flatMap(run=>run.modelCalls??[]);expect(calls.every(call=>call.protocol===protocol&&call.route?.routeSource==='response-headers')).toBe(true);snapshots.push({phase,detail:d,occurrence})
    expect((await service.handle('runAutomation',{id:plan.id,requestId:`${batch}-${protocol}-run`}) as AutomationOccurrence).id).toBe(occurrence.id)
    await service.close();const before=await records(),count=rows.length
    const allCalls=(before.runs as AgentRun[]).flatMap(run=>run.modelCalls??[]),protocolRows=rows.filter(row=>row.protocol===protocol)
    expect(allCalls.length).toBe(protocolRows.length);expect(allCalls.length).toBeGreaterThan(0)
    expect(new Set(allCalls.map(call=>call.callId)).size).toBe(allCalls.length)
    expect(allCalls.every(call=>call.protocol===protocol&&call.route?.actualModelId===call.selectedModelId&&call.route.actualProvider==='workflow')).toBe(true)
    const businessRecords=(value:typeof before)=>({...value,automations:value.automations.map((definition:AutomationDefinition)=>{const {syncedAt:_sync,...business}=definition;return business})})
    for(let n=0;n<2;n++){
      service=create();await service.init();const after=await records()
      // Native schedule synchronization refreshes syncedAt on service initialization, not business execution.
      expect(businessRecords(after)).toEqual(businessRecords(before));expect(rows).toHaveLength(count)
      snapshots.push({phase:`restart-${n+1}`,before,after,requestCount:count});await service.close()
    }
    expect(errors).toEqual([]);status='passed'
  }catch(error){status='failed';failure=String(error);throw error}finally{releaseChild();await service.close();await writeFile(join(dir,'result.json'),JSON.stringify({protocol,status,failure,snapshots,records:await records(),requests:rows.filter(x=>x.protocol===protocol)},null,2))}
},60000)

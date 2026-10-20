/*
 * [INPUT]: Mastra 原生日程、触发存储与产品受理回调。
 * [OUTPUT]: 员工行为与用户计划复用同一Mastra调度实例，独立workflow与真实触发身份。
 * [OUTPUT]: 唯一周期时钟、独立执行/日程版本和完整历史分页对账。
 * [POS]: 自动化的原生适配边界；不运行员工工具、不重试业务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Mastra } from '@mastra/core'
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { LibSQLStore } from '@mastra/libsql'
import { createClient } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
export interface NativeAutomationVersion { executionRevision: number; scheduleGeneration: number }
export const BEHAVIOR_WORKFLOW = 'boai-agent-behavior-dispatch-v1'
export interface NativeBehaviorInput { agentId: string; behaviorId: string; profileRevision: number; scheduleId: string }
export const AUTOMATION_WORKFLOW='boai-automation-dispatch-v1'
/** The only recurring clock is Mastra's native scheduler, pinned to core 1.71.0. */
export class NativeSchedules {
 readonly storage:LibSQLStore
 readonly mastra:Mastra
 constructor(readonly filename:string,admit:(automationId:string,revision:number,runId:string,scheduledAt:number,version?:NativeAutomationVersion)=>Promise<void>, admitBehavior?: (input: NativeBehaviorInput, runId: string, scheduledAt: number) => Promise<unknown>){
  this.storage=new LibSQLStore({id:'boai-automation-storage',url:pathToFileURL(filename).href})
  const inputSchema=z.object({automationId:z.string(),revision:z.number().int(),executionRevision:z.number().int().positive().optional(),scheduleGeneration:z.number().int().positive().optional()}),outputSchema=z.object({dispatched:z.boolean()})
  const step=createStep({id:'admit-product-occurrence',inputSchema,outputSchema,execute:async({inputData,runId})=>{const scheduleId=`schedule_boai-${inputData.automationId}`;const triggers=await(await this.storage.getStore('schedules'))!.listTriggers(scheduleId,{limit:100});const trigger=triggers.find(t=>t.runId===runId);const prefix=`sched_${scheduleId}_`,suffix=runId.startsWith(prefix)?runId.slice(prefix.length):'';const scheduledAt=trigger?.scheduledFireAt??(/^\d{13}$/.test(suffix)?Number(suffix):NaN);if(!Number.isSafeInteger(scheduledAt))throw new Error('无法验证原生调度触发时间');if(inputData.executionRevision!==undefined&&inputData.scheduleGeneration!==undefined)await admit(inputData.automationId,inputData.revision,runId,scheduledAt,{executionRevision:inputData.executionRevision,scheduleGeneration:inputData.scheduleGeneration});else await admit(inputData.automationId,inputData.revision,runId,scheduledAt);return {dispatched:true}}})
  // An empty declarative schedule list selects the supported evented engine; all actual schedules are product definitions managed via schedules CRUD.
  const workflow=createWorkflow({id:AUTOMATION_WORKFLOW,inputSchema,outputSchema,schedule:[],retryConfig:{attempts:0}}).then(step).commit()
  const behaviorSchema = z.object({ agentId: z.string(), behaviorId: z.string(), profileRevision: z.number().int().nonnegative(), scheduleId: z.string() }).strict()
  const behaviorStep = createStep({ id: 'admit-agent-behavior', inputSchema: behaviorSchema, outputSchema, execute: async ({ inputData, runId }) => {
    if (!admitBehavior) throw new Error('员工行为服务不可用')
    const triggers = await (await this.storage.getStore('schedules'))!.listTriggers(inputData.scheduleId, { limit: 100 })
    const prefix = `sched_${inputData.scheduleId}_`, suffix = runId.startsWith(prefix) ? runId.slice(prefix.length) : ''
    const at = triggers.find(trigger => trigger.runId === runId)?.scheduledFireAt ?? (/^\d{13}$/.test(suffix) ? Number(suffix) : NaN)
    if (!Number.isSafeInteger(at)) throw new Error('无法核对行为原生触发时间')
    await admitBehavior(inputData, runId, at)
    return { dispatched: true }
  } })
  const behaviorWorkflow = createWorkflow({ id: BEHAVIOR_WORKFLOW, inputSchema: behaviorSchema, outputSchema, schedule: [], retryConfig: { attempts: 0 } }).then(behaviorStep).commit()
  this.mastra=new Mastra({storage:this.storage,workflows:{[AUTOMATION_WORKFLOW]:workflow, [BEHAVIOR_WORKFLOW]:behaviorWorkflow},scheduler:{enabled:true},logger:false})
 }
 /** Workers are stopped during reconciliation. Timestamp buckets are exhausted before advancing. */
 async *history(scheduleId:string){
  const store=(await this.storage.getStore('schedules'))!,pageSize=200,maxBucket=25600
  let before:number|undefined
  for(;;){
   const page=await store.listTriggers(scheduleId,{limit:pageSize,...(before===undefined?{}:{toActualFireAt:before})})
   if(!page.length)return
   for(const trigger of page)yield trigger
   if(page.length<pageSize)return
   const boundary=Math.min(...page.map(trigger=>trigger.actualFireAt))
   if(!Number.isSafeInteger(boundary)||(before!==undefined&&boundary>=before))throw new Error('原生调度历史分页未推进，需要核对')
   // A page can split many triggers with the same millisecond. Fetch that entire bucket or fail visibly.
   for(let limit=pageSize*2;;limit*=2){
    const bucket=await store.listTriggers(scheduleId,{limit,fromActualFireAt:boundary,toActualFireAt:boundary+1})
    if(bucket.length<limit){for(const trigger of bucket)yield trigger;break}
    if(limit>=maxBucket)throw new Error('原生历史同刻条目过多，对账尚未完成；调度未启动')
   }
   before=boundary
  }
 }
 async init(){await this.storage.init()}
 async start(){await this.mastra.startWorkers()}
 async stop(){await this.mastra.stopWorkers()}
 async close(){await this.mastra.shutdown();await this.storage.close()}
 async backup(destination:string){const client=createClient({url:pathToFileURL(this.filename).href});try{await client.execute({sql:'VACUUM INTO ?',args:[destination]})}finally{client.close()}}
}

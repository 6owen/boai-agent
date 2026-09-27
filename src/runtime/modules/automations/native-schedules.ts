import { Mastra } from '@mastra/core'
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { LibSQLStore } from '@mastra/libsql'
import { createClient } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
export const AUTOMATION_WORKFLOW='boai-automation-dispatch-v1'
/** The only recurring clock is Mastra's native scheduler, pinned to core 1.71.0. */
export class NativeSchedules {
 readonly storage:LibSQLStore
 readonly mastra:Mastra
 constructor(readonly filename:string,admit:(automationId:string,revision:number,runId:string,scheduledAt:number)=>Promise<void>){
  this.storage=new LibSQLStore({id:'boai-automation-storage',url:pathToFileURL(filename).href})
  const inputSchema=z.object({automationId:z.string(),revision:z.number().int()}),outputSchema=z.object({dispatched:z.boolean()})
  const step=createStep({id:'admit-product-occurrence',inputSchema,outputSchema,execute:async({inputData,runId})=>{const scheduleId=`schedule_boai-${inputData.automationId}`;const triggers=await(await this.storage.getStore('schedules'))!.listTriggers(scheduleId,{limit:100});const trigger=triggers.find(t=>t.runId===runId);const prefix=`sched_${scheduleId}_`,suffix=runId.startsWith(prefix)?runId.slice(prefix.length):'';const scheduledAt=trigger?.scheduledFireAt??(/^\d{13}$/.test(suffix)?Number(suffix):NaN);if(!Number.isSafeInteger(scheduledAt))throw new Error('无法验证原生调度触发时间');await admit(inputData.automationId,inputData.revision,runId,scheduledAt);return {dispatched:true}}})
  // An empty declarative schedule list selects the supported evented engine; all actual schedules are product definitions managed via schedules CRUD.
  const workflow=createWorkflow({id:AUTOMATION_WORKFLOW,inputSchema,outputSchema,schedule:[],retryConfig:{attempts:0}}).then(step).commit()
  this.mastra=new Mastra({storage:this.storage,workflows:{[AUTOMATION_WORKFLOW]:workflow},scheduler:{enabled:true},logger:false})
 }
 async init(){await this.storage.init()}
 async start(){await this.mastra.startWorkers()}
 async stop(){await this.mastra.stopWorkers()}
 async close(){await this.mastra.shutdown();await this.storage.close()}
 async backup(destination:string){const client=createClient({url:pathToFileURL(this.filename).href});try{await client.execute({sql:'VACUUM INTO ?',args:[destination]})}finally{client.close()}}
}

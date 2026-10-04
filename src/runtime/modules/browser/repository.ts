/*
 * [INPUT]: 真实 SDK 工具调用、当前 Work 持有者与 Main 实际动作回执。
 * [OUTPUT]: 当前有效内置模型员工默认具备工具调用资格，不读旧 allowBrowser；ACP/停用、原成员/配置/清理代际与事务身份严格核对。
 * [OUTPUT]: 内置浏览器使用固定应用身份，人工开窗不写业务记录；run调用来源/权限登记独立于浏览器窗口和登录资料；prepared→started→terminal/unknown 的稳定持久回执；同 ID 不同参数拒绝，未知写入冻结原工作，重启不重放。
 * [POS]: 浏览器业务事实，不保存 Cookie/截图正文；所有状态和 effect 变化沿 WorkRepository 原 SQLite 事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { DigitalAgent,Conversation } from '../../../shared/domain'
import { isBrowserCapableAgent } from '../../../shared/domain'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import { APPLICATION_BROWSER_SCOPE } from '../../../shared/ipc/browser'
import type { BrowserActionEnvelope, BrowserActionReply, BrowserLease, BrowserTaskAuthorization } from '../../../shared/ipc/browser'
import { ProductStore } from '../../adapters/storage/product-store'
import { WorkRepository } from '../collaboration/work-repository'
import { summarizeMedia } from './media'
export interface BrowserActionRecord extends BrowserActionEnvelope { id: string; status: 'prepared'|'started'|'completed'|'failed'|'cancelled_before_start'|'unknown'; mutating: boolean; startedAt?:string; createdAt: string; reply?: BrowserActionReply }
export const browserCommandHash = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
export class BrowserRepository {
  constructor(private store: ProductStore,private works: WorkRepository) {}
  async recover() {
    await this.store.transaction(async tx => {
      for (const action of await tx.list<BrowserActionRecord>('browserActions')) {
        if (action.status !== 'prepared' && action.status !== 'started') continue
        action.status = action.status === 'started' ? 'unknown' : 'cancelled_before_start'
        action.reply = { actionId:action.id,generation:action.lease.generation,status:action.status,error:'应用重启，仅保留原动作核对事实，不自动重放' }
        await tx.put({ collection:'browserActions',id:action.id,value:action })
      }
    })
  }
  private async identity(tx:RecordTransaction,lease:BrowserLease) {
    const agent=await tx.get<DigitalAgent>('agents',lease.agentId),conversation=await tx.get<Conversation>('conversations',lease.conversationId)
    const clock=await tx.get<{epoch:number}>('conversationCompletionClocks',lease.conversationId)
    if (!agent || !isBrowserCapableAgent(agent) || agent.configVersion!==lease.configVersion || !conversation?.agentIds.includes(agent.id) || (clock?.epoch ?? 1)!==lease.scopeEpoch || APPLICATION_BROWSER_SCOPE!==lease.scopeKey || await tx.get('conversationCleanup',conversation.id) || await tx.get('browserCleanups',lease.runId)) throw new Error('浏览器工具调用的员工、会话或清理代际授权已变化')
  }
  registerTask(lease:BrowserLease) {
    return this.works.browserTransaction(lease.runId,'prepare',async (tx,{work,execution}) => {
      await this.identity(tx,lease)
      if (work.id!==lease.workId || work.origin || execution.agentId!==lease.agentId || work.conversationId!==lease.conversationId) throw new Error('浏览器工具调用缺少原手动工作授权')
      await tx.put({collection:'browserScopes',id:lease.runId,value:{id:lease.runId,...lease}})
      return {value:undefined}
    })
  }
  authorizeResume(lease:BrowserLease) {
    return this.works.browserTransaction(lease.runId,'prepare',async(tx,{work,execution})=>{
      await this.identity(tx,lease)
      if(work.origin || work.id!==lease.workId || execution.pendingEffects || (await tx.list<BrowserActionRecord>('browserActions')).some(action=>action.lease?.workId===work.id && action.mutating && ['started','unknown'].includes(action.status))) throw new Error('原浏览器工作仍有待核对操作，不能交还或重放')
      return {value:undefined}
    })
  }
  get(actionId:string) { return this.store.transaction(tx=>tx.get<BrowserActionRecord>('browserActions',actionId)) }
  async prepare(envelope: BrowserActionEnvelope,mutating: boolean) {
    return this.works.browserTransaction(envelope.lease.runId,'prepare',async (tx,{work,execution}) => {
      if (work.id !== envelope.lease.workId || work.origin || execution.agentId !== envelope.lease.agentId || work.conversationId !== envelope.lease.conversationId) throw new Error('浏览器工具调用缺少当前手动工作授权')
      await this.identity(tx,envelope.lease)
      const previous = await tx.get<BrowserActionRecord>('browserActions',envelope.actionId)
      if (previous) {
        if (previous.argumentHash !== envelope.argumentHash || !previous.lease || previous.lease.workId !== work.id) throw new Error('原浏览器调用已用于不同参数或已清理')
        return { value:{ action:previous,fresh:false } }
      }
      if ((await tx.list<BrowserActionRecord>('browserActions')).some(action => action.lease?.workId === work.id && action.mutating && ['prepared','started','unknown'].includes(action.status))) throw new Error('原工作仍有未核对的浏览器动作，不能用新调用重放')
      const action: BrowserActionRecord = { ...envelope,id:envelope.actionId,status:'prepared',mutating,createdAt:new Date().toISOString() }
      await tx.put({collection:'browserActions',id:action.id,value:action})
      await tx.put({collection:'browserScopes',id:envelope.lease.runId,value:{id:envelope.lease.runId,...envelope.lease}})
      return { value:{action,fresh:true} }
    })
  }
  start(input: { actionId:string; generation:string; runId:string; workId:string }) {
    return this.works.browserTransaction(input.runId,'start',async (tx,{work}) => {
      const action = await tx.get<BrowserActionRecord>('browserActions',input.actionId)
      if (!action || action.status !== 'prepared' || action.lease.generation !== input.generation || action.lease.runId !== input.runId || work.id !== input.workId) throw new Error('浏览器动作已停止、开始或不属于当前原工作')
      await this.identity(tx,action.lease)
      action.status='started'; action.startedAt=new Date().toISOString(); await tx.put({collection:'browserActions',id:action.id,value:action})
      return {value:{started:true as const},...(action.mutating ? {effect:'start' as const}: {})}
    })
  }
  finish(lease:BrowserLease,reply:BrowserActionReply) {
    return this.works.browserTransaction(lease.runId,'finish',async (tx,{work,execution}) => {
      const action = await tx.get<BrowserActionRecord>('browserActions',reply.actionId)
      if (!action || action.lease.generation !== reply.generation || action.lease.runId !== execution.id || action.lease.workId !== work.id) throw new Error('浏览器结果不属于原动作')
      if (!['prepared','started','unknown'].includes(action.status)) return {value:action.reply!}
      const started = !!action.startedAt
      if (!started && reply.status !== 'cancelled_before_start' && reply.status !== 'unknown') throw new Error('浏览器尚未通过实际开始门禁')
      action.status=reply.status; action.reply=summarizeMedia(reply) as BrowserActionReply
      await tx.put({collection:'browserActions',id:action.id,value:action})
      if (reply.source) await tx.put({collection:'browserEvidence',id:action.id,value:{id:action.id,conversationId:lease.conversationId,agentId:lease.agentId,runId:lease.runId,...reply.source}})
      return {value:action.reply,...(started && action.mutating && ['completed','failed','cancelled_before_start'].includes(reply.status) ? {effect:'confirm' as const}: {})}
    })
  }
  sourcesForRun(runId:string) { return this.store.browserSourcesForRun(runId) }
  taskAuthorizations() { return this.store.load<BrowserTaskAuthorization & Partial<BrowserLease> & {id:string}>('browserScopes') }
}

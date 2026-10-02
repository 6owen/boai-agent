/*
 * [INPUT]: 手动 Work 的宿主租约、原用户 URL、当前来源门禁与 Main 窗口桥。
 * [OUTPUT]: 严格单命令/冻结审批/真实开始握手和稳定回执；普通浏览器回执不触发隐形接管暂停，显式交接仅兼容；截图只保留内存媒体，取消与 disposal 等待整动作实际退出。
 * [POS]: 每次任务独占的浏览器客户端；员工/会话/代际身份均来自宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { BrowserActionEnvelope,BrowserActionReply,BrowserHostBridge,BrowserLease } from '../../../shared/ipc/browser'
import { parseBrowserSingleCommand } from '../../adapters/mastra/browser-tool-runtime'
import { browserCommandHash,BrowserRepository } from './repository'
export function browserRequestOrigins(content:string) {
  const origins = new Set<string>()
  for (const match of content.matchAll(/https?:\/\/[^\s<>"'`，。；）\])]+/g)) { try { const url = new URL(match[0]); if (!url.username && !url.password) origins.add(url.origin) } catch { /* Incomplete URLs grant nothing. */ } }
  return [...origins]
}
export class BrowserSession {
  private acquired=false
  private acquiring?:Promise<void>
  private disposed=false
  private inFlight = new Set<Promise<unknown>>()
  private stop?:Promise<void>
  private paused?:{promise:Promise<void>;resolve:()=>void;reject:(error:Error)=>void}
  private pauseExit?:Promise<void>
  private resumedSnapshot?:{source:import('../../../shared/ipc/browser').BrowserPageEvidence;output:string}
  constructor(readonly lease:BrowserLease,private host:BrowserHostBridge,private repository:BrowserRepository,private options:{ signal:AbortSignal; originalRequest:string; validate():Promise<void>; approve(command:string):Promise<boolean> }) {
    options.signal.addEventListener('abort',() => { void this.drain().catch(() => {}) },{once:true})
  }
  private async ensure() {
    await this.waitActive()
    this.options.signal.throwIfAborted(); if (this.disposed) throw new Error('浏览器租约已结束')
    await this.options.validate()
    if (!this.acquired) {
      this.acquiring ??= this.repository.registerScope(this.lease).then(()=>this.host.request('acquire',this.lease)).then(()=>{this.acquired=true})
      await this.acquiring
    }
    this.options.signal.throwIfAborted()
  }
  execute(command:string,toolCallId:string):Promise<BrowserActionReply> {
    const task=this.perform(command,toolCallId).then(async reply=>{
      await this.waitActive()
      const snapshot=this.resumedSnapshot;this.resumedSnapshot=undefined
      return snapshot ? {...reply,result:{...reply.result,appendReleaseHint:reply.result?.appendReleaseHint ?? false,output:`${(reply.result?.output ?? '').slice(0,30_000)}\n[用户交还浏览器后的新页面快照；原动作事实保持原来源]\n${snapshot.output.slice(0,16_000)}\nCurrent source: ${JSON.stringify(snapshot.source)}`}}:reply
    },async error=>{await this.waitActive();throw error})
    this.inFlight.add(task)
    void task.finally(() => this.inFlight.delete(task)).catch(() => {})
    return task
  }
  private async perform(command:string,toolCallId:string) {
    const parsed=parseBrowserSingleCommand(command)
    if (!toolCallId || toolCallId.length > 300) throw new Error('浏览器缺少真实模型工具调用身份')
    await this.ensure()
    const lease=structuredClone(this.lease)
    const hash=browserCommandHash(parsed.parts)
    const actionId=`browser-${createHash('sha256').update(JSON.stringify([lease.workId,toolCallId])).digest('hex')}`
    const old=await this.repository.get(actionId)
    if (old) {
      if (old.argumentHash!==hash || !old.lease || old.lease.workId!==lease.workId) throw new Error('原浏览器调用参数不一致或已清理')
      const known=await this.host.request('lookup',{lease:lease,actionId})
      if (known && known.status!=='unknown') { await this.repository.finish(lease,known); return this.completed(known) }
      if (old.reply && old.status!=='unknown') return this.completed(old.reply)
      throw new Error('原浏览器动作结果待核对，未重新执行')
    }
    const source=await this.host.request('inspect',lease)
    const approvedOrigins=browserRequestOrigins(this.options.originalRequest)
    let approval:BrowserActionEnvelope['approval']
    const origin=parsed.targetUrl ? new URL(parsed.targetUrl).origin : source?.url && /^https?:/.test(source.url) ? new URL(source.url).origin : undefined
    const interaction=parsed.mutating && parsed.action !== 'navigate'
    if (interaction || (origin && !approvedOrigins.includes(origin))) {
      if (!source && interaction) throw new Error('浏览器尚无当前页面，不能批准目标或输入')
      const approved=await this.options.approve(`浏览器操作\n页面：${source?.url ?? parsed.targetUrl}\n页面版本：${source?.pageVersion ?? 'empty'}\n命令：${parsed.command}`)
      this.options.signal.throwIfAborted()
      if (!approved) throw new Error('用户拒绝本次浏览器操作；不得重试或绕过')
      approval={url:source?.url ?? parsed.targetUrl!,pageVersion:source?.pageVersion ?? 'empty',commandHash:hash}
      if (origin) approvedOrigins.push(origin)
    }
    await this.waitActive();await this.options.validate(); this.options.signal.throwIfAborted()
    if(lease.generation!==this.lease.generation) throw new Error('浏览器已交还并刷新页面；原未开始命令未执行，请核对新快照')
    const envelope:BrowserActionEnvelope={lease:lease,actionId,toolCallId,command:parsed.command,argumentHash:hash,approvedOrigins,...(source ? {expectedPageVersion:source.pageVersion}:{}),...(approval ? {approval}: {})}
    const prepared=await this.repository.prepare(envelope,parsed.mutating)
    if (!prepared.fresh) {
      const previous=await this.host.request('lookup',{lease:lease,actionId})
      if (previous && previous.status !== 'unknown') { await this.repository.finish(lease,previous); return this.completed(previous) }
      if (prepared.action.reply && prepared.action.status !== 'unknown') return this.completed(prepared.action.reply)
      throw new Error('原浏览器动作结果待核对，未重新执行')
    }
    let reply:BrowserActionReply
    try { reply=await this.host.request('executeSingle',envelope) }
    catch { reply=(await this.host.request('lookup',{lease:lease,actionId}).catch(() => null)) ?? {actionId,generation:lease.generation,status:'unknown',error:'浏览器回执失联，仅保留核对，不重放'} }
    if (reply.actionId !== actionId || reply.generation !== lease.generation) throw new Error('浏览器回执身份不一致')
    await this.repository.finish(lease,reply)
    this.completed(reply)
    if (reply.downloads?.length) {
      const files=[]
      for (const download of reply.downloads.slice(0,50)) {
        if((await lstat(download.path)).isSymbolicLink()) throw new Error('下载原件不能是符号链接')
        const downloadRoot=await realpath(lease.downloadDirectory),actualPath=await realpath(download.path)
        const relative=path.relative(downloadRoot,actualPath)
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('下载不属于当前工作运行')
        const file=await lstat(actualPath)
        if (!file.isFile() || file.isSymbolicLink() || file.size !== download.size || file.size > 64*1024*1024) throw new Error('下载未完成或文件身份已变化')
        const bytes=await readFile(actualPath)
        if (createHash('sha256').update(bytes).digest('hex') !== download.hash) throw new Error('下载原件 hash 已变化')
        files.push({id:download.id,path:`self:/runs/${lease.runId}/${relative.split(path.sep).join('/')}`,name:download.name,size:download.size,hash:download.hash,published:false})
      }
      reply={...reply,result:{output:`${reply.result?.output ?? ''}\n${JSON.stringify(files)}\n下载仍为私有，须 publish_artifact 才能共享。`,appendReleaseHint:reply.result?.appendReleaseHint ?? false},downloads:undefined}
    }
    this.options.signal.throwIfAborted()
    return reply
  }
  private completed(reply:BrowserActionReply) {
    if (reply.status!=='completed') throw new Error(reply.error ?? `浏览器动作 ${reply.status}，原回执保留`)
    return reply
  }
  private async waitActive() {
    if (this.disposed) throw new Error('浏览器租约已结束')
    await this.paused?.promise
    this.options.signal.throwIfAborted()
  }
  /** A takeover parks the existing SDK step; it does not finish or reexecute the task. */
  async pause() {
    this.options.signal.throwIfAborted()
    if (this.disposed) throw new Error('浏览器运行已结束')
    if (!this.paused) {
      let resolve!:()=>void,reject!:(error:Error)=>void
      const promise=new Promise<void>((done,fail)=>{resolve=done;reject=fail});void promise.catch(()=>{})
      this.paused={promise,resolve,reject}
      this.pauseExit=(async()=>{if(this.acquiring)await this.acquiring.catch(()=>{});if(this.acquired)await this.host.request('drain',structuredClone(this.lease))})()
    }
    await this.pauseExit
  }
  async resume(generation:string) {
    const paused=this.paused
    if (!paused || this.disposed) throw new Error('浏览器没有可交还的原运行')
    await this.pauseExit; await this.options.validate();this.options.signal.throwIfAborted()
    this.lease.generation=generation
    this.acquired=false;this.acquiring=undefined
    await this.repository.registerScope(this.lease)
    try {
      await this.host.request('acquire',this.lease);this.acquired=true
      this.resumedSnapshot=await this.host.request('resumeSnapshot',this.lease)
    } catch(error) {
      // A failed refresh must retire its attempted generation before another explicit resume.
      await this.host.request('drain',this.lease);this.acquired=false;this.acquiring=undefined
      throw error
    }
    this.paused=undefined;this.pauseExit=undefined;paused.resolve()
    return this.resumedSnapshot
  }
  drain() {
    this.disposed=true
    this.paused?.reject(new Error('浏览器任务已停止'));this.paused=undefined
    this.stop ??= (async () => {
      if (this.acquiring) await this.acquiring.catch(()=>{})
      if (this.acquired) await this.host.request('drain',this.lease)
      await Promise.allSettled([...this.inFlight])
    })()
    return this.stop
  }
}

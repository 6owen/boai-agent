/*
 * [OUTPUT]: 2026-10-11 第13组员工执行来源/本机登录和运行选项沿原产品身份接线；持续原生合同见13组10/11，实际成绩唯一归06 §122。
 * [OUTPUT]: 显式删除仅移除产品内启动配置，外部程序、登录目录与既有业务记录保持。
 * [INPUT]: 启动项输入、可执行文件身份与产品存储。
 * [OUTPUT]: Codex/Claude专用协议参与严格输入与草稿身份；Claude沿用本机登录或显式API，不接受额外传输参数，专用大小上限不影响旧ACP。
 * [OUTPUT]: 当前单个已保存程序/hash和指定登录目录的只读核对；文件变化/不可用不借用旧握手证明当前能力，也不重跑或持久修改原验证。
 * [OUTPUT]: 短命令解析为固定绝对路径并自动识别 Node；版本化 ACP 启动项、只读草稿校验、精确配置/文件身份匹配的有界草稿验证回执，以及登录目录与会话测试记录。
 * [POS]: runtime/modules/backends 的启动配置仓储。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */

import { createHash, randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { LaunchProfile, LaunchProfileInput, LaunchProfileStatus } from '../../../shared/domain/backends'
import { ProductStore } from '../../adapters/storage/product-store'
import { inspectProgram, resolveProgram } from './program'
import { CLAUDE_PROGRAM_LIMIT } from '../../adapters/claude/policy'
const MAX_DRAFT_VERIFICATIONS = 32
export const profileSchema=z.object({id:z.string().max(200).optional(),expectedRevision:z.number().int().positive().optional(),name:z.string().trim().min(1).max(100),executable:z.string().max(8000),args:z.array(z.string().max(8000)).max(32),protocol:z.enum(['acp','codex-app-server','claude-cli']).optional(),runtime:z.literal('node').optional(),codexHome:z.string().min(1).max(8000).optional(),localConfigId:z.string().regex(/^[a-f0-9]{64}$/).optional(),useExistingLogin:z.boolean(),hostAccessAcknowledged:z.literal(true)}).strict().refine(value=>value.protocol!=='codex-app-server'||value.args.length===0,{message:'Codex 使用受管 app-server 参数，不接受额外启动参数'}).refine(value=>!value.codexHome||value.useExistingLogin,{message:'指定 Codex 登录目录时必须启用现有登录'}).refine(value=>value.protocol!=='claude-cli'||(!value.args.length&&!value.codexHome&&!value.localConfigId),{message:'Claude使用原生登录或明确API来源，不接受Codex配置或额外参数'})
export async function executableIdentity(path:string){return inspectProgram(path)}
export class LaunchProfiles {
 private items=new Map<string,LaunchProfile>()
 private draftVerifications=new Map<string,NonNullable<LaunchProfile['verified']>>()
 constructor(private store:ProductStore){}
 async init(){this.items=new Map((await this.store.load<LaunchProfile>('launchProfiles')).map(p=>[p.id,p]))}
 list(){return structuredClone([...this.items.values()])}
 get(id:string){const p=this.items.get(id);if(!p)throw new Error('请配置外部 Agent 启动项');return structuredClone(p)}
 async status(id:string):Promise<LaunchProfileStatus>{
  const profile=this.get(id),checkedAt=new Date().toISOString()
  try{
   const file=inspectProgram(profile.executable,profile.protocol==='claude-cli'?CLAUDE_PROGRAM_LIMIT:undefined)
   if(file.path!==profile.executable||file.hash!==profile.executableHash)return {profile,status:'changed',checkedAt,detail:'程序文件已变化，原连接验证不适用于当前文件。请在配置中核对。'}
   if(profile.codexHome&&!(await stat(profile.codexHome)).isDirectory())throw new Error('登录目录不可用')
   return {profile,status:'available',checkedAt,detail:'程序文件与保存时一致。此次只核对文件，连接握手和任务执行仍沿原验证范围。'}
  }catch{return {profile,status:'unavailable',checkedAt,detail:'程序或指定登录目录当前不可读取，请在配置中核对。'}}
 }
 async prepare(input:LaunchProfileInput){const value=profileSchema.parse(input),prior=value.id?this.get(value.id):undefined;if(prior&&value.expectedRevision!==prior.revision)throw new Error('启动配置已变更，请刷新');if(value.codexHome){if(!isAbsolute(value.codexHome))throw new Error('Codex 登录目录必须是绝对路径');value.codexHome=await realpath(value.codexHome);if(!(await stat(value.codexHome)).isDirectory())throw new Error('Codex 登录目录不可用')}const file=resolveProgram(value.executable,undefined,value.protocol==='claude-cli'?CLAUDE_PROGRAM_LIMIT:undefined);const {expectedRevision:_,...fields}=value;return {...fields,id:prior?.id??'',executable:file.path,runtime:value.runtime??file.runtime,executableHash:file.hash,revision:(prior?.revision??0)+1} satisfies LaunchProfile}
 private draftKey(p:LaunchProfile){return createHash('sha256').update(JSON.stringify([p.id,p.revision,p.name,p.executable,p.executableHash,p.args,p.protocol??'acp',p.runtime??null,p.codexHome??null,p.localConfigId??null,p.useExistingLogin,p.hostAccessAcknowledged])).digest('hex')}
 recordDraftVerification(profile:LaunchProfile,verified:NonNullable<LaunchProfile['verified']>){const key=this.draftKey(profile);this.draftVerifications.delete(key);this.draftVerifications.set(key,structuredClone(verified));while(this.draftVerifications.size>MAX_DRAFT_VERIFICATIONS)this.draftVerifications.delete(this.draftVerifications.keys().next().value!)}
 forgetDraftVerification(profile:LaunchProfile){this.draftVerifications.delete(this.draftKey(profile))}
 async save(input:LaunchProfileInput){const prepared=await this.prepare(input),key=this.draftKey(prepared),verified=this.draftVerifications.get(key);const p:LaunchProfile={...prepared,id:prepared.id||randomUUID(),...(verified?{verified}: {})};await this.persist(p);this.draftVerifications.delete(key);return structuredClone(p)}
 async verified(id:string,revision:number,verified:LaunchProfile['verified']){const p=this.get(id);if(p.revision!==revision)throw new Error('测试期间启动项已更新，请重新测试');p.verified=verified;await this.persist(p);return p}
 async failedVerification(id:string,revision:number){const p=this.get(id);if(p.revision!==revision)return;delete p.verified;await this.persist(p)}
 async remove(id:string){this.get(id);await this.store.write([],[{collection:'launchProfiles',id}]);this.items.delete(id)}
 private async persist(p:LaunchProfile){await this.store.write([{collection:'launchProfiles',id:p.id,value:p}]);this.items.set(p.id,p)}
}

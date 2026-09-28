/*
 * [INPUT]: 启动项输入、可执行文件身份与产品存储。
 * [OUTPUT]: 版本化 ACP 启动项、Node 运行方式、登录目录与会话测试记录。
 * [POS]: runtime/modules/backends 的启动配置仓储。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */

import { createHash, randomUUID } from 'node:crypto'
import { access, readFile, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, isAbsolute } from 'node:path'
import { z } from 'zod'
import type { LaunchProfile, LaunchProfileInput } from '../../../shared/domain/backends'
import { ProductStore } from '../../adapters/storage/product-store'
export const profileSchema=z.object({id:z.string().max(200).optional(),expectedRevision:z.number().int().positive().optional(),name:z.string().trim().min(1).max(100),executable:z.string().max(8000),args:z.array(z.string().max(8000)).max(32),runtime:z.literal('node').optional(),codexHome:z.string().min(1).max(8000).optional(),localConfigId:z.string().regex(/^[a-f0-9]{64}$/).optional(),useExistingLogin:z.boolean(),hostAccessAcknowledged:z.literal(true)}).strict().refine(value=>!value.codexHome||value.useExistingLogin,{message:'指定 Codex 登录目录时必须启用现有登录'})
export async function executableIdentity(path:string){if(!isAbsolute(path)||['sh','bash','zsh','fish','cmd.exe','powershell.exe','pwsh'].includes(basename(path)))throw new Error('请选择 ACP 程序的绝对路径，不支持 shell 启动命令。');const target=await realpath(path),info=await stat(target);if(!info.isFile()||info.size>200*1024*1024)throw new Error('程序不可用或超过大小限制');await access(target,constants.X_OK);return {path:target,hash:createHash('sha256').update(await readFile(target)).digest('hex')}}
export class LaunchProfiles {
 private items=new Map<string,LaunchProfile>()
 constructor(private store:ProductStore){}
 async init(){this.items=new Map((await this.store.load<LaunchProfile>('launchProfiles')).map(p=>[p.id,p]))}
 list(){return structuredClone([...this.items.values()])}
 get(id:string){const p=this.items.get(id);if(!p)throw new Error('请配置外部 Agent 启动项');return structuredClone(p)}
 async save(input:LaunchProfileInput){const value=profileSchema.parse(input),prior=value.id?this.get(value.id):undefined;if(prior&&value.expectedRevision!==prior.revision)throw new Error('启动配置已变更，请刷新');if(value.codexHome){if(!isAbsolute(value.codexHome))throw new Error('Codex 登录目录必须是绝对路径');value.codexHome=await realpath(value.codexHome);if(!(await stat(value.codexHome)).isDirectory())throw new Error('Codex 登录目录不可用')}const file=await executableIdentity(value.executable);const {expectedRevision:_,...fields}=value;const p:LaunchProfile={...fields,id:prior?.id??randomUUID(),executable:file.path,executableHash:file.hash,revision:(prior?.revision??0)+1};await this.persist(p);return structuredClone(p)}
 async verified(id:string,revision:number,verified:LaunchProfile['verified']){const p=this.get(id);if(p.revision!==revision)throw new Error('测试期间启动项已更新，请重新测试');p.verified=verified;await this.persist(p);return p}
 async failedVerification(id:string,revision:number){const p=this.get(id);if(p.revision!==revision)return;delete p.verified;await this.persist(p)}
 private async persist(p:LaunchProfile){await this.store.write([{collection:'launchProfiles',id:p.id,value:p}]);this.items.set(p.id,p)}
}

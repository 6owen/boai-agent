/*
 * [OUTPUT]: 插件停用只回退有效配色，不覆盖已保存主题选择；显式选择停用配色拒绝。
 * [INPUT]: 外观偏好、图片文件与系统明暗状态。
 * [OUTPUT]: 图片模式解析为深色，原明暗偏好与托管图片持久化保持。
 * [OUTPUT]: 经校验、可迁移的主题、字体、缩放及分模式颜色持久化。
 * [POS]: Electron 宿主外观存储，包含版本冲突与备份边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile, copyFile, stat, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { appearanceDefaults, applyAppearancePatch, resolveAppearanceMode, resolveTheme, type AppearancePatch, type AppearancePreferences, type AppearanceSnapshot, type ColorMode } from '../shared/appearance'
const color = z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
const colors = z.object({ accent: color, background: color, foreground: color }).strict()
const patchSchema = z.object({
 mode: z.enum(['light','dark','system']).optional(),
 themeIds: z.object({ light: z.string().max(100).optional(), dark: z.string().max(100).optional() }).strict().optional(),
 background: z.object({ imageOpacity: z.number().min(0).max(1) }).strict().optional(),
 fontFamily: z.enum(['system','geist']).optional(),
 zoomFactor: z.number().min(0.75).max(1.5).optional(),
 customColors: z.object({ light: colors.optional(), dark: colors.optional() }).strict().optional(),
}).strict()
const validAsset = /^[0-9a-f-]{36}\.(png|jpg|webp)$/
export function imageFormat(bytes: Buffer): 'png' | 'jpg' | 'webp' { if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png'; if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg'; if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp'; throw new Error('请选择 PNG、JPEG 或 WebP 图片。') }
/** Inspect dimensions before invoking the native decoder, to reject decompression bombs. */
export function imageDimensions(data:Buffer,format:ReturnType<typeof imageFormat>){
 let width=0,height=0
 if(format==='png'&&data.length>=24&&data.toString('ascii',12,16)==='IHDR'){width=data.readUInt32BE(16);height=data.readUInt32BE(20)}
 if(format==='jpg'){let offset=2;while(offset+4<=data.length){if(data[offset]!==255)break;const marker=data[offset+1];offset+=2;if(marker===0xd9||marker===0xda)break;if(marker===0xd8||marker===0x01)continue;const length=data.readUInt16BE(offset);if(length<2||offset+length>data.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){height=data.readUInt16BE(offset+3);width=data.readUInt16BE(offset+5);break}offset+=length}}
 if(format==='webp'){let offset=12;while(offset+8<=data.length){const kind=data.toString('ascii',offset,offset+4),length=data.readUInt32LE(offset+4),start=offset+8;if(start+length>data.length)break;if(kind==='VP8X'&&length>=10){width=1+data.readUIntLE(start+4,3);height=1+data.readUIntLE(start+7,3);break}if(kind==='VP8L'&&length>=5&&data[start]===0x2f){width=1+(data.readUInt32LE(start+1)&0x3fff);height=1+((data.readUInt32LE(start+1)>>>14)&0x3fff);break}if(kind==='VP8 '&&length>=10&&data[start+3]===0x9d&&data[start+4]===0x01&&data[start+5]===0x2a){width=data.readUInt16LE(start+6)&0x3fff;height=data.readUInt16LE(start+8)&0x3fff;break}offset=start+length+(length%2)}}
 if(!width||!height||width>8192||height>8192||width*height>32000000)throw new Error('图片尺寸无效或超过 8192 边长 / 3200 万像素。')
 return {width,height}
}
export class AppearanceStore {
 private preferences = structuredClone(appearanceDefaults)
 private revision = 0
 private sequence = 0
 private diagnostic?: string
 private readOnly = false
 private tail: Promise<unknown> = Promise.resolve()
 constructor(readonly root: string, private systemDark: () => boolean, private changed: (value: AppearanceSnapshot) => void, private decode: (data: Buffer) => { width: number; height: number } | Promise<{width:number;height:number}>, private disabledPlugins: () => readonly string[] = () => []) {}
 async init() {
  await mkdir(join(this.root,'assets'),{recursive:true})
  try {
   const saved=JSON.parse(await readFile(join(this.root,'settings.json'),'utf8'))
   if(saved.preferences?.schemaVersion>1) { this.readOnly=true; this.diagnostic='此外观配置来自更新版本，已保留原文件；当前使用默认外观。'; return }
   const p=saved.preferences
   const normalized=patchSchema.parse({ mode:p.mode, themeIds:p.themeIds, background:{imageOpacity:p.background.imageOpacity}, ...p.fontFamily!==undefined?{fontFamily:p.fontFamily}:{}, ...p.zoomFactor!==undefined?{zoomFactor:p.zoomFactor}:{}, ...p.customColors!==undefined?{customColors:p.customColors}:{} })
   this.preferences=applyAppearancePatch(this.preferences,normalized)
   this.preferences.background.assetId=typeof p.background.assetId==='string'&&validAsset.test(p.background.assetId)?p.background.assetId:null
   this.revision=Number.isSafeInteger(saved.revision)&&saved.revision>=0?saved.revision:0
   for(const mode of ['light','dark'] as const) if(this.preferences.themeIds[mode]!==resolveTheme(mode,this.preferences.themeIds[mode]).id){this.preferences.themeIds[mode]=`boai-${mode}`;this.diagnostic='未知主题已回退为 BoAI 默认主题。'}
   if(this.preferences.background.assetId) try { await this.asset(this.preferences.background.assetId) } catch { this.preferences.background.assetId=null;this.diagnostic='背景文件不可用，已使用纯色背景。' }
  } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')this.diagnostic='外观配置无法读取，已使用默认外观；原文件保留。' }
 }
 snapshot(): AppearanceSnapshot { const resolvedMode:ColorMode=resolveAppearanceMode(this.preferences,this.systemDark()?'dark':'light');return structuredClone({preferences:this.preferences,revision:this.revision,sequence:this.sequence,resolvedMode,resolvedThemeId:resolveTheme(resolvedMode,this.preferences.themeIds[resolvedMode],this.disabledPlugins()).id,diagnostic:this.diagnostic,readOnly:this.readOnly}) }
 systemChanged() { this.sequence++; this.changed(this.snapshot()) }
 private serialize<T>(fn:()=>Promise<T>) { const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next }
 private async commit(preferences:AppearancePreferences, expectedRevision:number) {
  if(this.readOnly)throw new Error('新版外观配置为只读，请使用对应版本的应用。')
  if(expectedRevision!==this.revision)throw new Error('APPEARANCE_CONFLICT')
  const revision=this.revision+1,tmp=join(this.root,`${randomUUID()}.tmp`)
  await writeFile(tmp,JSON.stringify({revision,preferences},null,2),{mode:0o600});await rename(tmp,join(this.root,'settings.json'))
  this.preferences=preferences;this.revision=revision;this.sequence++;this.diagnostic=undefined;const result=this.snapshot();this.changed(result);return this.snapshot()
 }
 update(patch:AppearancePatch,revision:number) { return this.serialize(async()=>{ const value=patchSchema.parse(patch),p=applyAppearancePatch(this.preferences,value);for(const mode of ['light','dark'] as const)if(value.themeIds?.[mode]) { const requested=resolveTheme(mode,value.themeIds[mode]);if(resolveTheme(mode,requested.id,this.disabledPlugins()).id!==requested.id)throw new Error('此主题插件已停用，请先启用。');p.themeIds[mode]=requested.id };return this.commit(p,revision) }) }
 import(path:string) { return this.serialize(async()=>{ if((await stat(path)).size>10*1024*1024)throw new Error('图片不能超过 10 MiB。');const bytes=await readFile(path);if(bytes.length>10*1024*1024)throw new Error('图片不能超过 10 MiB。');const format=imageFormat(bytes);imageDimensions(bytes,format);const size=await this.decode(bytes);if(!size.width||!size.height||size.width>8192||size.height>8192||size.width*size.height>32000000)throw new Error('图片尺寸无效或超过 8192 边长 / 3200 万像素。');const assetId=`${randomUUID()}.${format}`;await writeFile(join(this.root,'assets',assetId),bytes,{mode:0o600});return this.commit({...this.preferences,background:{...this.preferences.background,assetId}},this.revision) }) }
 remove() { return this.serialize(()=>this.commit({...this.preferences,background:{...this.preferences.background,assetId:null}},this.revision)) }
 reset() { return this.serialize(()=>this.commit(structuredClone(appearanceDefaults),this.revision)) }
 async asset(assetId:string) { if(!validAsset.test(assetId))throw new Error('无效图片标识');const path=join(this.root,'assets',assetId);const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>10*1024*1024)throw new Error('无效图片');return {bytes:await readFile(path),type:assetId.endsWith('.png')?'image/png':assetId.endsWith('.jpg')?'image/jpeg':'image/webp'} }
 private async copyBackup(destination:string) {if(this.readOnly)throw new Error('新版外观配置无法由当前版本备份。');await mkdir(join(destination,'appearance','assets'),{recursive:true});await writeFile(join(destination,'appearance','settings.json'),JSON.stringify({preferences:this.preferences,revision:this.revision},null,2));const id=this.preferences.background.assetId;if(id){await this.asset(id);await copyFile(join(this.root,'assets',id),join(destination,'appearance','assets',id))} }
 backup(destination:string){return this.serialize(()=>this.copyBackup(destination))}
 coordinatedBackup(destination:string,business:()=>Promise<unknown>){return this.serialize(async()=>{await business();await this.copyBackup(destination)})}
 async flush(){await this.tail}
}

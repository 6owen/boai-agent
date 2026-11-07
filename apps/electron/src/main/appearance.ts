/*
 * [OUTPUT]: v2命令统一主题/字号联动、严格主题校验与已知错误；全部写动作CAS及导入冲突资产清理。
 * [OUTPUT]: 2026-10-20全局字体与应用图标设置接入原外观持久化和宿主协议。
 * [OUTPUT]: 2026-10-19应用业务协议：外观patch校验复用shared真源，原设置持久化保持。
 * [OUTPUT]: 插件停用只回退有效配色，不覆盖已保存主题选择；显式选择停用配色拒绝。
 * [INPUT]: 外观偏好、图片文件与系统明暗状态。
 * [OUTPUT]: 玻璃/遮罩/0–32px模糊独立校验并持久化；旧配置保持原玻璃、40%遮罩及8px模糊。
 * [OUTPUT]: 经校验、可迁移的主题、字体、缩放及分模式颜色持久化。
 * [POS]: Electron 宿主外观存储，包含版本冲突与备份边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile, copyFile, stat, lstat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { appearancePatchSchema as patchSchema } from '@boai/shared/appearance/schema'
import { appearanceDefaults, applyAppearancePatch, availableThemes, resolveAppearanceMode, resolveTheme, type AppearancePatch, type AppearancePreferences, type AppearanceSnapshot, type ColorMode } from '@boai/shared/appearance'
import { AppearanceError, normalizeAppearanceCommand } from '@boai/shared/appearance/commands'
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
 private resetRevision = 0
 private diagnostic?: string
 private readOnly = false
 private tail: Promise<unknown> = Promise.resolve()
 private imports = new Set<Promise<AppearanceSnapshot>>()
 constructor(readonly root: string, private systemDark: () => boolean, private changed: (value: AppearanceSnapshot) => void, private decode: (data: Buffer) => { width: number; height: number } | Promise<{width:number;height:number}>, private disabledPlugins: () => readonly string[] = () => []) {}
 async init() {
  await mkdir(join(this.root,'assets'),{recursive:true})
  try {
   const saved=JSON.parse(await readFile(join(this.root,'settings.json'),'utf8'))
   if(saved.preferences?.schemaVersion>2) { this.readOnly=true; this.diagnostic='此外观配置来自更新版本，已保留原文件；当前使用默认外观。'; return }
   const p=saved.preferences
   const normalized=patchSchema.parse({ mode:p.mode, themeIds:p.themeIds, background:{imageOpacity:p.background.imageOpacity, ...p.background.glassOpacity!==undefined?{glassOpacity:p.background.glassOpacity}:{}, ...p.background.overlayOpacity!==undefined?{overlayOpacity:p.background.overlayOpacity}:{}, ...p.background.blurRadius!==undefined?{blurRadius:p.background.blurRadius}:{}}, ...p.zoomFactor!==undefined?{zoomFactor:p.zoomFactor}:{}, ...p.customColors!==undefined?{customColors:p.customColors}:{} })
   this.preferences=applyAppearancePatch(this.preferences,normalized)
   if(p.typography!==undefined) {
    if(!p.typography || typeof p.typography!=='object' || Array.isArray(p.typography)) this.diagnostic='字体配置无效，已使用默认字体。'
    else for(const group of ['ui','content','code'] as const) if(p.typography[group]!==undefined) {
     const result=patchSchema.safeParse({typography:{[group]:p.typography[group]}})
     if(result.success)this.preferences=applyAppearancePatch(this.preferences,result.data)
     else this.diagnostic='部分字体配置无效，已分别使用默认值。'
    }
   } else if(p.fontFamily!==undefined) {
    const result=patchSchema.safeParse({fontFamily:p.fontFamily})
    if(result.success)this.preferences=applyAppearancePatch(this.preferences,result.data)
    else this.diagnostic='界面字体配置无效，已使用默认字体。'
   }
   if(p.appIconId!==undefined) {
    const result=patchSchema.safeParse({appIconId:p.appIconId})
    if(result.success)this.preferences=applyAppearancePatch(this.preferences,result.data)
    else this.diagnostic='应用图标配置无效，已使用默认图标。'
   }
   this.preferences.background.assetId=typeof p.background.assetId==='string'&&validAsset.test(p.background.assetId)?p.background.assetId:null
   this.revision=Number.isSafeInteger(saved.revision)&&saved.revision>=0?saved.revision:0
   this.resetRevision=Number.isSafeInteger(saved.resetRevision)&&saved.resetRevision>=0&&saved.resetRevision<=this.revision?saved.resetRevision:0
   for(const mode of ['light','dark'] as const) if(this.preferences.themeIds[mode]!==resolveTheme(mode,this.preferences.themeIds[mode]).id){this.preferences.themeIds[mode]=`boai-${mode}`;this.diagnostic='未知主题已回退为 BoAI 默认主题。'}
   if(this.preferences.background.assetId) try { await this.asset(this.preferences.background.assetId) } catch { this.preferences.background.assetId=null;this.diagnostic='背景文件不可用，已使用纯色背景。' }
  } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')this.diagnostic='外观配置无法读取，已使用默认外观；原文件保留。' }
 }
 snapshot(): AppearanceSnapshot { const resolvedMode:ColorMode=resolveAppearanceMode(this.preferences,this.systemDark()?'dark':'light');return structuredClone({preferences:this.preferences,revision:this.revision,sequence:this.sequence,resetRevision:this.resetRevision,resolvedMode,resolvedThemeId:resolveTheme(resolvedMode,this.preferences.themeIds[resolvedMode],this.disabledPlugins()).id,diagnostic:this.diagnostic,readOnly:this.readOnly}) }
 systemChanged() { this.sequence++; this.changed(this.snapshot()) }
 private serialize<T>(fn:()=>Promise<T>) { const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next }
 private assertWritable(expectedRevision: number) {
  if(this.readOnly)throw new AppearanceError('READ_ONLY','新版外观配置为只读，请使用对应版本的应用。')
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new AppearanceError('INVALID_ARGUMENT','外观版本无效。')
  if(expectedRevision!==this.revision)throw new AppearanceError('REVISION_CONFLICT','APPEARANCE_CONFLICT：外观已被其他操作修改，请重新读取后调整。')
 }
 private async commit(preferences:AppearancePreferences, expectedRevision:number, reset = false) {
  this.assertWritable(expectedRevision)
  const revision=this.revision+1,resetRevision=reset?revision:this.resetRevision,tmp=join(this.root,`${randomUUID()}.tmp`)
  await writeFile(tmp,JSON.stringify({revision,resetRevision,preferences},null,2),{mode:0o600});await rename(tmp,join(this.root,'settings.json'))
  this.preferences=preferences;this.revision=revision;this.resetRevision=resetRevision;this.sequence++;this.diagnostic=undefined;const result=this.snapshot();this.changed(result);return this.snapshot()
 }
 private parsePatch(patch: AppearancePatch) {
  const parsed=patchSchema.safeParse(patch)
  if(!parsed.success)throw new AppearanceError('INVALID_ARGUMENT','外观参数无效。')
  const value=parsed.data
  if(value.fontFamily&&value.typography?.ui?.family&&value.fontFamily!==value.typography.ui.family)throw new AppearanceError('INVALID_ARGUMENT','界面字体设置冲突。')
  for(const mode of ['light','dark'] as const)if(value.themeIds?.[mode]!==undefined) {
   const requested=availableThemes().find(theme=>theme.id===value.themeIds?.[mode]&&theme.mode===mode)
   if(!requested)throw new AppearanceError('INVALID_ARGUMENT','未知主题或主题明暗模式不匹配。')
   if(!availableThemes(this.disabledPlugins()).some(theme=>theme.id===requested.id&&theme.mode===mode))throw new AppearanceError('INVALID_ARGUMENT','此主题插件已停用，请先启用。')
  }
  return value
 }
 /** Explicit legacy v1: merge only, without v2 theme/typography command side effects. */
 update(patch:AppearancePatch,revision:number) { return this.serialize(async()=>{this.assertWritable(revision);return this.commit(applyAppearancePatch(this.preferences,this.parsePatch(patch)),revision)}) }
 updateCommand(patch:AppearancePatch,revision:number) { return this.serialize(async()=>{this.assertWritable(revision);return this.commit(applyAppearancePatch(this.preferences,normalizeAppearanceCommand(this.parsePatch(patch))),revision)}) }
 import(path:string,expectedRevision=this.revision) {
  const operation=this.importImage(path,expectedRevision)
  this.imports.add(operation)
  void operation.then(()=>this.imports.delete(operation),()=>this.imports.delete(operation))
  return operation
 }
 private async importImage(path:string,expectedRevision:number) {
  // Decoding is outside the writer queue: another user's save must be able to invalidate this selection.
  this.assertWritable(expectedRevision)
  if((await stat(path)).size>10*1024*1024)throw new AppearanceError('INVALID_ARGUMENT','图片不能超过 10 MiB。')
  const bytes=await readFile(path)
  if(bytes.length>10*1024*1024)throw new AppearanceError('INVALID_ARGUMENT','图片不能超过 10 MiB。')
  let format:ReturnType<typeof imageFormat>
  try { format=imageFormat(bytes);imageDimensions(bytes,format) } catch(error) { throw new AppearanceError('INVALID_ARGUMENT',error instanceof Error?error.message:'图片无效。') }
  let size:{width:number;height:number}
  try { size=await this.decode(bytes) } catch { throw new AppearanceError('INVALID_ARGUMENT','图片无法解码。') }
  if(!size.width||!size.height||size.width>8192||size.height>8192||size.width*size.height>32000000)throw new AppearanceError('INVALID_ARGUMENT','图片尺寸无效或超过 8192 边长 / 3200 万像素。')
  const assetId=`${randomUUID()}.${format}`,assetPath=join(this.root,'assets',assetId)
  try {
   await writeFile(assetPath,bytes,{mode:0o600})
   return await this.serialize(()=>this.commit({...this.preferences,background:{...this.preferences.background,assetId}},expectedRevision))
  }
  catch(error) { if(this.preferences.background.assetId!==assetId)await rm(assetPath,{force:true});throw error }
 }
 remove(expectedRevision=this.revision) { return this.serialize(()=>this.commit({...this.preferences,background:{...this.preferences.background,assetId:null}},expectedRevision)) }
 reset(expectedRevision=this.revision) { return this.serialize(()=>this.commit(structuredClone(appearanceDefaults),expectedRevision,true)) }
 async asset(assetId:string) { if(!validAsset.test(assetId))throw new Error('无效图片标识');const path=join(this.root,'assets',assetId);const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>10*1024*1024)throw new Error('无效图片');return {bytes:await readFile(path),type:assetId.endsWith('.png')?'image/png':assetId.endsWith('.jpg')?'image/jpeg':'image/webp'} }
 private async copyBackup(destination:string) {if(this.readOnly)throw new Error('新版外观配置无法由当前版本备份。');await mkdir(join(destination,'appearance','assets'),{recursive:true});await writeFile(join(destination,'appearance','settings.json'),JSON.stringify({preferences:this.preferences,revision:this.revision,resetRevision:this.resetRevision},null,2));const id=this.preferences.background.assetId;if(id){await this.asset(id);await copyFile(join(this.root,'assets',id),join(destination,'appearance','assets',id))} }
 backup(destination:string){return this.serialize(()=>this.copyBackup(destination))}
 coordinatedBackup(destination:string,business:()=>Promise<unknown>){return this.serialize(async()=>{await business();await this.copyBackup(destination)})}
 async flush(){await Promise.allSettled([...this.imports]);await this.tail}
}

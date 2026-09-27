/*
 * [INPUT]: AppearanceStore、共享外观合同和临时文件系统。
 * [OUTPUT]: 外观兼容、校验、分模式自定义色、缩放持久化与备份回归验证。
 * [POS]: tests/appearance.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppearanceStore } from '../src/main/appearance'
import { themes, themeTokens, mergeAppearancePatch } from '../src/shared/appearance'
const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})))})
async function setup(){const root=await mkdtemp(join(tmpdir(),'boai-appearance-'));roots.push(root);let dark=false;const store=new AppearanceStore(root,()=>dark,()=>{},()=>({width:1,height:1}));await store.init();return {root,store,dark:()=>{dark=true;store.systemChanged()}}}
it('serializes revisions, keeps system sequence separate and restores preferences',async()=>{const {root,store,dark}=await setup();await store.update({themeIds:{dark:'nord'}},0);await expect(store.update({mode:'dark'},0)).rejects.toThrow('CONFLICT');dark();expect(store.snapshot()).toMatchObject({revision:1,resolvedMode:'dark',resolvedThemeId:'nord',sequence:2});const reopened=new AppearanceStore(root,()=>true,()=>{},()=>({width:1,height:1}));await reopened.init();expect(reopened.snapshot().resolvedThemeId).toBe('nord')})
it('imports managed images and validates content, opacity, and opaque asset paths',async()=>{const {root,store}=await setup();const file=join(root,'source.png');await writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MxsAAAAASUVORK5CYII=','base64'));const imported=await store.import(file);await rm(file);expect((await store.asset(imported.preferences.background.assetId!)).type).toBe('image/png');await expect(store.asset('../settings.json')).rejects.toThrow();await expect(store.update({background:{imageOpacity:2}},1)).rejects.toThrow();await writeFile(file,'not an image');await expect(store.import(file)).rejects.toThrow('PNG');expect(store.snapshot().revision).toBe(1);await symlink(join(root,'settings.json'),join(root,'assets','11111111-1111-1111-1111-111111111111.png'));await expect(store.asset('11111111-1111-1111-1111-111111111111.png')).rejects.toThrow();const destination=join(root,'backup');await store.backup(destination);expect(JSON.parse(await readFile(join(destination,'appearance','settings.json'),'utf8')).preferences.background.assetId).toBe(imported.preferences.background.assetId)})
it('preserves future config read-only',async()=>{const {root}=await setup();const bytes=JSON.stringify({preferences:{schemaVersion:8}});await writeFile(join(root,'settings.json'),bytes);const store=new AppearanceStore(root,()=>false,()=>{},()=>({width:0,height:0}));await store.init();await expect(store.reset()).rejects.toThrow('只读');expect(await readFile(join(root,'settings.json'),'utf8')).toBe(bytes)})
function luminance(hex:string){const rgb=hex.slice(1).match(/../g)!.map(h=>parseInt(h,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
it('keeps foreground and secondary text readable on each built-in surface',()=>{for(const theme of themes){const t=themeTokens(theme);for(const color of [t.foreground,t['muted-foreground']])for(const surface of [t.background,t.card]){const a=luminance(color),b=luminance(surface);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05),theme.id).toBeGreaterThanOrEqual(4.5)}}})

it('keeps mode-specific colors, font and scale across restart and resets them together', async () => {
  const {root,store} = await setup()
  await store.update({fontFamily:'system',zoomFactor:0.9,customColors:{light:{accent:'#007acc',background:'#ffffff'},dark:{foreground:'#eeeeee'}}},0)
  await store.update({customColors:{light:{foreground:'#101010'}}},1)
  const reopened = new AppearanceStore(root,()=>false,()=>{},()=>({width:1,height:1}))
  await reopened.init()
  expect(reopened.snapshot().preferences).toMatchObject({fontFamily:'system',zoomFactor:0.9,customColors:{light:{accent:'#007acc',background:'#ffffff',foreground:'#101010'},dark:{foreground:'#eeeeee',accent:null}}})
  await reopened.update({customColors:{light:{accent:null}}},2)
  expect(reopened.snapshot().preferences.customColors.light).toEqual({accent:null,background:'#ffffff',foreground:'#101010'})
  await reopened.reset()
  expect(reopened.snapshot().preferences).toMatchObject({fontFamily:'geist',zoomFactor:1,customColors:{light:{accent:null,background:null,foreground:null}}})
})
it('adds safe defaults to old settings and rejects unsupported scale/font/color inputs', async () => {
  const {root,store} = await setup()
  const old = {...store.snapshot().preferences} as Record<string,unknown>
  delete old.fontFamily; delete old.zoomFactor; delete old.customColors
  await writeFile(join(root,'settings.json'),JSON.stringify({revision:4,preferences:old}))
  const reopened = new AppearanceStore(root,()=>false,()=>{},()=>({width:1,height:1}))
  await reopened.init()
  expect(reopened.snapshot()).toMatchObject({revision:4,preferences:{fontFamily:'geist',zoomFactor:1}})
  for (const patch of [{zoomFactor:0.1},{zoomFactor:4},{fontFamily:'remote-font'},{customColors:{light:{accent:'url(https://example.com)'}}}]) {
    await expect(reopened.update(patch as never,4)).rejects.toThrow()
  }
  expect(reopened.snapshot().revision).toBe(4)
})
it('merges rapid color edits without losing other fields or the other mode', () => {
  expect(mergeAppearancePatch({customColors:{light:{accent:'#007acc'},dark:{background:'#212121'}}},{customColors:{light:{foreground:'#000000'}}})).toEqual({customColors:{light:{accent:'#007acc',foreground:'#000000'},dark:{background:'#212121'}}})
})

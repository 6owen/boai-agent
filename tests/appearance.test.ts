/*
 * [INPUT]: AppearanceStore、共享外观合同和临时文件系统。
 * [OUTPUT]: Scenic图片遵循明暗模式；玻璃/遮罩/模糊独立校验、旧配置8px默认、零值重启/备份/换图保留及重置回归。
 * [OUTPUT]: 外观兼容、自定义色、缩放/备份以及正文与 Soft 操作按钮文字对比度回归。
 * [POS]: tests/appearance.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppearanceStore } from '../apps/electron/src/main/appearance'
import { themes, themeTokens, mergeAppearancePatch, maxBackgroundBlur, typographyControls, resolveTypography, defaultAppIconId } from '../packages/shared/src/appearance'
const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})))})
async function setup(){const root=await mkdtemp(join(tmpdir(),'boai-appearance-'));roots.push(root);let dark=false;const store=new AppearanceStore(root,()=>dark,()=>{},()=>({width:1,height:1}));await store.init();return {root,store,dark:()=>{dark=true;store.systemChanged()}}}
it('serializes revisions, keeps system sequence separate and restores preferences',async()=>{const {root,store,dark}=await setup();await store.update({themeIds:{dark:'nord'}},0);await expect(store.update({mode:'dark'},0)).rejects.toThrow('CONFLICT');dark();expect(store.snapshot()).toMatchObject({revision:1,resolvedMode:'dark',resolvedThemeId:'nord',sequence:2});const reopened=new AppearanceStore(root,()=>true,()=>{},()=>({width:1,height:1}));await reopened.init();expect(reopened.snapshot().resolvedThemeId).toBe('nord')})
it('imports managed images and validates content, opacity, and opaque asset paths',async()=>{const {root,store}=await setup();const file=join(root,'source.png');await writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MxsAAAAASUVORK5CYII=','base64'));const imported=await store.import(file);await rm(file);expect((await store.asset(imported.preferences.background.assetId!)).type).toBe('image/png');await expect(store.asset('../settings.json')).rejects.toThrow();await expect(store.update({background:{imageOpacity:2}},1)).rejects.toThrow();await writeFile(file,'not an image');await expect(store.import(file)).rejects.toThrow('PNG');expect(store.snapshot().revision).toBe(1);await symlink(join(root,'settings.json'),join(root,'assets','11111111-1111-1111-1111-111111111111.png'));await expect(store.asset('11111111-1111-1111-1111-111111111111.png')).rejects.toThrow();const destination=join(root,'backup');await store.backup(destination);expect(JSON.parse(await readFile(join(destination,'appearance','settings.json'),'utf8')).preferences.background.assetId).toBe(imported.preferences.background.assetId)})
it('preserves future config read-only',async()=>{const {root}=await setup();const bytes=JSON.stringify({preferences:{schemaVersion:8}});await writeFile(join(root,'settings.json'),bytes);const store=new AppearanceStore(root,()=>false,()=>{},()=>({width:0,height:0}));await store.init();await expect(store.reset()).rejects.toThrow('只读');expect(await readFile(join(root,'settings.json'),'utf8')).toBe(bytes)})
function luminance(hex:string){const rgb=hex.slice(1).match(/../g)!.map(h=>parseInt(h,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
it('keeps body and action text readable on every built-in theme',()=>{for(const theme of themes){const t=themeTokens(theme);for(const [color,surface] of [[t.foreground,t.background],[t.foreground,t.card],[t['muted-foreground'],t.background],[t['muted-foreground'],t.card],[t['primary-foreground'],t.primary],[t['destructive-foreground'],t.destructive]]){const a=luminance(color),b=luminance(surface);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05),theme.id).toBeGreaterThanOrEqual(4.5)}}})

it('keeps mode-specific colors, font and scale across restart and resets them together', async () => {
  const {root,store} = await setup()
  await store.update({fontFamily:'system',zoomFactor:0.9,customColors:{light:{accent:'#007acc',background:'#ffffff'},dark:{foreground:'#eeeeee'}}},0)
  await store.update({customColors:{light:{foreground:'#101010'}}},1)
  const reopened = new AppearanceStore(root,()=>false,()=>{},()=>({width:1,height:1}))
  await reopened.init()
  expect(reopened.snapshot().preferences).toMatchObject({typography:{ui:{family:'system'}},zoomFactor:0.9,customColors:{light:{accent:'#007acc',background:'#ffffff',foreground:'#101010'},dark:{foreground:'#eeeeee',accent:null}}})
  await reopened.update({customColors:{light:{accent:null}}},2)
  expect(reopened.snapshot().preferences.customColors.light).toEqual({accent:null,background:'#ffffff',foreground:'#101010'})
  await reopened.reset()
  expect(reopened.snapshot().preferences).toMatchObject({typography:{ui:{family:'geist'}},zoomFactor:1,customColors:{light:{accent:null,background:null,foreground:null}}})
})
it.each([undefined, 0.28])('adds safe defaults to old settings with glassOpacity=%s and rejects invalid inputs', async glassOpacity => {
  const {root,store} = await setup()
  const old = {...store.snapshot().preferences} as Record<string,unknown>
  old.schemaVersion = 1; old.fontFamily = 'system'; delete old.typography; delete old.appIconId; delete old.zoomFactor; delete old.customColors
  old.background = { assetId: null, imageOpacity: 0.2, glassOpacity }
  await writeFile(join(root,'settings.json'),JSON.stringify({revision:4,preferences:old}))
  const reopened = new AppearanceStore(root,()=>false,()=>{},()=>({width:1,height:1}))
  await reopened.init()
  expect(reopened.snapshot()).toMatchObject({revision:4,preferences:{schemaVersion:2,typography:{ui:{family:'system',sizePx:typographyControls.ui.defaultSize}},appIconId:defaultAppIconId,zoomFactor:1,background:{imageOpacity:0.2,glassOpacity:glassOpacity ?? null,overlayOpacity:0.4,blurRadius:8}}})
  for (const patch of [{zoomFactor:0.1},{zoomFactor:4},{fontFamily:'remote-font'},{customColors:{light:{accent:'url(https://example.com)'}}}]) {
    await expect(reopened.update(patch as never,4)).rejects.toThrow()
  }
  expect(reopened.snapshot().revision).toBe(4)
})
it('merges rapid color edits without losing other fields or the other mode', () => {
  expect(mergeAppearancePatch({customColors:{light:{accent:'#007acc'},dark:{background:'#212121'}}},{customColors:{light:{foreground:'#000000'}}})).toEqual({customColors:{light:{accent:'#007acc',foreground:'#000000'},dark:{background:'#212121'}}})
  expect(mergeAppearancePatch({background:{imageOpacity:0.2,glassOpacity:0.55}},{background:{glassOpacity:0}})).toEqual({background:{imageOpacity:0.2,glassOpacity:0}})
  expect(mergeAppearancePatch({background:{glassOpacity:0.28,overlayOpacity:0.4}},{background:{overlayOpacity:0}})).toEqual({background:{glassOpacity:0.28,overlayOpacity:0}})
  expect(mergeAppearancePatch({background:{glassOpacity:0.28,overlayOpacity:0.18}},{background:{blurRadius:0}})).toEqual({background:{glassOpacity:0.28,overlayOpacity:0.18,blurRadius:0}})
  expect(mergeAppearancePatch({typography:{ui:{sizePx:16},content:{family:'serif'}}},{typography:{ui:{family:'system'},code:{sizePx:18}}})).toEqual({typography:{ui:{sizePx:16,family:'system'},content:{family:'serif'},code:{sizePx:18}}})
})

it('persists independent typography and app icon choices, rejects invalid sizes and icon IDs', async () => {
  const { root, store } = await setup()
  const saved = await store.update({ typography: { ui: { sizePx: 16 }, content: { family: 'serif', sizePx: 18 }, code: { family: 'menlo', sizePx: 15 } }, appIconId: 'avatar-mint-ring' }, 0)
  expect(resolveTypography(saved.preferences.typography).sizes['--text-content-body']).toBe('18px')
  await store.update({ typography: { ui: { family: 'system' } } }, saved.revision)
  const reopened = new AppearanceStore(root, () => false, () => {}, () => ({ width: 1, height: 1 }))
  await reopened.init()
  expect(reopened.snapshot().preferences).toMatchObject({ typography: { ui: { family: 'system', sizePx: 16 }, content: { family: 'serif', sizePx: 18 }, code: { family: 'menlo', sizePx: 15 } }, appIconId: 'avatar-mint-ring' })
  const before = reopened.snapshot()
  for (const patch of [{ typography: { ui: { sizePx: typographyControls.ui.min - 1 } } }, { typography: { code: { sizePx: 12.5 } } }, { appIconId: 'avatar-unknown' }, { fontFamily: 'geist', typography: { ui: { family: 'system' } } }]) {
    await expect(reopened.update(patch as never, before.revision)).rejects.toThrow()
  }
  expect(reopened.snapshot()).toEqual(before)
})

it('keeps valid appearance fields when one saved font group or icon ID is corrupt', async () => {
  const { root, store } = await setup()
  const preferences = store.snapshot().preferences
  preferences.mode = 'dark'
  preferences.typography.ui.sizePx = 17
  preferences.typography.content.family = 'serif'
  preferences.typography.content.sizePx = 20
  ;(preferences.typography.code as { family: string; sizePx: number }).sizePx = 200
  ;(preferences as { appIconId: string }).appIconId = 'missing'
  await writeFile(join(root, 'settings.json'), JSON.stringify({ revision: 8, preferences }))
  const reopened = new AppearanceStore(root, () => false, () => {}, () => ({ width: 1, height: 1 }))
  await reopened.init()
  expect(reopened.snapshot()).toMatchObject({ revision: 8, resolvedMode: 'dark', preferences: {
    typography: { ui: { sizePx: 17 }, content: { family: 'serif', sizePx: 20 }, code: { sizePx: typographyControls.code.defaultSize } },
    appIconId: defaultAppIconId,
  } })
  expect(reopened.snapshot().diagnostic).toContain('图标')
})

it('keeps glass, overlay and disabled blur through image replacement, restart and backup until reset', async () => {
  const { root, store, dark } = await setup()
  const file = join(root, 'landscape.png')
  await writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MxsAAAAASUVORK5CYII=', 'base64'))
  const imported = await store.import(file)
  const glass = await store.update({ background: { glassOpacity: 0.28 } }, imported.revision)
  const overlay = await store.update({ background: { overlayOpacity: 0.18 } }, glass.revision)
  const changed = await store.update({ background: { blurRadius: 0 } }, overlay.revision)
  expect(changed.preferences.background).toEqual({ ...imported.preferences.background, glassOpacity: 0.28, overlayOpacity: 0.18, blurRadius: 0 })
  dark()
  expect(store.snapshot()).toMatchObject({ resolvedMode: 'dark', preferences: { background: { glassOpacity: 0.28, overlayOpacity: 0.18, blurRadius: 0 } } })
  const replaced = await store.import(file)
  expect(replaced.preferences.background.assetId).not.toBe(imported.preferences.background.assetId)
  expect(replaced.preferences.background).toMatchObject({ glassOpacity: 0.28, overlayOpacity: 0.18, blurRadius: 0 })
  const reopened = new AppearanceStore(root, () => false, () => {}, () => ({ width: 1, height: 1 }))
  await reopened.init()
  expect(reopened.snapshot().preferences.background).toEqual(replaced.preferences.background)
  const destination = join(root, 'backup')
  await reopened.backup(destination)
  const restored = new AppearanceStore(join(destination, 'appearance'), () => false, () => {}, () => ({ width: 1, height: 1 }))
  await restored.init()
  expect(restored.snapshot().preferences.background).toEqual(replaced.preferences.background)
  const removed = await restored.remove()
  expect(removed.preferences.background).toMatchObject({ assetId: null, glassOpacity: 0.28, overlayOpacity: 0.18, blurRadius: 0 })
  expect((await restored.import(file)).preferences.background).toMatchObject({ glassOpacity: 0.28, overlayOpacity: 0.18, blurRadius: 0 })
  expect((await restored.reset()).preferences.background).toEqual({ assetId: null, imageOpacity: 1, glassOpacity: null, overlayOpacity: 0.4, blurRadius: 8 })
})

it.each(['glassOpacity', 'overlayOpacity'] as const)('accepts 0–100%% %s and rejects invalid opacity without overwriting settings', async key => {
  const { store } = await setup()
  for (const opacity of [0, 1]) {
    const saved = await store.update({ background: { [key]: opacity } }, store.snapshot().revision)
    expect(saved.preferences.background[key]).toBe(opacity)
  }
  const before = store.snapshot()
  for (const opacity of [-0.01, 1.01, NaN, Infinity, '0.5']) {
    await expect(store.update({ background: { [key]: opacity } } as never, before.revision)).rejects.toThrow()
  }
  expect(store.snapshot()).toEqual(before)
})

it('accepts blur off and the maximum radius, rejecting invalid radii without changing settings', async () => {
  const { store } = await setup()
  for (const blurRadius of [0, maxBackgroundBlur]) {
    expect((await store.update({ background: { blurRadius } }, store.snapshot().revision)).preferences.background.blurRadius).toBe(blurRadius)
  }
  const before = store.snapshot()
  for (const blurRadius of [-1, maxBackgroundBlur + 1, 0.5, NaN, Infinity, '8', null]) {
    await expect(store.update({ background: { blurRadius } } as never, before.revision)).rejects.toThrow()
  }
  expect(store.snapshot()).toEqual(before)
})

it.each(['light', 'dark', 'system'] as const)('preserves %s mode with Scenic across system changes, switching and restart', async mode => {
  const { root, store, dark } = await setup()
  const before = await store.update({ mode, themeIds: { light: 'vscode-plus-light', dark: 'nord' }, customColors: { light: { background: '#fafafa' } } }, 0)
  const file = join(root, 'landscape.png')
  await writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MxsAAAAASUVORK5CYII=', 'base64'))
  const imported = await store.import(file)
  expect(imported).toMatchObject({ resolvedMode: mode === 'dark' ? 'dark' : 'light', resolvedThemeId: mode === 'dark' ? 'nord' : 'vscode-plus-light', preferences: { mode } })
  dark()
  const resolvedMode = mode === 'light' ? 'light' : 'dark'
  expect(store.snapshot()).toMatchObject({ revision: imported.revision, resolvedMode, preferences: { mode, background: imported.preferences.background } })
  await rm(file)
  const reopened = new AppearanceStore(root, () => true, () => {}, () => ({ width: 1, height: 1 }))
  await reopened.init()
  expect(reopened.snapshot()).toMatchObject({ resolvedMode, preferences: { mode, background: imported.preferences.background } })
  const otherMode = resolvedMode === 'light' ? 'dark' : 'light'
  const switched = await reopened.update({ mode: otherMode }, imported.revision)
  expect(switched).toMatchObject({ resolvedMode: otherMode, preferences: { background: imported.preferences.background } })
  await reopened.update({ mode }, switched.revision)
  const removed = await reopened.remove()
  expect(removed).toMatchObject({ resolvedMode, resolvedThemeId: resolvedMode === 'light' ? 'vscode-plus-light' : 'nord', preferences: { mode, customColors: before.preferences.customColors, background: { assetId: null } } })
})
it('falls back to the saved solid mode when the managed background is missing', async () => {
  const { root, store } = await setup()
  const preferences = store.snapshot().preferences
  preferences.mode = 'light'
  preferences.background = { ...preferences.background, assetId: '11111111-1111-1111-1111-111111111111.png', imageOpacity: 0.2 }
  await writeFile(join(root, 'settings.json'), JSON.stringify({ revision: 8, preferences }))
  const reopened = new AppearanceStore(root, () => false, () => {}, () => ({ width: 1, height: 1 }))
  await reopened.init()
  expect(reopened.snapshot()).toMatchObject({ resolvedMode: 'light', preferences: { background: { assetId: null } }, diagnostic: '背景文件不可用，已使用纯色背景。' })
})

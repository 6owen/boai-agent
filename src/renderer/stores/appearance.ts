/*
 * [OUTPUT]: 主题按插件启停即时解析，保留原偏好并释放/取得实际主题使用引用。
 * [INPUT]: 桌面外观快照、局部预览及共享偏好合并规则。
 * [OUTPUT]: 接入 Craft Scenic 深色/托管图片与玻璃语义面板，移除恢复原主题。
 * [OUTPUT]: 即时主题/字体/颜色预览、串行保存与失败重试。
 * [POS]: Renderer 外观状态真源；原生缩放由宿主应用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { errorText } from '@/components/common'
import { create } from 'zustand'
import { appearanceDefaults, applyAppearancePatch, mergeAppearancePatch as merge, resolveAppearanceMode, resolveAppearanceTheme, interfaceFonts, resolveTheme, themeTokens, type AppearanceSnapshot, type AppearancePatch } from '@shared/appearance'
import { getDesktopClient } from '@/services/request/desktop-client'
import { themePluginId } from '@shared/plugins/catalog'
import { pluginUsage, usePlugins } from './plugins'
const fallback:AppearanceSnapshot={preferences:appearanceDefaults,revision:0,sequence:0,resolvedMode:'light',resolvedThemeId:'boai-light'}
let savePromise:Promise<void>|undefined
let activeThemePlugin: string | undefined, releaseTheme: (() => void) | undefined
let pending:AppearancePatch={},inFlight:AppearancePatch={},saving=false,timer:ReturnType<typeof setTimeout>|undefined
export const useAppearance=create<{snapshot:AppearanceSnapshot;preview:AppearanceSnapshot;status:'saved'|'saving'|'error';error:string}>(()=>({snapshot:fallback,preview:fallback,status:'saved',error:''}))
function render() {
  const state = useAppearance.getState()
  const preferences = applyAppearancePatch(state.snapshot.preferences, merge(inFlight, pending))
  const mode = resolveAppearanceMode(preferences, state.snapshot.resolvedMode)
  const disabledIds = usePlugins.getState().settings.disabledIds
  const preview = { ...state.snapshot, preferences, resolvedMode: mode, resolvedThemeId: resolveTheme(mode, preferences.themeIds[mode], disabledIds).id }
  useAppearance.setState({ preview })
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.dataset.theme = mode
  root.dataset.themeId = preview.resolvedThemeId
  root.style.colorScheme = mode
  root.style.setProperty('--font-ui-family', interfaceFonts[preferences.fontFamily])
  const owner = themePluginId(preview.resolvedThemeId)
  if (owner !== activeThemePlugin) { releaseTheme?.(); activeThemePlugin = owner; releaseTheme = owner ? pluginUsage.acquire(owner) : undefined }
  const tokens = themeTokens(resolveAppearanceTheme(preferences, mode, disabledIds))
  const id = preferences.background.assetId
  if (id) {
    // Craft ThemeContext + Scenic CSS; keep menus opaque and avoid stacking glass panes.
    root.dataset.scenic = 'true'
    root.style.setProperty('--background-image', `url("boai-asset://appearance/${id}")`)
    Object.assign(tokens, { 'surface-app': 'rgba(0, 0, 0, 0.12)', 'rail-foreground': tokens.foreground, 'surface-content': 'transparent',
      'surface-list': 'rgba(0, 0, 0, 0.12)', 'surface-detail': 'rgba(0, 0, 0, 0.12)',
      'surface-composer': 'rgba(0, 0, 0, 0.15)' })
  } else {
    delete root.dataset.scenic
    root.style.removeProperty('--background-image')
  }
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(`--${key}`, value)
}

function accept(value:AppearanceSnapshot){const current=useAppearance.getState().snapshot;if(value.revision<current.revision||(value.revision===current.revision&&value.sequence<current.sequence))return;useAppearance.setState({snapshot:value});render()}
function dirty(value:boolean){void getDesktopClient()?.request('setUnsavedChanges',{source:'appearance',dirty:value}).catch(()=>{})}
export function initializeAppearance(){const api=getDesktopClient();if(api?.initialAppearance)accept(api.initialAppearance);else render();usePlugins.subscribe((state,previous)=>{if(state.settings!==previous.settings)render()});api?.subscribe(event=>{if(event.type==='appearance:changed')accept(event.appearance);if(event.type==='appearance:flush')void flushAppearance()});void api?.request('getAppearance',undefined).then(accept).catch(error=>useAppearance.setState({error:errorText(error),status:'error'}))}
export function previewAppearance(patch:AppearancePatch){pending=merge(pending,patch);dirty(true);useAppearance.setState({status:'saving',error:''});render();clearTimeout(timer);timer=setTimeout(()=>void flushAppearance(),150)}
async function flushOnce(){clearTimeout(timer);if(saving)return;const api=getDesktopClient();if(!api||!Object.keys(pending).length)return;saving=true;inFlight=pending;pending={};useAppearance.setState({status:'saving',error:''});try{let value:AppearanceSnapshot;try{value=await api.request('updateAppearance',{patch:inFlight,expectedRevision:useAppearance.getState().snapshot.revision})}catch(error){if(!String(error).includes('APPEARANCE_CONFLICT'))throw error;accept(await api.request('getAppearance',undefined));value=await api.request('updateAppearance',{patch:inFlight,expectedRevision:useAppearance.getState().snapshot.revision})}inFlight={};accept(value);if(!Object.keys(pending).length){useAppearance.setState({status:'saved'});dirty(false)}}catch(error){pending=merge(inFlight,pending);inFlight={};useAppearance.setState({status:'error',error:errorText(error)});render()}finally{saving=false}}
export async function appearanceAction(method:'importAppearanceBackground'|'removeAppearanceBackground'|'resetAppearance'){await flushAppearance();if(saving||useAppearance.getState().status==='error')return;useAppearance.setState({status:'saving',error:''});dirty(true);try{const value=await getDesktopClient()!.request(method,undefined);if(value)accept(value);useAppearance.setState({status:'saved'});dirty(false)}catch(error){useAppearance.setState({status:'saved',error:errorText(error)});dirty(false)}}

export function flushAppearance():Promise<void>{clearTimeout(timer);if(savePromise)return savePromise;savePromise=(async()=>{do{await flushOnce()}while(Object.keys(pending).length&&useAppearance.getState().status!=='error')})().finally(()=>{savePromise=undefined});return savePromise}

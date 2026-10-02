/*
 * [INPUT]: 原工具栏布局、专用 preload 与主进程网页事实。
 * [OUTPUT]: 普通浏览器地址栏/返回/前进/刷新/停止加载和员工归属；X直接关闭窗口，无控制权菜单、状态文案或菜单尺寸变化，错误仍可见。
 * [POS]: src/renderer/browser-toolbar.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
// Apache-2.0; adapted from Craft Docs Ltd. apps/electron/src/renderer/browser-toolbar.tsx; src/main/browser/NOTICE.txt.
import React, { useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserControls } from '@/components/browser/BrowserControls'
import { X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import './styles/global.css'
import './components/browser/browser-ui.css'
interface ToolbarState { url:string; title:string; isLoading:boolean; canGoBack:boolean; canGoForward:boolean; themeColor?:string|null; isDark?:boolean; agentName?:string; conversationTitle?:string }
declare global { interface Window { browserToolbar: {
  instanceId:string; getState:()=>Promise<void>
  navigate:(url:string)=>Promise<void>; goBack:()=>Promise<void>; goForward:()=>Promise<void>; reload:()=>Promise<void>; stop:()=>Promise<void>
  closeWindowEntirely:()=>Promise<void>
  onStateUpdate:(callback:(state:ToolbarState)=>void)=>()=>void; onThemeColor:(callback:(color:string|null)=>void)=>()=>void
} } }
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')
function BrowserToolbarApp() {
  const [state,setState]=useState<ToolbarState>({url:'about:blank',title:'新网页',isLoading:false,canGoBack:false,canGoForward:false})
  const [themeColor,setThemeColor]=useState<string|null>(null), [error,setError]=useState('')
  const api=window.browserToolbar
  useEffect(()=>{ if(!api)return; const remove=api.onStateUpdate(next=>{setState(next);setThemeColor(next.themeColor??null);if(next.isDark!==undefined)document.documentElement.classList.toggle('dark',next.isDark)});void api.getState().catch(e=>setError(String(e)));return remove },[api])
  useEffect(()=>api?.onThemeColor(setThemeColor),[api])
  const run=useCallback(async(action:()=>Promise<void>)=>{setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:String(e))}},[])
  return <><BrowserControls url={state.url} loading={state.isLoading} canGoBack={state.canGoBack} canGoForward={state.canGoForward} onNavigate={url=>void run(()=>api.navigate(url))} onGoBack={()=>void run(api.goBack)} onGoForward={()=>void run(api.goForward)} onReload={()=>void run(api.reload)} onStop={()=>void run(api.stop)} themeColor={themeColor} urlBarClassName="max-w-[600px]" className="titlebar-drag-region bg-background" trailingContent={<div className="ml-2 flex items-center gap-1.5 titlebar-no-drag"><span className="max-w-40 truncate text-xs" title={`${state.agentName??''} · ${state.conversationTitle??''}`}>{state.agentName}</span><Button variant="ghost" size="icon-sm" aria-label="关闭浏览器" title="关闭浏览器" onClick={()=>void run(api.closeWindowEntirely)}><X className="size-3.5" /></Button></div>} />{error&&<div role="alert" className="fixed inset-x-0 top-12 z-50 bg-destructive px-3 py-2 text-xs text-destructive-foreground titlebar-no-drag">{error}</div>}</>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserToolbarApp /></React.StrictMode>)

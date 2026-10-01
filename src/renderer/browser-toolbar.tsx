/*
 * [INPUT]: 原工具栏布局、专用 preload 与主进程控制事实。
 * [OUTPUT]: 保留地址栏/菜单高度与加载视觉；真实接管/交还/停止/清登录资料，失败保留可核对状态。
 * [POS]: src/renderer/browser-toolbar.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
// Apache-2.0; adapted from Craft Docs Ltd. apps/electron/src/renderer/browser-toolbar.tsx; src/main/browser/NOTICE.txt.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserControls } from '@/components/browser/BrowserControls'
import { EyeOff, X, OctagonXIcon } from '@/components/icons'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { BrowserWindowState } from '@shared/ipc/browser'
import './styles/global.css'
import './components/browser/browser-ui.css'
interface ToolbarState { url:string; title:string; isLoading:boolean; canGoBack:boolean; canGoForward:boolean; themeColor?:string|null; isDark?:boolean; state?:BrowserWindowState; agentName?:string; conversationTitle?:string }
declare global { interface Window { browserToolbar: {
  instanceId:string; getState:()=>Promise<void>; control:(action:'take'|'resume'|'stop'|'clear')=>Promise<void>
  navigate:(url:string)=>Promise<void>; goBack:()=>Promise<void>; goForward:()=>Promise<void>; reload:()=>Promise<void>; stop:()=>Promise<void>
  setMenuGeometry:(open:boolean,height?:number)=>Promise<void>; hideWindow:()=>Promise<void>; closeWindowEntirely:()=>Promise<void>
  onStateUpdate:(callback:(state:ToolbarState)=>void)=>()=>void; onThemeColor:(callback:(color:string|null)=>void)=>()=>void; onForceCloseMenu:(callback:(payload:{reason?:string})=>void)=>()=>void
} } }
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')
function BrowserToolbarApp() {
  const [state,setState]=useState<ToolbarState>({url:'about:blank',title:'新网页',isLoading:false,canGoBack:false,canGoForward:false})
  const [themeColor,setThemeColor]=useState<string|null>(null), [open,setOpen]=useState(false), [error,setError]=useState(''), [busy,setBusy]=useState(false)
  const menu=useRef<HTMLDivElement|null>(null), api=window.browserToolbar
  useEffect(()=>{ if(!api)return; const remove=api.onStateUpdate(next=>{setState(next);setThemeColor(next.themeColor??null);if(next.isDark!==undefined)document.documentElement.classList.toggle('dark',next.isDark)});void api.getState().catch(e=>setError(String(e)));return remove },[api])
  useEffect(()=>api?.onThemeColor(setThemeColor),[api])
  useEffect(()=>api?.onForceCloseMenu(()=>setOpen(false)),[api])
  useEffect(()=>{if(!api)return;if(!open){void api.setMenuGeometry(false,0);return}void api.setMenuGeometry(true,300);const measure=()=>{void api.setMenuGeometry(true,Math.ceil(menu.current?.getBoundingClientRect().height??300))};const frame=requestAnimationFrame(measure), observer=new ResizeObserver(measure);if(menu.current)observer.observe(menu.current);return()=>{cancelAnimationFrame(frame);observer.disconnect();void api.setMenuGeometry(false,0)}},[api,open])
  const run=useCallback(async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}},[])
  const controlling=state.state?.control==='agent-controlled'||state.state?.control==='draining'||state.state?.control==='closing'
  const badge=state.state?.control==='draining'?'正在交接':state.state?.control==='user-controlled'?'由你操作':state.state?.control==='agent-controlled'?'员工操作中':''
  return <><BrowserControls url={state.url} loading={state.isLoading} canGoBack={!controlling&&state.canGoBack} canGoForward={!controlling&&state.canGoForward} onNavigate={url=>void run(()=>api.navigate(url))} onGoBack={()=>void run(api.goBack)} onGoForward={()=>void run(api.goForward)} onReload={()=>void run(api.reload)} onStop={()=>void run(api.stop)} themeColor={themeColor} urlBarClassName="max-w-[600px]" className="titlebar-drag-region bg-background" trailingContent={<div className="ml-2 flex items-center gap-1.5 titlebar-no-drag"><span className="max-w-40 truncate text-xs" title={`${state.agentName??''} · ${state.conversationTitle??''}`}>{state.agentName} {badge}</span><DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="浏览器窗口菜单" disabled={busy}><X className="size-3.5" /></Button>} /><DropdownMenuContent ref={menu} align="end" sideOffset={6} className="titlebar-no-drag min-w-44 max-h-none overflow-visible"><DropdownMenuItem disabled={busy||controlling&&state.state?.control!=='agent-controlled'} onClick={()=>void run(()=>api.control('take'))}>我来操作</DropdownMenuItem><DropdownMenuItem disabled={busy||state.state?.control!=='user-controlled'} onClick={()=>void run(()=>api.control('resume'))}>交还员工</DropdownMenuItem><DropdownMenuItem disabled={busy||!state.state?.workId} onClick={()=>void run(()=>api.control('stop'))}>停止当前任务</DropdownMenuItem><DropdownMenuItem onClick={()=>void run(api.hideWindow)}><EyeOff className="size-3.5" />隐藏窗口</DropdownMenuItem><DropdownMenuItem disabled={busy} onClick={()=>void run(()=>api.control('clear'))}>清除本会话登录资料</DropdownMenuItem><DropdownMenuItem variant="destructive" disabled={busy} onClick={()=>void run(api.closeWindowEntirely)}><OctagonXIcon className="size-3.5" />彻底关闭浏览器</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>} />{error&&<div role="alert" className="fixed inset-x-0 top-12 z-50 bg-destructive px-3 py-2 text-xs text-destructive-foreground titlebar-no-drag">{error}</div>}</>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserToolbarApp /></React.StrictMode>)

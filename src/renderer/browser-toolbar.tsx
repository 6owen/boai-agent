/*
 * [OUTPUT]: Cookie菜单列本机profile及文件入口/刷新，Main展开工具栏透明覆盖后再绘制；收起/失焦/导入前恢复原高度。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 原工具栏布局、专用 preload 与主进程网页事实。
 * [OUTPUT]: 内置浏览器工具栏不显示员工/会话归属，正常导航与直接关闭保留。
 * [OUTPUT]: 普通地址栏/返回/前进/刷新/停止加载与X关闭保持；Cookie菜单按需展开原工具栏覆盖，错误沿Sonner。
 * [POS]: src/renderer/browser-toolbar.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
// Apache-2.0; adapted from Craft Docs Ltd. apps/electron/src/renderer/browser-toolbar.tsx; src/main/browser/NOTICE.txt.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { BrowserCookieImportReply, BrowserCookieSource, BrowserCookieSourceList } from '../shared/ipc/browser'
import { createRoot } from 'react-dom/client'
import { BrowserControls } from '@/components/browser/BrowserControls'
import { X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { showErrorToast } from '@/components/common/error-feedback'
import './styles/global.css'
import './components/browser/browser-ui.css'
interface ToolbarState { url:string; title:string; isLoading:boolean; canGoBack:boolean; canGoForward:boolean; themeColor?:string|null; isDark?:boolean }
declare global { interface Window { browserToolbar: {
  instanceId:string; getState:()=>Promise<void>
  navigate:(url:string)=>Promise<void>; goBack:()=>Promise<void>; goForward:()=>Promise<void>; reload:()=>Promise<void>; stop:()=>Promise<void>
  closeWindowEntirely:()=>Promise<void>; importCookies:(sourceId?:string)=>Promise<BrowserCookieImportReply>
  listCookieSources:(refresh?:boolean)=>Promise<BrowserCookieSourceList>; setCookieMenuOpen:(open:boolean)=>Promise<void>; onCookieMenuDismiss:(callback:()=>void)=>()=>void
  onStateUpdate:(callback:(state:ToolbarState)=>void)=>()=>void; onThemeColor:(callback:(color:string|null)=>void)=>()=>void
} } }
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'
function BrowserToolbarApp() {
  const [state,setState]=useState<ToolbarState>({url:'about:blank',title:'新网页',isLoading:false,canGoBack:false,canGoForward:false})
  const [themeColor,setThemeColor]=useState<string|null>(null)
  const [importing,setImporting]=useState(false)
  const [menuOpen,setMenuOpen]=useState(false)
  const [sources,setSources]=useState<BrowserCookieSource[]|null>(null)
  const [loadingSources,setLoadingSources]=useState(false)
  const [sourcesFailed,setSourcesFailed]=useState(false)
  const menuGeneration=useRef(0), sourceGeneration=useRef(0), importingRef=useRef(false)
  const api=window.browserToolbar
  useEffect(()=>{ if(!api)return; const remove=api.onStateUpdate(next=>{setState(next);setThemeColor(next.themeColor??null);if(next.isDark!==undefined)document.documentElement.classList.toggle('dark',next.isDark)});void api.getState().catch(e=>showErrorToast(String(e)));return remove },[api])
  useEffect(()=>api?.onThemeColor(setThemeColor),[api])
  const run=useCallback(async(action:()=>Promise<void>)=>{try{await action()}catch(e){showErrorToast(e instanceof Error?e.message:String(e))}},[])
  const loadSources=useCallback(async(refresh=false)=>{
    const generation=++sourceGeneration.current;setLoadingSources(true);setSourcesFailed(false)
    try{const values=await api.listCookieSources(refresh);if(sourceGeneration.current===generation){setSources(values.sources);if(values.warning)showErrorToast(values.warning)}}
    catch(e){if(sourceGeneration.current===generation){setSourcesFailed(true);showErrorToast(e instanceof Error?e.message:String(e))}}
    finally{if(sourceGeneration.current===generation)setLoadingSources(false)}
  },[api])
  const changeMenu=useCallback(async(open:boolean)=>{
    const generation=++menuGeneration.current
    if(!open)setMenuOpen(false)
    try{await api.setCookieMenuOpen(open);if(menuGeneration.current!==generation)return;if(open){setMenuOpen(true);void loadSources()}}
    catch(e){if(menuGeneration.current===generation)setMenuOpen(false);showErrorToast(e instanceof Error?e.message:String(e))}
  },[api,loadSources])
  useEffect(()=>api?.onCookieMenuDismiss(()=>{menuGeneration.current++;setMenuOpen(false)}),[api])
  useEffect(()=>()=>{menuGeneration.current++;sourceGeneration.current++;void api?.setCookieMenuOpen(false).catch(()=>{})},[api])
  const importCookies=useCallback(async(sourceId?:string)=>{
    if(importingRef.current)return;importingRef.current=true;setImporting(true);menuGeneration.current++;setMenuOpen(false)
    try{await api.setCookieMenuOpen(false);await api.importCookies(sourceId)}
    catch(e){showErrorToast(e instanceof Error?e.message:String(e))}
    finally{importingRef.current=false;setImporting(false)}
  },[api])
  return <><BrowserControls url={state.url} loading={state.isLoading} canGoBack={state.canGoBack} canGoForward={state.canGoForward} onNavigate={url=>void run(()=>api.navigate(url))} onGoBack={()=>void run(api.goBack)} onGoForward={()=>void run(api.goForward)} onReload={()=>void run(api.reload)} onStop={()=>void run(api.stop)} themeColor={themeColor} urlBarClassName="max-w-[600px]" className="titlebar-drag-region bg-background" trailingContent={<div className="ml-2 flex items-center gap-1.5 titlebar-no-drag">
    <DropdownMenu open={menuOpen} onOpenChange={open=>void changeMenu(open)}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="导入 Cookie" title="从本机浏览器或文件导入 Cookie" disabled={importing} />}><i aria-hidden="true" className={`app-icon size-3.5 ${importing?'i-solar-refresh-linear animate-spin':'i-carbon-document-import'}`} /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 titlebar-no-drag">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={()=>void importCookies()}><i aria-hidden="true" className="app-icon i-carbon-document-import size-4" />从文件导入…</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {loadingSources&&<DropdownMenuItem disabled aria-label="正在读取浏览器资料"><i aria-hidden="true" className="app-icon i-solar-refresh-linear size-4 animate-spin" /></DropdownMenuItem>}
          {!loadingSources&&!sourcesFailed&&sources?.length===0&&<DropdownMenuItem disabled>未找到可导入的浏览器资料</DropdownMenuItem>}
          {!loadingSources&&!sourcesFailed&&sources?.map(source=><DropdownMenuItem key={source.id} onClick={()=>void importCookies(source.id)}><i aria-hidden="true" className="app-icon i-carbon-browser size-4 shrink-0" /><span className="truncate">{source.label}</span></DropdownMenuItem>)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup><DropdownMenuItem disabled={loadingSources} closeOnClick={false} onClick={()=>void loadSources(true)}><i aria-hidden="true" className="app-icon i-solar-refresh-linear size-4" />刷新浏览器列表</DropdownMenuItem></DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button variant="ghost" size="icon-sm" aria-label="关闭浏览器" title="关闭浏览器" onClick={()=>void run(api.closeWindowEntirely)}><X className="size-3.5" /></Button></div>} /><Toaster position="top-center" offset={4} theme={state.isDark ? 'dark' : 'light'} /></>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserToolbarApp /></React.StrictMode>)

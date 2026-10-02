/*
 * [INPUT]: 原浏览器紧凑徽标交互、获准会话的宿主状态和用户控制意图。
 * [OUTPUT]: 纯人工窗口无任务时禁用交还员工，不制造运行身份；显示真实归属/交接/关闭状态，成功回执前不乐观移除实例。
 * [POS]: src/renderer/components/browser/BrowserTabStrip.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
// Apache-2.0; adapted from Craft Docs Ltd. apps/electron/src/renderer/components/browser/BrowserTabStrip.tsx; src/main/browser/NOTICE.txt.
import { useState } from 'react'
import { BrowserTabBadge } from './BrowserTabBadge'
import { DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import type { BrowserWindowState,BrowserControlAction } from '@shared/ipc/browser'
export interface BrowserTabStripProps { states:BrowserWindowState[]; onAction:(scopeKey:string,action:BrowserControlAction)=>Promise<void> }
export function BrowserTabStrip({states,onAction}:BrowserTabStripProps){
 const [pending,setPending]=useState<string>(),[error,setError]=useState('')
 const run=async(state:BrowserWindowState,action:BrowserControlAction)=>{setPending(state.scopeKey);setError('');try{await onAction(state.scopeKey,action)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setPending(undefined)}}
 return <div className="flex min-w-0 items-center gap-1" data-testid="browser-window-strip">{states.filter(state=>state.control!=='closed').map(state=><DropdownMenu key={state.instanceId}><DropdownMenuTrigger render={<BrowserTabBadge instance={state} isActive={state.isVisible} disabled={pending===state.scopeKey} />} /><DropdownMenuContent align="end"><DropdownMenuLabel>{state.agentName??'员工'} · {state.control==='draining'?'正在交接':state.control==='closing'?'正在关闭':state.control==='user-controlled'?'由你操作':'浏览器'}</DropdownMenuLabel><DropdownMenuItem onClick={()=>void run(state,'show')}>查看浏览器</DropdownMenuItem><DropdownMenuItem disabled={state.control==='draining'||state.control==='closing'} onClick={()=>void run(state,'take')}>我来操作</DropdownMenuItem><DropdownMenuItem disabled={state.control!=='user-controlled'||!state.workId||!state.runId} onClick={()=>void run(state,'resume')}>交还员工</DropdownMenuItem><DropdownMenuItem onClick={()=>void run(state,'hide')}>隐藏窗口</DropdownMenuItem><DropdownMenuItem onClick={()=>void run(state,'clear')}>清除本会话登录资料</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={()=>void run(state,'close')}>彻底关闭浏览器</DropdownMenuItem></DropdownMenuContent></DropdownMenu>)}{error&&<span role="alert" className="max-w-40 truncate text-xs text-destructive" title={error}>{error}</span>}</div>
}

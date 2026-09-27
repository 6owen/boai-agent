/*
 * [INPUT]: 页面业务状态与统一 UI 基础组件、统一 UI 基础组件。
 * [OUTPUT]: 保持原有交互的 Soft UI 页面控件。
 * [POS]: src/renderer/pages/conversations/-components/external-files.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { getDesktopClient } from '@/services/request/desktop-client'
import { Banner, useMutation } from '@/components/common'
export function ExternalFiles({runId}:{runId:string}){const [files,setFiles]=useState<{directory:string;files:{name:string;relativePath:string}[]}>(),[notice,setNotice]=useState(''),{busy,error,run}=useMutation(),api=getDesktopClient()!;return <section className="external-files"><Button variant="secondary" size="sm" onClick={()=>void run(async()=>setFiles(await api.request('listExternalFiles',{runId})))}>查看外部任务文件</Button>{error&&<Banner>{error}</Banner>}{notice&&<p role="status">{notice}</p>}{files&&<><p className="field-hint">外部程序的文件尚未自动发布。只会复制你选择的文件到本会话。</p>{files.files.map(f=><div className="button-row" key={f.relativePath}><span>{f.name}</span><Button disabled={busy} variant="secondary" size="sm" onClick={()=>void run(async()=>{await api.request('publishExternalArtifact',{runId,relativePath:f.relativePath});setNotice(`已发布 ${f.name}`)})}>发布到会话</Button></div>)}<Button variant="secondary" size="sm" onClick={()=>void run(async()=>api.request('openPath',{path:files.directory}))}>打开任务目录</Button></>}</section>}

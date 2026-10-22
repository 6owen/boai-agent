/*
 * [INPUT]: 公共示例目录、BOAI组件及共享字体/主题。
 * [OUTPUT]: 按需加载的独立文档预览与真实源码。
 * [POS]: 设计站展示层，无业务API。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@boai/ui/button'
import { typographyControls, type TypographyGroup } from '@boai/tokens'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { exampleSource } from './examples'
export async function copyText(text: string) {
 try { await navigator.clipboard.writeText(text); toast.success('已复制') }
 catch { toast.error('复制失败，请选中内容后手动复制。') }
}
export function CodeSample({ code, label = 'React' }: { code: string; label?: string }) {
 return <div className="code-sample"><div className="code-header"><span>{label}</span><Button variant="ghost" size="sm" onClick={() => void copyText(code)}>复制</Button></div><pre><code>{code}</code></pre></div>
}
function PreviewFrame({ url, mode, label }: { url: string; mode: string; label: string }) {
 const frame = useRef<HTMLIFrameElement>(null), [height,setHeight] = useState(480)
 useEffect(() => {
  const receive = (event: MessageEvent) => {
   if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== 'boai:preview-size' || !Number.isFinite(event.data.height)) return
   setHeight(Math.max(360, Math.min(1800, event.data.height)))
  }
  window.addEventListener('message', receive)
  return () => window.removeEventListener('message', receive)
 }, [])
 return <div className={`preview-frame ${mode}`}><span className="preview-mode-label">{mode === 'light' ? '浅色' : '深色'} · <a href={url} target="_blank" rel="noreferrer">独立打开 ↗</a></span><iframe ref={frame} title={`${label} · ${mode === 'light' ? '浅色' : '深色'}`} src={url} style={{ height }} loading="lazy" /></div>
}
export function Preview({ name, label }: { name: string; label: string }) {
 const { resolvedTheme } = useTheme()
 const [both,setBoth] = useState(false), [narrow,setNarrow] = useState(false), [source,setSource] = useState(''), [sourceOpen,setSourceOpen] = useState(false)
 const [sizes,setSizes] = useState<Record<TypographyGroup, number>>({ui:typographyControls.ui.defaultSize, content:typographyControls.content.defaultSize, code:typographyControls.code.defaultSize})
 useEffect(() => { if (!sourceOpen) return; let active=true; void exampleSource(name).then(value => { if(active) setSource(value) }); return () => { active=false } }, [name,sourceOpen])
 return <section className="component-preview" aria-label={`${label}交互预览`}><div className="preview-toolbar"><span>交互预览</span><div className="preview-options">{(['ui','content','code'] as const).map(key => <label className="preview-size" key={key}>{({ui:'UI',content:'正文',code:'代码'})[key]}<input type="range" aria-label={`预览${({ui:'UI',content:'正文',code:'代码'})[key]}字号`} min={typographyControls[key].min} max={typographyControls[key].max} step={typographyControls[key].step} value={sizes[key]} onChange={event => setSizes({...sizes,[key]:Number(event.currentTarget.value)})} /><output>{sizes[key]}</output></label>)}<Button variant="ghost" size="xs" aria-pressed={narrow} onClick={() => setNarrow(!narrow)}>窄屏</Button><Button variant="ghost" size="xs" aria-pressed={both} onClick={() => setBoth(!both)}>明暗对照</Button></div></div><div className="preview-frames" data-both={both} data-narrow={narrow}>{(both ? ['light','dark'] : [resolvedTheme === 'dark' ? 'dark' : 'light']).map(mode => <PreviewFrame key={mode} mode={mode} label={label} url={`/preview?${new URLSearchParams({example:name,mode,ui:String(sizes.ui),content:String(sizes.content),code:String(sizes.code)})}`} />)}</div><details className="preview-source" onToggle={event => setSourceOpen(event.currentTarget.open)}><summary>查看源码</summary>{sourceOpen && (source ? <CodeSample code={source} /> : <p>加载源码…</p>)}</details></section>
}

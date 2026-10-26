/*
 * [INPUT]: 宿主核对后的文本文件、显示格式/语言、可选 Markdown 引用渲染与来源行。
 * [OUTPUT]: Markdown预览/源码图标切换、Shiki文本高亮；正文留白与贴边滚动容器分离，无行号栏但保留来源定位，不执行HTML/SVG。
 * [POS]: 全局file-preview的文本渲染器，不读取本机路径或处理业务操作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CodeBlock } from '@/components/ui/code-block'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Eye, Terminal } from '@/components/icons'
import { Markdown } from '../markdown'
import { FilePreviewHeader } from './header'

export function TextFilePreview({ name, text, kind = 'text', language, line, markdown, header }: {
  name: string; text: string; kind?: 'markdown' | 'code' | 'text'; language?: string; line?: number; markdown?: ReactNode; header?(toggle: ReactNode): ReactNode
}) {
  const [mode, setMode] = useState(line === undefined ? 'preview' : 'source')
  const selectedLine = line
  const contentRef = useRef<HTMLDivElement>(null)
  const lines = text.split(/\r\n?|\n/).length
  const validLine = selectedLine !== undefined && Number.isInteger(selectedLine) && selectedLine > 0 && selectedLine <= lines
  useEffect(() => { setMode(line === undefined ? 'preview' : 'source') }, [name, text, line])
  useEffect(() => {
    if (!validLine || !contentRef.current?.clientHeight) return
    contentRef.current.querySelector<HTMLElement>(`[data-file-line="${selectedLine}"]`)?.scrollIntoView({ block: 'center' })
  }, [name, text, selectedLine, mode, validLine])
  const source = <CodeBlock code={text} language={language ?? (kind === 'markdown' ? 'markdown' : undefined)} lineAnchors selectedLine={validLine ? selectedLine : undefined} />
  const toggleLabel = mode === 'preview' ? '显示源码' : '显示预览'
  const toggle = kind === 'markdown' ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={toggleLabel} onClick={() => setMode(value => value === 'preview' ? 'source' : 'preview')} />}>{mode === 'preview' ? <Terminal /> : <Eye />}</TooltipTrigger><TooltipContent>{toggleLabel}</TooltipContent></Tooltip> : null
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-label={`文件预览 ${name}`} data-file-preview-kind={kind}>
    {header ? header(toggle) : <FilePreviewHeader name={name}>{toggle}</FilePreviewHeader>}
    <ScrollFade ref={contentRef} className="file-preview-scroll min-h-0 flex-1">
      <div className="file-preview-scroll-content">
        {kind === 'markdown' && mode === 'preview' ? <div className="markdown p-1">{markdown ?? <Markdown>{text}</Markdown>}</div> : source}
      </div>
    </ScrollFade>
    {line !== undefined && !validLine && <p role="status" className="field-hint">指定行号已超出当前文件范围。</p>}
  </section>
}

/*
 * [INPUT]: 宿主核对后的文本文件、显示格式/语言、可选 Markdown 引用渲染与来源行。
 * [OUTPUT]: Markdown 默认排版及源码切换、Shiki 代码/纯文本行号与来源定位；HTML/SVG 始终作为文本，不加载外部资源。
 * [POS]: 聊天附件与交付文件共用的只读内容预览，不读取本机路径或处理业务操作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CodeBlock } from '@/components/ui/code-block'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Markdown } from './markdown'

export function TextFilePreview({ name, text, kind = 'text', language, line, markdown }: {
  name: string; text: string; kind?: 'markdown' | 'code' | 'text'; language?: string; line?: number; markdown?: ReactNode
}) {
  const [mode, setMode] = useState(line === undefined ? 'preview' : 'source')
  const [selectedLine, setSelectedLine] = useState(line)
  const contentRef = useRef<HTMLDivElement>(null)
  const lines = text.split(/\r\n?|\n/).length
  const validLine = selectedLine !== undefined && Number.isInteger(selectedLine) && selectedLine > 0 && selectedLine <= lines
  useEffect(() => { setSelectedLine(line); setMode(line === undefined ? 'preview' : 'source') }, [name, text, line])
  useEffect(() => {
    if (!validLine || !contentRef.current?.clientHeight) return
    contentRef.current.querySelector<HTMLElement>(`[data-file-line="${selectedLine}"]`)?.scrollIntoView({ block: 'center' })
  }, [name, text, selectedLine, mode, validLine])
  const source = <CodeBlock code={text} language={language ?? (kind === 'markdown' ? 'markdown' : undefined)} lineNumbers selectedLine={validLine ? selectedLine : undefined} onLineSelect={setSelectedLine} />
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-label={`文件预览 ${name}`} data-file-preview-kind={kind}>
    {kind === 'markdown' ? <Tabs value={mode} onValueChange={setMode} className="min-h-0 flex-1">
      <div className="flex items-center justify-between gap-2"><TabsList aria-label="文件显示方式"><TabsTrigger value="preview">预览</TabsTrigger><TabsTrigger value="source">源码</TabsTrigger></TabsList><span className="field-hint">Markdown · {lines} 行</span></div>
      <ScrollFade ref={contentRef} className="min-h-0 flex-1">
        <TabsContent value="preview" className="markdown p-1">{markdown ?? <Markdown>{text}</Markdown>}</TabsContent>
        <TabsContent value="source">{source}</TabsContent>
      </ScrollFade>
    </Tabs> : <><p className="field-hint">{language ?? '纯文本'} · {lines} 行</p><ScrollFade ref={contentRef} className="min-h-0 flex-1">{source}</ScrollFade></>}
    {line !== undefined && !validLine && <p role="status" className="field-hint">指定行号已超出当前文件范围。</p>}
  </section>
}

/*
 * [INPUT]: 宿主复核后的材料、UTF-8 原文或图片data URI、加载/错误状态和可选文本来源行号。
 * [OUTPUT]: 带稳定来源身份/解析版本/hash的文本行号、静态图片或文件元信息预览；二进制不虚构正文/行号，不执行HTML/SVG，失效/失败不显示旧内容。
 * [POS]: 会话材料独立详情标签的只读预览面板；不执行 Markdown 链接、不直接读取本机路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { MaterialPreview } from '@shared/domain/materials'
import { sizeText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { materialDisplayName, materialErrorText, materialFormatLabel, materialImageUrl, materialStatusLabels } from './material-draft'

interface MaterialPreviewPanelProps {
  preview?: MaterialPreview
  loading?: boolean
  error?: string
  line?: number
}

export function MaterialPreviewPanel({ preview, loading, error, line }: MaterialPreviewPanelProps) {
  const [selectedLine, setSelectedLine] = useState(line)
  const [failedImage, setFailedImage] = useState<string>()
  const contentRef = useRef<HTMLDivElement>(null)
  const material = preview?.material
  useEffect(() => { setSelectedLine(line) }, [material?.id, material?.revision, line])
  useEffect(() => {
    if (!selectedLine || loading || error || material?.status !== 'ready' || !contentRef.current?.clientHeight) return
    const target = contentRef.current.querySelector<HTMLElement>(`[data-material-line="${selectedLine}"]`)
    target?.scrollIntoView({ block: 'center' })
  }, [material?.id, material?.revision, selectedLine, loading, error])

  if (loading) return <p role="status" className="field-hint">正在载入材料…</p>
  if (error) return <p role="alert" className="field-hint text-destructive">{materialErrorText(error)}</p>
  if (!preview || !material) return <p className="field-hint">选择材料以查看内容。</p>
  if (material.status !== 'ready') return <section aria-label="材料不可用"><h3>{materialDisplayName(material.name)}</h3><p role="status" className="field-hint">{materialStatusLabels[material.status]}。{material.status === 'preparing' ? '材料准备完成后可查看原文。' : materialErrorText(material.error)}</p></section>

  const textMaterial = material.format === 'txt' || material.format === 'markdown'
  const lines = textMaterial ? preview.text.split('\n') : []
  const imageUrl = materialImageUrl(preview)
  const validLine = selectedLine !== undefined && Number.isInteger(selectedLine) && selectedLine > 0 && selectedLine <= lines.length
  return <section className="flex h-full min-h-0 min-w-0 flex-col gap-3" aria-label={`${textMaterial ? '材料原文' : material.format === 'image' ? '材料图片' : '材料文件'} ${materialDisplayName(material.name)}`} data-material-preview-id={material.id}>
    <header className="min-w-0">
      <h3 className="break-words font-medium">{materialDisplayName(material.name)}</h3>
      <p className="field-hint">{materialFormatLabel(material.format)} · {sizeText(material.size)}{textMaterial && ` · ${lines.length} 行`} · {materialStatusLabels[material.status]}</p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">材料来源与解析记录</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>来源 ID</dt><dd className="min-w-0 break-all"><code>{material.id}</code></dd>
          <dt>解析版本</dt><dd>{material.parseVersion}</dd>
          <dt>材料版本</dt><dd>{material.revision}</dd>
          <dt>内容 hash</dt><dd className="min-w-0 break-all"><code>{material.contentHash ?? '未记录'}</code></dd>
        </dl>
      </details>
      {validLine && <p role="status" className="mt-2 break-all text-xs text-muted-foreground">来源定位：<code>{material.id}:L{selectedLine}</code></p>}
      {textMaterial && selectedLine !== undefined && !validLine && <p role="status" className="field-hint">指定行号已超出当前材料范围，当前显示完整原文。</p>}
    </header>
    <ScrollFade ref={contentRef} className="min-h-0 flex-1 rounded-xl bg-card text-card-foreground soft-card" aria-label={textMaterial ? '带行号的材料原文' : material.format === 'image' ? '材料图片' : '文件信息'}>
      {textMaterial ? <div className="p-2 font-mono text-xs leading-6">
        {lines.map((text, index) => {
          const number = index + 1
          return <div key={number} data-material-line={number} className={`flex min-w-0 items-start gap-2 rounded${validLine && selectedLine === number ? ' bg-accent text-accent-foreground' : ''}`}>
            <Button variant="ghost" size="content" className="min-w-8 px-1 text-right text-xs text-muted-foreground" aria-label={`定位材料第 ${number} 行`} aria-pressed={validLine && selectedLine === number} onClick={() => setSelectedLine(number)}>{number}</Button>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{text || '\u00a0'}</span>
          </div>
        })}
      </div> : material.format === 'image' ? imageUrl && failedImage !== imageUrl ? <img src={imageUrl} alt={materialDisplayName(material.name)} className="max-h-full w-full object-contain p-2" draggable={false} onError={() => setFailedImage(imageUrl)} /> : <p role="status" className="field-hint p-3">图片预览暂不可用，请重新核对原件。</p> : <p className="field-hint p-3">{material.mimeType && `文件类型：${material.mimeType}。`}此文件保留原件，不提供文本预览。</p>}
    </ScrollFade>
  </section>
}

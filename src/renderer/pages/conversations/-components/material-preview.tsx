/*
 * [INPUT]: 宿主复核后的材料、独立文件预览或图片data URI、加载/错误状态和可选文本来源行号。
 * [OUTPUT]: Markdown 排版/源码切换、Shiki 代码与来源行定位、静态图片及不支持格式说明；预览不改变材料解析记录，不执行HTML/SVG，失效/失败不显示旧内容。
 * [POS]: 会话材料独立详情标签的只读预览面板；不执行 Markdown 链接、不直接读取本机路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { MaterialPreview } from '@shared/domain/materials'
import { sizeText } from '@/components/common'
import { TextFilePreview } from '@/components/common/file-preview'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { materialDisplayName, materialErrorText, materialFormatLabel, materialImageUrl, materialStatusLabels } from './material-draft'

interface MaterialPreviewPanelProps {
  preview?: MaterialPreview
  loading?: boolean
  error?: string
  line?: number
}

export function MaterialPreviewPanel({ preview, loading, error, line }: MaterialPreviewPanelProps) {
  const [failedImage, setFailedImage] = useState<string>()
  const material = preview?.material

  if (loading) return <p role="status" className="field-hint">正在载入材料…</p>
  if (error) return <p role="alert" className="field-hint text-destructive">{materialErrorText(error)}</p>
  if (!preview || !material) return <p className="field-hint">选择材料以查看内容。</p>
  if (material.status !== 'ready') return <section aria-label="材料不可用"><h3>{materialDisplayName(material.name)}</h3><p role="status" className="field-hint">{materialStatusLabels[material.status]}。{material.status === 'preparing' ? '材料准备完成后可查看原文。' : materialErrorText(material.error)}</p></section>

  const textMaterial = material.format === 'txt' || material.format === 'markdown'
  const file = preview.filePreview ?? (textMaterial ? { kind: material.format === 'markdown' ? 'markdown' as const : 'text' as const, text: preview.text } : undefined)
  const lines = file && file.kind !== 'unsupported' ? file.text.split(/\r\n?|\n/) : []
  const imageUrl = materialImageUrl(preview)
  const validLine = line !== undefined && Number.isInteger(line) && line > 0 && line <= lines.length
  return <section className="flex h-full min-h-0 min-w-0 flex-col gap-3" aria-label={`${textMaterial ? '材料原文' : material.format === 'image' ? '材料图片' : '材料文件'} ${materialDisplayName(material.name)}`} data-material-preview-id={material.id}>
    <header className="min-w-0">
      <h3 className="break-words font-medium">{materialDisplayName(material.name)}</h3>
      <p className="field-hint">{materialFormatLabel(material.format)} · {sizeText(material.size)}</p>
      {validLine && <p role="status" className="mt-2 break-all text-xs text-muted-foreground">来源定位：<code>{material.id}:L{line}</code></p>}
    </header>
    {file && file.kind !== 'unsupported' ? <TextFilePreview key={`${material.id}:${material.revision}`} name={materialDisplayName(material.name)} text={file.text} kind={file.kind} language={'language' in file ? file.language : undefined} line={line} /> : <ScrollFade className="min-h-0 flex-1 rounded-xl bg-card text-card-foreground soft-card" aria-label={material.format === 'image' ? '材料图片' : '文件信息'}>
      {material.format === 'image' ? imageUrl && failedImage !== imageUrl ? <img src={imageUrl} alt={materialDisplayName(material.name)} className="max-h-full w-full object-contain p-2" draggable={false} onError={() => setFailedImage(imageUrl)} /> : <p role="status" className="field-hint p-3">图片预览暂不可用，请重新核对原件。</p> : <p className="field-hint p-3">{file?.kind === 'unsupported' ? file.reason : '此文件暂不支持预览。'}</p>}
    </ScrollFade>}
      <details className="max-h-40 shrink-0 overflow-y-auto text-xs text-muted-foreground">
        <summary className="cursor-pointer">材料来源与解析记录</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>来源 ID</dt><dd className="min-w-0 break-all"><code>{material.id}</code></dd>
          <dt>解析版本</dt><dd>{material.parseVersion}</dd>
          <dt>材料版本</dt><dd>{material.revision}</dd>
          <dt>内容 hash</dt><dd className="min-w-0 break-all"><code>{material.contentHash ?? '未记录'}</code></dd>
        </dl>
      </details>
  </section>
}

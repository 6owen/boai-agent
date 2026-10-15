/*
 * [OUTPUT]: 选文及标题入口直接定位同一修改Popover，移除底部编辑区中转。
 * [OUTPUT]: 透传选文快捷要求给文件编辑宿主；预览不导航聊天。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 文本/PDF/Office/图片正文共用全局FilePreview，来源行和业务解析记录仍归材料页面。
 * [OUTPUT]: 材料文本共用文件标题/图标切换header，格式/大小收进标题提示；正文和来源定位保持。
 * [OUTPUT]: 宿主核源后的PDF/DOCX/XLSX/PPTX接Lody原查看器；正文仍只读，隐藏卸载二进制资源。
 * [OUTPUT]: 文件宿主可提供标题操作，修改产物直接打开；正文身份/查看器保持。
 * [INPUT]: 宿主复核后的材料、独立文件预览或图片data URI、加载/错误状态和可选文本来源行号。
 * [OUTPUT]: Markdown 排版/源码切换、Shiki 代码与来源行定位、静态图片及不支持格式说明；预览不改变材料解析记录，不执行HTML/SVG，失效/失败不显示旧内容。
 * [POS]: 会话材料独立详情标签的只读预览面板；不执行 Markdown 链接、不直接读取本机路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ReactNode } from 'react'
import type { FileEditAnnotation } from '@shared/domain/file-edit'
import type { ConversationMaterial, MaterialPreview } from '@shared/domain/materials'
import { sizeText } from '@/components/common'
import { FilePreview, FilePreviewHeader } from '@/components/common/file-preview'
import { materialDisplayName, materialErrorText, materialFormatLabel, materialImageUrl, materialStatusLabels } from './material-draft'

interface MaterialPreviewPanelProps {
  headerActions?: ReactNode
  onEdit?(material: ConversationMaterial, annotation: FileEditAnnotation, anchor: DOMRect): void
  preview?: MaterialPreview
  loading?: boolean
  error?: string
  line?: number
  active?: boolean
}

export function MaterialPreviewPanel({ preview, loading, error, line, active = true, onEdit, headerActions }: MaterialPreviewPanelProps) {
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
  const header = (toggle?: ReactNode) => <FilePreviewHeader name={materialDisplayName(material.name)} description={`${materialFormatLabel(material.format)} · ${sizeText(material.size)}${validLine ? ` · 来源定位：${material.id}:L${line}` : ''}`}>{headerActions}{toggle}</FilePreviewHeader>
  return <section className="flex h-full min-h-0 min-w-0 flex-col gap-3" aria-label={`${textMaterial ? '材料原文' : material.format === 'image' ? '材料图片' : '材料文件'} ${materialDisplayName(material.name)}`} data-material-preview-id={material.id}>
    <FilePreview key={`${material.id}:${material.revision}:${material.contentHash}`} name={materialDisplayName(material.name)} file={file} binary={preview.binaryPreview} image={material.format === 'image' ? { url: imageUrl } : undefined} active={active} line={line} header={header} onEdit={onEdit && material.messageId && material.contentHash ? (annotation, anchor) => onEdit(material, annotation, anchor) : undefined} />
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

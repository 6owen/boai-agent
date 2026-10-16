/*
 * [OUTPUT]: 选区校验错误走Sonner，不插入内联错误文字。
 * [OUTPUT]: 仅正文选区打开Selection Actions浮层；标题不再提供员工修改按钮，原模式切换/文件操作保持。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [INPUT]: 宿主已核验的文本/二进制/图片数据、活跃状态及可选header/引用渲染。
 * [OUTPUT]: 消费应用插件启停快照展示已核源内容；宿主保持标题/选区与活跃边界。
 * [POS]: 全局文件预览组合层；页面保留业务身份、读取与操作权限，不重复格式分发。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { ErrorToast } from '../error-feedback'
import { useRef, useState, type ReactNode } from 'react'
import { FILE_EDIT_QUOTE_LIMIT, type FileEditAnnotation } from '@shared/domain/file-edit'
import { previewSelection } from './selection'
import type { BinaryFilePreview, FilePreview as TextPreviewData } from '@shared/domain/file-preview'
import { FilePreviewHeader } from './header'
import { PreviewPluginView } from './plugin-view'
import { usePreviewRegistry } from './plugins/use-preview-registry'
import type { PreviewRegistry } from './plugins/registry'
import type { PreviewContent } from './plugins/types'

export { FilePreviewHeader } from './header'
export { TextFilePreview } from './text-preview'

export function FilePreview({ name, file, binary, image, active = true, line, markdown, header, onEdit, registry }: {
  name: string; file?: TextPreviewData; binary?: BinaryFilePreview; image?: { url?: string }
  onEdit?(annotation: FileEditAnnotation, anchor: DOMRect): void
  active?: boolean; line?: number; markdown?: ReactNode; header?(toggle?: ReactNode): ReactNode
  registry?: PreviewRegistry
}) {
  const managedRegistry = usePreviewRegistry()
  const root = useRef<HTMLDivElement>(null), [selectionError, setSelectionError] = useState('')
  if (!active) return null
  const capture = () => {
    if (!root.current || !onEdit) return
    const selected = window.getSelection()
    const tooLong = selected?.anchorNode && selected.focusNode && root.current.contains(selected.anchorNode) && root.current.contains(selected.focusNode) && selected.toString().trim().length > FILE_EDIT_QUOTE_LIMIT
    setSelectionError(tooLong ? `选中内容最多 ${FILE_EDIT_QUOTE_LIMIT} 字，请缩小选择范围。` : '')
    const annotation = previewSelection(root.current, selected)
    if (annotation && selected?.rangeCount) onEdit(annotation, selected.getRangeAt(0).getBoundingClientRect())
  }
  const title = (toggle?: ReactNode) => header ? header(toggle) : <FilePreviewHeader name={name}>{toggle}</FilePreviewHeader>
  const content: PreviewContent = binary ?? (file && file.kind !== 'unsupported' ? file : image ? { kind: 'image', url: image.url } : file ?? { kind: 'unsupported', text: '' })
  return <div ref={root} className="flex min-h-0 min-w-0 flex-1 flex-col" onMouseUp={event => { if (!(event.target as Element).closest('[data-slot="file-preview-header"], [data-file-preview-actions]')) capture() }} onKeyUp={event => { if (event.key === 'Shift' || event.key.startsWith('Arrow')) capture() }}>
    {selectionError && <ErrorToast>{selectionError}</ErrorToast>}
    <PreviewPluginView registry={registry ?? managedRegistry} name={name} content={content} active={active} line={line} markdown={markdown} header={title} />
  </div>
}

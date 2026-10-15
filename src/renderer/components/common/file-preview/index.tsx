/*
 * [OUTPUT]: 正文选区/标题按钮直接打开同一Selection Actions浮层，传递真实选区锚点；无中转操作或底部会话。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [INPUT]: 宿主已核验的文本/二进制/图片数据、活跃状态及可选header/引用渲染。
 * [OUTPUT]: 统一Markdown/代码/文本、PDF/Office、图片与不支持格式的只读预览入口。
 * [POS]: 全局文件预览组合层；页面保留业务身份、读取与操作权限，不重复格式分发。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useRef, useState, type ReactNode } from 'react'
import { FILE_EDIT_QUOTE_LIMIT, type FileEditAnnotation } from '@shared/domain/file-edit'
import { Button } from '@/components/ui/button'
import { previewSelection } from './selection'
import type { BinaryFilePreview, FilePreview as TextPreviewData } from '@shared/domain/file-preview'
import { FilePreviewHeader } from './header'
import { TextFilePreview } from './text-preview'
import { BinaryFileViewer } from './binary-preview'
import { ImageFilePreview } from './image-preview'

export { FilePreviewHeader } from './header'
export { TextFilePreview } from './text-preview'

export function FilePreview({ name, file, binary, image, active = true, line, markdown, header, onEdit }: {
  name: string; file?: TextPreviewData; binary?: BinaryFilePreview; image?: { url?: string }
  onEdit?(annotation: FileEditAnnotation, anchor: DOMRect): void
  active?: boolean; line?: number; markdown?: ReactNode; header?(toggle?: ReactNode): ReactNode
}) {
  const root = useRef<HTMLDivElement>(null), [selection, setSelection] = useState<FileEditAnnotation>(), [selectionError, setSelectionError] = useState('')
  if (!active) return null
  const capture = () => {
    if (!root.current || !onEdit) return
    const selected = window.getSelection()
    const tooLong = selected?.anchorNode && selected.focusNode && root.current.contains(selected.anchorNode) && root.current.contains(selected.focusNode) && selected.toString().trim().length > FILE_EDIT_QUOTE_LIMIT
    setSelectionError(tooLong ? `选中内容最多 ${FILE_EDIT_QUOTE_LIMIT} 字，请缩小范围或取消选择后填写位置。` : '')
    const annotation = previewSelection(root.current, selected)
    setSelection(annotation)
    if (annotation && selected?.rangeCount) onEdit(annotation, selected.getRangeAt(0).getBoundingClientRect())
  }
  const actions = (toggle?: ReactNode) => <>{toggle}{onEdit && <Button variant="ghost" size="sm" disabled={Boolean(selectionError)} onMouseDown={event => event.preventDefault()} onClick={event => onEdit(selection ?? {}, event.currentTarget.getBoundingClientRect())}>{selection?.quote ? '修改选中内容' : '让员工修改'}</Button>}</>
  const title = (toggle?: ReactNode) => header ? header(actions(toggle)) : <FilePreviewHeader name={name}>{actions(toggle)}</FilePreviewHeader>
  return <div ref={root} className="flex min-h-0 min-w-0 flex-1 flex-col" onMouseUp={event => { if (!(event.target as Element).closest('[data-slot="file-preview-header"], [data-file-preview-actions]')) capture() }} onKeyUp={event => { if (event.key === 'Shift' || event.key.startsWith('Arrow')) capture() }}>
    {selectionError && <p role="status" className="field-hint">{selectionError}</p>}
    {!binary && file && file.kind !== 'unsupported' ? <TextFilePreview name={name} text={file.text} kind={file.kind} language={file.language} line={line} markdown={markdown} header={title} /> : <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-label={`文件预览 ${name}`} data-file-preview-kind={binary?.kind ?? (image ? 'image' : 'unsupported')}>
      {title()}
      {binary ? <BinaryFileViewer preview={binary} name={name} active={active} /> : image ? <ImageFilePreview name={name} url={image.url} /> : <p className="field-hint">{file?.reason ?? '此文件暂不支持预览。'}</p>}
    </section>}
  </div>
}

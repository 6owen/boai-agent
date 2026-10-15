/*
 * [INPUT]: 已核源Office字节及文件名和宿主标题。
 * [OUTPUT]: 复用Lody DOCX/XLSX/PPTX查看器及原卸载清理。
 * [POS]: 内置Office预览插件的惰性入口；名字不是本机读取路径。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { SessionFileOfficePreview } from '../../lody/session-file-office-preview'
import '../../lody/preview.css'
import type { PreviewRendererProps } from './types'

export default function OfficePreviewPlugin({ content, name }: PreviewRendererProps) {
  if (content.kind !== 'docx' && content.kind !== 'xlsx' && content.kind !== 'pptx') return null
  return <div className="h-full min-h-0 flex-1" data-binary-viewer={content.kind}><SessionFileOfficePreview kind={content.kind} path={name} bytes={content.bytes} active /></div>
}

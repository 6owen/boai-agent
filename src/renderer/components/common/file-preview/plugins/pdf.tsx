/*
 * [INPUT]: 已核源PDF字节及宿主标题。
 * [OUTPUT]: 复用Lody PDF查看器与原worker/卸载清理，不读取任意路径。
 * [OUTPUT]: 异步加载失败回报宿主有界故障状态，原局部提示保持。
 * [POS]: 内置PDF预览插件的惰性入口。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { SessionFilePdfPreview } from '../../lody/session-file-pdf-preview'
import '../../lody/preview.css'
import type { PreviewRendererProps } from './types'

export default function PdfPreviewPlugin({ content, onPreviewError }: PreviewRendererProps) {
  if (content.kind !== 'pdf') return null
  return <div className="h-full min-h-0 flex-1" data-binary-viewer={content.kind}><SessionFilePdfPreview bytes={content.bytes} onPreviewError={onPreviewError} /></div>
}

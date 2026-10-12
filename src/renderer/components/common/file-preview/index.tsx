/*
 * [INPUT]: 宿主已核验的文本/二进制/图片数据、活跃状态及可选header/引用渲染。
 * [OUTPUT]: 统一Markdown/代码/文本、PDF/Office、图片与不支持格式的只读预览入口。
 * [POS]: 全局文件预览组合层；页面保留业务身份、读取与操作权限，不重复格式分发。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ReactNode } from 'react'
import type { BinaryFilePreview, FilePreview as TextPreviewData } from '@shared/domain/file-preview'
import { FilePreviewHeader } from './header'
import { TextFilePreview } from './text-preview'
import { BinaryFileViewer } from './binary-preview'
import { ImageFilePreview } from './image-preview'

export { FilePreviewHeader } from './header'
export { TextFilePreview } from './text-preview'

export function FilePreview({ name, file, binary, image, active = true, line, markdown, header }: {
  name: string; file?: TextPreviewData; binary?: BinaryFilePreview; image?: { url?: string }
  active?: boolean; line?: number; markdown?: ReactNode; header?(toggle?: ReactNode): ReactNode
}) {
  if (!active) return null
  if (!binary && file && file.kind !== 'unsupported') return <TextFilePreview name={name} text={file.text} kind={file.kind} language={file.language} line={line} markdown={markdown} header={header} />
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-label={`文件预览 ${name}`} data-file-preview-kind={binary?.kind ?? (image ? 'image' : 'unsupported')}>
    {header ? header() : <FilePreviewHeader name={name} />}
    {binary ? <BinaryFileViewer preview={binary} name={name} active={active} /> : image ? <ImageFilePreview name={name} url={image.url} /> : <p className="field-hint">{file?.reason ?? '此文件暂不支持预览。'}</p>}
  </section>
}

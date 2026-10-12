/*
 * [INPUT]: 宿主核源后的非持久PDF/Office字节、固定身份与活跃标签。
 * [OUTPUT]: 按格式接上游lazy viewer；隐藏卸载并释放本次资源。
 * [POS]: 全局file-preview的二进制渲染器；Lody实现和许可证保留在common/lody。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { lazy, Suspense } from 'react'
import type { BinaryFilePreview } from '@shared/domain/file-preview'
import '../lody/preview.css'
const Pdf = lazy(() => import('../lody/session-file-pdf-preview').then(module => ({ default: module.SessionFilePdfPreview })))
const Office = lazy(() => import('../lody/session-file-office-preview').then(module => ({ default: module.SessionFileOfficePreview })))
export function BinaryFileViewer({ preview, name, active }: { preview: BinaryFilePreview; name: string; active: boolean }) {
  if (!active) return null
  return <div className="h-full min-h-0 flex-1" data-binary-viewer={preview.kind}><Suspense fallback={<p role="status">正在载入文件预览…</p>}>
    {preview.kind === 'pdf' ? <Pdf bytes={preview.bytes} /> : <Office kind={preview.kind} path={name} bytes={preview.bytes} active={active} />}
  </Suspense></div>
}

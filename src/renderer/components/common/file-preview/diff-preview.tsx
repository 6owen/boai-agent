/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: 原始patch或明确新增/删除的文件正文、Pierre解析数据与Lody DiffViewer。
 * [OUTPUT]: 全局只读diff预览，复用Pierre/主题/高亮worker；11px正文无上下内边距，换行模式不预留空横向滚动条，不完整记录保留原文。
 * [POS]: 文件预览目录的差异查看器；不写文件、不发起模型调用。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { lazy, Suspense, useMemo, type ComponentProps } from 'react'
import { CodeBlock } from '@/components/ui/code-block'
import { prepareDiffPreview, type DiffPreviewInput } from './diff-preview-data'

const DiffViewer = lazy(() => import('../lody/diff-viewer').then(module => ({ default: module.DiffViewer })))
const options = {
  diffIndicators: 'classic',
  overflow: 'wrap',
  // Pierre defaults to overflow-x: scroll, reserving 6px even when every line wraps.
  unsafeCSS: '[data-diffs][data-overflow="wrap"] [data-code] { overflow-x: auto; }',
} as const

export function DiffPreview({ diff, path, changeKind, ...props }: DiffPreviewInput & Pick<ComponentProps<'div'>, 'onKeyDown'>) {
  const data = useMemo(() => prepareDiffPreview({ diff, path, changeKind }), [diff, path, changeKind])
  const files = data.kind === 'patch' ? data.files.map(file => ({ path: file.name, previousPath: file.prevName, metadata: file })) : data.kind === 'file' ? [{ path: data.path, previousPath: undefined, metadata: undefined }] : []
  return <div {...props} tabIndex={0} aria-label="文件差异" data-diff-preview={data.kind} className="min-w-0 text-[length:var(--text-code-compact)] leading-[1.6] text-muted-foreground [--diffs-font-size:var(--text-code-compact)] [--diffs-line-height:1.6] [--diffs-gap-block:0px] [--diffs-fg-number-override:var(--muted-foreground)]">
    {data.kind === 'raw' ? <CodeBlock code={diff} language="diff" density="compact" /> : <Suspense fallback={<p role="status" className="m-0">正在载入文件差异…</p>}>
      <div className="flex min-w-0 flex-col gap-2">{files.map((file, index) => <section key={`${index}:${file.path}`} className="min-w-0 overflow-hidden rounded-lg border border-border">
        <div className="break-all border-b border-border px-2 py-1.5 font-normal">{file.previousPath && file.previousPath !== file.path ? `${file.previousPath} → ` : ''}{file.path}</div>
        <DiffViewer path={file.path} oldText={data.kind === 'file' ? data.oldText : ''} newText={data.kind === 'file' ? data.newText : ''} preparsedDiff={file.metadata} showHeader={false} diffStyle="unified" options={options} cachePrerenderedHtml={false} commentsEnabled={false} />
      </section>)}</div>
    </Suspense>}
  </div>
}

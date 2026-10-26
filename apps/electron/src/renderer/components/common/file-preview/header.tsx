/*
 * [INPUT]: 文件名、可选说明与调用方操作控件。
 * [OUTPUT]: 所有文件类型共用的紧凑标题栏；13px常规标题与图标操作。
 * [POS]: 全局file-preview的纯展示header，不读取文件或处理业务动作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ReactNode } from 'react'

export function FilePreviewHeader({ name, description, children }: { name: string; description?: string; children?: ReactNode }) {
  return <header data-slot="file-preview-header" className="flex min-w-0 shrink-0 items-center justify-between gap-3">
    <div role="heading" aria-level={3} className="min-w-0 flex-1 truncate text-sm font-normal" title={description ? `${name}\n${description}` : name}>{name}</div>
    <div className="flex shrink-0 items-center gap-1">{children}</div>
  </header>
}


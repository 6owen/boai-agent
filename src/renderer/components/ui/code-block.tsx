/*
 * [INPUT]: 公共CodeBlock与桌面预览行数限制。
 * [OUTPUT]: 以原产品限制渲染，公共包不依赖宿主领域。
 * [POS]: Renderer CodeBlock适配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属目录.folder.md。
 */
import type { ComponentProps } from 'react'
import { CodeBlock as SharedCodeBlock } from '@boai/ui/code-block'
import { FILE_PREVIEW_LIMITS } from '@shared/domain/file-preview'
export function CodeBlock(props: Omit<ComponentProps<typeof SharedCodeBlock>, 'maxLines'>) { return <SharedCodeBlock {...props} maxLines={FILE_PREVIEW_LIMITS.lines} /> }

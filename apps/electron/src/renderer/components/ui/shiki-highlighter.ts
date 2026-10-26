/*
 * [INPUT]: 公共高亮与原产品预览门槛。
 * [OUTPUT]: 按原行数限制调用同一高亮实现。
 * [POS]: Renderer高亮兼容适配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属目录.folder.md。
 */
import { highlightCode as highlight } from '@boai/ui/shiki-highlighter'
import { FILE_PREVIEW_LIMITS } from '@boai/shared/domain/file-preview'
export const highlightCode = (code: string, language: string) => highlight(code, language, FILE_PREVIEW_LIMITS.lines)

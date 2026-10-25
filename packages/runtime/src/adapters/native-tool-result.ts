/*
 * [INPUT]: 受信任宿主工具的普通结果或显式媒体投影。
 * [OUTPUT]: Codex inputImage与Claude MCP image原生内容部件；普通工具保留原JSON文本回执。
 * [POS]: 原生产品工具的薄格式适配；无执行、文件读取或新模型循环。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import type { NativeTool, NativeToolContent } from './native-task'

export function nativeToolContent(tool: NativeTool, result: unknown): NativeToolContent[] {
  return tool.toModelContent?.(result) ?? [{ type: 'text', text: JSON.stringify(result) ?? 'null' }]
}
export function codexToolResult(tool: NativeTool, result: unknown) {
  return { contentItems: nativeToolContent(tool, result).map(part => part.type === 'text'
    ? { type: 'inputText' as const, text: part.text }
    : { type: 'inputImage' as const, imageUrl: `data:${part.mimeType};base64,${part.data}` }), success: true }
}

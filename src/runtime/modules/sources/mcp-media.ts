/*
 * [INPUT]: Actual MCP call result with bounded image content blocks.
 * [OUTPUT]: Separate model image parts and redacted text; persistent observers retain media summaries.
 * [POS]: MCP transport/model media bridge, sharing the existing browser media boundary.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { summarizeMedia } from '../browser/media'
type Image = { type: 'image'; data: string; mimeType: string }
export function mcpImages(value: unknown): Image[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { content?: unknown }).content)) return []
  return (value as { content: unknown[] }).content.filter((item): item is Image => !!item && typeof item === 'object' && (item as Image).type === 'image' && ['image/png', 'image/jpeg', 'image/webp'].includes((item as Image).mimeType) && typeof (item as Image).data === 'string' && (item as Image).data.length <= 8 * 1024 * 1024).slice(0, 4)
}
export function mcpModelContent(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(summarizeMedia(value)) ?? 'null' }, ...mcpImages(value)]
}
export function mcpModelOutput(value: unknown) {
  return { type: 'content' as const, value: mcpModelContent(value).map(item => item.type === 'image' ? { type: 'image-data' as const, data: item.data, mediaType: item.mimeType } : item) }
}

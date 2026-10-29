/*
 * [OUTPUT]: 独立浏览器插件参数在持久Trace/历史中隐藏，原始内存调用与工具名称保持。
 * [OUTPUT]: 持久观测同时脱敏网页fill/type命令，包括JSON嵌套和拒绝请求；模型内存参数不变。
 * [INPUT]: 真实工具/模型/Trace 的媒体值。
 * [OUTPUT]: 只对媒体负载生成 MIME/字节数/hash 观测摘要；原生附件data URI按原始字节核算，普通工具正文和既有凭据脱敏合同保留。
 * [POS]: 浏览器截图持久化边界，不修改交给模型的内存媒体。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { redactBrowserCommand } from '../../adapters/mastra/browser-tool-redaction'
import { createHash } from 'node:crypto'
export function mediaSummary(value: string | Uint8Array, mimeType = 'application/octet-stream') {
  const data = typeof value === 'string' ? /^data:([^;,]+);base64,([\s\S]+)$/.exec(value) : null
  const bytes = typeof value === 'string' ? Buffer.from(data?.[2] ?? value,'base64') : Buffer.from(value)
  return { mimeType: data?.[1] ?? mimeType, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
export function summarizeMedia(value: unknown): unknown {
  if (value instanceof Uint8Array) return mediaSummary(value)
  if (typeof value === 'string') {
    const data = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value)
    if (data) return mediaSummary(data[2]!,data[1]!)
    if (/^\s*[\[{]/.test(value)) { try { const parsed = JSON.parse(value); const safe = summarizeMedia(parsed); return JSON.stringify(safe) } catch { /* Ordinary text stays intact. */ } }
    return value
  }
  if (Array.isArray(value)) return value.map(summarizeMedia)
  if (!value || typeof value !== 'object') return value
  let record = value as Record<string,unknown>
  if (['agent-browser', 'browser-viewer'].includes(String(record.provider)) && typeof record.tool === 'string' && 'arguments' in record) record = { ...record, arguments: '[browser input omitted]' }
  if (typeof record.command === 'string') record = { ...record, command: redactBrowserCommand(record.command) }
  const mime = typeof record.mimeType === 'string' ? record.mimeType : typeof record.mediaType === 'string' ? record.mediaType : undefined
  if ((record.type === 'image-data' || record.type === 'file-data' || mime?.startsWith('image/')) && typeof record.data === 'string') return { ...Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'data').map(([key,item]) => [key,summarizeMedia(item)])), ...mediaSummary(record.data,mime) }
  if (record.type === 'image' && (typeof record.image === 'string' || record.image instanceof Uint8Array)) return { type: 'image', ...mediaSummary(record.image,mime) }
  return Object.fromEntries(Object.entries(record).map(([key,item]) => [key,summarizeMedia(item)]))
}

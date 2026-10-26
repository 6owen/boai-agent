/*
 * [INPUT]: 用户授权的 HTTPS 来源、DNS、可注入响应流和取消信号。
 * [OUTPUT]: 固定公开目标地址的有界下载；重定向逐跳重新校验，不携带模型凭据。
 * [POS]: Skills 来源网络适配，安装和来源元数据由上层管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import type { Readable } from 'node:stream'

export const SKILL_DOWNLOAD_LIMITS = { bytes: 100 * 1024 * 1024, timeoutMs: 30_000, redirects: 3 } as const
const denied = new BlockList()
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) denied.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['2001::', 32], ['2001:db8::', 32], ['2002::', 16]] as const) denied.addSubnet(address, prefix, 'ipv6')
const globalIPv6 = new BlockList(); globalIPv6.addSubnet('2000::', 3, 'ipv6')
export function isPublicAddress(address: string) {
  const family = isIP(address)
  return family === 4 ? !denied.check(address, 'ipv4') : family === 6 && globalIPv6.check(address, 'ipv6') && !denied.check(address, 'ipv6')
}
export function downloadUrl(address: string): URL {
  let url: URL
  try { url = new URL(address) } catch { throw new Error('请填写有效的公开 HTTPS 来源') }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || !hostname || hostname.endsWith('.') || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || (isIP(hostname) && !isPublicAddress(hostname))) throw new Error('下载仅支持不含凭据的公开 HTTPS 地址（443 端口）')
  return url
}
export async function resolvePublicEndpoint(url: URL, resolver: typeof lookup = lookup) {
  const addresses = await resolver(url.hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true })
  if (!addresses.length || addresses.some(value => !isPublicAddress(value.address))) throw new Error('下载地址解析到非公开网络，已拒绝访问')
  return addresses.find(value => value.family === 4) ?? addresses[0]
}
export interface DownloadResponse { status: number; location?: string; contentLength?: string; body: Readable }
export type DownloadTransport = (url: URL, signal: AbortSignal) => Promise<DownloadResponse>

const publicTransport: DownloadTransport = async (url, signal) => {
  signal.throwIfAborted()
  // Cancel admission while the OS resolver finishes; a cancelled lookup never opens a socket.
  const endpoint = await new Promise<Awaited<ReturnType<typeof resolvePublicEndpoint>>>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    resolvePublicEndpoint(url).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET', signal, family: endpoint.family,
      // Keep Host/SNI and certificate validation, but pin the inspected DNS answer.
      lookup: (_hostname, _options, callback) => callback(null, endpoint.address, endpoint.family),
      headers: { Accept: 'application/zip, application/json;q=0.8, application/octet-stream;q=0.8', 'User-Agent': 'BoAI-Agent-Skills' },
    }, response => resolve({ status: response.statusCode ?? 0, location: response.headers.location, contentLength: response.headers['content-length'], body: response }))
    req.on('error', reject); req.end()
  })
}

export async function downloadBytes(address: string, options: { signal?: AbortSignal; maxBytes?: number; timeoutMs?: number; transport?: DownloadTransport } = {}) {
  const maxBytes = options.maxBytes ?? SKILL_DOWNLOAD_LIMITS.bytes
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? SKILL_DOWNLOAD_LIMITS.timeoutMs), ...(options.signal ? [options.signal] : [])])
  const transport = options.transport ?? publicTransport
  let url = downloadUrl(address)
  for (let redirects = 0; ; redirects++) {
    signal.throwIfAborted()
    const response = await transport(url, signal)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.body.destroy()
      if (!response.location || redirects >= SKILL_DOWNLOAD_LIMITS.redirects) throw new Error('技能下载重定向过多或目标缺失')
      url = downloadUrl(new URL(response.location, url).href)
      continue
    }
    if (response.status < 200 || response.status >= 300) { response.body.destroy(); throw new Error(`技能下载失败（HTTP ${response.status}）`) }
    if (Number(response.contentLength) > maxBytes) { response.body.destroy(); throw new Error('技能下载超过大小限制') }
    const onAbort = () => response.body.destroy(new Error('技能下载已取消或超时'))
    signal.addEventListener('abort', onAbort, { once: true })
    const parts: Buffer[] = []
    let size = 0
    try {
      signal.throwIfAborted()
      for await (const chunk of response.body) {
        signal.throwIfAborted()
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += bytes.length
        if (size > maxBytes) throw new Error('技能下载超过大小限制')
        parts.push(bytes)
      }
      return { bytes: Buffer.concat(parts), resolvedUrl: url.href }
    } finally { signal.removeEventListener('abort', onAbort); response.body.destroy() }
  }
}

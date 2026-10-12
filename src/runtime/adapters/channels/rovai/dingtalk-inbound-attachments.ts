/*
 * [INPUT]: Rovai固定提交的钉钉资源下载包装与原共享流式导入。
 * [OUTPUT]: 原SDK下载URL/错误分类与资源生命周期，供BOAI受管材料接线复用。
 * [POS]: 第16组直接迁入；MIT许可及来源见本目录清单。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { withChannelInboundFiles, type PendingChannelAttachments } from './channel-inbound-attachments'
import { DingTalkOpenApiError, type DingTalkOpenApiClient } from './dingtalk-open-api'

export function withDingTalkInboundFiles<T>(
  api: Pick<DingTalkOpenApiClient, 'messageFileDownloadUrl'>,
  robotCode: string,
  pending: PendingChannelAttachments,
  consume: (files: string[]) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  return withChannelInboundFiles(pending, async (resource, downloadSignal) => {
    if (!resource.downloadCode) throw new Error('channel.attachments.download_failed')
    const url = new URL(await api.messageFileDownloadUrl({
      robotCode, downloadCode: resource.downloadCode, signal: downloadSignal
    }))
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('channel.attachments.download_failed')
    }
    // DingTalk also returns HTTP signed storage URLs. Use the URL it issued.
    // The signed URL carries its own grant. Never forward App tokens to storage.
    const response = await fetch(url, { signal: downloadSignal })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new DingTalkOpenApiError('channel.attachments.download_failed', response.status)
    }
    return Readable.fromWeb(response.body as ReadableStream)
  }, consume, signal)
}

export function dingtalkAttachmentFailureCode(error: unknown): string {
  if (error instanceof Error && ['channel.attachments.too_large', 'channel.attachments.unsupported'].includes(error.message)) {
    return error.message
  }
  return error instanceof DingTalkOpenApiError && [401, 403].includes(error.status)
    ? 'channel.attachments.permission_denied'
    : 'channel.attachments.download_failed'
}

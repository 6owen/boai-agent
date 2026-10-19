/*
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: implemented fields only, owner identity and BOAI error codes.
 * [INPUT]: Craft protocol/types.ts at 22c9f0414ab63e0a22814c9a2ada740206e09091.
 * [OUTPUT]: Craft-style envelopes; separate public CLI and private local desktop frame limits.
 * [POS]: Shared CLI transport; request correlation is separate from business requestId.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
export const PROTOCOL_VERSION = 'boai-1.0'
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024
export const MAX_DESKTOP_MESSAGE_BYTES = 64 * 1024 * 1024
export const MAX_PENDING_REQUESTS = 64
export type MessageType = 'handshake' | 'handshake_ack' | 'request' | 'response' | 'event' | 'error'
export type ErrorCode = 'AUTH_FAILED' | 'PROTOCOL_VERSION_UNSUPPORTED' | 'PROFILE_MISMATCH' | 'INVALID_REQUEST' | 'CHANNEL_NOT_FOUND' | 'HANDLER_ERROR' | 'CAPABILITY_UNAVAILABLE' | 'REQUEST_TIMEOUT' | 'CLIENT_DISCONNECTED' | 'MESSAGE_TOO_LARGE' | 'DUPLICATE_REQUEST' | 'SERVER_BUSY'
export interface WireError { code: ErrorCode; message: string }
export interface MessageEnvelope {
  id: string
  type: MessageType
  channel?: string
  args?: unknown[]
  result?: unknown
  error?: WireError
  protocolVersion?: string
  workspaceId?: string
  token?: string
  clientId?: string
  serverId?: string
  serverVersion?: string
  registeredChannels?: string[]
  maxMessageBytes?: number
}
export class CliError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); this.name = 'CliError' }
}

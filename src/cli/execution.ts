/*
 * [OUTPUT]: 显式CLI权限仅核对员工已保存模式，受理后继续沿原审批和当前授权，不临时改权。
 * [OUTPUT]: 员工/核心首发接收固定附件摘要及短期上传选择，重复核对不依赖临时token。
 * [OUTPUT]: 附件独立身份随原send受理，明确附件可发送空正文。
 * [OUTPUT]: 本轮API模型覆盖沿原请求与执行，冻结来源且临时凭据不写入公开记录或默认配置。
 * [OUTPUT]: 原send/run消息携带明确业务工作目录，不把参数拼入正文。
 * [OUTPUT]: 明确数据源引用随原send/run消息受理，保留版本及原回执。
 * [OUTPUT]: CLI原执行文本增量/快照替换废弃和工具结果接线；receipt --follow只读原请求，待审批/输入与未知结果给出核对入口。
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see ../shared/cli/LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: Node stdin, original receipt/Run ownership, actual exit and pending-input states.
 * [INPUT]: Craft apps/cli/src/index.ts at 22c9f0414ab63e0a22814c9a2ada740206e09091 and BOAI public RPC.
 * [OUTPUT]: Bounded UTF-8 input, employee-private sends and request-scoped observation/cancellation without replay.
 * [POS]: CLI command execution, sharing the host's existing business state and ExecutionFeed.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { Readable } from 'node:stream'
import type { Message } from '../shared/domain'
import type { ConversationMessagePage } from '../shared/domain/reading'
import type { MessageExecution } from '../shared/domain/message-execution'
import type { AgentRunExecutionBlockChanges } from '../shared/rovai/contracts'
import { CliError, PROTOCOL_VERSION } from '../shared/cli/protocol'
import type { CliRpcClient } from './client'
import type { ComposerReference } from '../shared/domain/composer-references'
import { executionRecovery, outputProjection } from './output'

export async function readPrompt(words: string[], stdin: Readable & { isTTY?: boolean }, wantsStdin = false, allowEmpty = false) {
  let message = words.join(' ')
  const check = () => { if (message.length > 100_000) throw new CliError('INVALID_REQUEST', '消息正文最多 100000 个字符') }
  check()
  if (wantsStdin || (!message && !stdin.isTTY)) {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    if (message) message += '\n'
    try {
      for await (const chunk of stdin) { message += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }); check() }
      message += decoder.decode(); check()
    } catch (error) {
      if (error instanceof CliError) throw error
      throw new CliError('INVALID_REQUEST', '无法读取有效 UTF-8 标准输入')
    }
  }
  if (!message.trim() && !allowEmpty) throw new CliError('INVALID_REQUEST', '消息不能为空')
  return message
}

export interface ExecutionEvent { protocolVersion: typeof PROTOCOL_VERSION; type: string; requestId: string; conversationId?: string; messageId?: string; [key: string]: unknown }
export interface ObserveOptions { requestId: string; signal?: AbortSignal; waitTimeout?: number; emit(event: ExecutionEvent): void }

/** Unlike Craft session completion, completion here is proven by the original BOAI request projection. */
export async function executeMessage(client: CliRpcClient, operation: { expectedExecutionPermission?: import('../shared/domain/execution').ExecutionPermission; apiModel?: import('../shared/domain/model-source').ApiModelOverride; workingDirectory?: string; composerReferences?: ComposerReference[]; kind: 'send'; materialSelections?: import('../shared/domain/materials').MaterialSelection[]; conversationId: string; content: string; mentionIds: string[]; replyToMessageId?: string } | { expectedExecutionPermission?: import('../shared/domain/execution').ExecutionPermission; apiModel?: import('../shared/domain/model-source').ApiModelOverride; workingDirectory?: string; composerReferences?: ComposerReference[]; kind: 'employee'; materialUploads?: import('../shared/domain/material-upload').SubmittedMaterial[]; materialSelections?: import('../shared/domain/materials').MaterialSelection[]; employeeId: string; content: string } | { kind: 'cancel' | 'observe' }, options: ObserveOptions): Promise<number> {
  const identity: { requestId: string; conversationId?: string; messageId?: string } = { requestId: options.requestId, ...('conversationId' in operation ? { conversationId: operation.conversationId } : {}) }
  const emit = (type: string, payload: Record<string, unknown> = {}) => options.emit({ protocolVersion: PROTOCOL_VERSION, type, ...identity, ...payload })
  const timeout = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
  const timer = options.waitTimeout ? setTimeout(() => timeout.abort(new CliError('REQUEST_TIMEOUT', '终端等待超时；原执行未取消，请按 requestId 查询')), options.waitTimeout) : undefined
  const invoke = async <T>(channel: string, input: unknown): Promise<T> => {
    signal.throwIfAborted()
    let abort!: () => void
    const interrupted = new Promise<never>((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }) })
    try { return await Promise.race([client.invoke(channel, input) as Promise<T>, interrupted]) }
    finally { signal.removeEventListener('abort', abort) }
  }
  let dirty = true, wake: (() => void) | undefined, subscribed = false
  const unsubscribe = client.on('app', () => { dirty = true; wake?.() })
  const disconnect = client.onDisconnect(() => { dirty = true; wake?.() })
  let submitted = false
  const cursors = new Map<string, number>(), blockVersions = new Map<string, string>(), messageVersions = new Map<string, string>()
  let previousStatus = ''
  let latestStatus: MessageExecution | undefined
  const projection = outputProjection(emit, invoke)
  const readOutput = async (status: MessageExecution) => {
    let complete = true
    for (const run of status.runs) {
      let more = true
      while (more) {
        const after = cursors.get(run.id) ?? 0
        const page = await invoke<AgentRunExecutionBlockChanges>('listExecutionWindow', { conversationId: status.conversationId, runId: run.id, afterChangeSequence: after, limit: 96 })
        for (const block of [...page.blocks, ...(page.refreshedBlocks ?? [])]) {
          const key = `${run.id}:${block.key}`, serialized = JSON.stringify(block)
          if (blockVersions.get(key) !== serialized) {
            blockVersions.set(key, serialized)
            emit('execution', { runId: run.id, agentId: run.agentId, block })
          }
          if (!await projection.block(run, block, status.conversationId)) complete = false
        }
        // A changing deferred record must be re-read before its cursor or a terminal result advances.
        if (!complete) break
        cursors.set(run.id, page.nextAfterChangeSequence)
        more = page.hasMore && page.nextAfterChangeSequence > after
      }
    }
    for (const id of status.replyMessageIds) {
      const page = await invoke<ConversationMessagePage>('listConversationMessages', { conversationId: status.conversationId, aroundMessageId: id, limit: 1 })
      const message = page.items.find(item => item.messageId === id)?.message
      if (!message) continue
      projection.published(message)
      const serialized = JSON.stringify(message)
      if (messageVersions.get(id) === serialized) continue
      messageVersions.set(id, serialized)
      emit('message', { runId: message.runId, agentId: message.senderId, replyMessageId: id, message })
    }
    if (complete) projection.settle(status)
    return complete
  }
  try {
    emit('request', { operation: operation.kind })
    // Register the local listener before the server subscription and before mutation.
    await invoke('events:subscribe', { channel: 'app', conversationId: identity.conversationId }); subscribed = true
    if (operation.kind === 'send' || operation.kind === 'employee') {
      submitted = true
      const { kind: _kind, ...input } = operation
      const accepted = await invoke<Message>(operation.kind === 'employee' ? 'sendEmployeeMessage' : 'sendMessage', { ...input, requestId: options.requestId })
      identity.messageId = accepted.id; identity.conversationId = accepted.conversationId
      emit('accepted')
    } else if (operation.kind === 'cancel') {
      submitted = true
      const status = await invoke<MessageExecution>('cancelMessageExecution', { requestId: options.requestId })
      identity.messageId = status.messageId; identity.conversationId = status.conversationId
    }
    for (;;) {
      dirty = false
      const status = await invoke<MessageExecution | null>('getMessageExecution', { requestId: options.requestId })
      if (!status) { emit('result', { state: 'unknown', exitCode: 4, error: '原消息回执尚不可确认', recovery: executionRecovery(options.requestId) }); return 4 }
      latestStatus = status
      identity.messageId = status.messageId; identity.conversationId = status.conversationId
      const outputComplete = await readOutput(status)
      const serialized = JSON.stringify(status)
      if (serialized !== previousStatus) { emit('status', { status }); previousStatus = serialized }
      const code = operation.kind === 'cancel'
        ? !status.activeRunIds.length && ['cancelled', 'completed', 'failed'].includes(status.state) ? 0 : status.state === 'unknown' ? 4 : undefined
        : status.state === 'completed' ? 0 : ['failed', 'cancelled'].includes(status.state) ? 1 : ['waiting_input', 'waiting_approval'].includes(status.state) ? 3 : status.state === 'unknown' ? 4 : undefined
      if (code !== undefined && outputComplete) { emit('result', { state: status.state, exitCode: code, ...(code ? { recovery: executionRecovery(options.requestId, status) } : {}) }); return code }
      signal.throwIfAborted()
      if (!dirty) await new Promise<void>(resolve => {
        let delay: ReturnType<typeof setTimeout>
        const done = () => { clearTimeout(delay); signal.removeEventListener('abort', done); wake = undefined; resolve() }
        wake = done; delay = setTimeout(done, 250); signal.addEventListener('abort', done, { once: true })
      })
    }
  } catch (error) {
    const interrupted = options.signal?.aborted
    let code = interrupted ? 130 : submitted || operation.kind === 'observe' || error instanceof CliError && ['REQUEST_TIMEOUT', 'CLIENT_DISCONNECTED'].includes(error.code) ? 4 : 1
    // A received handler rejection can still follow a durable commit. Reconcile once, never resend.
    if (!interrupted && !signal.aborted && error instanceof CliError && error.code === 'HANDLER_ERROR' && !identity.messageId) {
      try { if (!await invoke('getMessageReceipt', { requestId: options.requestId })) code = 1 } catch { /* unknown remains unknown */ }
    }
    if (!interrupted && error instanceof CliError && error.code === 'INVALID_REQUEST') code = 2
    emit('result', { state: interrupted ? 'detached' : code === 1 || code === 2 ? 'failed' : 'unknown', exitCode: code, error: error instanceof Error ? error.message : '执行结果待核对', recovery: executionRecovery(options.requestId, latestStatus) })
    return code
  } finally {
    if (timer) clearTimeout(timer)
    unsubscribe(); disconnect()
    if (subscribed && client.isConnected) await client.invoke('events:unsubscribe', { channel: 'app' }).catch(() => {})
  }
}

/** Provisional text and committed replies have separate identities; plain terminals cannot retract bytes. */
export function executionWriter(format: 'text' | 'json' | 'stream-json', stdout: (text: string) => void, stderr: (text: string) => void) {
  const messages = new Map<string, Message>()
  const streams = new Map<string, { runId: string; text: string; discarded: boolean; published: boolean }>()
  const published = new Map<string, string>()
  let activeStream: string | undefined
  let status: MessageExecution | undefined
  return (event: ExecutionEvent) => {
    if (event.type === 'message') messages.set(event.replyMessageId as string, event.message as Message)
    if (event.type === 'status') status = event.status as MessageExecution
    if (format === 'stream-json') { stdout(`${JSON.stringify(event)}\n`); return }
    if (event.type === 'request' || event.type === 'accepted') stderr(`${JSON.stringify(event)}\n`)
    if (format === 'text' && event.type === 'text_delta') {
      const key = `${event.runId}:${event.evidenceId}`
      if (key !== activeStream) { stdout(`\n[执行输出 · ${event.agentId} · ${event.runId}]\n`); activeStream = key }
      const prior = streams.get(key), text = prior && !prior.discarded ? prior.text : ''
      streams.set(key, { runId: event.runId as string, text: text + String(event.delta), discarded: false, published: false })
      stdout(String(event.delta))
    }
    if (format === 'text' && event.type === 'text_discard') {
      const key = `${event.runId}:${event.evidenceId}`, prior = streams.get(key)
      if (prior && !prior.published) {
        prior.discarded = true; activeStream = undefined
        stdout(`\n[部分输出已废弃 · ${event.agentId} · ${event.evidenceId} · ${event.reason}]\n`)
      }
    }
    if (format === 'text' && ['tool_start', 'tool_progress', 'tool_result'].includes(event.type)) stderr(`${JSON.stringify(event)}\n`)
    if (format === 'text' && event.type === 'message') {
      const message = event.message as Message
      if (message.status === 'completed' && published.get(message.id) !== message.content) {
        const shown = [...streams.values()].find(stream => stream.runId === message.runId && !stream.discarded && !stream.published && stream.text === message.content)
        if (shown) { shown.published = true; stdout(`\n[已发布回答 · ${message.senderId} · ${message.id}]\n`) }
        else stdout(`\n[已发布回答 · ${message.senderId} · ${message.id}]\n${message.content}\n`)
        published.set(message.id, message.content); activeStream = undefined
      }
    }
    if (event.type === 'result') {
      const replies = [...messages.values()].filter(message => message.status === 'completed')
      if (format === 'json') stdout(`${JSON.stringify({ ...event, status, messages: replies })}\n`)
      else stderr(`${JSON.stringify({ ...event, status })}\n`)
    }
  }
}

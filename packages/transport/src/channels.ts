/*
 * [OUTPUT]: 2026-10-19应用业务协议：应用业务协议目录/调用/回执接原owner通道，run凭据沿实际员工工具授权。
 * [OUTPUT]: Owner明确渠道发布及发送回执查询接原服务，共用桌面schema；普通send不外发，运行凭据不获发布权。
 * [OUTPUT]: 知识引用只沿实际读取记录及当前授权/内容身份预览；旧版本、伪造路径和未读行不扩权。
 * [OUTPUT]: Owner原问题查询/显式回答共用桌面schema与事务，运行凭据不获回答权限。
 * [OUTPUT]: session create显式模式核对保存权限并进入稳定请求身份，旧回执不受后来改权影响。
 * [OUTPUT]: 显式CLI权限仅核对员工已保存模式，受理后继续沿原审批和当前授权，不临时改权。
 * [OUTPUT]: 员工/核心首发接收固定附件摘要及短期上传选择，重复核对不依赖临时token。
 * [OUTPUT]: Owner附件分块上传/准备/回执共用原材料授权，拒绝任意服务器路径。
 * [OUTPUT]: 本轮API模型覆盖沿原请求与执行，冻结来源且临时凭据不写入公开记录或默认配置。
 * [OUTPUT]: send/run工作位置复用公开目录路径格式，业务授权仍由原执行核验。
 * [OUTPUT]: send/run接受原Composer引用schema，受理仍核对员工绑定和来源版本。
 * [OUTPUT]: Owner-only credentials and original run tool catalog; employee invocation has stable call identity and write/drain classification.
 * [OUTPUT]: CLI消息游标复用原历史双向分页；app/session:event沿公共发布器隔离会话，订阅确认及中断/断开退出可核对。
 * [OUTPUT]: 运行时版本查询复用程序身份/原验证与插件内容核验；未知明确、零启动，CLI区分自身及服务版本，验证归21组01 §12.9。
 * [OUTPUT]: 精确run取消为明确写方法，候选对象和停止投影为只读；共用原AppService。
 * [OUTPUT]: Explicit owner session creation/deletion and read-only durable receipts use the same AppService transactions.
 * [INPUT]: Explicit owner-authenticated RPC and the original typed BOAI service methods.
 * [OUTPUT]: Public schemas, original employee-private sends and request-scoped status/cancellation.
 * [POS]: Shared desktop/headless CLI entry, not a second business service or permission store.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { z } from 'zod'
import { applicationCatalogQuerySchema, applicationRequestSchema, applicationReceiptQuerySchema } from '@boai/shared/domain/application-protocol'
import { executionPermissionSchema } from '@boai/shared/domain/execution'
import { inboxQuerySchema, inboxReplySchema } from '@boai/shared/domain/inbox'
import type { Method, Methods } from '@boai/shared/ipc'
import { CliError, PROTOCOL_VERSION } from '@boai/shared/cli/protocol'
import { directoryGrantSchema } from '@boai/shared/domain/directory-access'
import { materialUploadSchema, prepareUploadedMaterialSchema, submittedMaterialsSchema } from '@boai/shared/domain/material-upload'
import { MATERIAL_LIMITS } from '@boai/shared/domain/materials'
import { apiModelOverrideSchema } from '@boai/shared/domain/model-source'
import { composerReferencesSchema } from '@boai/shared/domain/composer-references'
import type { RunCliAccessPort } from '@boai/shared/cli/run-access'
import type { RpcChannel } from './server'
import { eventChannelSchema } from './events'
import { messageCursorSchema } from './history'
import { channelPublishSchema, channelReplySchema, channelDeliveriesQuerySchema } from '@boai/shared/domain/channels'

export interface CliServicePort { request<K extends Method>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']>; runAccess?: RunCliAccessPort }
export interface CliServiceIdentity { workspaceId: string; name: string; version: string; browserAvailable: boolean; credentialProvider: 'desktop-vault' | 'environment' | 'unavailable' }
const id = z.string().min(1).max(200)
const empty = z.undefined()
const cursor = messageCursorSchema
const page = z.object({ employeeId: id.optional(), cursor: id.optional(), limit: z.number().int().min(1).max(80).default(40) }).strict().default({ limit: 40 })

export function publicChannels(service: CliServicePort, identity: CliServiceIdentity): ReadonlyMap<string, RpcChannel> {
  const channels = new Map<string, RpcChannel>()
  const read = (name: string, input: z.ZodType, handle: RpcChannel['handle']) => channels.set(name, { input, effect: 'read', handle })
  function method<K extends Method>(name: K, input: z.ZodType<Methods[K]['input']>, effect: RpcChannel['effect'] = 'read') {
    channels.set(name, { input, effect, handle: data => service.request(name, data as Methods[K]['input']) })
  }
  channels.set('application:catalog', { input: applicationCatalogQuerySchema, effect: 'read', handle: input => service.request('getApplicationCatalog', input as never) })
  channels.set('application:call', { input: applicationRequestSchema, effect: 'write', handle: input => service.request('executeApplicationOperation', input as never) })
  channels.set('application:receipt', { input: applicationReceiptQuerySchema, effect: 'read', handle: input => service.request('getApplicationReceipt', input as never) })
  read('ping', empty, () => ({ ok: true, protocolVersion: PROTOCOL_VERSION }))
  if (service.runAccess) {
    const access = service.runAccess
    channels.set('auth:issue-run', { effect: 'write', input: z.object({ runId: id, ttlSeconds: z.number().int().min(1).max(3600).optional() }).strict(), handle: input => access({ kind: 'issue', ...input as { runId: string; ttlSeconds?: number } }) })
    channels.set('auth:revoke-run', { effect: 'write', input: z.object({ grantId: z.string().uuid() }).strict(), handle: input => access({ kind: 'revoke', ...input as { grantId: string } }) })
    for (const kind of ['context', 'tools', 'invoke'] as const) channels.set(`employee:${kind}`, { access: 'run', effect: kind === 'invoke' ? 'write' : 'read', input: kind === 'invoke' ? z.object({ tool: id, input: z.unknown(), callId: id.optional() }).strict() : empty, handle: (input, session) => {
      if (session.principal.kind !== 'run') throw new CliError('AUTH_FAILED', '需要员工运行凭据')
      return kind === 'invoke' ? access({ kind, principal: session.principal, ...input as { tool: string; input: unknown; callId?: string } }) : access({ kind, principal: session.principal })
    } })
  }
  read('health', empty, async () => {
    await service.request('snapshot', undefined)
    return { service: 'ready', storage: 'ready', browserAvailable: identity.browserAvailable, credentialProvider: identity.credentialProvider }
  })
  read('versions', empty, async () => ({ service: identity.version, protocol: PROTOCOL_VERSION, runtimes: await service.request('getRuntimeVersions', undefined) }))
  read('workspaces', empty, () => [{ id: identity.workspaceId, name: identity.name }])
  read('employees', empty, async () => (await service.request('snapshot', undefined)).agents)
  read('connections', empty, async () => (await service.request('snapshot', undefined)).connections)
  read('sessions', page, async input => {
    const query = page.parse(input), snapshot = await service.request('snapshot', undefined)
    const rooms = snapshot.conversations.filter(room => !room.mergedInto && !room.list?.hidden && (!query.employeeId || room.agentIds.includes(query.employeeId))).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    const remaining = rooms.filter(room => !query.cursor || room.id > query.cursor)
    const items = remaining.slice(0, query.limit).map(({ workspacePath: _path, ...room }) => room)
    return { items, ...(remaining.length > query.limit ? { nextCursor: items.at(-1)!.id } : {}) }
  })
  read('sources', z.object({ employeeId: id.optional() }).strict().default({}), async input => {
    const { employeeId } = input as { employeeId?: string }
    const agent = employeeId ? (await service.request('snapshot', undefined)).agents.find(agent => agent.id === employeeId) : undefined
    if (employeeId && !agent) throw new Error('员工不存在')
    return (await service.request('listDataSources', undefined)).filter(source => !agent || (agent.id === 'bobo' && agent.systemRole === 'core') || agent.sourceIds?.includes(source.id)).map(source => ({ id: source.id, name: source.name, type: source.type, enabled: source.enabled, revision: source.revision, hasCredential: source.hasCredential }))
  })
  method('getConversation', z.object({ id }).strict())
  method('createEmployeeSession', z.object({ expectedExecutionPermission: executionPermissionSchema.optional(), employeeId: id, name: z.string().trim().min(1).max(200).optional(), requestId: id }).strict(), 'write')
  method('deleteSession', z.object({ conversationId: id, requestId: id }).strict(), 'write')
  method('getSessionReceipt', z.object({ requestId: id }).strict())
  method('listConversationMessages', z.object({ conversationId: id, limit: z.number().int().min(1).max(80).optional(), before: cursor.optional(), after: cursor.optional(), aroundMessageId: id.optional() }).strict())
  method('transferMaterial', materialUploadSchema, 'write')
  channels.set('prepareMaterial', { input: prepareUploadedMaterialSchema, effect: 'write', handle: input => service.request('prepareUploadedMaterial', input as Methods['prepareUploadedMaterial']['input']) })
  method('getMaterialPreparation', z.object({ requestId: id }).strict())
  method('discardMaterial', z.object({ id, expectedRevision: z.number().int().positive() }).strict(), 'write')
  method('getMessageReceipt', z.object({ requestId: id }).strict())
  method('publishChannelReply', channelReplySchema, 'write')
  method('publishChannelMessage', channelPublishSchema, 'write')
  method('listChannelMessageDeliveries', channelDeliveriesQuerySchema)
  method('sendEmployeeMessage', z.object({ expectedExecutionPermission: executionPermissionSchema.optional(), materialUploads: submittedMaterialsSchema.optional(), apiModel: apiModelOverrideSchema.optional(), workingDirectory: directoryGrantSchema.shape.path.optional(), composerReferences: composerReferencesSchema.optional(), materialSelections: z.array(z.object({ id, revision: z.number().int().positive() }).strict()).max(MATERIAL_LIMITS.perMessage).optional(), employeeId: id, content: z.string().trim().max(100_000), requestId: id }).strict(), 'write')
  method('getMessageExecution', z.object({ requestId: id }).strict())
  method('listInbox', inboxQuerySchema)
  method('getInboxItem', z.object({ id: z.string().min(1).max(600) }).strict())
  method('replyInboxQuestion', inboxReplySchema, 'write')
  method('getCancellationTargets', z.object({ conversationId: id }).strict())
  method('getRunCancellation', z.object({ conversationId: id, runId: id }).strict())
  method('cancelRunExecution', z.object({ conversationId: id, runId: id }).strict(), 'write')
  method('cancelMessageExecution', z.object({ requestId: id }).strict(), 'write')
  method('listExecutionWindow', z.object({ conversationId: id, runId: id, beforeSequence: z.number().int().nonnegative().nullable().optional(), afterSequence: z.number().int().nonnegative().optional(), afterChangeSequence: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(96) }).strict())
  method('getExecutionContent', z.object({ conversationId: id, runId: id, evidenceId: id, offset: z.number().int().nonnegative() }).strict())
  method('respondNativeAction', z.object({ conversationId: id, runId: id, actionId: id, response: z.object({ option: z.string().optional(), answers: z.record(z.string(), z.array(z.string())).optional() }).strict() }).strict(), 'write')
  method('sendMessage', z.object({ expectedExecutionPermission: executionPermissionSchema.optional(), materialUploads: submittedMaterialsSchema.optional(), apiModel: apiModelOverrideSchema.optional(), workingDirectory: directoryGrantSchema.shape.path.optional(), composerReferences: composerReferencesSchema.optional(), conversationId: id, materialSelections: z.array(z.object({ id, revision: z.number().int().positive() }).strict()).max(MATERIAL_LIMITS.perMessage).optional(), content: z.string().max(100_000), mentionIds: z.array(id).max(100), requestId: id, replyToMessageId: id.optional() }).strict(), 'write')
  method('approve', z.object({ id, approved: z.boolean(), always: z.boolean().optional() }).strict(), 'write')
  method('getDirectoryApprovalReceipt', z.object({ id }).strict())
  method('listEmployeeKnowledge', z.object({ agentId: id }).strict())
  method('getKnowledgeCitationPreview', z.object({ messageId: id, referenceIndex: z.number().int().nonnegative(), line: z.number().int().positive() }).strict())
  method('getEmployeeKnowledgeFiles', z.object({ agentId: id, resourceId: id }).strict())
  method('getEmployeeKnowledgePreview', z.object({ agentId: id, resourceId: id, contentHash: z.string().min(1).max(200), fileKey: z.string().max(4096).optional() }).strict())
  read('events:subscribe', z.object({ channel: eventChannelSchema, conversationId: id.optional() }).strict(), async (input, session) => {
    const query = input as { channel: string; conversationId?: string }
    if (query.conversationId) await service.request('getConversationMetadata', { id: query.conversationId })
    session.subscriptions.set(query.channel, { conversationId: query.conversationId }); return { subscribed: true }
  })
  read('events:unsubscribe', z.object({ channel: eventChannelSchema }).strict(), (input, session) => {
    session.subscriptions.delete((input as { channel: string }).channel); return { subscribed: false }
  })
  return channels
}

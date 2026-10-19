/*
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see ../shared/cli/LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: read-only existing services, exclusive validation profiles and original business receipts.
 * [INPUT]: Craft validation step/elapsed/result loop @ 22c9f0414ab63e0a22814c9a2ada740206e09091 and explicit BOAI connection.
 * [OUTPUT]: Unconfirmed startup PID/log remain in the report after interruption; startup signal reaches the original spawner; structured diagnostics or isolated integration; interruption still exports original evidence before actual own-service shutdown.
 * [POS]: CLI validation orchestration; no second runtime implementation or writes to an existing profile.
 * [PROTOCOL]: Changes update Header, source manifest and src/cli/.folder.md.
 */
import { mkdir, mkdtemp, realpath, readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { CliRpcClient } from './client'
import type { CliDiagnostic } from './presentation'
import { connectRunServer, type RunServer } from './server-spawner'
import { readLocalConnection } from './discovery'
import { CliError, PROTOCOL_VERSION } from '../shared/cli/protocol'
import { executeMessage } from './execution'
import { executeSessionOperation } from './session'
import { openValidationFixture } from './validation-fixture'
import type { DigitalAgent, Connection, Message } from '../shared/domain'
import type { ConversationMessagePage } from '../shared/domain/reading'
import type { ApiModelOverride } from '../shared/domain/model-source'
import type { MessageExecution } from '../shared/domain/message-execution'

export interface ValidationStep { step: string; status: 'passed' | 'failed' | 'skipped'; detail: string; elapsedMs: number; code?: string }
export interface ValidationReport { protocolVersion: string; type: 'validation'; mode: 'read-only' | 'isolated'; modelMode: 'none' | 'controlled-local' | 'configured-provider'; passed: number; failed: number; skipped: number; exitCode: number; elapsedMs: number; results: ValidationStep[]; startup?: { state: 'unconfirmed'; pid: number; logPath: string }; directory?: string; controlledRequests?: number; requestId?: string; service?: Awaited<ReturnType<RunServer['finish']>> }
export interface ValidationOptions { dataPath?: string; directory?: string; url?: string; token?: string; workspaceId?: string; ca?: Buffer; timeout: number; apiModel?: ApiModelOverride; signal?: AbortSignal; diagnostic?(value: CliDiagnostic): void; step?(value: ValidationStep): void }
const check: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message) }
export async function validateServer(options: ValidationOptions): Promise<ValidationReport> {
  const started = performance.now(), results: ValidationStep[] = []
  const isolated = !!options.directory || !options.url && !options.dataPath
  const report: ValidationReport = { protocolVersion: PROTOCOL_VERSION, type: 'validation', mode: isolated ? 'isolated' : 'read-only', modelMode: isolated ? options.apiModel ? 'configured-provider' : 'controlled-local' : 'none', passed: 0, failed: 0, skipped: 0, exitCode: 1, elapsedMs: 0, results }
  let client: CliRpcClient | undefined, server: RunServer | undefined, fixture: Awaited<ReturnType<typeof openValidationFixture>> | undefined
  let profile: string | undefined, employee: DigitalAgent | undefined, conversationId: string | undefined, originalFile: string | undefined, message: Message | undefined, apiModel = options.apiModel
  const requestId = randomUUID(), marker = `BOAI_VALIDATION_${randomUUID()}`, events: unknown[] = []
  let initialEmployees: string[] = [], initialConnections: string[] = [], artifactExported = false, sessionCreated = false, executionComplete = false
  const step = async (name: string, fn: () => Promise<string>, needs = true, cleanup = false) => {
    const start = performance.now(); let result: ValidationStep
    if (!needs || options.signal?.aborted && !cleanup) result = { step: name, status: 'skipped', detail: options.signal?.aborted ? '验证已中断；未执行此步骤' : '前置步骤未完成', elapsedMs: 0 }
    else try { const detail = await fn(); result = { step: name, status: 'passed', detail, elapsedMs: Math.round(performance.now() - start) } }
    catch (error) { result = { step: name, status: 'failed', detail: error instanceof CliError ? '服务调用失败；按错误码核对，未重放业务请求' : error instanceof Error && error.name === 'Error' ? error.message.slice(0, 300) : '验证步骤未完成', code: error instanceof CliError ? error.code : 'VALIDATION_FAILED', elapsedMs: Math.round(performance.now() - start) } }
    results.push(result); options.step?.(result)
  }
  const rpc = async <T>(method: string, input?: unknown) => await (input === undefined ? client!.invoke(method) : client!.invoke(method, input)) as T
  try {
    await step('connect', async () => {
      if (isolated) {
        if (options.directory) { const parent = await realpath(dirname(resolve(options.directory))); const path = join(parent, basename(resolve(options.directory))); await mkdir(path, { mode: 0o700 }); report.directory = await realpath(path) }
        else report.directory = await realpath(await mkdtemp(join(tmpdir(), 'boai-validation-')))
        profile = join(report.directory, 'profile')
        await writeFile(join(report.directory, 'validation.json'), JSON.stringify({ schemaVersion: 1, requestId, mode: report.modelMode }), { flag: 'wx', mode: 0o600 })
        server = await connectRunServer({ dataPath: profile, timeout: options.timeout, signal: options.signal, diagnostic: event => {
          if (event.event === 'service_start' && event.pid && event.logPath) report.startup = { state: 'unconfirmed', pid: event.pid, logPath: event.logPath }
          options.diagnostic?.(event)
        } })
        delete report.startup
        check(server.started, '新验证目录出现了其他服务；未修改该服务')
        client = server.client
      } else {
        const local = options.url ? undefined : await readLocalConnection(options.dataPath!)
        client = new CliRpcClient(options.url ?? local!.url, { token: options.token ?? local!.token, serverId: local?.serverId, workspaceId: options.workspaceId ?? local?.workspaceId, ca: options.ca, requestTimeout: options.timeout, connectTimeout: options.timeout })
        await client.connect()
      }
      check(client.handshake?.protocolVersion === PROTOCOL_VERSION, '握手协议不一致')
      return '认证连接与工作空间身份已核对'
    })
    const connected = () => !!client?.isConnected
    await step('ping', async () => { const value = await rpc<{ ok: boolean; protocolVersion: string }>('ping'); check(value.ok && value.protocolVersion === PROTOCOL_VERSION, 'ping响应不符合协议'); return '协议可达' }, connected())
    await step('health', async () => { const value = await rpc<{ service: string; storage: string }>('health'); check(value.service === 'ready' && value.storage === 'ready', '服务或存储未就绪'); return '原服务与存储就绪' }, connected())
    await step('versions', async () => { const value = await rpc<{ service: string; protocol: string; runtimes: unknown }>('versions'); check(value.service && value.protocol === PROTOCOL_VERSION && value.runtimes, '缺少实际版本来源'); return `服务 ${value.service}；协议 ${value.protocol}` }, connected())
    await step('workspaces', async () => { const rows = await rpc<{ id: string }[]>('workspaces'); check(rows.some(row => row.id === client!.handshake?.workspaceId), '目录与握手工作空间不一致'); return `${rows.length}个工作空间` }, connected())
    await step('employees', async () => { const rows = await rpc<DigitalAgent[]>('employees'); check(Array.isArray(rows), '员工目录无效'); initialEmployees = rows.map(row => row.id); return `${rows.length}名员工；不输出个人配置` }, connected())
    await step('connections', async () => { const rows = await rpc<Connection[]>('connections'); check(Array.isArray(rows), '连接目录无效'); initialConnections = rows.map(row => row.id); return `${rows.length}个连接；不输出凭据` }, connected())
    await step('sources', async () => { const rows = await rpc<unknown[]>('sources', {}); check(Array.isArray(rows), '数据源目录无效'); return `${rows.length}个来源` }, connected())
    await step('sessions', async () => { const rows = await rpc<{ items: unknown[] }>('sessions', { limit: 1 }); check(Array.isArray(rows.items) && rows.items.length <= 1, '会话分页不符合上限'); return '有界会话查询通过' }, connected())
    await step('private-channel-rejected', async () => {
      try { await rpc('__boai_validation_private_method__'); throw new Error('未注册的私有方法被受理') } catch (error) { if (!(error instanceof CliError) || error.code !== 'CHANNEL_NOT_FOUND') throw error }
      return '未公开的方法已拒绝'
    }, connected())
    if (isolated) {
      report.requestId = requestId
      await step('prepare-dedicated-employee', async () => {
        if (!apiModel) { fixture = await openValidationFixture(marker); apiModel = { provider: 'openai-compatible', baseUrl: fixture.url, model: 'boai-validation', apiKey: 'controlled-validation-only' } }
        const connection = await rpc<Connection>('saveConnection', { name: `CLI validation ${requestId}`, provider: apiModel.provider ?? 'openai-compatible', baseUrl: apiModel.baseUrl ?? '', defaultModel: apiModel.model })
        check(!initialConnections.includes(connection.id), '验证连接意外复用了原连接')
        employee = await rpc<DigitalAgent>('saveAgent', { name: `CLI validation ${requestId}`, role: '明确的独立服务验证员工', instructions: '只执行本人给定的验证任务，不浏览网页、不调用命令、不读取其他文件。', color: '#777777', connectionId: connection.id, modelId: apiModel.model, skillIds: [], knowledgeIds: [], sourceIds: [], directoryGrants: [], allowBrowser: false, allowCommands: false, executionPermission: options.apiModel ? 'ask' : 'full-access', active: true })
        check(!initialEmployees.includes(employee.id), '验证员工意外复用了原员工')
        return '新建专用员工和连接；原员工保持'
      }, connected())
      await step('create-session', async () => { const result = await executeSessionOperation(client!, { kind: 'create', employeeId: employee!.id, name: 'CLI validation' }, `validation-create-${requestId}`); check(result.exitCode === 0 && result.result.state === 'completed', '会话创建回执尚未完成'); conversationId = result.result.conversationId; sessionCreated = true; return '原主私聊创建回执已确认' }, connected() && !!employee)
      await step('send-stream-and-tools', async () => {
        const content = `在当前会话执行验证：将以下原文写入 self:/work/boai-validation.txt，再用 read_file 读取同一文件，最后原样回复该原文。不要读取或修改其他文件，不要使用命令或浏览器。原文：${marker}`
        const code = await executeMessage(client!, { kind: 'send', conversationId: conversationId!, content, mentionIds: [], apiModel }, { requestId, waitTimeout: options.timeout, signal: options.signal, emit: event => { events.push(event) } })
        message = await rpc<Message | undefined>('getMessageReceipt', { requestId })
        const state = await rpc<MessageExecution | null>('getMessageExecution', { requestId })
        check(code === 0 && state?.state === 'completed' && state.activeRunIds.length === 0, '原消息执行未完成；保留请求身份和待批/待答状态')
        executionComplete = true
        check(message?.conversationId === conversationId && state.replyMessageIds.length > 0, '缺少原消息或公开答复')
        return '原执行与公开答复完成；流式过程已保留'
      }, connected() && sessionCreated)
      await step('file-and-tool-evidence', async () => {
        const found: string[] = []
        for (const name of await readdir(profile!, { recursive: true })) if (name.endsWith('/boai-validation.txt')) found.push(join(profile!, name))
        check(found.length === 1, '未找到唯一的实际验证文件')
        const file = found[0], info = await lstat(file); check(info.isFile() && !info.isSymbolicLink() && info.size < 1024 * 1024 && await realpath(file) === file, '验证文件身份无效'); originalFile = file
        const bytes = await readFile(file); check(bytes.toString('utf8') === marker, '实际文件内容与指定原文不一致')
        await writeFile(join(report.directory!, 'file-evidence.txt'), bytes, { flag: 'wx', mode: 0o600 })
        if (fixture) check(fixture.receipts.some(row => row.name === 'read_file' && (row.result as { content?: string })?.content === marker), '原文件读取工具未返回实际内容')
        artifactExported = true; return `实际文件sha256=${createHash('sha256').update(bytes).digest('hex')}`
      }, connected() && executionComplete)
      await step('history', async () => { const page = await rpc<ConversationMessagePage>('listConversationMessages', { conversationId, limit: 80 }); check(page.items.some(row => row.message?.id === message!.id) && page.items.some(row => row.message?.senderType === 'agent' && row.message.content.includes(marker)), '历史缺少原请求或实际答复'); return '历史中保留同一请求和答复' }, connected() && executionComplete)
      await step('duplicate-and-conflict', async () => {
        const count = fixture?.requests
        const duplicate = await rpc<Message>('sendMessage', { requestId, conversationId, content: message!.content, mentionIds: [], apiModel })
        check(duplicate.id === message!.id, '相同请求产生了另一条消息')
        try { await rpc('sendMessage', { requestId, conversationId, content: '冲突验证，不得执行', mentionIds: [], apiModel }); throw new Error('冲突请求未拒绝') } catch (error) { if (!(error instanceof CliError) || !['HANDLER_ERROR', 'INVALID_REQUEST'].includes(error.code)) throw error }
        check(count === fixture?.requests, '重复请求额外调用了受控模型'); return '原回执复用且冲突拒绝；零业务重发'
      }, connected() && executionComplete)
      await step('export-evidence', async () => { await writeFile(join(report.directory!, 'execution.json'), JSON.stringify({ requestId, events, ...(fixture ? { controlledRequests: fixture.requests, toolReceipts: fixture.receipts } : {}) }, null, 2), { flag: 'wx', mode: 0o600 }); return '过程原件已导出，之后才清理会话' }, !!report.directory, true)
      await step('delete-owned-session', async () => {
        const result = await executeSessionOperation(client!, { kind: 'delete', conversationId: conversationId! }, `validation-delete-${requestId}`)
        check(result.exitCode === 0, '会话清理尚未完成；保留原回执')
        const filesGone = await lstat(originalFile!).then(() => false, error => { if (error.code === 'ENOENT') return true; throw error })
        check(filesGone, '原会话文件尚未清理，证据副本保留')
        const sessions = await rpc<{ items: { id: string }[] }>('sessions', { employeeId: employee!.id, limit: 80 })
        check(!sessions.items.some(row => row.id === conversationId), '已清理会话仍在可见列表')
        return '原会话文件已清理、列表隐藏，导出的证据副本保留'
      }, connected() && executionComplete && artifactExported && results.some(row => row.step === 'export-evidence' && row.status === 'passed'))
    }
  } finally {
    if (server) await step('service-exit', async () => { report.service = await server!.finish(false, true); check(report.service.state === 'stopped', '服务仍有活动或其他客户端；保留原服务和目录'); return '本次服务实际退出；日志和验证目录保留' }, true, true)
    client?.destroy()
    if (fixture) { report.controlledRequests = fixture.requests; await fixture.close() }
  }
  report.passed = results.filter(row => row.status === 'passed').length
  report.failed = results.filter(row => row.status === 'failed').length
  report.skipped = results.filter(row => row.status === 'skipped').length
  report.exitCode = options.signal?.aborted ? 130 : report.failed || report.skipped ? 1 : 0
  report.elapsedMs = Math.round(performance.now() - started)
  if (report.directory) {
    try { await writeFile(join(report.directory, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }) }
    catch { report.results.push({ step: 'report-export', status: 'failed', detail: '验证报告未能保存；stdout仍包含本次结果', code: 'VALIDATION_FAILED', elapsedMs: 0 }); report.failed++; report.exitCode = 1 }
  }
  return report
}

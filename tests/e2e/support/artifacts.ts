/*
 * [OUTPUT]: 明确聊天夹具识别宿主追加的材料参考数据，不误选为成果任务。
 * [OUTPUT]: 可选明确revisionContent与隔离原样本生成命令；命令经原聊天逐次批准/真实执行后才publish，默认原交付与修订保持。
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [OUTPUT]: 可独立准备原有文件协议端点，供 UI 新员工贯穿场景复用；可选确定聊天回复，默认成果场景行为保持。
 * [INPUT]: 隔离 Desktop、真实 Mastra HTTP 请求/工具回执、宿主成果 API 与 SQLite 原件。
 * [OUTPUT]: 已有宿主明确接续时模型协议交付，不再对已回答原问题重复固定ask；执行期问题先真实write_file再report_work等待，原草稿单次副作用可核对。
 * [OUTPUT]: 真实Markdown/代码 write_file/publish_artifact/report_work 往返、D5原问题补充、普通聊天不接续等待、宿主授权修订身份、材料来源及丢回执核对。
 * [OUTPUT]: 取证读取使用已有库只读连接，不执行启动迁移或使正文索引失效。
 * [POS]: D2 成果 Electron 支撑；仅控制模型输出/传输故障，不替代工具、文件或事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import type { Desktop } from './desktop'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { ConversationDetail, DiscussionTurn, Message, WorkItem } from '../../../src/shared/domain'
import type { ArtifactAdoptionCurrent, ArtifactAdoptionEvent, ArtifactAdoptionInput, ArtifactAdoptionReceipt, ArtifactRevisionInput, ArtifactRevisionRequest, ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { ConversationMaterial } from '../../../src/shared/domain/materials'

interface ModelMessage { role: string; content: unknown; tool_calls?: { function: { name: string } }[] }
interface ModelTool { function: { name: string; description?: string } }
interface ReplyFaultState { submissions: (ArtifactAdoptionInput | ArtifactRevisionInput)[]; lookups: string[]; results: unknown[]; lookupUnavailable: boolean; lostReplies: number }
type Globals = typeof globalThis & { __boaiArtifactReplyFault: ReplyFaultState }
function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => typeof part.text === 'string' ? part.text : JSON.stringify(part)).join('\n')
  return JSON.stringify(content)
}
function sendTool(response: ServerResponse, name: string, args: unknown, index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `artifact-${index}`, object: 'chat.completion.chunk', model: 'artifacts-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: `artifact-tool-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }); emit({}, 'tool_calls')
  response.write(`data: ${JSON.stringify({ id: `artifact-${index}`, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}

interface ArtifactProtocolOptions { askForSupplement?: boolean; askDuringExecution?: boolean; file?: { name: string; fileName: string; content: string; revisionContent?: string; command?: string }; chatReplies?: Record<string, string> }
export async function prepareArtifactProtocol(runtime: Desktop, options: ArtifactProtocolOptions = {}) {
  const errors: string[] = [], runs = new Map<string, number>(), replacements: { runId: string; revisionRequestId: string }[] = []
  const executionQuestions: { runId: string; path: string; content: string; writeRequests: number }[] = []
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as ModelMessage[], system = messages.filter(value => value.role === 'system').map(value => contentText(value.content)).join('\n')
      if (system.includes('Private group request interpretation')) { sendTeamOutput(response, { mode: 'independent' }); return }
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(contentText(messages.at(-1)!.content)).data
        const current = data.currentTurnMessages?.find((message: { id: string; content: string }) => message.id === data.originalUserRequestId)
        if (current && Object.keys(options.chatReplies ?? {}).some(request => current.content === request || current.content.startsWith(request + '\n{\"referenceData\":true,'))) { sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'chat' }); return }
        if (current?.content === '这条是日常问候，请不要作为文件任务补充。') { sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'chat' }); return }
        sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: options.askForSupplement && !data.continuation?.replyToTurnIds?.length ? 'ask' : 'reply', responseKind: 'task', work: { key: `artifact-${data.originalUserRequestId}`, scope: '按明确请求发布可检查报告', deliverable: 'Markdown 报告和真实来源' } }); return
      }
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) {
        const input = JSON.parse(contentText(messages.at(-1)!.content)); sendTeamOutput(response, { action: 'publish', text: input.data.draft.text }); return
      }
      const tools = body.tools as ModelTool[] | undefined, writer = tools?.find(value => value.function.name === 'write_file')
      const currentRequest = [...messages].reverse().find(value => value.role === 'user' && contentText(value.content).includes('[CURRENT TURN USER REQUEST;'))
      const chatReply = currentRequest && Object.entries(options.chatReplies ?? {}).find(([request]) => contentText(currentRequest.content).includes(request))?.[1]
      if (chatReply) { sendTeamOutput(response, chatReply); return }
      if (!tools?.length && currentRequest && contentText(currentRequest.content).includes('这条是日常问候，请不要作为文件任务补充。')) { sendTeamOutput(response, '收到问候，原文件任务仍等待明确关联的补充。'); return }
      if (options.askForSupplement && !tools?.length) { sendTeamOutput(response, '请明确报告交付给谁？'); return }
      if (!writer) throw new Error('成果任务没有获得真实 write_file 工具')
      const runId = writer.function.description?.match(/self:\/runs\/([a-zA-Z0-9_-]+)\//)?.[1]
      if (!runId) throw new Error('宿主工具描述没有当前 run 的私有写入路径')
      if (options.askDuringExecution && !executionQuestions.length) executionQuestions.push({ runId, path: `self:/runs/${runId}/waiting-draft.md`, content: 'EXECUTION_QUESTION_DRAFT：提问前已经执行，补充不能重放此原草稿写入。\n', writeRequests: 0 })
      const executionQuestion = executionQuestions.find(value => value.runId === runId)
      if (executionQuestion) {
        const called = messages.flatMap(value => value.tool_calls ?? []).map(value => value.function.name)
        if (!called.includes('write_file')) { executionQuestion.writeRequests++; sendTool(response, 'write_file', { path: executionQuestion.path, content: executionQuestion.content }, index); return }
        if (!called.includes('report_work')) { sendTool(response, 'report_work', { disposition: 'waiting', summary: '已完成原草稿，仍需明确交付对象。', userQuestion: '请明确报告交付给谁？' }, index); return }
        sendTeamOutput(response, '请明确报告交付给谁？'); return
      }
      if (!runs.has(runId)) runs.set(runId, runs.size + 1)
      const publish = tools!.find(value => value.function.name === 'publish_artifact')!, revisionRequestId = publish.function.description?.match(/revisionRequestId=([a-zA-Z0-9_-]+)/)?.[1]
      if (revisionRequestId && !replacements.some(value => value.runId === runId)) replacements.push({ runId, revisionRequestId })
      const current = [...messages].reverse().find(value => value.role === 'user' && contentText(value.content).includes('[CURRENT TURN USER REQUEST;'))
      const source = current ? contentText(current.content) : ''
      const materialIds = [...new Set([...source.matchAll(/"materialId":"([0-9a-f-]{36})"/g), ...source.matchAll(/material:([0-9a-f-]{36}):text-v1:L2/g)].map(value => value[1]))]
      const version = revisionRequestId ? 'ARTIFACT_V2' : 'ARTIFACT_V1', text = `# 交付报告\n\n版本标记：${version}\n独立原件：REPORT_${runs.get(runId)}\n验收：逐项检查原件和来源。\n${materialIds.map(id => `材料依据：material:${id}:text-v1:L2`).join('\n')}\n`
      const path = `self:/runs/${runId}/${options.file?.fileName ?? 'report.md'}`, called = messages.flatMap(value => value.tool_calls ?? []).map(value => value.function.name)
      if (options.file?.command) {
        if (!called.includes('execute_command')) { sendTool(response, 'execute_command', { command: options.file.command }, index); return }
      } else if (!called.includes('write_file')) { sendTool(response, 'write_file', { path, content: (revisionRequestId ? options.file?.revisionContent ?? options.file?.content : options.file?.content) ?? text }, index); return }
      if (!called.includes('publish_artifact')) { sendTool(response, 'publish_artifact', { path, name: options.file?.name ?? '交付报告.md', ...(revisionRequestId ? { revisionRequestId } : {}) }, index); return }
      const artifactId = messages.filter(value => value.role === 'tool').map(value => { try { return JSON.parse(contentText(value.content))?.artifact?.id as string | undefined } catch { return undefined } }).find(Boolean)
      if (!artifactId) throw new Error('真实 publish_artifact 没有返回可检查成果身份')
      if (!called.includes('report_work')) { sendTool(response, 'report_work', { disposition: 'delivered', summary: '报告已发布，原件和来源可检查。', evidence: [{ kind: 'artifact', reference: artifactId }] }, index); return }
      sendTeamOutput(response, '交付报告已发布，可以打开原文检查内容和来源。')
    } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  })
  runtime.trackServer(endpoint.server)
  return { endpoint, errors, replacements, executionQuestions }
}

export async function prepareArtifactsDesktop(runtime: Desktop, options: ArtifactProtocolOptions = {}) {
  const { endpoint, errors, replacements, executionQuestions } = await prepareArtifactProtocol(runtime, options)
  const sourceRoot = join(await realpath(runtime.root), 'artifact-sources'); await mkdir(sourceRoot)
  const source = join(sourceRoot, '依据.txt'), materialText = '材料第一行\nARTIFACT_MATERIAL_EVIDENCE：真实原文依据。\n材料第三行\n'; await writeFile(source, materialText)
  await runtime.start()
  const setup = await runtime.page.evaluate(async ({ url, allowCommands }) => {
    const connection = await window.boai.request('saveConnection', { name: '成果离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'artifacts-fixture' }), snapshot = await window.boai.request('snapshot', undefined)
    const agent = snapshot.agents.find(value => value.id === 'researcher')!, { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, name: '成果作者', connectionId: connection.id, modelId: 'artifacts-fixture', allowCommands, expectedConfigVersion: configVersion })
    const group = await window.boai.request('createConversation', { kind: 'group', title: '成果协作组', agentIds: ['researcher'] }), other = await window.boai.request('createConversation', { kind: 'direct', title: '独立成果私聊', agentIds: ['researcher'] })
    return { group, other, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, { url: endpoint.url, allowCommands: !!options.file?.command })
  return { ...setup, endpoint, source, materialText, errors, replacements, executionQuestions }
}

/** Production request executes first. Only its acknowledgement and subsequent receipt transport fail. */
export async function artifactReplyFault(runtime: Desktop, kind: 'adoption' | 'revision', options: { loseReply?: boolean; lookupUnavailable?: boolean } = {}) {
  await runtime.app.evaluate(({ ipcMain }, { kind, options }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const submit = kind === 'adoption' ? 'adoptArtifact' : 'reviseArtifact', lookup = kind === 'adoption' ? 'getArtifactAdoptionReceipt' : 'getMessageReceipt'
    const state: ReplyFaultState = { submissions: [], lookups: [], results: [], lookupUnavailable: options.lookupUnavailable ?? true, lostReplies: 0 }; Object.assign(globalThis, { __boaiArtifactReplyFault: state })
    let loseReply = options.loseReply ?? true
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === submit) state.submissions.push(structuredClone(payload.input))
      if (payload.method === lookup) state.lookups.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === submit) { state.results.push(structuredClone(result)); if (loseReply) { loseReply = false; state.lostReplies++; throw new Error('验收：成果操作已提交，回复丢失') } }
      if (payload.method === lookup && state.lookupUnavailable) throw new Error('验收：成果回执暂不可读')
      return result
    })
  }, { kind, options })
  return { inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as Globals).__boaiArtifactReplyFault)), allowLookup: () => runtime.app.evaluate(() => { (globalThis as Globals).__boaiArtifactReplyFault.lookupUnavailable = false }) }
}
export const artifactPendingRequests = (runtime: Desktop) => runtime.page.evaluate(() => JSON.parse(localStorage.getItem('boai:artifacts:pending-requests') ?? '{}') as Record<string, { conversationId: string; logicalArtifactId: string; revision?: { input: ArtifactRevisionInput; status: string }; adoption?: { input: ArtifactAdoptionInput; status: string } }>)
export async function artifactRecords(dataPath: string) {
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try { return {
    artifacts: await store.load<ArtifactVersion>('artifacts'), revisions: await store.load<ArtifactRevisionRequest>('artifactRevisionRequests'), adoptionEvents: await store.load<ArtifactAdoptionEvent>('artifactAdoptionEvents'), adoptionCurrent: await store.load<ArtifactAdoptionCurrent>('artifactAdoptionCurrent'), adoptionReceipts: await store.load<ArtifactAdoptionReceipt>('artifactAdoptionReceipts'),
    messages: await store.load<Message>('messages'), turns: await store.load<DiscussionTurn>('turns'), workItems: await store.load<WorkItem>('workItems'), materials: await store.load<ConversationMaterial>('materials'), cleanups: await store.load<{ id: string; conversationId: string; status: string }>('artifactCleanups'), cleanupGates: await store.load<{ id: string }>('conversationCleanup'),
  } } finally { await store.close() }
}
export const artifactDetail = (runtime: Desktop, id: string): Promise<ConversationDetail> => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
export const artifactOriginal = (artifact: ArtifactVersion) => readFile(artifact.path, 'utf8')
export const changeArtifactOriginal = (artifact: ArtifactVersion, text: string) => writeFile(artifact.path, text)
export const removeArtifactOriginal = (artifact: ArtifactVersion) => rm(artifact.path)

/*
 * [OUTPUT]: 恢复扩展只在测试明确放行后允许一个新Run；旧Run恢复后的请求拒绝，不改变原四模式行为。
 * [INPUT]: 原Desktop、真实Mastra工具及自然分钟调度；本地HTTP只控制模型输出和连接故障。
 * [OUTPUT]: 命令审批/拒绝、真实文件后挂起/断流协议；记录实际工具请求、连接及错误，不替代审批或执行。
 * [POS]: DS11自然定时任务的隔离协议支撑，不使用手动触发、假时钟或真实供应商。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { ServerResponse } from 'node:http'
import type { Desktop } from './desktop'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'

export type NaturalMode = 'approve' | 'reject' | 'cancel' | 'disconnect'
export const naturalFileName = 'natural-receipt.txt'
export const naturalFileContent = 'NATURAL_EFFECT_ONCE\n'
type ModelMessage = { role: string; content: unknown; tool_calls?: { function: { name: string } }[] }
type ModelTool = { function: { name: string; description?: string } }
function text(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => typeof part.text === 'string' ? part.text : JSON.stringify(part)).join('\n')
  return JSON.stringify(content)
}
function tool(response: ServerResponse, name: string, args: unknown, index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `natural-${index}`, object: 'chat.completion.chunk', model: 'natural-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: `natural-tool-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }); emit({}, 'tool_calls')
  response.write(`data: ${JSON.stringify({ id: `natural-${index}`, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}
export async function naturalAutomationProtocol(runtime: Desktop, mode: NaturalMode) {
  const errors: string[] = [], held = new Set<ServerResponse>(), issued: { name: string; runId: string }[] = []
  let runId: string | undefined, recoveredRunId: string | undefined, recoveryAllowed = false, disconnected = false, brokenConnections = 0
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as ModelMessage[], system = messages.filter(m => m.role === 'system').map(m => text(m.content)).join('\n')
      if (system.includes('Private group request interpretation')) { sendTeamOutput(response, { mode: 'independent' }); return }
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(text(messages.at(-1)!.content)).data
        sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'task', work: { key: `natural-${data.originalUserRequestId}`, scope: '只执行一次本次文件工作', deliverable: '真实文件与准确处理状态' } }); return
      }
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { sendTeamOutput(response, { action: 'publish', text: JSON.parse(text(messages.at(-1)!.content)).data.draft.text }); return }
      const tools = body.tools as ModelTool[] | undefined
      const currentRun = tools?.find(t => t.function.name === 'write_file')?.function.description?.match(/self:\/runs\/([a-zA-Z0-9_-]+)\//)?.[1]
      if (!currentRun) throw Error('自然任务缺少宿主实际run路径')
      if (runId && runId !== currentRun) {
        if (!recoveryAllowed || recoveredRunId && recoveredRunId !== currentRun) throw Error('没有明确新请求的任务不应自动重建执行run')
        recoveredRunId = currentRun
      } else if (runId && recoveryAllowed) throw Error('恢复连接后不应继续旧Run')
      runId ??= currentRun
      const called = messages.flatMap(m => m.tool_calls ?? []).map(t => t.function.name)
      const send = (name: string, args: unknown) => {
        if (!tools!.some(t => t.function.name === name)) throw Error(`宿主未提供工具 ${name}`)
        issued.push({ name, runId: currentRun }); tool(response, name, args, index)
      }
      const path = `self:/runs/${currentRun}/${naturalFileName}`
      const effect = mode === 'approve' || mode === 'reject' ? 'execute_command' : 'write_file'
      if (!called.includes(effect)) {
        if (effect === 'execute_command') send(effect, { command: `printf 'NATURAL_EFFECT_ONCE\\n' >> ${naturalFileName}` })
        else send(effect, { path, content: naturalFileContent })
        return
      }
      if ((mode === 'cancel' || mode === 'disconnect') && currentRun !== recoveredRunId) {
        if (disconnected) { brokenConnections++; response.destroy(); return }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.flushHeaders()
        held.add(response); response.once('close', () => held.delete(response)); return
      }
      if (mode === 'reject') {
        if (!messages.filter(m => m.role === 'tool').some(m => /拒绝|declin|approved.*false/i.test(text(m.content)))) throw Error('拒绝协议未收到实际工具拒绝')
        if (!called.includes('report_work')) send('report_work', { disposition: 'blocked', summary: '用户拒绝命令，本次没有生成或交付文件。' })
        else sendTeamOutput(response, '用户拒绝命令，本次没有生成或交付文件。')
        return
      }
      if (!called.includes('publish_artifact')) { send('publish_artifact', { path, name: naturalFileName }); return }
      const artifactId = messages.filter(m => m.role === 'tool').map(m => { try { return JSON.parse(text(m.content))?.artifact?.id as string | undefined } catch { return undefined } }).find(Boolean)
      if (!artifactId) throw Error('真实发布未返回成果身份')
      if (!called.includes('report_work')) { send('report_work', { disposition: 'delivered', summary: '自然到期文件已交付。', evidence: [{ kind: 'artifact', reference: artifactId }] }); return }
      sendTeamOutput(response, '自然到期文件已交付，可以打开原件检查。')
    } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  })
  runtime.trackServer(endpoint.server)
  return { endpoint, errors, issued, runId: () => runId, recoveredRunId: () => recoveredRunId, held: () => held.size, brokenConnections: () => brokenConnections,
    disconnect() { disconnected = true; for (const response of held) { brokenConnections++; response.destroy() } },
    recoverForExplicitNewRun() {
      if (mode !== 'disconnect' || !disconnected || held.size) throw Error('只在原断流连接结束后准备明确新执行')
      recoveryAllowed = true; disconnected = false
    },
  }
}

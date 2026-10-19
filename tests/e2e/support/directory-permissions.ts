/*
 * [OUTPUT]: 可选本地源场景经实际Mastra调用，报告正文仅在目录批准后返回。
 * [INPUT]: 隔离Desktop、现有Chat协议夹具和实际员工/目录配置IPC。
 * [OUTPUT]: 当前员工命令申请两个业务目录，模型只提供确定工具调用，实际批准/进程/文件由产品执行。
 * [POS]: 员工目录审批桌面场景支撑；业务目录与BOAI数据目录分开，均在本场隔离根下。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'
import type { Desktop } from './desktop'

export async function prepareDirectoryPermissions(runtime: Desktop, sourceMode = false) {
  const root = await realpath(runtime.root), coding = join(root, 'coding'), reports = join(root, 'reports'), output = join(root, 'output')
  for (const directory of [coding, reports, output]) await mkdir(directory)
  const original = join(reports, 'input.txt'), result = join(output, 'result.txt'), marker = join(coding, 'executions.txt')
  await writeFile(original, 'DIRECTORY_REPORT_ORIGINAL')
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const command = `printf once >> ${quote(marker)}; /bin/cat ${quote(original)} > ${quote(result)}`
  const directories = [{ path: reports, access: 'read-only' as const }, { path: output, access: 'read-write' as const }]
  const errors: string[] = []
  let sourceId: string | undefined
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as { role: string; content: string; tool_calls?: { function: { name: string } }[] }[]
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(messages.at(-1)!.content).data
        sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'task', work: { key: `directories-${data.originalUserRequestId}`, scope: '按明确目录读取报告并保存结果', deliverable: '实际命令结果' } }); return
      }
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) {
        sendTeamOutput(response, { action: 'publish', text: JSON.parse(messages.at(-1)!.content).data.draft.text }); return
      }
      if (!messages.some(message => message.role === 'tool')) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        for (const [delta, finish_reason] of [[{ role: 'assistant' }, null], [{ tool_calls: [{ index: 0, id: `directory-tool-${index}`, type: 'function', function: { name: 'execute_command', arguments: JSON.stringify({ command, directories }) } }] }, null], [{}, 'tool_calls']]) {
          const actualDelta = sourceMode && delta && typeof delta === 'object' && 'tool_calls' in delta ? { tool_calls: [{ index: 0, id: `source-directory-${index}`, type: 'function', function: { name: 'call_data_source', arguments: JSON.stringify({ sourceId, tool: 'files', arguments: { operation: 'read', path: 'input.txt' } }) } }] } : delta
          response.write(`data: ${JSON.stringify({ id: `directory-${index}`, object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: actualDelta, finish_reason }] })}\n\n`)
        }
        response.end('data: [DONE]\n\n'); return
      }
      if (sourceMode) {
        const result = messages.filter(message => message.role === 'tool').map(message => message.content).join('\n')
        if (!result.includes('DIRECTORY_REPORT_ORIGINAL')) throw new Error('目录批准后没有读到实际源正文')
        sendTeamOutput(response, '实际源正文：DIRECTORY_REPORT_ORIGINAL')
      } else sendTeamOutput(response, '本次命令处理已结束，请查看实际执行结果。')
    } catch (error) { errors.push(String(error)); response.writeHead(500); response.end() }
  })
  runtime.trackServer(endpoint.server)
  await runtime.start({ dataDir: join(root, 'product') })
  const setup = await runtime.page.evaluate(async ({ url, coding }) => {
    const connection = await window.boai.request('saveConnection', { name: '目录审批离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    const saved = await window.boai.request('saveAgent', { ...input, name: '目录同事', connectionId: connection.id, modelId: 'fixture', executionPermission: 'ask', directoryGrants: [{ path: coding, access: 'read-write' }], expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision })
    const conversation = await window.boai.request('createConversation', { kind: 'direct', title: '目录同事', agentIds: [saved.id] })
    return { agent: saved, conversation }
  }, { url: endpoint.url, coding })
  if (sourceMode) {
    sourceId = await runtime.page.evaluate(async ({ reports, employeeId }) => {
      const source = await window.boai.request('saveDataSource', { id: crypto.randomUUID(), expectedRevision: 0, config: { name: '报告源', description: '', guide: '', enabled: true, type: 'local', local: { path: reports } } })
      const employee = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === employeeId)!
      const { configVersion, directoryRevision, workspaceRef, memoryNamespace, policyVersion, ...definition } = employee
      await window.boai.request('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, sourceIds: [source.id] })
      return source.id
    }, { reports, employeeId: setup.agent.id })
  }
  return { ...setup, endpoint, errors, coding, reports, output, original, result, marker, command, directories }
}

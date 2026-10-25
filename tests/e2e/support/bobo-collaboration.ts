/*
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [INPUT]: 隔离 Desktop、实际 Mastra HTTP/工具协议、通讯录员工配置与真实工作结果。
 * [OUTPUT]: 普通讨论/组织模式、仅补缺员与群中两位员工文件交付的有界本地协议；实际写入后并行声明发布与公开回答，核对原件再结束；查询失联不替换发布或调度。
 * [POS]: BC1–BC4 Electron 支撑；本地确定性模型不作为真实供应商或人工质量通过证据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ServerResponse } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'
import type { Desktop } from './desktop'
import type { Snapshot, WorkItem } from '../../../packages/shared/src/domain'
import type { EmployeeCandidatePage } from '../../../packages/shared/src/domain/bobo-collaboration'

interface ModelMessage { role: string; content: unknown; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }
interface ModelTool { function: { name: string; description?: string } }
export type OrganizationMode = 'employee_creation' | 'organize_only' | 'organize_and_execute'
export const COLLABORATION_REPORT_MARKER = 'BC_GROUP_EMPLOYEE_REPORT_真实独立员工'
export const COLLABORATION_RESEARCH_MARKER = 'BC_RESEARCH_DATA_数据原件'
export const collaborationPrompts = {
  discussion: '先和我讨论写作方案，不用创建员工，不用建群，也不用执行任务。',
  organize_only: '请只用已有研究员和写作员拉一个独立协作群，说明报告目标和建议分工，先不要执行。',
  organize_and_execute: '请用已有研究员，缺少写作员就创建一位，然后拉一个独立群实际完成有依赖的报告任务。研究员先核算12、27、40的合计并发布数据原件，写作员读取该真实原件后撰写并发布报告，bobo最后核对两份成果。',
  employee_creation: '请只创建一位编辑员工，先不要拉群，也不要让新员工执行任何任务。',
} as const
function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => typeof part?.text === 'string' ? part.text : JSON.stringify(part)).join('\n')
  return JSON.stringify(content)
}
function sendTool(response: ServerResponse, name: string, args: unknown, index: number) {
  sendTools(response, [{ name, args }], index)
}
function sendTools(response: ServerResponse, calls: { name: string; args: unknown }[], index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `bobo-collaboration-${index}`, object: 'chat.completion.chunk', model: 'bobo-collaboration-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' }); emit({ tool_calls: calls.map((call, position) => ({ index: position, id: `bobo-collaboration-tool-${index}-${position}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) }); emit({}, 'tool_calls')
  response.write(`data: ${JSON.stringify({ id: `bobo-collaboration-${index}`, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}
function parsedResults(messages: ModelMessage[]): any[] {
  return messages.filter(message => message.role === 'tool').flatMap(message => { try { return [JSON.parse(contentText(message.content))] } catch { return [] } })
}
function claimedWork(system: string): WorkItem | undefined {
  const json = system.match(/Your host-claimed work: (.*?)\. Before the final answer/s)?.[1]
  return json ? JSON.parse(json) as WorkItem : undefined
}

export async function prepareBoboCollaborationDesktop(runtime: Desktop, options: { missingWriter?: boolean; holdOrganization?: boolean } = {}) {
  const errors: string[] = [], actualWorkRuns = new Set<string>(), published = new Map<string, { id: string; path: string; text: string }>()
  let hold: { response: ServerResponse; work: WorkItem; messages: ModelMessage[]; index: number } | undefined
  const state = { organizationHeld: false, organizationReleased: false, mode: 'organize_only' as OrganizationMode, coreId: '', dataPath: '', connectionId: '', before: undefined as Snapshot | undefined, privateId: '', originalEmployees: new Map<string, { config: unknown; text: string }>() }
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as ModelMessage[], system = messages.filter(message => message.role === 'system').map(message => contentText(message.content)).join('\n')
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { const input = JSON.parse(contentText(messages.at(-1)!.content)); sendTeamOutput(response, { action: 'publish', text: input.data.draft.text, ...(input.data.draft.outcome ? { outcome: input.data.draft.outcome } : {}) }); return }
      if (system.includes('Private group request interpretation')) { sendTeamOutput(response, { mode: 'independent' }); return }
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(contentText(messages.at(-1)!.content)).data
        const original = data.currentTurnMessages?.find((message: { id: string; content: string }) => message.id === data.originalUserRequestId)
        if (data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length) { sendTeamOutput(response, { action: 'pass' }); return }
        if (data.currentEmployeeId !== 'bobo') { sendTeamOutput(response, { action: 'pass' }); return }
        if (!original || original.content === collaborationPrompts.discussion) { sendTeamOutput(response, { action: 'reply', responseKind: 'chat' }); return }
        const mode = Object.entries(collaborationPrompts).find(([, prompt]) => prompt === original.content)?.[0] as OrganizationMode | undefined
        if (!mode || mode === ('discussion' as string)) throw new Error('组织判断未取得原始明确用户请求')
        state.mode = mode
        sendTeamOutput(response, { action: 'reply', responseKind: 'task', work: { key: 'main', scope: '查找真实员工并组织本次需求', deliverable: '真实组织回执', organization: { mode, goal: original.content } } }); return
      }
      const work = claimedWork(system), tools = body.tools as ModelTool[] | undefined
      if (!work) { sendTeamOutput(response, '可以先讨论目标和所需角色。当前没有创建员工或群，也没有开始执行。'); return }
      actualWorkRuns.add(`${work.id}:${work.activeRunId}`)
      const called = messages.flatMap(message => message.tool_calls ?? []).map(call => call.function.name), results = parsedResults(messages)
      if (work.organization) {
        if (!tools?.some(tool => tool.function.name === 'find_employees') || !tools.some(tool => tool.function.name === 'organize_collaboration')) throw new Error('原 core 组织 Work 未获得真实组织工具')
        if (!called.includes('find_employees')) { sendTool(response, 'find_employees', { search: '', limit: 20 }, index); return }
        if (!called.includes('organize_collaboration')) {
          if (options.holdOrganization && !state.organizationReleased) { state.organizationHeld = true; hold = { response, work, messages, index }; return }
          sendTool(response, 'organize_collaboration', organizationPayload(work, results, options.missingWriter ?? false), index); return
        }
        const operation = results.find(result => result.operation?.id)?.operation ?? results.find(result => result.id && result.status === 'committed')
        if (!operation?.id) throw new Error(`真实组织工具没有返回已提交对象身份：${JSON.stringify(results).slice(0,2000)}`)
        if (!called.includes('report_work')) { sendTool(response, 'report_work', { disposition: 'delivered', summary: '本次组织结果已经提交，真实员工入口可核对。', evidence: [{ kind: 'collaboration', reference: operation.id }] }, index); return }
        sendTeamOutput(response, '已按你的要求组织完成。原讨论会话继续保留，可以通过下方真实入口查看员工和群。'); return
      }
      groupTask(response, index, work, messages, system, tools ?? [], published)
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  })
  runtime.trackServer(endpoint.server); runtime.defer(async () => { if (hold) { hold.response.end(); hold = undefined } })
  await runtime.start()
  const setup = await runtime.page.evaluate(async ({ url, missingWriter }) => {
    const connection = await window.boai.request('saveConnection', { name: 'bobo 群协作离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'bobo-collaboration-fixture' }), snapshot = await window.boai.request('snapshot', undefined)
    for (const employee of snapshot.agents) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = employee
      await window.boai.request('saveAgent', { ...input, name: employee.id === 'researcher' ? '已有研究员' : employee.id === 'writer' ? '已有写作员' : employee.name, connectionId: connection.id, modelId: 'bobo-collaboration-fixture', active: employee.id === 'bobo' || employee.id === 'researcher' || employee.id === 'writer' && !missingWriter, allowCommands: false, allowBrowser: false, expectedConfigVersion: configVersion })
    }
    const privateConversation = await window.boai.request('createConversation', { kind: 'direct', title: '研究员原有私聊', agentIds: ['researcher'] })
    return { connectionId: connection.id, privateId: privateConversation.id, before: await window.boai.request('snapshot', undefined) }
  }, { url: endpoint.url, missingWriter: options.missingWriter ?? false })
  state.connectionId = setup.connectionId; state.privateId = setup.privateId; state.before = setup.before; state.dataPath = setup.before.dataPath
  for (const employee of setup.before.agents.filter(agent => agent.id !== 'bobo')) state.originalEmployees.set(employee.id, { config: employee, text: await readFile(join(state.dataPath, 'agents', employee.id, 'workspace', 'AGENTS.md'), 'utf8') })
  const privateSentinel = join(state.dataPath, 'agents', 'researcher', 'workspace', 'sessions', state.privateId, 'private-existing.txt')
  await mkdir(dirname(privateSentinel), { recursive: true })
  await writeFile(privateSentinel, 'BC_PRIVATE_SESSION_独立私聊不能被群解散删除')
  return { state, endpoint, errors, actualWorkRuns, published, privateSentinel, releaseOrganization: () => { state.organizationReleased = true; if (hold) { const current = hold; hold = undefined; sendTool(current.response, 'organize_collaboration', organizationPayload(current.work, parsedResults(current.messages), options.missingWriter ?? false), current.index) } } }
}

function organizationPayload(work: WorkItem, results: any[], missingWriter: boolean): unknown {
  const candidates = results.find(result => Array.isArray(result.employees)) as EmployeeCandidatePage | undefined
  if (!candidates) throw new Error('实际 find_employees 没有返回员工摘要')
  if (work.organization?.mode === 'employee_creation') return { existingMembers: [], newEmployees: [{ name: '新建编辑', role: '审核文字与事实', instructions: '保持独立身份，按明确用户请求审核材料，不自动开始任务。' }] }
  const selected = candidates.employees.filter(candidate => candidate.agentId === 'researcher' || !missingWriter && candidate.agentId === 'writer')
  if (selected.length !== (missingWriter ? 1 : 2)) throw new Error('实际候选不满足用户指定的原员工身份')
  return { existingMembers: selected.map(({ agentId, configVersion }) => ({ agentId, configVersion })), newEmployees: missingWriter ? [{ name: '新建写作员', role: '根据真实研究成果撰写报告', instructions: '保持独立员工身份，先读取群中已发布研究成果，再写作并发布自己的文件。' }] : [], groupTitle: 'bobo 独立报告协作群', announcement: work.organization?.mode === 'organize_only' ? 'BC_BOBO_ANNOUNCEMENT：本群目标是研究与撰写报告，已有研究员负责核对数据，已有写作员负责撰写。当前只组织，先讨论，不启动实际任务。' : 'BC_BOBO_ANNOUNCEMENT：请完成报告。研究员先核算12、27、40的合计并发布数据原件，写作员等待该真实数据成果，再读取并发布报告。我会核对双方实际成果。' }
}
function groupTask(response: ServerResponse, index: number, work: WorkItem, messages: ModelMessage[], system: string, tools: ModelTool[], published: Map<string, { id: string; path: string; text: string }>) {
  const called = messages.flatMap(message => message.tool_calls ?? []).map(call => call.function.name), results = parsedResults(messages)
  if (work.ownerAgentId === 'bobo') {
    const items = JSON.parse(system.match(/Available authorized work records: (.*?)\. Confirmed effects/s)?.[1] ?? '[]') as WorkItem[]
    const members = JSON.parse(system.match(/Eligible current members for delegate_work \(use their exact IDs\): (\[[^\n]*\])/)?.[1] ?? '[]') as { id: string; name: string; role: string }[]
    const fromTools = results.filter(result => result?.id?.startsWith('work-')) as WorkItem[]
    const research = items.find(item => item.parentWorkId === work.id && item.key === 'research-facts') ?? fromTools.find(result => result.key === 'research-facts')
    const writer = items.find(item => item.parentWorkId === work.id && item.key === 'draft-report') ?? fromTools.find(result => result.key === 'draft-report')
    if (!research) { sendTool(response, 'delegate_work', { key: 'research-facts', ownerAgentId: 'researcher', scope: '研究员核算12、27、40的合计，并发布真实 Markdown 数据原件', deliverable: '研究数据原件' }, index); return }
    if (!writer) {
        const employee = members.find(member => member.id !== 'bobo' && member.id !== 'researcher' && member.role.includes('写'))
        if (!employee) throw new Error('当前群不存在真实写作成员')
        sendTool(response, 'delegate_work', { key: 'draft-report', ownerAgentId: employee.id, scope: '写作员读取研究员已发布原件，再撰写并发布独立报告', deliverable: '依赖真实研究数据的报告', dependencies: [{ workId: research.id, resultVersion: Math.max(1, research.resultVersion) }] }, index); return
    }
    if (research.status !== 'delivered' || writer.status !== 'delivered') {
      if (!called.includes('wait_for_work')) { sendTools(response, [{ name: 'wait_for_work', args: { dependencies: [{ workId: research.id, resultVersion: 1 }, { workId: writer.id, resultVersion: 1 }], nextStep: '两名员工依赖交付后核对明确工作结果与已登记成果并汇总' } }, { name: 'report_work', args: { disposition: 'waiting', summary: '等待成员的真实文件交付。' } }], index); return }
      sendTeamOutput(response, '已说明本次分工，正在等待成员的真实文件交付。'); return
    }
    if (!research.artifactIds.length || !writer.artifactIds.length || published.size < 2) throw new Error('不能把未登记的成员成果汇总为完成')
    const summary = `研究员和写作员已分别发布可核对成果，合计为79。研究成果：${research.artifactIds[0]}；写作成果：${writer.artifactIds[0]}。`
    if (!called.includes('report_work')) { sendTool(response, 'report_work', { disposition: 'delivered', summary, evidence: [{ kind: 'answer', reference: summary }] }, index); return }
    sendTeamOutput(response, summary); return
  }
  const writing = work.key === 'draft-report', research = published.get('researcher')
  if (writing && !called.includes('read_file')) { if (!research) throw new Error('写作员不能在研究原件实际发布前读取或编造资料'); sendTool(response, 'read_file', { path: research.path }, index); return }
  if (writing && !results.some(result => typeof result.content === 'string' && result.content.includes(COLLABORATION_RESEARCH_MARKER) || typeof result === 'string' && result.includes(COLLABORATION_RESEARCH_MARKER))) {
    const actualRead = messages.filter(message => message.role === 'tool').map(message => contentText(message.content)).join('\n')
    if (!actualRead.includes(COLLABORATION_RESEARCH_MARKER)) throw new Error('写作员实际 read_file 回执没有研究原件正文')
  }
  const runId = tools.find(tool => tool.function.name === 'write_file')?.function.description?.match(/self:\/runs\/([a-zA-Z0-9_-]+)\//)?.[1]
  if (!runId) throw new Error('独立员工的实际文件工具未提供当前 Run 写入路径')
  const text = writing ? `# 协作报告\n\n${COLLABORATION_REPORT_MARKER}\n依据研究员的已发布原件：12、27、40，合计79。\n研究成果ID：${research!.id}\n` : `# 研究数据\n\n${COLLABORATION_RESEARCH_MARKER}\n12 + 27 + 40 = 79。\n`
  const path = `self:/runs/${runId}/${writing ? 'report' : 'research'}.md`
  if (!called.includes('write_file')) { sendTool(response, 'write_file', { path, content: text }, index); return }
  const summary = writing ? '我已读取研究员的真实原件，独立写作报告已发布。' : '我已核算三项数据，独立研究数据原件已发布。'
  if (!called.includes('publish_artifact')) {
    // Both tools use facts already obtained by this employee. Artifact identities are
    // verified from their actual receipts before the next model response is finished.
    sendTools(response, [{ name: 'publish_artifact', args: { path, name: writing ? '独立写作报告.md' : '独立研究数据.md' } }, { name: 'report_work', args: { disposition: 'delivered', summary, evidence: [{ kind: 'answer', reference: summary }] } }], index); return
  }
  const publication = results.find(result => result.artifact?.id && result.sharedPath)
  if (!publication) throw new Error('独立员工发布工具没有返回真实 Artifact/共享路径')
  published.set(work.ownerAgentId, { id: publication.artifact.id, path: publication.sharedPath, text })
  if (!called.includes('report_work')) throw new Error('缺少独立员工的真实公开交付声明')
  sendTeamOutput(response, summary)
}

export function boboCollaborationRecords(dataPath: string) {
  const db = new DatabaseSync(join(dataPath, 'boai.sqlite'), { readOnly: true }), load = (collection: string) => db.prepare('SELECT value FROM records WHERE collection=?').all(collection).map(row => JSON.parse(String(row.value)))
  try { return { operations: load('boboCollaborations'), starts: load('collaborationStarts'), works: load('workItems') as WorkItem[], budgets: load('workBudgets'), modelCalls: load('budgetModelCalls'), agents: load('agents'), conversations: load('conversations'), messages: load('messages'), artifacts: load('artifacts') } } finally { db.close() }
}

/*
 * [INPUT]: 原Desktop、既有Codex/Claude真实stdio夹具和两个同群员工。
 * [OUTPUT]: 双员工独立原生请求/会话、实际工作目录及协议文件指纹；不记录Claude argv或内部凭据正文。
 * [POS]: DS03群待决UI支撑，复用生产驱动/原fixture，不调用真实供应商。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { copyFile, chmod, readFile, realpath, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { AgentRun, DigitalAgent } from '../../../packages/shared/src/domain'
import type { Desktop } from './desktop'

export async function prepareNativeGroup(runtime: Desktop, kind: 'codex' | 'claude', mode: 'input' | 'approval') {
  const executable = join(await realpath(runtime.root), `${kind}-group-pending.mjs`)
  await copyFile(resolve(kind === 'codex' ? 'tests/fixtures/native-conversation.mjs' : 'tests/fixtures/native-claude-conversation.mjs'), executable)
  await chmod(executable, 0o700)
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(await realpath(runtime.root), 'native-business.mjs'))
  await runtime.start()
  const setup = await runtime.page.evaluate(async ({ kind, executable, mode }) => {
    const draft = { name: `双待决${kind}`, executable, args: [], protocol: kind === 'codex' ? 'codex-app-server' as const : 'claude-cli' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
    await window.boai.request('testLaunchProfileDraft', draft)
    const profile = await window.boai.request('saveLaunchProfile', draft), agents = []
    for (const name of ['第一位提问员工', '第二位提问员工']) agents.push(await window.boai.request('saveAgent', { name, role: '独立处理本人请求', instructions: '只处理本人明确请求，等待用户时保持原运行。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: kind === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, executionPermission: 'ask', skillIds: [], knowledgeIds: [], allowCommands: true, active: true }))
    const chat = await window.boai.request('createConversation', { kind: 'group', title: `${kind}同群双${mode}`, agentIds: agents.map(agent => agent.id) })
    return { profile, agents, chat, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, { kind, executable, mode })
  return { ...setup, kind, mode, executable }
}
export type NativeGroup = Awaited<ReturnType<typeof prepareNativeGroup>>
export const nativeGroupDetail = (runtime: Desktop, group: NativeGroup) => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), group.chat.id)
export const nativeGroupActions = (runtime: Desktop, group: NativeGroup, runs: AgentRun[]) => runtime.page.evaluate(async ({ conversationId, runIds }) => (await Promise.all(runIds.map(runId => window.boai.request('listNativeActions', { conversationId, runId })))).flat(), { conversationId: group.chat.id, runIds: runs.map(run => run.id) })
export const nativeGroupWork = (group: NativeGroup, agent: DigitalAgent) => join(group.dataPath, 'agents', agent.id, 'workspace', 'sessions', group.chat.id, 'work')
export async function nativeGroupProtocolFiles(group: NativeGroup) {
  const files = []
  for (const agent of group.agents) for (const name of ['native-thread-requests.jsonl', 'native-turn-requests.jsonl']) {
    const file = join(nativeGroupWork(group, agent), name), bytes = await readFile(file), info = await stat(file)
    // Claude thread records contain invocation metadata: archive only fingerprints, never argv/config contents.
    files.push({ agentId: agent.id, name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, lines: bytes.toString('utf8').trim().split('\n').length, mtime: info.mtimeMs })
  }
  return files
}

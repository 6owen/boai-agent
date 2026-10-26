/*
 * [OUTPUT]: 资源版本核验可由旧知识目录预览/替换复用，沿相同文件界限。
 * [OUTPUT]: 资源文本读取严格UTF-8并保留原字节hash，拒绝二进制替代字符。
 * [INPUT]: 当前员工/会话授权、资源身份及受管文件。
 * [OUTPUT]: 冻结资源版本并排除撤权知识；知识内容身份替换使原计划失效，不使不含该资料的计划失效。
 * [POS]: API与本机运行共用的资源授权及文件版本边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { Conversation, DigitalAgent, EmployeeEnvironmentStatus, Resource, RunEnvironmentSummary, SessionWorkspace, SkillReadiness } from '@boai/shared/domain'
import { boundedRead, initializeWorkspace, restrictedPath } from './file-access'

export interface ResourceVersion {
  resource: Resource
  hash: string
  files: { path: string; hash: string; size: number }[]
}
export interface RunEnvironmentPlan {
  version: 1
  agentId: string
  conversationId: string
  runId: string
  configVersion: number
  policyVersion: number
  workspace: SessionWorkspace
  skills: ResourceVersion[]
  knowledge: ResourceVersion[]
  summary: RunEnvironmentSummary
}
export type EnvironmentInput = {
  agent: DigitalAgent; conversation: Conversation; resources: Resource[]; runId: string
  workspace?: SessionWorkspace; signal: AbortSignal
}
const commandMode = (agent: DigitalAgent) => !agent.allowCommands || agent.executionPermission === 'read-only' ? 'disabled' as const : agent.executionPermission === 'full-access' ? 'host-allowed' as const : 'host-approved' as const
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/** One authorization rule for context, memory provenance, and every task adapter. */
export function authorizedResources(agent: DigitalAgent, conversation: Conversation, resources: Iterable<Resource>): Resource[] {
  const skills = new Set(agent.skillIds)
  const knowledge = new Set(conversation.kind === 'group' || conversation.channel || conversation.purpose === 'channel-internal' ? agent.knowledgeIds.filter(id => conversation.sharedKnowledgeIds.includes(id)) : agent.knowledgeIds)
  return [...resources].filter(resource => !resource.knowledge?.revoked && (!resource.ownerAgentId || resource.ownerAgentId === agent.id) && (resource.kind === 'skill' ? skills.has(resource.id) : knowledge.has(resource.id))).map(resource => structuredClone(resource))
}

/** Hash bounded, ordinary files without following links. No executable content is run. */
export async function resourceVersion(resource: Resource, signal: AbortSignal): Promise<ResourceVersion> {
  const suppliedRoot = path.resolve(resource.path)
  const root = await restrictedPath([suppliedRoot], suppliedRoot), files: ResourceVersion['files'] = []
  let count = 0, bytes = 0
  const visit = async (file: string, depth: number): Promise<void> => {
    signal.throwIfAborted()
    if (++count > 2000 || depth > 32) throw new Error('资源目录超出检查上限')
    const safe = await restrictedPath([root], file), info = await lstat(safe)
    if (info.isDirectory()) {
      for (const name of (await readdir(safe)).sort()) await visit(path.join(safe, name), depth + 1)
      return
    }
    if (!info.isFile() || info.nlink > 1) throw new Error('资源只能包含普通文件，不能包含链接')
    const handle = await open(safe, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.nlink > 1) throw new Error('资源不是普通文件')
      const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024)
      let size = 0
      for (;;) {
        signal.throwIfAborted()
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
        if (!bytesRead) break
        size += bytesRead; bytes += bytesRead
        if (bytes > 100 * 1024 * 1024) throw new Error('资源包不能超过 100 MB')
        hash.update(buffer.subarray(0, bytesRead))
      }
      const after = await handle.stat()
      if (size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('资源正在变化，请重新执行')
      files.push({ path: safe, hash: hash.digest('hex'), size })
    } finally { await handle.close() }
  }
  await visit(root, 0)
  if (resource.knowledge && (files.length !== 1 || files[0].path !== root || files[0].hash !== resource.knowledge.contentHash || files[0].size !== resource.knowledge.size)) throw new Error('知识资料副本已被外部修改，请核对资料后重新执行')
  return { resource: { ...structuredClone(resource), path: root }, files, hash: digest(JSON.stringify(files.map(file => ({ path: path.relative(root, file.path), hash: file.hash, size: file.size })))) }
}

export async function readVersionedText(file: string, versions: ResourceVersion[]): Promise<string> {
  const version = versions.find(version => version.files.some(entry => entry.path === file))
  const expected = version?.files.find(entry => entry.path === file)
  if (!version || !expected) throw new Error('文件不属于本次运行授权的资源版本')
  const text = await boundedRead(await restrictedPath([path.resolve(version.resource.path)], file), { strictUtf8: true })
  if (digest(text) !== expected.hash) throw new Error('资源内容已变更，请重新执行以使用新版本')
  return text
}

function checkSkillNames(resources: Resource[]) {
  const names = resources.filter(resource => resource.kind === 'skill').map(resource => resource.name)
  if (new Set(names).size !== names.length) throw new Error('员工绑定了同名 Skill，请明确选择一个来源')
}

export async function prepareEnvironment(input: EnvironmentInput): Promise<RunEnvironmentPlan> {
  input.signal.throwIfAborted()
  const workspace = await initializeWorkspace(input)
  const resources = authorizedResources(input.agent, input.conversation, input.resources)
  checkSkillNames(resources)
  const versions: ResourceVersion[] = []
  for (const resource of resources) versions.push(await resourceVersion(resource, input.signal))
  input.signal.throwIfAborted()
  const mode = commandMode(input.agent)
  const identity = { agentId: input.agent.id, conversationId: input.conversation.id, runId: input.runId, configVersion: input.agent.configVersion, policyVersion: input.agent.policyVersion ?? 2 }
  const resourceVersions = versions.map(version => ({ id: version.resource.id, hash: version.hash }))
  const summary: RunEnvironmentSummary = { version: 1, ...identity, commandMode: mode, isolation: 'application', policyHash: digest(JSON.stringify({ ...identity, workspace, resourceVersions, commandMode: mode })), resourceVersions }
  return { version: 1, ...identity, workspace, skills: versions.filter(version => version.resource.kind === 'skill'), knowledge: versions.filter(version => version.resource.kind === 'knowledge'), summary }
}

export function assertEnvironmentScope(plan: RunEnvironmentPlan, input: EnvironmentInput) {
  input.signal.throwIfAborted()
  const ids = authorizedResources(input.agent, input.conversation, input.resources).map(resource => resource.id).sort()
  const planned = [...plan.skills, ...plan.knowledge].map(version => version.resource.id).sort()
  for (const version of plan.knowledge) {
    const current = input.resources.find(resource => resource.id === version.resource.id)
    if (current?.knowledge?.copyId !== version.resource.knowledge?.copyId || current?.knowledge?.revision !== version.resource.knowledge?.revision) throw new Error('知识资料内容已变更，请重新执行')
  }
  if (plan.agentId !== input.agent.id || plan.conversationId !== input.conversation.id || plan.runId !== input.runId || plan.configVersion !== input.agent.configVersion || plan.policyVersion !== (input.agent.policyVersion ?? 2) || JSON.stringify(ids) !== JSON.stringify(planned) || plan.summary.commandMode !== commandMode(input.agent)) throw new Error('运行环境授权已变更，请重新执行')
  if (!input.workspace || Object.entries(plan.workspace).some(([key, value]) => path.resolve(input.workspace![key as keyof SessionWorkspace]) !== value)) throw new Error('运行环境不属于当前会话工作区')
}

export async function describeEnvironment(agent: DigitalAgent, resources: Iterable<Resource>): Promise<EmployeeEnvironmentStatus> {
  const bound = [...resources].filter(resource => resource.kind === 'skill' && agent.skillIds.includes(resource.id) && (!resource.ownerAgentId || resource.ownerAgentId === agent.id))
  const skills: SkillReadiness[] = []
  for (const resource of bound) {
    try {
      if (bound.filter(item => item.name === resource.name).length > 1) throw new Error('存在同名技能，请只绑定一个来源')
      const version = await resourceVersion(resource, new AbortController().signal)
      const source = await readVersionedText(path.join(version.resource.path, 'SKILL.md'), [version])
      const metadata = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
      const name = metadata?.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2')
      if (!metadata || name !== resource.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64 || !/^description:\s*\S/m.test(metadata)) throw new Error('SKILL.md 元数据无效或名称与目录不一致')
      skills.push({ resourceId: resource.id, name: resource.name, instructions: 'available', contentHash: version.hash, execution: agent.allowCommands ? 'not_checked' : 'disabled', detail: agent.allowCommands ? agent.executionPermission === 'full-access' ? '说明可读取；运行时和依赖尚未验证，执行无需逐次批准。' : '说明可读取；运行时和依赖尚未验证，执行仍需逐次授权。' : '说明可读取；该员工未启用命令执行。' })
    } catch (error) {
      skills.push({ resourceId: resource.id, name: resource.name, instructions: 'invalid', execution: 'not_checked', detail: error instanceof Error ? error.message : '无法读取技能' })
    }
  }
  for (const id of agent.skillIds.filter(id => !bound.some(resource => resource.id === id))) skills.push({ resourceId: id, name: id, instructions: 'invalid', execution: 'not_checked', detail: '绑定资源缺失或不属于该员工' })
  return { version: 1, isolation: 'application', commandMode: commandMode(agent), skills }
}

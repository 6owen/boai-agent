/*
 * [INPUT]: 员工绑定资源、冻结环境及Mastra与本机Codex工具。
 * [OUTPUT]: 核对获准路径、资源版本及缓存后的外改拒绝；不把工具缓存当来源权威。
 * [POS]: 员工环境模块验证，真实桌面和供应商证据另行执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Workspace } from '@mastra/core/workspace'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { Resource, WorkItem } from '../packages/shared/src/domain'
import { assertEnvironmentScope, describeEnvironment, prepareEnvironment, readVersionedText } from '../packages/runtime/src/modules/workspaces/environment-plan'
import { createStageAgent } from '../packages/runtime/src/adapters/mastra/agent-factory'
import { createCodexTask } from '../packages/runtime/src/adapters/codex/task'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function context(): Promise<EngineContext> {
  const root = await mkdtemp(path.join(tmpdir(), 'boai-environment-')); roots.push(root)
  const session = path.join(root, 'agent-a/sessions/group-a')
  return {
    agent: { id: 'agent-a', name: 'Employee', role: '', instructions: 'Help', color: '#112233', connectionId: 'c', modelId: 'test-model', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1, policyVersion: 2 },
    conversation: { id: 'group-a', kind: 'group', title: 'Group', agentIds: ['agent-a'], mode: 'natural', workspacePath: path.join(root, 'shared'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' },
    connection: { id: 'c', name: 'Model', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test-model', hasApiKey: false },
    apiKey: 'must-not-enter-plan', messages: [], resources: [], runId: 'run-a', signal: new AbortController().signal,
    workspace: { root: session, workPath: path.join(session, 'work'), runPath: path.join(session, 'runs/run-a'), sharedPath: path.join(root, 'shared') },
    onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false,
  }
}
async function skill(ctx: EngineContext): Promise<Resource> {
  const root = path.join(roots.at(-1)!, 'skills/check-data'); await mkdir(root, { recursive: true })
  await writeFile(path.join(root, 'SKILL.md'), '---\nname: check-data\ndescription: Check data\n---\nRead the inputs.')
  const resource: Resource = { id: 'skill-a', kind: 'skill', name: 'check-data', description: 'Check data', path: root, createdAt: '' }
  ctx.resources.push(resource); ctx.agent.skillIds.push(resource.id)
  return resource
}

describe('authorized employee environments', () => {
  it('rejects a changed or newly added native skill file even when the framework cached its instructions', async () => {
    const ctx = await context(), resource = await skill(ctx)
    const reference = path.join(resource.path, 'references/proof.md')
    await mkdir(path.dirname(reference)); await writeFile(reference, 'Frozen proof')
    ctx.work = { id: 'claimed-work' } as WorkItem; ctx.responseKind = 'task'
    const activated: string[] = []; ctx.onSkillActivated = async (_, skill) => { activated.push(skill.id) }
    const runtime = await createCodexTask(ctx)
    try {
      expect(runtime.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['skill', 'skill_read']))
      const activate = runtime.tools.find(tool => tool.name === 'skill')!, read = runtime.tools.find(tool => tool.name === 'skill_read')!
      expect(await activate.execute({ name: 'check-data' }, 'activate')).toContain('Read the inputs')
      expect(activated).toEqual([resource.id])
      expect(await read.execute({ skillName: 'check-data', path: 'references/proof.md' }, 'read')).toContain('Frozen proof')
      await writeFile(reference, 'Changed private proof')
      await expect(read.execute({ skillName: 'check-data', path: 'references/proof.md' }, 'changed-read')).rejects.toThrow('资源内容已变更')
      await writeFile(path.join(resource.path, 'new.md'), 'Not in frozen version')
      await expect(read.execute({ skillName: 'check-data', path: 'new.md' }, 'new-read')).rejects.toThrow('不属于')
      await writeFile(path.join(resource.path, 'SKILL.md'), 'Unapproved replacement')
      await expect(activate.execute({ name: 'check-data' }, 'changed-activation')).rejects.toThrow('资源内容已变更')
      expect(activated).toEqual([resource.id])
      runtime.stop()
      await expect(activate.execute({ name: 'check-data' }, 'after-stop')).rejects.toThrow('已退出')
    } finally { runtime.stop(); await runtime.dispose() }
  })

  it('requires both group and employee knowledge grants, and excludes unbound and foreign skills', async () => {
    const ctx = await context(), resource = await skill(ctx)
    const knowledge: Resource = { id: 'facts', kind: 'knowledge', name: 'Facts', description: '', path: path.join(roots.at(-1)!, 'facts.md'), createdAt: '' }
    await writeFile(knowledge.path, 'Allowed fact')
    ctx.resources.push(knowledge, { ...resource, id: 'foreign', ownerAgentId: 'agent-b', path: '/not-authorized' }, { ...resource, id: 'unbound', path: '/not-bound' })
    ctx.agent.skillIds.push('foreign'); ctx.agent.knowledgeIds.push(knowledge.id)
    const unshared = await prepareEnvironment(ctx)
    expect(unshared.skills.map(value => value.resource.id)).toEqual(['skill-a'])
    expect(unshared.knowledge).toEqual([])
    ctx.conversation.sharedKnowledgeIds.push('facts')
    const shared = await prepareEnvironment(ctx)
    expect(shared.knowledge.map(value => value.resource.id)).toEqual(['facts'])
    ctx.agent.knowledgeIds = []
    expect((await prepareEnvironment(ctx)).knowledge).toEqual([])
    expect(JSON.stringify(shared)).not.toContain(ctx.apiKey)
  })

  it('pins content hashes and rejects changes or files added after preparation', async () => {
    const ctx = await context(), resource = await skill(ctx), plan = await prepareEnvironment(ctx)
    const source = await realpath(path.join(resource.path, 'SKILL.md'))
    expect(await readVersionedText(source, plan.skills)).toContain('Read the inputs')
    await writeFile(source, 'changed')
    await expect(readVersionedText(source, plan.skills)).rejects.toThrow('资源内容已变更')
    const extra = path.join(path.dirname(source), 'extra.md'); await writeFile(extra, 'not in snapshot')
    await expect(readVersionedText(extra, plan.skills)).rejects.toThrow('不属于')
    expect((await prepareEnvironment(ctx)).summary.policyHash).not.toBe(plan.summary.policyHash)
  })

  it('keeps sessions and run paths separate and leaves work files on stage disposal', async () => {
    const ctx = await context(), first = await prepareEnvironment(ctx)
    await writeFile(path.join(first.workspace.workPath, 'same.md'), 'first group')
    const other = structuredClone({ agent: ctx.agent, conversation: ctx.conversation, workspace: ctx.workspace })
    other.conversation.id = 'group-b'
    const root = ctx.workspace!.root.replace('group-a', 'group-b')
    other.workspace = { root, workPath: path.join(root, 'work'), runPath: path.join(root, 'runs/run-b'), sharedPath: path.join(roots.at(-1)!, 'shared-b') }
    other.conversation.workspacePath = other.workspace.sharedPath
    const second = await prepareEnvironment({ ...ctx, ...other, runId: 'run-b' })
    await writeFile(path.join(second.workspace.workPath, 'same.md'), 'second group')
    const stage = await createStageAgent('task', { ...ctx, environment: first })
    await stage.dispose(); await stage.dispose()
    expect(await readFile(path.join(first.workspace.workPath, 'same.md'), 'utf8')).toBe('first group')
    expect(await readFile(path.join(second.workspace.workPath, 'same.md'), 'utf8')).toBe('second group')
    expect(() => assertEnvironmentScope(first, { ...ctx, ...other, runId: 'run-b' })).toThrow('授权已变更')
  })

  it('rejects revoked or cancelled plans and does not traverse a linked resource', async () => {
    const ctx = await context(), resource = await skill(ctx), plan = await prepareEnvironment(ctx)
    ctx.agent.skillIds = []
    expect(() => assertEnvironmentScope(plan, ctx)).toThrow('授权已变更')
    ctx.agent.skillIds = [resource.id]
    await symlink(path.join(resource.path, 'SKILL.md'), path.join(resource.path, 'link.md'))
    await expect(prepareEnvironment(ctx)).rejects.toThrow('Symbolic links')
    const abort = new AbortController(); abort.abort(new Error('revoked'))
    expect(() => assertEnvironmentScope(plan, { ...ctx, signal: abort.signal })).toThrow('revoked')
  })

  it('does not report script dependencies as ready simply because a skill imports', async () => {
    const ctx = await context(), resource = await skill(ctx)
    await mkdir(path.join(resource.path, 'scripts')); await writeFile(path.join(resource.path, 'scripts/run.py'), 'import absent_dependency')
    let status = await describeEnvironment(ctx.agent, ctx.resources)
    expect(status.skills[0]).toMatchObject({ instructions: 'available', execution: 'disabled' })
    ctx.agent.allowCommands = true
    status = await describeEnvironment(ctx.agent, ctx.resources)
    expect(status).toMatchObject({ isolation: 'application', commandMode: 'host-approved' })
    expect(status.skills[0]).toMatchObject({ instructions: 'available', execution: 'not_checked' })
    await rm(path.join(resource.path, 'SKILL.md'))
    expect((await describeEnvironment(ctx.agent, ctx.resources)).skills[0].instructions).toBe('invalid')
  })

  it('destroys a task workspace when model assembly fails after initialization', async () => {
    const ctx = await context()
    ctx.connection!.provider = 'openai'; ctx.apiKey = ''
    const destroy = vi.spyOn(Workspace.prototype, 'destroy')
    await expect(createStageAgent('task', ctx)).rejects.toThrow('API Key')
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})

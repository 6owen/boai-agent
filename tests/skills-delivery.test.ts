/*
 * [INPUT]: 商店元数据/ZIP fixture、真实 AppService/Mastra 工具链与隔离备份目录。
 * [OUTPUT]: 安装保留原员工权限/绑定、明确绑定后真实读取/发布及备份恢复，不假定核心员工初始无权限。
 * [POS]: Skills 管理到业务任务交付的集成验收；网络只使用本地协议服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { strToU8, zipSync } from 'fflate'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import type { Method, Methods } from '../packages/shared/src/ipc'
import { startSkillDeliveryModel } from './fixtures/skills/delivery-model'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
it('delivers evidence from a marketplace installation only after binding and preserves it in a relocated full backup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-skill-delivery-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const model = await startSkillDeliveryModel('market-reader'); cleanup.push(model.close)
  const marker = `SKILL_EVIDENCE_${crypto.randomUUID().replaceAll('-', '')}`
  const files = { 'SKILL.md': strToU8('---\nname: market-reader\ndescription: 读取明确授权的依据\n---\n读取 references/evidence.md 并用实际依据生成报告。'), 'references/evidence.md': strToU8(marker), 'scripts/setup.js': strToU8('throw new Error("MUST NOT EXECUTE")') }
  const download = vi.fn(async () => ({ status: 200, body: Readable.from([zipSync(files)]) }))
  const metadata = vi.fn(async () => new Response(JSON.stringify({ skill: { slug: 'market-reader', description: '读取依据' }, owner: { handle: 'fixture' } })))
  const start = async (dataPath: string) => {
    const service = new AppService({ dataPath, engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, skillDownloads: download, skillMarketplaceFetch: metadata })
    cleanup.push(() => service.close()); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    return { service, api }
  }
  const sourcePath = join(root, 'source'), first = await start(sourcePath), { api } = first
  const scan = await api('scanSkillSource', { kind: 'marketplace', provider: 'clawhub', source: 'fixture/market-reader' })
  const beforeInstall = await api('snapshot', undefined)
  expect(beforeInstall.resources).toEqual([])
  const operation = await api('installSkills', { requestId: 'install', scanId: scan.id, candidateIds: [scan.candidates[0].id], addToFavorites: true })
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: operation.id })).status).toBe('completed'))
  const initial = await api('snapshot', undefined), resource = initial.resources[0]
  expect(initial.agents).toEqual(beforeInstall.agents)
  const installed = await api('getSkillDetail', { resourceId: resource.id })
  expect(installed.installation?.source).toMatchObject({ kind: 'marketplace', provider: 'clawhub', providerItemId: 'fixture/market-reader' })
  const connection = await api('saveConnection', { name: 'Fixture', provider: 'openai-compatible', baseUrl: model.url, defaultModel: 'fixture' })
  const configure = async (skillIds: string[]) => {
    const a = (await api('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = a
    return api('saveAgent', { ...input, connectionId: connection.id, skillIds, expectedConfigVersion: configVersion })
  }
  await configure([])
  const run = async (target: typeof api, id: string, content: string, agentId = 'researcher') => {
    const chat = await target('createConversation', { kind: 'direct', title: id, agentIds: [agentId] })
    await target('sendMessage', { conversationId: chat.id, content, mentionIds: [], requestId: id })
    await vi.waitFor(async () => expect((await target('getConversation', { id: chat.id })).turns?.at(-1)?.status).toBe('completed'), { timeout: 10000 })
    return target('getConversation', { id: chat.id })
  }
  const unbound = await run(api, 'unbound', '请使用技能读取依据并生成报告')
  expect(unbound.artifacts).toEqual([])
  expect(model.requests.every(r => !r.tools?.some(t => t.function.name === 'skill'))).toBe(true)
  await configure([resource.id])
  const chatOffset = model.requests.length
  await run(api, 'chat', '闲聊一下，不执行任务')
  expect(model.requests.slice(chatOffset).every(r => !r.tools?.some(t => t.function.name.startsWith('skill')))).toBe(true)
  const taskOffset = model.requests.length
  const detail = await run(api, 'bound-task', '请使用技能读取依据并生成报告')
  const task = detail.runs.filter(r => r.phase === 'execution').at(-1)!
  expect(task.status).toBe('completed')
  expect(task.environment).toMatchObject({ resourceVersions: [expect.objectContaining({ id: resource.id })], commandMode: 'disabled' })
  expect(task.toolEvents.filter(t => t.status === 'completed').map(t => t.name)).toEqual(['skill', 'skill_read', 'write_file', 'publish_artifact'])
  expect(detail.artifacts).toHaveLength(1)
  expect(await readFile(detail.artifacts[0].path, 'utf8')).toBe(`# 技能依据\n${marker}`)
  for (const request of model.requests.slice(taskOffset)) {
    const system = request.messages.filter(m => m.role === 'system').map(m => String(m.content)).join('\n')
    if (system.includes('Private participation decision') || system.includes('Private memory maintenance')) expect(request.tools?.some(t => t.function.name.startsWith('skill')) ?? false).toBe(false)
  }
  const writer = (await api('snapshot', undefined)).agents.find(a => a.id === 'writer')!
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...writerInput } = writer
  await api('saveAgent', { ...writerInput, connectionId: connection.id, expectedConfigVersion: configVersion })
  const outsiderOffset = model.requests.length
  expect((await run(api, 'other-employee', '请使用技能读取依据并生成报告', writer.id)).artifacts).toEqual([])
  expect(model.requests.slice(outsiderOffset).every(r => !r.tools?.some(t => t.function.name.startsWith('skill')))).toBe(true)
  const groups = await api('getSkillCollections', undefined)
  const grouped = await api('updateSkillCollections', { expectedRevision: groups.revision, action: { kind: 'create-group', name: '报告依据' } })
  await api('updateSkillCollections', { expectedRevision: grouped.revision, action: { kind: 'assign-group', resourceId: resource.id, groupId: grouped.groups[0].id } })
  const collections = await api('getSkillCollections', undefined)
  // Ephemeral content must not become restored business data.
  await mkdir(join(sourcePath, 'skill-staging/uncommitted'), { recursive: true }); await writeFile(join(sourcePath, 'skill-staging/uncommitted/sentinel'), 'temporary')
  const backupPath = join(root, 'backup'); await first.service.backup(backupPath)
  expect(await readdir(backupPath)).not.toContain('skill-staging')
  expect(JSON.parse(await readFile(join(backupPath, 'backup.json'), 'utf8')).credentialsIncluded).toBe(false)
  const restored = await start(backupPath), snapshot = await restored.api('snapshot', undefined)
  expect(snapshot.agents.find(a => a.id === 'researcher')?.skillIds).toEqual([resource.id])
  expect(snapshot.resources[0].path.startsWith(backupPath)).toBe(true)
  expect(await restored.api('getSkillCollections', undefined)).toEqual(collections)
  const recovered = await restored.api('getSkillDetail', { resourceId: resource.id })
  expect(recovered.contentHash).toBe(installed.contentHash)
  expect(recovered.installation).toEqual(installed.installation)
  await first.service.close()
  await rm(sourcePath, { recursive: true, force: true })
  const resumed = await run(restored.api, 'after-restore', '请使用恢复的技能读取依据并生成报告')
  expect(await readFile(resumed.artifacts.at(-1)!.path, 'utf8')).toBe(`# 技能依据\n${marker}`)
  expect(download).toHaveBeenCalledOnce()
  expect(metadata).toHaveBeenCalledOnce()
})

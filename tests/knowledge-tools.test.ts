/*
 * [OUTPUT]: 只有前后核权成功的实际读取登记引用；目录、失败及取消不登记。
 * [INPUT]: 隔离真实知识文件、同名资源、冻结版本和可变宿主授权。
 * [OUTPUT]: 读取前后撤权、取消、分页/UTF-8及同名身份边界回归；不调用真实供应商。
 * [POS]: 共用知识工具的文件与权限合同测试。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { createKnowledgeOperations } from '../packages/runtime/src/modules/resources/knowledge-tools'
import { prepareEnvironment } from '../packages/runtime/src/modules/workspaces/environment-plan'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'knowledge-tools-'))); roots.push(root)
  const controller = new AbortController()
  const ctx: EngineContext = {
    agent: { id: 'a', name: 'A', role: '知识问答', instructions: '', color: '', connectionId: '', modelId: '', skillIds: [], knowledgeIds: ['a', 'b', 'pdf', 'binary'], allowCommands: false, active: true, configVersion: 1 },
    conversation: { id: 'chat', kind: 'direct', title: '', agentIds: ['a'], mode: 'mention', workspacePath: join(root, 'shared'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' },
    resources: ['a', 'b', 'pdf', 'binary'].map(id => ({ id, name: '同名资料', kind: 'knowledge', description: '', path: join(root, id + (id === 'pdf' ? '.pdf' : '.md')), createdAt: '' })),
    workspace: { root: join(root, 'session'), workPath: join(root, 'session/work'), runPath: join(root, 'session/runs/run'), sharedPath: join(root, 'shared') },
    runId: 'run', apiKey: '', messages: [], signal: controller.signal,
    onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false,
  }
  await writeFile(ctx.resources[0].path, '第一份😀\n来源A')
  await writeFile(ctx.resources[1].path, '第二份😀\n来源B')
  await writeFile(ctx.resources[2].path, '%PDF-reference')
  await writeFile(ctx.resources[3].path, Buffer.from([0xff, 0xfe, 0x00]))
  ctx.environment = await prepareEnvironment(ctx)
  const operations = createKnowledgeOperations(ctx)
  const invoke = (name: string, input: unknown) => operations.find(operation => operation.name === name)!.execute(input)
  const first = ctx.environment.knowledge[0]
  return { ctx, controller, invoke, input: { resourceId: first.resource.id, path: first.files[0].path, contentHash: first.files[0].hash } }
}

it('keeps same-name identities distinct, pages Unicode text, and reports unsupported or invalid text honestly', async () => {
  const f = await fixture(), refs: unknown[] = []; f.ctx.recordKnowledgeRead = ref => refs.push(ref)
  const directory = await f.invoke('inspect_knowledge', { limit: 2 }) as { files: {resourceId: string; readable: boolean}[]; nextOffset: number }
  expect(directory.files.map(file => file.resourceId)).toEqual(['a', 'b']); expect(directory.nextOffset).toBe(2)
  const rest = await f.invoke('inspect_knowledge', { offset: directory.nextOffset }) as { files: {resourceId: string; readable: boolean}[] }
  expect(rest.files.find(file => file.resourceId === 'pdf')?.readable).toBe(false)
  expect(refs).toEqual([])
  const first = await f.invoke('read_knowledge', { ...f.input, limit: 4 }) as { content: string; nextOffset: number }
  expect(first.content).toBe('第一份😀'); expect(refs).toEqual([expect.objectContaining({ firstLine: 1, lastLine: 1, contentHash: f.input.contentHash })])
  const next = await f.invoke('read_knowledge', { ...f.input, offset: first.nextOffset }) as { content: string; nextOffset: null }
  expect(first.content + next.content).toBe('第一份😀\n来源A'); expect(next.nextOffset).toBeNull()
  await expect(f.invoke('read_knowledge', { ...f.input, resourceId: 'b' })).rejects.toThrow('不属于本次授权')
  for (const id of ['pdf', 'binary']) {
    const version = f.ctx.environment!.knowledge.find(version => version.resource.id === id)!, file = version.files[0]
    await expect(f.invoke('read_knowledge', { resourceId: id, path: file.path, contentHash: file.hash })).rejects.toThrow(id === 'pdf' ? '暂不支持' : 'not UTF-8')
  }
})

it.each(['before', 'after'] as const)('rejects knowledge access revoked %s the actual read instead of returning old text', async when => {
  const f = await fixture(); let checks = 0; const refs: unknown[] = []; f.ctx.recordKnowledgeRead = ref => refs.push(ref)
  f.ctx.assertKnowledgeAccess = async () => { if (++checks === (when === 'before' ? 1 : 3)) throw new Error('授权已经撤销') }
  await expect(f.invoke('read_knowledge', f.input)).rejects.toThrow('授权已经撤销')
  expect(refs).toEqual([])
  expect(checks).toBe(when === 'before' ? 1 : 3)
})

it('does not return text after cancellation and keeps clarification phases without knowledge tools', async () => {
  const f = await fixture(); let checks = 0; const refs: unknown[] = []; f.ctx.recordKnowledgeRead = ref => refs.push(ref)
  f.ctx.assertKnowledgeAccess = async () => { if (++checks === 3) f.controller.abort(new Error('已取消')) }
  await expect(f.invoke('read_knowledge', f.input)).rejects.toThrow('已取消')
  expect(refs).toEqual([])
  expect(createKnowledgeOperations({ ...f.ctx, decision: { action: 'ask', responseKind: 'chat', observedThroughSequence: 1 } })).toEqual([])
})


it.each(['\r', '\r\n'])('maps read offsets to original preview lines with %j separators', async separator => {
  const f = await fixture(), text = '# 规范' + separator + '蓝色标题' + separator + '第三行'
  await writeFile(f.input.path, text); f.ctx.environment = await prepareEnvironment(f.ctx)
  const version = f.ctx.environment.knowledge[0], refs: unknown[] = []; f.ctx.recordKnowledgeRead = ref => refs.push(ref)
  const result = await f.invoke('read_knowledge', { ...f.input, contentHash: version.files[0].hash, offset: Array.from('# 规范' + separator).length, limit: 4 }) as { line: number; content: string }
  expect(result).toMatchObject({ line: 2, content: '蓝色标题' }); expect(refs).toEqual([expect.objectContaining({ firstLine: 2, lastLine: 2 })])
})

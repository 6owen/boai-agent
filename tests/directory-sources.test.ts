/*
 * [INPUT]: 实际SourceService/SQLite、MCP stdio与macOS子进程、隔离目录和原RunDirectoryAccess。
 * [OUTPUT]: 启动/工具/子进程不越过目录许可；追加许可排空旧会话，完全权限/旧路径及撤销真实退出。
 * [POS]: API托管MCP文件边界验证；不代替本机Agent或真实远程供应商认证。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SourceService } from '../packages/runtime/src/modules/sources/source-service'
import { RunDirectoryAccess } from '../packages/runtime/src/modules/workspaces/directory-run'
import { AppService } from '../packages/runtime/src/service'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import type { DataSource } from '../packages/shared/src/domain/sources'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const program = `
const fs = require('node:fs'), {execFileSync} = require('node:child_process');
function probe(file, write) { try { if (write) fs.writeFileSync(file, 'MCP-WRITTEN'); return {content:fs.readFileSync(file,'utf8')}; } catch(e) {return {error:e.code};} }
const startup = probe(process.argv[1], false);
const lines = require('node:readline').createInterface({input:process.stdin});
lines.on('line', line => {
 const r=JSON.parse(line); if(r.id===undefined)return; let result;
 if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'directory-probe',version:'1'}};
 else if(r.method==='tools/list')result={tools:[{name:'probe',inputSchema:{type:'object'}}]};
 else if(r.method==='tools/call'){
   const {file,write}=r.params.arguments;
   const child=JSON.parse(execFileSync(process.execPath,['-e','const fs=require("node:fs");const probe='+probe.toString()+';process.stdout.write(JSON.stringify(probe(process.argv[1],process.argv[2]==="true")))',file,String(!!write)],{encoding:'utf8'}));
   result={content:[{type:'text',text:JSON.stringify({pid:process.pid,startup,direct:probe(file,write),child})}]};
 } else result={};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');
});
lines.on('close',()=>process.exit(0));
`

async function fixture(permission: DigitalAgent['executionPermission'] = 'ask', legacy = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-directory-mcp-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const a = join(root, 'coding'), b = join(root, 'reports'), data = join(root, 'data')
  for (const directory of [a, b, data]) await mkdir(directory)
  for (const [directory, value] of [[a, 'A'], [b, 'B'], [data, 'PRIVATE']]) await writeFile(join(directory, 'original.txt'), value)
  const store = new ProductStore(join(data, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close())
  const service = new SourceService(store, { get: async () => undefined, set: async () => {}, delete: async () => {} }, data, { critical: action => action(), install: () => {}, changed: async () => {} })
  await service.init(); cleanups.push(() => service.close())
  const source = await service.save({ id: randomUUID(), expectedRevision: 0, config: { name: 'MCP目录核对', description: '', guide: '', enabled: true, type: 'mcp', mcp: { transport: 'stdio', command: process.execPath, args: ['-e', program, join(b, 'original.txt')] } } })
  const employee = { id: 'researcher', configVersion: 1, executionPermission: permission, ...(!legacy ? { directoryGrants: [{ path: a, access: 'read-write' as const }] } : {}) } as DigitalAgent
  const signal = new AbortController(), approvals: unknown[] = []
  const directories = legacy ? undefined : new RunDirectoryAccess(employee, { signal: signal.signal, protectedRoots: [data], validate: async () => { signal.signal.throwIfAborted() }, assertTarget: async () => {}, request: async request => { approvals.push(request); return true } })
  const ref = service.summaries([source.id])[0]
  const invoke = async (file: string, write = false) => {
    const raw = await service.use(ref, 'mcp-run', signal.signal, { sourceId: source.id, tool: 'probe', arguments: { file, write } }, undefined, 'all', directories) as { content: { text: string }[] }
    return JSON.parse(raw.content[0].text)
  }
  return { root, a, b, data, store, service, ref, employee, directories, signal, approvals, invoke }
}

it.skipIf(process.platform !== 'darwin')('托管MCP从启动到后代遵守目录许可，批准后新调用排空旧进程，撤销不留下进程', async () => {
  const f = await fixture(), a = join(f.a, 'original.txt'), b = join(f.b, 'original.txt')
  const authorized = await f.invoke(a)
  expect(authorized).toMatchObject({ startup: { error: 'EPERM' }, direct: { content: 'A' }, child: { content: 'A' } })
  const denied = await f.invoke(b, true)
  expect(denied.pid).toBe(authorized.pid)
  expect(denied).toMatchObject({ direct: { error: 'EPERM' }, child: { error: 'EPERM' } })
  expect(await readFile(b, 'utf8')).toBe('B')
  await f.directories!.authorizeDirectory(f.b, 'read-only', '读取报告')
  const approved = await f.invoke(b)
  expect(approved.pid).not.toBe(authorized.pid)
  expect(() => process.kill(authorized.pid, 0)).toThrow()
  expect(approved).toMatchObject({ startup: { content: 'B' }, direct: { content: 'B' }, child: { content: 'B' } })
  expect(await f.invoke(b, true)).toMatchObject({ direct: { error: 'EPERM' }, child: { error: 'EPERM' } })
  await f.directories!.authorizeDirectory(f.b, 'read-write', '编辑报告')
  const written = await f.invoke(b, true)
  expect(written).toMatchObject({ direct: { content: 'MCP-WRITTEN' }, child: { content: 'MCP-WRITTEN' } })
  expect(await readFile(b, 'utf8')).toBe('MCP-WRITTEN')
  expect(() => process.kill(approved.pid, 0)).toThrow()
  // A grant to a business ancestor never grants another employee's BOAI data.
  await f.directories!.authorizeDirectory(f.root, 'read-write', '父目录业务访问')
  const protectedResult = await f.invoke(join(f.data, 'original.txt'), true)
  expect(protectedResult).toMatchObject({ direct: { error: 'EPERM' }, child: { error: 'EPERM' } })
  expect(await readFile(join(f.data, 'original.txt'), 'utf8')).toBe('PRIVATE')
  expect(f.approvals).toHaveLength(3)
  f.signal.abort(new Error('撤销运行')); f.directories!.close(); await f.service.closeRun('mcp-run')
  expect(() => process.kill(protectedResult.pid, 0)).toThrow()
  expect(f.service.busy).toBe(false)
  if (process.env.BOAI_DIRECTORY_SOURCE_EVIDENCE_DIR) {
    const out = join(process.env.BOAI_DIRECTORY_SOURCE_EVIDENCE_DIR, 'mcp-scoped'); await mkdir(out, { recursive: true })
    await f.store.backup(join(out, 'boai.sqlite'))
    await writeFile(join(out, 'facts.json'), JSON.stringify({ authorized, denied, approved, written, protectedResult, approvals: f.approvals, externalRequests: 0, allObservedProcessesExited: true }, null, 2))
  }
}, 20000)

it.skipIf(process.platform !== 'darwin').each(['full-access', 'legacy', 'read-only'] as const)('MCP实际文件访问保持%s的员工边界', async mode => {
  const f = await fixture(mode === 'legacy' ? 'ask' : mode, mode === 'legacy')
  const b = join(f.b, 'original.txt')
  if (mode === 'read-only') await f.directories!.authorizeDirectory(f.b, 'read-only', '只读报告')
  const result = await f.invoke(b, true)
  if (mode === 'read-only') {
    expect(result).toMatchObject({ direct: { error: 'EPERM' }, child: { error: 'EPERM' } })
    expect(await readFile(b, 'utf8')).toBe('B')
  } else {
    expect(result).toMatchObject({ direct: { content: 'MCP-WRITTEN' }, child: { content: 'MCP-WRITTEN' } })
    expect(f.approvals).toEqual([])
    expect(await readFile(b, 'utf8')).toBe('MCP-WRITTEN')
  }
  await f.service.closeRun('mcp-run')
  expect(() => process.kill(result.pid, 0)).toThrow()
}, 15000)

it.skipIf(process.platform !== 'darwin')('真实API员工MCP调用沿宿主目录申请，不因已绑定源扩权', async () => {
  const f = await fixture(), sourceConfig = f.service.get(f.ref.id), records: any[] = [], errors: unknown[] = []
  let source: DataSource
  const engine: AgentEngine = {
    test: async () => 'unused',
    decide: async ctx => ({ action: 'reply', responseKind: 'task', observedThroughSequence: ctx.participation!.observedThroughSequence, work: { key: 'directory-mcp', scope: '核对报告权限', deliverable: '读取获准报告' } }),
    report: async (_ctx, draft) => ({ action: 'publish', text: draft.text }),
    run: async (ctx: EngineContext) => {
      try {
        await ctx.inspectDataSource!(source.id)
        const call = async () => {
          const value = await ctx.callDataSource!({ sourceId: source.id, tool: 'probe', arguments: { file: join(f.b, 'original.txt') } }) as { content: { text: string }[] }
          records.push(JSON.parse(value.content[0].text))
        }
        await call()
        expect(records[0]).toMatchObject({ startup: { error: 'EPERM' }, direct: { error: 'EPERM' }, child: { error: 'EPERM' } })
        await ctx.directoryAccess!.authorizeDirectory(f.b, 'read-only', '当前任务读取报告')
        await call()
        expect(records[1]).toMatchObject({ startup: { content: 'B' }, direct: { content: 'B' }, child: { content: 'B' } })
        expect(records[0].pid).not.toBe(records[1].pid)
        expect(() => process.kill(records[0].pid, 0)).toThrow()
        await ctx.onDelta('已获准读取报告 B')
        await ctx.onWorkOutcome!({ disposition: 'delivered', summary: '已核对授权报告', evidence: [{ kind: 'answer', reference: '已获准读取报告 B' }] })
      } catch (error) { errors.push(error); throw error }
    },
  }
  const service = new AppService({ dataPath: join(f.root, 'application'), engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  const { id: _id, revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, hasCredential: _hasCredential, ...config } = sourceConfig
  source = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config }) as DataSource
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' }) as Connection
  const employee = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = employee
  await service.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture', executionPermission: 'ask', directoryGrants: f.employee.directoryGrants, sourceIds: [source.id] })
  const conversation = await service.handle('createConversation', { kind: 'direct', title: 'MCP目录联合授权', agentIds: [employee.id] }) as Conversation
  await service.handle('sendMessage', { conversationId: conversation.id, requestId: randomUUID(), content: '核对目录许可并读取报告', mentionIds: [] })
  const approvals: string[] = [], deadline = Date.now() + 12000
  let detail: ConversationDetail
  while (true) {
    if (errors.length) throw errors[0]
    const snapshot = await service.handle('snapshot', undefined) as Snapshot
    for (const approval of snapshot.approvals) { approvals.push(approval.kind ?? 'command'); await service.handle('approve', { id: approval.id, approved: true }) }
    detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    if (detail.runs.some(run => run.phase === 'execution' && run.status === 'completed')) break
    if (Date.now() > deadline) throw new Error('MCP目录联合验证未完成')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  expect(approvals).toEqual(['source', 'directory', 'source'])
  expect(detail.messages.some(message => message.senderType === 'agent' && message.content === '已获准读取报告 B')).toBe(true)
  await service.close()
  for (const { pid } of records) expect(() => process.kill(pid, 0)).toThrow()
  if (process.env.BOAI_DIRECTORY_SOURCE_EVIDENCE_DIR) {
    const out = join(process.env.BOAI_DIRECTORY_SOURCE_EVIDENCE_DIR, 'app-mcp'); await mkdir(out, { recursive: true })
    const store = new ProductStore(join(f.root, 'application', 'boai.sqlite')); await store.init()
    try { await store.backup(join(out, 'boai.sqlite')) } finally { await store.close() }
    await writeFile(join(out, 'facts.json'), JSON.stringify({ records, approvals, detail, externalRequests: 0, allObservedProcessesExited: true }, null, 2))
  }
}, 20000)

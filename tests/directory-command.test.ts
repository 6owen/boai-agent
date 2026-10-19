/*
 * [OUTPUT]: 新增真实上级目录授权不暴露其他员工受管数据，当前run内部目录仍可读写。
 * [INPUT]: macOS真实shell/Node子进程、隔离A/B业务目录、员工目录许可和原命令执行器。
 * [OUTPUT]: OS级读写/后代/链接约束、追加授权与完全访问实际结果；非macOS显式不认证。
 * [POS]: WS0/WS3命令后端验证；不代替模型、原生员工或审批UI链路。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { executeCommand } from '../src/runtime/adapters/mastra/host-command'
import { employeeCommandScope } from '../src/runtime/modules/workspaces/directory-command'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import type { EngineContext } from '../src/runtime/contracts'
import type { DigitalAgent } from '../src/shared/domain'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'boai-directory-command-'))); roots.push(root)
  const a = path.join(root, 'coding'), b = path.join(root, 'reports'), cwd = path.join(root, 'run')
  for (const directory of [a, b, cwd]) await mkdir(directory)
  await writeFile(path.join(a, 'original.txt'), 'AUTHORIZED-A'); await writeFile(path.join(b, 'original.txt'), 'PRIVATE-B')
  const agent: Pick<DigitalAgent, 'executionPermission' | 'directoryGrants'> = { executionPermission: 'ask', directoryGrants: [{ path: a, access: 'read-write' }] }
  const internal = { readOnly: [cwd], readWrite: [cwd] }
  const run = async (command: string, employee = agent, temporary: NonNullable<DigitalAgent['directoryGrants']> = []) => executeCommand(command, cwd, new AbortController().signal, 5000, await employeeCommandScope(employee, internal, temporary))
  return { root, a, b, cwd, agent, internal, run }
}

describe.skipIf(process.platform !== 'darwin')('真实macOS命令目录授权', () => {
  it('实际Mastra任务工具将员工许可交给执行器，未授权B不能被模型命令直接读取', async () => {
    const { root, a, b, agent } = await fixture(), session = path.join(root, 'session'), shared = path.join(root, 'shared')
    const approvals: string[] = []
    const ctx: EngineContext = {
      agent: { ...agent, id: 'directory-employee', name: '目录员工', role: '', instructions: '', color: '#79719a', connectionId: 'api', modelId: 'fixture', skillIds: [], knowledgeIds: [], allowCommands: true, active: true, configVersion: 1 },
      connection: { id: 'api', name: 'isolated', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture', hasApiKey: false }, apiKey: '',
      conversation: { id: 'chat', kind: 'direct', title: 'isolated', agentIds: ['directory-employee'], mode: 'mention', sharedKnowledgeIds: [], workspacePath: shared, createdAt: '', updatedAt: '' },
      messages: [], resources: [], runId: 'run', signal: new AbortController().signal, responseKind: 'task',
      workspace: { root: session, workPath: path.join(session, 'work'), runPath: path.join(session, 'runs/run'), sharedPath: shared },
      onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false,
      approveOperation: async operation => { approvals.push(operation.description); return true },
    }
    const runtime = await createTaskRuntime(ctx)
    try {
      const invoke = (command: string) => runtime.tools.execute_command!.execute!({ command }, { requestContext: new RequestContext(), observe: noopObserve })
      expect(await invoke(`/bin/cat ${quote(path.join(a, 'original.txt'))}`)).toMatchObject({ exitCode: 0, stdout: 'AUTHORIZED-A' })
      expect(await invoke(`/bin/cat ${quote(path.join(b, 'original.txt'))}`)).toMatchObject({ exitCode: 1, stdout: '' })
      expect(approvals).toHaveLength(2)
    } finally { await runtime.dispose() }
  })
  it('上级业务目录许可不暴露BOAI私有存储，明确内部运行目录仍可读写', async () => {
    const { root, cwd, agent } = await fixture(), protectedRoot = path.join(root, 'product'), other = path.join(protectedRoot, 'other-employee')
    await mkdir(other, { recursive: true }); await writeFile(path.join(other, 'secret.txt'), 'PRODUCT-PRIVATE')
    const ownRun = path.join(protectedRoot, 'current-run'); await mkdir(ownRun)
    const broad = { ...agent, directoryGrants: [{ path: root, access: 'read-write' as const }] }
    const scope = await employeeCommandScope(broad, { readOnly: [ownRun, cwd], readWrite: [ownRun, cwd] }, [], [protectedRoot])
    const run = (command: string) => executeCommand(command, cwd, new AbortController().signal, 5000, scope)
    const refused = await run(`/bin/cat ${quote(path.join(other, 'secret.txt'))}`)
    expect(refused.exitCode).not.toBe(0); expect(refused.stdout).not.toContain('PRODUCT-PRIVATE')
    expect((await run(`printf bad > ${quote(path.join(other, 'secret.txt'))}`)).exitCode).not.toBe(0)
    expect(await readFile(path.join(other, 'secret.txt'), 'utf8')).toBe('PRODUCT-PRIVATE')
    expect((await run(`printf allowed > ${quote(path.join(ownRun, 'result.txt'))}`)).exitCode).toBe(0)
    expect(await readFile(path.join(ownRun, 'result.txt'), 'utf8')).toBe('allowed')
  })
  it('业务cwd独立，A可读写，B在实际系统调用处被拒绝', async () => {
    const { a, b, run } = await fixture()
    expect(await run(`/bin/cat ${quote(path.join(a, 'original.txt'))}`)).toMatchObject({ exitCode: 0, stdout: 'AUTHORIZED-A' })
    expect(await run(`printf 'NEW-A' > ${quote(path.join(a, 'new.txt'))}`)).toMatchObject({ exitCode: 0 })
    expect(await readFile(path.join(a, 'new.txt'), 'utf8')).toBe('NEW-A')
    const read = await run(`/bin/cat ${quote(path.join(b, 'original.txt'))}`)
    expect(read.exitCode).not.toBe(0); expect(read.stdout).not.toContain('PRIVATE-B'); expect(read.stderr).toContain('Operation not permitted')
    expect((await run(`printf overwritten > ${quote(path.join(b, 'original.txt'))}`)).exitCode).not.toBe(0)
    expect(await readFile(path.join(b, 'original.txt'), 'utf8')).toBe('PRIVATE-B')
  })
  it('Node及其后代继承限制，不凭换工具读取B', async () => {
    const { b, run } = await fixture()
    const script = `const {spawnSync}=require('node:child_process');const r=spawnSync('/bin/cat',[${JSON.stringify(path.join(b, 'original.txt'))}],{encoding:'utf8'});console.log(JSON.stringify({status:r.status,stdout:r.stdout,stderr:r.stderr}))`
    const result = await run(`${quote(process.execPath)} -e ${quote(script)}`)
    expect(result.exitCode, JSON.stringify(result)).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 1, stdout: '' })
    expect(result.stdout).not.toContain('PRIVATE-B')
  })
  it('A中的链接不能读写B；删除链接保留B原件', async () => {
    const { a, b, run } = await fixture(), link = path.join(a, 'linked'); await symlink(b, link)
    expect((await run(`/bin/cat ${quote(path.join(link, 'original.txt'))}`)).exitCode).not.toBe(0)
    expect((await run(`printf overwritten > ${quote(path.join(link, 'original.txt'))}`)).exitCode).not.toBe(0)
    expect((await run(`/bin/rm ${quote(link)}`)).exitCode).toBe(0)
    expect(await readFile(path.join(b, 'original.txt'), 'utf8')).toBe('PRIVATE-B')
  })
  it('明确追加B只读后可读不可写；读写后可写，后续无临时许可再次拒绝', async () => {
    const { agent, b, run } = await fixture(), target = path.join(b, 'original.txt')
    expect((await run(`/bin/cat ${quote(target)}`, agent, [{ path: b, access: 'read-only' }])).stdout).toBe('PRIVATE-B')
    expect((await run(`printf changed > ${quote(target)}`, agent, [{ path: b, access: 'read-only' }])).exitCode).not.toBe(0)
    expect((await run(`printf changed > ${quote(target)}`, agent, [{ path: b, access: 'read-write' }])).exitCode).toBe(0)
    expect(await readFile(target, 'utf8')).toBe('changed')
    expect((await run(`/bin/cat ${quote(target)}`)).exitCode).not.toBe(0)
  })
  it('员工只读不能借目录读写许可修改文件', async () => {
    const { agent, a, b, run } = await fixture(), readonly = { ...agent, executionPermission: 'read-only' as const }
    expect((await run(`/bin/cat ${quote(path.join(a, 'original.txt'))}`, readonly)).stdout).toBe('AUTHORIZED-A')
    for (const target of [path.join(a, 'original.txt'), path.join(b, 'original.txt')]) expect((await run(`printf changed > ${quote(target)}`, readonly, [{ path: b, access: 'read-write' }])).exitCode).not.toBe(0)
    expect(await readFile(path.join(a, 'original.txt'), 'utf8')).toBe('AUTHORIZED-A')
  })
  it('完全访问实际读写未列入的B，旧未配置员工保持原行为', async () => {
    const { agent, b, internal, run } = await fixture(), full = { ...agent, executionPermission: 'full-access' as const }, target = path.join(b, 'original.txt')
    expect(await employeeCommandScope(full, internal)).toBeUndefined()
    expect(await employeeCommandScope({ executionPermission: 'ask' }, internal)).toBeUndefined()
    expect((await run(`/bin/cat ${quote(target)}`, full)).stdout).toBe('PRIVATE-B')
    expect((await run(`printf full > ${quote(target)}`, full)).exitCode).toBe(0)
    expect(await readFile(target, 'utf8')).toBe('full')
  })
  it('有引号和括号的目录不向SBPL注入额外权限', async () => {
    const { root, agent, b, run } = await fixture(), unusual = path.join(root, 'project") (allow file-read*) ("')
    await mkdir(unusual); await writeFile(path.join(unusual, 'file.txt'), 'unusual')
    const employee = { ...agent, directoryGrants: [{ path: unusual, access: 'read-write' as const }] }
    expect((await run(`/bin/cat ${quote(path.join(unusual, 'file.txt'))}`, employee)).stdout).toBe('unusual')
    expect((await run(`/bin/cat ${quote(path.join(b, 'original.txt'))}`, employee)).exitCode).not.toBe(0)
  })
})
